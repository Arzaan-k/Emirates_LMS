import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Dimensions,
    Modal,
    Alert,
    ActivityIndicator
} from 'react-native';
import { MaterialCommunityIcons, Feather, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Camera, CameraView, useCameraPermissions } from 'expo-camera';
import Animated, {
    FadeInDown,
    FadeInUp,
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    withSequence,
    withRepeat
} from 'react-native-reanimated';
import API_URL from '../config';

const { width, height } = Dimensions.get('window');

// Level colors and icons - must include all possible roles
const LEVEL_COLORS = {
    'Crew Member': '#9CA3AF',
    'Silver Crew': '#60A5FA',
    'Gold Crew': '#D71A21',
    'Shift Manager': '#8B5CF6',
    'Assistant Airport Manager': '#EF4444',
    'Airport Manager': '#C084FC',
    // Default fallback
    'default': '#6B7280'
};

const LEVEL_ICONS = {
    'Crew Member': 'account',
    'Silver Crew': 'medal-outline',
    'Gold Crew': 'medal',
    'Shift Manager': 'account-tie',
    'Assistant Airport Manager': 'airplane',
    'Airport Manager': 'crown',
    // Default fallback
    'default': 'star'
};

// Helper function to safely get level color (prevents undefined color errors)
const getLevelColor = (role) => LEVEL_COLORS[role] || LEVEL_COLORS['default'];
const getLevelIcon = (role) => LEVEL_ICONS[role] || LEVEL_ICONS['default'];

