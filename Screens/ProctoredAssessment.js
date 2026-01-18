import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    TextInput,
    Alert,
    SafeAreaView,
    Dimensions,
    ActivityIndicator,
    Modal,
    FlatList,
    AppState,
    Vibration,
    Platform
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInRight, FadeIn, useSharedValue, useAnimatedStyle, withRepeat, withTiming } from 'react-native-reanimated';
import * as DocumentPicker from 'expo-document-picker';

import API_URL from '../config';

const { width, height } = Dimensions.get('window');

// Breach Types for Professional Proctoring
const BREACH_TYPES = {
    APP_BACKGROUND: { type: 'app_background', label: 'App Backgrounded', severity: 'critical', icon: 'alert-circle' },
    FACE_NOT_VISIBLE: { type: 'face_not_visible', label: 'Face Not Visible', severity: 'warning', icon: 'eye-off' },
    MULTIPLE_FACES: { type: 'multiple_faces', label: 'Multiple Faces Detected', severity: 'critical', icon: 'users' },
    LOOKING_AWAY: { type: 'looking_away', label: 'Looking Away', severity: 'warning', icon: 'eye' },
    FULLSCREEN_EXIT: { type: 'fullscreen_exit', label: 'Fullscreen Exited', severity: 'warning', icon: 'maximize' },
    AUDIO_DETECTED: { type: 'audio_detected', label: 'Audio/Voice Detected', severity: 'warning', icon: 'mic' },
    RAPID_ANSWERS: { type: 'rapid_answers', label: 'Suspiciously Rapid Answers', severity: 'info', icon: 'zap' },
    COPY_PASTE: { type: 'copy_paste', label: 'Copy/Paste Attempted', severity: 'warning', icon: 'clipboard' },
};

