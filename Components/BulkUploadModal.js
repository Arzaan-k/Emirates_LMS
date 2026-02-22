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
    ScrollView,
    Platform
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { BlurView } from 'expo-blur';
import API_URL from '../config';

const { width } = Dimensions.get('window');

export default function BulkUploadModal({ visible, onClose, onUploadComplete }) {
    const [files, setFiles] = useState([]);
    const [isPathNode, setIsPathNode] = useState(true); // Default to true for bulk uploads to learning path
    const [isSelfLearning, setIsSelfLearning] = useState(false); // NEW: Self Learning toggle
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);

    // Bucket state
    const [courseBuckets, setCourseBuckets] = useState([]);
    const [selectedBucket, setSelectedBucket] = useState(null);
    const [loadingBuckets, setLoadingBuckets] = useState(false);

    // Impact Existing Users Progress
    const [impactExisting, setImpactExisting] = useState(true);
    const [affectedUsers, setAffectedUsers] = useState(null);
    const [loadingAffectedUsers, setLoadingAffectedUsers] = useState(false);
    const [showAffectedUsersModal, setShowAffectedUsersModal] = useState(false);
    const [selectedImpactedUsers, setSelectedImpactedUsers] = useState(new Set());

    // Fetch buckets when modal opens
    useEffect(() => {
        if (visible) {
            fetchBuckets();
        }
    }, [visible]);

    // Fetch affected users when learning path type changes
    useEffect(() => {
        if (visible && isPathNode) {
            const learningPathType = isSelfLearning ? 'self_learning' : 'career_progression';
            fetchAffectedUsers(learningPathType);
        }
    }, [visible, isSelfLearning, isPathNode]);

    const fetchAffectedUsers = async (learningPathType) => {
        setLoadingAffectedUsers(true);
        try {
            const token = await AsyncStorage.getItem('userToken');
            const response = await fetch(
                `${API_URL}/api/v1/self-learning/admin/learning-path/${learningPathType}/affected-users`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                    },
                }
            );
            if (response.ok) {
                const data = await response.json();
                setAffectedUsers(data);
                // By default, select all completed users when Impact mode is on
                if (data.completed_users && impactExisting) {
                    setSelectedImpactedUsers(new Set(data.completed_users.map(u => u.email)));
                }
            }
        } catch (error) {
            console.error('Error fetching affected users:', error);
        } finally {
            setLoadingAffectedUsers(false);
        }
    };

    // Toggle individual user selection for impact
    const toggleUserImpact = (email) => {
        setSelectedImpactedUsers(prev => {
            const newSet = new Set(prev);
            if (newSet.has(email)) {
                newSet.delete(email);
            } else {
                newSet.add(email);
            }
            return newSet;
        });
    };

    // Select all completed users for impact
    const selectAllCompletedUsers = () => {
        if (affectedUsers?.completed_users) {
            setSelectedImpactedUsers(new Set(affectedUsers.completed_users.map(u => u.email)));
        }
    };

    // Deselect all users (no one will be impacted)
    const deselectAllUsers = () => {
        setSelectedImpactedUsers(new Set());
    };

    const fetchBuckets = async () => {
        setLoadingBuckets(true);
        try {
            const res = await fetch(`${API_URL}/api/v1/content/buckets/all`);
            const data = await res.json();
            setCourseBuckets(data);
        } catch (e) { console.error('Error fetching buckets:', e); }
        finally { setLoadingBuckets(false); }
    };

    const pickFiles = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: "*/*", // Allow all file types
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
        if (!selectedBucket) {
            Alert.alert("Required", "Please select a Course Bucket (Category).");
            return;
        }

        setUploading(true);
        let completed = 0;
        let failed = 0;
        const failedFiles = [];

        // Determine learning path type based on toggle
        const learningPathType = isSelfLearning ? 'self_learning' : 'career_progression';

        // Helper function to delay between uploads
        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        // Get the selected bucket name (not just ID)
        const selectedBucketData = courseBuckets.find(b => b.id === selectedBucket);
        const bucketName = selectedBucketData?.name || "General";

        // Helper function to upload a single file with retries
        const uploadWithRetry = async (file, maxRetries = 3) => {
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    const formData = new FormData();
                    formData.append('title', file.name.replace(/\.[^/.]+$/, "")); // Remove extension
                    formData.append('description', "Bulk Uploaded Content");
                    formData.append('category', bucketName); // Use bucket NAME, not ID
                    formData.append('is_path_node', String(isPathNode));
                    formData.append('learning_path_type', learningPathType);
                    formData.append('impacts_existing_progress', impactExisting ? 'true' : 'false');
                    formData.append('impacted_users', JSON.stringify(Array.from(selectedImpactedUsers)));
                    if (selectedBucket) {
                        formData.append('bucket', selectedBucket); // Use bucket ID here
                    }

                    // Handle file differently for web vs mobile
                    if (Platform.OS === 'web') {
                        // On web, fetch the blob from the uri and create a proper File object
                        const response = await fetch(file.uri);
                        const blob = await response.blob();
                        const webFile = new File([blob], file.name, { type: file.mimeType || 'application/octet-stream' });
                        formData.append('file', webFile);
                    } else {
                        // On mobile, use the React Native format
                        formData.append('file', {
                            uri: file.uri,
                            name: file.name,
                            type: file.mimeType || 'application/octet-stream'
                        });
                    }

                    // Use timeout controller for large files (5 minutes timeout per file)
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minute timeout

                    console.log(`[Upload] Attempt ${attempt}/${maxRetries} for ${file.name} to bucket: ${bucketName}`);

                    // Use universal upload endpoint
                    const response = await fetch(`${API_URL}/api/v1/content/`, {
                        method: 'POST',
                        body: formData,
                        signal: controller.signal,
                    });

                    clearTimeout(timeoutId);

                    if (!response.ok) {
                        const errorText = await response.text();
                        throw new Error(`Server error: ${response.status} - ${errorText}`);
                    }

                    console.log(`[Upload] Success: ${file.name}`);
                    return true; // Success

                } catch (error) {
                    console.error(`[Upload] Attempt ${attempt} failed for ${file.name}:`, error.message);

                    if (attempt < maxRetries) {
                        // Wait before retrying (exponential backoff: 2s, 4s, 8s...)
                        const waitTime = Math.pow(2, attempt) * 1000;
                        console.log(`[Upload] Retrying in ${waitTime / 1000}s...`);
                        await delay(waitTime);
                    } else {
                        // All retries failed
                        return false;
                    }
                }
            }
            return false;
        };

        // Upload files sequentially with delays
        for (let i = 0; i < files.length; i++) {
            const file = files[i];

            // Add a small delay between consecutive uploads to prevent overwhelming the server
            if (i > 0) {
                await delay(1000); // 1 second delay between files
            }

            const success = await uploadWithRetry(file);

            if (success) {
                completed++;
            } else {
                failed++;
                failedFiles.push(file.name);
            }

            setProgress((completed + failed) / files.length);
        }

        // Show appropriate message based on results
        const uploadedPathName = isSelfLearning ? 'Self Learning' : 'Career Progression';

        setUploading(false);
        setFiles([]);
        setProgress(0);
        setSelectedBucket(null);
        setIsSelfLearning(false);
        setIsPathNode(true);
        setImpactExisting(true);
        setAffectedUsers(null);
        setShowAffectedUsersModal(false);
        setSelectedImpactedUsers(new Set());

        if (failed === 0) {
            Alert.alert("Success! 🎉", `All ${completed} files uploaded to ${uploadedPathName} path!`);
            onUploadComplete();
            onClose();
        } else if (completed > 0) {
            Alert.alert(
                "Partial Success",
                `${completed} files uploaded successfully.\n${failed} files failed:\n${failedFiles.join('\n')}`,
                [{ text: "OK", onPress: () => { onUploadComplete(); onClose(); } }]
            );
        } else {
            Alert.alert("Upload Failed", `All uploads failed. Please check your network connection and try again.`);
        }
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
                        <Text style={styles.addBtnText}>Select Files</Text>
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
                                    onPress={() => setSelectedBucket(selectedBucket === bucket.id ? null : bucket.id)}
                                    style={[
                                        styles.bucketChip,
                                        selectedBucket === bucket.id && { backgroundColor: bucket.color, borderColor: bucket.color }
                                    ]}
                                >
                                    <MaterialCommunityIcons
                                        name={bucket.icon || 'folder'}
                                        size={16}
                                        color={selectedBucket === bucket.id ? '#FFF' : bucket.color}
                                    />
                                    <Text style={[
                                        styles.bucketChipText,
                                        selectedBucket === bucket.id && { color: '#FFF' }
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

                    {/* SELF LEARNING TOGGLE - NEW - Only visible if Path is enabled */}
                    {isPathNode && (
                        <View style={[styles.optionRow, { borderColor: isSelfLearning ? '#10B981' : '#E5E7EB', backgroundColor: isSelfLearning ? '#F0FDF4' : '#FFF' }]}>
                            <View style={{ flex: 1 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <MaterialCommunityIcons
                                        name="school"
                                        size={18}
                                        color={isSelfLearning ? '#10B981' : '#6B7280'}
                                        style={{ marginRight: 6 }}
                                    />
                                    <Text style={[styles.optionTitle, isSelfLearning && { color: '#047857' }]}>Self Learning Path</Text>
                                </View>
                                <Text style={styles.optionDesc}>
                                    {isSelfLearning
                                        ? "Courses for mandatory onboarding (Basics, SOPs, Compliance)"
                                        : "Enable to add to Self Learning path instead of Career Progression"}
                                </Text>
                            </View>
                            <Switch
                                value={isSelfLearning}
                                onValueChange={setIsSelfLearning}
                                trackColor={{ false: "#E5E7EB", true: "#10B981" }}
                                thumbColor={isSelfLearning ? "#059669" : "#f4f3f4"}
                            />
                        </View>
                    )}

                    {/* PATH TYPE INDICATOR */}
                    {isPathNode && (
                        <View style={[styles.pathIndicator, { backgroundColor: isSelfLearning ? '#ECFDF5' : '#FFF7ED', borderColor: isSelfLearning ? '#A7F3D0' : '#FED7AA' }]}>
                            <MaterialCommunityIcons
                                name={isSelfLearning ? "book-education" : "trending-up"}
                                size={20}
                                color={isSelfLearning ? '#10B981' : '#F59E0B'}
                            />
                            <Text style={[styles.pathIndicatorText, { color: isSelfLearning ? '#047857' : '#D97706' }]}>
                                {isSelfLearning ? '📚 Self Learning Path' : '🚀 Career Progression Path'}
                            </Text>
                        </View>
                    )}

                    {/* IMPACT EXISTING USERS SETTING */}
                    {isPathNode && (
                        <View style={styles.impactSettingContainer}>
                            <View style={styles.impactSettingHeader}>
                                <MaterialIcons name="info-outline" size={18} color="#3B82F6" />
                                <Text style={styles.impactSettingTitle}>Impact Existing Users' Progress</Text>
                            </View>
                            <Text style={styles.impactSettingDesc}>
                                Choose whether new courses affect existing users who have already completed this path.
                            </Text>
                            <View style={styles.impactButtons}>
                                <TouchableOpacity
                                    style={[
                                        styles.impactButton,
                                        impactExisting && styles.impactButtonActive
                                    ]}
                                    onPress={() => {
                                        setImpactExisting(true);
                                        if (affectedUsers?.completed_users) {
                                            setSelectedImpactedUsers(new Set(affectedUsers.completed_users.map(u => u.email)));
                                        }
                                    }}
                                >
                                    <MaterialIcons name="group" size={18} color={impactExisting ? '#FFF' : '#6B7280'} />
                                    <View style={styles.impactButtonTextContainer}>
                                        <Text style={[styles.impactButtonTitle, impactExisting && styles.impactButtonTitleActive]}>
                                            Impact All
                                        </Text>
                                        <Text style={[styles.impactButtonSubtitle, impactExisting && styles.impactButtonSubtitleActive]}>
                                            Users must complete new courses
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[
                                        styles.impactButton,
                                        !impactExisting && styles.impactButtonActiveGreen
                                    ]}
                                    onPress={() => {
                                        setImpactExisting(false);
                                        setSelectedImpactedUsers(new Set());
                                    }}
                                >
                                    <MaterialIcons name="group-off" size={18} color={!impactExisting ? '#FFF' : '#6B7280'} />
                                    <View style={styles.impactButtonTextContainer}>
                                        <Text style={[styles.impactButtonTitle, !impactExisting && styles.impactButtonTitleActive]}>
                                            No Impact
                                        </Text>
                                        <Text style={[styles.impactButtonSubtitle, !impactExisting && styles.impactButtonSubtitleActive]}>
                                            Users who completed stay at 100%
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            </View>

                            {/* Affected Users Preview */}
                            {loadingAffectedUsers ? (
                                <View style={styles.affectedUsersLoading}>
                                    <ActivityIndicator size="small" color="#3B82F6" />
                                    <Text style={styles.affectedUsersLoadingText}>Loading user data...</Text>
                                </View>
                            ) : affectedUsers && (
                                <View style={styles.affectedUsersPreview}>
                                    <View style={styles.affectedUsersSummary}>
                                        <View style={styles.affectedUserBox}>
                                            <View style={[styles.affectedUserIcon, { backgroundColor: impactExisting ? '#FEE2E2' : '#D1FAE5' }]}>
                                                <MaterialIcons
                                                    name={impactExisting ? 'warning' : 'check-circle'}
                                                    size={20}
                                                    color={impactExisting ? '#DC2626' : '#10B981'}
                                                />
                                            </View>
                                            <View style={styles.affectedUserInfo}>
                                                <Text style={styles.affectedUserCount}>
                                                    {impactExisting ? selectedImpactedUsers.size : 0}
                                                </Text>
                                                <Text style={styles.affectedUserLabel}>
                                                    {impactExisting ? 'Selected to impact' : "Won't be affected"}
                                                </Text>
                                                <Text style={styles.affectedUserDesc}>
                                                    of {affectedUsers.summary?.completed_count || 0} users at 100%
                                                </Text>
                                            </View>
                                        </View>
                                        <View style={styles.affectedUserBox}>
                                            <View style={[styles.affectedUserIcon, { backgroundColor: '#FEF3C7' }]}>
                                                <MaterialIcons name="schedule" size={20} color="#D97706" />
                                            </View>
                                            <View style={styles.affectedUserInfo}>
                                                <Text style={styles.affectedUserCount}>
                                                    {affectedUsers.summary?.in_progress_count || 0}
                                                </Text>
                                                <Text style={styles.affectedUserLabel}>Always affected</Text>
                                                <Text style={styles.affectedUserDesc}>Users in progress</Text>
                                            </View>
                                        </View>
                                    </View>
                                    <TouchableOpacity
                                        style={styles.viewAllUsersBtn}
                                        onPress={() => setShowAffectedUsersModal(true)}
                                    >
                                        <MaterialIcons name="edit" size={16} color="#3B82F6" />
                                        <Text style={styles.viewAllUsersBtnText}>
                                            {impactExisting ? 'Select Users to Impact' : 'View Users'} ({affectedUsers.summary?.total_users || 0})
                                        </Text>
                                        <MaterialIcons name="chevron-right" size={18} color="#3B82F6" />
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>
                    )}

                    {/* LIST */}
                    <FlatList
                        data={files}
                        keyExtractor={item => String(item.tempId)}
                        contentContainerStyle={{ paddingBottom: 100 }}
                        renderItem={({ item, index }) => (
                            <View style={styles.fileCard}>
                                <View style={[styles.orderBadge, isSelfLearning && { backgroundColor: '#D1FAE5' }]}>
                                    <Text style={[styles.orderText, isSelfLearning && { color: '#059669' }]}>{index + 1}</Text>
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
                            <ActivityIndicator color={isSelfLearning ? "#10B981" : "#F59E0B"} />
                            <Text style={styles.uploadingText}>Uploading... {(progress * 100).toFixed(0)}%</Text>
                        </View>
                    ) : (
                        <TouchableOpacity
                            style={[styles.uploadBtn, files.length === 0 && styles.disabledBtn, isSelfLearning && { backgroundColor: '#10B981' }]}
                            onPress={handleUpload}
                            disabled={files.length === 0}
                        >
                            <Text style={styles.uploadBtnText}>
                                {isSelfLearning ? '📚 Upload to Self Learning' : '🚀 Upload to Career Path'} ({files.length})
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {/* Affected Users Modal */}
            <Modal visible={showAffectedUsersModal} animationType="slide" transparent={true}>
                <View style={styles.affectedUsersModalOverlay}>
                    <View style={styles.affectedUsersModalContent}>
                        {/* Header */}
                        <View style={styles.affectedUsersModalHeader}>
                            <View style={styles.affectedUsersModalTitleRow}>
                                <MaterialIcons name="people" size={24} color="#3B82F6" />
                                <Text style={styles.affectedUsersModalTitle}>Select Users to Impact</Text>
                            </View>
                            <TouchableOpacity onPress={() => setShowAffectedUsersModal(false)}>
                                <MaterialIcons name="close" size={24} color="#6B7280" />
                            </TouchableOpacity>
                        </View>

                        {/* Impact Mode Indicator */}
                        <View style={[
                            styles.impactModeIndicator,
                            impactExisting ? styles.impactModeOn : styles.impactModeOff
                        ]}>
                            <MaterialIcons
                                name={impactExisting ? 'warning' : 'check-circle'}
                                size={18}
                                color={impactExisting ? '#DC2626' : '#10B981'}
                            />
                            <Text style={[
                                styles.impactModeText,
                                impactExisting ? styles.impactModeTextOn : styles.impactModeTextOff
                            ]}>
                                {impactExisting
                                    ? `Impact Mode: ${selectedImpactedUsers.size} users selected to be impacted`
                                    : 'No Impact Mode: No users will be affected'}
                            </Text>
                        </View>

                        {/* Select All / None Buttons */}
                        {impactExisting && affectedUsers?.completed_users?.length > 0 && (
                            <View style={styles.selectAllContainer}>
                                <TouchableOpacity style={styles.selectAllBtn} onPress={selectAllCompletedUsers}>
                                    <MaterialIcons name="select-all" size={16} color="#3B82F6" />
                                    <Text style={styles.selectAllBtnText}>Select All</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.selectNoneBtn} onPress={deselectAllUsers}>
                                    <MaterialIcons name="deselect" size={16} color="#6B7280" />
                                    <Text style={styles.selectNoneBtnText}>Select None</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        <ScrollView style={styles.affectedUsersScrollView}>
                            {/* Completed Users Section */}
                            {affectedUsers?.completed_users?.length > 0 && (
                                <View style={styles.affectedUsersSection}>
                                    <View style={styles.affectedUsersSectionHeader}>
                                        <View style={[styles.sectionIconBadge, { backgroundColor: impactExisting ? '#FEE2E2' : '#D1FAE5' }]}>
                                            <MaterialIcons
                                                name={impactExisting ? 'warning' : 'check-circle'}
                                                size={16}
                                                color={impactExisting ? '#DC2626' : '#10B981'}
                                            />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.affectedUsersSectionTitle}>
                                                Users at 100% ({affectedUsers.completed_users.length})
                                            </Text>
                                            <Text style={styles.affectedUsersSectionSubtitle}>
                                                {impactExisting
                                                    ? 'Select users who must complete new courses'
                                                    : 'These users will NOT be affected'}
                                            </Text>
                                        </View>
                                    </View>
                                    {affectedUsers.completed_users.slice(0, 50).map((user, index) => (
                                        <TouchableOpacity
                                            key={user.email || index}
                                            style={styles.affectedUserItem}
                                            onPress={() => impactExisting && toggleUserImpact(user.email)}
                                            disabled={!impactExisting}
                                        >
                                            {impactExisting && (
                                                <MaterialIcons
                                                    name={selectedImpactedUsers.has(user.email) ? 'check-box' : 'check-box-outline-blank'}
                                                    size={22}
                                                    color={selectedImpactedUsers.has(user.email) ? '#3B82F6' : '#9CA3AF'}
                                                />
                                            )}
                                            <View style={styles.affectedUserAvatar}>
                                                <Text style={styles.affectedUserAvatarText}>
                                                    {(user.name || user.email || '?').charAt(0).toUpperCase()}
                                                </Text>
                                            </View>
                                            <View style={styles.affectedUserDetails}>
                                                <Text style={styles.affectedUserName}>{user.name || user.email}</Text>
                                                <Text style={styles.affectedUserMeta}>
                                                    {user.role || 'No Role'} • {user.store || 'No Store'}
                                                </Text>
                                            </View>
                                            <View style={[
                                                styles.affectedUserBadge,
                                                { backgroundColor: (impactExisting && selectedImpactedUsers.has(user.email)) ? '#FEE2E2' : '#D1FAE5' }
                                            ]}>
                                                <Text style={[
                                                    styles.affectedUserBadgeText,
                                                    { color: (impactExisting && selectedImpactedUsers.has(user.email)) ? '#DC2626' : '#10B981' }
                                                ]}>
                                                    {(impactExisting && selectedImpactedUsers.has(user.email)) ? 'Impacted' : 'Safe'}
                                                </Text>
                                            </View>
                                        </TouchableOpacity>
                                    ))}
                                    {affectedUsers.completed_users.length > 50 && (
                                        <Text style={styles.affectedUsersMore}>
                                            +{affectedUsers.completed_users.length - 50} more users
                                        </Text>
                                    )}
                                </View>
                            )}

                            {/* In Progress Users Section */}
                            {affectedUsers?.in_progress_users?.length > 0 && (
                                <View style={styles.affectedUsersSection}>
                                    <View style={styles.affectedUsersSectionHeader}>
                                        <View style={[styles.sectionIconBadge, { backgroundColor: '#FEF3C7' }]}>
                                            <MaterialIcons name="schedule" size={16} color="#D97706" />
                                        </View>
                                        <View>
                                            <Text style={styles.affectedUsersSectionTitle}>
                                                Users In Progress ({affectedUsers.in_progress_users.length})
                                            </Text>
                                            <Text style={styles.affectedUsersSectionSubtitle}>
                                                These users will always need to complete new courses
                                            </Text>
                                        </View>
                                    </View>
                                    {affectedUsers.in_progress_users.slice(0, 20).map((user, index) => (
                                        <View key={user.email || index} style={styles.affectedUserItem}>
                                            <View style={styles.affectedUserAvatar}>
                                                <Text style={styles.affectedUserAvatarText}>
                                                    {(user.name || user.email || '?').charAt(0).toUpperCase()}
                                                </Text>
                                            </View>
                                            <View style={styles.affectedUserDetails}>
                                                <Text style={styles.affectedUserName}>{user.name || user.email}</Text>
                                                <Text style={styles.affectedUserMeta}>
                                                    {user.role || 'No Role'} • {user.store || 'No Store'}
                                                </Text>
                                            </View>
                                            <View style={styles.progressBadge}>
                                                <Text style={styles.progressBadgeText}>
                                                    {user.progress_percent || 0}%
                                                </Text>
                                            </View>
                                        </View>
                                    ))}
                                    {affectedUsers.in_progress_users.length > 20 && (
                                        <Text style={styles.affectedUsersMore}>
                                            +{affectedUsers.in_progress_users.length - 20} more users
                                        </Text>
                                    )}
                                </View>
                            )}

                            {/* Empty State */}
                            {(!affectedUsers?.completed_users?.length && !affectedUsers?.in_progress_users?.length) && (
                                <View style={styles.emptyAffectedUsers}>
                                    <MaterialIcons name="info-outline" size={48} color="#D1D5DB" />
                                    <Text style={styles.emptyAffectedUsersText}>
                                        No users have started this learning path yet
                                    </Text>
                                </View>
                            )}
                        </ScrollView>

                        {/* Footer */}
                        <View style={styles.affectedUsersModalFooter}>
                            <TouchableOpacity
                                style={styles.affectedUsersCloseBtn}
                                onPress={() => setShowAffectedUsersModal(false)}
                            >
                                <Text style={styles.affectedUsersCloseBtnText}>Close</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
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

    optionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFF', padding: 16, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E5E7EB' },
    optionTitle: { fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: '#374151' },
    optionDesc: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: '#9CA3AF', marginTop: 2 },

    // Path Indicator
    pathIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 10,
        borderRadius: 12,
        marginBottom: 16,
        borderWidth: 1,
    },
    pathIndicatorText: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
        marginLeft: 8,
    },

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

    // Bucket styles
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
    bucketChipText: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: '#4B5563', marginLeft: 4 },

    // Impact Settings Styles
    impactSettingContainer: {
        backgroundColor: '#F0F9FF',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#BFDBFE',
    },
    impactSettingHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
    },
    impactSettingTitle: {
        fontSize: 15,
        fontFamily: 'Poppins_700Bold',
        color: '#1E40AF',
    },
    impactSettingDesc: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
        marginBottom: 12,
        lineHeight: 18,
    },
    impactButtons: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 8,
    },
    impactButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: 12,
        borderRadius: 10,
        backgroundColor: '#FFF',
        borderWidth: 2,
        borderColor: '#D1D5DB',
    },
    impactButtonActive: {
        backgroundColor: '#3B82F6',
        borderColor: '#3B82F6',
    },
    impactButtonActiveGreen: {
        backgroundColor: '#10B981',
        borderColor: '#10B981',
    },
    impactButtonTextContainer: {
        flex: 1,
    },
    impactButtonTitle: {
        fontSize: 14,
        fontFamily: 'Poppins_700Bold',
        color: '#374151',
    },
    impactButtonTitleActive: {
        color: '#FFF',
    },
    impactButtonSubtitle: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        color: '#9CA3AF',
        marginTop: 2,
    },
    impactButtonSubtitleActive: {
        color: 'rgba(255,255,255,0.8)',
    },

    // Affected Users Preview Styles
    affectedUsersLoading: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        paddingVertical: 16,
    },
    affectedUsersLoadingText: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
    },
    affectedUsersPreview: {
        marginTop: 16,
        backgroundColor: '#FFF',
        borderRadius: 10,
        padding: 14,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    affectedUsersSummary: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 12,
    },
    affectedUserBox: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: '#F9FAFB',
        padding: 12,
        borderRadius: 8,
    },
    affectedUserIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    affectedUserInfo: {
        flex: 1,
    },
    affectedUserCount: {
        fontSize: 20,
        fontFamily: 'Poppins_700Bold',
        color: '#111827',
    },
    affectedUserLabel: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
        color: '#374151',
    },
    affectedUserDesc: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        color: '#9CA3AF',
    },
    viewAllUsersBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 10,
        backgroundColor: '#EFF6FF',
        borderRadius: 8,
    },
    viewAllUsersBtnText: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
        color: '#3B82F6',
    },

    // Affected Users Modal Styles
    affectedUsersModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    affectedUsersModalContent: {
        width: '100%',
        maxWidth: 600,
        maxHeight: '85%',
        backgroundColor: '#FFF',
        borderRadius: 16,
        overflow: 'hidden',
    },
    affectedUsersModalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    affectedUsersModalTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    affectedUsersModalTitle: {
        fontSize: 18,
        fontFamily: 'Poppins_700Bold',
        color: '#111827',
    },
    impactModeIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginHorizontal: 20,
        marginTop: 16,
        padding: 12,
        borderRadius: 8,
    },
    impactModeOn: {
        backgroundColor: '#FEF2F2',
    },
    impactModeOff: {
        backgroundColor: '#ECFDF5',
    },
    impactModeText: {
        flex: 1,
        fontSize: 13,
        fontFamily: 'Poppins_500Medium',
    },
    impactModeTextOn: {
        color: '#991B1B',
    },
    impactModeTextOff: {
        color: '#065F46',
    },
    selectAllContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 12,
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 4,
    },
    selectAllBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#EFF6FF',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
    },
    selectAllBtnText: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
        color: '#3B82F6',
    },
    selectNoneBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#F3F4F6',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
    },
    selectNoneBtnText: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
        color: '#6B7280',
    },
    affectedUsersScrollView: {
        flex: 1,
        padding: 20,
    },
    affectedUsersSection: {
        marginBottom: 24,
    },
    affectedUsersSectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 12,
    },
    sectionIconBadge: {
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    affectedUsersSectionTitle: {
        fontSize: 15,
        fontFamily: 'Poppins_700Bold',
        color: '#111827',
    },
    affectedUsersSectionSubtitle: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
        marginTop: 2,
    },
    affectedUserItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: '#F9FAFB',
        padding: 12,
        borderRadius: 10,
        marginBottom: 8,
    },
    affectedUserAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#3B82F6',
        justifyContent: 'center',
        alignItems: 'center',
    },
    affectedUserAvatarText: {
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
    },
    affectedUserDetails: {
        flex: 1,
    },
    affectedUserName: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#111827',
    },
    affectedUserMeta: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
        marginTop: 2,
    },
    affectedUserBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    affectedUserBadgeText: {
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
    },
    progressBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        backgroundColor: '#FEF3C7',
    },
    progressBadgeText: {
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
        color: '#D97706',
    },
    affectedUsersMore: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
        fontStyle: 'italic',
        textAlign: 'center',
        paddingVertical: 8,
    },
    emptyAffectedUsers: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 40,
    },
    emptyAffectedUsersText: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        color: '#9CA3AF',
        marginTop: 12,
        textAlign: 'center',
    },
    affectedUsersModalFooter: {
        padding: 16,
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
        alignItems: 'center',
    },
    affectedUsersCloseBtn: {
        backgroundColor: '#3B82F6',
        paddingVertical: 12,
        paddingHorizontal: 32,
        borderRadius: 8,
    },
    affectedUsersCloseBtnText: {
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
    },
});