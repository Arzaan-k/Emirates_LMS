import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    FlatList,
    ScrollView,
    Dimensions,
    ActivityIndicator,
    Alert
} from 'react-native';
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import API_URL from '../config';

const { width, height } = Dimensions.get('window');

export default function ScheduledExamsListModal({ visible, onClose, userProfile, onSelectExam, onCreateNew, onEditExam }) {
    const [exams, setExams] = useState([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [editingExam, setEditingExam] = useState(null);
    const [showEditModal, setShowEditModal] = useState(false);
    const [generatingPin, setGeneratingPin] = useState(false);

    useEffect(() => {
        if (visible) {
            fetchExams();
        }
    }, [visible]);

    const fetchExams = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/api/v1/assessments/scheduled`);
            const data = await res.json();

            if (Array.isArray(data)) {
                // Filter Logic:
                // If Super Admin: Show all
                // If Supervisor: Show only exams where they are supervisor
                // If regular User (unexpected here but safe): Show none or assigned (but this is admin panel)

                let filtered = data;
                if (userProfile && !userProfile.is_superadmin && userProfile.category !== 'Super Admin') {
                    // Supervisor Mode
                    filtered = data.filter(exam => exam.supervisor_email === userProfile.email);
                }

                // Sort by date (descending)
                filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

                setExams(filtered);
            }
        } catch (e) {
            console.error("Error fetching exams:", e);
        }
        setLoading(false);
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'completed': return '#10B981';
            case 'ongoing': return '#F59E0B';
            default: return '#6366F1';
        }
    };

    const handleGeneratePin = async (examId) => {
        setGeneratingPin(true);
        try {
            const formData = new FormData();
            formData.append('admin_email', userProfile.email);

            const res = await fetch(`${API_URL}/api/v1/assessments/scheduled/${examId}/generate-pin`, {
                method: 'POST',
                body: formData
            });

            const data = await res.json();

            if (data.pin) {
                Alert.alert(
                    '✅ PIN Generated',
                    `PIN: ${data.pin}\n\nValid until: ${new Date(data.valid_until).toLocaleTimeString()}\n\nAnnounce this PIN to students present in the exam hall.`,
                    [{ text: 'OK', onPress: () => fetchExams() }]
                );
            } else {
                Alert.alert('Error', data.message || 'Failed to generate PIN');
            }
        } catch (e) {
            console.error('PIN generation error:', e);
            Alert.alert('Error', 'Failed to generate PIN');
        }
        setGeneratingPin(false);
    };

    const handleRegeneratePin = async (examId) => {
        Alert.alert(
            'Regenerate PIN?',
            'This will invalidate the previous PIN and create a new one.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Regenerate',
                    style: 'destructive',
                    onPress: async () => {
                        await handleGeneratePin(examId);
                    }
                }
            ]
        );
    };

    const openEditModal = (exam) => {
        console.log('[Edit Modal] Opening for exam:', exam);

        // If there's an onEditExam callback (opens full ScheduleExamModal in edit mode)
        if (onEditExam) {
            onEditExam(exam);
        } else {
            // Fallback: show quick PIN management modal
            setEditingExam(exam);
            setShowEditModal(true);
        }
    };

    const closeEditModal = () => {
        setShowEditModal(false);
        setEditingExam(null);
    };

    if (!visible) return null;

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View style={styles.overlay}>
                <BlurView intensity={20} style={StyleSheet.absoluteFill} />
                <View style={styles.container}>
                    {/* Header */}
                    <LinearGradient
                        colors={['#6366F1', '#4F46E5']}
                        style={styles.header}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    >
                        <View style={styles.headerTop}>
                            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                                <Feather name="x" size={22} color="#FFF" />
                            </TouchableOpacity>
                            <View style={styles.headerTitleRow}>
                                <MaterialCommunityIcons name="clipboard-list-outline" size={24} color="#FFF" />
                                <Text style={styles.headerTitle}>Scheduled Exams</Text>
                            </View>
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                                <TouchableOpacity onPress={fetchExams} style={styles.closeBtn}>
                                    <Feather name="refresh-cw" size={20} color="#FFF" />
                                </TouchableOpacity>
                                {(userProfile?.is_superadmin || userProfile?.category === 'Manager' || userProfile?.category === 'Super Admin') && onCreateNew && (
                                    <TouchableOpacity onPress={onCreateNew} style={[styles.closeBtn, { backgroundColor: '#FFF' }]}>
                                        <Feather name="plus" size={24} color="#6366F1" />
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>
                        <Text style={styles.subtitle}>
                            {userProfile?.is_superadmin ? 'Viewing all exams' : 'Exams assigned to you'}
                        </Text>
                    </LinearGradient>

                    {/* Content */}
                    <View style={styles.content}>
                        {loading ? (
                            <ActivityIndicator size="large" color="#6366F1" style={{ marginTop: 40 }} />
                        ) : (
                            <FlatList
                                data={exams}
                                keyExtractor={item => item.id}
                                contentContainerStyle={{ padding: 20 }}
                                showsVerticalScrollIndicator={false}
                                renderItem={({ item }) => (
                                    <View style={styles.examCard}>
                                        <TouchableOpacity
                                            style={{ flex: 1 }}
                                            onPress={() => onSelectExam(item)}
                                        >
                                            <View style={styles.cardHeader}>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={styles.examTitle}>{item.title}</Text>
                                                    <Text style={styles.examDate}>
                                                        {item.exam_date} at {item.exam_time} • {item.location}
                                                    </Text>
                                                </View>
                                                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
                                                    <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
                                                        {item.status?.toUpperCase() || 'SCHEDULED'}
                                                    </Text>
                                                </View>
                                            </View>

                                        <View style={styles.cardFooter}>
                                            <View style={styles.stat}>
                                                <Feather name="users" size={14} color="#6B7280" />
                                                <Text style={styles.statText}>{item.assigned_users?.length || 0} assigned</Text>
                                            </View>
                                            <View style={styles.stat}>
                                                <Feather name="clock" size={14} color="#6B7280" />
                                                <Text style={styles.statText}>{item.time_limit_minutes} mins</Text>
                                            </View>
                                            <View style={styles.stat}>
                                                <MaterialCommunityIcons name="clipboard-check-outline" size={14} color="#6B7280" />
                                                <Text style={styles.statText}>Pass: {item.passing_score}%</Text>
                                            </View>
                                        </View>

                                            <Text style={[styles.supervisorText, item.supervisor_email === userProfile?.email && { color: '#10B981', fontWeight: 'bold' }]}>
                                                Supervisor: {item.supervisor_name} {item.supervisor_email === userProfile?.email ? '(You)' : ''}
                                            </Text>
                                        </TouchableOpacity>

                                        {/* Edit Button - Only for admin/supervisor */}
                                        {(userProfile?.is_superadmin || item.supervisor_email === userProfile?.email) && (
                                            <TouchableOpacity
                                                style={styles.editButton}
                                                onPress={() => openEditModal(item)}
                                            >
                                                <Feather name="edit-2" size={16} color="#6366F1" />
                                                <Text style={styles.editButtonText}>Edit</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                )}
                                ListEmptyComponent={
                                    <View style={styles.emptyContainer}>
                                        <MaterialCommunityIcons name="clipboard-text-off-outline" size={48} color="#9CA3AF" />
                                        <Text style={styles.emptyText}>No scheduled exams found.</Text>
                                        {userProfile?.is_superadmin && (
                                            <Text style={styles.emptySubText}>Schedule a new exam to get started.</Text>
                                        )}
                                    </View>
                                }
                            />
                        )}
                    </View>
                </View>
            </View>

            {/* Edit Exam Modal */}
            <Modal visible={showEditModal} animationType="slide" transparent>
                <View style={styles.editModalOverlay}>
                    <BlurView intensity={30} style={StyleSheet.absoluteFill} />
                    <View style={styles.editModalContainer}>
                        {/* Header */}
                        <LinearGradient
                            colors={['#6366F1', '#4F46E5']}
                            style={styles.editModalHeader}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                        >
                            <View style={styles.editModalHeaderRow}>
                                <Feather name="settings" size={22} color="#FFF" />
                                <Text style={styles.editModalTitle}>Manage Exam</Text>
                            </View>
                            <TouchableOpacity onPress={closeEditModal} style={styles.closeBtn}>
                                <Feather name="x" size={22} color="#FFF" />
                            </TouchableOpacity>
                        </LinearGradient>

                        {/* Content */}
                        {editingExam && (
                            <ScrollView style={styles.editModalContent} showsVerticalScrollIndicator={false}>
                                {/* Exam Info */}
                                <View style={styles.examInfoSection}>
                                    <Text style={styles.examInfoTitle}>{editingExam.title}</Text>
                                    <Text style={styles.examInfoSubtitle}>
                                        {editingExam.exam_date} at {editingExam.exam_time}
                                    </Text>
                                    <Text style={styles.examInfoLocation}>
                                        📍 {editingExam.location}
                                    </Text>

                                    <View style={{ marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                        <View style={styles.examStatChip}>
                                            <Feather name="users" size={14} color="#6366F1" />
                                            <Text style={styles.examStatText}>{editingExam.assigned_users?.length || 0} students</Text>
                                        </View>
                                        <View style={styles.examStatChip}>
                                            <Feather name="clock" size={14} color="#6366F1" />
                                            <Text style={styles.examStatText}>{editingExam.time_limit_minutes} mins</Text>
                                        </View>
                                        <View style={styles.examStatChip}>
                                            <Feather name="award" size={14} color="#6366F1" />
                                            <Text style={styles.examStatText}>Pass: {editingExam.passing_score}%</Text>
                                        </View>
                                    </View>

                                    <Text style={{ marginTop: 12, fontSize: 12, color: '#9CA3AF', fontFamily: 'Poppins_400Regular' }}>
                                        Supervisor: {editingExam.supervisor_name}
                                    </Text>
                                </View>

                                {/* PIN Management Section */}
                                {(editingExam.pin_enabled || editingExam.pinEnabled) ? (
                                    <View style={styles.pinSection}>
                                        <View style={styles.pinSectionHeader}>
                                            <Feather name="key" size={20} color="#8B5CF6" />
                                            <Text style={styles.pinSectionTitle}>PIN Check-in</Text>
                                        </View>

                                        {editingExam.generated_pin || editingExam.generatedPin ? (
                                            <View style={styles.pinDisplay}>
                                                <View style={styles.pinCodeContainer}>
                                                    <Text style={styles.pinLabel}>Current PIN</Text>
                                                    <Text style={styles.pinCode}>{editingExam.generated_pin || editingExam.generatedPin}</Text>
                                                </View>

                                                {editingExam.pin_generated_at && (
                                                    <Text style={styles.pinTimestamp}>
                                                        Generated: {new Date(editingExam.pin_generated_at).toLocaleString()}
                                                    </Text>
                                                )}

                                                <Text style={styles.pinInstructions}>
                                                    💡 Announce this PIN to students in the exam hall. They can enter it to mark themselves present.
                                                </Text>

                                                <TouchableOpacity
                                                    style={styles.regeneratePinBtn}
                                                    onPress={() => handleRegeneratePin(editingExam.id)}
                                                    disabled={generatingPin}
                                                >
                                                    {generatingPin ? (
                                                        <ActivityIndicator color="#8B5CF6" size="small" />
                                                    ) : (
                                                        <>
                                                            <Feather name="refresh-cw" size={18} color="#8B5CF6" />
                                                            <Text style={styles.regeneratePinText}>Regenerate PIN</Text>
                                                        </>
                                                    )}
                                                </TouchableOpacity>
                                            </View>
                                        ) : (
                                            <View style={styles.noPinContainer}>
                                                <Text style={styles.noPinText}>
                                                    No PIN generated yet. Generate a PIN for students to check-in.
                                                </Text>
                                                <TouchableOpacity
                                                    style={styles.generatePinBtn}
                                                    onPress={() => handleGeneratePin(editingExam.id)}
                                                    disabled={generatingPin}
                                                >
                                                    {generatingPin ? (
                                                        <ActivityIndicator color="#FFF" size="small" />
                                                    ) : (
                                                        <>
                                                            <Feather name="key" size={18} color="#FFF" />
                                                            <Text style={styles.generatePinText}>Generate PIN Now</Text>
                                                        </>
                                                    )}
                                                </TouchableOpacity>
                                            </View>
                                        )}
                                    </View>
                                ) : (
                                    <View style={styles.pinSection}>
                                        <View style={styles.pinSectionHeader}>
                                            <Feather name="alert-circle" size={20} color="#6B7280" />
                                            <Text style={styles.pinSectionTitle}>PIN Check-in Not Enabled</Text>
                                        </View>
                                        <Text style={styles.noPinText}>
                                            PIN check-in was not enabled when this exam was scheduled.
                                            Students will need to be marked present by the supervisor manually.
                                        </Text>
                                    </View>
                                )}

                                {/* Geofencing Info (Read-only) */}
                                {(editingExam.geofencing_enabled || editingExam.geofencingEnabled) && (
                                    <View style={styles.geofencingSection}>
                                        <View style={styles.geofencingSectionHeader}>
                                            <Feather name="map-pin" size={20} color="#10B981" />
                                            <Text style={styles.geofencingSectionTitle}>Geofencing Active</Text>
                                        </View>
                                        <Text style={styles.geofencingInfo}>
                                            📍 Students must be within {editingExam.geofencing_radius || editingExam.geofencingRadius || 100}m radius to check-in
                                        </Text>
                                    </View>
                                )}

                                {/* Auto-generation Info */}
                                {(editingExam.pin_enabled || editingExam.pinEnabled) && (
                                    <View style={styles.autoGenInfo}>
                                        <Feather name="info" size={16} color="#6B7280" />
                                        <Text style={styles.autoGenText}>
                                            Auto-generation: {editingExam.pin_generation_minutes || editingExam.pinGenerationMinutes || 5} min before exam
                                        </Text>
                                    </View>
                                )}
                            </ScrollView>
                        )}
                    </View>
                </View>
            </Modal>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    container: { height: height * 0.85, backgroundColor: '#F9FAFB', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
    header: { paddingTop: 20, paddingBottom: 20, paddingHorizontal: 20 },
    headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    closeBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
    headerTitleRow: { flexDirection: 'row', alignItems: 'center' },
    headerTitle: { fontSize: 18, fontFamily: 'Poppins_700Bold', color: '#FFF', marginLeft: 10 },
    subtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontFamily: 'Poppins_400Regular', textAlign: 'center' },
    content: { flex: 1, backgroundColor: '#F3F4F6' },
    examCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
    examTitle: { fontSize: 16, fontFamily: 'Poppins_600SemiBold', color: '#111827', marginBottom: 4 },
    examDate: { fontSize: 13, fontFamily: 'Poppins_400Regular', color: '#6B7280' },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
    statusText: { fontSize: 11, fontFamily: 'Poppins_700Bold' },
    cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6', marginBottom: 10 },
    stat: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    statText: { fontSize: 13, fontFamily: 'Poppins_500Medium', color: '#6B7280' },
    supervisorText: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: '#9CA3AF' },
    emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 80 },
    emptyText: { fontSize: 16, fontFamily: 'Poppins_600SemiBold', color: '#374151', marginTop: 16 },
    emptySubText: { fontSize: 14, fontFamily: 'Poppins_400Regular', color: '#9CA3AF', marginTop: 8 },

    // Edit Button
    editButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#EEF2FF',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 10,
        marginTop: 12,
        alignSelf: 'flex-start'
    },
    editButtonText: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
        color: '#6366F1'
    },

    // Edit Modal
    editModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20
    },
    editModalContainer: {
        width: '100%',
        maxWidth: 500,
        backgroundColor: '#FFF',
        borderRadius: 24,
        overflow: 'hidden',
        maxHeight: height * 0.8
    },
    editModalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 20
    },
    editModalHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12
    },
    editModalTitle: {
        fontSize: 20,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF'
    },
    editModalContent: {
        padding: 20
    },

    // Exam Info
    examInfoSection: {
        backgroundColor: '#F9FAFB',
        padding: 16,
        borderRadius: 16,
        marginBottom: 20
    },
    examInfoTitle: {
        fontSize: 18,
        fontFamily: 'Poppins_700Bold',
        color: '#111827',
        marginBottom: 6
    },
    examInfoSubtitle: {
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        color: '#6B7280',
        marginBottom: 4
    },
    examInfoLocation: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        color: '#9CA3AF'
    },
    examStatChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: '#EEF2FF',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8
    },
    examStatText: {
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
        color: '#6366F1'
    },

    // PIN Section
    pinSection: {
        backgroundColor: '#FAF5FF',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16
    },
    pinSectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 16
    },
    pinSectionTitle: {
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
        color: '#7C3AED'
    },
    pinDisplay: {
        alignItems: 'center'
    },
    pinCodeContainer: {
        backgroundColor: '#FFF',
        borderRadius: 16,
        padding: 20,
        alignItems: 'center',
        marginBottom: 12,
        borderWidth: 2,
        borderColor: '#8B5CF6',
        shadowColor: '#8B5CF6',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4
    },
    pinLabel: {
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
        color: '#9CA3AF',
        marginBottom: 8,
        textTransform: 'uppercase',
        letterSpacing: 1
    },
    pinCode: {
        fontSize: 48,
        fontFamily: 'Poppins_900Black',
        color: '#7C3AED',
        letterSpacing: 8
    },
    pinTimestamp: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
        marginBottom: 12
    },
    pinInstructions: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
        textAlign: 'center',
        marginBottom: 16,
        lineHeight: 20
    },
    regeneratePinBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#FFF',
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: '#8B5CF6'
    },
    regeneratePinText: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#8B5CF6'
    },
    noPinContainer: {
        alignItems: 'center'
    },
    noPinText: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
        textAlign: 'center',
        marginBottom: 16,
        lineHeight: 20
    },
    generatePinBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: '#8B5CF6',
        paddingVertical: 14,
        paddingHorizontal: 24,
        borderRadius: 12,
        shadowColor: '#8B5CF6',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4
    },
    generatePinText: {
        fontSize: 15,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF'
    },

    // Geofencing Section
    geofencingSection: {
        backgroundColor: '#ECFDF5',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16
    },
    geofencingSectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 10
    },
    geofencingSectionTitle: {
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
        color: '#059669'
    },
    geofencingInfo: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        color: '#047857',
        lineHeight: 20
    },

    // Auto-gen Info
    autoGenInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#F3F4F6',
        padding: 12,
        borderRadius: 10
    },
    autoGenText: {
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
        color: '#6B7280',
        flex: 1
    }
});
