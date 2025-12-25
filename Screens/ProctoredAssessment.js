import React, { useState, useEffect, useRef } from 'react';
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
    ActivityIndicator
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');
const API_URL = "http://192.168.1.36:8000";

export default function ProctoredAssessment({ route, navigation }) {
    const { userProfile, assessmentData } = route.params || {};
    const role = userProfile?.role || "User";
    const isAdmin = role === 'Ops Manager' || role === 'City Manager' || role === 'Store Manager';

    // CREATOR STATE
    const [title, setTitle] = useState('');
    const [desc, setDesc] = useState('');
    const [questions, setQuestions] = useState([]);
    const [currentQ, setCurrentQ] = useState('');
    const [options, setOptions] = useState(['', '', '', '']);
    const [correctIdx, setCorrectIdx] = useState(0);

    // TAKER STATE
    const [currentStep, setCurrentStep] = useState(0);
    const [userAnswers, setUserAnswers] = useState([]);
    const [testStarted, setTestStarted] = useState(false);
    const [testSubmitted, setTestSubmitted] = useState(false);
    const [score, setScore] = useState(null);
    const [recordingTime, setRecordingTime] = useState(0);
    const [isAiScanning, setIsAiScanning] = useState(false);
    const [permission, requestPermission] = useCameraPermissions();
    const cameraRef = useRef(null);
    const [videoUri, setVideoUri] = useState(null);

    // RECORDING TIMER
    useEffect(() => {
        let interval;
        if (testStarted && !testSubmitted) {
            interval = setInterval(() => {
                setRecordingTime(prev => prev + 1);
                // Random AI Scan Simulation
                if (Math.random() > 0.95) {
                    setIsAiScanning(true);
                    setTimeout(() => setIsAiScanning(false), 2000);
                }
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [testStarted, testSubmitted]);

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
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

    const publishAssessment = async () => {
        if (!title || questions.length === 0) {
            Alert.alert("Error", "Add a title and at least one question.");
            return;
        }

        try {
            const response = await fetch(`${API_URL}/notify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: "🔒 Proctored Assessment Assigned!",
                    message: `New assessment: ${title}. High-stakes monitoring enabled.`,
                    type: "proctored",
                    data: {
                        id: Date.now().toString(),
                        title,
                        description: desc,
                        questions: questions
                    }
                })
            });

            if (response.ok) {
                Alert.alert("Success", "Assessment published and users notified!");
                navigation.goBack();
            }
        } catch (err) {
            Alert.alert("Error", "Failed to publish assessment.");
        }
    };

    // --- TAKER LOGIC ---
    const startTest = async () => {
        if (!permission || !permission.granted) {
            const res = await requestPermission();
            if (!res.granted) {
                Alert.alert("Permission Required", "Camera access is needed for proctoring.");
                return;
            }
        }

        setTestStarted(true);
        setUserAnswers(new Array((assessmentData?.questions || questions).length).fill(null));

        // Start Recording
        setTimeout(async () => {
            if (cameraRef.current) {
                try {
                    const video = await cameraRef.current.recordAsync({
                        maxDuration: 3600, // 1 hour cap
                        quality: '480p'
                    });
                    setVideoUri(video.uri);
                    console.log("Recording Saved:", video.uri);
                } catch (err) {
                    console.error("Recording Error:", err);
                }
            }
        }, 1000); // Small delay to ensure camera is ready
    };

    const handleAnswer = (idx) => {
        const newAns = [...userAnswers];
        newAns[currentStep] = idx;
        setUserAnswers(newAns);
    };

    const submitTest = () => {
        if (cameraRef.current) {
            cameraRef.current.stopRecording();
        }

        let correctCount = 0;
        const targetQuestions = assessmentData?.questions || questions;
        userAnswers.forEach((ans, i) => {
            if (ans === targetQuestions[i].correctIndex) correctCount++;
        });
        setScore({
            total: targetQuestions.length,
            correct: correctCount,
            percent: ((correctCount / targetQuestions.length) * 100).toFixed(0)
        });
        setTestSubmitted(true);

        if (videoUri) {
            Alert.alert("Assessment Recorded", `Session saved to: ${videoUri.split('/').pop()}`);
        }
    };

    // --- RENDER HELPERS ---
    const renderCreator = () => (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            <View style={styles.section}>
                <Text style={styles.label}>Assessment Title</Text>
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
            </View>

            <View style={styles.divider} />

            <View style={styles.section}>
                <Text style={styles.sectionHeader}>Add Question ({questions.length} added)</Text>
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
            </View>

            <TouchableOpacity style={styles.publishBtn} onPress={publishAssessment}>
                <LinearGradient colors={['#F59E0B', '#D97706']} style={styles.gradientBtn}>
                    <Text style={styles.publishBtnText}>Publish & Notify All Users</Text>
                </LinearGradient>
            </TouchableOpacity>
        </ScrollView>
    );

    const renderTaker = () => {
        const targetQuestions = assessmentData?.questions || [];

        if (!testStarted) {
            return (
                <View style={styles.centerMode}>
                    <MaterialCommunityIcons name="shield-account" size={80} color="#F59E0B" />
                    <Text style={styles.modeTitle}>Secure Assessment</Text>
                    <Text style={styles.modeDesc}>
                        Title: {assessmentData?.title || "Untitled"}{"\n"}
                        Questions: {targetQuestions.length}{"\n\n"}
                        🔒 Monitoring is active. Device camera and screen will be recorded for integrity.
                    </Text>
                    <TouchableOpacity style={styles.startBtn} onPress={startTest}>
                        <Text style={styles.startBtnText}>Start Secure Exam</Text>
                    </TouchableOpacity>
                </View>
            );
        }

        if (testSubmitted) {
            return (
                <View style={styles.centerMode}>
                    <MaterialCommunityIcons name="check-decagram" size={80} color="#10B981" />
                    <Text style={styles.modeTitle}>Submission Successful</Text>
                    <View style={styles.scoreBox}>
                        <Text style={styles.scoreText}>{score.correct} / {score.total}</Text>
                        <Text style={styles.scoreSub}>{score.percent}% Accuracy</Text>
                    </View>
                    <TouchableOpacity style={styles.backHomeBtn} onPress={() => navigation.navigate('Home')}>
                        <Text style={styles.backHomeBtnText}>Go to Dashboard</Text>
                    </TouchableOpacity>
                </View>
            );
        }

        const q = targetQuestions[currentStep];
        return (
            <View style={{ flex: 1 }}>
                {/* PROCTORING OVERLAY */}
                <View style={styles.proctorBar}>
                    <View style={styles.proctorDot} />
                    <Text style={styles.proctorText}>RECORDING ACTIVE • {formatTime(recordingTime)}</Text>
                </View>

                {/* ACTUAL CAMERA FEED (PiP) */}
                <View style={styles.cameraPreview}>
                    <CameraView
                        style={styles.cameraInner}
                        facing="front"
                        ref={cameraRef}
                        mode="video"
                    >
                        <View style={styles.recDot} />
                    </CameraView>
                </View>

                {/* AI SCAN SIMULATION */}
                {isAiScanning && (
                    <Animated.View entering={FadeInDown} style={styles.aiScanOverlay}>
                        <View style={styles.scanLine} />
                        <Text style={styles.aiScanText}>AI BEHAVIORAL ANALYSIS IN PROGRESS...</Text>
                    </Animated.View>
                )}

                <View style={styles.progressContainer}>
                    <View style={[styles.progressFill, { width: `${((currentStep + 1) / targetQuestions.length) * 100}%` }]} />
                </View>

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
                        <Text style={styles.navBtnText}>Previous</Text>
                    </TouchableOpacity>

                    {currentStep === targetQuestions.length - 1 ? (
                        <TouchableOpacity style={styles.submitTestBtn} onPress={submitTest}>
                            <Text style={styles.submitTestBtnText}>Submit Assessment</Text>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity style={styles.navBtn} onPress={() => setCurrentStep(prev => prev + 1)}>
                            <Text style={styles.navBtnText}>Next</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Feather name="chevron-left" size={28} color="#1F2937" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{isAdmin && !testStarted ? "Assessment Creator" : "Proctored Assessment"}</Text>
                <View style={{ width: 28 }} />
            </View>

            {isAdmin && !assessmentData ? renderCreator() : renderTaker()}
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
    scroll: { padding: 20, paddingTop: 100 },
    section: { marginBottom: 20 },
    sectionHeader: { fontSize: 16, fontFamily: 'Poppins_600SemiBold', color: '#111827', marginBottom: 15 },
    label: { fontSize: 14, fontFamily: 'Poppins_500Medium', color: '#6B7280', marginBottom: 5 },
    input: {
        backgroundColor: '#FFF',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 12,
        padding: 12,
        fontSize: 15,
        fontFamily: 'Poppins_400Regular',
        marginBottom: 15
    },
    divider: { height: 1, backgroundColor: '#E5E7EB', marginBottom: 20 },
    optionRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
    radioActive: { borderColor: '#F59E0B' },
    radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#F59E0B' },
    optionInput: { flex: 1, backgroundColor: '#F3F4F6', borderRadius: 8, padding: 10, fontSize: 14 },
    addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, borderStyle: 'dashed', borderWidth: 1, borderColor: '#F59E0B', borderRadius: 12, marginTop: 10 },
    addBtnText: { color: '#F59E0B', fontFamily: 'Poppins_600SemiBold', marginLeft: 5 },
    publishBtn: { marginTop: 30, marginBottom: 50, marginHorizontal: 20 },
    gradientBtn: { padding: 16, borderRadius: 14, alignItems: 'center' },
    publishBtnText: { color: '#FFF', fontSize: 16, fontFamily: 'Poppins_700Bold' },

    // Taker UI
    centerMode: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
    modeTitle: { fontSize: 24, fontFamily: 'Poppins_700Bold', color: '#1F2937', marginTop: 20 },
    modeDesc: { fontSize: 14, fontFamily: 'Poppins_400Regular', color: '#6B7280', textAlign: 'center', marginTop: 10, lineHeight: 22 },
    startBtn: { backgroundColor: '#1F2937', paddingHorizontal: 40, paddingVertical: 15, borderRadius: 30, marginTop: 40 },
    startBtnText: { color: '#FFF', fontSize: 16, fontFamily: 'Poppins_700Bold' },

    proctorBar: { backgroundColor: '#EF4444', paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
    proctorDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FFF', marginRight: 8 },
    proctorText: { color: '#FFF', fontSize: 11, fontFamily: 'Poppins_700Bold', letterSpacing: 1 },
    progressContainer: { height: 6, backgroundColor: '#E5E7EB' },
    progressFill: { height: '100%', backgroundColor: '#F59E0B' },

    cameraPreview: { position: 'absolute', top: 50, right: 20, width: 90, height: 120, backgroundColor: '#111827', borderRadius: 12, borderWidth: 2, borderColor: '#EF4444', overflow: 'hidden', zIndex: 50, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, elevation: 8 },
    cameraInner: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 5 },
    cameraText: { color: '#FFF', fontSize: 7, fontFamily: 'Poppins_700Bold', marginTop: 5, textAlign: 'center', opacity: 0.8 },
    recDot: { position: 'absolute', top: 8, left: 8, width: 6, height: 6, borderRadius: 3, backgroundColor: '#EF4444' },

    aiScanOverlay: { position: 'absolute', top: 50, left: 20, right: 120, height: 120, backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: '#EF4444', justifyContent: 'center', alignItems: 'center', zIndex: 40 },
    scanLine: { position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: '#EF4444', opacity: 0.5 },
    aiScanText: { color: '#EF4444', fontSize: 8, fontFamily: 'Poppins_700Bold', textAlign: 'center', paddingHorizontal: 10 },

    qText: { fontSize: 20, fontFamily: 'Poppins_600SemiBold', color: '#1F2937', marginBottom: 30, marginTop: 20 },
    answerBtn: { backgroundColor: '#FFF', borderWidth: 2, borderColor: '#E5E7EB', borderRadius: 16, padding: 18, marginBottom: 12 },
    answerBtnActive: { borderColor: '#F59E0B', backgroundColor: 'rgba(245, 158, 11, 0.05)' },
    answerText: { fontSize: 16, fontFamily: 'Poppins_500Medium', color: '#374151' },
    answerTextActive: { color: '#B45309' },
    footer: { flexDirection: 'row', padding: 20, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#E5E7EB' },
    navBtn: { flex: 1, padding: 15, alignItems: 'center' },
    navBtnText: { color: '#374151', fontFamily: 'Poppins_600SemiBold' },
    submitTestBtn: { flex: 2, backgroundColor: '#10B981', padding: 15, borderRadius: 12, alignItems: 'center' },
    submitTestBtnText: { color: '#FFF', fontFamily: 'Poppins_700Bold' },

    scoreBox: { backgroundColor: '#FFF', padding: 30, borderRadius: 20, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 5, marginTop: 30 },
    scoreText: { fontSize: 40, fontFamily: 'Poppins_700Bold', color: '#1F2937' },
    scoreSub: { fontSize: 18, fontFamily: 'Poppins_500Medium', color: '#10B981' },
    backHomeBtn: { backgroundColor: '#F59E0B', paddingHorizontal: 40, paddingVertical: 15, borderRadius: 30, marginTop: 40 },
    backHomeBtnText: { color: '#FFF', fontSize: 16, fontFamily: 'Poppins_700Bold' },
});
