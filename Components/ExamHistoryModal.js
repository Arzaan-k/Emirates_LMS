import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    Modal,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    ActivityIndicator,
    Dimensions,
    Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import API_URL from '../config';

const { width, height } = Dimensions.get('window');

export default function ExamHistoryModal({ visible, onClose }) {
    const [exams, setExams] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedExam, setSelectedExam] = useState(null);
    const [examReport, setExamReport] = useState(null);
    const [loadingReport, setLoadingReport] = useState(false);
    const [filter, setFilter] = useState('all'); // all, scheduled, ongoing, completed
    const [pinStatus, setPinStatus] = useState({}); // Store PIN status by exam ID
    const [pinLoading, setPinLoading] = useState({});

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
                setExams(data);
            }
        } catch (e) {
            console.error('Error fetching exams:', e);
        }
        setLoading(false);
    };

    const fetchExamReport = async (examId) => {
        setLoadingReport(true);
        try {
            console.log(`[ExamHistory] Fetching report for ${examId} from ${API_URL}/api/v1/assessments/scheduled/${examId}/report`);
            const res = await fetch(`${API_URL}/api/v1/assessments/scheduled/${examId}/report`);
            
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Server returned ${res.status}: ${text.substring(0, 100)}`);
            }
            
            const data = await res.json();
            setExamReport(data);
        } catch (e) {
            console.error('Error fetching exam report:', e);
            // Optionally set error state to show in UI
        }
        setLoadingReport(false);
    };

    // Fetch PIN status for a specific exam
    const fetchPinStatus = async (examId) => {
        try {
            const res = await fetch(`${API_URL}/api/v1/assessments/scheduled/${examId}/pin-status`);
            
            if (!res.ok) {
               // Silently fail for PIN status usually, but good to log
               console.warn(`PIN Status fetch failed: ${res.status}`);
               return;
            }

            const data = await res.json();
            setPinStatus(prev => ({ ...prev, [examId]: data }));
        } catch (e) {
            console.error('Error fetching PIN status:', e);
        }
    };


    // Generate a new PIN for the exam
    const handleGeneratePin = async (examId, examTitle) => {
        Alert.alert(
            '🔑 Generate New PIN',
            `Generate a new 4-digit PIN for "${examTitle}"?\n\nThis will replace any existing PIN.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Generate',
                    onPress: async () => {
                        setPinLoading(prev => ({ ...prev, [examId]: true }));
                        try {
                            const formData = new FormData();
                            const res = await fetch(
                                `${API_URL}/api/v1/assessments/scheduled/${examId}/generate-pin`,
                                { method: 'POST', body: formData }
                            );
                            const data = await res.json();

                            if (data.pin) {
                                // Refresh PIN status and exams list
                                await fetchPinStatus(examId);
                                await fetchExams(); // Refresh list to show new PIN
                                Alert.alert(
                                    '✅ PIN Generated',
                                    `New PIN: ${data.pin}\n\nValid for ${data.validity_minutes} minutes.\n\nAnnounce this PIN to students so they can check in.`,
                                    [{ text: 'OK' }]
                                );
                            } else {
                                Alert.alert('Error', data.detail || 'Failed to generate PIN');
                            }
                        } catch (e) {
                            console.error('Error generating PIN:', e);
                            Alert.alert('Error', 'Network error. Please try again.');
                        }
                        setPinLoading(prev => ({ ...prev, [examId]: false }));
                    }
                }
            ]
        );
    };

    const handleExamPress = (exam) => {
        setSelectedExam(exam);
        fetchExamReport(exam.id);
        // Also fetch PIN status if PIN is enabled
        if (exam.pin_enabled || exam.pinEnabled) {
            fetchPinStatus(exam.id);
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'completed': return { bg: '#ECFDF5', text: '#059669', border: '#A7F3D0' };
            case 'ongoing': return { bg: '#FEF3C7', text: '#D97706', border: '#FCD34D' };
            default: return { bg: '#EEF2FF', text: '#4F46E5', border: '#C7D2FE' };
        }
    };

    const getStatusLabel = (status) => {
        switch (status) {
            case 'completed': return 'Completed';
            case 'ongoing': return 'In Progress';
            default: return 'Scheduled';
        }
    };

    const filteredExams = filter === 'all'
        ? exams
        : exams.filter(e => e.status === filter);

    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    // Helper to check if PIN is still active based on exam data
    const isPinActive = (exam) => {
        const pinGeneratedAt = exam.pin_generated_at || exam.pinGeneratedAt;
        const pinValidityMinutes = exam.pin_validity_minutes || exam.pinValidityMinutes || 30;

        if (!pinGeneratedAt) return false;

        const generatedTime = new Date(pinGeneratedAt);
        const expiryTime = new Date(generatedTime.getTime() + pinValidityMinutes * 60 * 1000);
        return new Date() < expiryTime;
    };

    if (!visible) return null;

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>📋 Exam History</Text>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                        <Feather name="x" size={24} color="#FFF" />
                    </TouchableOpacity>
                </View>

                {/* Content */}
                {selectedExam ? (
                    // Detailed Report View
                    <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                        <TouchableOpacity
                            style={styles.backBtn}
                            onPress={() => { setSelectedExam(null); setExamReport(null); }}
                        >
                            <Feather name="arrow-left" size={18} color="#6366F1" />
                            <Text style={styles.backBtnText}>Back to List</Text>
                        </TouchableOpacity>

                        {loadingReport ? (
                            <ActivityIndicator color="#6366F1" style={{ marginTop: 40 }} />
                        ) : examReport ? (
                            <Animated.View entering={FadeIn}>
                                {/* Exam Header */}
                                <View style={styles.examHeader}>
                                    <Text style={styles.examTitle}>{examReport.exam.title}</Text>
                                    <View style={[
                                        styles.statusBadge,
                                        {
                                            backgroundColor: getStatusColor(examReport.exam.status).bg,
                                            borderColor: getStatusColor(examReport.exam.status).border
                                        }
                                    ]}>
                                        <Text style={[styles.statusText, { color: getStatusColor(examReport.exam.status).text }]}>
                                            {getStatusLabel(examReport.exam.status)}
                                        </Text>
                                    </View>
                                </View>

                                <Text style={styles.examMeta}>
                                    {formatDate(examReport.exam.exam_date)} • {examReport.exam.exam_time} • {examReport.exam.location}
                                </Text>

                                {/* Statistics Grid */}
                                <View style={styles.statsGrid}>
                                    <View style={styles.statCard}>
                                        <Text style={styles.statValue}>{examReport.statistics.total_assigned}</Text>
                                        <Text style={styles.statLabel}>Assigned</Text>
                                    </View>
                                    <View style={styles.statCard}>
                                        <Text style={[styles.statValue, { color: '#10B981' }]}>{examReport.statistics.marked_present}</Text>
                                        <Text style={styles.statLabel}>Present</Text>
                                    </View>
                                    <View style={styles.statCard}>
                                        <Text style={[styles.statValue, { color: '#EF4444' }]}>{examReport.statistics.marked_absent}</Text>
                                        <Text style={styles.statLabel}>Absent</Text>
                                    </View>
                                    <View style={styles.statCard}>
                                        <Text style={[styles.statValue, { color: '#6366F1' }]}>{examReport.statistics.completed}</Text>
                                        <Text style={styles.statLabel}>Completed</Text>
                                    </View>
                                </View>

                                {/* PIN Management Section - Only show if PIN is enabled */}
                                {(selectedExam?.pin_enabled || selectedExam?.pinEnabled) && (
                                    <View style={styles.pinSection}>
                                        <Text style={styles.sectionTitle}>🔑 PIN Check-in</Text>
                                        <View style={styles.pinCard}>
                                            {pinStatus[selectedExam.id]?.pin ? (
                                                <>
                                                    <View style={styles.pinDisplayContainer}>
                                                        <Text style={styles.pinLabel}>Current PIN</Text>
                                                        <View style={[
                                                            styles.pinDisplay,
                                                            !pinStatus[selectedExam.id]?.is_active && styles.pinDisplayExpired
                                                        ]}>
                                                            <Text style={[
                                                                styles.pinCode,
                                                                !pinStatus[selectedExam.id]?.is_active && styles.pinCodeExpired
                                                            ]}>
                                                                {pinStatus[selectedExam.id].pin}
                                                            </Text>
                                                        </View>
                                                        <Text style={[
                                                            styles.pinStatus,
                                                            { color: pinStatus[selectedExam.id]?.is_active ? '#10B981' : '#EF4444' }
                                                        ]}>
                                                            {pinStatus[selectedExam.id]?.is_active
                                                                ? `✓ Active - ${Math.floor(pinStatus[selectedExam.id].time_remaining_seconds / 60)}m ${pinStatus[selectedExam.id].time_remaining_seconds % 60}s remaining`
                                                                : '✗ Expired'}
                                                        </Text>
                                                    </View>
                                                    <Text style={styles.pinInstructions}>
                                                        📢 Announce this PIN to students so they can check in and mark themselves present.
                                                    </Text>
                                                </>
                                            ) : (
                                                <View style={styles.noPinContainer}>
                                                    <MaterialCommunityIcons name="key-outline" size={40} color="#64748B" />
                                                    <Text style={styles.noPinText}>No PIN generated yet</Text>
                                                    <Text style={styles.noPinSubtext}>Generate a PIN for students to check in</Text>
                                                </View>
                                            )}

                                            <TouchableOpacity
                                                style={[
                                                    styles.generatePinBtn,
                                                    pinLoading[selectedExam.id] && styles.generatePinBtnDisabled
                                                ]}
                                                onPress={() => handleGeneratePin(selectedExam.id, selectedExam.title)}
                                                disabled={pinLoading[selectedExam.id]}
                                            >
                                                {pinLoading[selectedExam.id] ? (
                                                    <ActivityIndicator color="#FFF" size="small" />
                                                ) : (
                                                    <>
                                                        <Feather name="refresh-cw" size={18} color="#FFF" />
                                                        <Text style={styles.generatePinBtnText}>
                                                            {pinStatus[selectedExam.id]?.pin ? 'Regenerate PIN' : 'Generate PIN'}
                                                        </Text>
                                                    </>
                                                )}
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                )}

                                {/* Score Statistics */}
                                {examReport.statistics.completed > 0 && (
                                    <View style={styles.scoreSection}>
                                        <Text style={styles.sectionTitle}>Score Statistics</Text>
                                        <View style={styles.scoreRow}>
                                            <View style={styles.scoreItem}>
                                                <Text style={styles.scoreValue}>{examReport.statistics.avg_score}%</Text>
                                                <Text style={styles.scoreLabel}>Average</Text>
                                            </View>
                                            <View style={styles.scoreItem}>
                                                <Text style={[styles.scoreValue, { color: '#10B981' }]}>{examReport.statistics.max_score}%</Text>
                                                <Text style={styles.scoreLabel}>Highest</Text>
                                            </View>
                                            <View style={styles.scoreItem}>
                                                <Text style={[styles.scoreValue, { color: '#EF4444' }]}>{examReport.statistics.min_score}%</Text>
                                                <Text style={styles.scoreLabel}>Lowest</Text>
                                            </View>
                                            <View style={styles.scoreItem}>
                                                <Text style={[styles.scoreValue, { color: '#6366F1' }]}>{examReport.statistics.pass_rate}%</Text>
                                                <Text style={styles.scoreLabel}>Pass Rate</Text>
                                            </View>
                                        </View>
                                    </View>
                                )}

                                {/* Attendee List */}
                                <Text style={styles.sectionTitle}>Attendee Details</Text>
                                {examReport.attendees.map((attendee, idx) => (
                                    <View key={idx} style={styles.attendeeCard}>
                                        <View style={styles.attendeeHeader}>
                                            <View style={styles.attendeeAvatar}>
                                                <Text style={styles.avatarText}>
                                                    {attendee.user_name?.charAt(0)?.toUpperCase() || '?'}
                                                </Text>
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.attendeeName}>{attendee.user_name}</Text>
                                                <Text style={styles.attendeeEmail}>{attendee.user_email}</Text>
                                            </View>
                                            <View style={[
                                                styles.attendeeStatus,
                                                {
                                                    backgroundColor: attendee.completed ? '#ECFDF5' :
                                                        attendee.marked_present ? '#FEF3C7' :
                                                            '#FEE2E2'
                                                }
                                            ]}>
                                                <Text style={[
                                                    styles.attendeeStatusText,
                                                    {
                                                        color: attendee.completed ? '#059669' :
                                                            attendee.marked_present ? '#D97706' :
                                                                '#DC2626'
                                                    }
                                                ]}>
                                                    {attendee.completed ? 'Completed' :
                                                        attendee.started_exam ? 'In Progress' :
                                                            attendee.marked_present ? 'Present' :
                                                                attendee.marked_by ? 'Absent' : 'Pending'}
                                                </Text>
                                            </View>
                                        </View>

                                        {/* Submission Details */}
                                        {attendee.submission && (
                                            <View style={styles.submissionDetails}>
                                                <View style={styles.submissionRow}>
                                                    <Text style={styles.submissionLabel}>Score:</Text>
                                                    <Text style={[
                                                        styles.submissionValue,
                                                        { color: attendee.submission.passed ? '#10B981' : '#EF4444' }
                                                    ]}>
                                                        {attendee.submission.score_percent}%
                                                        ({attendee.submission.correct_count}/{attendee.submission.total_questions})
                                                    </Text>
                                                </View>
                                                <View style={styles.submissionRow}>
                                                    <Text style={styles.submissionLabel}>Result:</Text>
                                                    <Text style={[
                                                        styles.submissionValue,
                                                        { color: attendee.submission.passed ? '#10B981' : '#EF4444' }
                                                    ]}>
                                                        {attendee.submission.passed ? '✓ Passed' : '✗ Failed'}
                                                    </Text>
                                                </View>
                                                <View style={styles.submissionRow}>
                                                    <Text style={styles.submissionLabel}>Time Taken:</Text>
                                                    <Text style={styles.submissionValue}>
                                                        {Math.floor(attendee.submission.time_taken_seconds / 60)}m {attendee.submission.time_taken_seconds % 60}s
                                                    </Text>
                                                </View>

                                                {/* Proctoring Violations Section */}
                                                {attendee.submission.violations > 0 && (
                                                    <View style={styles.breachSection}>
                                                        <View style={styles.breachHeader}>
                                                            <Feather name="alert-triangle" size={16} color="#EF4444" />
                                                            <Text style={styles.breachHeaderText}>
                                                                {attendee.submission.violations} Proctoring Violations
                                                            </Text>
                                                        </View>

                                                        {/* Breach Log Details */}
                                                        {attendee.submission.breach_log && attendee.submission.breach_log.length > 0 && (
                                                            <View style={styles.breachList}>
                                                                {attendee.submission.breach_log.slice(0, 5).map((breach, bIdx) => (
                                                                    <View key={bIdx} style={styles.breachItem}>
                                                                        <View style={[
                                                                            styles.breachDot,
                                                                            { backgroundColor: breach.severity === 'critical' ? '#EF4444' : '#F59E0B' }
                                                                        ]} />
                                                                        <View style={{ flex: 1 }}>
                                                                            <Text style={styles.breachLabel}>{breach.label || breach.type}</Text>
                                                                            <Text style={styles.breachTime}>
                                                                                Q{breach.questionNumber || '?'} • {breach.severity}
                                                                            </Text>
                                                                        </View>
                                                                    </View>
                                                                ))}
                                                                {attendee.submission.breach_log.length > 5 && (
                                                                    <Text style={styles.moreBreaches}>
                                                                        +{attendee.submission.breach_log.length - 5} more violations
                                                                    </Text>
                                                                )}
                                                            </View>
                                                        )}
                                                    </View>
                                                )}
                                            </View>
                                        )}
                                    </View>
                                ))}

                                <View style={{ height: 40 }} />
                            </Animated.View>
                        ) : (
                            <View style={styles.emptyState}>
                                <Feather name="alert-circle" size={40} color="#EF4444" />
                                <Text style={styles.emptyText}>Failed to load report</Text>
                                <TouchableOpacity style={styles.generatePinBtn} onPress={() => fetchExamReport(selectedExam.id)}>
                                    <Text style={styles.generatePinBtnText}>Retry</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </ScrollView>
                ) : (
                    // List View
                    <>
                        {/* Filter Tabs */}
                        <View style={styles.filterRow}>
                            {['all', 'scheduled', 'ongoing', 'completed'].map((f) => (
                                <TouchableOpacity
                                    key={f}
                                    style={[styles.filterTab, filter === f && styles.filterTabActive]}
                                    onPress={() => setFilter(f)}
                                >
                                    <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
                                        {f.charAt(0).toUpperCase() + f.slice(1)}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                            {loading ? (
                                <ActivityIndicator color="#6366F1" style={{ marginTop: 40 }} />
                            ) : filteredExams.length === 0 ? (
                                <View style={styles.emptyState}>
                                    <MaterialCommunityIcons name="clipboard-text-outline" size={48} color="#9CA3AF" />
                                    <Text style={styles.emptyText}>No exams found</Text>
                                </View>
                            ) : (
                                filteredExams.map((exam, idx) => (
                                    <Animated.View key={exam.id} entering={FadeInDown.delay(idx * 50)}>
                                        <TouchableOpacity
                                            style={styles.examCard}
                                            onPress={() => handleExamPress(exam)}
                                        >
                                            <View style={styles.examCardHeader}>
                                                <Text style={styles.examCardTitle}>{exam.title}</Text>
                                                <View style={[
                                                    styles.statusBadgeSmall,
                                                    { backgroundColor: getStatusColor(exam.status).bg }
                                                ]}>
                                                    <Text style={[
                                                        styles.statusTextSmall,
                                                        { color: getStatusColor(exam.status).text }
                                                    ]}>
                                                        {getStatusLabel(exam.status)}
                                                    </Text>
                                                </View>
                                            </View>

                                            <Text style={styles.examCardMeta}>
                                                📅 {formatDate(exam.exam_date)} • ⏰ {exam.exam_time} • 📍 {exam.location}
                                            </Text>

                                            {/* PIN Display Section - Only for PIN-enabled exams */}
                                            {(exam.pin_enabled || exam.pinEnabled) && (
                                                <View style={styles.pinListSection}>
                                                    <View style={styles.pinListHeader}>
                                                        <Feather name="key" size={14} color="#8B5CF6" />
                                                        <Text style={styles.pinListLabel}>Check-in PIN</Text>
                                                    </View>
                                                    <View style={styles.pinListContent}>
                                                        {(exam.generated_pin || exam.generatedPin) ? (
                                                            <>
                                                                <View style={[
                                                                    styles.pinListBox,
                                                                    !(pinStatus[exam.id]?.is_active ?? isPinActive(exam)) && styles.pinListBoxExpired
                                                                ]}>
                                                                    <Text style={[
                                                                        styles.pinListCode,
                                                                        !(pinStatus[exam.id]?.is_active ?? isPinActive(exam)) && styles.pinListCodeExpired
                                                                    ]}>
                                                                        {exam.generated_pin || exam.generatedPin}
                                                                    </Text>
                                                                </View>
                                                                <Text style={[
                                                                    styles.pinListStatus,
                                                                    { color: (pinStatus[exam.id]?.is_active ?? isPinActive(exam)) ? '#10B981' : '#EF4444' }
                                                                ]}>
                                                                    {(pinStatus[exam.id]?.is_active ?? isPinActive(exam)) ? '● Active' : '○ Expired'}
                                                                </Text>
                                                            </>
                                                        ) : (
                                                            <Text style={styles.pinListNone}>Not Generated</Text>
                                                        )}
                                                        <TouchableOpacity
                                                            style={[
                                                                styles.pinListBtn,
                                                                pinLoading[exam.id] && styles.pinListBtnDisabled
                                                            ]}
                                                            onPress={(e) => {
                                                                e.stopPropagation();
                                                                handleGeneratePin(exam.id, exam.title);
                                                            }}
                                                            disabled={pinLoading[exam.id]}
                                                        >
                                                            {pinLoading[exam.id] ? (
                                                                <ActivityIndicator color="#FFF" size="small" />
                                                            ) : (
                                                                <>
                                                                    <Feather name="refresh-cw" size={12} color="#FFF" />
                                                                    <Text style={styles.pinListBtnText}>
                                                                        {(exam.generated_pin || exam.generatedPin) ? 'Renew' : 'Generate'}
                                                                    </Text>
                                                                </>
                                                            )}
                                                        </TouchableOpacity>
                                                    </View>
                                                </View>
                                            )}

                                            <View style={styles.examCardStats}>
                                                <View style={styles.miniStat}>
                                                    <Text style={styles.miniStatValue}>{exam.stats?.total_assigned || 0}</Text>
                                                    <Text style={styles.miniStatLabel}>Assigned</Text>
                                                </View>
                                                <View style={styles.miniStat}>
                                                    <Text style={[styles.miniStatValue, { color: '#10B981' }]}>{exam.stats?.marked_present || 0}</Text>
                                                    <Text style={styles.miniStatLabel}>Present</Text>
                                                </View>
                                                <View style={styles.miniStat}>
                                                    <Text style={[styles.miniStatValue, { color: '#6366F1' }]}>{exam.stats?.completed || 0}</Text>
                                                    <Text style={styles.miniStatLabel}>Completed</Text>
                                                </View>
                                                <View style={styles.miniStat}>
                                                    <Text style={styles.miniStatValue}>{exam.stats?.avg_score || 0}%</Text>
                                                    <Text style={styles.miniStatLabel}>Avg Score</Text>
                                                </View>
                                            </View>

                                            <View style={styles.viewDetailsRow}>
                                                <Text style={styles.viewDetailsText}>View Full Report</Text>
                                                <Feather name="chevron-right" size={16} color="#6366F1" />
                                            </View>
                                        </TouchableOpacity>
                                    </Animated.View>
                                ))
                            )}
                            <View style={{ height: 40 }} />
                        </ScrollView>
                    </>
                )}
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        marginTop: 50,
        backgroundColor: '#0F172A',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    headerTitle: {
        fontSize: 20,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
    },
    closeBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    content: {
        flex: 1,
        padding: 16,
    },
    filterRow: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 8,
    },
    filterTab: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    filterTabActive: {
        backgroundColor: '#6366F1',
    },
    filterText: {
        fontSize: 13,
        fontFamily: 'Poppins_500Medium',
        color: '#9CA3AF',
    },
    filterTextActive: {
        color: '#FFF',
    },
    examCard: {
        backgroundColor: '#1E293B',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#334155',
    },
    examCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    examCardTitle: {
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
        flex: 1,
    },
    statusBadgeSmall: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    statusTextSmall: {
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
    },
    examCardMeta: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#94A3B8',
        marginBottom: 12,
    },
    examCardStats: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        backgroundColor: '#0F172A',
        borderRadius: 12,
        padding: 12,
        marginBottom: 12,
    },
    miniStat: {
        alignItems: 'center',
    },
    miniStatValue: {
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
    },
    miniStatLabel: {
        fontSize: 10,
        fontFamily: 'Poppins_400Regular',
        color: '#64748B',
        marginTop: 2,
    },
    viewDetailsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
    },
    viewDetailsText: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
        color: '#6366F1',
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
    },
    emptyText: {
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        color: '#64748B',
        marginTop: 12,
    },
    backBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
    },
    backBtnText: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#6366F1',
    },
    examHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    examTitle: {
        fontSize: 22,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
        flex: 1,
    },
    statusBadge: {
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 16,
        borderWidth: 1,
    },
    statusText: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
    },
    examMeta: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        color: '#94A3B8',
        marginBottom: 20,
    },
    statsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 24,
    },
    statCard: {
        flex: 1,
        minWidth: '45%',
        backgroundColor: '#1E293B',
        borderRadius: 16,
        padding: 16,
        alignItems: 'center',
    },
    statValue: {
        fontSize: 28,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
    },
    statLabel: {
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
        color: '#64748B',
        marginTop: 4,
    },
    scoreSection: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
        marginBottom: 12,
    },
    scoreRow: {
        flexDirection: 'row',
        backgroundColor: '#1E293B',
        borderRadius: 16,
        padding: 16,
        justifyContent: 'space-around',
    },
    scoreItem: {
        alignItems: 'center',
    },
    scoreValue: {
        fontSize: 20,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
    },
    scoreLabel: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        color: '#64748B',
        marginTop: 4,
    },
    attendeeCard: {
        backgroundColor: '#1E293B',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
    },
    attendeeHeader: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    attendeeAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#6366F1',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    avatarText: {
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
    },
    attendeeName: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
    },
    attendeeEmail: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#64748B',
    },
    attendeeStatus: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    attendeeStatusText: {
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
    },
    submissionDetails: {
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#334155',
    },
    submissionRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    submissionLabel: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        color: '#64748B',
    },
    submissionValue: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
    },
    breachSection: {
        marginTop: 12,
        backgroundColor: 'rgba(239, 68, 68, 0.1)', // Red tint
        borderRadius: 12,
        padding: 12,
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.2)',
    },
    breachHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
        gap: 8,
    },
    breachHeaderText: {
        fontSize: 13,
        fontFamily: 'Poppins_700Bold',
        color: '#EF4444',
    },
    breachList: {
        marginTop: 4,
    },
    breachItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 8,
        gap: 8,
    },
    breachDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginTop: 6,
    },
    breachLabel: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
        color: '#F87171',
    },
    breachTime: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        color: '#FCA5A5',
    },
    moreBreaches: {
        fontSize: 11,
        fontFamily: 'Poppins_500Medium',
        color: '#EF4444',
        fontStyle: 'italic',
        marginTop: 4,
    },
    // PIN Management Styles
    pinSection: {
        marginBottom: 24,
    },
    pinCard: {
        backgroundColor: '#1E293B',
        borderRadius: 16,
        padding: 20,
        borderWidth: 1,
        borderColor: '#8B5CF6',
    },
    pinDisplayContainer: {
        alignItems: 'center',
        marginBottom: 16,
    },
    pinLabel: {
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
        color: '#94A3B8',
        marginBottom: 8,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    pinDisplay: {
        backgroundColor: '#8B5CF6',
        paddingHorizontal: 32,
        paddingVertical: 16,
        borderRadius: 16,
        marginBottom: 8,
    },
    pinDisplayExpired: {
        backgroundColor: '#374151',
    },
    pinCode: {
        fontSize: 48,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
        letterSpacing: 12,
    },
    pinCodeExpired: {
        color: '#9CA3AF',
        textDecorationLine: 'line-through',
    },
    pinStatus: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
    },
    pinInstructions: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#94A3B8',
        textAlign: 'center',
        marginBottom: 16,
        lineHeight: 18,
    },
    noPinContainer: {
        alignItems: 'center',
        paddingVertical: 20,
    },
    noPinText: {
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
        color: '#94A3B8',
        marginTop: 12,
    },
    noPinSubtext: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        color: '#64748B',
        marginTop: 4,
    },
    generatePinBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#8B5CF6',
        paddingVertical: 14,
        borderRadius: 12,
        gap: 8,
    },
    generatePinBtnDisabled: {
        backgroundColor: '#6B7280',
    },
    generatePinBtnText: {
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
    },
    // PIN List Styles (for exam cards in list view)
    pinListSection: {
        backgroundColor: 'rgba(139, 92, 246, 0.1)',
        borderRadius: 12,
        padding: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(139, 92, 246, 0.3)',
    },
    pinListHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 8,
    },
    pinListLabel: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
        color: '#8B5CF6',
    },
    pinListContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    pinListBox: {
        backgroundColor: '#8B5CF6',
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 8,
    },
    pinListBoxExpired: {
        backgroundColor: '#4B5563',
    },
    pinListCode: {
        fontSize: 20,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
        letterSpacing: 4,
    },
    pinListCodeExpired: {
        textDecorationLine: 'line-through',
        color: '#9CA3AF',
    },
    pinListStatus: {
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
        flex: 1,
    },
    pinListNone: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        color: '#9CA3AF',
        flex: 1,
    },
    pinListBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#8B5CF6',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
        gap: 4,
    },
    pinListBtnDisabled: {
        backgroundColor: '#6B7280',
    },
    pinListBtnText: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
    },
});
