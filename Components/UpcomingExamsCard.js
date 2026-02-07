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
import { randomizeExamQuestions } from '../utils/examUtils';
import * as Location from 'expo-location';

const { width } = Dimensions.get('window');

export default function UpcomingExamsCard({ userEmail, onStartExam, refreshKey }) {
    const [exams, setExams] = useState([]);
    const [completedExams, setCompletedExams] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false); // Silent background refresh
    const [starting, setStarting] = useState(null);
    const [showHistory, setShowHistory] = useState(false);

    useEffect(() => {
        if (userEmail) {
            fetchExams();
        } else {
            setLoading(false);
        }
    }, [userEmail, refreshKey]);

    // Auto-refresh exams every 10 seconds when there are upcoming exams
    // Uses silent refresh to avoid UI flicker
    useEffect(() => {
        if (userEmail && exams.length > 0) {
            console.log('[UpcomingExamsCard] Setting up auto-refresh for', exams.length, 'exams');
            const interval = setInterval(() => {
                console.log('[UpcomingExamsCard] Auto-refreshing exams (silent)...');
                refreshExamsSilently();
            }, 10000); // Refresh every 10 seconds

            return () => {
                console.log('[UpcomingExamsCard] Clearing auto-refresh interval');
                clearInterval(interval);
            };
        }
    }, [userEmail, exams.length]);

    // Initial fetch with loading indicator
    const fetchExams = async () => {
        if (!userEmail) return;
        setLoading(true);
        try {
            const url = `${API_URL}/api/v1/assessments/scheduled/user/${encodeURIComponent(userEmail)}`;
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

    // Silent refresh - updates data without showing loading indicator
    const refreshExamsSilently = async () => {
        if (!userEmail || isRefreshing) return;
        setIsRefreshing(true);
        try {
            const url = `${API_URL}/api/v1/assessments/scheduled/user/${encodeURIComponent(userEmail)}`;
            const res = await fetch(url);
            const data = await res.json();

            if (Array.isArray(data)) {
                const upcoming = data.filter(e => !e.has_completed);
                const completed = data.filter(e => e.has_completed);
                setExams(upcoming);
                setCompletedExams(completed);
            }
        } catch (e) {
            console.error('[UpcomingExamsCard] Error in silent refresh:', e);
        }
        setIsRefreshing(false);
    };

    const handleStartExam = async (exam) => {
        // Step 1: Check if marked present OR if PIN is enabled
        if (!exam.can_start) {
            if (exam.pin_enabled || exam.pinEnabled) {
                showPINDialog(exam);
                return;
            }

            Alert.alert(
                'Cannot Start Yet',
                'You need to be marked present by the supervisor at the exam center before you can start this exam.',
                [{ text: 'OK' }]
            );
            return;
        }

        // Step 2: Geofencing check (if enabled)
        if (exam.geofencing_enabled || exam.geofencingEnabled) {
            setStarting(exam.id);
            const locationValid = await checkGeofencing(exam);
            setStarting(null);

            if (!locationValid) {
                return; // Error shown in checkGeofencing
            }
        }

        // Step 3: Proceed to start exam
        proceedToStartExam(exam);
    };

    const checkGeofencing = async (exam) => {
        try {
            // Request permission
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert(
                    'Location Required',
                    'This exam requires location access. Please enable location services in your device settings.',
                    [{ text: 'OK' }]
                );
                return false;
            }

            // Get current location
            const { coords } = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.High
            });

            console.log('[Geofencing] User location:', coords.latitude, coords.longitude);

            // Validate with backend
            const formData = new FormData();
            formData.append('user_email', userEmail);
            formData.append('latitude', coords.latitude);
            formData.append('longitude', coords.longitude);

            const res = await fetch(
                `${API_URL}/api/v1/assessments/scheduled/${exam.id}/validate-location`,
                {
                    method: 'POST',
                    body: formData
                }
            );

            const data = await res.json();
            console.log('[Geofencing] Validation result:', data);

            if (!data.valid) {
                Alert.alert(
                    'Location Check Failed',
                    `You are ${Math.round(data.distance_meters)}m away from the exam center.\n\nYou must be within ${data.allowed_radius}m to start the exam.\n\nPlease move closer to the exam location.`,
                    [{ text: 'OK' }]
                );
                return false;
            }

            console.log('[Geofencing] Location valid, proceeding...');
            return true;
        } catch (error) {
            console.error('[Geofencing] Error:', error);
            Alert.alert(
                'Location Error',
                'Unable to get your location. Please check your GPS settings and try again.',
                [{ text: 'OK' }]
            );
            return false;
        }
    };

    const showPINDialog = (exam) => {
        Alert.prompt(
            'Enter Exam PIN',
            'Please enter the 4-digit PIN provided by your supervisor',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Submit',
                    onPress: async (pin) => {
                        if (pin && pin.length === 4 && /^\d{4}$/.test(pin)) {
                            await validatePIN(exam, pin);
                        } else {
                            Alert.alert('Invalid PIN', 'Please enter a valid 4-digit PIN');
                        }
                    }
                }
            ],
            'plain-text',
            '',
            'number-pad'
        );
    };

    const validatePIN = async (exam, pin) => {
        try {
            setStarting(exam.id);

            // Step 1: Check geofencing FIRST if enabled
            if (exam.geofencing_enabled || exam.geofencingEnabled) {
                console.log('[PIN+Geo] Checking location before PIN validation...');
                const locationValid = await checkGeofencing(exam);

                if (!locationValid) {
                    setStarting(null);
                    return; // Error shown in checkGeofencing
                }
                console.log('[PIN+Geo] Location valid, proceeding with PIN validation...');
            }

            // Step 2: Validate PIN
            const formData = new FormData();
            formData.append('user_email', userEmail);
            formData.append('pin', pin);
            if (exam.batch_number) {
                formData.append('batch_number', exam.batch_number);
            }

            const res = await fetch(
                `${API_URL}/api/v1/assessments/scheduled/${exam.id}/validate-pin`,
                {
                    method: 'POST',
                    body: formData
                }
            );

            const data = await res.json();
            setStarting(null);

            console.log('[PIN] Validation result:', data);

            if (data.valid && data.marked_present) {
                Alert.alert(
                    '✅ Check-in Successful!',
                    'You have been marked present. You can now start the exam.',
                    [
                        {
                            text: 'Start Exam',
                            onPress: async () => {
                                await refreshExamsSilently(); // Silent refresh to update can_start
                                // After refresh, the button state will update automatically
                            }
                        }
                    ]
                );
            } else {
                Alert.alert(
                    'Invalid PIN',
                    data.message || 'The PIN you entered is incorrect or has expired.'
                );
            }
        } catch (error) {
            setStarting(null);
            console.error('[PIN] Error:', error);
            Alert.alert('Error', 'Failed to validate PIN. Please try again.');
        }
    };

    const proceedToStartExam = async (exam) => {
        setStarting(exam.id);
        try {
            const formData = new FormData();
            formData.append('user_email', userEmail);

            const res = await fetch(`${API_URL}/api/v1/assessments/scheduled/${exam.id}/start`, {
                method: 'POST',
                body: formData
            });

            const data = await res.json();

            if (res.ok && (data.started_exam || data.status === 'success')) {
                // Get the exam data
                let examData = data.exam || exam;

                // Apply question/option randomization if enabled
                if (examData.randomize_question_order || examData.randomizeQuestionOrder ||
                    examData.randomize_option_order || examData.randomizeOptionOrder) {
                    console.log('[UpcomingExamsCard] Applying randomization for user:', userEmail);
                    examData = randomizeExamQuestions(examData, userEmail);
                }

                // Pass randomized exam data to parent for proctored exam screen
                if (onStartExam) {
                    onStartExam(examData, data.start_time);
                }
            } else {
                Alert.alert('Error', data.detail || 'Failed to start exam');
            }
        } catch (e) {
            console.error('[Exam Start] Error:', e);
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


    const getExamTargetTime = (exam) => {
        try {
            if (!exam.exam_date) return null;
            // Create a date object from the date string
            // Assuming exam_date is YYYY-MM-DD or similar standard format
            const dateStr = exam.exam_date.split('T')[0];

            let timeStr = exam.exam_time || "00:00";
            // Normalize time string (handle AM/PM basic case)
            if (timeStr.match(/pm/i) || timeStr.match(/am/i)) {
                // If standard Date parse handles it with date, good.
                // "2023-10-10 10:30 PM"
                return new Date(`${dateStr} ${timeStr}`);
            }
            // If 24h "14:30" or "14:30:00"
            if (timeStr.split(':').length === 2) timeStr += ":00";

            return new Date(`${dateStr}T${timeStr}`);
        } catch (e) {
            console.error("Date parse error", e);
            return null;
        }
    };

    const CountdownTimer = ({ targetDate }) => {
        const [timeLeft, setTimeLeft] = useState(null);

        useEffect(() => {
            const calculate = () => {
                const now = new Date();
                const diff = targetDate - now;
                if (diff <= 0) return null;

                const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
                const minutes = Math.floor((diff / 1000 / 60) % 60);
                const seconds = Math.floor((diff / 1000) % 60);
                return { days, hours, minutes, seconds };
            };

            setTimeLeft(calculate());
            const timer = setInterval(() => {
                const tl = calculate();
                if (!tl) clearInterval(timer);
                setTimeLeft(tl);
            }, 1000);

            return () => clearInterval(timer);
        }, [targetDate]);

        if (!timeLeft) return null;

        return (
            <View style={styles.timerContainer}>
                <View style={styles.timerBlock}>
                    <Text style={styles.timerValue}>{timeLeft.days}</Text>
                    <Text style={styles.timerLabel}>Days</Text>
                </View>
                <Text style={styles.timerSep}>:</Text>
                <View style={styles.timerBlock}>
                    <Text style={styles.timerValue}>{String(timeLeft.hours).padStart(2, '0')}</Text>
                    <Text style={styles.timerLabel}>Hrs</Text>
                </View>
                <Text style={styles.timerSep}>:</Text>
                <View style={styles.timerBlock}>
                    <Text style={styles.timerValue}>{String(timeLeft.minutes).padStart(2, '0')}</Text>
                    <Text style={styles.timerLabel}>Mins</Text>
                </View>
                <Text style={styles.timerSep}>:</Text>
                <View style={styles.timerBlock}>
                    <Text style={styles.timerValue}>{String(timeLeft.seconds).padStart(2, '0')}</Text>
                    <Text style={styles.timerLabel}>Secs</Text>
                </View>
            </View>
        );
    };

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

                        {/* LIVE COUNTDOWN TIMER */}
                        {!exam.can_start && (
                            <CountdownTimer targetDate={getExamTargetTime(exam)} />
                        )}

                        <View style={styles.infoGrid}>
                            <View style={styles.infoRow}>
                                <Feather name="calendar" size={16} color="rgba(255,255,255,0.8)" />
                                <Text style={styles.infoText}>{formatDate(exam.exam_date)}</Text>
                            </View>
                            <View style={styles.infoRow}>
                                <Feather name="clock" size={16} color="rgba(255,255,255,0.8)" />
                                <Text style={styles.infoText}>
                                    {exam.exam_time}
                                    {exam.is_batch_exam && exam.batch_number && (
                                        <Text style={{ fontWeight: '700', color: '#FFD700' }}> (Batch {exam.batch_number})</Text>
                                    )}
                                    {!exam.is_batch_exam && exam.shift && ` (${exam.shift})`}
                                </Text>
                            </View>
                            {exam.is_batch_exam && exam.batch_end_time && (
                                <View style={styles.infoRow}>
                                    <Feather name="watch" size={16} color="rgba(255,255,255,0.8)" />
                                    <Text style={styles.infoText}>
                                        Window: {exam.batch_start_time} - {exam.batch_end_time}
                                    </Text>
                                </View>
                            )}
                            <View style={styles.infoRow}>
                                <Feather name="map-pin" size={16} color="rgba(255,255,255,0.8)" />
                                <Text style={styles.infoText}>{exam.location}</Text>
                            </View>
                            <View style={styles.infoRow}>
                                <Feather name="user" size={16} color="rgba(255,255,255,0.8)" />
                                <Text style={styles.infoText}>Supervisor: {exam.supervisor_name}</Text>
                            </View>
                        </View>

                        {/* Start Button - Contextual State */}
                        <TouchableOpacity
                            style={[
                                styles.startBtn,
                                exam.can_start ? styles.startBtnReady :
                                    (exam.pin_enabled || exam.pinEnabled) ? styles.startBtnPin :
                                        styles.startBtnDisabled
                            ]}
                            onPress={() => handleStartExam(exam)}
                            disabled={starting === exam.id}
                        >
                            {starting === exam.id ? (
                                <ActivityIndicator color="#FFF" size="small" />
                            ) : exam.can_start ? (
                                <>
                                    <MaterialCommunityIcons
                                        name="play-circle"
                                        size={24}
                                        color="#FFF"
                                    />
                                    <Text style={styles.startBtnTextReady}>Start Exam Now</Text>
                                </>
                            ) : (exam.pin_enabled || exam.pinEnabled) ? (
                                <>
                                    <Feather name="key" size={20} color="#FFF" />
                                    <Text style={styles.startBtnTextPin}>Enter PIN to Check-in</Text>
                                </>
                            ) : (
                                <>
                                    <Feather name="clock" size={20} color="rgba(255,255,255,0.5)" />
                                    <Text style={styles.startBtnTextDisabled}>
                                        Waiting for Supervisor
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
        paddingVertical: 16,
        borderRadius: 16,
        gap: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    startBtnReady: {
        backgroundColor: '#10B981', // Green when ready to start
    },
    startBtnPin: {
        backgroundColor: '#8B5CF6', // Purple for PIN entry
    },
    startBtnDisabled: {
        backgroundColor: 'rgba(255,255,255,0.15)',
        shadowOpacity: 0,
    },
    startBtnText: {
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
    },
    startBtnTextReady: {
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
    },
    startBtnTextPin: {
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
    },
    startBtnTextDisabled: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
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
    timerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.3)',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 16,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    timerBlock: {
        alignItems: 'center',
        minWidth: 45,
    },
    timerValue: {
        fontSize: 22,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
        marginBottom: 2,
        fontVariant: ['tabular-nums'], // Fixed width numbers to avoid jitter
    },
    timerLabel: {
        fontSize: 10,
        fontFamily: 'Poppins_500Medium',
        color: 'rgba(255,255,255,0.6)',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    timerSep: {
        fontSize: 22,
        fontFamily: 'Poppins_300Light',
        color: 'rgba(255,255,255,0.3)',
        marginHorizontal: 4,
        marginTop: -16, // Align correctly with numbers
    },
});
