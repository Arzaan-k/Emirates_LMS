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
    Platform
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
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
    const [activeTab, setActiveTab] = useState('All');
    const [contentCategories, setContentCategories] = useState([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    // Folder/Bucket collapse state (tracks which folders are expanded)
    const [expandedFolders, setExpandedFolders] = useState(new Set());

    // Edit Modal State
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [selectedContent, setSelectedContent] = useState(null);
    const [editTitle, setEditTitle] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editBucketId, setEditBucketId] = useState(null);

    // Category Modal State
    const [categoryModalVisible, setCategoryModalVisible] = useState(false);
    const [availableBuckets, setAvailableBuckets] = useState([]);

    // Bulk Selection State
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedItems, setSelectedItems] = useState(new Set());
    const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);
    const [deletingInBackground, setDeletingInBackground] = useState(false);

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
            // The endpoint returns buckets with items, so map it to categories format
            if (Array.isArray(data)) {
                setContentCategories(data);
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
        Alert.alert(
            "Delete Content",
            `Are you sure you want to delete "${item.title}"?`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            const response = await fetch(`${API_URL}/api/v1/content/${item.id}`, {
                                method: 'DELETE',
                            });
                            const result = await response.json();
                            if (result.status === 'success') {
                                // Refresh content
                                fetchContent();
                                Alert.alert("Success", "Content deleted successfully");
                            } else {
                                Alert.alert("Error", "Failed to delete content");
                            }
                        } catch (error) {
                            console.error("Delete error:", error);
                            Alert.alert("Error", "An error occurred while deleting");
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
        displayCategories.forEach(cat => {
            cat.items.forEach(item => allItemIds.add(item.id));
        });
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

                        // Show instant feedback
                        setTimeout(() => {
                            if (Platform.OS === 'web') {
                                alert(`✓ Items Removed\n\n${itemCount} item(s) deleted successfully.\n\nCleanup is happening in the background.`);
                            } else {
                                Alert.alert(
                                    "✓ Items Removed",
                                    `${itemCount} item(s) deleted successfully.\n\nCleanup is happening in the background.`,
                                    [{ text: "OK" }]
                                );
                            }
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
            } else {
                newSet.add(folderId); // Expand
            }
            return newSet;
        });
    };

    const tabs = Array.from(new Set(['All', ...availableBuckets.map(b => b.name)]));

    const filteredCategories = activeTab === 'All'
        ? contentCategories
        : contentCategories.filter(cat => cat.name === activeTab);

    // Filter items inside categories based on search query
    const displayCategories = filteredCategories.map(cat => ({
        ...cat,
        items: cat.items.filter(item =>
            item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.description.toLowerCase().includes(searchQuery.toLowerCase())
        )
    })).filter(cat => cat.items.length > 0);

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
        const indentWidth = indentLevel * 24;
        const isSelected = selectedItems.has(item.id);

        return (
            <View style={[styles.contentItem, { marginLeft: indentWidth }, isSelected && styles.selectedItem]}>
                {/* Selection Checkbox (shown in selection mode) */}
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

                {/* Actions (hidden in selection mode) */}
                {!selectionMode && (
                    <View style={styles.actionsContainer}>
                        <TouchableOpacity onPress={() => openEditModal(item)} style={styles.actionBtn}>
                            <Feather name="edit-2" size={18} color="#3B82F6" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => openCategoryModal(item)} style={styles.actionBtn}>
                            <Feather name="folder" size={18} color="#F59E0B" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleDelete(item)} style={styles.actionBtn}>
                            <Feather name="trash-2" size={18} color="#EF4444" />
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        );
    };

    return (
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
                                        console.log("🔵 Select All pressed");
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
                                        console.log("🔴 DELETE BUTTON PRESSED!");
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

                    {/* Tabs */}
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
                                displayCategories.map(category => {
                                    const isExpanded = expandedFolders.has(category.id);
                                    const hasNestedBuckets = category.children && category.children.length > 0;

                                    return (
                                        <View key={category.id} style={styles.folderContainer}>
                                            {/* Folder Header (Clickable like desktop folder) */}
                                            <TouchableOpacity
                                                style={styles.folderHeader}
                                                onPress={() => toggleFolder(category.id)}
                                                activeOpacity={0.7}
                                            >
                                                {/* Expand/Collapse Arrow */}
                                                <View style={styles.expandIconContainer}>
                                                    <MaterialCommunityIcons
                                                        name={isExpanded ? "chevron-down" : "chevron-right"}
                                                        size={20}
                                                        color="#6B7280"
                                                    />
                                                </View>

                                                {/* Folder Icon (changes when opened) */}
                                                <View style={[styles.folderIconBox, { backgroundColor: (category.color || "#F59E0B") + '15' }]}>
                                                    <MaterialCommunityIcons
                                                        name={isExpanded ? "folder-open" : "folder"}
                                                        size={22}
                                                        color={category.color || "#F59E0B"}
                                                    />
                                                </View>

                                                {/* Folder Name */}
                                                <Text style={styles.folderName}>{category.name}</Text>

                                                {/* Item Count Badge */}
                                                <View style={[styles.folderBadge, { backgroundColor: (category.color || "#F59E0B") + '20' }]}>
                                                    <Text style={[styles.folderBadgeText, { color: category.color || "#F59E0B" }]}>
                                                        {category.items.length}
                                                    </Text>
                                                </View>
                                            </TouchableOpacity>

                                            {/* Folder Contents (shown when expanded) */}
                                            {isExpanded && (
                                                <View style={styles.folderContents}>
                                                    {/* Render nested buckets first (if any) */}
                                                    {hasNestedBuckets && category.children.map(childBucket => (
                                                        <View key={childBucket.id} style={styles.nestedFolder}>
                                                            <TouchableOpacity
                                                                style={styles.nestedFolderHeader}
                                                                onPress={() => toggleFolder(childBucket.id)}
                                                                activeOpacity={0.7}
                                                            >
                                                                <MaterialCommunityIcons
                                                                    name={expandedFolders.has(childBucket.id) ? "chevron-down" : "chevron-right"}
                                                                    size={18}
                                                                    color="#9CA3AF"
                                                                />
                                                                <MaterialCommunityIcons
                                                                    name={expandedFolders.has(childBucket.id) ? "folder-open-outline" : "folder-outline"}
                                                                    size={20}
                                                                    color={childBucket.color || "#9CA3AF"}
                                                                    style={{ marginLeft: 8 }}
                                                                />
                                                                <Text style={styles.nestedFolderName}>{childBucket.name}</Text>
                                                                <Text style={styles.nestedFolderCount}>({childBucket.items?.length || 0})</Text>
                                                            </TouchableOpacity>

                                                            {/* Nested folder contents */}
                                                            {expandedFolders.has(childBucket.id) && (
                                                                <View style={styles.nestedFolderContents}>
                                                                    {(childBucket.items || []).map((item, idx) => {
                                                                        const uniqueKey = `${childBucket.id}-${item.id}-${idx}`;
                                                                        return (
                                                                            <View key={uniqueKey}>
                                                                                {renderContentItem(item, 2, uniqueKey)}
                                                                            </View>
                                                                        );
                                                                    })}
                                                                </View>
                                                            )}
                                                        </View>
                                                    ))}

                                                    {/* Render content items */}
                                                    {category.items.map((item, idx) => {
                                                        const uniqueKey = `${category.id}-${item.id}-${idx}`;
                                                        return (
                                                            <View key={uniqueKey}>
                                                                {renderContentItem(item, 1, uniqueKey)}
                                                            </View>
                                                        );
                                                    })}
                                                </View>
                                            )}
                                        </View>
                                    );
                                })
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

                </View>
            </View>
        </Modal>
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
        fontSize: 22,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
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
        flexDirection: 'row',
        alignItems: 'center',
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
        gap: 8,
    },
    actionBtn: {
        padding: 8,
        backgroundColor: '#F3F4F6',
        borderRadius: 8,
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
});