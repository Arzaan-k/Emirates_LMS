import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    Modal,
    TouchableOpacity,
    StyleSheet,
    TextInput,
    Dimensions,
    Alert,
    ActivityIndicator,
    ScrollView,
    Switch
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import API_URL from '../config';

const { width, height } = Dimensions.get('window');

// Available icons for buckets
const BUCKET_ICONS = [
    'folder', 'book-open-variant', 'coffee', 'shield-check', 'account-heart',
    'cog', 'fire', 'star', 'lightbulb', 'school', 'food', 'medical-bag',
    'wrench', 'chart-line', 'account-group', 'certificate'
];

// Available colors for buckets
const BUCKET_COLORS = [
    '#3B82F6', '#10B981', '#EF4444', '#D71A21', '#8B5CF6',
    '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
];

export default function BucketManagementModal({ visible, onClose, onBucketsChanged }) {
    const [buckets, setBuckets] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [expandedBuckets, setExpandedBuckets] = useState(new Set());

    // Create/Edit state
    const [editMode, setEditMode] = useState(false);
    const [editingBucket, setEditingBucket] = useState(null);
    const [bucketName, setBucketName] = useState('');
    const [bucketDesc, setBucketDesc] = useState('');
    const [bucketColor, setBucketColor] = useState('#6366F1');
    const [bucketIcon, setBucketIcon] = useState('folder');
    const [parentBucketId, setParentBucketId] = useState(null);

    // Delete confirmation modal state
    const [deleteModalVisible, setDeleteModalVisible] = useState(false);
    const [bucketToDelete, setBucketToDelete] = useState(null);
    const [bucketContents, setBucketContents] = useState([]);
    const [deleteContents, setDeleteContents] = useState(false);
    const [loadingContents, setLoadingContents] = useState(false);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        if (visible) {
            fetchBuckets();
        }
    }, [visible]);

    const fetchBuckets = async () => {
        setLoading(true);
        try {
            const token = await AsyncStorage.getItem('userToken');
            const res = await fetch(`${API_URL}/api/v1/content/buckets/all`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            setBuckets(data);
        } catch (e) {
            console.error('Error fetching buckets:', e);
            Alert.alert('Error', 'Failed to load buckets');
        } finally {
            setLoading(false);
        }
    };

    // Build hierarchical tree structure
    const buildBucketTree = () => {
        const bucketMap = {};
        const roots = [];

        // Create a map of all buckets
        buckets.forEach(bucket => {
            bucketMap[bucket.id] = { ...bucket, children: [] };
        });

        // Build the tree
        buckets.forEach(bucket => {
            if (bucket.parent_bucket_id && bucketMap[bucket.parent_bucket_id]) {
                bucketMap[bucket.parent_bucket_id].children.push(bucketMap[bucket.id]);
            } else {
                roots.push(bucketMap[bucket.id]);
            }
        });

        return roots;
    };

    const toggleExpand = (bucketId) => {
        setExpandedBuckets(prev => {
            const newSet = new Set(prev);
            if (newSet.has(bucketId)) {
                newSet.delete(bucketId);
            } else {
                newSet.add(bucketId);
            }
            return newSet;
        });
    };

    const resetForm = () => {
        setEditMode(false);
        setEditingBucket(null);
        setBucketName('');
        setBucketDesc('');
        setBucketColor('#6366F1');
        setBucketIcon('folder');
        setParentBucketId(null);
    };

    const openCreateMode = (parentBucket = null) => {
        resetForm();
        setParentBucketId(parentBucket?.id || null);
        setEditMode(true);
    };

    const openEditMode = (bucket) => {
        setEditingBucket(bucket);
        setBucketName(bucket.name);
        setBucketDesc(bucket.description || '');
        setBucketColor(bucket.color || '#6366F1');
        setBucketIcon(bucket.icon || 'folder');
        setParentBucketId(bucket.parent_bucket_id || null);
        setEditMode(true);
    };

    const handleSave = async () => {
        if (!bucketName.trim()) {
            Alert.alert('Missing', 'Please enter a bucket name');
            return;
        }

        setSaving(true);
        try {
            const formData = new FormData();
            formData.append('name', bucketName);
            formData.append('description', bucketDesc);
            formData.append('color', bucketColor);
            formData.append('icon', bucketIcon);
            if (parentBucketId) {
                formData.append('parent_bucket_id', parentBucketId);
            }

            const url = editingBucket
                ? `${API_URL}/api/v1/content/buckets/${editingBucket.id}`
                : `${API_URL}/api/v1/content/buckets`;

            const method = editingBucket ? 'PUT' : 'POST';
            const token = await AsyncStorage.getItem('userToken');

            const res = await fetch(url, {
                method,
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            const data = await res.json();
            if (data.status === 'success') {
                Alert.alert('Success', editingBucket ? 'Bucket updated!' : 'Bucket created!');
                await fetchBuckets();
                resetForm();
                if (onBucketsChanged) onBucketsChanged();
            } else {
                Alert.alert('Error', 'Failed to save bucket');
            }
        } catch (e) {
            console.error('Save error:', e);
            Alert.alert('Error', 'Network error');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (bucket) => {
        setBucketToDelete(bucket);
        setDeleteContents(false); // Default to keeping files (safe default)
        setLoadingContents(true);
        setDeleteModalVisible(true);

        try {
            const token = await AsyncStorage.getItem('userToken');
            const res = await fetch(`${API_URL}/api/v1/content/buckets/${bucket.id}/contents`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setBucketContents(data);
            } else {
                setBucketContents([]);
            }
        } catch (e) {
            console.error('Error fetching bucket contents:', e);
            setBucketContents([]);
        } finally {
            setLoadingContents(false);
        }
    };

    const confirmDelete = async () => {
        if (!bucketToDelete) return;

        setDeleting(true);
        setDeleting(true);
        try {
            const token = await AsyncStorage.getItem('userToken');
            const res = await fetch(`${API_URL}/api/v1/content/buckets/${bucketToDelete.id}?delete_contents=${deleteContents}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.status === 'success') {
                setDeleteModalVisible(false);
                setBucketToDelete(null);
                Alert.alert('Success', 'Bucket deleted successfully');
                await fetchBuckets();
                if (onBucketsChanged) onBucketsChanged();
            } else {
                Alert.alert('Error', 'Failed to delete bucket');
            }
        } catch (e) {
            console.error('Delete error:', e);
            Alert.alert('Error', 'Network error');
        } finally {
            setDeleting(false);
        }
    };

    const renderBucketTree = (bucket, level = 0) => {
        const isExpanded = expandedBuckets.has(bucket.id);
        const hasChildren = bucket.children && bucket.children.length > 0;

        return (
            <View key={bucket.id} style={{ marginLeft: level * 20 }}>
                <View style={styles.bucketCard}>
                    {/* Expand/Collapse Button */}
                    {hasChildren && (
                        <TouchableOpacity
                            onPress={() => toggleExpand(bucket.id)}
                            style={styles.expandBtn}
                        >
                            <Feather
                                name={isExpanded ? 'chevron-down' : 'chevron-right'}
                                size={18}
                                color="#6B7280"
                            />
                        </TouchableOpacity>
                    )}

                    {/* Bucket Icon */}
                    <View style={[styles.bucketIcon, { backgroundColor: bucket.color + '20' }]}>
                        <MaterialCommunityIcons
                            name={bucket.icon || 'folder'}
                            size={24}
                            color={bucket.color}
                        />
                    </View>

                    {/* Bucket Info */}
                    <View style={styles.bucketInfo}>
                        <Text style={styles.bucketName}>{bucket.name}</Text>
                        <Text style={styles.bucketDesc} numberOfLines={1}>
                            {bucket.description || 'No description'}
                        </Text>
                    </View>

                    {/* Actions */}
                    <View style={styles.bucketActions}>
                        <TouchableOpacity
                            onPress={() => openCreateMode(bucket)}
                            style={styles.actionBtn}
                        >
                            <Feather name="plus" size={18} color="#10B981" />
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => openEditMode(bucket)}
                            style={styles.actionBtn}
                        >
                            <Feather name="edit-2" size={18} color="#6B7280" />
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => handleDelete(bucket)}
                            style={styles.actionBtn}
                        >
                            <Feather name="trash-2" size={18} color="#EF4444" />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Render Children */}
                {hasChildren && isExpanded && (
                    <View>
                        {bucket.children.map(child => renderBucketTree(child, level + 1))}
                    </View>
                )}
            </View>
        );
    };

    const getFlatBucketList = () => {
        const flatList = [];
        const traverse = (buckets, parentName = '') => {
            buckets.forEach(bucket => {
                const fullPath = parentName ? `${parentName} > ${bucket.name}` : bucket.name;
                flatList.push({ ...bucket, fullPath });
                if (bucket.children && bucket.children.length > 0) {
                    traverse(bucket.children, fullPath);
                }
            });
        };
        traverse(buildBucketTree());
        return flatList;
    };

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View style={styles.overlay}>
                <View style={styles.container}>
                    {/* Header */}
                    <LinearGradient
                        colors={['#6366F1', '#8B5CF6']}
                        style={styles.header}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                    >
                        <View style={styles.headerContent}>
                            <View style={styles.headerIcon}>
                                <MaterialCommunityIcons name="folder-multiple" size={20} color="#FFF" />
                            </View>
                            <Text style={styles.headerTitle}>Manage Course Buckets</Text>
                        </View>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <Feather name="x" size={22} color="#FFF" />
                        </TouchableOpacity>
                    </LinearGradient>

                    {!editMode ? (
                        <>
                            {/* Create New Button */}
                            <TouchableOpacity
                                style={styles.createBtn}
                                onPress={() => openCreateMode()}
                            >
                                <Feather name="plus" size={20} color="#6366F1" />
                                <Text style={styles.createBtnText}>Create New Bucket</Text>
                            </TouchableOpacity>

                            {/* Buckets List */}
                            {loading ? (
                                <ActivityIndicator size="large" color="#6366F1" style={{ marginTop: 40 }} />
                            ) : (
                                <ScrollView style={styles.bucketsContainer}>
                                    {buildBucketTree().map(bucket => renderBucketTree(bucket))}
                                </ScrollView>
                            )}
                        </>
                    ) : (
                        <>
                            {/* Edit/Create Form */}
                            <ScrollView style={styles.formContainer}>
                                <Text style={styles.formTitle}>
                                    {editingBucket ? 'Edit Bucket' : 'Create New Bucket'}
                                </Text>

                                {/* Parent Bucket Selection */}
                                <Text style={styles.label}>Parent Bucket (Optional)</Text>
                                <View style={styles.pickerContainer}>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                        <TouchableOpacity
                                            style={[
                                                styles.parentOption,
                                                !parentBucketId && styles.parentOptionActive
                                            ]}
                                            onPress={() => setParentBucketId(null)}
                                        >
                                            <Text style={[
                                                styles.parentOptionText,
                                                !parentBucketId && styles.parentOptionTextActive
                                            ]}>
                                                None (Root Level)
                                            </Text>
                                        </TouchableOpacity>
                                        {getFlatBucketList()
                                            .filter(b => b.id !== editingBucket?.id)
                                            .map(bucket => (
                                                <TouchableOpacity
                                                    key={bucket.id}
                                                    style={[
                                                        styles.parentOption,
                                                        parentBucketId === bucket.id && styles.parentOptionActive
                                                    ]}
                                                    onPress={() => setParentBucketId(bucket.id)}
                                                >
                                                    <Text style={[
                                                        styles.parentOptionText,
                                                        parentBucketId === bucket.id && styles.parentOptionTextActive
                                                    ]}>
                                                        {bucket.fullPath}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                    </ScrollView>
                                </View>

                                {/* Bucket Name */}
                                <Text style={styles.label}>Bucket Name *</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="Enter bucket name"
                                    value={bucketName}
                                    onChangeText={setBucketName}
                                />

                                {/* Description */}
                                <Text style={styles.label}>Description</Text>
                                <TextInput
                                    style={[styles.input, styles.textArea]}
                                    placeholder="Enter description"
                                    value={bucketDesc}
                                    onChangeText={setBucketDesc}
                                    multiline
                                    numberOfLines={3}
                                />

                                {/* Icon Selection */}
                                <Text style={styles.label}>Icon</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.iconScroll}>
                                    {BUCKET_ICONS.map(icon => (
                                        <TouchableOpacity
                                            key={icon}
                                            style={[
                                                styles.iconOption,
                                                bucketIcon === icon && styles.iconOptionActive
                                            ]}
                                            onPress={() => setBucketIcon(icon)}
                                        >
                                            <MaterialCommunityIcons name={icon} size={24} color={bucketIcon === icon ? '#6366F1' : '#9CA3AF'} />
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>

                                {/* Color Selection */}
                                <Text style={styles.label}>Color</Text>
                                <View style={styles.colorGrid}>
                                    {BUCKET_COLORS.map(color => (
                                        <TouchableOpacity
                                            key={color}
                                            style={[
                                                styles.colorOption,
                                                { backgroundColor: color },
                                                bucketColor === color && styles.colorOptionActive
                                            ]}
                                            onPress={() => setBucketColor(color)}
                                        >
                                            {bucketColor === color && (
                                                <Feather name="check" size={16} color="#FFF" />
                                            )}
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                {/* Action Buttons */}
                                <View style={styles.formActions}>
                                    <TouchableOpacity
                                        style={styles.cancelBtn}
                                        onPress={resetForm}
                                        disabled={saving}
                                    >
                                        <Text style={styles.cancelBtnText}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                                        onPress={handleSave}
                                        disabled={saving}
                                    >
                                        {saving ? (
                                            <ActivityIndicator size="small" color="#FFF" />
                                        ) : (
                                            <>
                                                <Feather name="save" size={18} color="#FFF" />
                                                <Text style={styles.saveBtnText}>Save</Text>
                                            </>
                                        )}
                                    </TouchableOpacity>
                                </View>
                            </ScrollView>
                        </>
                    )}
                </View>
            </View>

            {/* Delete Confirmation Modal */}
            <Modal visible={deleteModalVisible} animationType="fade" transparent={true}>
                <View style={styles.deleteModalOverlay}>
                    <View style={styles.deleteModalContent}>
                        <View style={styles.deleteIconContainer}>
                            <Feather name="alert-circle" size={64} color="#EF4444" />
                        </View>

                        <Text style={styles.deleteTitle}>Delete Bucket?</Text>
                        <Text style={styles.deleteMessage}>
                            Are you sure you want to delete "{bucketToDelete?.name}"?
                        </Text>

                        {loadingContents ? (
                            <ActivityIndicator size="small" color="#6366F1" style={{ marginVertical: 10 }} />
                        ) : (
                            <View style={styles.contentsPreview}>
                                <Text style={styles.contentsCount}>
                                    This folder contains <Text style={{ fontWeight: '700' }}>{bucketContents.length}</Text> files.
                                </Text>

                                {bucketContents.length > 0 && (
                                    <>
                                        <ScrollView style={styles.fileList} nestedScrollEnabled>
                                            {bucketContents.slice(0, 5).map(item => (
                                                <View key={item.id} style={styles.fileItem}>
                                                    <Feather name="file-text" size={14} color="#6B7280" />
                                                    <Text style={styles.fileName} numberOfLines={1}>{item.title}</Text>
                                                </View>
                                            ))}
                                            {bucketContents.length > 5 && (
                                                <Text style={styles.moreFiles}>+ {bucketContents.length - 5} more files</Text>
                                            )}
                                        </ScrollView>

                                        <View style={styles.deleteOptionContainer}>
                                            <View style={styles.switchRow}>
                                                <Switch
                                                    value={deleteContents}
                                                    onValueChange={setDeleteContents}
                                                    trackColor={{ false: '#D1D5DB', true: '#EF4444' }}
                                                    thumbColor={deleteContents ? '#FFF' : '#F9FAFB'}
                                                />
                                                <Text style={[styles.deleteOptionText, deleteContents && styles.deleteOptionTextActive]}>
                                                    Also delete these files permanently?
                                                </Text>
                                            </View>
                                            <Text style={styles.deleteWarning}>
                                                {deleteContents
                                                    ? "⚠️ Files will be permanently deleted!"
                                                    : "Files will be moved to 'Uncategorized'."}
                                            </Text>
                                        </View>
                                    </>
                                )}
                            </View>
                        )}

                        <View style={styles.deleteFooter}>
                            <TouchableOpacity
                                style={styles.deleteCancelBtn}
                                onPress={() => {
                                    setDeleteModalVisible(false);
                                    setBucketToDelete(null);
                                }}
                                disabled={deleting}
                            >
                                <Text style={styles.deleteCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.deleteConfirmBtn, deleting && styles.deleteConfirmBtnDisabled]}
                                onPress={confirmDelete}
                                disabled={deleting}
                            >
                                {deleting ? (
                                    <ActivityIndicator size="small" color="#FFF" />
                                ) : (
                                    <Text style={styles.deleteConfirmText}>
                                        {deleteContents ? "Delete All" : "Delete Folder Only"}
                                    </Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    container: {
        width: '90%',
        maxWidth: 700,
        maxHeight: '90%',
        backgroundColor: '#FFF',
        borderRadius: 16,
        overflow: 'hidden',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
    },
    headerContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    headerIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '700',
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
    createBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        margin: 20,
        padding: 16,
        backgroundColor: '#EEF2FF',
        borderRadius: 12,
        borderWidth: 2,
        borderColor: '#6366F1',
        borderStyle: 'dashed',
    },
    createBtnText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#6366F1',
    },
    bucketsContainer: {
        flex: 1,
        padding: 20,
    },
    bucketCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        backgroundColor: '#F9FAFB',
        borderRadius: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    expandBtn: {
        width: 32,
        height: 32,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 8,
    },
    bucketIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    bucketInfo: {
        flex: 1,
    },
    bucketName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#111827',
        marginBottom: 2,
    },
    bucketDesc: {
        fontSize: 13,
        color: '#6B7280',
    },
    bucketActions: {
        flexDirection: 'row',
        gap: 8,
    },
    actionBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#FFF',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    formContainer: {
        flex: 1,
        padding: 20,
    },
    formTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111827',
        marginBottom: 20,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        color: '#374151',
        marginBottom: 8,
        marginTop: 16,
    },
    input: {
        borderWidth: 1,
        borderColor: '#D1D5DB',
        borderRadius: 8,
        padding: 12,
        fontSize: 15,
        color: '#111827',
        backgroundColor: '#F9FAFB',
    },
    textArea: {
        height: 80,
        textAlignVertical: 'top',
    },
    pickerContainer: {
        marginBottom: 8,
    },
    parentOption: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 8,
        backgroundColor: '#F3F4F6',
        marginRight: 8,
        borderWidth: 2,
        borderColor: '#E5E7EB',
    },
    parentOptionActive: {
        backgroundColor: '#EEF2FF',
        borderColor: '#6366F1',
    },
    parentOptionText: {
        fontSize: 14,
        color: '#6B7280',
        fontWeight: '500',
    },
    parentOptionTextActive: {
        color: '#6366F1',
        fontWeight: '600',
    },
    iconScroll: {
        marginBottom: 8,
    },
    iconOption: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#F3F4F6',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
        borderWidth: 2,
        borderColor: '#E5E7EB',
    },
    iconOptionActive: {
        backgroundColor: '#EEF2FF',
        borderColor: '#6366F1',
    },
    colorGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 8,
    },
    colorOption: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 3,
        borderColor: 'transparent',
    },
    colorOptionActive: {
        borderColor: '#FFF',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 4,
    },
    formActions: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 24,
        marginBottom: 20,
    },
    cancelBtn: {
        flex: 1,
        padding: 14,
        borderRadius: 10,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
    },
    cancelBtnText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#6B7280',
    },
    saveBtn: {
        flex: 1,
        padding: 14,
        borderRadius: 10,
        backgroundColor: '#6366F1',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    saveBtnDisabled: {
        backgroundColor: '#9CA3AF',
    },
    saveBtnText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#FFF',
    },

    // Delete Modal Styles
    deleteModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    deleteModalContent: {
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
    deleteIconContainer: {
        marginBottom: 20,
    },
    deleteTitle: {
        fontSize: 22,
        fontWeight: '700',
        color: '#111827',
        marginBottom: 12,
        textAlign: 'center',
    },
    deleteMessage: {
        fontSize: 16,
        fontWeight: '600',
        color: '#374151',
        marginBottom: 8,
        textAlign: 'center',
    },
    deleteSubMessage: {
        fontSize: 14,
        color: '#6B7280',
        marginBottom: 24,
        textAlign: 'center',
        lineHeight: 20,
    },
    deleteFooter: {
        flexDirection: 'row',
        gap: 12,
        width: '100%',
    },
    deleteCancelBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
    },
    deleteCancelText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#6B7280',
    },
    deleteConfirmBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: '#EF4444',
        alignItems: 'center',
        shadowColor: '#EF4444',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    deleteConfirmBtnDisabled: {
        backgroundColor: '#9CA3AF',
    },
    deleteConfirmText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#FFF',
    },
    contentsPreview: {
        width: '100%',
        backgroundColor: '#F9FAFB',
        borderRadius: 12,
        padding: 16,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    contentsCount: {
        fontSize: 14,
        color: '#374151',
        marginBottom: 12,
        textAlign: 'center',
    },
    fileList: {
        maxHeight: 150,
        marginBottom: 16,
    },
    fileItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
        gap: 8,
    },
    fileName: {
        fontSize: 13,
        color: '#4B5563',
        flex: 1,
    },
    moreFiles: {
        fontSize: 12,
        color: '#6B7280',
        fontStyle: 'italic',
        marginTop: 8,
        textAlign: 'center',
    },
    deleteOptionContainer: {
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
    },
    switchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 8,
    },
    deleteOptionText: {
        fontSize: 13,
        color: '#4B5563',
        flex: 1,
    },
    deleteOptionTextActive: {
        color: '#EF4444',
        fontWeight: '600',
    },
    deleteWarning: {
        fontSize: 12,
        color: '#DC2626', // Red-600
        textAlign: 'center',
        backgroundColor: '#FEF2F2', // Red-50
        padding: 8,
        borderRadius: 6,
        overflow: 'hidden',
    },
});