// Eligibility Check Component
const EligibilityModal = ({ visible, eligibility, onGenerateExam, onClose, loading, isReappear = false }) => {
    if (!visible) return null;

    const isEligible = eligibility?.eligible;
    const config = eligibility?.config || {};

    return (
        <Modal transparent visible={visible} animationType="fade">
            <View style={eligibilityStyles.overlay}>
                <Animated.View entering={FadeInUp.springify()} style={eligibilityStyles.container}>
                    <LinearGradient
                        colors={isEligible ? ['#1F2937', '#111827'] : ['#1F2937', '#1C1917']}
                        style={eligibilityStyles.gradient}
                    >
                        {/* Close Button */}
                        <TouchableOpacity style={eligibilityStyles.closeBtn} onPress={onClose}>
                            <Feather name="x" size={24} color="#9CA3AF" />
                        </TouchableOpacity>

                        {isEligible ? (
                            <>
                                {/* Ready Banner */}
                                <View style={eligibilityStyles.readyBanner}>
                                    <MaterialCommunityIcons
                                        name={isReappear ? "refresh-circle" : "trophy-award"}
                                        size={48}
                                        color={isReappear ? "#60A5FA" : "#D71A21"}
                                    />
                                </View>
                                {isReappear && (
                                    <View style={eligibilityStyles.practiceBanner}>
                                        <MaterialCommunityIcons name="book-open-variant" size={16} color="#60A5FA" />
                                        <Text style={eligibilityStyles.practiceBannerText}>Practice Mode — Won't affect your profile</Text>
                                    </View>
                                )}
                                <Text style={eligibilityStyles.title}>
                                    {isReappear ? 'Retake for Revision 📖' : 'Ready for Advancement! 🎉'}
                                </Text>
                                <Text style={eligibilityStyles.subtitle}>
                                    {isReappear
                                        ? "You've already passed this level. Retake the exam for practice and revision."
                                        : "You've completed all courses. Take the exam to advance to"
                                    }
                                </Text>

                                {/* Target Role — only shown in advancement mode */}
                                {!isReappear && (
                                    <View style={[eligibilityStyles.roleBadge, { backgroundColor: getLevelColor(eligibility.target_role) + '30' }]}>
                                        <MaterialCommunityIcons
                                            name={getLevelIcon(eligibility.target_role)}
                                            size={28}
                                            color={getLevelColor(eligibility.target_role)}
                                        />
                                        <Text style={[eligibilityStyles.roleName, { color: getLevelColor(eligibility.target_role) }]}>
                                            {eligibility.target_role}
                                        </Text>
                                    </View>
                                )}

                                {/* Exam Details */}
                                <View style={eligibilityStyles.detailsCard}>
                                    <Text style={eligibilityStyles.detailsTitle}>Exam Details</Text>
                                    <View style={eligibilityStyles.detailRow}>
                                        <Feather name="help-circle" size={18} color="#9CA3AF" />
                                        <Text style={eligibilityStyles.detailText}>
                                            {config.exam_questions} Questions
                                        </Text>
                                    </View>
                                    <View style={eligibilityStyles.detailRow}>
                                        <Feather name="clock" size={18} color="#9CA3AF" />
                                        <Text style={eligibilityStyles.detailText}>
                                            {config.exam_time_minutes} Minutes Time Limit
                                        </Text>
                                    </View>
                                    <View style={eligibilityStyles.detailRow}>
                                        <Feather name="percent" size={18} color="#9CA3AF" />
                                        <Text style={eligibilityStyles.detailText}>
                                            {config.pass_percent}% Required to Pass
                                        </Text>
                                    </View>
                                    {config.proctored && (
                                        <View style={eligibilityStyles.detailRow}>
                                            <Feather name="camera" size={18} color="#EF4444" />
                                            <Text style={[eligibilityStyles.detailText, { color: '#EF4444' }]}>
                                                Proctored Exam - Camera Required
                                            </Text>
                                        </View>
                                    )}
                                </View>

                                {/* Warning */}
                                <View style={eligibilityStyles.warningBox}>
                                    <MaterialCommunityIcons name="alert" size={20} color="#D71A21" />
                                    <Text style={eligibilityStyles.warningText}>
                                        This exam covers all content from your current level.
                                        Results will be sent to your manager.
                                    </Text>
                                </View>

                                {/* Start Button */}
                                <TouchableOpacity
                                    style={eligibilityStyles.startBtn}
                                    onPress={onGenerateExam}
                                    disabled={loading}
                                >
                                    {loading ? (
                                        <ActivityIndicator color="#111827" />
                                    ) : (
                                        <>
                                            <Text style={eligibilityStyles.startBtnText}>
                                                {isReappear ? 'Start Practice' : 'Start Exam'}
                                            </Text>
                                            <Feather name="arrow-right" size={20} color="#111827" />
                                        </>
                                    )}
                                </TouchableOpacity>
                            </>
                        ) : (
                            <>
                                {/* Not Ready */}
                                <View style={eligibilityStyles.notReadyBanner}>
                                    <MaterialCommunityIcons name="lock" size={48} color="#6B7280" />
                                </View>
                                <Text style={eligibilityStyles.title}>Not Yet Eligible</Text>
                                <Text style={eligibilityStyles.subtitle}>
                                    {eligibility?.reason || "Complete all required courses first."}
                                </Text>

                                {eligibility?.courses_remaining && (
                                    <View style={eligibilityStyles.progressCard}>
                                        <Text style={eligibilityStyles.progressText}>
                                            {eligibility.courses_total - eligibility.courses_remaining} / {eligibility.courses_total} courses completed
                                        </Text>
                                        <View style={eligibilityStyles.progressBar}>
                                            <View
                                                style={[
                                                    eligibilityStyles.progressFill,
                                                    {
                                                        width: `${((eligibility.courses_total - eligibility.courses_remaining) / eligibility.courses_total) * 100}%`
                                                    }
                                                ]}
                                            />
                                        </View>
                                    </View>
                                )}

                                <TouchableOpacity style={eligibilityStyles.closeFullBtn} onPress={onClose}>
                                    <Text style={eligibilityStyles.closeFullBtnText}>Continue Learning</Text>
                                </TouchableOpacity>
                            </>
                        )}
                    </LinearGradient>
                </Animated.View>
            </View>
        </Modal>
    );
};

