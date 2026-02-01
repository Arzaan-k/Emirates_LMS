import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    ScrollView,
    Dimensions,
    ActivityIndicator,
    Alert
} from 'react-native';
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import API_URL from '../config';

const { width, height } = Dimensions.get('window');

export default function ExamAttendanceModal({ visible, onClose, exam, userProfile }) {
    const [attendance, setAttendance] = useState([]);
    const [loading, setLoading] = useState(false);
    const [marking, setMarking] = useState(null);

    useEffect(() => {
        if (visible && exam?.id) {
            fetchAttendance();
        }
    }, [visible, exam]);

    const fetchAttendance = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/api/v1/assessments/scheduled/${exam.id}/attendance`);
            const data = await res.json();

            if (res.ok && Array.isArray(data)) {
                setAttendance(data);
            } else {
                console.warn("[ExamAttendance] Unexpected response:", data);
                setAttendance([]);
            }
        } catch (e) {
            console.error('Error fetching attendance:', e);
            setAttendance([]);
        }
        setLoading(false);
    };

    const markPresent = async (userEmail) => {
        setMarking(userEmail);
        try {
            const formData = new FormData();
            formData.append('user_email', userEmail);
            formData.append('marked_by', userProfile?.email || 'supervisor');

            const res = await fetch(`${API_URL}/api/v1/assessments/scheduled/${exam.id}/mark-present`, {
                method: 'POST',
                body: formData
            });

            const data = await res.json();

            // Backend returns the updated record directly, or we check for HTTP success
            if (res.ok && (data.marked_present || data.status === 'success')) {
                Alert.alert('Success', 'User marked as present. They can now start the exam.');
                fetchAttendance();
            } else {
                Alert.alert('Error', data.detail || 'Failed to mark present');
            }
        } catch (e) {
            Alert.alert('Error', 'Network error');
        }
        setMarking(null);
    };

    const markAbsent = async (userEmail) => {
        setMarking(userEmail);
        try {
            const formData = new FormData();
            formData.append('user_email', userEmail);
            formData.append('marked_by', userProfile?.email || 'supervisor');

            const res = await fetch(`${API_URL}/api/v1/assessments/scheduled/${exam.id}/mark-absent`, {
                method: 'POST',
                body: formData
            });

            const data = await res.json();
            if (res.ok) {
                Alert.alert('Marked Absent', 'User has been marked as absent.');
                fetchAttendance();
            }
        } catch (e) {
            Alert.alert('Error', 'Network error');
        }
        setMarking(null);
    };

    if (!visible) return null;

    const presentCount = attendance.filter(a => a.marked_present).length;
    const completedCount = attendance.filter(a => a.completed).length;

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View style={styles.overlay}>
                <BlurView intensity={20} style={StyleSheet.absoluteFill} />
                <View style={styles.container}>
                    {/* Header */}
                    <LinearGradient
                        colors={['#10B981', '#059669']}
                        style={styles.header}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    >
                        <View style={styles.headerTop}>
                            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                                <Feather name="x" size={22} color="#FFF" />
                            </TouchableOpacity>
                            <View style={styles.headerTitleRow}>
                                <MaterialCommunityIcons name="clipboard-check" size={24} color="#FFF" />
                                <Text style={styles.headerTitle}>Exam Attendance</Text>
                            </View>
                            <TouchableOpacity onPress={fetchAttendance} style={styles.closeBtn}>
                                <Feather name="refresh-cw" size={18} color="#FFF" />
                            </TouchableOpacity>
                        </View>

                        {exam && (
                            <View style={styles.examInfo}>
                                <Text style={styles.examTitle}>{exam.title}</Text>
                                <Text style={styles.examMeta}>
                                    {exam.exam_date} at {exam.exam_time} • {exam.location}
                                </Text>
                            </View>
                        )}
                    </LinearGradient>

                    {/* Stats */}
                    <View style={styles.statsRow}>
                        <View style={styles.statCard}>
                            <Text style={styles.statValue}>{attendance.length}</Text>
                            <Text style={styles.statLabel}>Assigned</Text>
                        </View>
                        <View style={styles.statCard}>
                            <Text style={[styles.statValue, { color: '#10B981' }]}>{presentCount}</Text>
                            <Text style={styles.statLabel}>Present</Text>
                        </View>
                        <View style={styles.statCard}>
                            <Text style={[styles.statValue, { color: '#6366F1' }]}>{completedCount}</Text>
                            <Text style={styles.statLabel}>Completed</Text>
                        </View>
                    </View>

                    {/* Attendance List */}
                    <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                        {loading ? (
                            <ActivityIndicator size="large" color="#10B981" style={{ marginTop: 40 }} />
                        ) : attendance.length === 0 ? (
                            <View style={styles.emptyState}>
                                <MaterialCommunityIcons name="account-group" size={48} color="#D1D5DB" />
                                <Text style={styles.emptyText}>No participants assigned</Text>
                            </View>
                        ) : (
                            attendance.map((record, idx) => (
                                <View key={record.id} style={styles.attendanceCard}>
                                    <View style={styles.userInfo}>
                                        <View style={[
                                            styles.avatar,
                                            record.completed ? { backgroundColor: '#DBEAFE' } :
                                                record.marked_present ? { backgroundColor: '#D1FAE5' } :
                                                    { backgroundColor: '#FEE2E2' }
                                        ]}>
                                            <Text style={[
                                                styles.avatarText,
                                                record.completed ? { color: '#2563EB' } :
                                                    record.marked_present ? { color: '#059669' } :
                                                        { color: '#DC2626' }
                                            ]}>
                                                {record.user_name?.charAt(0) || '?'}
                                            </Text>
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.userName}>{record.user_name}</Text>
                                            <Text style={styles.userEmail}>{record.user_email}</Text>
                                            {record.completed && (
                                                <View style={styles.completedBadge}>
                                                    <Feather name="check-circle" size={12} color="#10B981" />
                                                    <Text style={styles.completedText}>Exam Completed</Text>
                                                </View>
                                            )}
                                            {record.marked_present && !record.completed && (
                                                <View style={styles.presentBadge}>
                                                    <Feather name="clock" size={12} color="#F59E0B" />
                                                    <Text style={styles.presentText}>Waiting to Start</Text>
                                                </View>
                                            )}
                                        </View>
                                    </View>

                                    {!record.completed && (
                                        <View style={styles.actionBtns}>
                                            {!record.marked_present ? (
                                                <TouchableOpacity
                                                    style={styles.presentBtn}
                                                    onPress={() => markPresent(record.user_email)}
                                                    disabled={marking === record.user_email}
                                                >
                                                    {marking === record.user_email ? (
                                                        <ActivityIndicator color="#FFF" size="small" />
                                                    ) : (
                                                        <>
                                                            <Feather name="check" size={16} color="#FFF" />
                                                            <Text style={styles.presentBtnText}>Mark Present</Text>
                                                        </>
                                                    )}
                                                </TouchableOpacity>
                                            ) : (
                                                <TouchableOpacity
                                                    style={styles.absentBtn}
                                                    onPress={() => markAbsent(record.user_email)}
                                                    disabled={marking === record.user_email}
                                                >
                                                    <Feather name="x" size={16} color="#EF4444" />
                                                    <Text style={styles.absentBtnText}>Undo</Text>
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                    )}
                                </View>
                            ))
                        )}
                        <View style={{ height: 40 }} />
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    container: { height: height * 0.85, backgroundColor: '#F9FAFB', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
    header: { paddingTop: 20, paddingBottom: 16, paddingHorizontal: 20 },
    headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    closeBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
    headerTitleRow: { flexDirection: 'row', alignItems: 'center' },
    headerTitle: { fontSize: 18, fontFamily: 'Poppins_700Bold', color: '#FFF', marginLeft: 10 },
    examInfo: { marginTop: 8 },
    examTitle: { fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: '#FFF' },
    examMeta: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: 'rgba(255,255,255,0.8)', marginTop: 2 },
    // Stats
    statsRow: { flexDirection: 'row', padding: 16, gap: 10 },
    statCard: { flex: 1, backgroundColor: '#FFF', padding: 14, borderRadius: 12, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, elevation: 2 },
    statValue: { fontSize: 24, fontFamily: 'Poppins_700Bold', color: '#111827' },
    statLabel: { fontSize: 11, fontFamily: 'Poppins_500Medium', color: '#6B7280' },
    content: { flex: 1, paddingHorizontal: 16 },
    // Attendance Card
    attendanceCard: { backgroundColor: '#FFF', borderRadius: 14, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, elevation: 2 },
    userInfo: { flexDirection: 'row', alignItems: 'center' },
    avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    avatarText: { fontSize: 18, fontFamily: 'Poppins_700Bold' },
    userName: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: '#111827' },
    userEmail: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: '#6B7280' },
    completedBadge: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    completedText: { fontSize: 11, fontFamily: 'Poppins_500Medium', color: '#10B981', marginLeft: 4 },
    presentBadge: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    presentText: { fontSize: 11, fontFamily: 'Poppins_500Medium', color: '#F59E0B', marginLeft: 4 },
    actionBtns: { marginTop: 12, flexDirection: 'row', gap: 10 },
    presentBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#10B981', paddingVertical: 10, borderRadius: 10, gap: 6 },
    presentBtnText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: '#FFF' },
    absentBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FEE2E2', paddingVertical: 10, borderRadius: 10, gap: 6 },
    absentBtnText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: '#EF4444' },
    // Empty
    emptyState: { alignItems: 'center', paddingVertical: 60 },
    emptyText: { fontSize: 14, fontFamily: 'Poppins_500Medium', color: '#6B7280', marginTop: 12 },
});
