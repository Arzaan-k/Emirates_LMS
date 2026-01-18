import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    FlatList,
    Dimensions,
    ActivityIndicator,
    Alert
} from 'react-native';
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import API_URL from '../config';

const { width, height } = Dimensions.get('window');

export default function ScheduledExamsListModal({ visible, onClose, userProfile, onSelectExam, onCreateNew }) {
    const [exams, setExams] = useState([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        if (visible) {
            fetchExams();
        }
    }, [visible]);

    const fetchExams = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/scheduled-exams`);
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
                                    <TouchableOpacity
                                        style={styles.examCard}
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
});
