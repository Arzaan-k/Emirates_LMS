import React, { useState, useEffect, useRef } from "react";
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Dimensions,
    ActivityIndicator,
    Modal,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons, Feather, FontAwesome5 } from "@expo/vector-icons";
import Animated, {
    FadeInDown,
    FadeIn,
    FadeOut,
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withSequence,
    withTiming
} from "react-native-reanimated";
import { BlurView } from "expo-blur";

const { width, height } = Dimensions.get("window");

// --- MOCK AIC QUIZ DATA ---
const AI_QUIZ_DATA = [
    {
        id: 1,
        question: "A customer returns a waffle claiming it's 'soggy'. What is the AI-recommended first step?",
        options: [
            { id: 'a', text: "Apologize and refund immediately." },
            { id: 'b', text: "Inspect cooking time logs.", correct: true },
            { id: 'c', text: "Reheat the same waffle." },
            { id: 'd', text: "Blame the humidity." },
        ],
        aiLogic: "AI Analysis: Refund is costly. Reheating ruins quality. Inspecting logs (Data-Driven) is the correct root-cause analysis approach.",
    },
    {
        id: 2,
        question: "The Espresso machine pressure gauge reads 7 bars. What do you do?",
        options: [
            { id: 'a', text: "Continue serving, it's fine." },
            { id: 'b', text: "Adjust grind size coarser." },
            { id: 'c', text: "Adjust grind size finer.", correct: true },
            { id: 'd', text: "Call the technician immediately." },
        ],
        aiLogic: "AI Analysis: 7 bars is under-extracted. Finer grind increases resistance to reach the optimal 9 bars. Technician is a last resort.",
    },
    {
        id: 3,
        question: "Inventory Alert: Nutella is running low (2 days stock). A bulk order takes 3 days. Action?",
        options: [
            { id: 'a', text: "Place Emergency Transfer from nearby store.", correct: true },
            { id: 'b', text: "Wait for bulk order." },
            { id: 'c', text: "Stop serving Nutella waffles." },
            { id: 'd', text: "Use generic chocolate sauce." },
        ],
        aiLogic: "AI Analysis: OOS (Out of Stock) damages reputation. Emergency transfer maintains availability without compromising quality.",
    }
];

const QUIZ_TOPICS = [
    { id: 1, title: "Espresso Science", count: "12 Qs", color: ["#F59E0B", "#D97706"], icon: "coffee" },
    { id: 2, title: "Milk Texturing", count: "8 Qs", color: ["#3B82F6", "#2563EB"], icon: "water" },
    { id: 3, title: "Customer Service", count: "15 Qs", color: ["#10B981", "#059669"], icon: "account-heart" },
    { id: 4, title: "Machine Maint.", count: "10 Qs", color: ["#6366F1", "#4F46E5"], icon: "cogs" },
];

