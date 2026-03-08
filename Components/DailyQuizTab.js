/**
 * DailyQuizTab.js
 * Employee-facing Daily Quiz tab component.
 * Shows today's quiz: countdown timer, MCQ questions, results screen.
 * Hooked into Courses.js beside the existing tabs.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    ActivityIndicator, Animated, Platform, Modal
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import API_URL from '../config';

// ─────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────
const COLORS = {
    bg: '#F8FAFC',
    card: '#FFFFFF',
    primary: '#6366F1',
    primaryLight: '#EEF2FF',
    green: '#10B981',
    greenLight: '#D1FAE5',
    red: '#EF4444',
    redLight: '#FEE2E2',
    amber: '#D71A21',
    amberLight: '#FEF3C7',
    text: '#1E293B',
    sub: '#64748B',
    border: '#E2E8F0',
};

const DIFFICULTY_COLOR = { easy: COLORS.green, medium: COLORS.amber, hard: COLORS.red };

// ─────────────────────────────────────────────────────────────────
// TIMER HOOK
// ─────────────────────────────────────────────────────────────────
function useCountdown(initialSeconds, active) {
    const [seconds, setSeconds] = useState(initialSeconds);
    const intervalRef = useRef(null);

    useEffect(() => {
        if (!active) return;
        if (seconds <= 0) return;
        intervalRef.current = setInterval(() => setSeconds(s => Math.max(0, s - 1)), 1000);
        return () => clearInterval(intervalRef.current);
    }, [active, seconds > 0]);

    const fmt = (s) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    };

    return { seconds, timeStr: fmt(seconds), isDone: seconds <= 0 };
}

// ─────────────────────────────────────────────────────────────────
// RESULT SCREEN
// ─────────────────────────────────────────────────────────────────
function ResultScreen({ score, total, passed, questions, userAnswers, onClose }) {
    const pct = total > 0 ? Math.round((score / total) * 100) : 0;

    return (
        <ScrollView style={styles.resultScroll} contentContainerStyle={styles.resultContent}>
            {/* Header */}
            <View style={[styles.resultHeader, { backgroundColor: passed ? COLORS.green : COLORS.red }]}>
                <MaterialCommunityIcons
                    name={passed ? 'trophy-award' : 'close-circle'}
                    size={52}
                    color="#FFF"
                />
                <Text style={styles.resultTitle}>{passed ? '🎉 Quiz Passed!' : 'Better Luck Tomorrow'}</Text>
                <Text style={styles.resultPct}>{pct}%</Text>
                <Text style={styles.resultSub}>{score} / {total} correct</Text>
            </View>

            {/* Answer review */}
            <Text style={styles.reviewHeading}>Answer Review</Text>
            {questions.map((q, i) => {
                const ua = userAnswers[i];
                const correct = q.correctIndex;
                const isRight = ua === correct;
                return (
                    <View key={i} style={[styles.reviewCard, { borderLeftColor: isRight ? COLORS.green : COLORS.red }]}>
                        <Text style={styles.reviewQ}>{i + 1}. {q.question}</Text>
                        {(q.options || []).map((opt, j) => {
                            const isCorr = j === correct;
                            const isUser = j === ua;
                            let bg = 'transparent';
                            if (isCorr) bg = COLORS.greenLight;
                            else if (isUser && !isRight) bg = COLORS.redLight;
                            return (
                                <View key={j} style={[styles.reviewOpt, { backgroundColor: bg }]}>
                                    <Text style={styles.reviewOptText}>
                                        {isCorr ? '✅ ' : isUser && !isRight ? '❌ ' : '   '}
                                        {opt}
                                    </Text>
                                </View>
                            );
                        })}
                    </View>
                );
            })}

            <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
                <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
        </ScrollView>
    );
}

