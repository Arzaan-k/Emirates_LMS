import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    Modal,
    TouchableOpacity,
    StyleSheet,
    FlatList,
    Switch,
    Dimensions,
    Alert,
    ActivityIndicator,
    ScrollView
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { BlurView } from 'expo-blur';
import API_URL from '../config';

const { width } = Dimensions.get('window');

export default function BulkUploadModal({ visible, onClose, onUploadComplete }) {
    const [files, setFiles] = useState([]);
    const [isPathNode, setIsPathNode] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);

    // [NEW] Bucket state
    const [courseBuckets, setCourseBuckets] = useState([]);
    const [selectedBucket, setSelectedBucket] = useState(null);
    const [loadingBuckets, setLoadingBuckets] = useState(false);

    // [NEW] Fetch buckets when modal opens
    useEffect(() => {
        if (visible) {
            fetchBuckets();
        }
    }, [visible]);

    const fetchBuckets = async () => {
        setLoadingBuckets(true);
        try {
            const res = await fetch(`${API_URL}/course-buckets`);
            const data = await res.json();
            setCourseBuckets(data);
        } catch (e) { console.error('Error fetching buckets:', e); }
        finally { setLoadingBuckets(false); }
    };

    const pickFiles = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: "video/*", // Focus on videos
                multiple: true,
                copyToCacheDirectory: true
            });

            if (result.assets) {
                // Add unique ID for reordering
                const newFiles = result.assets.map((f, i) => ({ ...f, tempId: Date.now() + i }));
                setFiles([...files, ...newFiles]);
            }
        } catch (err) {
            console.log("Pick Error", err);
        }
    };

    const moveItem = (index, direction) => {
        const newFiles = [...files];
        if (direction === 'up' && index > 0) {
            [newFiles[index], newFiles[index - 1]] = [newFiles[index - 1], newFiles[index]];
        } else if (direction === 'down' && index < newFiles.length - 1) {
            [newFiles[index], newFiles[index + 1]] = [newFiles[index + 1], newFiles[index]];
        }
        setFiles(newFiles);
    };

    const removeFile = (index) => {
        const newFiles = [...files];
        newFiles.splice(index, 1);
        setFiles(newFiles);
    };

    const handleUpload = async () => {
        if (files.length === 0) return;

        setUploading(true);
        let completed = 0;

        for (const file of files) {
            try {
                const formData = new FormData();
                formData.append('title', file.name.replace(/\.[^/.]+$/, "")); // Remove extension
                formData.append('description', "Bulk Uploaded Content");
                formData.append('authorRole', "Store Manager");
                formData.append('timestamp', new Date().toISOString());
                formData.append('isPathNode', String(isPathNode));
                if (selectedBucket) {
                    formData.append('bucket', selectedBucket); // [NEW] Add bucket if selected
                }
                formData.append('file', {
                    uri: file.uri,
                    name: file.name,
                    type: file.mimeType || 'video/mp4'
                });

                await fetch(`${API_URL}/upload`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'multipart/form-data' },
                    body: formData
                });

                completed++;
                setProgress(completed / files.length);

            } catch (error) {
                console.error("Upload failed for", file.name, error);
                Alert.alert("Upload Error", `Failed to upload ${file.name}`);
            }
        }

        setUploading(false);
        setFiles([]);
        setProgress(0);
        setSelectedBucket(null); // [NEW] Reset bucket selection
        onUploadComplete();
        Alert.alert("Success", "All files uploaded!");
        onClose();
    };

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
            <View style={styles.container}>
                {/* HEAD */}
                <View style={styles.header}>
                    <View>
                        <Text style={styles.title}>Bulk Course Upload</Text>
                        <Text style={styles.subtitle}>Upload & Curate Learning Order</Text>
                    </View>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                        <Feather name="x" size={24} color="#1F2937" />
                    </TouchableOpacity>
                </View>

                {/* CONTENT */}
                <View style={styles.content}>

                    {/* ADD FILES BTN */}
                    <TouchableOpacity style={styles.addBtn} onPress={pickFiles}>
                        <MaterialCommunityIcons name="cloud-upload-outline" size={28} color="#F59E0B" />
                        <Text style={styles.addBtnText}>Select Videos</Text>
                    </TouchableOpacity>

                    <Text style={styles.sectionLabel}>Course Bucket (Optional)</Text>
                    <View style={{ height: 50 }}>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            style={styles.bucketScroll}
                            contentContainerStyle={{ alignItems: 'center', paddingRight: 20 }}
                        >
                            <TouchableOpacity
                                onPress={() => setSelectedBucket(null)}
                                style={[
                                    styles.bucketChip,
                                    !selectedBucket && styles.bucketChipSelected
                                ]}
                            >
                                <MaterialCommunityIcons name="close-circle" size={16} color={!selectedBucket ? '#FFF' : '#6B7280'} />
                                <Text style={[styles.bucketChipText, !selectedBucket && { color: '#FFF' }]}>None</Text>
                            </TouchableOpacity>
                            {courseBuckets.map((bucket) => (
                                <TouchableOpacity
                                    key={bucket.id}
                                    onPress={() => setSelectedBucket(bucket.name)}
                                    style={[
                                        styles.bucketChip,
                                        selectedBucket === bucket.name && { backgroundColor: bucket.color, borderColor: bucket.color }
                                    ]}
                                >
                                    <MaterialCommunityIcons
                                        name={bucket.icon || 'folder'}
                                        size={16}
                                        color={selectedBucket === bucket.name ? '#FFF' : bucket.color}
                                    />
                                    <Text style={[
                                        styles.bucketChipText,
                                        selectedBucket === bucket.name && { color: '#FFF' }
                                    ]}>{bucket.name}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>

                    {/* PATH TOGGLE */}
                    <View style={styles.optionRow}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.optionTitle}>Add to Learning Path</Text>
                            <Text style={styles.optionDesc}>Automatically add these to the user's journey map in this order.</Text>
                        </View>
                        <Switch
                            value={isPathNode}
                            onValueChange={setIsPathNode}
                            trackColor={{ false: "#E5E7EB", true: "#F59E0B" }}
                        />
                    </View>

                    {/* LIST */}
                    <FlatList
                        data={files}
                        keyExtractor={item => String(item.tempId)}
                        contentContainerStyle={{ paddingBottom: 100 }}
                        renderItem={({ item, index }) => (
                            <View style={styles.fileCard}>
                                <View style={styles.orderBadge}>
                                    <Text style={styles.orderText}>{index + 1}</Text>
                                </View>
                                <View style={{ flex: 1, paddingHorizontal: 12 }}>
                                    <Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
                                    <Text style={styles.fileSize}>{(item.size / 1024 / 1024).toFixed(1)} MB</Text>
                                </View>

                                <View style={styles.actions}>
                                    <TouchableOpacity onPress={() => moveItem(index, 'up')} disabled={index === 0}>
                                        <Feather name="chevron-up" size={20} color={index === 0 ? "#E5E7EB" : "#374151"} />
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => moveItem(index, 'down')} disabled={index === files.length - 1}>
                                        <Feather name="chevron-down" size={20} color={index === files.length - 1 ? "#E5E7EB" : "#374151"} />
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => removeFile(index)} style={{ marginLeft: 8 }}>
                                        <Feather name="trash-2" size={18} color="#EF4444" />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}
                        ListEmptyComponent={
                            <View style={styles.emptyState}>
                                <MaterialCommunityIcons name="playlist-edit" size={48} color="#D1D5DB" />
                                <Text style={styles.emptyText}>No files selected</Text>
                            </View>
                        }
                    />

                </View>

                {/* FOOTER */}
                <View style={styles.footer}>
                    {uploading ? (
                        <View style={styles.uploadingBox}>
                            <ActivityIndicator color="#F59E0B" />
                            <Text style={styles.uploadingText}>Uploading... {(progress * 100).toFixed(0)}%</Text>
                        </View>
                    ) : (
                        <TouchableOpacity
                            style={[styles.uploadBtn, files.length === 0 && styles.disabledBtn]}
                            onPress={handleUpload}
                            disabled={files.length === 0}
                        >
                            <Text style={styles.uploadBtnText}>Start Bulk Upload ({files.length})</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F9FAFB' },
    header: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    title: { fontSize: 20, fontFamily: 'Poppins_700Bold', color: '#111827' },
    subtitle: { fontSize: 13, fontFamily: 'Poppins_500Medium', color: '#6B7280' },
    closeBtn: { padding: 4 },
    content: { flex: 1, padding: 20 },

    addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF7ED', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#FED7AA', borderStyle: 'dashed', marginBottom: 20 },
    addBtnText: { marginLeft: 10, fontSize: 16, fontFamily: 'Poppins_600SemiBold', color: '#F59E0B' },

    optionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFF', padding: 16, borderRadius: 16, marginBottom: 20, borderWidth: 1, borderColor: '#E5E7EB' },
    optionTitle: { fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: '#374151' },
    optionDesc: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: '#9CA3AF', marginTop: 2 },

    fileCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 12, borderRadius: 12, marginBottom: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
    orderBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
    orderText: { fontSize: 14, fontFamily: 'Poppins_700Bold', color: '#6B7280' },
    fileName: { fontSize: 14, fontFamily: 'Poppins_500Medium', color: '#374151' },
    fileSize: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: '#9CA3AF' },
    actions: { flexDirection: 'row', alignItems: 'center' },

    emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 50 },
    emptyText: { marginTop: 10, color: '#9CA3AF', fontFamily: 'Poppins_500Medium' },

    footer: { padding: 20, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#F3F4F6' },
    uploadBtn: { backgroundColor: '#F59E0B', padding: 16, borderRadius: 16, alignItems: 'center' },
    disabledBtn: { backgroundColor: '#E5E7EB' },
    uploadBtnText: { color: '#FFF', fontSize: 16, fontFamily: 'Poppins_700Bold' },

    uploadingBox: { flexDirection: 'row', alignItems: 'center', justifyContent: "center" },
    uploadingText: { marginLeft: 10, fontFamily: 'Poppins_600SemiBold', color: '#374151' },

    // [NEW] Bucket styles
    sectionLabel: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: '#374151', marginBottom: 8 },
    bucketScroll: { flexDirection: 'row', marginBottom: 16 },
    bucketChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        marginRight: 8,
        backgroundColor: '#F3F4F6',
        borderWidth: 1,
        borderColor: '#E5E7EB'
    },
    bucketChipSelected: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
    bucketChipText: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: '#4B5563', marginLeft: 4 }
});
