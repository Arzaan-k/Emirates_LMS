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

export default function ContentLibraryModal({ visible, onClose }) {
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState('All');
    const [contentCategories, setContentCategories] = useState([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    // Edit Modal State
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [selectedContent, setSelectedContent] = useState(null);
    const [editTitle, setEditTitle] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editBucketId, setEditBucketId] = useState(null);

    // Category Modal State
    const [categoryModalVisible, setCategoryModalVisible] = useState(false);
    const [availableBuckets, setAvailableBuckets] = useState([]);

    useEffect(() => {
        if (visible) {
            fetchContent();
            fetchBuckets();
        }
    }, [visible]);

    const fetchContent = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${API_URL}/api/content-library`);
            const data = await response.json();
            if (data.categories) {
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
            const response = await fetch(`${API_URL}/api/buckets`);
            const data = await response.json();
            if (data.buckets) {
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
                            const response = await fetch(`${API_URL}/api/content/${item.id}`, {
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

            const response = await fetch(`${API_URL}/api/content/${selectedContent.id}`, {
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

    const tabs = ['All', ...availableBuckets.map(b => b.name)];

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

    const renderContentItem = (item) => {
        let iconName = 'file-document-outline';
        let iconColor = '#6B7280';

        if (item.type === 'PDF' || item.title.endsWith('.pdf')) { iconName = 'file-pdf-box'; iconColor = '#EF4444'; }
        else if (item.type === 'Video' || item.videoUrl) { iconName = 'video'; iconColor = '#8B5CF6'; }
        else if (item.type === 'Excel' || item.title.endsWith('.xlsx')) { iconName = 'file-excel'; iconColor = '#10B981'; }

        return (
            <View key={item.id} style={styles.contentItem}>
                <View style={[styles.iconBox, { backgroundColor: iconColor + '20' }]}>
                    <MaterialCommunityIcons name={iconName} size={24} color={iconColor} />
                </View>
                <View style={styles.itemInfo}>
                    <Text style={styles.itemTitle}>{item.title}</Text>
                    <Text style={styles.itemDesc} numberOfLines={1}>{item.description}</Text>
                    <View style={styles.itemMetaRow}>
                        <Text style={styles.itemCategory}>{item.category}</Text>
                        <Text style={styles.itemDot}>•</Text>
                        <Text style={styles.itemDate}>{item.date}</Text>
                    </View>
                </View>

                {/* Actions */}
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
                                <Text style={styles.headerTitle}>Content Library</Text>
                            </View>
                            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                                <Feather name="x" size={22} color="#FFF" />
                            </TouchableOpacity>
                        </View>

                        {/* Search Bar */}
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
                                displayCategories.map(category => (
                                    <View key={category.id} style={styles.categorySection}>
                                        <View style={styles.categoryHeader}>
                                            <MaterialCommunityIcons name={category.icon || "folder"} size={20} color={category.color || "#6B7280"} />
                                            <Text style={styles.categoryTitle}>{category.name}</Text>
                                            <View style={styles.badge}>
                                                <Text style={styles.badgeText}>{category.items.length}</Text>
                                            </View>
                                        </View>
                                        {category.items.map(item => renderContentItem(item))}
                                    </View>
                                ))
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
    }
});