// ─────────────────────────────────────────────────────────────────
// QUIZ SCREEN
// ─────────────────────────────────────────────────────────────────
function QuizScreen({ quiz, userEmail, onFinish }) {
    const totalSecs = (quiz.time_limit_minutes || 10) * 60;
    const [started, setStarted] = useState(false);
    const [qIdx, setQIdx] = useState(0);
    const [answers, setAnswers] = useState([]);
    const [selectedNow, setSelectedNow] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState(null);
    const startTime = useRef(Date.now());

    const { seconds, timeStr, isDone } = useCountdown(totalSecs, started && !result);
    const questions = quiz.questions || [];
    const q = questions[qIdx];

    // Auto-submit when timer runs out
    useEffect(() => {
        if (isDone && started && !result) handleSubmit();
    }, [isDone]);

    const handleOption = (idx) => {
        if (result) return;
        setSelectedNow(idx);
    };

    const handleNext = () => {
        const updated = [...answers, selectedNow !== null ? selectedNow : -1];
        if (qIdx < questions.length - 1) {
            setAnswers(updated);
            setQIdx(qIdx + 1);
            setSelectedNow(null);
        } else {
            // Last question — submit
            handleSubmit(updated);
        }
    };

    const handleSubmit = async (finalAnswers) => {
        const ans = finalAnswers || [...answers, selectedNow !== null ? selectedNow : -1];
        setSubmitting(true);
        const elapsed = Math.round((Date.now() - startTime.current) / 1000);
        try {
            const resp = await fetch(`${API_URL}/api/v1/daily-quiz/submit/${quiz.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_email: userEmail, answers: ans, time_taken_seconds: elapsed }),
            });
            const data = await resp.json();
            setResult({ ...data, answers: ans });
        } catch (e) {
            console.error('Submit error:', e);
        } finally {
            setSubmitting(false);
        }
    };

    if (result) {
        return (
            <ResultScreen
                score={result.score}
                total={result.total}
                passed={result.passed}
                questions={questions}
                userAnswers={result.answers}
                onClose={onFinish}
            />
        );
    }

    if (!started) {
        return (
            <View style={styles.startScreen}>
                <MaterialCommunityIcons name="brain" size={64} color={COLORS.primary} />
                <Text style={styles.startTitle}>{quiz.title}</Text>
                <Text style={styles.startSub}>
                    {questions.length} questions • {quiz.time_limit_minutes} min •{' '}
                    <Text style={{ color: DIFFICULTY_COLOR[quiz.difficulty] || COLORS.amber }}>
                        {(quiz.difficulty || 'medium').charAt(0).toUpperCase() + (quiz.difficulty || 'medium').slice(1)}
                    </Text>
                </Text>
                {quiz.description ? <Text style={styles.startDesc}>{quiz.description}</Text> : null}
                <TouchableOpacity style={styles.startBtn} onPress={() => { setStarted(true); startTime.current = Date.now(); }}>
                    <Feather name="play" size={18} color="#FFF" />
                    <Text style={styles.startBtnText}>Start Quiz</Text>
                </TouchableOpacity>
            </View>
        );
    }

    if (!q) return null;
    const progress = ((qIdx + 1) / questions.length) * 100;
    const timerWarning = seconds < 60;

    return (
        <ScrollView style={styles.quizScrollView} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* Timer + Progress */}
            <View style={styles.quizTopBar}>
                <View style={styles.progressBarWrap}>
                    <View style={[styles.progressFill, { width: `${progress}%` }]} />
                </View>
                <View style={[styles.timerBadge, timerWarning && { backgroundColor: COLORS.redLight }]}>
                    <Feather name="clock" size={14} color={timerWarning ? COLORS.red : COLORS.sub} />
                    <Text style={[styles.timerText, timerWarning && { color: COLORS.red }]}>{timeStr}</Text>
                </View>
            </View>

            <Text style={styles.qCounter}>Question {qIdx + 1} of {questions.length}</Text>
            <Text style={styles.qText}>{q.question}</Text>

            <View style={styles.optionsWrap}>
                {(q.options || []).map((opt, j) => (
                    <TouchableOpacity
                        key={j}
                        style={[styles.optBtn, selectedNow === j && styles.optBtnSelected]}
                        onPress={() => handleOption(j)}
                        activeOpacity={0.75}
                    >
                        <View style={[styles.optCircle, selectedNow === j && styles.optCircleSelected]}>
                            <Text style={[styles.optLetter, selectedNow === j && { color: '#FFF' }]}>
                                {String.fromCharCode(65 + j)}
                            </Text>
                        </View>
                        <Text style={[styles.optText, selectedNow === j && { color: COLORS.primary, fontWeight: '600' }]}>
                            {opt}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            <TouchableOpacity
                style={[styles.nextBtn, selectedNow === null && { opacity: 0.5 }]}
                onPress={handleNext}
                disabled={selectedNow === null || submitting}
            >
                {submitting
                    ? <ActivityIndicator color="#FFF" />
                    : <>
                        <Text style={styles.nextBtnText}>
                            {qIdx === questions.length - 1 ? 'Submit' : 'Next'}
                        </Text>
                        <Feather name={qIdx === questions.length - 1 ? 'check' : 'arrow-right'} size={18} color="#FFF" />
                    </>
                }
            </TouchableOpacity>
        </ScrollView>
    );
}

// ─────────────────────────────────────────────────────────────────
// MAIN COMPONENT — DailyQuizTab
// ─────────────────────────────────────────────────────────────────
export default function DailyQuizTab({ userEmail }) {
    const [loading, setLoading] = useState(true);
    const [quizData, setQuizData] = useState(null); // { quiz, already_submitted, previous_response }
    const [taking, setTaking] = useState(false);
    const [history, setHistory] = useState([]);

    useEffect(() => {
        fetchToday();
    }, [userEmail]);

    const fetchToday = async () => {
        setLoading(true);
        try {
            const r = await fetch(`${API_URL}/api/v1/daily-quiz/today?user_email=${encodeURIComponent(userEmail)}`);
            const d = await r.json();
            setQuizData(d);
        } catch (e) {
            console.error('DailyQuizTab fetch error:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleQuizFinish = () => {
        setTaking(false);
        fetchToday(); // Refresh to show result
    };

    if (loading) {
        return (
            <View style={styles.centerWrap}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.loadingText}>Loading today's quiz...</Text>
            </View>
        );
    }

    // Quiz in progress
    if (taking && quizData?.quiz) {
        return (
            <QuizScreen
                quiz={quizData.quiz}
                userEmail={userEmail}
                onFinish={handleQuizFinish}
            />
        );
    }

    // No quiz today
    if (!quizData?.quiz) {
        return (
            <View style={styles.centerWrap}>
                <MaterialCommunityIcons name="calendar-check" size={60} color={COLORS.border} />
                <Text style={styles.emptyTitle}>No quiz today</Text>
                <Text style={styles.emptySub}>Check back tomorrow or ask your admin to assign a daily quiz.</Text>
            </View>
        );
    }

    const { quiz, already_submitted, previous_response } = quizData;
    const diffColor = DIFFICULTY_COLOR[quiz.difficulty] || COLORS.amber;

    // Already submitted — show result card
    if (already_submitted && previous_response) {
        const pct = previous_response.total > 0
            ? Math.round((previous_response.score / previous_response.total) * 100)
            : 0;
        return (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
                <View style={[styles.resultBanner, { backgroundColor: previous_response.passed ? COLORS.green : COLORS.red }]}>
                    <MaterialCommunityIcons
                        name={previous_response.passed ? 'trophy-award' : 'emoticon-sad-outline'}
                        size={44}
                        color="#FFF"
                    />
                    <Text style={styles.resultBannerTitle}>
                        {previous_response.passed ? "Today's Quiz — Passed! 🎉" : "Today's Quiz — Not Passed"}
                    </Text>
                    <Text style={styles.resultBannerPct}>{pct}%</Text>
                    <Text style={styles.resultBannerSub}>
                        {previous_response.score} / {previous_response.total} correct
                    </Text>
                </View>

                <View style={styles.quizInfoCard}>
                    <Text style={styles.quizInfoTitle}>{quiz.title}</Text>
                    <View style={styles.quizInfoRow}>
                        <View style={[styles.diffBadge, { backgroundColor: diffColor + '20' }]}>
                            <Text style={[styles.diffBadgeText, { color: diffColor }]}>
                                {(quiz.difficulty || 'medium').toUpperCase()}
                            </Text>
                        </View>
                        <Text style={styles.quizInfoMeta}>
                            {(quiz.questions || []).length} questions • {quiz.time_limit_minutes} min
                        </Text>
                    </View>
                    <Text style={styles.alreadyNote}>✅ You've already submitted today's quiz. Come back tomorrow!</Text>
                </View>
            </ScrollView>
        );
    }

    // Quiz available — show info card + start button
    return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
            {/* Today's Quiz Card */}
            <View style={styles.quizCard}>
                <View style={styles.quizCardTop}>
                    <View style={styles.quizIconWrap}>
                        <MaterialCommunityIcons name="brain" size={36} color={COLORS.primary} />
                    </View>
                    <View style={{ flex: 1, marginLeft: 14 }}>
                        <Text style={styles.quizCardLabel}>TODAY'S QUIZ</Text>
                        <Text style={styles.quizCardTitle}>{quiz.title}</Text>
                    </View>
                    <View style={[styles.diffBadge, { backgroundColor: diffColor + '20' }]}>
                        <Text style={[styles.diffBadgeText, { color: diffColor }]}>
                            {(quiz.difficulty || 'medium').toUpperCase()}
                        </Text>
                    </View>
                </View>

                {quiz.description ? (
                    <Text style={styles.quizCardDesc}>{quiz.description}</Text>
                ) : null}

                <View style={styles.quizMetaRow}>
                    <View style={styles.quizMetaItem}>
                        <Feather name="help-circle" size={15} color={COLORS.primary} />
                        <Text style={styles.quizMetaText}>{(quiz.questions || []).length} Questions</Text>
                    </View>
                    <View style={styles.quizMetaItem}>
                        <Feather name="clock" size={15} color={COLORS.primary} />
                        <Text style={styles.quizMetaText}>{quiz.time_limit_minutes} Minutes</Text>
                    </View>
                    <View style={styles.quizMetaItem}>
                        <MaterialCommunityIcons name="calendar-today" size={15} color={COLORS.primary} />
                        <Text style={styles.quizMetaText}>{quiz.quiz_date || 'Today'}</Text>
                    </View>
                </View>

                <TouchableOpacity style={styles.startQuizBtn} onPress={() => setTaking(true)}>
                    <Feather name="play" size={18} color="#FFF" />
                    <Text style={styles.startQuizBtnText}>Start Today's Quiz</Text>
                </TouchableOpacity>
            </View>

            {/* Tips */}
            <View style={styles.tipsCard}>
                <Text style={styles.tipsTitle}>💡 Tips</Text>
                <Text style={styles.tipItem}>• You can only attempt this quiz once today</Text>
                <Text style={styles.tipItem}>• You must score 60% or above to pass</Text>
                <Text style={styles.tipItem}>• The timer starts once you press Start</Text>
            </View>
        </ScrollView>
    );
}

// ─────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    centerWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
    loadingText: { marginTop: 12, fontSize: 14, color: COLORS.sub, fontFamily: 'Poppins_400Regular' },
    emptyTitle: { fontSize: 18, fontFamily: 'Poppins_600SemiBold', color: COLORS.text, marginTop: 16 },
    emptySub: { fontSize: 13, color: COLORS.sub, fontFamily: 'Poppins_400Regular', textAlign: 'center', marginTop: 8 },

    // Quiz Card
    quizCard: {
        backgroundColor: COLORS.card,
        borderRadius: 20,
        padding: 20,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 4,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    quizCardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
    quizIconWrap: {
        width: 60, height: 60, borderRadius: 16,
        backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center',
    },
    quizCardLabel: { fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: COLORS.primary, letterSpacing: 1.5 },
    quizCardTitle: { fontSize: 16, fontFamily: 'Poppins_700Bold', color: COLORS.text, marginTop: 2 },
    quizCardDesc: { fontSize: 13, color: COLORS.sub, fontFamily: 'Poppins_400Regular', marginBottom: 14, lineHeight: 20 },
    quizMetaRow: { flexDirection: 'row', gap: 16, marginBottom: 18, flexWrap: 'wrap' },
    quizMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    quizMetaText: { fontSize: 12, color: COLORS.sub, fontFamily: 'Poppins_500Medium' },
    diffBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    diffBadgeText: { fontSize: 10, fontFamily: 'Poppins_700Bold', letterSpacing: 1 },
    startQuizBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 15,
        gap: 8,
    },
    startQuizBtnText: { color: '#FFF', fontSize: 15, fontFamily: 'Poppins_600SemiBold' },

    // Tips
    tipsCard: {
        backgroundColor: COLORS.primaryLight, borderRadius: 14, padding: 16,
        marginBottom: 20, borderWidth: 1, borderColor: '#C7D2FE',
    },
    tipsTitle: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: COLORS.primary, marginBottom: 8 },
    tipItem: { fontSize: 12, color: '#4338CA', fontFamily: 'Poppins_400Regular', marginBottom: 4 },

    // Quiz Screen
    quizScrollView: { flex: 1, backgroundColor: COLORS.bg },
    quizTopBar: { padding: 16, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border, flexDirection: 'row', alignItems: 'center', gap: 12 },
    progressBarWrap: { flex: 1, height: 6, backgroundColor: COLORS.border, borderRadius: 3, overflow: 'hidden' },
    progressFill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 3 },
    timerBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F1F5F9', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
    timerText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: COLORS.sub },
    qCounter: { fontSize: 12, color: COLORS.sub, fontFamily: 'Poppins_500Medium', marginTop: 20, marginHorizontal: 20 },
    qText: { fontSize: 17, fontFamily: 'Poppins_600SemiBold', color: COLORS.text, marginHorizontal: 20, marginTop: 8, marginBottom: 24, lineHeight: 26 },
    optionsWrap: { paddingHorizontal: 20, gap: 10 },
    optBtn: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card,
        borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: COLORS.border, gap: 12,
    },
    optBtnSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
    optCircle: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: COLORS.border, justifyContent: 'center', alignItems: 'center' },
    optCircleSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
    optLetter: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: COLORS.sub },
    optText: { flex: 1, fontSize: 14, fontFamily: 'Poppins_400Regular', color: COLORS.text },
    nextBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 14,
        marginHorizontal: 20, marginTop: 28, gap: 8,
    },
    nextBtnText: { color: '#FFF', fontSize: 16, fontFamily: 'Poppins_600SemiBold' },

    // Start Screen
    startScreen: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
    startTitle: { fontSize: 22, fontFamily: 'Poppins_700Bold', color: COLORS.text, marginTop: 16, textAlign: 'center' },
    startSub: { fontSize: 14, color: COLORS.sub, fontFamily: 'Poppins_400Regular', marginTop: 8, textAlign: 'center' },
    startDesc: { fontSize: 13, color: COLORS.sub, fontFamily: 'Poppins_400Regular', marginTop: 12, textAlign: 'center', lineHeight: 20, paddingHorizontal: 10 },
    startBtn: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.primary,
        paddingHorizontal: 28, paddingVertical: 14, borderRadius: 16, marginTop: 28, gap: 10,
    },
    startBtnText: { color: '#FFF', fontSize: 16, fontFamily: 'Poppins_600SemiBold' },

    // Result
    resultScroll: { flex: 1, backgroundColor: COLORS.bg },
    resultContent: { paddingBottom: 40 },
    resultHeader: { padding: 32, alignItems: 'center' },
    resultTitle: { fontSize: 22, fontFamily: 'Poppins_700Bold', color: '#FFF', marginTop: 10 },
    resultPct: { fontSize: 48, fontFamily: 'Poppins_700Bold', color: '#FFF', marginTop: 4 },
    resultSub: { fontSize: 14, color: 'rgba(255,255,255,0.85)', fontFamily: 'Poppins_500Medium' },
    reviewHeading: { fontSize: 16, fontFamily: 'Poppins_600SemiBold', color: COLORS.text, margin: 20, marginBottom: 10 },
    reviewCard: { backgroundColor: COLORS.card, marginHorizontal: 16, marginBottom: 14, borderRadius: 12, padding: 14, borderLeftWidth: 4 },
    reviewQ: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: COLORS.text, marginBottom: 10 },
    reviewOpt: { borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, marginBottom: 4 },
    reviewOptText: { fontSize: 13, fontFamily: 'Poppins_400Regular', color: COLORS.text },
    doneBtn: { backgroundColor: COLORS.primary, margin: 20, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
    doneBtnText: { color: '#FFF', fontSize: 16, fontFamily: 'Poppins_600SemiBold' },

    // Already submitted
    resultBanner: { padding: 28, alignItems: 'center', borderRadius: 20, margin: 16 },
    resultBannerTitle: { fontSize: 18, fontFamily: 'Poppins_700Bold', color: '#FFF', marginTop: 8 },
    resultBannerPct: { fontSize: 44, fontFamily: 'Poppins_700Bold', color: '#FFF', marginTop: 4 },
    resultBannerSub: { fontSize: 14, color: 'rgba(255,255,255,0.85)', fontFamily: 'Poppins_500Medium' },

    // Quiz info card
    quizInfoCard: {
        backgroundColor: COLORS.card, borderRadius: 16, padding: 18,
        marginHorizontal: 4, borderWidth: 1, borderColor: COLORS.border,
    },
    quizInfoTitle: { fontSize: 16, fontFamily: 'Poppins_600SemiBold', color: COLORS.text, marginBottom: 10 },
    quizInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
    quizInfoMeta: { fontSize: 13, color: COLORS.sub, fontFamily: 'Poppins_400Regular' },
    alreadyNote: { fontSize: 13, color: COLORS.green, fontFamily: 'Poppins_500Medium', marginTop: 4 },
});