// Main Role Advancement Exam Component
export default function RoleAdvancementExam({ userEmail, onComplete, visible, onClose, overrideCurrentRole, isReappear = false }) {
    const [status, setStatus] = useState('checking'); // checking, eligible, not_eligible, exam, result
    const [eligibility, setEligibility] = useState(null);
    const [exam, setExam] = useState(null);
    const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
    const [answers, setAnswers] = useState({});
    const [timeRemaining, setTimeRemaining] = useState(0);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);

    // Proctoring states
    const [cameraPermission, requestCameraPermission] = useCameraPermissions();
    const cameraRef = useRef(null);
    const [violations, setViolations] = useState(0);
    const [breachLog, setBreachLog] = useState([]);
    const [criticalBreaches, setCriticalBreaches] = useState(0);
    const [warningBreaches, setWarningBreaches] = useState(0);
    const examStartTime = useRef(null);

    // Timer effect
    useEffect(() => {
        let timer;
        if (status === 'exam' && timeRemaining > 0) {
            timer = setInterval(() => {
                setTimeRemaining(prev => {
                    if (prev <= 1) {
                        submitExam(true); // Auto-submit when time runs out
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
        return () => clearInterval(timer);
    }, [status, timeRemaining]);

    // Check eligibility on mount
    useEffect(() => {
        if (visible) {
            checkEligibility();
        }
    }, [visible]);

    const checkEligibility = async () => {
        setStatus('checking');
        try {
            const roleParam = overrideCurrentRole
                ? `?current_role=${encodeURIComponent(overrideCurrentRole)}`
                : '';
            const response = await fetch(`${API_URL}/api/v1/levels/role-advancement/eligibility/${userEmail}${roleParam}`);
            const data = await response.json();
            // In reappear mode, user is always allowed to practice regardless of eligibility
            if (isReappear) {
                setEligibility({ ...data, eligible: true });
                setStatus('eligible');
            } else {
                setEligibility(data);
                setStatus(data.eligible ? 'eligible' : 'not_eligible');
            }
        } catch (err) {
            console.error("Error checking eligibility:", err);
            Alert.alert("Error", "Failed to check eligibility");
            onClose();
        }
    };

    const generateExam = async () => {
        setLoading(true);
        try {
            // Request camera permission if proctored
            if (eligibility?.config?.proctored) {
                const { granted } = await requestCameraPermission();
                if (!granted) {
                    Alert.alert(
                        "Camera Required",
                        "This is a proctored exam. Camera access is required to proceed."
                    );
                    setLoading(false);
                    return;
                }
            }

            const formData = new FormData();
            formData.append("user_email", userEmail);
            if (overrideCurrentRole) {
                formData.append("current_role", overrideCurrentRole);
            }

            const response = await fetch(`${API_URL}/api/v1/levels/role-advancement/generate-exam`, {
                method: "POST",
                body: formData,
            });
            const data = await response.json();

            if (data.status === "success" || data.status === "exists") {
                // Fetch the exam
                const roleParam = overrideCurrentRole
                    ? `?current_role=${encodeURIComponent(overrideCurrentRole)}`
                    : '';
                const examResponse = await fetch(`${API_URL}/api/v1/levels/role-advancement/exam/${userEmail}${roleParam}`);
                const examData = await examResponse.json();

                if (examData.status === "success") {
                    setExam(examData.exam);
                    setTimeRemaining(examData.exam.time_limit_minutes * 60);
                    examStartTime.current = Date.now();
                    setStatus('exam');
                }
            } else {
                Alert.alert("Error", data.message || "Failed to generate exam");
            }
        } catch (err) {
            console.error("Error generating exam:", err);
            Alert.alert("Error", "Failed to generate exam");
        }
        setLoading(false);
    };

    const handleAnswer = (questionIdx, optionIdx) => {
        setAnswers(prev => ({ ...prev, [questionIdx]: optionIdx }));
    };

    const recordViolation = (type, severity = 'warning') => {
        const violation = {
            type,
            severity,
            timestamp: new Date().toISOString(),
            question: currentQuestionIdx + 1
        };
        setBreachLog(prev => [...prev, violation]);
        setViolations(prev => prev + 1);

        if (severity === 'critical') {
            setCriticalBreaches(prev => prev + 1);
        } else {
            setWarningBreaches(prev => prev + 1);
        }

        // Check if max violations exceeded
        if (exam?.max_violations && violations + 1 > exam.max_violations) {
            Alert.alert(
                "⚠️ Too Many Violations",
                "You have exceeded the maximum allowed violations. The exam will be submitted.",
                [{ text: "OK", onPress: () => submitExam(true) }]
            );
        }
    };

    const submitExam = async (autoSubmit = false) => {
        if (!autoSubmit) {
            const unanswered = exam.questions.length - Object.keys(answers).length;
            if (unanswered > 0) {
                Alert.alert(
                    "Unanswered Questions",
                    `You have ${unanswered} unanswered question(s). Are you sure you want to submit?`,
                    [
                        { text: "Cancel", style: "cancel" },
                        { text: "Submit Anyway", onPress: () => doSubmit() }
                    ]
                );
                return;
            }
        }
        doSubmit();
    };

    const doSubmit = async () => {
        setLoading(true);
        try {
            const timeTaken = Math.floor((Date.now() - examStartTime.current) / 1000);
            const answersArray = exam.questions.map((_, idx) => answers[idx] ?? -1);

            const formData = new FormData();
            formData.append("user_email", userEmail);
            formData.append("exam_id", exam.exam_id);
            formData.append("answers", JSON.stringify(answersArray));
            formData.append("time_taken_seconds", timeTaken.toString());
            formData.append("violations", violations.toString());
            formData.append("breach_log", JSON.stringify(breachLog));
            formData.append("critical_breaches", criticalBreaches.toString());
            formData.append("warning_breaches", warningBreaches.toString());
            if (isReappear) {
                formData.append("is_practice", "true");
            }
            if (overrideCurrentRole) {
                formData.append("current_role", overrideCurrentRole);
            }

            const response = await fetch(`${API_URL}/api/v1/levels/role-advancement/submit-exam`, {
                method: "POST",
                body: formData,
            });
            const data = await response.json();

            if (data.status === "success") {
                setResult(data.result);
                setStatus('result');
                // Only trigger role advancement callback in normal (non-practice) mode
                if (!isReappear && data.result?.passed) {
                    onComplete?.(data.result);
                }
            } else {
                Alert.alert("Error", data.message || "Failed to submit exam");
            }
        } catch (err) {
            console.error("Error submitting exam:", err);
            Alert.alert("Error", "Failed to submit exam");
        }
        setLoading(false);
    };

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const handleClose = () => {
        // Only trigger role advancement in normal mode, not practice
        if (!isReappear && result?.passed && onComplete) {
            onComplete(result);
        }
        onClose();
    };

    if (!visible) return null;

    // Checking state
    if (status === 'checking') {
        return (
            <Modal visible={visible} animationType="slide">
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#D71A21" />
                    <Text style={styles.loadingText}>Checking eligibility...</Text>
                </View>
            </Modal>
        );
    }

    // Eligibility Modal
    if (status === 'eligible' || status === 'not_eligible') {
        return (
            <EligibilityModal
                visible={true}
                eligibility={eligibility}
                onGenerateExam={generateExam}
                onClose={onClose}
                loading={loading}
                isReappear={isReappear}
            />
        );
    }

    // Exam Taking View
    if (status === 'exam') {
        const currentQuestion = exam?.questions?.[currentQuestionIdx];
        const isLowTime = timeRemaining < 60;

        return (
            <Modal visible={visible} animationType="slide">
                <View style={styles.examContainer}>
                    <LinearGradient colors={['#1F2937', '#111827']} style={StyleSheet.absoluteFill} />

                    {/* Header with Timer */}
                    <View style={styles.examHeader}>
                        <View>
                            <Text style={styles.examTitle}>Role Advancement Exam</Text>
                            <Text style={styles.examSubtitle}>{exam.current_role} → {exam.target_role}</Text>
                        </View>
                        <View style={[styles.timerBox, isLowTime && styles.timerBoxLow]}>
                            <Feather name="clock" size={16} color={isLowTime ? "#EF4444" : "#D71A21"} />
                            <Text style={[styles.timerText, isLowTime && styles.timerTextLow]}>
                                {formatTime(timeRemaining)}
                            </Text>
                        </View>
                    </View>

                    {/* Progress Bar */}
                    <View style={styles.progressContainer}>
                        <View style={styles.progressBarExam}>
                            <View
                                style={[
                                    styles.progressFillExam,
                                    { width: `${((currentQuestionIdx + 1) / exam.questions.length) * 100}%` }
                                ]}
                            />
                        </View>
                        <Text style={styles.progressText}>
                            {currentQuestionIdx + 1} / {exam.questions.length}
                        </Text>
                    </View>

                    {/* Camera Preview (if proctored) */}
                    {exam.proctored && cameraPermission?.granted && (
                        <View style={styles.cameraPreview}>
                            <CameraView
                                ref={cameraRef}
                                style={StyleSheet.absoluteFill}
                                facing="front"
                            />
                            <View style={styles.cameraOverlay}>
                                <View style={styles.cameraIndicator}>
                                    <View style={styles.recordingDot} />
                                    <Text style={styles.recordingText}>Proctored</Text>
                                </View>
                            </View>
                        </View>
                    )}

                    {/* Question */}
                    <ScrollView style={styles.questionScroll} contentContainerStyle={{ paddingBottom: 100 }}>
                        <Animated.View entering={FadeInDown.delay(100)} key={currentQuestionIdx}>
                            <Text style={styles.questionNumber}>Question {currentQuestionIdx + 1}</Text>
                            <Text style={styles.questionText}>{currentQuestion?.question}</Text>

                            {/* Options */}
                            {currentQuestion?.options?.map((option, idx) => {
                                const isSelected = answers[currentQuestionIdx] === idx;
                                return (
                                    <TouchableOpacity
                                        key={idx}
                                        style={[styles.optionBtn, isSelected && styles.optionBtnSelected]}
                                        onPress={() => handleAnswer(currentQuestionIdx, idx)}
                                    >
                                        <View style={[styles.optionCircle, isSelected && styles.optionCircleSelected]}>
                                            {isSelected && <View style={styles.optionDot} />}
                                        </View>
                                        <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                                            {option}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </Animated.View>
                    </ScrollView>

                    {/* Navigation */}
                    <View style={styles.navContainer}>
                        <TouchableOpacity
                            style={[styles.navBtn, currentQuestionIdx === 0 && styles.navBtnDisabled]}
                            onPress={() => setCurrentQuestionIdx(prev => Math.max(0, prev - 1))}
                            disabled={currentQuestionIdx === 0}
                        >
                            <Feather name="chevron-left" size={20} color="#FFF" />
                            <Text style={styles.navBtnText}>Previous</Text>
                        </TouchableOpacity>

                        {currentQuestionIdx < exam.questions.length - 1 ? (
                            <TouchableOpacity
                                style={styles.navBtnNext}
                                onPress={() => setCurrentQuestionIdx(prev => prev + 1)}
                            >
                                <Text style={styles.navBtnNextText}>Next</Text>
                                <Feather name="chevron-right" size={20} color="#111827" />
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity
                                style={styles.submitBtn}
                                onPress={() => submitExam()}
                                disabled={loading}
                            >
                                {loading ? (
                                    <ActivityIndicator color="#FFF" />
                                ) : (
                                    <>
                                        <Text style={styles.submitBtnText}>Submit Exam</Text>
                                        <Feather name="check-circle" size={20} color="#FFF" />
                                    </>
                                )}
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* Violations Counter */}
                    {violations > 0 && (
                        <View style={styles.violationsBox}>
                            <MaterialCommunityIcons name="alert-circle" size={16} color="#EF4444" />
                            <Text style={styles.violationsText}>
                                {violations} Violation{violations > 1 ? 's' : ''} Detected
                            </Text>
                        </View>
                    )}
                </View>
            </Modal>
        );
    }

    // Result View
    if (status === 'result') {
        const passed = result?.passed;

        return (
            <Modal visible={visible} animationType="fade">
                <View style={styles.resultContainer}>
                    <LinearGradient
                        colors={passed ? ['#065F46', '#064E3B'] : ['#7F1D1D', '#450A0A']}
                        style={StyleSheet.absoluteFill}
                    />

                    <Animated.View entering={FadeInUp.springify()} style={styles.resultContent}>
                        {/* Icon */}
                        <View style={[styles.resultIcon, passed ? styles.resultIconPass : styles.resultIconFail]}>
                            <MaterialCommunityIcons
                                name={passed ? "trophy" : "close-circle"}
                                size={64}
                                color="#FFF"
                            />
                        </View>

                        {/* Practice Mode Badge */}
                        {isReappear && (
                            <View style={styles.practiceBadge}>
                                <MaterialCommunityIcons name="book-open-variant" size={14} color="#60A5FA" />
                                <Text style={styles.practiceBadgeText}>Practice Mode</Text>
                            </View>
                        )}

                        {/* Title */}
                        <Text style={styles.resultTitle}>
                            {isReappear
                                ? (passed ? "Great Practice! 📖" : "Keep Revising!")
                                : (passed ? "Congratulations! 🎉" : "Keep Trying!")
                            }
                        </Text>
                        <Text style={styles.resultSubtitle}>
                            {isReappear
                                ? (passed ? "You passed the practice exam. Your profile hasn't changed." : "Review the material and try again.")
                                : result?.message
                            }
                        </Text>

                        {/* Score Card */}
                        <View style={styles.scoreCard}>
                            <View style={styles.scoreRow}>
                                <Text style={styles.scoreLabel}>Score</Text>
                                <Text style={styles.scoreValue}>
                                    {result?.score}/{result?.total} ({result?.score_percent}%)
                                </Text>
                            </View>
                            <View style={styles.scoreDivider} />
                            <View style={styles.scoreRow}>
                                <Text style={styles.scoreLabel}>Required</Text>
                                <Text style={styles.scoreValue}>{exam?.pass_percent}%</Text>
                            </View>
                            <View style={styles.scoreDivider} />
                            <View style={styles.scoreRow}>
                                <Text style={styles.scoreLabel}>Integrity</Text>
                                <Text style={[
                                    styles.scoreValue,
                                    result?.integrity_status === 'clean' && { color: '#10B981' },
                                    result?.integrity_status === 'flagged' && { color: '#EF4444' }
                                ]}>
                                    {result?.integrity_status === 'clean' ? 'Clean ✓' :
                                        result?.integrity_status === 'flagged' ? 'Flagged ⚠️' :
                                            result?.integrity_status === 'suspicious' ? 'Suspicious' : 'Minor Issues'}
                                </Text>
                            </View>
                        </View>

                        {/* New Role Badge — only in advancement mode */}
                        {!isReappear && passed && result?.new_role && (
                            <Animated.View
                                entering={FadeInUp.delay(500).springify()}
                                style={[
                                    styles.newRoleBadge,
                                    { backgroundColor: getLevelColor(result.new_role) + '40' }
                                ]}
                            >
                                <MaterialCommunityIcons
                                    name={getLevelIcon(result.new_role)}
                                    size={32}
                                    color={getLevelColor(result.new_role)}
                                />
                                <View>
                                    <Text style={styles.newRoleLabel}>Your New Role</Text>
                                    <Text style={[styles.newRoleText, { color: getLevelColor(result.new_role) }]}>
                                        {result.new_role}
                                    </Text>
                                </View>
                            </Animated.View>
                        )}

                        {/* Close Button */}
                        <TouchableOpacity style={styles.doneBtn} onPress={handleClose}>
                            <Text style={styles.doneBtnText}>
                                {passed ? "Continue" : "Close"}
                            </Text>
                        </TouchableOpacity>
                    </Animated.View>
                </View>
            </Modal>
        );
    }

    return null;
}

// Eligibility Modal Styles
const eligibilityStyles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    container: {
        width: '100%',
        maxWidth: 400,
        borderRadius: 24,
        overflow: 'hidden',
    },
    gradient: {
        padding: 24,
    },
    closeBtn: {
        position: 'absolute',
        top: 16,
        right: 16,
        zIndex: 10,
    },
    readyBanner: {
        alignItems: 'center',
        marginBottom: 16,
        marginTop: 20,
    },
    practiceBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(96, 165, 250, 0.12)',
        borderRadius: 20,
        paddingHorizontal: 12,
        paddingVertical: 4,
        marginBottom: 8,
        gap: 6,
        alignSelf: 'center',
    },
    practiceBannerText: {
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
        color: '#60A5FA',
    },
    notReadyBanner: {
        alignItems: 'center',
        marginBottom: 16,
        marginTop: 20,
    },
    title: {
        fontSize: 24,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
        textAlign: 'center',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        color: '#9CA3AF',
        textAlign: 'center',
        marginBottom: 20,
    },
    roleBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'center',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 16,
        marginBottom: 24,
    },
    roleName: {
        fontSize: 18,
        fontFamily: 'Poppins_700Bold',
        marginLeft: 12,
    },
    detailsCard: {
        backgroundColor: 'rgba(55, 65, 81, 0.5)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
    },
    detailsTitle: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
        marginBottom: 12,
    },
    detailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
    },
    detailText: {
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        color: '#D1D5DB',
        marginLeft: 12,
    },
    warningBox: {
        flexDirection: 'row',
        backgroundColor: 'rgba(245, 158, 11, 0.15)',
        borderRadius: 12,
        padding: 12,
        marginBottom: 20,
    },
    warningText: {
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
        color: '#D71A21',
        marginLeft: 10,
        flex: 1,
    },
    startBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#D71A21',
        paddingVertical: 16,
        borderRadius: 14,
    },
    startBtnText: {
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
        color: '#111827',
        marginRight: 8,
    },
    progressCard: {
        backgroundColor: 'rgba(55, 65, 81, 0.5)',
        borderRadius: 12,
        padding: 16,
        marginBottom: 20,
    },
    progressText: {
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        color: '#D1D5DB',
        marginBottom: 10,
        textAlign: 'center',
    },
    progressBar: {
        height: 8,
        backgroundColor: '#374151',
        borderRadius: 4,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#D71A21',
        borderRadius: 4,
    },
    closeFullBtn: {
        alignItems: 'center',
        paddingVertical: 16,
        borderRadius: 14,
        backgroundColor: '#374151',
    },
    closeFullBtnText: {
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
    },
});

// Main Styles
const styles = StyleSheet.create({
    loadingContainer: {
        flex: 1,
        backgroundColor: '#111827',
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        color: '#FFF',
        fontSize: 16,
        fontFamily: 'Poppins_500Medium',
        marginTop: 16,
    },
    examContainer: {
        flex: 1,
        backgroundColor: '#111827',
    },
    examHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        paddingTop: 50,
    },
    examTitle: {
        fontSize: 18,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
    },
    examSubtitle: {
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
        color: '#D71A21',
        marginTop: 2,
    },
    timerBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(245, 158, 11, 0.2)',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
    },
    timerBoxLow: {
        backgroundColor: 'rgba(239, 68, 68, 0.2)',
    },
    timerText: {
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
        color: '#D71A21',
        marginLeft: 6,
    },
    timerTextLow: {
        color: '#EF4444',
    },
    progressContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        marginBottom: 16,
    },
    progressBarExam: {
        flex: 1,
        height: 6,
        backgroundColor: '#374151',
        borderRadius: 3,
        marginRight: 12,
    },
    progressFillExam: {
        height: '100%',
        backgroundColor: '#10B981',
        borderRadius: 3,
    },
    progressText: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
        color: '#9CA3AF',
    },
    cameraPreview: {
        position: 'absolute',
        top: 110,
        right: 20,
        width: 80,
        height: 100,
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 2,
        borderColor: '#EF4444',
    },
    cameraOverlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 4,
        backgroundColor: 'rgba(0,0,0,0.6)',
    },
    cameraIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    recordingDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#EF4444',
        marginRight: 4,
    },
    recordingText: {
        fontSize: 8,
        fontFamily: 'Poppins_500Medium',
        color: '#FFF',
    },
    questionScroll: {
        flex: 1,
        paddingHorizontal: 20,
    },
    questionNumber: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
        color: '#D71A21',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 8,
    },
    questionText: {
        fontSize: 20,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
        lineHeight: 30,
        marginBottom: 24,
    },
    optionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: '#1F2937',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#374151',
        marginBottom: 12,
    },
    optionBtnSelected: {
        borderColor: '#D71A21',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
    },
    optionCircle: {
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 2,
        borderColor: '#6B7280',
        marginRight: 14,
        justifyContent: 'center',
        alignItems: 'center',
    },
    optionCircleSelected: {
        borderColor: '#D71A21',
    },
    optionDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#D71A21',
    },
    optionText: {
        fontSize: 15,
        fontFamily: 'Poppins_500Medium',
        color: '#E5E7EB',
        flex: 1,
    },
    optionTextSelected: {
        color: '#D71A21',
    },
    navContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 20,
        backgroundColor: 'rgba(17, 24, 39, 0.95)',
        borderTopWidth: 1,
        borderTopColor: '#374151',
    },
    navBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    navBtnDisabled: {
        opacity: 0.5,
    },
    navBtnText: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
        marginLeft: 4,
    },
    navBtnNext: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#D71A21',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 12,
    },
    navBtnNextText: {
        fontSize: 14,
        fontFamily: 'Poppins_700Bold',
        color: '#111827',
        marginRight: 4,
    },
    submitBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#10B981',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 12,
    },
    submitBtnText: {
        fontSize: 14,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
        marginRight: 8,
    },
    violationsBox: {
        position: 'absolute',
        top: 100,
        left: 20,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(239, 68, 68, 0.2)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
    },
    violationsText: {
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
        color: '#EF4444',
        marginLeft: 6,
    },
    resultContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    resultContent: {
        width: '100%',
        paddingHorizontal: 30,
        alignItems: 'center',
    },
    resultIcon: {
        width: 120,
        height: 120,
        borderRadius: 60,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
    },
    resultIconPass: {
        backgroundColor: 'rgba(16, 185, 129, 0.3)',
    },
    resultIconFail: {
        backgroundColor: 'rgba(239, 68, 68, 0.3)',
    },
    practiceBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(96, 165, 250, 0.15)',
        borderRadius: 20,
        paddingHorizontal: 12,
        paddingVertical: 4,
        marginBottom: 12,
        gap: 6,
    },
    practiceBadgeText: {
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
        color: '#60A5FA',
    },
    resultTitle: {
        fontSize: 28,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
        textAlign: 'center',
        marginBottom: 8,
    },
    resultSubtitle: {
        fontSize: 16,
        fontFamily: 'Poppins_500Medium',
        color: 'rgba(255,255,255,0.8)',
        textAlign: 'center',
        marginBottom: 32,
    },
    scoreCard: {
        width: '100%',
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 16,
        padding: 20,
        marginBottom: 24,
    },
    scoreRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    scoreLabel: {
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        color: 'rgba(255,255,255,0.7)',
    },
    scoreValue: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
    },
    scoreDivider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.1)',
        marginVertical: 12,
    },
    newRoleBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingVertical: 16,
        borderRadius: 16,
        marginBottom: 32,
    },
    newRoleLabel: {
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
        color: 'rgba(255,255,255,0.7)',
        marginLeft: 12,
    },
    newRoleText: {
        fontSize: 18,
        fontFamily: 'Poppins_700Bold',
        marginLeft: 12,
    },
    doneBtn: {
        width: '100%',
        backgroundColor: '#FFF',
        paddingVertical: 16,
        borderRadius: 14,
        alignItems: 'center',
    },
    doneBtnText: {
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
        color: '#111827',
    },
});
