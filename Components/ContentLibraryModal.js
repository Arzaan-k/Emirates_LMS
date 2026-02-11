import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    Dimensions,
    FlatList,
    Image,
    TextInput,
    Alert,
    ActivityIndicator,
    ScrollView,
    KeyboardAvoidingView,
    Platform,
    Switch
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView } from 'react-native-webview';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import CourseSettingsModal from './CourseSettingsModal';
import API_URL from '../config';

const { width, height } = Dimensions.get('window');

// Cross-platform alert function that works on Web, iOS, and Android
const showAlert = (title, message, buttons = []) => {
    if (Platform.OS === 'web') {
        // Web: Use window.confirm for confirmation dialogs
        const confirmed = window.confirm(`${title}\n\n${message}`);
        if (confirmed && buttons.length > 0) {
            // Find and execute the action button
            const actionButton = buttons.find(b => b.style === 'destructive' || (b.text && b.text !== 'Cancel'));
            if (actionButton && actionButton.onPress) {
                actionButton.onPress();
            }
        } else if (!confirmed && buttons.length > 0) {
            // Find and execute cancel button if it exists
            const cancelButton = buttons.find(b => b.style === 'cancel' || b.text === 'Cancel');
            if (cancelButton && cancelButton.onPress) {
                cancelButton.onPress();
            }
        }
    } else {
        // iOS and Android: Use native Alert.alert
        Alert.alert(title, message, buttons);
    }
};

