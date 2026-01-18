import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    Dimensions
} from 'react-native';
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import API_URL from '../config';

const { width } = Dimensions.get('window');

export default function UpcomingExamsCard({ userEmail, onStartExam, refreshKey }) {
    const [exams, setExams] = useState([]);
    const [completedExams, setCompletedExams] = useState([]);
    const [loading, setLoading] = useState(true);
    const [starting, setStarting] = useState(null);
    const [showHistory, setShowHistory] = useState(false);

    useEffect(() => {
        if (userEmail) {
            fetchExams();
        } else {
            setLoading(false);
        }
    }, [userEmail, refreshKey]);

    const fetchExams = async () => {
        if (!userEmail) return;
        setLoading(true);
        try {
            const url = `${API_URL}/scheduled-exams/user/${encodeURIComponent(userEmail)}`;
            const res = await fetch(url);
            const data = await res.json();

            if (Array.isArray(data)) {
                const upcoming = data.filter(e => !e.has_completed);
                const completed = data.filter(e => e.has_completed);
                setExams(upcoming);
                setCompletedExams(completed);
            }
        } catch (e) {
            console.error('[UpcomingExamsCard] Error fetching scheduled exams:', e);
        }
        setLoading(false);
    };

    const handleStartExam = async (exam) => {
        if (!exam.can_start) {
            Alert.alert(
                'Cannot Start Yet',
                'You need to be marked present by the supervisor at the exam center before you can start this exam.',
                [{ text: 'OK' }]
            );
            return;
        }

        setStarting(exam.id);
        try {
            const formData = new FormData();
            formData.append('user_email', userEmail);

            const res = await fetch(`${API_URL}/scheduled-exams/${exam.id}/start`, {
                method: 'POST',
                body: formData
            });

            const data = await res.json();

            if (data.status === 'success') {
                // Pass exam data to parent for proctored exam screen
                if (onStartExam) {
                    onStartExam(data.exam, data.start_time);
                }
            } else {
                Alert.alert('Error', data.detail || 'Failed to start exam');
            }
        } catch (e) {
            Alert.alert('Error', 'Network error. Please try again.');
        }
        setStarting(null);
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
    };

    const isToday = (dateStr) => {
        if (!dateStr) return false;
        const today = new Date().toISOString().split('T')[0];
        return dateStr === today;
    };

    // Loading state
    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator color="#6366F1" />
            </View>
        );
    }

    // No exams at all - don't show the section
    if (exams.length === 0 && completedExams.length === 0) {
        return null;
    }

    // All exams completed - show completion message with history option
    if (exams.length === 0 && completedExams.length > 0) {
        return (
            <View style={styles.container}>
                {/* Completed State */}
                <LinearGradient
                    colors={['#ECFDF5', '#D1FAE5']}
                    style={styles.completedCard}
                >
                    <View style={styles.completedHeader}>
                        <MaterialCommunityIcons name="check-circle" size={32} color="#10B981" />
                        <View style={{ marginLeft: 12, flex: 1 }}>
                            <Text style={styles.completedTitle}>All Exams Completed!</Text>
                            <Text style={styles.completedSubtitle}>
                                You've completed {completedExams.length} exam{completedExams.length > 1 ? 's' : ''}
                            </Text>
                        </View>
                    </View>

                    <TouchableOpacity
                        style={styles.historyToggle}
                        onPress={() => setShowHistory(!showHistory)}
                    >
                        <Feather name={showHistory ? "chevron-up" : "chevron-down"} size={18} color="#059669" />
                        <Text style={styles.historyToggleText}>
                            {showHistory ? 'Hide History' : 'View Exam History'}
                        </Text>
                    </TouchableOpacity>
                </LinearGradient>

                {/* History Section */}
                {showHistory && (
                    <View style={styles.historySection}>
                        {completedExams.map((exam, idx) => (
                            <View key={exam.id} style={styles.historyItem}>
                                <View style={styles.historyIcon}>
                                    <Feather name="check" size={14} color="#10B981" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.historyTitle}>{exam.title}</Text>
                                    <Text style={styles.historyMeta}>
                                        {formatDate(exam.exam_date)} • {exam.location}
                                    </Text>
                                </View>
                                <View style={styles.completedBadge}>
                                    <Text style={styles.completedBadgeText}>Completed</Text>
                                </View>
                            </View>
                        ))}
                    </View>
                )}
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <MaterialCommunityIcons name="calendar-clock" size={20} color="#6366F1" />
                <Text style={styles.headerTitle}>Upcoming Exams</Text>
                <View style={styles.badge}>
                    <Text style={styles.badgeText}>{exams.length}</Text>
                </View>
            </View>

            {exams.map((exam, idx) => (
                <Animated.View
                    key={exam.id}
                    entering={FadeInDown.delay(idx * 100)}
                    style={styles.examCard}
                >
                    <LinearGradient
                        colors={isToday(exam.exam_date) ? ['#4338ca', '#312e81'] : ['#1F2937', '#111827']}
                        style={styles.examGradient}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    >
                        {/* Status Badge */}
                        <View style={styles.headerRow}>
                            <View style={[
                                styles.statusBadge,
                                exam.can_start ? styles.canStartBadge : styles.waitingBadge
                            ]}>
                                <Feather
                                    name={exam.can_start ? "check-circle" : "clock"}
                                    size={12}
                                    color={exam.can_start ? "#10B981" : "#F59E0B"}
                                />
                                <Text style={[
                                    styles.statusText,
                                    { color: exam.can_start ? "#10B981" : "#F59E0B" }
                                ]}>
                                    {exam.can_start ? "Ready to Start" : "Awaiting Attendance"}
                                </Text>
                            </View>
                            {isToday(exam.exam_date) && (
                                <View style={styles.todayBanner}>
                                    <Text style={styles.todayText}>📅 TODAY</Text>
                                </View>
                            )}
                        </View>

                        {/* Exam Info - Hero Style */}
                        <Text style={styles.examTitle}>{exam.title}</Text>

                        <View style={styles.infoGrid}>
                            <View style={styles.infoRow}>
                                <Feather name="calendar" size={16} color="rgba(255,255,255,0.8)" />
                                <Text style={styles.infoText}>{formatDate(exam.exam_date)}</Text>
                            </View>
                            <View style={styles.infoRow}>
                                <Feather name="clock" size={16} color="rgba(255,255,255,0.8)" />
                                <Text style={styles.infoText}>{exam.exam_time} ({exam.shift})</Text>
                            </View>
                            <View style={styles.infoRow}>
                                <Feather name="map-pin" size={16} color="rgba(255,255,255,0.8)" />
                                <Text style={styles.infoText}>{exam.location}</Text>
                            </View>
                            <View style={styles.infoRow}>
                                <Feather name="user" size={16} color="rgba(255,255,255,0.8)" />
                                <Text style={styles.infoText}>Supervisor: {exam.supervisor_name}</Text>
                            </View>
                        </View>

                        {/* Start Button - Hero Style */}
                        <TouchableOpacity
                            style={[
                                styles.startBtn,
                                !exam.can_start && styles.startBtnDisabled
                            ]}
                            onPress={() => handleStartExam(exam)}
                            disabled={!exam.can_start || starting === exam.id}
                        >
                            {starting === exam.id ? (
                                <ActivityIndicator color="#4F46E5" size="small" />
                            ) : (
                                <>
                                    <MaterialCommunityIcons
                                        name="play-circle"
                                        size={24}
                                        color={exam.can_start ? "#4F46E5" : "rgba(255,255,255,0.4)"}
                                    />
                                    <Text style={[
                                        styles.startBtnText,
                                        !exam.can_start && styles.startBtnTextDisabled
                                    ]}>
                                        {exam.can_start ? "Start Exam Now" : "Waiting for Supervisor to Enable"}
                                    </Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </LinearGradient>
                </Animated.View>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginHorizontal: 20,
        marginBottom: 20,
    },
    loadingContainer: {
        padding: 20,
        alignItems: 'center',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    headerTitle: {
        fontSize: 18,
        fontFamily: 'Poppins_700Bold',
        color: '#111827',
        marginLeft: 8,
        flex: 1,
    },
    badge: {
        backgroundColor: '#EEF2FF',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    badgeText: {
        fontSize: 12,
        fontFamily: 'Poppins_700Bold',
        color: '#6366F1',
    },
    examCard: {
        borderRadius: 24,
        overflow: 'hidden',
        marginBottom: 16,
        shadowColor: '#4F46E5',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 8,
    },
    examGradient: {
        padding: 24,
        position: 'relative',
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)'
    },
    canStartBadge: {
        backgroundColor: 'rgba(16, 185, 129, 0.2)',
        borderColor: '#10B981'
    },
    waitingBadge: {
        backgroundColor: 'rgba(245, 158, 11, 0.2)',
        borderColor: '#F59E0B'
    },
    statusText: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
        marginLeft: 6,
    },
    examTitle: {
        fontSize: 24,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
        marginBottom: 20,
        lineHeight: 32,
    },
    infoGrid: {
        gap: 12,
        marginBottom: 24,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    infoText: {
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        color: 'rgba(255,255,255,0.9)',
    },
    startBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FFF',
        paddingVertical: 16,
        borderRadius: 16,
        gap: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
    },
    startBtnDisabled: {
        backgroundColor: 'rgba(255,255,255,0.15)',
        shadowOpacity: 0,
    },
    startBtnText: {
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
        color: '#4F46E5',
    },
    startBtnTextDisabled: {
        color: 'rgba(255,255,255,0.5)',
    },
    todayBanner: {
        backgroundColor: '#FFF',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    todayText: {
        fontSize: 11,
        fontFamily: 'Poppins_700Bold',
        color: '#4F46E5',
    },
    loadingContainer: {
        margin: 20,
        padding: 20,
        backgroundColor: '#EEF2FF',
        borderRadius: 16,
        alignItems: 'center',
    },
    // Completed Exams Styles
    completedCard: {
        borderRadius: 20,
        padding: 20,
        borderWidth: 1,
        borderColor: '#A7F3D0',
    },
    completedHeader: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    completedTitle: {
        fontSize: 18,
        fontFamily: 'Poppins_700Bold',
        color: '#065F46',
    },
    completedSubtitle: {
        fontSize: 13,
        fontFamily: 'Poppins_500Medium',
        color: '#059669',
        marginTop: 2,
    },
    historyToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 16,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#A7F3D0',
        gap: 6,
    },
    historyToggleText: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#059669',
    },
    historySection: {
        marginTop: 12,
        backgroundColor: '#FFF',
        borderRadius: 16,
        padding: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    historyItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    historyIcon: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#ECFDF5',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    historyTitle: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#111827',
    },
    historyMeta: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
        marginTop: 2,
    },
    completedBadge: {
        backgroundColor: '#ECFDF5',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    completedBadgeText: {
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
        color: '#059669',
    },
});