export default function ProctoredAssessment({ route, navigation }) {
    const { userProfile, assessmentData, isScheduledExam } = route.params || {};
    const role = userProfile?.role || "User";
    const userPrivileges = userProfile?.privileges || [];

    // Helper function to check if user has a specific privilege
    const hasPrivilege = (privilege) => {
        // Super Admin always has all privileges
        if (role === 'Super Admin') return true;
        return userPrivileges.includes(privilege);
    };

    // Legacy role-based admin check (for backward compatibility)
    const isRoleBasedAdmin = role === 'Super Admin' || role === 'Ops Manager' || role === 'City Manager' || role === 'Store Manager';

    // New privilege-based checks
    const canCreateManage = hasPrivilege('proctored_create_manage') || isRoleBasedAdmin;
    const canViewResults = hasPrivilege('proctored_view_results') || isRoleBasedAdmin;

    // Combined admin check (can do anything admin-related)
    const isAdmin = canCreateManage || canViewResults;

    // VIEW STATE
    const [viewMode, setViewMode] = useState(assessmentData ? 'taker' : 'list'); // Always start with list unless linked

    // AVAILABLE ASSESSMENTS
    const [assessments, setAssessments] = useState([]);
    const [loadingAssessments, setLoadingAssessments] = useState(true);
    const [selectedAssessment, setSelectedAssessment] = useState(assessmentData || null);

    // CREATOR STATE
    const [title, setTitle] = useState('');
    const [desc, setDesc] = useState('');
    const [timeLimit, setTimeLimit] = useState('30');
    const [passingScore, setPassingScore] = useState('70');
    const [questions, setQuestions] = useState([]);
    const [currentQ, setCurrentQ] = useState('');
    const [options, setOptions] = useState(['', '', '', '']);
    const [correctIdx, setCorrectIdx] = useState(0);
    const [creating, setCreating] = useState(false);

    // AI GENERATION STATE
    const [aiModalVisible, setAiModalVisible] = useState(false);
    const [aiTopic, setAiTopic] = useState('');
    const [aiContent, setAiContent] = useState('');
    const [aiNumQuestions, setAiNumQuestions] = useState('10');
    const [aiDifficulty, setAiDifficulty] = useState('medium');
    const [aiDocumentFile, setAiDocumentFile] = useState(null);
    const [generating, setGenerating] = useState(false);

    // BULK UPLOAD STATE
    const [bulkFile, setBulkFile] = useState(null);
    const [uploadingBulk, setUploadingBulk] = useState(false);

    // TAKER STATE
    const [currentStep, setCurrentStep] = useState(0);
    const [userAnswers, setUserAnswers] = useState([]);
    const [testStarted, setTestStarted] = useState(false);
    const [testSubmitted, setTestSubmitted] = useState(false);
    const [score, setScore] = useState(null);
    const [recordingTime, setRecordingTime] = useState(0);
    const [timeRemaining, setTimeRemaining] = useState(0);
    const [isAiScanning, setIsAiScanning] = useState(false);
    const [permission, requestPermission] = useCameraPermissions();
    const cameraRef = useRef(null);
    const [videoUri, setVideoUri] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [cheatingStatus, setCheatingStatus] = useState('clean'); // clean, warning, critical

    // ENHANCED PROCTORING STATE
    const [breachLog, setBreachLog] = useState([]); // Array of {type, timestamp, description, severity}
    const [totalBreaches, setTotalBreaches] = useState(0);
    const [criticalBreaches, setCriticalBreaches] = useState(0);
    const [warningBreaches, setWarningBreaches] = useState(0);
    const [proctorStatus, setProctorStatus] = useState('initializing'); // initializing, active, warning, critical
    const [faceDetected, setFaceDetected] = useState(true);
    const [lastAnswerTime, setLastAnswerTime] = useState(null);
    const [aiAnalysisActive, setAiAnalysisActive] = useState(false);
    const [showBreachModal, setShowBreachModal] = useState(false);
    const [currentBreachWarning, setCurrentBreachWarning] = useState(null);
    const lastBreachTimeRef = useRef({});
    const pulseAnim = useSharedValue(1);

    // ADMIN RESULTS STATE
    const [viewSubmissions, setViewSubmissions] = useState([]);
    const [loadingSubmissions, setLoadingSubmissions] = useState(false);
    const [selectedSubmissionDetail, setSelectedSubmissionDetail] = useState(null);

    // FETCH AVAILABLE ASSESSMENTS
    useEffect(() => {
        fetchAssessments();
    }, []);

    const fetchAssessments = async () => {
        setLoadingAssessments(true);
        try {
            const url = isAdmin ? `${API_URL}/proctored-assessments/all` : `${API_URL}/proctored-assessments`;
            const response = await fetch(url);
            const data = await response.json();
            setAssessments(data);
        } catch (error) {
            console.error("Failed to fetch assessments:", error);
        } finally {
            setLoadingAssessments(false);
        }
    };

    // LOG BREACH FUNCTION
    const logBreach = useCallback((breachType, customDescription = null) => {
        const now = Date.now();
        const breachKey = breachType.type;

        // Prevent duplicate breaches within 5 seconds
        if (lastBreachTimeRef.current[breachKey] && now - lastBreachTimeRef.current[breachKey] < 5000) {
            return;
        }
        lastBreachTimeRef.current[breachKey] = now;

        const breach = {
            id: `breach_${now}_${Math.random().toString(36).substr(2, 9)}`,
            type: breachType.type,
            label: breachType.label,
            severity: breachType.severity,
            icon: breachType.icon,
            timestamp: new Date().toISOString(),
            timeElapsed: recordingTime,
            description: customDescription || breachType.label,
            questionNumber: currentStep + 1
        };

        setBreachLog(prev => [breach, ...prev]);
        setTotalBreaches(prev => prev + 1);

        if (breachType.severity === 'critical') {
            setCriticalBreaches(prev => prev + 1);
            setCheatingStatus('critical');
            setProctorStatus('critical');
            Vibration.vibrate([100, 200, 100]);
            setCurrentBreachWarning(breach);
        } else if (breachType.severity === 'warning') {
            setWarningBreaches(prev => prev + 1);
            if (cheatingStatus !== 'critical') {
                setCheatingStatus('warning');
                setProctorStatus('warning');
            }
            Vibration.vibrate(100);
        }

        // Auto-dismiss warning after 3 seconds
        if (breachType.severity === 'critical') {
            setTimeout(() => {
                setCurrentBreachWarning(null);
                if (cheatingStatus === 'critical') {
                    setCheatingStatus('warning');
                    setTimeout(() => setCheatingStatus('clean'), 5000);
                }
            }, 4000);
        }
    }, [recordingTime, currentStep, cheatingStatus]);

    // TIMER AND PROCTORING EFFECTS
    useEffect(() => {
        let interval;
        let aiScanInterval;

        if (testStarted && !testSubmitted && selectedAssessment) {
            const totalSeconds = (selectedAssessment.time_limit_minutes || 30) * 60;
            setTimeRemaining(totalSeconds);
            setProctorStatus('active');

            // Start pulse animation
            pulseAnim.value = withRepeat(withTiming(1.2, { duration: 1000 }), -1, true);

            interval = setInterval(() => {
                setRecordingTime(prev => prev + 1);
                setTimeRemaining(prev => {
                    if (prev <= 1) {
                        handleAutoSubmit();
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);

            // AI SCAN INTERVAL - Simulated face detection and behavior analysis
            aiScanInterval = setInterval(() => {
                // Simulate AI behavior analysis
                setIsAiScanning(true);
                setAiAnalysisActive(true);

                // Random face detection simulation (in production would use actual ML)
                const faceCheck = Math.random();
                if (faceCheck > 0.95) {
                    // 5% chance of face not detected
                    setFaceDetected(false);
                    logBreach(BREACH_TYPES.FACE_NOT_VISIBLE);
                } else if (faceCheck > 0.92) {
                    // 3% chance of looking away
                    logBreach(BREACH_TYPES.LOOKING_AWAY);
                } else {
                    setFaceDetected(true);
                }

                setTimeout(() => {
                    setIsAiScanning(false);
                    setAiAnalysisActive(false);
                }, 2000);
            }, 8000); // Scan every 8 seconds
        }

        // APP STATE MONITORING - Critical Breach Detection
        const subscription = AppState.addEventListener('change', nextAppState => {
            if (!testStarted || testSubmitted) return;
            if (nextAppState.match(/inactive|background/)) {
                logBreach(BREACH_TYPES.APP_BACKGROUND, 'User left the assessment application');
            }
        });

        return () => {
            clearInterval(interval);
            clearInterval(aiScanInterval);
            subscription.remove();
        };
    }, [testStarted, testSubmitted, selectedAssessment, logBreach]);

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const formatBreachTime = (isoString) => {
        const date = new Date(isoString);
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    const handleAutoSubmit = () => {
        Alert.alert("Time's Up!", "Your assessment has been automatically submitted.");
        submitTest();
    };

    // --- CREATOR LOGIC ---
    const addQuestion = () => {
        if (!currentQ || options.some(opt => !opt)) {
            Alert.alert("Incomplete", "Please fill question and all 4 options.");
            return;
        }
        setQuestions([...questions, {
            question: currentQ,
            options: [...options],
            correctIndex: correctIdx
        }]);
        setCurrentQ('');
        setOptions(['', '', '', '']);
        setCorrectIdx(0);
    };

    const removeQuestion = (index) => {
        const newQuestions = [...questions];
        newQuestions.splice(index, 1);
        setQuestions(newQuestions);
    };

    const publishAssessment = async () => {
        if (!title || questions.length === 0) {
            Alert.alert("Error", "Add a title and at least one question.");
            return;
        }

        setCreating(true);
        setCreating(true);
        try {
            // BACKEND EXPECTS JSON, NOT FORMDATA FOR THIS ENDPOINT
            const payload = {
                title,
                description: desc,
                time_limit_minutes: parseInt(timeLimit) || 30,
                passing_score: parseInt(passingScore) || 70,
                questions: questions,
                created_by: userProfile?.name || 'Admin'
            };

            const response = await fetch(`${API_URL}/proctored-assessments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();
            if (result.status === 'success') {
                Alert.alert("Success", "Assessment created successfully!");
                setTitle('');
                setDesc('');
                setQuestions([]);
                setTimeLimit('30');
                setPassingScore('70');
                fetchAssessments();
                setViewMode('list');
            } else {
                Alert.alert("Error", result.detail || "Failed to create assessment.");
            }
        } catch (err) {
            Alert.alert("Error", "Failed to publish assessment.");
        } finally {
            setCreating(false);
        }
    };

    // --- BULK UPLOAD ---
    const pickBulkFile = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv'],
                copyToCacheDirectory: true
            });
            if (result.assets && result.assets.length > 0) {
                setBulkFile(result.assets[0]);
            }
        } catch (err) {
            console.log("Pick Error:", err);
        }
    };

    const handleBulkUpload = async () => {
        if (!title || !bulkFile) {
            Alert.alert("Missing", "Please provide a title and select an Excel/CSV file.");
            return;
        }

        setUploadingBulk(true);
        try {
            const formData = new FormData();
            formData.append('title', title);
            formData.append('description', desc);
            formData.append('time_limit_minutes', (parseInt(timeLimit) || 30).toString());
            formData.append('passing_score', (parseInt(passingScore) || 70).toString());
            formData.append('created_by', userProfile?.name || 'Admin');
            formData.append('file', {
                uri: bulkFile.uri,
                name: bulkFile.name,
                type: bulkFile.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });

            const response = await fetch(`${API_URL}/proctored-assessments/bulk-upload`, {
                method: 'POST',
                headers: { 'Content-Type': 'multipart/form-data' },
                body: formData
            });

            const result = await response.json();
            if (result.status === 'success') {
                Alert.alert("Success", `Assessment created with ${result.questions_count} questions from file!`);
                setTitle('');
                setDesc('');
                setBulkFile(null);
                fetchAssessments();
                setViewMode('list');
            } else {
                Alert.alert("Error", result.detail || "Failed to upload.");
            }
        } catch (err) {
            Alert.alert("Error", "Failed to process bulk upload.");
        } finally {
            setUploadingBulk(false);
        }
    };

    // --- AI DOCUMENT PICKER ---
    const pickAiDocument = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: [
                    'application/pdf',
                    'image/*',
                    'text/plain',
                    'text/csv',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'application/msword',
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    'application/vnd.ms-excel'
                ],
                copyToCacheDirectory: true
            });
            if (result.assets && result.assets.length > 0) {
                setAiDocumentFile(result.assets[0]);
                // Clear text content when file is selected
                setAiContent('');
            }
        } catch (err) {
            console.log("Pick Error:", err);
        }
    };

    // --- AI GENERATION ---
    const handleAiGenerate = async () => {
        if (!title) {
            Alert.alert("Missing", "Please provide an assessment title.");
            return;
        }

        if (!aiTopic && !aiContent && !aiDocumentFile) {
            Alert.alert("Missing", "Please provide a topic, paste content, or upload a document.");
            return;
        }

        setGenerating(true);
        try {
            let response;

            // If a document file is selected, use the generate-quiz-from-content endpoint
            if (aiDocumentFile) {
                const formData = new FormData();
                formData.append('file', {
                    uri: aiDocumentFile.uri,
                    name: aiDocumentFile.name,
                    type: aiDocumentFile.mimeType || 'application/octet-stream'
                });
                formData.append('title', title || 'AI Generated Assessment');
                formData.append('num_questions', (parseInt(aiNumQuestions) || 10).toString());
                formData.append('difficulty', aiDifficulty);
                formData.append('preview_only', 'true'); // We just want questions, not to save the quiz

                response = await fetch(`${API_URL}/generate-quiz-from-content`, {
                    method: 'POST',
                    body: formData
                });

                const quizResult = await response.json();

                // Access questions from data object if available
                const questions = quizResult.data?.questions || quizResult.questions || [];

                if (questions && questions.length > 0) {
                    // Now create the proctored assessment with these questions
                    const assessmentPayload = {
                        title,
                        description: desc || `AI-generated from ${aiDocumentFile.name}`,
                        time_limit_minutes: parseInt(timeLimit) || 30,
                        passing_score: parseInt(passingScore) || 70,
                        questions: questions.map(q => ({
                            question: q.question,
                            options: q.options,
                            correctIndex: q.correct_answer || "a" // Fallback default
                        })),
                        created_by: userProfile?.name || 'Admin',
                        ai_generated: true
                    };

                    const createResponse = await fetch(`${API_URL}/proctored-assessments`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(assessmentPayload)
                    });

                    const createResult = await createResponse.json();
                    if (createResult.status === 'success') {
                        Alert.alert("Success", `AI generated ${questions.length} questions from your document!`);
                        resetAiModal();
                        fetchAssessments();
                        setViewMode('list');
                    } else {
                        Alert.alert("Error", createResult.detail || "Failed to create assessment.");
                    }
                } else {
                    Alert.alert("Error", quizResult.detail || "Could not generate questions from the document.");
                }
            } else {
                // Use the existing topic/content based generation
                const formData = new FormData();
                formData.append('title', title);
                formData.append('description', desc);
                formData.append('time_limit_minutes', (parseInt(timeLimit) || 30).toString());
                formData.append('passing_score', (parseInt(passingScore) || 70).toString());
                formData.append('num_questions', (parseInt(aiNumQuestions) || 10).toString());
                formData.append('topic', aiTopic);
                formData.append('content', aiContent);
                formData.append('created_by', userProfile?.name || 'Admin');

                response = await fetch(`${API_URL}/proctored-assessments/ai-generate`, {
                    method: 'POST',
                    body: formData
                });

                const result = await response.json();
                if (result.status === 'success') {
                    Alert.alert("Success", `AI generated ${result.questions_count} questions for your assessment!`);
                    resetAiModal();
                    fetchAssessments();
                    setViewMode('list');
                } else {
                    Alert.alert("Error", result.detail || "AI generation failed.");
                }
            }
        } catch (err) {
            console.error("AI Generation Error:", err);
            Alert.alert("Error", "Failed to generate questions with AI. Please try again.");
        } finally {
            setGenerating(false);
        }
    };

    const resetAiModal = () => {
        setTitle('');
        setDesc('');
        setAiTopic('');
        setAiContent('');
        setAiDocumentFile(null);
        setAiModalVisible(false);
    };

    // --- TAKER LOGIC ---
    const startTest = async () => {
        // Simple permission check since we are using the hook
        if (!permission?.granted) {
            const res = await requestPermission();
            if (!res.granted) {
                Alert.alert("Permission Required", "Camera access is needed for proctoring.");
                return;
            }
        }

        // Reset all proctoring states
        setTestStarted(true);
        setUserAnswers(new Array((selectedAssessment?.questions || []).length).fill(null));
        setRecordingTime(0);
        setBreachLog([]);
        setTotalBreaches(0);
        setCriticalBreaches(0);
        setWarningBreaches(0);
        setProctorStatus('initializing');
        setCheatingStatus('clean');
        setFaceDetected(true);
        setLastAnswerTime(Date.now());
        lastBreachTimeRef.current = {};

        // Start Recording
        setTimeout(async () => {
            if (cameraRef.current) {
                try {
                    const video = await cameraRef.current.recordAsync({
                        maxDuration: 3600,
                        quality: '480p'
                    });
                    setVideoUri(video.uri);
                } catch (err) {
                    console.error("Recording Error:", err);
                }
            }
        }, 1000);
    };

    const handleAnswer = (idx) => {
        const now = Date.now();

        // Check for suspiciously rapid answers (less than 2 seconds)
        if (lastAnswerTime && (now - lastAnswerTime) < 2000 && userAnswers[currentStep] === null) {
            // Only flag if this is a new answer, not a change
            const rapidCount = breachLog.filter(b => b.type === 'rapid_answers').length;
            if (rapidCount < 3) { // Don't spam warnings
                logBreach(BREACH_TYPES.RAPID_ANSWERS, `Answered in ${((now - lastAnswerTime) / 1000).toFixed(1)}s`);
            }
        }

        setLastAnswerTime(now);
        const newAns = [...userAnswers];
        newAns[currentStep] = idx;
        setUserAnswers(newAns);
    };

    const submitTest = async () => {
        if (cameraRef.current) {
            try {
                cameraRef.current.stopRecording();
            } catch (e) { }
        }

        setSubmitting(true);
        setProctorStatus('submitting');

        try {
            const formData = new FormData();
            formData.append('user_email', userProfile?.email || 'user@example.com');
            formData.append('user_name', userProfile?.name || 'User');
            formData.append('answers', JSON.stringify(userAnswers));
            formData.append('time_taken_seconds', recordingTime.toString());
            formData.append('violations', totalBreaches.toString());
            formData.append('breach_log', JSON.stringify(breachLog));
            formData.append('critical_breaches', criticalBreaches.toString());
            formData.append('warning_breaches', warningBreaches.toString());

            // [FIX] Use correct endpoint for scheduled exams
            const submitUrl = isScheduledExam
                ? `${API_URL}/scheduled-exams/${selectedAssessment.id}/submit`
                : `${API_URL}/proctored-assessments/${selectedAssessment.id}/submit`;

            const response = await fetch(submitUrl, {
                method: 'POST',
                body: formData
            });

            const result = await response.json();
            if (result.status === 'success') {
                setScore({
                    total: result.result.total,
                    correct: result.result.correct,
                    percent: result.result.score,
                    passed: result.result.passed,
                    passingScore: result.result.passing_score,
                    breachLog: breachLog,
                    totalBreaches: totalBreaches,
                    criticalBreaches: criticalBreaches,
                    warningBreaches: warningBreaches
                });
            } else {
                // Fallback to local calculation
                let correctCount = 0;
                const targetQuestions = selectedAssessment?.questions || [];
                userAnswers.forEach((ans, i) => {
                    if (ans === targetQuestions[i]?.correctIndex) correctCount++;
                });
                setScore({
                    total: targetQuestions.length,
                    correct: correctCount,
                    percent: ((correctCount / targetQuestions.length) * 100).toFixed(0),
                    passed: (correctCount / targetQuestions.length) * 100 >= (selectedAssessment?.passing_score || 70),
                    passingScore: selectedAssessment?.passing_score || 70,
                    breachLog: breachLog,
                    totalBreaches: totalBreaches,
                    criticalBreaches: criticalBreaches,
                    warningBreaches: warningBreaches
                });
            }
        } catch (err) {
            // Fallback to local calculation
            let correctCount = 0;
            const targetQuestions = selectedAssessment?.questions || [];
            userAnswers.forEach((ans, i) => {
                if (ans === targetQuestions[i]?.correctIndex) correctCount++;
            });
            setScore({
                total: targetQuestions.length,
                correct: correctCount,
                percent: ((correctCount / targetQuestions.length) * 100).toFixed(0),
                passed: (correctCount / targetQuestions.length) * 100 >= (selectedAssessment?.passing_score || 70),
                passingScore: selectedAssessment?.passing_score || 70,
                breachLog: breachLog,
                totalBreaches: totalBreaches,
                criticalBreaches: criticalBreaches,
                warningBreaches: warningBreaches
            });
        } finally {
            setSubmitting(false);
            setTestSubmitted(true);
        }
    };

    const selectAssessment = (assessment) => {
        setSelectedAssessment(assessment);
        setViewMode('taker');
        setTestStarted(false);
        setTestSubmitted(false);
        setCurrentStep(0);
        setScore(null);
        setCheatingStatus('clean');
        setBreachLog([]);
        setTotalBreaches(0);
        setCriticalBreaches(0);
        setWarningBreaches(0);
        setProctorStatus('initializing');
    };

    // --- ADMIN ACTIONS ---
    const handleDeleteAssessment = async (id) => {
        Alert.alert(
            "Delete Assessment",
            "Are you sure? This cannot be undone.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete", style: "destructive", onPress: async () => {
                        try {
                            const res = await fetch(`${API_URL}/proctored-assessments/${id}`, { method: 'DELETE' });
                            const data = await res.json();
                            if (data.status === 'success') {
                                Alert.alert("Deleted", "Assessment removed.");
                                fetchAssessments();
                            } else {
                                Alert.alert("Error", data.message || "Failed to delete.");
                            }
                        } catch (e) {
                            Alert.alert("Error", "Network error.");
                        }
                    }
                }
            ]
        );
    };

    const handleViewResults = async (assessment) => {
        setSelectedAssessment(assessment);
        setViewMode('results');
        setLoadingSubmissions(true);
        try {
            const res = await fetch(`${API_URL}/proctored-assessments/${assessment.id}/submissions`);
            const data = await res.json();
            setViewSubmissions(data);
        } catch (e) {
            console.error(e);
            Alert.alert("Error", "Failed to load submissions.");
        } finally {
            setLoadingSubmissions(false);
        }
    };

    const renderResults = () => (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            <View style={styles.sectionHeaderBox}>
                <Text style={styles.sectionHeader}>{selectedAssessment?.title} - Results</Text>
            </View>
            {loadingSubmissions ? (
                <ActivityIndicator size="large" color="#F59E0B" />
            ) : viewSubmissions.length === 0 ? (
                <Text style={styles.emptyText}>No submissions yet.</Text>
            ) : (
                viewSubmissions.map((sub, i) => (
                    <TouchableOpacity
                        key={i}
                        style={styles.resultCardEnhanced}
                        onPress={() => setSelectedSubmissionDetail(
                            selectedSubmissionDetail?.id === sub.id ? null : sub
                        )}
                        activeOpacity={0.8}
                    >
                        {/* Main Info Row */}
                        <View style={styles.resultMainRow}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.resultName}>{sub.user_name}</Text>
                                <Text style={styles.resultDate}>{new Date(sub.submitted_at).toLocaleString()}</Text>
                                <Text style={styles.resultTimeTaken}>
                                    Duration: {formatTime(sub.time_taken_seconds || 0)}
                                </Text>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                                <Text style={[styles.resultScore, { color: sub.passed ? '#10B981' : '#EF4444' }]}>
                                    {sub.score_percent || sub.score}%
                                </Text>
                                <Text style={[styles.resultPassLabel, { color: sub.passed ? '#10B981' : '#EF4444' }]}>
                                    {sub.passed ? '✓ PASSED' : '✗ FAILED'}
                                </Text>
                            </View>
                        </View>

                        {/* Breach Summary Bar */}
                        {(sub.violations > 0 || sub.breach_log?.length > 0) && (
                            <View style={styles.breachSummaryBar}>
                                <View style={styles.breachCountBox}>
                                    <Feather name="alert-triangle" size={14} color="#EF4444" />
                                    <Text style={styles.breachCountText}>
                                        {sub.violations || sub.breach_log?.length || 0} Breaches
                                    </Text>
                                </View>
                                {sub.critical_breaches > 0 && (
                                    <View style={[styles.breachBadge, { backgroundColor: '#FEE2E2' }]}>
                                        <Text style={[styles.breachBadgeText, { color: '#DC2626' }]}>
                                            {sub.critical_breaches} Critical
                                        </Text>
                                    </View>
                                )}
                                {sub.warning_breaches > 0 && (
                                    <View style={[styles.breachBadge, { backgroundColor: '#FEF3C7' }]}>
                                        <Text style={[styles.breachBadgeText, { color: '#D97706' }]}>
                                            {sub.warning_breaches} Warning
                                        </Text>
                                    </View>
                                )}
                                <Feather
                                    name={selectedSubmissionDetail?.id === sub.id ? "chevron-up" : "chevron-down"}
                                    size={18}
                                    color="#6B7280"
                                />
                            </View>
                        )}

                        {/* Expanded Breach Details */}
                        {selectedSubmissionDetail?.id === sub.id && sub.breach_log && sub.breach_log.length > 0 && (
                            <View style={styles.breachDetailsContainer}>
                                <Text style={styles.breachDetailsTitle}>Breach Log</Text>
                                {sub.breach_log.map((breach, idx) => (
                                    <View key={idx} style={[
                                        styles.breachLogItem,
                                        breach.severity === 'critical' && styles.breachLogItemCritical,
                                        breach.severity === 'warning' && styles.breachLogItemWarning
                                    ]}>
                                        <View style={styles.breachLogIcon}>
                                            <Feather
                                                name={breach.icon || 'alert-circle'}
                                                size={16}
                                                color={breach.severity === 'critical' ? '#DC2626' : '#D97706'}
                                            />
                                        </View>
                                        <View style={styles.breachLogContent}>
                                            <Text style={styles.breachLogLabel}>{breach.label}</Text>
                                            <Text style={styles.breachLogMeta}>
                                                Q{breach.questionNumber} • {formatBreachTime(breach.timestamp)} • {formatTime(breach.timeElapsed || 0)} elapsed
                                            </Text>
                                            {breach.description !== breach.label && (
                                                <Text style={styles.breachLogDesc}>{breach.description}</Text>
                                            )}
                                        </View>
                                        <View style={[
                                            styles.breachSeverityDot,
                                            { backgroundColor: breach.severity === 'critical' ? '#DC2626' : breach.severity === 'warning' ? '#D97706' : '#6B7280' }
                                        ]} />
                                    </View>
                                ))}
                            </View>
                        )}

                        {/* Show empty breach state */}
                        {selectedSubmissionDetail?.id === sub.id && (!sub.breach_log || sub.breach_log.length === 0) && sub.violations > 0 && (
                            <View style={styles.breachDetailsContainer}>
                                <Text style={styles.breachDetailsTitle}>Breach Summary</Text>
                                <View style={styles.legacyBreachInfo}>
                                    <Feather name="alert-triangle" size={20} color="#D97706" />
                                    <Text style={styles.legacyBreachText}>
                                        {sub.violations} integrity violation(s) detected during this assessment.
                                        Detailed logs not available for legacy submissions.
                                    </Text>
                                </View>
                            </View>
                        )}
                    </TouchableOpacity>
                ))
            )}
            <View style={{ height: 100 }} />
        </ScrollView>
    );

    // --- RENDER HELPERS ---
    const renderAssessmentsList = () => (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            <View style={[styles.section, { paddingBottom: 100 }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <Text style={styles.sectionHeader}>
                        {isAdmin ? 'All Assessments' : 'Available Assessments'}
                    </Text>
                    {canCreateManage && (
                        <TouchableOpacity style={styles.createBtnHeader} onPress={() => setViewMode('admin')}>
                            <Feather name="plus-circle" size={24} color="#F59E0B" />
                            <Text style={styles.createBtnHeaderText}>Create New</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {loadingAssessments ? (
                    <ActivityIndicator size="large" color="#F59E0B" style={{ marginTop: 40 }} />
                ) : assessments.length === 0 ? (
                    <View style={styles.emptyState}>
                        <MaterialCommunityIcons name="clipboard-text-outline" size={60} color="#D1D5DB" />
                        <Text style={styles.emptyText}>No assessments available</Text>
                        {canCreateManage && (
                            <TouchableOpacity
                                style={styles.createFirstBtn}
                                onPress={() => setViewMode('admin')}
                            >
                                <Text style={styles.createFirstBtnText}>Create First Assessment</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                ) : (
                    assessments.map((assessment) => (
                        <TouchableOpacity
                            key={assessment.id}
                            style={styles.assessmentCard}
                            onPress={() => selectAssessment(assessment)}
                        >
                            <View style={styles.assessmentIcon}>
                                <MaterialCommunityIcons
                                    name={assessment.ai_generated ? "robot" : "clipboard-check"}
                                    size={24}
                                    color="#F59E0B"
                                />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.assessmentTitle}>{assessment.title}</Text>
                                <Text style={styles.assessmentMeta}>
                                    {assessment.total_questions || assessment.questions?.length || 0} Questions • {assessment.time_limit_minutes || 30} mins
                                </Text>
                                <View style={styles.assessmentTags}>
                                    <View style={[styles.tag, { backgroundColor: '#FEF3C7' }]}>
                                        <Text style={[styles.tagText, { color: '#D97706' }]}>Pass: {assessment.passing_score || 70}%</Text>
                                    </View>
                                    {assessment.ai_generated && (
                                        <View style={[styles.tag, { backgroundColor: '#EDE9FE' }]}>
                                            <Text style={[styles.tagText, { color: '#7C3AED' }]}>AI Generated</Text>
                                        </View>
                                    )}
                                </View>
                            </View>
                            {(canViewResults || canCreateManage) ? (
                                <View style={{ flexDirection: 'row', gap: 10 }}>
                                    {canViewResults && (
                                        <TouchableOpacity onPress={() => handleViewResults(assessment)}>
                                            <Feather name="eye" size={20} color="#6B7280" />
                                        </TouchableOpacity>
                                    )}
                                    {canCreateManage && (
                                        <TouchableOpacity onPress={() => handleDeleteAssessment(assessment.id)}>
                                            <Feather name="trash-2" size={20} color="#EF4444" />
                                        </TouchableOpacity>
                                    )}
                                </View>
                            ) : (
                                <Feather name="chevron-right" size={20} color="#9CA3AF" />
                            )}
                        </TouchableOpacity>
                    ))
                )}
            </View>
        </ScrollView>
    );

    const renderCreator = () => (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            <View style={styles.section}>
                <Text style={styles.label}>Assessment Title *</Text>
                <TextInput
                    style={styles.input}
                    placeholder="e.g. Annual Safety Certification"
                    value={title}
                    onChangeText={setTitle}
                />

                <Text style={styles.label}>Description</Text>
                <TextInput
                    style={[styles.input, { height: 80 }]}
                    placeholder="Brief instructions..."
                    value={desc}
                    onChangeText={setDesc}
                    multiline
                />

                <View style={{ flexDirection: 'row', gap: 15 }}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.label}>Time Limit (mins)</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="30"
                            value={timeLimit}
                            onChangeText={setTimeLimit}
                            keyboardType="numeric"
                        />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.label}>Passing Score (%)</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="70"
                            value={passingScore}
                            onChangeText={setPassingScore}
                            keyboardType="numeric"
                        />
                    </View>
                </View>
            </View>

            {/* QUICK ACTION BUTTONS */}
            <View style={styles.quickActions}>
                <TouchableOpacity style={styles.quickActionBtn} onPress={() => setAiModalVisible(true)}>
                    <MaterialCommunityIcons name="robot" size={24} color="#7C3AED" />
                    <Text style={styles.quickActionText}>AI Generate</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.quickActionBtn} onPress={pickBulkFile}>
                    <MaterialCommunityIcons name="file-upload" size={24} color="#10B981" />
                    <Text style={styles.quickActionText}>Bulk Upload</Text>
                </TouchableOpacity>
            </View>

            {/* BULK FILE SELECTED */}
            {bulkFile && (
                <View style={styles.bulkFileCard}>
                    <MaterialCommunityIcons name="file-excel" size={24} color="#10B981" />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={styles.bulkFileName}>{bulkFile.name}</Text>
                        <Text style={styles.bulkFileHint}>Columns: Question, Option1-4, CorrectOption (1-4)</Text>
                    </View>
                    <TouchableOpacity onPress={() => setBulkFile(null)}>
                        <Feather name="x" size={20} color="#EF4444" />
                    </TouchableOpacity>
                </View>
            )}

            {bulkFile ? (
                <TouchableOpacity
                    style={[styles.publishBtn, uploadingBulk && { opacity: 0.7 }]}
                    onPress={handleBulkUpload}
                    disabled={uploadingBulk}
                >
                    <LinearGradient colors={['#10B981', '#059669']} style={styles.gradientBtn}>
                        {uploadingBulk ? (
                            <ActivityIndicator color="#FFF" />
                        ) : (
                            <Text style={styles.publishBtnText}>Create from Excel/CSV</Text>
                        )}
                    </LinearGradient>
                </TouchableOpacity>
            ) : (
                <>
                    <View style={styles.divider} />

                    <View style={styles.section}>
                        <Text style={styles.sectionHeader}>Add Questions Manually ({questions.length} added)</Text>
                        <TextInput
                            style={[styles.input, { height: 60 }]}
                            placeholder="Question text"
                            value={currentQ}
                            onChangeText={setCurrentQ}
                            multiline
                        />

                        {options.map((opt, i) => (
                            <View key={i} style={styles.optionRow}>
                                <TouchableOpacity
                                    style={[styles.radio, correctIdx === i && styles.radioActive]}
                                    onPress={() => setCorrectIdx(i)}
                                >
                                    {correctIdx === i && <View style={styles.radioDot} />}
                                </TouchableOpacity>
                                <TextInput
                                    style={styles.optionInput}
                                    placeholder={`Option ${i + 1}`}
                                    value={opt}
                                    onChangeText={(text) => {
                                        const newOpts = [...options];
                                        newOpts[i] = text;
                                        setOptions(newOpts);
                                    }}
                                />
                            </View>
                        ))}

                        <TouchableOpacity style={styles.addBtn} onPress={addQuestion}>
                            <Feather name="plus" size={20} color="#F59E0B" />
                            <Text style={styles.addBtnText}>Add to Assessment</Text>
                        </TouchableOpacity>

                        {/* QUESTIONS LIST */}
                        {questions.length > 0 && (
                            <View style={styles.questionsList}>
                                <Text style={styles.questionsListTitle}>Added Questions:</Text>
                                {questions.map((q, idx) => (
                                    <View key={idx} style={styles.questionItem}>
                                        <Text style={styles.questionItemText} numberOfLines={2}>
                                            {idx + 1}. {q.question}
                                        </Text>
                                        <TouchableOpacity onPress={() => removeQuestion(idx)}>
                                            <Feather name="trash-2" size={16} color="#EF4444" />
                                        </TouchableOpacity>
                                    </View>
                                ))}
                            </View>
                        )}
                    </View>

                    <TouchableOpacity
                        style={[styles.publishBtn, creating && { opacity: 0.7 }]}
                        onPress={publishAssessment}
                        disabled={creating}
                    >
                        <LinearGradient colors={['#F59E0B', '#D97706']} style={styles.gradientBtn}>
                            {creating ? (
                                <ActivityIndicator color="#FFF" />
                            ) : (
                                <Text style={styles.publishBtnText}>Publish Assessment</Text>
                            )}
                        </LinearGradient>
                    </TouchableOpacity>
                </>
            )}
        </ScrollView>
    );

    const renderTaker = () => {
        const targetQuestions = selectedAssessment?.questions || [];

        if (!testStarted) {
            return (
                <View style={styles.centerMode}>
                    <MaterialCommunityIcons name="shield-account" size={80} color="#F59E0B" />
                    <Text style={styles.modeTitle}>Secure Assessment</Text>
                    <View style={styles.assessmentInfoBox}>
                        <Text style={styles.assessmentInfoTitle}>{selectedAssessment?.title || "Untitled"}</Text>
                        <View style={styles.assessmentInfoRow}>
                            <MaterialCommunityIcons name="help-circle-outline" size={18} color="#6B7280" />
                            <Text style={styles.assessmentInfoText}>{targetQuestions.length} Questions</Text>
                        </View>
                        <View style={styles.assessmentInfoRow}>
                            <MaterialCommunityIcons name="clock-outline" size={18} color="#6B7280" />
                            <Text style={styles.assessmentInfoText}>{selectedAssessment?.time_limit_minutes || 30} Minutes</Text>
                        </View>
                        <View style={styles.assessmentInfoRow}>
                            <MaterialCommunityIcons name="target" size={18} color="#6B7280" />
                            <Text style={styles.assessmentInfoText}>Pass: {selectedAssessment?.passing_score || 70}%</Text>
                        </View>
                    </View>
                    <Text style={styles.modeDesc}>
                        🔒 Monitoring is active. Device camera will record for integrity verification.
                    </Text>
                    <TouchableOpacity style={styles.startBtn} onPress={startTest}>
                        <Text style={styles.startBtnText}>Start Secure Exam</Text>
                    </TouchableOpacity>
                </View>
            );
        }

        if (testSubmitted) {
            return (
                <ScrollView style={{ flex: 1, backgroundColor: '#F9FAFB' }} contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
                    <View style={styles.resultHeader}>
                        <MaterialCommunityIcons
                            name={score?.passed ? "check-decagram" : "close-circle"}
                            size={80}
                            color={score?.passed ? "#10B981" : "#EF4444"}
                        />
                        <Text style={styles.modeTitle}>
                            {score?.passed ? "Congratulations!" : "Assessment Complete"}
                        </Text>
                    </View>

                    <View style={[styles.scoreBox, { borderColor: score?.passed ? '#10B981' : '#EF4444' }]}>
                        <Text style={[styles.scoreText, { color: score?.passed ? '#10B981' : '#EF4444' }]}>
                            {score?.correct} / {score?.total}
                        </Text>
                        <Text style={[styles.scoreSub, { color: score?.passed ? '#10B981' : '#EF4444' }]}>
                            {score?.percent}% {score?.passed ? '✓ PASSED' : '✗ FAILED'}
                        </Text>
                        <Text style={styles.scorePassReq}>Passing Score: {score?.passingScore}%</Text>
                    </View>

                    <Text style={styles.timeTaken}>Time Taken: {formatTime(recordingTime)}</Text>

                    {/* INTEGRITY REPORT SECTION */}
                    <View style={styles.integrityReportCard}>
                        <View style={styles.integrityReportHeader}>
                            <MaterialCommunityIcons
                                name={totalBreaches > 0 ? "shield-alert" : "shield-check"}
                                size={24}
                                color={totalBreaches > 0 ? "#D97706" : "#10B981"}
                            />
                            <Text style={styles.integrityReportTitle}>Integrity Report</Text>
                        </View>

                        {/* Breach Statistics */}
                        <View style={styles.breachStatsRow}>
                            <View style={[styles.breachStatBox, { backgroundColor: totalBreaches > 0 ? '#FEF2F2' : '#ECFDF5' }]}>
                                <Text style={[styles.breachStatNumber, { color: totalBreaches > 0 ? '#DC2626' : '#10B981' }]}>
                                    {totalBreaches}
                                </Text>
                                <Text style={styles.breachStatLabel}>Total{'\n'}Breaches</Text>
                            </View>
                            <View style={[styles.breachStatBox, { backgroundColor: criticalBreaches > 0 ? '#FEE2E2' : '#F9FAFB' }]}>
                                <Text style={[styles.breachStatNumber, { color: criticalBreaches > 0 ? '#DC2626' : '#6B7280' }]}>
                                    {criticalBreaches}
                                </Text>
                                <Text style={styles.breachStatLabel}>Critical</Text>
                            </View>
                            <View style={[styles.breachStatBox, { backgroundColor: warningBreaches > 0 ? '#FEF3C7' : '#F9FAFB' }]}>
                                <Text style={[styles.breachStatNumber, { color: warningBreaches > 0 ? '#D97706' : '#6B7280' }]}>
                                    {warningBreaches}
                                </Text>
                                <Text style={styles.breachStatLabel}>Warnings</Text>
                            </View>
                        </View>

                        {/* Breach Log */}
                        {breachLog.length > 0 ? (
                            <View style={styles.breachLogSection}>
                                <Text style={styles.breachLogSectionTitle}>Breach Log</Text>
                                {breachLog.map((breach, idx) => (
                                    <View key={breach.id || idx} style={[
                                        styles.breachLogItemUser,
                                        breach.severity === 'critical' && styles.breachLogItemCritical,
                                        breach.severity === 'warning' && styles.breachLogItemWarning
                                    ]}>
                                        <View style={styles.breachLogIconSmall}>
                                            <Feather
                                                name={breach.icon || 'alert-circle'}
                                                size={14}
                                                color={breach.severity === 'critical' ? '#DC2626' : '#D97706'}
                                            />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.breachLogLabelSmall}>{breach.label}</Text>
                                            <Text style={styles.breachLogMetaSmall}>
                                                Q{breach.questionNumber} • {formatTime(breach.timeElapsed || 0)} into test
                                            </Text>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        ) : (
                            <View style={styles.cleanIntegrityBox}>
                                <MaterialCommunityIcons name="check-circle" size={40} color="#10B981" />
                                <Text style={styles.cleanIntegrityText}>
                                    No integrity issues detected during your assessment.
                                </Text>
                            </View>
                        )}
                    </View>

                    <TouchableOpacity style={styles.backHomeBtn} onPress={() => navigation.goBack()}>
                        <Text style={styles.backHomeBtnText}>Go Back</Text>
                    </TouchableOpacity>
                </ScrollView>
            );
        }

        const q = targetQuestions[currentStep];
        if (!q) return null;

        return (
            <View style={{ flex: 1 }}>
                {/* PROCTORING STATUS BAR - Enhanced */}
                <View style={[
                    styles.proctorBar,
                    cheatingStatus === 'critical' && { backgroundColor: '#DC2626' },
                    cheatingStatus === 'warning' && { backgroundColor: '#D97706' },
                    isAiScanning && cheatingStatus === 'clean' && { backgroundColor: '#7C3AED' }
                ]}>
                    <View style={styles.proctorLeft}>
                        <View style={[styles.proctorDot, isAiScanning && { backgroundColor: '#A78BFA' }]} />
                        <Text style={styles.proctorText}>
                            {isAiScanning ? 'AI SCANNING...' :
                                cheatingStatus === 'critical' ? '⚠️ VIOLATION' :
                                    cheatingStatus === 'warning' ? '⚠️ WARNING' : '🛡️ SECURE'}
                        </Text>
                        <Text style={styles.proctorTime}>• {formatTime(recordingTime)}</Text>
                    </View>
                    <View style={styles.proctorRight}>
                        {totalBreaches > 0 && (
                            <View style={styles.breachCountBadge}>
                                <Feather name="alert-triangle" size={10} color="#FFF" />
                                <Text style={styles.breachCountBadgeText}>{totalBreaches}</Text>
                            </View>
                        )}
                        <View style={styles.timerBox}>
                            <MaterialCommunityIcons
                                name="clock-outline"
                                size={14}
                                color={timeRemaining < 60 ? "#FFF" : "#FCD34D"}
                            />
                            <Text style={[styles.timerText, timeRemaining < 60 && { color: '#FFF' }]}>
                                {formatTime(timeRemaining)}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* CRITICAL VIOLATION OVERLAY */}
                {cheatingStatus === 'critical' && currentBreachWarning && (
                    <View style={styles.criticalOverlay}>
                        <MaterialCommunityIcons name="alert-decagram" size={60} color="#FFF" />
                        <Text style={styles.criticalText}>INTEGRITY VIOLATION</Text>
                        <Text style={styles.criticalSubtext}>
                            {currentBreachWarning.label}
                        </Text>
                        <Text style={styles.criticalInstruction}>
                            Return to assessment immediately
                        </Text>
                    </View>
                )}

                {/* ACTUAL CAMERA FEED (PiP) */}
                <View style={styles.cameraPreview}>
                    <CameraView
                        style={styles.cameraInner}
                        facing="front"
                        ref={cameraRef}
                        mode="video"
                    />
                    <View style={[styles.recDot, isAiScanning && { backgroundColor: '#7C3AED' }]} />
                    {!faceDetected && (
                        <View style={styles.faceWarning}>
                            <Feather name="eye-off" size={12} color="#FFF" />
                        </View>
                    )}
                </View>

                {/* AI SCAN ANIMATION */}
                {isAiScanning && (
                    <Animated.View entering={FadeIn} style={styles.aiScanOverlay}>
                        <View style={styles.scanLine} />
                        <Text style={styles.aiScanText}>🤖 AI BEHAVIORAL ANALYSIS...</Text>
                    </Animated.View>
                )}

                <View style={styles.progressContainer}>
                    <View style={[styles.progressFill, { width: `${((currentStep + 1) / targetQuestions.length) * 100}%` }]} />
                </View>

                <Text style={styles.questionCounter}>Question {currentStep + 1} of {targetQuestions.length}</Text>

                <ScrollView style={styles.scroll}>
                    <Text style={styles.qText}>{q.question}</Text>
                    {q.options.map((opt, i) => (
                        <TouchableOpacity
                            key={i}
                            style={[styles.answerBtn, userAnswers[currentStep] === i && styles.answerBtnActive]}
                            onPress={() => handleAnswer(i)}
                        >
                            <Text style={[styles.answerText, userAnswers[currentStep] === i && styles.answerTextActive]}>
                                {String.fromCharCode(65 + i)}. {opt}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                <View style={styles.footer}>
                    <TouchableOpacity
                        style={[styles.navBtn, currentStep === 0 && { opacity: 0 }]}
                        onPress={() => setCurrentStep(prev => prev - 1)}
                        disabled={currentStep === 0}
                    >
                        <Feather name="chevron-left" size={20} color="#374151" />
                        <Text style={styles.navBtnText}>Previous</Text>
                    </TouchableOpacity>

                    {currentStep === targetQuestions.length - 1 ? (
                        <TouchableOpacity
                            style={[styles.submitTestBtn, submitting && { opacity: 0.7 }]}
                            onPress={submitTest}
                            disabled={submitting}
                        >
                            {submitting ? (
                                <ActivityIndicator color="#FFF" />
                            ) : (
                                <Text style={styles.submitTestBtnText}>Submit Assessment</Text>
                            )}
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity style={styles.navBtn} onPress={() => setCurrentStep(prev => prev + 1)}>
                            <Text style={styles.navBtnText}>Next</Text>
                            <Feather name="chevron-right" size={20} color="#374151" />
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        );
    };

    // --- AI GENERATION MODAL ---
    const renderAiModal = () => (
        <Modal visible={aiModalVisible} animationType="slide" transparent>
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <View style={styles.modalHeader}>
                        <MaterialCommunityIcons name="robot" size={24} color="#7C3AED" />
                        <Text style={styles.modalTitle}>AI Generate Questions</Text>
                        <TouchableOpacity onPress={() => { resetAiModal(); }}>
                            <Feather name="x" size={24} color="#6B7280" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false}>
                        {/* DOCUMENT UPLOAD SECTION */}
                        <View style={styles.aiSectionCard}>
                            <View style={styles.aiSectionHeader}>
                                <MaterialCommunityIcons name="file-document-outline" size={20} color="#10B981" />
                                <Text style={styles.aiSectionTitle}>Upload Document</Text>
                            </View>
                            <Text style={styles.aiSectionDesc}>
                                Upload PDFs, images, Word docs, Excel files, or text files
                            </Text>

                            {aiDocumentFile ? (
                                <View style={styles.aiDocumentCard}>
                                    <MaterialCommunityIcons
                                        name={getDocumentIcon(aiDocumentFile.mimeType)}
                                        size={24}
                                        color="#10B981"
                                    />
                                    <View style={{ flex: 1, marginLeft: 10 }}>
                                        <Text style={styles.aiDocumentName} numberOfLines={1}>
                                            {aiDocumentFile.name}
                                        </Text>
                                        <Text style={styles.aiDocumentSize}>
                                            {formatFileSize(aiDocumentFile.size)}
                                        </Text>
                                    </View>
                                    <TouchableOpacity onPress={() => setAiDocumentFile(null)}>
                                        <Feather name="x-circle" size={20} color="#EF4444" />
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                <TouchableOpacity style={styles.aiUploadBtn} onPress={pickAiDocument}>
                                    <Feather name="upload-cloud" size={24} color="#10B981" />
                                    <Text style={styles.aiUploadBtnText}>Choose File</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        {/* OR DIVIDER */}
                        <View style={styles.orDivider}>
                            <View style={styles.orLine} />
                            <Text style={styles.orText}>OR</Text>
                            <View style={styles.orLine} />
                        </View>

                        {/* TOPIC/CONTENT SECTION */}
                        <View style={[styles.aiSectionCard, aiDocumentFile && { opacity: 0.5 }]}>
                            <View style={styles.aiSectionHeader}>
                                <MaterialCommunityIcons name="text-box-outline" size={20} color="#F59E0B" />
                                <Text style={styles.aiSectionTitle}>Enter Topic or Content</Text>
                            </View>

                            <Text style={styles.label}>Topic</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="e.g. Food Safety Protocols"
                                value={aiTopic}
                                onChangeText={setAiTopic}
                                editable={!aiDocumentFile}
                            />

                            <Text style={styles.label}>Or Paste Content</Text>
                            <TextInput
                                style={[styles.input, { height: 100 }]}
                                placeholder="Paste training content, SOP text, or any material..."
                                value={aiContent}
                                onChangeText={setAiContent}
                                multiline
                                editable={!aiDocumentFile}
                            />
                        </View>

                        {/* SETTINGS SECTION */}
                        <View style={styles.aiSettingsRow}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.label}>Questions</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="10"
                                    value={aiNumQuestions}
                                    onChangeText={setAiNumQuestions}
                                    keyboardType="numeric"
                                />
                            </View>
                            <View style={{ flex: 1, marginLeft: 10 }}>
                                <Text style={styles.label}>Difficulty</Text>
                                <View style={styles.difficultyRow}>
                                    {['easy', 'medium', 'hard'].map((level) => (
                                        <TouchableOpacity
                                            key={level}
                                            style={[
                                                styles.difficultyBtn,
                                                aiDifficulty === level && styles.difficultyBtnActive
                                            ]}
                                            onPress={() => setAiDifficulty(level)}
                                        >
                                            <Text style={[
                                                styles.difficultyBtnText,
                                                aiDifficulty === level && styles.difficultyBtnTextActive
                                            ]}>
                                                {level.charAt(0).toUpperCase() + level.slice(1)}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        </View>

                        <TouchableOpacity
                            style={[styles.aiGenerateBtn, generating && { opacity: 0.7 }]}
                            onPress={handleAiGenerate}
                            disabled={generating}
                        >
                            {generating ? (
                                <View style={styles.generatingContainer}>
                                    <ActivityIndicator color="#FFF" />
                                    <Text style={styles.generatingText}>Generating Questions...</Text>
                                </View>
                            ) : (
                                <>
                                    <MaterialCommunityIcons name="auto-fix" size={20} color="#FFF" />
                                    <Text style={styles.aiGenerateBtnText}>Generate Assessment</Text>
                                </>
                            )}
                        </TouchableOpacity>

                        <View style={{ height: 30 }} />
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );

    // Helper functions for document display
    const getDocumentIcon = (mimeType) => {
        if (!mimeType) return 'file-document';
        if (mimeType.includes('pdf')) return 'file-pdf-box';
        if (mimeType.includes('image')) return 'file-image';
        if (mimeType.includes('word') || mimeType.includes('document')) return 'file-word';
        if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'file-excel';
        if (mimeType.includes('text')) return 'file-document-outline';
        return 'file-document';
    };

    const formatFileSize = (bytes) => {
        if (!bytes) return '';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => {
                    if (viewMode === 'taker' && !testStarted) {
                        setViewMode(isAdmin ? 'list' : 'list');
                        setSelectedAssessment(null);
                    } else if (viewMode === 'admin') {
                        setViewMode('list');
                    } else {
                        navigation.goBack();
                    }
                }}>
                    <Feather name="chevron-left" size={28} color="#1F2937" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>
                    {viewMode === 'admin' ? 'Create Assessment' :
                        viewMode === 'taker' ? 'Proctored Assessment' :
                            viewMode === 'results' ? 'Student Results' :
                                'Assessments'}
                </Text>
                {isAdmin && viewMode === 'list' && (
                    <TouchableOpacity onPress={() => setViewMode('admin')}>
                        <Feather name="plus-circle" size={24} color="#F59E0B" />
                    </TouchableOpacity>
                )}
                {viewMode !== 'list' && <View style={{ width: 24 }} />}
            </View>

            {viewMode === 'list' && renderAssessmentsList()}
            {viewMode === 'admin' && renderCreator()}
            {viewMode === 'results' && renderResults()}
            {viewMode === 'taker' && renderTaker()}
            {renderAiModal()}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F9FAFB' },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 15,
        backgroundColor: '#FFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
        zIndex: 10
    },
    headerTitle: { fontSize: 18, fontFamily: 'Poppins_600SemiBold', color: '#1F2937' },
    createBtnHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF7ED', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20 },
    createBtnHeaderText: { marginLeft: 6, fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: '#B45309' },
    scroll: { padding: 20 },
    section: { marginBottom: 20 },
    sectionHeader: { fontSize: 16, fontFamily: 'Poppins_600SemiBold', color: '#111827', marginBottom: 15 },
    label: { fontSize: 14, fontFamily: 'Poppins_500Medium', color: '#6B7280', marginBottom: 5, marginTop: 10 },
    input: {
        backgroundColor: '#FFF',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 12,
        padding: 12,
        fontSize: 15,
        fontFamily: 'Poppins_400Regular',
        marginBottom: 5
    },
    divider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 20 },
    optionRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
    radioActive: { borderColor: '#F59E0B' },
    radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#F59E0B' },
    optionInput: { flex: 1, backgroundColor: '#F3F4F6', borderRadius: 8, padding: 10, fontSize: 14 },
    addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, borderStyle: 'dashed', borderWidth: 1, borderColor: '#F59E0B', borderRadius: 12, marginTop: 10 },
    addBtnText: { color: '#F59E0B', fontFamily: 'Poppins_600SemiBold', marginLeft: 5 },
    publishBtn: { marginTop: 20, marginBottom: 50 },
    gradientBtn: { padding: 16, borderRadius: 14, alignItems: 'center' },
    publishBtnText: { color: '#FFF', fontSize: 16, fontFamily: 'Poppins_700Bold' },

    // Quick Actions
    quickActions: { flexDirection: 'row', gap: 15, marginBottom: 15 },
    quickActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF', padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB' },
    quickActionText: { marginLeft: 8, fontFamily: 'Poppins_600SemiBold', color: '#374151' },

    // Bulk Upload
    bulkFileCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFDF5', padding: 15, borderRadius: 12, marginBottom: 15, borderWidth: 1, borderColor: '#A7F3D0' },
    bulkFileName: { fontFamily: 'Poppins_600SemiBold', color: '#065F46' },
    bulkFileHint: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: '#6B7280', marginTop: 2 },

    // Questions List
    questionsList: { marginTop: 20, backgroundColor: '#FFF', borderRadius: 12, padding: 15, borderWidth: 1, borderColor: '#E5E7EB' },
    questionsListTitle: { fontFamily: 'Poppins_600SemiBold', color: '#374151', marginBottom: 10 },
    questionItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    questionItemText: { flex: 1, fontFamily: 'Poppins_400Regular', color: '#4B5563', marginRight: 10 },

    // Assessments List
    emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
    emptyText: { fontFamily: 'Poppins_500Medium', color: '#9CA3AF', marginTop: 15 },
    createFirstBtn: { marginTop: 20, backgroundColor: '#F59E0B', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 20 },
    createFirstBtnText: { color: '#FFF', fontFamily: 'Poppins_600SemiBold' },
    assessmentCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 16, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E5E7EB' },
    assessmentIcon: { width: 50, height: 50, borderRadius: 12, backgroundColor: '#FFF7ED', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
    assessmentTitle: { fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: '#1F2937' },
    assessmentMeta: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: '#6B7280', marginTop: 2 },
    assessmentTags: { flexDirection: 'row', marginTop: 8, gap: 6 },
    tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    tagText: { fontSize: 10, fontFamily: 'Poppins_600SemiBold' },

    // Taker UI
    centerMode: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
    modeTitle: { fontSize: 24, fontFamily: 'Poppins_700Bold', color: '#1F2937', marginTop: 20 },
    assessmentInfoBox: { backgroundColor: '#FFF', padding: 20, borderRadius: 16, marginTop: 20, width: '100%', borderWidth: 1, borderColor: '#E5E7EB' },
    assessmentInfoTitle: { fontSize: 16, fontFamily: 'Poppins_600SemiBold', color: '#1F2937', marginBottom: 15, textAlign: 'center' },
    assessmentInfoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    assessmentInfoText: { marginLeft: 10, fontFamily: 'Poppins_500Medium', color: '#4B5563' },
    modeDesc: { fontSize: 13, fontFamily: 'Poppins_400Regular', color: '#6B7280', textAlign: 'center', marginTop: 20, lineHeight: 20, paddingHorizontal: 20 },
    startBtn: { backgroundColor: '#1F2937', paddingHorizontal: 40, paddingVertical: 15, borderRadius: 30, marginTop: 30 },
    startBtnText: { color: '#FFF', fontSize: 16, fontFamily: 'Poppins_700Bold' },

    proctorBar: { backgroundColor: '#EF4444', paddingVertical: 8, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 100 },
    proctorDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFF' },
    proctorText: { color: '#FFF', fontSize: 10, fontFamily: 'Poppins_700Bold', letterSpacing: 0.5 },
    proctorTime: { color: 'rgba(255,255,255,0.8)', fontSize: 10, fontFamily: 'Poppins_500Medium', marginLeft: 4 },
    proctorLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    proctorRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    breachCountBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, gap: 4 },
    breachCountBadgeText: { color: '#FFF', fontSize: 10, fontFamily: 'Poppins_700Bold' },
    timerBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
    timerText: { marginLeft: 5, color: '#FCD34D', fontSize: 12, fontFamily: 'Poppins_700Bold' },
    progressContainer: { height: 4, backgroundColor: '#E5E7EB' },
    progressFill: { height: '100%', backgroundColor: '#F59E0B' },
    questionCounter: { textAlign: 'center', paddingVertical: 10, fontFamily: 'Poppins_600SemiBold', color: '#6B7280', backgroundColor: '#FFF' },

    cameraPreview: { position: 'absolute', top: 50, right: 20, width: 80, height: 100, backgroundColor: '#111827', borderRadius: 10, borderWidth: 2, borderColor: '#EF4444', overflow: 'hidden', zIndex: 50, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, elevation: 8 },
    cameraInner: { flex: 1 },
    recDot: { position: 'absolute', top: 6, left: 6, width: 5, height: 5, borderRadius: 3, backgroundColor: '#EF4444' },
    faceWarning: { position: 'absolute', bottom: 6, left: 6, width: 20, height: 20, borderRadius: 10, backgroundColor: '#D97706', justifyContent: 'center', alignItems: 'center' },

    aiScanOverlay: { position: 'absolute', top: 50, left: 20, right: 110, height: 100, backgroundColor: 'rgba(124, 58, 237, 0.1)', borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: '#7C3AED', justifyContent: 'center', alignItems: 'center', zIndex: 40 },
    scanLine: { position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: '#7C3AED', opacity: 0.7 },
    aiScanText: { color: '#7C3AED', fontSize: 9, fontFamily: 'Poppins_700Bold', textAlign: 'center' },

    criticalSubtext: { color: 'rgba(255,255,255,0.9)', fontSize: 16, fontFamily: 'Poppins_600SemiBold', textAlign: 'center', marginTop: 10 },
    criticalInstruction: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontFamily: 'Poppins_400Regular', textAlign: 'center', marginTop: 8 },

    qText: { fontSize: 18, fontFamily: 'Poppins_600SemiBold', color: '#1F2937', marginBottom: 25, marginTop: 60, lineHeight: 26 },
    answerBtn: { backgroundColor: '#FFF', borderWidth: 2, borderColor: '#E5E7EB', borderRadius: 14, padding: 16, marginBottom: 10 },
    answerBtnActive: { borderColor: '#F59E0B', backgroundColor: '#FFFBEB' },
    answerText: { fontSize: 15, fontFamily: 'Poppins_500Medium', color: '#374151' },
    answerTextActive: { color: '#B45309' },
    footer: { flexDirection: 'row', padding: 15, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#E5E7EB', alignItems: 'center' },
    navBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12 },
    navBtnText: { color: '#374151', fontFamily: 'Poppins_600SemiBold', marginHorizontal: 5 },
    submitTestBtn: { flex: 2, backgroundColor: '#10B981', padding: 14, borderRadius: 12, alignItems: 'center' },
    submitTestBtnText: { color: '#FFF', fontFamily: 'Poppins_700Bold' },

    scoreBox: { backgroundColor: '#FFF', padding: 30, borderRadius: 20, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 5, marginTop: 20, borderWidth: 2 },
    scoreText: { fontSize: 42, fontFamily: 'Poppins_700Bold' },
    scoreSub: { fontSize: 18, fontFamily: 'Poppins_600SemiBold', marginTop: 5 },
    scorePassReq: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: '#9CA3AF', marginTop: 10 },
    timeTaken: { marginTop: 20, fontFamily: 'Poppins_500Medium', color: '#6B7280' },
    backHomeBtn: { backgroundColor: '#F59E0B', paddingHorizontal: 40, paddingVertical: 14, borderRadius: 25, marginTop: 30 },
    backHomeBtnText: { color: '#FFF', fontSize: 15, fontFamily: 'Poppins_700Bold' },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: height * 0.85 },
    modalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
    modalTitle: { flex: 1, fontSize: 18, fontFamily: 'Poppins_700Bold', color: '#1F2937', marginLeft: 10 },
    aiGenerateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#7C3AED', padding: 16, borderRadius: 14, marginTop: 20 },
    aiGenerateBtnText: { color: '#FFF', fontSize: 16, fontFamily: 'Poppins_700Bold', marginLeft: 8 },

    // AI Section Cards
    aiSectionCard: { backgroundColor: '#F9FAFB', borderRadius: 16, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: '#E5E7EB' },
    aiSectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    aiSectionTitle: { fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: '#374151', marginLeft: 8 },
    aiSectionDesc: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: '#6B7280', marginBottom: 12 },

    // AI Upload Button
    aiUploadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ECFDF5', borderWidth: 2, borderColor: '#10B981', borderStyle: 'dashed', borderRadius: 12, padding: 20 },
    aiUploadBtnText: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: '#10B981', marginLeft: 8 },

    // AI Document Card
    aiDocumentCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFDF5', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#A7F3D0' },
    aiDocumentName: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: '#065F46' },
    aiDocumentSize: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: '#6B7280', marginTop: 2 },

    // OR Divider
    orDivider: { flexDirection: 'row', alignItems: 'center', marginVertical: 16 },
    orLine: { flex: 1, height: 1, backgroundColor: '#E5E7EB' },
    orText: { paddingHorizontal: 12, fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: '#9CA3AF' },

    // AI Settings
    aiSettingsRow: { flexDirection: 'row', marginTop: 8 },
    difficultyRow: { flexDirection: 'row', marginTop: 5 },
    difficultyBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 8, marginRight: 4 },
    difficultyBtnActive: { backgroundColor: '#7C3AED' },
    difficultyBtnText: { fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: '#6B7280' },
    difficultyBtnTextActive: { color: '#FFF' },

    // Generating State
    generatingContainer: { flexDirection: 'row', alignItems: 'center' },
    generatingText: { color: '#FFF', fontFamily: 'Poppins_600SemiBold', marginLeft: 10 },

    // Results & Overlay
    criticalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(220, 38, 38, 0.9)', justifyContent: 'center', alignItems: 'center', zIndex: 200 },
    criticalText: { color: '#FFF', fontSize: 24, fontFamily: 'Poppins_700Bold', textAlign: 'center', marginTop: 20 },
    resultCard: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, backgroundColor: '#FFF', borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#E5E7EB' },
    resultName: { fontSize: 16, fontFamily: 'Poppins_600SemiBold', color: '#1F2937' },
    resultDate: { fontSize: 12, color: '#6B7280', marginTop: 4 },
    resultScore: { fontSize: 18, fontFamily: 'Poppins_700Bold' },
    violationText: { fontSize: 10, color: '#EF4444', fontFamily: 'Poppins_700Bold', marginTop: 2 },
    sectionHeaderBox: { marginBottom: 15 },

    // Enhanced Result Cards with Breach Details
    resultCardEnhanced: { backgroundColor: '#FFF', borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E5E7EB', overflow: 'hidden' },
    resultMainRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 16 },
    resultTimeTaken: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
    resultPassLabel: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', marginTop: 2 },

    // Breach Summary Bar
    breachSummaryBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF2F2', paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#FECACA', gap: 8 },
    breachCountBox: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    breachCountText: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: '#DC2626' },
    breachBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
    breachBadgeText: { fontSize: 10, fontFamily: 'Poppins_600SemiBold' },

    // Breach Details Container
    breachDetailsContainer: { backgroundColor: '#F9FAFB', padding: 16, borderTopWidth: 1, borderTopColor: '#E5E7EB' },
    breachDetailsTitle: { fontSize: 14, fontFamily: 'Poppins_700Bold', color: '#374151', marginBottom: 12 },

    // Breach Log Item
    breachLogItem: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#FFF', borderRadius: 10, padding: 12, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: '#D1D5DB' },
    breachLogItemCritical: { borderLeftColor: '#DC2626', backgroundColor: '#FEF2F2' },
    breachLogItemWarning: { borderLeftColor: '#D97706', backgroundColor: '#FFFBEB' },
    breachLogIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
    breachLogContent: { flex: 1 },
    breachLogLabel: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: '#1F2937' },
    breachLogMeta: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: '#6B7280', marginTop: 2 },
    breachLogDesc: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: '#4B5563', marginTop: 4, fontStyle: 'italic' },
    breachSeverityDot: { width: 8, height: 8, borderRadius: 4, marginLeft: 8 },

    // Legacy Breach Info
    legacyBreachInfo: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#FFFBEB', borderRadius: 10, padding: 12, gap: 10 },
    legacyBreachText: { flex: 1, fontSize: 12, fontFamily: 'Poppins_400Regular', color: '#92400E', lineHeight: 18 },

    // Proctor Status Bar Styles
    proctorStatusBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, zIndex: 100 },
    proctorStatusActive: { backgroundColor: '#10B981' },
    proctorStatusWarning: { backgroundColor: '#F59E0B' },
    proctorStatusCritical: { backgroundColor: '#EF4444' },
    proctorStatusLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    proctorStatusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFF' },
    proctorStatusText: { color: '#FFF', fontSize: 11, fontFamily: 'Poppins_600SemiBold' },
    proctorBreachCount: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, gap: 4 },
    proctorBreachCountText: { color: '#FFF', fontSize: 10, fontFamily: 'Poppins_700Bold' },

    // User Results - Integrity Report
    resultHeader: { alignItems: 'center', marginBottom: 20, paddingTop: 20 },
    integrityReportCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginTop: 20, borderWidth: 1, borderColor: '#E5E7EB' },
    integrityReportHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 10 },
    integrityReportTitle: { fontSize: 18, fontFamily: 'Poppins_700Bold', color: '#1F2937' },

    // Breach Stats Row
    breachStatsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
    breachStatBox: { flex: 1, alignItems: 'center', padding: 12, borderRadius: 12 },
    breachStatNumber: { fontSize: 28, fontFamily: 'Poppins_700Bold' },
    breachStatLabel: { fontSize: 11, fontFamily: 'Poppins_500Medium', color: '#6B7280', textAlign: 'center', marginTop: 2 },

    // Breach Log Section
    breachLogSection: { marginTop: 8 },
    breachLogSectionTitle: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: '#374151', marginBottom: 10 },
    breachLogItemUser: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 10, padding: 10, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: '#D1D5DB' },
    breachLogIconSmall: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
    breachLogLabelSmall: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: '#1F2937' },
    breachLogMetaSmall: { fontSize: 10, fontFamily: 'Poppins_400Regular', color: '#6B7280', marginTop: 1 },

    // Clean Integrity
    cleanIntegrityBox: { alignItems: 'center', padding: 20, backgroundColor: '#ECFDF5', borderRadius: 12 },
    cleanIntegrityText: { fontSize: 13, fontFamily: 'Poppins_500Medium', color: '#065F46', textAlign: 'center', marginTop: 10 },
});