export default function ContentLibraryModal({ visible, onClose }) {
    const [searchQuery, setSearchQuery] = useState('');
    const [activeLearningPath, setActiveLearningPath] = useState('career_progression'); // career_progression or self_learning
    const [activeTab, setActiveTab] = useState('All');
    const [contentCategories, setContentCategories] = useState([]);
    const [learningPaths, setLearningPaths] = useState([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    // Folder/Bucket collapse state (tracks which folders are expanded)
    const [expandedFolders, setExpandedFolders] = useState(new Set());

    // Reorder state for linear buckets
    const [reorderingBucketId, setReorderingBucketId] = useState(null);
    const [reorderedItems, setReorderedItems] = useState([]);
    const [savingReorder, setSavingReorder] = useState(false);

    // Edit Modal State
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [selectedContent, setSelectedContent] = useState(null);
    const [editTitle, setEditTitle] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editBucketId, setEditBucketId] = useState(null);

    // Preview Modal State
    const [previewModalVisible, setPreviewModalVisible] = useState(false);
    const [previewContent, setPreviewContent] = useState(null);

    // Category Modal State
    const [categoryModalVisible, setCategoryModalVisible] = useState(false);
    const [availableBuckets, setAvailableBuckets] = useState([]);

    // Bulk Selection State
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedItems, setSelectedItems] = useState(new Set());
    const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);
    const [deletingInBackground, setDeletingInBackground] = useState(false);

    // Success Modal State
    const [successModalVisible, setSuccessModalVisible] = useState(false);
    const [successMessage, setSuccessMessage] = useState({ title: '', count: 0 });

    // Course/Bucket Settings Modal State
    const [settingsModalVisible, setSettingsModalVisible] = useState(false);
    const [settingsItem, setSettingsItem] = useState(null);
    const [settingsItemType, setSettingsItemType] = useState('course');

    const openSettingsModal = (item, type = 'course') => {
        setSettingsItem(item);
        setSettingsItemType(type);
        setSettingsModalVisible(true);
    };

    useEffect(() => {
        if (visible) {
            fetchContent();
            fetchBuckets();
        }
    }, [visible]);

    const fetchContent = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${API_URL}/api/v1/content/library/all`);
            const data = await response.json();

            // Handle the new two-tier structure from backend
            if (data.learning_paths) {
                // New structure with learning paths
                setLearningPaths(data.learning_paths);
                setContentCategories(data.all_buckets || []);
            } else if (Array.isArray(data)) {
                // Legacy structure - flat array of buckets
                setContentCategories(data);
                // Create synthetic learning paths from the data
                setLearningPaths([
                    {
                        id: 'career_progression',
                        name: 'Career Progression',
                        color: '#3B82F6',
                        icon: 'trending-up',
                        buckets: data.filter(b => b.learning_path_type !== 'self_learning'),
                        total_count: data.filter(b => b.learning_path_type !== 'self_learning').reduce((sum, b) => sum + (b.total_count || 0), 0)
                    },
                    {
                        id: 'self_learning',
                        name: 'Self Learning',
                        color: '#10B981',
                        icon: 'book-open',
                        buckets: data.filter(b => b.learning_path_type === 'self_learning'),
                        total_count: data.filter(b => b.learning_path_type === 'self_learning').reduce((sum, b) => sum + (b.total_count || 0), 0)
                    }
                ]);
            } else if (data.categories) {
                setContentCategories(data.categories);
            }
        } catch (error) {
            console.error("Error fetching content:", error);
            Alert.alert("Error", "Failed to load content library");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const fetchBuckets = async () => {
        try {
            const response = await fetch(`${API_URL}/api/v1/content/buckets/all`);
            const data = await response.json();
            if (Array.isArray(data)) {
                setAvailableBuckets(data);
            } else if (data.buckets) {
                setAvailableBuckets(data.buckets);
            }
        } catch (error) {
            console.error("Error fetching buckets:", error);
        }
    };

    const handleDelete = (item) => {
        showAlert(
            "Delete Content",
            `Are you sure you want to delete "${item.title}"?`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        // 1. Optimistic Update: Remove item from UI immediately
                        const removeItemFromBuckets = (buckets, itemId) => {
                            if (!buckets) return [];
                            return buckets.map(bucket => ({
                                ...bucket,
                                items: (bucket.items || []).filter(i => i.id !== itemId),
                                children: bucket.children ? removeItemFromBuckets(bucket.children, itemId) : []
                            }));
                        };

                        // Update both state variables to ensure UI reflects change instantly
                        setLearningPaths(prev => prev.map(lp => ({
                            ...lp,
                            buckets: removeItemFromBuckets(lp.buckets || [], item.id)
                        })));

                        setContentCategories(prev => removeItemFromBuckets(prev, item.id));

                        // 2. Perform Backend Deletion
                        try {
                            const response = await fetch(`${API_URL}/api/v1/content/${item.id}`, {
                                method: 'DELETE',
                            });
                            const result = await response.json();

                            if (result.status !== 'success') {
                                // If failed, revert by refreshing
                                Alert.alert("Error", "Failed to delete content");
                                fetchContent();
                            }
                            // On success: Do nothing (already removed)
                        } catch (error) {
                            console.error("Delete error:", error);
                            // If error, revert by refreshing
                            Alert.alert("Error", "An error occurred while deleting");
                            fetchContent();
                        }
                    }
                }
            ]
        );
    };

    const openEditModal = (item) => {
        setSelectedContent(item);
        setEditTitle(item.title);
        setEditDescription(item.description);
        setEditBucketId(item.bucket_id || 'uncategorized');
        setEditModalVisible(true);
    };

    const handleSaveEdit = async () => {
        if (!selectedContent) return;

        try {
            const formData = new FormData();
            formData.append('title', editTitle);
            formData.append('description', editDescription);
            if (editBucketId) formData.append('bucket_id', editBucketId);

            const response = await fetch(`${API_URL}/api/v1/content/${selectedContent.id}`, {
                method: 'PUT',
                body: formData,
            });

            const result = await response.json();
            if (result.status === 'success') {
                setEditModalVisible(false);
                fetchContent();
                Alert.alert("Success", "Content updated successfully");
            } else {
                Alert.alert("Error", "Failed to update content");
            }
        } catch (error) {
            console.error("Edit error:", error);
            Alert.alert("Error", "An error occurred while updating");
        }
    };

    const openCategoryModal = (item) => {
        setSelectedContent(item);
        setCategoryModalVisible(true);
    };

    const openPreviewModal = (item) => {
        setPreviewContent(item);
        setPreviewModalVisible(true);
    };

    const toggleItemSelection = (itemId) => {
        console.log("📌 Toggling selection for item:", itemId);
        setSelectedItems(prev => {
            const newSet = new Set(prev);
            if (newSet.has(itemId)) {
                console.log("  ➖ Deselecting item");
                newSet.delete(itemId);
            } else {
                console.log("  ➕ Selecting item");
                newSet.add(itemId);
            }
            console.log("  Total selected now:", newSet.size);
            return newSet;
        });
    };

    const selectAll = () => {
        const allItemIds = new Set();

        // Recurse function to gather all items from nested folders
        const collectRecursively = (folders) => {
            if (!folders) return;
            folders.forEach(folder => {
                // Add items in this folder
                if (folder.items) {
                    folder.items.forEach(item => allItemIds.add(item.id));
                }
                // Recurse into subfolders
                if (folder.children && folder.children.length > 0) {
                    collectRecursively(folder.children);
                }
            });
        };

        collectRecursively(displayCategories);
        setSelectedItems(allItemIds);
    };

    const deselectAll = () => {
        setSelectedItems(new Set());
    };

    const toggleSelectionMode = () => {
        setSelectionMode(!selectionMode);
        if (selectionMode) {
            // Exiting selection mode, clear selections
            setSelectedItems(new Set());
        }
    };

    const handleBulkDelete = () => {
        console.log("🗑️ Bulk delete initiated");
        console.log("Selected items count:", selectedItems.size);
        console.log("Selected item IDs:", Array.from(selectedItems));

        if (selectedItems.size === 0) {
            Alert.alert("No Items Selected", "Please select items to delete");
            return;
        }

        const itemCount = selectedItems.size;
        const itemIds = Array.from(selectedItems);

        console.log("Showing confirmation dialog for", itemCount, "items");

        showAlert(
            "Delete Confirmation",
            `Are you sure you want to delete ${itemCount} item(s)? This action cannot be undone.`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete All",
                    style: "destructive",
                    onPress: () => {
                        console.log("✅ User confirmed deletion");
                        // OPTIMISTIC UI UPDATE - Remove items from UI immediately
                        const deletedIds = new Set(itemIds);

                        // Filter out deleted items from categories
                        const updatedCategories = contentCategories.map(cat => ({
                            ...cat,
                            items: cat.items.filter(item => !deletedIds.has(item.id)),
                            children: cat.children ? cat.children.map(child => ({
                                ...child,
                                items: child.items ? child.items.filter(item => !deletedIds.has(item.id)) : []
                            })) : []
                        }));

                        // Update UI immediately
                        setContentCategories(updatedCategories);
                        setSelectedItems(new Set());
                        setSelectionMode(false);
                        setDeletingInBackground(true);

                        // Show instant feedback with modal
                        setTimeout(() => {
                            setSuccessMessage({
                                title: 'Items Removed',
                                count: itemCount
                            });
                            setSuccessModalVisible(true);
                        }, 100);

                        // BACKGROUND DELETION - Actual deletion happens here
                        performBackgroundDeletion(itemIds, itemCount);
                    }
                }
            ]
        );
    };

    const performBackgroundDeletion = async (itemIds, itemCount) => {
        console.log("🔄 Starting background deletion...");
        console.log("API URL:", API_URL);
        console.log("Item IDs to delete:", itemIds);
        console.log("Item count:", itemCount);

        try {
            const apiUrl = `${API_URL}/api/v1/content/bulk-delete`;
            console.log("Full API URL:", apiUrl);

            const requestBody = {
                item_ids: itemIds
            };
            console.log("Request body:", JSON.stringify(requestBody, null, 2));

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });

            console.log("Response status:", response.status);
            console.log("Response ok:", response.ok);

            const result = await response.json();
            console.log("Response result:", result);

            setDeletingInBackground(false);

            if (result.status === 'completed') {
                const successCount = result.results.success.length;
                const failedCount = result.results.failed.length;

                // Show completion notification
                if (failedCount > 0) {
                    Alert.alert(
                        "⚠️ Deletion Completed with Errors",
                        `Successfully deleted ${successCount} of ${itemCount} item(s).\n\nFailed: ${failedCount} item(s). Some items may need to be deleted manually.`,
                        [
                            {
                                text: "Refresh",
                                onPress: () => fetchContent()
                            }
                        ]
                    );
                } else {
                    // Silent success - items already removed from UI
                    console.log(`✅ Successfully deleted ${successCount} items in background`);
                }
            } else {
                // If the deletion failed completely, refresh to show items again
                Alert.alert(
                    "❌ Deletion Failed",
                    "Failed to delete items from the server. Refreshing to restore items...",
                    [
                        {
                            text: "OK",
                            onPress: () => fetchContent()
                        }
                    ]
                );
            }
        } catch (error) {
            console.error("Background deletion error:", error);
            setDeletingInBackground(false);

            // On error, refresh to restore items
            Alert.alert(
                "❌ Deletion Error",
                "An error occurred during deletion. Refreshing content to restore items...",
                [
                    {
                        text: "OK",
                        onPress: () => fetchContent()
                    }
                ]
            );
        }
    };

    const handleChangeCategory = async (bucketId) => {
        if (!selectedContent) return;

        try {
            const formData = new FormData();
            formData.append('bucket_id', bucketId);

            const response = await fetch(`${API_URL}/api/content/${selectedContent.id}/category`, {
                method: 'PUT',
                body: formData,
            });

            const result = await response.json();
            if (result.status === 'success') {
                setCategoryModalVisible(false);
                fetchContent();
                Alert.alert("Success", "Category changed successfully");
            } else {
                Alert.alert("Error", "Failed to change category");
            }
        } catch (error) {
            console.error("Change category error:", error);
            Alert.alert("Error", "An error occurred");
        }
    };

    // Toggle folder expansion (like clicking folder in file explorer)
    const toggleFolder = (folderId) => {
        setExpandedFolders(prev => {
            const newSet = new Set(prev);
            if (newSet.has(folderId)) {
                newSet.delete(folderId); // Collapse
                // Cancel reordering if collapsing
                if (reorderingBucketId === folderId) {
                    setReorderingBucketId(null);
                    setReorderedItems([]);
                }
            } else {
                newSet.add(folderId); // Expand
            }
            return newSet;
        });
    };

    // ===== REORDER FUNCTIONS =====
    const startReordering = (folder) => {
        const items = [...(folder.items || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
        setReorderedItems(items);
        setReorderingBucketId(folder.id);
    };

    const moveItemUp = (index) => {
        if (index === 0) return;
        const newItems = [...reorderedItems];
        [newItems[index - 1], newItems[index]] = [newItems[index], newItems[index - 1]];
        setReorderedItems(newItems);
    };

    const moveItemDown = (index) => {
        if (index === reorderedItems.length - 1) return;
        const newItems = [...reorderedItems];
        [newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]];
        setReorderedItems(newItems);
    };

    const saveReorder = async (bucketId) => {
        setSavingReorder(true);
        try {
            const token = await AsyncStorage.getItem('userToken');
            const courseIds = reorderedItems.map(item => item.id);
            const res = await fetch(`${API_URL}/api/v1/self-learning/admin/buckets/${bucketId}/reorder-courses`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ course_ids: courseIds }),
            });
            const data = await res.json();
            if (data.status === 'success') {
                Alert.alert('Success', 'Course order saved successfully');
                setReorderingBucketId(null);
                setReorderedItems([]);
                fetchContent(); // Refresh to show new order
            } else {
                Alert.alert('Error', 'Failed to save course order');
            }
        } catch (error) {
            console.error('Reorder save error:', error);
            Alert.alert('Error', 'Failed to save course order');
        } finally {
            setSavingReorder(false);
        }
    };

    const cancelReordering = () => {
        setReorderingBucketId(null);
        setReorderedItems([]);
    };

    const toggleLinearMode = async (folder) => {
        const newValue = !folder.is_linear;
        try {
            const token = await AsyncStorage.getItem('userToken');
            const res = await fetch(`${API_URL}/api/v1/self-learning/admin/buckets/${folder.id}/settings`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ is_linear: newValue }),
            });
            const data = await res.json();
            if (data.status === 'success') {
                fetchContent(); // Refresh to reflect change
            }
        } catch (error) {
            console.error('Toggle linear error:', error);
            Alert.alert('Error', 'Failed to update linear mode');
        }
    };

    // Get buckets for the currently active learning path
    const currentLearningPath = learningPaths.find(lp => lp.id === activeLearningPath);
    const currentBuckets = currentLearningPath?.buckets || contentCategories;

    // Generate sub-category tabs from current learning path's buckets
    const tabs = Array.from(new Set(['All', ...currentBuckets.map(b => b.name)]));

    // Recursively filter folders and items based on search query
    const filterFolderTree = (folder) => {
        const searchLower = searchQuery.toLowerCase();

        // Filter items in this folder
        const filteredItems = (folder.items || []).filter(item =>
            !searchQuery ||
            item.title.toLowerCase().includes(searchLower) ||
            (item.description && item.description.toLowerCase().includes(searchLower))
        );

        // Recursively filter children
        const filteredChildren = (folder.children || [])
            .map(child => filterFolderTree(child))
            .filter(child => child !== null);

        // Include folder if:
        // 1. It has matching items, OR
        // 2. It has matching children, OR
        // 3. No search query (show all)
        if (!searchQuery || filteredItems.length > 0 || filteredChildren.length > 0) {
            return {
                ...folder,
                items: filteredItems,
                children: filteredChildren,
                item_count: filteredItems.length,
                total_count: filteredItems.length + filteredChildren.reduce((sum, child) => sum + (child.total_count || 0), 0)
            };
        }

        return null; // Exclude this folder
    };

    // Filter by active tab (sub-category) - only filter at root level within current learning path
    const filteredCategories = activeTab === 'All'
        ? currentBuckets
        : currentBuckets.filter(cat => cat.name === activeTab);

    // Apply search filter recursively
    const displayCategories = filteredCategories
        .map(cat => filterFolderTree(cat))
        .filter(cat => cat !== null);

    /**
     * Recursively renders folder tree with unlimited nesting depth
     * @param {Object} folder - Folder object with children array
     * @param {number} depth - Current nesting depth (0 = root)
     */
    const renderFolderTree = (folder, depth = 0) => {
        const isExpanded = expandedFolders.has(folder.id);
        const hasChildren = folder.children && folder.children.length > 0;
        const hasItems = folder.items && folder.items.length > 0;

        // Calculate indentation based on depth
        const indentLeft = depth * 10;

        // Icon sizes get slightly smaller at deeper levels
        const iconSize = Math.max(18, 22 - depth * 2);
        const chevronSize = Math.max(16, 20 - depth * 2);

        return (
            <View key={folder.id} style={[styles.folderContainer, { marginLeft: indentLeft }]}>
                {/* Folder Header */}
                <TouchableOpacity
                    style={[
                        styles.folderHeader,
                        depth > 0 && styles.nestedFolderHeader
                    ]}
                    onPress={() => toggleFolder(folder.id)}
                    activeOpacity={0.7}
                >
                    {/* Expand/Collapse Arrow */}
                    <View style={styles.expandIconContainer}>
                        <MaterialCommunityIcons
                            name={isExpanded ? "chevron-down" : "chevron-right"}
                            size={chevronSize}
                            color={depth === 0 ? "#6B7280" : "#9CA3AF"}
                        />
                    </View>

                    {/* Folder Icon */}
                    {depth === 0 ? (
                        <View style={[styles.folderIconBox, { backgroundColor: (folder.color || "#F59E0B") + '15' }]}>
                            <MaterialCommunityIcons
                                name={isExpanded ? "folder-open" : "folder"}
                                size={iconSize}
                                color={folder.color || "#F59E0B"}
                            />
                        </View>
                    ) : (
                        <MaterialCommunityIcons
                            name={isExpanded ? "folder-open-outline" : "folder-outline"}
                            size={iconSize}
                            color={folder.color || "#9CA3AF"}
                            style={{ marginLeft: 4, marginRight: 8 }}
                        />
                    )}

                    {/* Folder Name */}
                    <Text style={[
                        depth === 0 ? styles.folderName : styles.nestedFolderName,
                        { flex: 1 }
                    ]}>
                        {folder.name}
                    </Text>

                    {/* Linear Badge - Only for self_learning buckets */}
                    {(folder.learning_path_type === 'self_learning' || activeLearningPath === 'self_learning') && (
                        <View style={[
                            styles.linearBadge,
                            folder.is_linear ? styles.linearBadgeActive : styles.linearBadgeInactive
                        ]}>
                            <MaterialCommunityIcons
                                name={folder.is_linear ? 'format-list-numbered' : 'shuffle-variant'}
                                size={12}
                                color={folder.is_linear ? '#059669' : '#64748B'}
                            />
                            <Text style={[
                                styles.linearBadgeText,
                                { color: folder.is_linear ? '#059669' : '#64748B' }
                            ]}>
                                {folder.is_linear ? 'Linear' : 'Free'}
                            </Text>
                        </View>
                    )}

                    {/* Item Count Badge */}
                    <View style={[
                        styles.folderBadge,
                        { backgroundColor: (folder.color || "#F59E0B") + '20' }
                    ]}>
                        <Text style={[styles.folderBadgeText, { color: folder.color || "#F59E0B" }]}>
                            {folder.total_count || folder.item_count || folder.items?.length || 0}
                        </Text>
                    </View>

                    {/* Settings Gear for Bucket */}
                    <TouchableOpacity
                        onPress={() => openSettingsModal(folder, 'bucket')}
                        style={{ padding: 6, marginLeft: 4 }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                        <Feather name="settings" size={16} color="#9CA3AF" />
                    </TouchableOpacity>
                </TouchableOpacity>

                {/* Folder Contents (when expanded) */}
                {isExpanded && (
                    <View style={[
                        styles.folderContents,
                        depth > 0 && styles.nestedFolderContents
                    ]}>
                        {/* Linear Mode Controls Bar */}
                        {(folder.learning_path_type === 'self_learning' || activeLearningPath === 'self_learning') && !hasChildren && hasItems && (
                            <View style={styles.linearControlBar}>
                                <View style={styles.linearSwitchRow}>
                                    <MaterialCommunityIcons
                                        name={folder.is_linear ? 'format-list-numbered' : 'shuffle-variant'}
                                        size={16}
                                        color={folder.is_linear ? '#059669' : '#64748B'}
                                    />
                                    <Text style={styles.linearSwitchLabel}>
                                        {folder.is_linear ? 'Linear (Sequential)' : 'Non-Linear (Free Access)'}
                                    </Text>
                                    <Switch
                                        value={folder.is_linear || false}
                                        onValueChange={() => toggleLinearMode(folder)}
                                        trackColor={{ false: '#D1D5DB', true: '#A7F3D0' }}
                                        thumbColor={folder.is_linear ? '#059669' : '#9CA3AF'}
                                        style={{ transform: [{ scale: 0.8 }] }}
                                    />
                                </View>
                                {folder.is_linear && reorderingBucketId !== folder.id && (
                                    <TouchableOpacity
                                        style={styles.reorderStartBtn}
                                        onPress={() => startReordering(folder)}
                                    >
                                        <Feather name="list" size={14} color="#FFF" />
                                        <Text style={styles.reorderStartBtnText}>Reorder Courses</Text>
                                    </TouchableOpacity>
                                )}
                                {reorderingBucketId === folder.id && (
                                    <View style={styles.reorderActionRow}>
                                        <TouchableOpacity
                                            style={styles.reorderCancelBtn}
                                            onPress={cancelReordering}
                                        >
                                            <Text style={styles.reorderCancelText}>Cancel</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={styles.reorderSaveBtn}
                                            onPress={() => saveReorder(folder.id)}
                                            disabled={savingReorder}
                                        >
                                            {savingReorder ? (
                                                <ActivityIndicator size="small" color="#FFF" />
                                            ) : (
                                                <>
                                                    <Feather name="save" size={14} color="#FFF" />
                                                    <Text style={styles.reorderSaveText}>Save Order</Text>
                                                </>
                                            )}
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>
                        )}

                        {/* Recursively render child folders FIRST */}
                        {hasChildren && folder.children.map(childFolder =>
                            renderFolderTree(childFolder, depth + 1)
                        )}

                        {/* Render courses - use reordered list if in reorder mode */}
                        {reorderingBucketId === folder.id ? (
                            /* Reorder Mode: Show numbered list with arrows */
                            reorderedItems.map((item, idx) => {
                                const uniqueKey = `reorder-${folder.id}-${item.id}-${idx}`;
                                return (
                                    <View key={uniqueKey} style={styles.reorderItemRow}>
                                        <View style={styles.reorderNumber}>
                                            <Text style={styles.reorderNumberText}>{idx + 1}</Text>
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            {renderContentItem(item, depth + 1, uniqueKey)}
                                        </View>
                                        <View style={styles.reorderArrows}>
                                            <TouchableOpacity
                                                style={[styles.reorderArrowBtn, idx === 0 && styles.reorderArrowDisabled]}
                                                onPress={() => moveItemUp(idx)}
                                                disabled={idx === 0}
                                            >
                                                <Feather name="chevron-up" size={18} color={idx === 0 ? '#D1D5DB' : '#059669'} />
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[styles.reorderArrowBtn, idx === reorderedItems.length - 1 && styles.reorderArrowDisabled]}
                                                onPress={() => moveItemDown(idx)}
                                                disabled={idx === reorderedItems.length - 1}
                                            >
                                                <Feather name="chevron-down" size={18} color={idx === reorderedItems.length - 1 ? '#D1D5DB' : '#059669'} />
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                );
                            })
                        ) : (
                            /* Normal Mode: Regular content items */
                            hasItems && folder.items.map((item, idx) => {
                                const uniqueKey = `${folder.id}-${item.id}-${idx}`;
                                return (
                                    <View key={uniqueKey}>
                                        {renderContentItem(item, depth + 1, uniqueKey)}
                                    </View>
                                );
                            })
                        )}

                        {/* Show empty state if no children and no items */}
                        {!hasChildren && !hasItems && (
                            <View style={styles.emptyFolderState}>
                                <Feather name="inbox" size={24} color="#D1D5DB" />
                                <Text style={styles.emptyFolderText}>Empty folder</Text>
                            </View>
                        )}
                    </View>
                )}
            </View>
        );
    };

    const renderContentItem = (item, indentLevel = 0, keyPrefix = '') => {
        let iconName = 'file-document-outline';
        let iconColor = '#6B7280';

        // Detect resource type from multiple sources
        const resourceType = item.resource_type || item.resourceType || item.type;

        if (resourceType === 'PDF' || item.title.endsWith('.pdf')) { iconName = 'file-pdf-box'; iconColor = '#EF4444'; }
        else if (resourceType === 'Video' || item.videoUrl) { iconName = 'play-circle'; iconColor = '#8B5CF6'; }
        else if (resourceType === 'Presentation' || item.title.endsWith('.ppt') || item.title.endsWith('.pptx')) { iconName = 'file-powerpoint'; iconColor = '#F59E0B'; }
        else if (resourceType === 'Document' || item.title.endsWith('.doc') || item.title.endsWith('.docx')) { iconName = 'file-word'; iconColor = '#2B579A'; }
        else if (resourceType === 'Excel' || item.title.endsWith('.xlsx')) { iconName = 'file-excel'; iconColor = '#10B981'; }
        else if (resourceType === 'Audio') { iconName = 'volume-high'; iconColor = '#EC4899'; }

        // Calculate indentation for nested content
        const indentWidth = indentLevel * 12;
        const isSelected = selectedItems.has(item.id);

        return (
            <View style={[styles.contentItem, { marginLeft: indentWidth }, isSelected && styles.selectedItem]}>
                {/* Top row: checkbox + icon + info */}
                <View style={styles.contentItemTopRow}>
                    {selectionMode && (
                        <TouchableOpacity
                            onPress={() => toggleItemSelection(item.id)}
                            style={styles.checkboxContainer}
                        >
                            <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                                {isSelected && <Feather name="check" size={16} color="#FFF" />}
                            </View>
                        </TouchableOpacity>
                    )}

                    <View style={[styles.iconBox, { backgroundColor: iconColor + '20' }]}>
                        <MaterialCommunityIcons name={iconName} size={24} color={iconColor} />
                    </View>
                    <View style={styles.itemInfo}>
                        <Text style={styles.itemTitle}>{item.title}</Text>
                        <Text style={styles.itemDesc} numberOfLines={1}>{item.description}</Text>
                        <View style={styles.itemMetaRow}>
                            {resourceType && (
                                <>
                                    <MaterialCommunityIcons name="tag" size={12} color="#9CA3AF" />
                                    <Text style={styles.itemResourceType}>{resourceType}</Text>
                                    <Text style={styles.itemDot}>•</Text>
                                </>
                            )}
                            <Text style={styles.itemCategory}>{item.category || item.bucket}</Text>
                            {item.date && (
                                <>
                                    <Text style={styles.itemDot}>•</Text>
                                    <Text style={styles.itemDate}>{item.date}</Text>
                                </>
                            )}
                        </View>
                    </View>
                </View>

                {/* Action buttons row (hidden in selection mode) */}
                {!selectionMode && (
                    <View style={styles.actionsContainer}>
                        <TouchableOpacity onPress={() => openPreviewModal(item)} style={[styles.actionBtn, { backgroundColor: '#ECFDF5' }]}>
                            <Feather name="eye" size={16} color="#10B981" />
                            <Text style={[styles.actionLabel, { color: '#10B981' }]}>Preview</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => openEditModal(item)} style={[styles.actionBtn, { backgroundColor: '#EFF6FF' }]}>
                            <Feather name="edit-2" size={16} color="#3B82F6" />
                            <Text style={[styles.actionLabel, { color: '#3B82F6' }]}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => openSettingsModal(item, 'course')} style={[styles.actionBtn, { backgroundColor: '#F5F3FF' }]}>
                            <Feather name="settings" size={16} color="#8B5CF6" />
                            <Text style={[styles.actionLabel, { color: '#8B5CF6' }]}>Settings</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => openCategoryModal(item)} style={[styles.actionBtn, { backgroundColor: '#FFFBEB' }]}>
                            <Feather name="folder" size={16} color="#F59E0B" />
                            <Text style={[styles.actionLabel, { color: '#F59E0B' }]}>Bucket</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleDelete(item)} style={[styles.actionBtn, { backgroundColor: '#FEF2F2' }]}>
                            <Feather name="trash-2" size={16} color="#EF4444" />
                            <Text style={[styles.actionLabel, { color: '#EF4444' }]}>Delete</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        );
    };

    return (
        <>
            <Modal visible={visible} animationType="slide" transparent>
                <View style={styles.overlay}>
                    <BlurView intensity={20} style={StyleSheet.absoluteFill} />
                    <View style={styles.container}>
                        {/* Header */}
                        <LinearGradient
                            colors={['#3B82F6', '#2563EB']}
                            style={styles.header}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                        >
                            <View style={styles.headerTop}>
                                <View style={styles.headerTitleRow}>
                                    <View style={styles.headerIcon}>
                                        <MaterialCommunityIcons name="bookshelf" size={24} color="#FFF" />
                                    </View>
                                    <Text style={styles.headerTitle}>
                                        {selectionMode ? `${selectedItems.size} Selected` : 'Content Library'}
                                    </Text>
                                </View>
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                    {/* Background Deletion Indicator */}
                                    {deletingInBackground && (
                                        <View style={styles.backgroundDeleteIndicator}>
                                            <ActivityIndicator size="small" color="#FFF" />
                                        </View>
                                    )}
                                    {/* Bulk Select Toggle Button */}
                                    <TouchableOpacity onPress={toggleSelectionMode} style={[styles.closeBtn, selectionMode && { backgroundColor: '#EF4444' }]}>
                                        <MaterialCommunityIcons name={selectionMode ? "close" : "checkbox-multiple-marked-outline"} size={22} color="#FFF" />
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                                        <Feather name="x" size={22} color="#FFF" />
                                    </TouchableOpacity>
                                </View>
                            </View>

                            {/* Bulk Action Bar (shown in selection mode) */}
                            {selectionMode && (
                                <View style={styles.bulkActionBar}>
                                    <TouchableOpacity
                                        onPress={() => {
                                            console.log(" Select All pressed");
                                            selectAll();
                                        }}
                                        style={styles.bulkActionBtn}
                                    >
                                        <Feather name="check-square" size={16} color="#FFF" />
                                        <Text style={styles.bulkActionText}>Select All</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={deselectAll} style={styles.bulkActionBtn}>
                                        <Feather name="square" size={16} color="#FFF" />
                                        <Text style={styles.bulkActionText}>Deselect All</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        onPress={() => {
                                            console.log(" DELETE BUTTON PRESSED!");
                                            console.log("Selected items size:", selectedItems.size);
                                            console.log("Bulk delete loading:", bulkDeleteLoading);
                                            handleBulkDelete();
                                        }}
                                        disabled={selectedItems.size === 0 || bulkDeleteLoading || deletingInBackground}
                                        style={[styles.bulkActionBtn, styles.bulkDeleteBtn, selectedItems.size === 0 && { opacity: 0.5 }]}
                                    >
                                        {bulkDeleteLoading || deletingInBackground ? (
                                            <ActivityIndicator size="small" color="#FFF" />
                                        ) : (
                                            <>
                                                <Feather name="trash-2" size={16} color="#FFF" />
                                                <Text style={styles.bulkActionText}>Delete ({selectedItems.size})</Text>
                                            </>
                                        )}
                                    </TouchableOpacity>
                                </View>
                            )}

                            {/* Search Bar */}
                            {!selectionMode && (
                                <View style={styles.searchContainer}>
                                    <Feather name="search" size={20} color="#93C5FD" style={{ marginLeft: 12 }} />
                                    <TextInput
                                        style={styles.searchInput}
                                        placeholder="Search documents, videos..."
                                        placeholderTextColor="#93C5FD"
                                        value={searchQuery}
                                        onChangeText={setSearchQuery}
                                    />
                                </View>
                            )}
                        </LinearGradient>

                        {/* Learning Path Selector - Primary Tier */}
                        <View style={styles.learningPathContainer}>
                            {learningPaths.map((lp) => (
                                <TouchableOpacity
                                    key={lp.id}
                                    style={[
                                        styles.learningPathTab,
                                        activeLearningPath === lp.id && styles.activeLearningPathTab,
                                        { borderColor: lp.color }
                                    ]}
                                    onPress={() => {
                                        setActiveLearningPath(lp.id);
                                        setActiveTab('All'); // Reset category filter when switching learning path
                                    }}
                                >
                                    <View style={[styles.learningPathIcon, { backgroundColor: lp.color + '20' }]}>
                                        <Feather
                                            name={lp.icon || 'folder'}
                                            size={18}
                                            color={activeLearningPath === lp.id ? lp.color : '#6B7280'}
                                        />
                                    </View>
                                    <View style={styles.learningPathTextContainer}>
                                        <Text style={[
                                            styles.learningPathText,
                                            activeLearningPath === lp.id && { color: lp.color, fontFamily: 'Poppins_700Bold' }
                                        ]}>
                                            {lp.name}
                                        </Text>
                                        <Text style={styles.learningPathCount}>
                                            {lp.total_count || 0} items
                                        </Text>
                                    </View>
                                    {activeLearningPath === lp.id && (
                                        <View style={[styles.learningPathIndicator, { backgroundColor: lp.color }]} />
                                    )}
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* Category Tabs - Secondary Tier */}
                        <View style={styles.tabsContainer}>
                            <FlatList
                                data={tabs}
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                keyExtractor={item => item}
                                contentContainerStyle={{ paddingHorizontal: 16 }}
                                renderItem={({ item }) => (
                                    <TouchableOpacity
                                        style={[styles.tab, activeTab === item && styles.activeTab]}
                                        onPress={() => setActiveTab(item)}
                                    >
                                        <Text style={[styles.tabText, activeTab === item && styles.activeTabText]}>{item}</Text>
                                    </TouchableOpacity>
                                )}
                            />
                        </View>

                        {/* Content List */}
                        {loading ? (
                            <View style={styles.centerContent}>
                                <ActivityIndicator size="large" color="#3B82F6" />
                            </View>
                        ) : (
                            <ScrollView contentContainerStyle={styles.listContent}>
                                {displayCategories.length === 0 ? (
                                    <View style={styles.emptyState}>
                                        <Feather name="inbox" size={48} color="#D1D5DB" />
                                        <Text style={styles.emptyStateText}>No content found</Text>
                                    </View>
                                ) : (
                                    displayCategories.map(category => renderFolderTree(category, 0))
                                )}
                                <View style={{ height: 100 }} />
                            </ScrollView>
                        )}

                        {/* Edit Content Modal */}
                        <Modal visible={editModalVisible} transparent animationType="fade">
                            <View style={styles.modalOverlay}>
                                <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
                                    <View style={styles.modalContent}>
                                        <Text style={styles.modalTitle}>Edit Content</Text>

                                        <Text style={styles.inputLabel}>Title</Text>
                                        <TextInput
                                            style={styles.input}
                                            value={editTitle}
                                            onChangeText={setEditTitle}
                                        />

                                        <Text style={styles.inputLabel}>Description</Text>
                                        <TextInput
                                            style={[styles.input, styles.textArea]}
                                            value={editDescription}
                                            onChangeText={setEditDescription}
                                            multiline
                                        />

                                        <Text style={styles.inputLabel}>Category</Text>
                                        <View style={{ marginBottom: 16 }}>
                                            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                                <TouchableOpacity
                                                    onPress={() => setEditBucketId('uncategorized')}
                                                    style={{
                                                        paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, marginRight: 8,
                                                        backgroundColor: editBucketId === 'uncategorized' ? '#6B7280' : '#F3F4F6',
                                                        borderWidth: 1, borderColor: editBucketId === 'uncategorized' ? '#6B7280' : '#E5E7EB',
                                                        flexDirection: 'row', alignItems: 'center'
                                                    }}
                                                >
                                                    <Feather name="folder" size={14} color={editBucketId === 'uncategorized' ? '#FFF' : '#6B7280'} style={{ marginRight: 4 }} />
                                                    <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: editBucketId === 'uncategorized' ? '#FFF' : '#4B5563' }}>Uncategorized</Text>
                                                </TouchableOpacity>
                                                {availableBuckets.map(bucket => (
                                                    <TouchableOpacity
                                                        key={bucket.id}
                                                        onPress={() => setEditBucketId(bucket.id)}
                                                        style={{
                                                            paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, marginRight: 8,
                                                            backgroundColor: editBucketId === bucket.id ? bucket.color : '#F3F4F6',
                                                            borderWidth: 1, borderColor: editBucketId === bucket.id ? bucket.color : '#E5E7EB',
                                                            flexDirection: 'row', alignItems: 'center'
                                                        }}
                                                    >
                                                        <MaterialCommunityIcons name={bucket.icon} size={14} color={editBucketId === bucket.id ? '#FFF' : bucket.color} style={{ marginRight: 4 }} />
                                                        <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: editBucketId === bucket.id ? '#FFF' : '#4B5563' }}>{bucket.name}</Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </ScrollView>
                                        </View>

                                        <View style={styles.modalActions}>
                                            <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setEditModalVisible(false)}>
                                                <Text style={styles.cancelBtnText}>Cancel</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity style={[styles.modalBtn, styles.saveBtn]} onPress={handleSaveEdit}>
                                                <Text style={styles.saveBtnText}>Save Changes</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                </KeyboardAvoidingView>
                            </View>
                        </Modal>

                        {/* Change Category Modal */}
                        <Modal visible={categoryModalVisible} transparent animationType="fade">
                            <View style={styles.modalOverlay}>
                                <View style={styles.modalContent}>
                                    <Text style={styles.modalTitle}>Change Category</Text>
                                    <Text style={styles.modalSubtitle}>Select new category for "{selectedContent?.title}"</Text>

                                    <ScrollView style={{ maxHeight: 300 }}>
                                        {availableBuckets.map(bucket => (
                                            <TouchableOpacity
                                                key={bucket.id}
                                                style={styles.bucketItem}
                                                onPress={() => handleChangeCategory(bucket.id)}
                                            >
                                                <View style={[styles.bucketIcon, { backgroundColor: bucket.color + '20' }]}>
                                                    <MaterialCommunityIcons name={bucket.icon} size={20} color={bucket.color} />
                                                </View>
                                                <Text style={styles.bucketName}>{bucket.name}</Text>
                                                {selectedContent?.bucket_id === bucket.id && (
                                                    <Feather name="check" size={20} color="#10B981" />
                                                )}
                                            </TouchableOpacity>
                                        ))}
                                        <TouchableOpacity
                                            style={styles.bucketItem}
                                            onPress={() => handleChangeCategory("uncategorized")}
                                        >
                                            <View style={[styles.bucketIcon, { backgroundColor: '#6B728020' }]}>
                                                <MaterialCommunityIcons name="folder" size={20} color="#6B7280" />
                                            </View>
                                            <Text style={styles.bucketName}>Uncategorized</Text>
                                        </TouchableOpacity>
                                    </ScrollView>

                                    <TouchableOpacity style={styles.closeModalBtn} onPress={() => setCategoryModalVisible(false)}>
                                        <Text style={styles.closeModalText}>Cancel</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </Modal>

                        {/* Content Preview Modal */}
                        <Modal visible={previewModalVisible} transparent animationType="slide">
                            <View style={styles.previewModalOverlay}>
                                <View style={styles.previewModalContainer}>
                                    {/* Header */}
                                    <View style={styles.previewHeader}>
                                        <View style={styles.previewHeaderLeft}>
                                            <MaterialCommunityIcons
                                                name={previewContent?.resource_type === 'Video' ? 'play-circle' :
                                                    previewContent?.resource_type === 'PDF' ? 'file-pdf-box' :
                                                        previewContent?.resource_type === 'Presentation' ? 'file-powerpoint' :
                                                            previewContent?.resource_type === 'Document' ? 'file-word' :
                                                                'file-document-outline'}
                                                size={24}
                                                color="#3B82F6"
                                            />
                                            <View style={styles.previewTitleContainer}>
                                                <Text style={styles.previewTitle} numberOfLines={1}>
                                                    {previewContent?.title}
                                                </Text>
                                                {previewContent?.resource_type && (
                                                    <Text style={styles.previewResourceType}>
                                                        {previewContent.resource_type}
                                                    </Text>
                                                )}
                                            </View>
                                        </View>
                                        <TouchableOpacity
                                            onPress={() => setPreviewModalVisible(false)}
                                            style={styles.previewCloseBtn}
                                        >
                                            <Feather name="x" size={24} color="#6B7280" />
                                        </TouchableOpacity>
                                    </View>

                                    {/* CSS to hide Google Docs download button */}
                                    {Platform.OS === 'web' && (
                                        <style>{`
                                        iframe {
                                            pointer-events: auto !important;
                                        }
                                        /* Hide download/pop-out buttons in Google Docs viewer */
                                        .ndfHFb-c4YZDc-Wrql6b {
                                            display: none !important;
                                        }
                                        /* Hide toolbar buttons */
                                        .ndfHFb-c4YZDc-to915-LgbsSe {
                                            display: none !important;
                                        }
                                    `}</style>
                                    )}

                                    {/* Content Viewer */}
                                    <View style={styles.previewContent}>
                                        {previewContent && previewContent.video_url ? (
                                            (() => {
                                                const resourceType = previewContent.resource_type;
                                                const videoUrl = previewContent.video_url;

                                                // For Videos: Use HTML5 video player
                                                if (resourceType === 'Video') {
                                                    return Platform.OS === 'web' ? (
                                                        <video
                                                            controls
                                                            controlsList="nodownload"
                                                            style={{
                                                                width: '100%',
                                                                height: '100%',
                                                                objectFit: 'contain',
                                                                backgroundColor: '#000'
                                                            }}
                                                            onContextMenu={(e) => e.preventDefault()}
                                                        >
                                                            <source src={videoUrl} type="video/mp4" />
                                                            Your browser does not support the video tag.
                                                        </video>
                                                    ) : (
                                                        <WebView
                                                            source={{
                                                                html: `
                                                            <html>
                                                            <head>
                                                                <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
                                                                <style>
                                                                    body { margin: 0; padding: 0; background: #000; display: flex; align-items: center; justify-content: center; height: 100vh; }
                                                                    video { width: 100%; height: 100%; object-fit: contain; }
                                                                </style>
                                                            </head>
                                                            <body>
                                                                <video controls controlsList="nodownload" playsinline>
                                                                    <source src="${videoUrl}" type="video/mp4">
                                                                </video>
                                                            </body>
                                                            </html>
                                                        ` }}
                                                            style={styles.previewWebView}
                                                            allowsInlineMediaPlayback={true}
                                                            mediaPlaybackRequiresUserAction={false}
                                                        />
                                                    );
                                                }

                                                // For Audio: Use HTML5 audio player
                                                if (resourceType === 'Audio') {
                                                    return Platform.OS === 'web' ? (
                                                        <View style={styles.audioPreviewContainer}>
                                                            <MaterialCommunityIcons name="music-circle" size={80} color="#3B82F6" />
                                                            <Text style={styles.audioTitle}>{previewContent.title}</Text>
                                                            <audio
                                                                controls
                                                                controlsList="nodownload"
                                                                style={{
                                                                    width: '80%',
                                                                    marginTop: 20
                                                                }}
                                                                onContextMenu={(e) => e.preventDefault()}
                                                            >
                                                                <source src={videoUrl} type="audio/mpeg" />
                                                                Your browser does not support the audio tag.
                                                            </audio>
                                                        </View>
                                                    ) : (
                                                        <WebView
                                                            source={{
                                                                html: `
                                                            <html>
                                                            <head>
                                                                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                                                                <style>
                                                                    body { margin: 0; padding: 40px; background: #F9FAFB; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
                                                                    h2 { color: #111827; text-align: center; }
                                                                    audio { width: 100%; max-width: 500px; margin-top: 20px; }
                                                                </style>
                                                            </head>
                                                            <body>
                                                                <h2>${previewContent.title}</h2>
                                                                <audio controls controlsList="nodownload">
                                                                    <source src="${videoUrl}" type="audio/mpeg">
                                                                </audio>
                                                            </body>
                                                            </html>
                                                        ` }}
                                                            style={styles.previewWebView}
                                                        />
                                                    );
                                                }

                                                // For Documents, PDFs, Presentations: Use Google Docs Viewer (no download option in iframe)
                                                if (['PDF', 'Document', 'Presentation', 'Spreadsheet'].includes(resourceType)) {
                                                    return Platform.OS === 'web' ? (
                                                        <iframe
                                                            src={`https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(videoUrl)}`}
                                                            style={{
                                                                width: '100%',
                                                                height: '100%',
                                                                border: 'none',
                                                                borderRadius: 12
                                                            }}
                                                            title={previewContent.title}
                                                        />
                                                    ) : (
                                                        <WebView
                                                            source={{
                                                                uri: `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(videoUrl)}`
                                                            }}
                                                            style={styles.previewWebView}
                                                            startInLoadingState={true}
                                                            renderLoading={() => (
                                                                <View style={styles.previewLoadingContainer}>
                                                                    <ActivityIndicator size="large" color="#3B82F6" />
                                                                    <Text style={styles.previewLoadingText}>Loading preview...</Text>
                                                                </View>
                                                            )}
                                                        />
                                                    );
                                                }

                                                // For other types: Show message
                                                return (
                                                    <View style={styles.previewEmptyState}>
                                                        <Feather name="file" size={48} color="#D1D5DB" />
                                                        <Text style={styles.previewEmptyText}>Preview not available for this file type</Text>
                                                    </View>
                                                );
                                            })()
                                        ) : (
                                            <View style={styles.previewEmptyState}>
                                                <Feather name="alert-circle" size={48} color="#D1D5DB" />
                                                <Text style={styles.previewEmptyText}>No preview available</Text>
                                            </View>
                                        )}
                                    </View>

                                    {/* Footer with actions */}
                                    <View style={styles.previewFooter}>
                                        <TouchableOpacity
                                            onPress={() => setPreviewModalVisible(false)}
                                            style={styles.previewFooterBtn}
                                        >
                                            <Text style={styles.previewFooterBtnText}>Close</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>
                        </Modal>

                        {/* Success Modal */}
                        <Modal visible={successModalVisible} animationType="fade" transparent={true}>
                            <View style={styles.successModalOverlay}>
                                <View style={styles.successModalContent}>
                                    {/* Success Icon */}
                                    <View style={styles.successIconContainer}>
                                        <Feather name="check-circle" size={64} color="#10B981" />
                                    </View>

                                    {/* Title */}
                                    <Text style={styles.successTitle}>{successMessage.title}</Text>

                                    {/* Message */}
                                    <Text style={styles.successMessage}>
                                        {successMessage.count} item(s) deleted successfully.
                                    </Text>

                                    <Text style={styles.successSubMessage}>
                                        Cleanup is happening in the background.
                                    </Text>

                                    {/* OK Button */}
                                    <TouchableOpacity
                                        style={styles.successOkBtn}
                                        onPress={() => setSuccessModalVisible(false)}
                                    >
                                        <Text style={styles.successOkText}>OK</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </Modal>

                    </View>
                </View>
            </Modal>

            {/* Course/Bucket Settings Modal */}
            <CourseSettingsModal
                visible={settingsModalVisible}
                onClose={() => { setSettingsModalVisible(false); setSettingsItem(null); }}
                item={settingsItem}
                itemType={settingsItemType}
                onSaveSuccess={() => {
                    // Refetch content and buckets after saving settings
                    fetchContent();
                    fetchBuckets();
                }}
            />
        </>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    container: {
        backgroundColor: '#F9FAFB',
        height: '92%',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        overflow: 'hidden',
    },
    header: {
        padding: 24,
        paddingBottom: 20,
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    headerTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        marginRight: 8,
    },
    headerIcon: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    headerTitle: {
        fontSize: 20,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
        flex: 1,
    },
    closeBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: 14,
        height: 50,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    searchInput: {
        flex: 1,
        height: '100%',
        paddingHorizontal: 12,
        color: '#FFF',
        fontFamily: 'Poppins_400Regular',
    },
    // Learning Path Selector Styles (Primary Tier)
    learningPathContainer: {
        flexDirection: 'row',
        backgroundColor: '#FFF',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
        gap: 12,
    },
    learningPathTab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F9FAFB',
        borderRadius: 16,
        paddingVertical: 12,
        paddingHorizontal: 8,
        borderWidth: 2,
        borderColor: 'transparent',
        position: 'relative',
        overflow: 'hidden',
    },
    activeLearningPathTab: {
        backgroundColor: '#FFF',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 3,
    },
    learningPathIcon: {
        width: 32,
        height: 32,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 8,
    },
    learningPathTextContainer: {
        flex: 1,
    },
    learningPathText: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
        color: '#374151',
    },
    learningPathCount: {
        fontSize: 11,
        fontFamily: 'Poppins_500Medium',
        color: '#9CA3AF',
        marginTop: 2,
    },
    learningPathIndicator: {
        position: 'absolute',
        bottom: 0,
        left: 16,
        right: 16,
        height: 3,
        borderRadius: 2,
    },
    // Category Tabs Styles (Secondary Tier)
    tabsContainer: {
        backgroundColor: '#FFF',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    tab: {
        paddingHorizontal: 20,
        paddingVertical: 8,
        borderRadius: 20,
        marginRight: 8,
        backgroundColor: '#F3F4F6',
    },
    activeTab: {
        backgroundColor: '#EFF6FF',
        borderWidth: 1,
        borderColor: '#3B82F6',
    },
    tabText: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
        color: '#6B7280',
    },
    activeTabText: {
        color: '#3B82F6',
    },
    listContent: {
        padding: 20,
    },
    centerContent: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyState: {
        alignItems: 'center',
        marginTop: 50,
        opacity: 0.5
    },
    emptyStateText: {
        marginTop: 10,
        fontFamily: 'Poppins_500Medium',
        color: '#6B7280'
    },
    emptyFolderState: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        opacity: 0.4
    },
    emptyFolderText: {
        marginLeft: 8,
        fontFamily: 'Poppins_400Regular',
        fontSize: 13,
        color: '#9CA3AF',
        fontStyle: 'italic'
    },
    // Folder-like structure styles
    folderContainer: {
        marginBottom: 8,
    },
    folderHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        padding: 12,
        borderRadius: 12,
        marginBottom: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    expandIconContainer: {
        width: 28,
        height: 28,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 4,
    },
    folderIconBox: {
        width: 36,
        height: 36,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    folderName: {
        flex: 1,
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
        color: '#111827',
    },
    folderBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        marginLeft: 8,
    },
    folderBadgeText: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
    },
    folderContents: {
        marginLeft: 8,
        marginTop: 4,
        paddingLeft: 12,
        borderLeftWidth: 2,
        borderLeftColor: '#E5E7EB',
    },
    nestedFolder: {
        marginBottom: 8,
    },
    nestedFolderHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F9FAFB',
        padding: 10,
        borderRadius: 10,
        marginBottom: 4,
    },
    nestedFolderName: {
        flex: 1,
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#374151',
        marginLeft: 8,
    },
    nestedFolderCount: {
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
        color: '#9CA3AF',
        marginLeft: 4,
    },
    nestedFolderContents: {
        marginLeft: 20,
        marginTop: 4,
    },
    // Legacy styles (kept for backwards compatibility)
    categorySection: {
        marginBottom: 24,
    },
    categoryHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        paddingHorizontal: 4,
    },
    categoryTitle: {
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
        color: '#111827',
        marginLeft: 8,
        marginRight: 8,
    },
    badge: {
        backgroundColor: '#F3F4F6',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 12,
    },
    badgeText: {
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
        color: '#6B7280',
    },
    contentItem: {
        flexDirection: 'column',
        alignItems: 'stretch',
        backgroundColor: '#FFF',
        padding: 16,
        borderRadius: 16,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.03,
        shadowRadius: 8,
        elevation: 2,
    },
    contentItemTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    iconBox: {
        width: 48,
        height: 48,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    itemInfo: {
        flex: 1,
    },
    itemTitle: {
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
        color: '#111827',
        marginBottom: 2,
    },
    itemDesc: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
        marginBottom: 4,
    },
    itemMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    itemResourceType: {
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
        color: '#9CA3AF',
        marginLeft: 4,
    },
    itemCategory: {
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
        color: '#6B7280',
    },
    itemDot: {
        fontSize: 12,
        color: '#D1D5DB',
        marginHorizontal: 8,
    },
    itemDate: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#9CA3AF',
    },
    actionsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#F3F4F6',
    },
    actionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingVertical: 6,
        paddingHorizontal: 8,
        borderRadius: 8,
    },
    actionLabel: {
        fontSize: 10,
        fontWeight: '600',
    },

    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        padding: 20,
    },
    modalContent: {
        backgroundColor: '#FFF',
        borderRadius: 24,
        padding: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 10,
    },
    modalTitle: {
        fontSize: 20,
        fontFamily: 'Poppins_700Bold',
        color: '#111827',
        marginBottom: 16,
    },
    modalSubtitle: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
        marginBottom: 20,
    },
    inputLabel: {
        fontSize: 13,
        fontFamily: 'Poppins_500Medium',
        color: '#4B5563',
        marginBottom: 6,
    },
    input: {
        backgroundColor: '#F9FAFB',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 12,
        padding: 12,
        fontSize: 15,
        fontFamily: 'Poppins_400Regular',
        color: '#111827',
        marginBottom: 16,
    },
    textArea: {
        height: 100,
        textAlignVertical: 'top',
    },
    modalActions: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 8,
    },
    modalBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
    },
    cancelBtn: {
        backgroundColor: '#F3F4F6',
    },
    saveBtn: {
        backgroundColor: '#3B82F6',
    },
    cancelBtnText: {
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
        color: '#4B5563',
    },
    saveBtnText: {
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
    },

    // Category Picker Styles
    bucketItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    bucketIcon: {
        width: 36,
        height: 36,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    bucketName: {
        flex: 1,
        fontSize: 15,
        fontFamily: 'Poppins_500Medium',
        color: '#111827',
    },
    closeModalBtn: {
        marginTop: 20,
        alignItems: 'center',
        padding: 12,
    },
    closeModalText: {
        fontSize: 15,
        fontFamily: 'Poppins_500Medium',
        color: '#6B7280',
    },

    // Bulk Selection Styles
    checkboxContainer: {
        marginRight: 12,
    },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: '#D1D5DB',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#FFF',
    },
    checkboxSelected: {
        backgroundColor: '#3B82F6',
        borderColor: '#3B82F6',
    },
    selectedItem: {
        backgroundColor: '#EFF6FF',
        borderWidth: 2,
        borderColor: '#3B82F6',
    },
    bulkActionBar: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 12,
        paddingBottom: 8,
    },
    bulkActionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.3)',
    },
    bulkDeleteBtn: {
        backgroundColor: '#EF4444',
        borderColor: '#DC2626',
        marginLeft: 'auto',
    },
    bulkActionText: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
    },
    backgroundDeleteIndicator: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(251,191,36,0.3)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.3)',
    },

    // Preview Modal Styles
    previewModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    previewModalContainer: {
        width: '100%',
        maxWidth: 1200,
        height: '90%',
        backgroundColor: '#FFF',
        borderRadius: 20,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 20,
    },
    previewHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
        backgroundColor: '#F9FAFB',
    },
    previewHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        marginRight: 16,
    },
    previewTitleContainer: {
        marginLeft: 12,
        flex: 1,
    },
    previewTitle: {
        fontSize: 18,
        fontFamily: 'Poppins_600SemiBold',
        color: '#111827',
        marginBottom: 2,
    },
    previewResourceType: {
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
        color: '#6B7280',
    },
    previewCloseBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#F3F4F6',
        justifyContent: 'center',
        alignItems: 'center',
    },
    previewContent: {
        flex: 1,
        backgroundColor: '#F9FAFB',
    },
    previewWebView: {
        flex: 1,
        backgroundColor: '#FFF',
    },
    audioPreviewContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    audioTitle: {
        fontSize: 18,
        fontFamily: 'Poppins_600SemiBold',
        color: '#111827',
        marginTop: 20,
        textAlign: 'center',
    },
    previewLoadingContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#F9FAFB',
    },
    previewLoadingText: {
        marginTop: 12,
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        color: '#6B7280',
    },
    previewEmptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    previewEmptyText: {
        marginTop: 16,
        fontSize: 16,
        fontFamily: 'Poppins_500Medium',
        color: '#9CA3AF',
    },
    previewFooter: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        padding: 20,
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
        backgroundColor: '#F9FAFB',
    },
    previewFooterBtn: {
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 10,
        backgroundColor: '#3B82F6',
    },
    previewFooterBtnText: {
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
    },

    // Success Modal Styles
    successModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    successModalContent: {
        width: '100%',
        maxWidth: 400,
        backgroundColor: '#FFF',
        borderRadius: 20,
        padding: 32,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 20,
        elevation: 20,
    },
    successIconContainer: {
        marginBottom: 20,
    },
    successTitle: {
        fontSize: 22,
        fontFamily: 'Poppins_700Bold',
        color: '#111827',
        marginBottom: 12,
        textAlign: 'center',
    },
    successMessage: {
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
        color: '#374151',
        marginBottom: 8,
        textAlign: 'center',
    },
    successSubMessage: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
        marginBottom: 24,
        textAlign: 'center',
        lineHeight: 20,
    },
    successOkBtn: {
        width: '100%',
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: '#10B981',
        alignItems: 'center',
        shadowColor: '#10B981',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    successOkText: {
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
    },

    // ===== LINEAR / REORDER STYLES =====
    linearBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 10,
        marginRight: 6,
    },
    linearBadgeActive: {
        backgroundColor: '#D1FAE5',
    },
    linearBadgeInactive: {
        backgroundColor: '#F1F5F9',
    },
    linearBadgeText: {
        fontSize: 10,
        fontWeight: '700',
    },
    linearControlBar: {
        backgroundColor: '#F8FAFC',
        borderRadius: 10,
        padding: 10,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    linearSwitchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    linearSwitchLabel: {
        flex: 1,
        fontSize: 13,
        fontWeight: '600',
        color: '#374151',
    },
    reorderStartBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        marginTop: 8,
        backgroundColor: '#059669',
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 8,
    },
    reorderStartBtnText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#FFF',
    },
    reorderActionRow: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 8,
    },
    reorderCancelBtn: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#D1D5DB',
        backgroundColor: '#FFF',
    },
    reorderCancelText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#6B7280',
    },
    reorderSaveBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 8,
        borderRadius: 8,
        backgroundColor: '#059669',
    },
    reorderSaveText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#FFF',
    },
    reorderItemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
    },
    reorderNumber: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#059669',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 4,
    },
    reorderNumberText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#FFF',
    },
    reorderArrows: {
        flexDirection: 'column',
        marginLeft: 4,
    },
    reorderArrowBtn: {
        width: 32,
        height: 28,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#F0FDF4',
        borderRadius: 6,
        marginVertical: 1,
        borderWidth: 1,
        borderColor: '#D1FAE5',
    },
    reorderArrowDisabled: {
        backgroundColor: '#F9FAFB',
        borderColor: '#E5E7EB',
    },
});