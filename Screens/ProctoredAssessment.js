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
    ActivityIndicator,
    Modal,
    FlatList,
    AppState
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import * as DocumentPicker from 'expo-document-picker';

import API_URL from '../config';

const { width, height } = Dimensions.get('window');

export default function ProctoredAssessment({ route, navigation }) {
    const { userProfile, assessmentData } = route.params || {};
    const role = userProfile?.role || "User";
    const isAdmin = role === 'Ops Manager' || role === 'City Manager' || role === 'Store Manager';

    // VIEW STATE
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
    const [violations, setViolations] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const [cheatingStatus, setCheatingStatus] = useState('clean'); // clean, warning, critical

    // ADMIN RESULTS STATE
    const [viewSubmissions, setViewSubmissions] = useState([]);
    const [loadingSubmissions, setLoadingSubmissions] = useState(false);

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

    // TIMER EFFECTS
    useEffect(() => {
        let interval;
        if (testStarted && !testSubmitted && selectedAssessment) {
            const totalSeconds = (selectedAssessment.time_limit_minutes || 30) * 60;
            setTimeRemaining(totalSeconds);

            interval = setInterval(() => {
                setRecordingTime(prev => prev + 1);
                setTimeRemaining(prev => {
                    if (prev <= 1) {
                        // Auto-submit when time runs out
                        handleAutoSubmit();
                        return 0;
                    }
                    return prev - 1;
                });
                // Random AI Scan Simulation
                if (Math.random() > 0.97) {
                    setIsAiScanning(true);
                    setTimeout(() => setIsAiScanning(false), 2000);
                }
            }, 1000);
        }

        // REAL PROCTORING - Detect App Backgrounding
        const subscription = AppState.addEventListener('change', nextAppState => {
            if (!testStarted) return;
            if (nextAppState.match(/inactive|background/)) {
                setViolations(prev => {
                    const newVal = prev + 1;
                    if (newVal >= 1) setCheatingStatus('critical');
                    return newVal;
                });
                // Persistent visual warning instead of just one alert
                setTimeout(() => setCheatingStatus('warning'), 5000);
            }
        });

        return () => {
            clearInterval(interval);
            subscription.remove();
        };
    }, [testStarted, testSubmitted, selectedAssessment]);

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
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

    // --- AI GENERATION ---
    const handleAiGenerate = async () => {
        if (!title || (!aiTopic && !aiContent)) {
            Alert.alert("Missing", "Please provide a title and either a topic or content.");
            return;
        }

        setGenerating(true);
        try {
            const formData = new FormData();
            formData.append('title', title);
            formData.append('description', desc);
            formData.append('time_limit_minutes', (parseInt(timeLimit) || 30).toString());
            formData.append('passing_score', (parseInt(passingScore) || 70).toString());
            formData.append('num_questions', (parseInt(aiNumQuestions) || 10).toString());
            formData.append('topic', aiTopic);
            formData.append('content', aiContent);
            formData.append('created_by', userProfile?.name || 'Admin');

            const response = await fetch(`${API_URL}/proctored-assessments/ai-generate`, {
                method: 'POST',
                body: formData
            });

            const result = await response.json();
            if (result.status === 'success') {
                Alert.alert("Success", `AI generated ${result.questions_count} questions for your assessment!`);
                setTitle('');
                setDesc('');
                setAiTopic('');
                setAiContent('');
                setAiModalVisible(false);
                fetchAssessments();
                setViewMode('list');
            } else {
                Alert.alert("Error", result.detail || "AI generation failed.");
            }
        } catch (err) {
            Alert.alert("Error", "Failed to generate questions with AI.");
        } finally {
            setGenerating(false);
        }
    };

    // --- TAKER LOGIC ---
    const startTest = async () => {
        // Simple permission check since we are using the hook
        if (!permission?.granted) {
            const res = await requestPermission();
            if (!res.granted) {
                Alert.alert("Permission Required", "Camera access is needed.");
                return;
            }
        }

        setTestStarted(true);
        setUserAnswers(new Array((selectedAssessment?.questions || []).length).fill(null));
        setRecordingTime(0);
        setViolations(0);

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
        try {
            const formData = new FormData();
            formData.append('user_email', userProfile?.email || 'user@example.com');
            formData.append('user_name', userProfile?.name || 'User');
            formData.append('answers', JSON.stringify(userAnswers));
            formData.append('time_taken_seconds', recordingTime.toString());
            formData.append('violations', violations.toString());

            const response = await fetch(`${API_URL}/proctored-assessments/${selectedAssessment.id}/submit`, {
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
                    passingScore: result.result.passing_score
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
                    passingScore: selectedAssessment?.passing_score || 70
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
                passingScore: selectedAssessment?.passing_score || 70
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
        setScore(null);
        setCheatingStatus('clean');
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
                    <View key={i} style={styles.resultCard}>
                        <View>
                            <Text style={styles.resultName}>{sub.user_name}</Text>
                            <Text style={styles.resultDate}>{new Date(sub.submitted_at).toLocaleString()}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                            <Text style={[styles.resultScore, { color: sub.passed ? '#10B981' : '#EF4444' }]}>
                                {sub.score}%
                            </Text>
                            {sub.violations > 0 && (
                                <Text style={styles.violationText}>⚠️ {sub.violations} Violations</Text>
                            )}
                        </View>
                    </View>
                ))
            )}
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
                    {isAdmin && (
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
                        {isAdmin && (
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
                            {isAdmin ? (
                                <View style={{ flexDirection: 'row', gap: 10 }}>
                                    <TouchableOpacity onPress={() => handleViewResults(assessment)}>
                                        <Feather name="eye" size={20} color="#6B7280" />
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => handleDeleteAssessment(assessment.id)}>
                                        <Feather name="trash-2" size={20} color="#EF4444" />
                                    </TouchableOpacity>
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
                <View style={styles.centerMode}>
                    <MaterialCommunityIcons
                        name={score?.passed ? "check-decagram" : "close-circle"}
                        size={80}
                        color={score?.passed ? "#10B981" : "#EF4444"}
                    />
                    <Text style={styles.modeTitle}>
                        {score?.passed ? "Congratulations!" : "Assessment Complete"}
                    </Text>
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
                    <TouchableOpacity style={styles.backHomeBtn} onPress={() => navigation.goBack()}>
                        <Text style={styles.backHomeBtnText}>Go Back</Text>
                    </TouchableOpacity>
                </View>
            );
        }

        const q = targetQuestions[currentStep];
        if (!q) return null;

        return (
            <View style={{ flex: 1 }}>
                {/* PROCTORING OVERLAY */}
                <View style={[styles.proctorBar, cheatingStatus === 'critical' && { backgroundColor: '#DC2626' }]}>
                    <View style={styles.proctorDot} />
                    <Text style={styles.proctorText}>
                        {cheatingStatus === 'critical' ? 'VIOLATION DETECTED' : cheatingStatus === 'warning' ? 'WARNING' : 'SECURE'} • {formatTime(recordingTime)}
                    </Text>
                    <View style={styles.timerBox}>
                        <MaterialCommunityIcons name="clock-outline" size={14} color={timeRemaining < 60 ? "#FFF" : "#FCD34D"} />
                        <Text style={[styles.timerText, timeRemaining < 60 && { color: '#FFF' }]}>
                            {formatTime(timeRemaining)}
                        </Text>
                    </View>
                </View>

                {cheatingStatus === 'critical' && (
                    <View style={styles.criticalOverlay}>
                        <MaterialCommunityIcons name="alert-decagram" size={60} color="#FFF" />
                        <Text style={styles.criticalText}>RETURN TO APP IMMEDIATELY</Text>
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
                    <View style={styles.recDot} />
                </View>

                {/* AI SCAN SIMULATION */}
                {isAiScanning && (
                    <Animated.View entering={FadeInDown} style={styles.aiScanOverlay}>
                        <View style={styles.scanLine} />
                        <Text style={styles.aiScanText}>AI BEHAVIORAL ANALYSIS...</Text>
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
                        <TouchableOpacity onPress={() => setAiModalVisible(false)}>
                            <Feather name="x" size={24} color="#6B7280" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false}>
                        <Text style={styles.label}>Topic (optional)</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="e.g. Food Safety Protocols"
                            value={aiTopic}
                            onChangeText={setAiTopic}
                        />

                        <Text style={styles.label}>Or Paste Content</Text>
                        <TextInput
                            style={[styles.input, { height: 120 }]}
                            placeholder="Paste training content, SOP text, or any material to generate questions from..."
                            value={aiContent}
                            onChangeText={setAiContent}
                            multiline
                        />

                        <Text style={styles.label}>Number of Questions</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="10"
                            value={aiNumQuestions}
                            onChangeText={setAiNumQuestions}
                            keyboardType="numeric"
                        />

                        <TouchableOpacity
                            style={[styles.aiGenerateBtn, generating && { opacity: 0.7 }]}
                            onPress={handleAiGenerate}
                            disabled={generating}
                        >
                            {generating ? (
                                <ActivityIndicator color="#FFF" />
                            ) : (
                                <>
                                    <MaterialCommunityIcons name="auto-fix" size={20} color="#FFF" />
                                    <Text style={styles.aiGenerateBtnText}>Generate Assessment</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );

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
    timerBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
    timerText: { marginLeft: 5, color: '#FCD34D', fontSize: 12, fontFamily: 'Poppins_700Bold' },
    progressContainer: { height: 4, backgroundColor: '#E5E7EB' },
    progressFill: { height: '100%', backgroundColor: '#F59E0B' },
    questionCounter: { textAlign: 'center', paddingVertical: 10, fontFamily: 'Poppins_600SemiBold', color: '#6B7280', backgroundColor: '#FFF' },

    cameraPreview: { position: 'absolute', top: 50, right: 20, width: 80, height: 100, backgroundColor: '#111827', borderRadius: 10, borderWidth: 2, borderColor: '#EF4444', overflow: 'hidden', zIndex: 50, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, elevation: 8 },
    cameraInner: { flex: 1 },
    recDot: { position: 'absolute', top: 6, left: 6, width: 5, height: 5, borderRadius: 3, backgroundColor: '#EF4444' },

    aiScanOverlay: { position: 'absolute', top: 50, left: 20, right: 110, height: 100, backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: '#EF4444', justifyContent: 'center', alignItems: 'center', zIndex: 40 },
    scanLine: { position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: '#EF4444', opacity: 0.5 },
    aiScanText: { color: '#EF4444', fontSize: 9, fontFamily: 'Poppins_700Bold', textAlign: 'center' },

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
    modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: height * 0.8 },
    modalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
    modalTitle: { flex: 1, fontSize: 18, fontFamily: 'Poppins_700Bold', color: '#1F2937', marginLeft: 10 },
    aiGenerateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#7C3AED', padding: 16, borderRadius: 14, marginTop: 20, marginBottom: 30 },
    aiGenerateBtnText: { color: '#FFF', fontSize: 16, fontFamily: 'Poppins_700Bold', marginLeft: 8 },

    // Results & Overlay
    criticalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(220, 38, 38, 0.9)', justifyContent: 'center', alignItems: 'center', zIndex: 200 },
    criticalText: { color: '#FFF', fontSize: 24, fontFamily: 'Poppins_700Bold', textAlign: 'center', marginTop: 20 },
    resultCard: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, backgroundColor: '#FFF', borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#E5E7EB' },
    resultName: { fontSize: 16, fontFamily: 'Poppins_600SemiBold', color: '#1F2937' },
    resultDate: { fontSize: 12, color: '#6B7280', marginTop: 4 },
    resultScore: { fontSize: 18, fontFamily: 'Poppins_700Bold' },
    violationText: { fontSize: 10, color: '#EF4444', fontFamily: 'Poppins_700Bold', marginTop: 2 },
    sectionHeaderBox: { marginBottom: 15 },
});
