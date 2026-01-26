import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    Modal,
    TouchableOpacity,
    StyleSheet,
    FlatList,
    TextInput,
    Dimensions,
    Alert,
    ActivityIndicator,
    ScrollView
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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
    '#3B82F6', '#10B981', '#EF4444', '#F59E0B', '#8B5CF6',
    '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
];

export default function BucketManagementModal({ visible, onClose, onBucketsChanged }) {
    const [buckets, setBuckets] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    // Create/Edit state
    const [editMode, setEditMode] = useState(false);
    const [editingBucket, setEditingBucket] = useState(null);
    const [bucketName, setBucketName] = useState('');
    const [bucketDesc, setBucketDesc] = useState('');
    const [bucketColor, setBucketColor] = useState('#6366F1');
    const [bucketIcon, setBucketIcon] = useState('folder');

    useEffect(() => {
        if (visible) {
            fetchBuckets();
        }
    }, [visible]);

    const fetchBuckets = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/api/v1/content/buckets/all`);
            const data = await res.json();
            setBuckets(data);
        } catch (e) {
            console.error('Error fetching buckets:', e);
            Alert.alert('Error', 'Failed to load buckets');
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setEditMode(false);
        setEditingBucket(null);
        setBucketName('');
        setBucketDesc('');
        setBucketColor('#6366F1');
        setBucketIcon('folder');
    };

    const openCreateMode = () => {
        resetForm();
        setEditMode(true);
    };

    const openEditMode = (bucket) => {
        setEditingBucket(bucket);
        setBucketName(bucket.name);
        setBucketDesc(bucket.description || '');
        setBucketColor(bucket.color || '#6366F1');
        setBucketIcon(bucket.icon || 'folder');
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

            const url = editingBucket
                ? `${API_URL}/api/v1/content/buckets/all/${editingBucket.id}`
                : `${API_URL}/api/v1/content/buckets/all`;

            const method = editingBucket ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
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

    const handleDelete = async (bucketId) => {
        Alert.alert(
            'Delete Bucket',
            'Are you sure you want to delete this bucket? Courses in this bucket will become uncategorized.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const res = await fetch(`${API_URL}/api/v1/content/buckets/all/${bucketId}`, {
                                method: 'DELETE'
                            });
                            const data = await res.json();
                            if (data.status === 'success') {
                                Alert.alert('Deleted', 'Bucket removed');
                                await fetchBuckets();
                                if (onBucketsChanged) onBucketsChanged();
                            }
                        } catch (e) {
                            Alert.alert('Error', 'Failed to delete');
                        }
                    }
                }
            ]
        );
    };

    const renderBucketItem = ({ item }) => (
        <View style={styles.bucketCard}>
            <View style={[styles.bucketIcon, { backgroundColor: item.color + '20' }]}>
                <MaterialCommunityIcons name={item.icon || 'folder'} size={24} color={item.color} />
            </View>
            <View style={styles.bucketInfo}>
                <Text style={styles.bucketName}>{item.name}</Text>
                <Text style={styles.bucketDesc} numberOfLines={1}>{item.description || 'No description'}</Text>
            </View>
            <View style={styles.bucketActions}>
                <TouchableOpacity onPress={() => openEditMode(item)} style={styles.actionBtn}>
                    <Feather name="edit-2" size={18} color="#6B7280" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.actionBtn}>
                    <Feather name="trash-2" size={18} color="#EF4444" />
                </TouchableOpacity>
            </View>
        </View>
    );

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

                    {/* Content */}
                    <View style={styles.content}>
                        {editMode ? (
                            /* CREATE/EDIT FORM */
                            <ScrollView showsVerticalScrollIndicator={false}>
                                <View style={styles.formHeader}>
                                    <TouchableOpacity onPress={resetForm} style={styles.backBtn}>
                                        <Feather name="arrow-left" size={20} color="#374151" />
                                    </TouchableOpacity>
                                    <Text style={styles.formTitle}>
                                        {editingBucket ? 'Edit Bucket' : 'Create New Bucket'}
                                    </Text>
                                </View>

                                <Text style={styles.label}>Bucket Name *</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="e.g. Safety Training"
                                    value={bucketName}
                                    onChangeText={setBucketName}
                                />

                                <Text style={styles.label}>Description</Text>
                                <TextInput
                                    style={[styles.input, { height: 80 }]}
                                    placeholder="Brief description of this bucket..."
                                    value={bucketDesc}
                                    onChangeText={setBucketDesc}
                                    multiline
                                />

                                <Text style={styles.label}>Color</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.colorPicker}>
                                    {BUCKET_COLORS.map((color) => (
                                        <TouchableOpacity
                                            key={color}
                                            onPress={() => setBucketColor(color)}
                                            style={[
                                                styles.colorOption,
                                                { backgroundColor: color },
                                                bucketColor === color && styles.colorSelected
                                            ]}
                                        >
                                            {bucketColor === color && (
                                                <Feather name="check" size={16} color="#FFF" />
                                            )}
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>

                                <Text style={styles.label}>Icon</Text>
                                <View style={styles.iconGrid}>
                                    {BUCKET_ICONS.map((icon) => (
                                        <TouchableOpacity
                                            key={icon}
                                            onPress={() => setBucketIcon(icon)}
                                            style={[
                                                styles.iconOption,
                                                bucketIcon === icon && { backgroundColor: bucketColor + '20', borderColor: bucketColor }
                                            ]}
                                        >
                                            <MaterialCommunityIcons
                                                name={icon}
                                                size={22}
                                                color={bucketIcon === icon ? bucketColor : '#6B7280'}
                                            />
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                <TouchableOpacity
                                    style={[styles.saveBtn, { backgroundColor: bucketColor }]}
                                    onPress={handleSave}
                                    disabled={saving}
                                >
                                    {saving ? (
                                        <ActivityIndicator color="#FFF" />
                                    ) : (
                                        <>
                                            <Feather name="check" size={18} color="#FFF" />
                                            <Text style={styles.saveBtnText}>
                                                {editingBucket ? 'Update Bucket' : 'Create Bucket'}
                                            </Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                            </ScrollView>
                        ) : (
                            /* BUCKET LIST */
                            <>
                                <TouchableOpacity style={styles.createBtn} onPress={openCreateMode}>
                                    <Feather name="plus" size={20} color="#6366F1" />
                                    <Text style={styles.createBtnText}>Create New Bucket</Text>
                                </TouchableOpacity>

                                {loading ? (
                                    <View style={styles.loader}>
                                        <ActivityIndicator size="large" color="#6366F1" />
                                    </View>
                                ) : (
                                    <FlatList
                                        data={buckets}
                                        keyExtractor={(item) => item.id}
                                        renderItem={renderBucketItem}
                                        contentContainerStyle={{ paddingBottom: 20 }}
                                        ListEmptyComponent={
                                            <View style={styles.empty}>
                                                <MaterialCommunityIcons name="folder-open-outline" size={48} color="#D1D5DB" />
                                                <Text style={styles.emptyText}>No buckets yet</Text>
                                                <Text style={styles.emptySubtext}>Create buckets to organize your courses</Text>
                                            </View>
                                        }
                                    />
                                )}
                            </>
                        )}
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end'
    },
    container: {
        backgroundColor: '#F9FAFB',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: height * 0.85,
        minHeight: height * 0.6
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24
    },
    headerContent: {
        flexDirection: 'row',
        alignItems: 'center'
    },
    headerIcon: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10
    },
    headerTitle: {
        fontSize: 18,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF'
    },
    closeBtn: {
        backgroundColor: 'rgba(255,255,255,0.2)',
        padding: 8,
        borderRadius: 10
    },
    content: {
        flex: 1,
        padding: 20
    },
    createBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#EEF2FF',
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#C7D2FE',
        borderStyle: 'dashed',
        marginBottom: 20
    },
    createBtnText: {
        marginLeft: 8,
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
        color: '#6366F1'
    },
    bucketCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        padding: 16,
        borderRadius: 12,
        marginBottom: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2
    },
    bucketIcon: {
        width: 44,
        height: 44,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center'
    },
    bucketInfo: {
        flex: 1,
        marginLeft: 12
    },
    bucketName: {
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
        color: '#1F2937'
    },
    bucketDesc: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
        marginTop: 2
    },
    bucketActions: {
        flexDirection: 'row'
    },
    actionBtn: {
        padding: 8,
        marginLeft: 4
    },
    loader: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center'
    },
    empty: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 40
    },
    emptyText: {
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
        color: '#9CA3AF',
        marginTop: 12
    },
    emptySubtext: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        color: '#D1D5DB',
        marginTop: 4
    },
    // Form styles
    formHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20
    },
    backBtn: {
        padding: 8,
        marginRight: 10
    },
    formTitle: {
        fontSize: 18,
        fontFamily: 'Poppins_700Bold',
        color: '#1F2937'
    },
    label: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
        color: '#374151',
        marginBottom: 8,
        marginTop: 16
    },
    input: {
        backgroundColor: '#FFF',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 12,
        padding: 14,
        fontSize: 15,
        fontFamily: 'Poppins_400Regular',
        color: '#1F2937'
    },
    colorPicker: {
        flexDirection: 'row',
        marginBottom: 10
    },
    colorOption: {
        width: 36,
        height: 36,
        borderRadius: 18,
        marginRight: 10,
        justifyContent: 'center',
        alignItems: 'center'
    },
    colorSelected: {
        borderWidth: 3,
        borderColor: '#FFF',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 4
    },
    iconGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginBottom: 20
    },
    iconOption: {
        width: 44,
        height: 44,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 8,
        marginBottom: 8,
        backgroundColor: '#F3F4F6',
        borderWidth: 2,
        borderColor: 'transparent'
    },
    saveBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        borderRadius: 12,
        marginTop: 10,
        marginBottom: 30
    },
    saveBtnText: {
        marginLeft: 8,
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF'
    }
});