export default function QuizSection() {
    const [quizVisible, setQuizVisible] = useState(false);
    const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
    const [score, setScore] = useState(0);
    const [gameState, setGameState] = useState('intro'); // intro, playing, analyzing, result
    const [selectedOption, setSelectedOption] = useState(null);
    const [aiFeedback, setAiFeedback] = useState("");

    // Animation Values
    const scaleAnim = useSharedValue(1);

    const startQuiz = () => {
        setQuizVisible(true);
        setGameState('intro');
        setScore(0);
        setCurrentQuestionIdx(0);

        // Simulate "AI Generating Questions"
        setTimeout(() => {
            setGameState('playing');
        }, 2500);
    };

    const handleAnswer = (option) => {
        setSelectedOption(option.id);

        // Wait for visual selection
        setTimeout(() => {
            if (option.correct) setScore(prev => prev + 100);

            // Show AI Logic
            setGameState('analyzing');
            setAiFeedback(AI_QUIZ_DATA[currentQuestionIdx].aiLogic);

            setTimeout(() => {
                if (currentQuestionIdx < AI_QUIZ_DATA.length - 1) {
                    setCurrentQuestionIdx(prev => prev + 1);
                    setSelectedOption(null);
                    setGameState('playing');
                } else {
                    setGameState('result');
                }
            }, 3000); // Read time for AI logic
        }, 600);
    };

    const closeQuiz = () => {
        setQuizVisible(false);
    };

    // --- RENDER HELPERS ---

    const renderIntro = () => (
        <View style={styles.centerContent}>
            <MaterialCommunityIcons name="brain" size={80} color="#8B5CF6" />
            <Text style={styles.loadingText}>AI is generating tricky scenarios based on your profile...</Text>
            <ActivityIndicator size="large" color="#8B5CF6" style={{ marginTop: 20 }} />
        </View>
    );

    const renderPlaying = () => {
        const question = AI_QUIZ_DATA[currentQuestionIdx];
        return (
            <Animated.View entering={FadeInDown.duration(500)} style={styles.quizContent}>
                {/* PROGRESS BAR */}
                <View style={styles.progressBarBg}>
                    <View style={[styles.progressBarFill, { width: `${((currentQuestionIdx + 1) / AI_QUIZ_DATA.length) * 100}%` }]} />
                </View>

                {/* QUESTION CARD */}
                <View style={styles.questionCard}>
                    <Text style={styles.questionText}>{question.question}</Text>
                </View>

                {/* OPTIONS */}
                <View style={styles.optionsContainer}>
                    {question.options.map((opt, index) => {
                        const isSelected = selectedOption === opt.id;
                        const isCorrect = opt.correct;

                        // Determine Color
                        // In 'playing' mode, we just show selection color
                        // But since we transition to 'analyzing' instantly, user sees result in 'analyzing' mode.

                        return (
                            <TouchableOpacity
                                key={opt.id}
                                style={[
                                    styles.optionBtn,
                                    isSelected && { backgroundColor: '#EDE9FE', borderColor: '#8B5CF6' }
                                ]}
                                onPress={() => !selectedOption && handleAnswer(opt)}
                                activeOpacity={0.8}
                            >
                                <View style={[styles.optionCircle, isSelected && { backgroundColor: '#8B5CF6' }]}>
                                    <Text style={[styles.optionLetter, isSelected && { color: '#FFF' }]}>{opt.id.toUpperCase()}</Text>
                                </View>
                                <Text style={[styles.optionText, isSelected && { color: '#5B21B6', fontFamily: "Poppins_600SemiBold" }]}>{opt.text}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </Animated.View>
        );
    };

    const renderAnalyzing = () => {
        const question = AI_QUIZ_DATA[currentQuestionIdx];
        const isCorrect = question.options.find(o => o.id === selectedOption)?.correct;

        return (
            <View style={styles.quizContent}>
                <View style={styles.questionCard}>
                    <Text style={styles.questionText}>{question.question}</Text>
                </View>

                <View style={styles.aiFeedbackCard}>
                    <View style={styles.aiHeader}>
                        <MaterialCommunityIcons name={isCorrect ? "check-circle" : "close-circle"} size={32} color={isCorrect ? "#10B981" : "#EF4444"} />
                        <Text style={[styles.aiResultTitle, { color: isCorrect ? "#10B981" : "#EF4444" }]}>
                            {isCorrect ? "Correct Decision!" : "Incorrect Logic"}
                        </Text>
                    </View>
                    <Text style={styles.aiFeedbackText}>{aiFeedback}</Text>
                    <View style={styles.nextTimer}>
                        <ActivityIndicator size="small" color="#6B7280" />
                        <Text style={styles.nextText}>Next Scenario loading...</Text>
                    </View>
                </View>
            </View>
        );
    };

    const renderResult = () => (
        <View style={styles.resultContainer}>
            <MaterialCommunityIcons name="trophy" size={100} color="#F59E0B" />
            <Text style={styles.resultTitle}>Challenge Complete!</Text>
            <Text style={styles.resultScore}>You Scored: {score} XP</Text>

            <View style={styles.rankBadge}>
                <Text style={styles.rankText}>Global Rank: #4 ⬆️</Text>
            </View>

            <Text style={styles.resultSub}>"You demonstrated excellent operational awareness. The AI is impressed."</Text>

            <TouchableOpacity style={styles.closeQuizBtn} onPress={closeQuiz}>
                <Text style={styles.closeQuizText}>Claim Rewards & Exit</Text>
            </TouchableOpacity>
        </View>
    );

    return (
        <ScrollView
            contentContainerStyle={{ paddingBottom: 100, paddingTop: 20 }}
            showsVerticalScrollIndicator={false}
        >

            {/* DAILY AI CHALLENGE HEADER */}
            <Animated.View entering={FadeInDown.delay(100).duration(600)} style={styles.heroContainer}>
                <LinearGradient
                    colors={["#7C3AED", "#4F46E5"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.heroCard}
                >
                    <View style={styles.heroContent}>
                        <View style={styles.badgeContainer}>
                            <MaterialCommunityIcons name="robot" size={20} color="#FBBF24" />
                            <Text style={styles.badgeText}>DAILY AI CHALLENGE</Text>
                        </View>
                        <Text style={styles.heroTitle}>Beat the AI Logic</Text>
                        <Text style={styles.heroSubtitle}>Answer 3 tricky scenario questions generated by our AI based on your weak spots.</Text>

                        <TouchableOpacity style={styles.startBtn} onPress={startQuiz}>
                            <Text style={styles.startBtnText}>Start Challenge</Text>
                            <Feather name="arrow-right" size={20} color="#4F46E5" />
                        </TouchableOpacity>
                    </View>
                    <View style={styles.heroDecor}>
                        <MaterialCommunityIcons name="brain" size={120} color="rgba(255,255,255,0.1)" />
                    </View>
                </LinearGradient>
            </Animated.View>

            {/* STREAK & STATS */}
            <View style={styles.statsRow}>
                <View style={styles.statItem}>
                    <MaterialCommunityIcons name="fire" size={24} color="#EF4444" />
                    <View>
                        <Text style={styles.statVal}>12</Text>
                        <Text style={styles.statLabel}>Streak</Text>
                    </View>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                    <MaterialCommunityIcons name="target" size={24} color="#F59E0B" />
                    <View>
                        <Text style={styles.statVal}>94%</Text>
                        <Text style={styles.statLabel}>Accuracy</Text>
                    </View>
                </View>
            </View>

            {/* TOPICS GRID */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Topic Quizzes</Text>
                <View style={styles.grid}>
                    {QUIZ_TOPICS.map((topic, index) => (
                        <Animated.View
                            key={topic.id}
                            entering={FadeInDown.delay(200 + index * 100).duration(500)}
                            style={styles.topicCardWrapper}
                        >
                            <TouchableOpacity style={[styles.topicCard]}>
                                <LinearGradient colors={topic.color} style={styles.topicIconBox}>
                                    <MaterialCommunityIcons name={topic.icon} size={32} color="#FFF" />
                                </LinearGradient>
                                <Text style={styles.topicTitle}>{topic.title}</Text>
                                <Text style={styles.topicCount}>{topic.count}</Text>
                                <View style={styles.cardEdge} />
                            </TouchableOpacity>
                        </Animated.View>
                    ))}
                </View>
            </View>

            {/* FULL SCREEN QUIZ MODAL */}
            <Modal visible={quizVisible} animationType="slide" transparent={true}>
                <BlurView intensity={100} tint="dark" style={styles.modalContainer}>
                    {/* Header */}
                    <View style={styles.quizHeader}>
                        <TouchableOpacity onPress={closeQuiz} style={styles.closeBtn}>
                            <Feather name="x" size={24} color="#FFF" />
                        </TouchableOpacity>
                        <Text style={styles.quizHeaderTitle}>AI Logic Challenge</Text>
                        <View style={{ width: 40 }} />
                    </View>

                    {/* Content */}
                    <View style={{ flex: 1, justifyContent: 'center' }}>
                        {gameState === 'intro' && renderIntro()}
                        {gameState === 'playing' && renderPlaying()}
                        {gameState === 'analyzing' && renderAnalyzing()}
                        {gameState === 'result' && renderResult()}
                    </View>
                </BlurView>
            </Modal>

        </ScrollView>
    );
}

const styles = StyleSheet.create({
    // HERO
    heroContainer: { paddingHorizontal: 20, marginBottom: 20 },
    heroCard: { borderRadius: 24, padding: 24, position: 'relative', overflow: 'hidden' },
    heroContent: { zIndex: 10 },
    badgeContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: "rgba(255,255,255,0.2)", alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, marginBottom: 16 },
    badgeText: { color: "#FBBF24", fontSize: 12, fontFamily: "Poppins_700Bold", marginLeft: 6 },
    heroTitle: { fontSize: 28, fontFamily: "Poppins_700Bold", color: "#FFF", marginBottom: 8 },
    heroSubtitle: { fontSize: 14, color: "rgba(255,255,255,0.9)", lineHeight: 22, marginBottom: 24, fontFamily: "Poppins_400Regular" },
    startBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: "#FFF", alignSelf: 'flex-start', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 },
    startBtnText: { color: "#4F46E5", fontSize: 16, fontFamily: "Poppins_600SemiBold", marginRight: 8 },
    heroDecor: { position: 'absolute', right: -20, bottom: -20, zIndex: 1 },

    // STATS
    statsRow: { flexDirection: 'row', backgroundColor: "#FFF", marginHorizontal: 20, padding: 16, borderRadius: 16, justifyContent: 'space-evenly', alignItems: 'center', marginBottom: 30, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
    statItem: { flexDirection: 'row', alignItems: 'center', width: '40%', justifyContent: 'center' },
    statDivider: { width: 1, height: 30, backgroundColor: "#F3F4F6" },
    statVal: { fontSize: 20, fontFamily: "Poppins_700Bold", color: "#111827", marginLeft: 10 },
    statLabel: { fontSize: 11, color: "#6B7280", fontFamily: "Poppins_500Medium", marginLeft: 10 },

    // TOPICS
    section: { paddingHorizontal: 20, marginBottom: 30 },
    sectionTitle: { fontSize: 18, fontFamily: "Poppins_700Bold", color: "#111827", marginBottom: 16 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    topicCardWrapper: { width: '48%', marginBottom: 16 },
    topicCard: { backgroundColor: "#FFF", borderRadius: 20, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: "#F3F4F6", borderBottomWidth: 4, borderBottomColor: "#E5E7EB" },
    topicIconBox: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 3 },
    topicTitle: { fontSize: 15, fontFamily: "Poppins_600SemiBold", color: "#111827", marginBottom: 4 },
    topicCount: { fontSize: 12, color: "#9CA3AF", fontFamily: "Poppins_500Medium" },

    // MODAL
    modalContainer: { flex: 1, paddingTop: 50 },
    quizHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20 },
    closeBtn: { padding: 10, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20 },
    quizHeaderTitle: { color: "#FFF", fontSize: 18, fontFamily: "Poppins_700Bold" },

    centerContent: { alignItems: 'center', padding: 40 },
    loadingText: { color: "#FFF", marginTop: 20, textAlign: 'center', fontSize: 16, fontFamily: "Poppins_500Medium" },

    quizContent: { paddingHorizontal: 20, width: '100%' },
    progressBarBg: { height: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3, marginBottom: 30 },
    progressBarFill: { height: '100%', backgroundColor: '#8B5CF6', borderRadius: 3 },

    questionCard: { marginBottom: 30 },
    questionText: { color: "#FFF", fontSize: 22, fontFamily: "Poppins_600SemiBold", lineHeight: 32 },

    optionsContainer: {},
    optionBtn: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    optionCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
    optionLetter: { color: '#FFF', fontSize: 12, fontFamily: "Poppins_700Bold" },
    optionText: { flex: 1, color: "rgba(255,255,255,0.9)", fontSize: 14, fontFamily: "Poppins_400Regular" },

    // AI FEEDBACK
    aiFeedbackCard: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 24, padding: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    aiHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    aiResultTitle: { fontSize: 18, fontFamily: "Poppins_700Bold", marginLeft: 12 },
    aiFeedbackText: { color: "#E0E7FF", fontSize: 14, lineHeight: 22, fontFamily: "Poppins_400Regular", marginBottom: 20 },
    nextTimer: { flexDirection: 'row', alignItems: 'center' },
    nextText: { color: "#9CA3AF", fontSize: 12, marginLeft: 8, fontStyle: 'italic' },

    // RESULT
    resultContainer: { alignItems: 'center', padding: 30 },
    resultTitle: { color: "#FFF", fontSize: 28, fontFamily: "Poppins_700Bold", marginTop: 20, marginBottom: 10 },
    resultScore: { color: "#FBBF24", fontSize: 20, fontFamily: "Poppins_600SemiBold", marginBottom: 30 },
    rankBadge: { backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginBottom: 30 },
    rankText: { color: "#10B981", fontSize: 14, fontFamily: "Poppins_700Bold" },
    resultSub: { color: "#9CA3AF", textAlign: 'center', fontSize: 14, marginBottom: 40, fontFamily: "Poppins_400Italic" },
    closeQuizBtn: { backgroundColor: "#8B5CF6", width: '100%', paddingVertical: 16, borderRadius: 20, alignItems: 'center' },
    closeQuizText: { color: "#FFF", fontSize: 16, fontFamily: "Poppins_700Bold" },
});
