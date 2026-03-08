/**
 * AdminDailyQuizManager.js
 * Admin panel for creating and managing daily quizzes.
 * Supports: Manual, AI Topic, and Revision (AI based on watched content) modes.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    TextInput, ActivityIndicator, Switch, Alert, Modal,
    FlatList, Platform,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import API_URL from '../config';

const C = {
    bg: '#F8FAFC',
    card: '#FFFFFF',
    primary: '#6366F1',
    primaryLight: '#EEF2FF',
    green: '#10B981',
    greenLight: '#D1FAE5',
    amber: '#D71A21',
    amberLight: '#FEF3C7',
    red: '#EF4444',
    redLight: '#FEE2E2',
    text: '#1E293B',
    sub: '#64748B',
    border: '#E2E8F0',
};

const MODE_OPTIONS = [
    { id: 'manual', label: 'Manual', icon: 'pencil', desc: 'Write questions yourself' },
    { id: 'ai_topic', label: 'AI Topic', icon: 'brain', desc: 'AI generates from a topic' },
    { id: 'revision', label: 'Revision', icon: 'refresh', desc: 'AI generates from course content' },
];

const DIFFICULTY_OPTIONS = ['easy', 'medium', 'hard'];
const DIFF_COLORS = { easy: C.green, medium: C.amber, hard: C.red };

// ─────────────────────────────────────────────────────────────────
// MANUAL QUESTION EDITOR
// ─────────────────────────────────────────────────────────────────
function QuestionEditor({ questions, onChange }) {
    const addQuestion = () => onChange([...questions, { question: '', options: ['', '', '', ''], correctIndex: 0 }]);

    const updateQ = (i, field, val) => {
        const updated = questions.map((q, idx) => idx === i ? { ...q, [field]: val } : q);
        onChange(updated);
    };

    const updateOpt = (qi, oi, val) => {
        const updated = questions.map((q, idx) => {
            if (idx !== qi) return q;
            const newOpts = q.options.map((o, j) => j === oi ? val : o);
            return { ...q, options: newOpts };
        });
        onChange(updated);
    };

    const removeQ = (i) => onChange(questions.filter((_, idx) => idx !== i));

    return (
        <View>
            {questions.map((q, i) => (
                <View key={i} style={qStyles.card}>
                    <View style={qStyles.cardHeader}>
                        <Text style={qStyles.qNum}>Q{i + 1}</Text>
                        <TouchableOpacity onPress={() => removeQ(i)}>
                            <Feather name="trash-2" size={16} color={C.red} />
                        </TouchableOpacity>
                    </View>
                    <TextInput
                        style={qStyles.input}
                        placeholder="Question text..."
                        placeholderTextColor={C.sub}
                        value={q.question}
                        onChangeText={v => updateQ(i, 'question', v)}
                        multiline
                    />
                    <Text style={qStyles.optLabel}>Options (tap to mark correct):</Text>
                    {(q.options || ['', '', '', '']).map((opt, j) => (
                        <View key={j} style={qStyles.optRow}>
                            <TouchableOpacity
                                style={[qStyles.radioBtn, q.correctIndex === j && qStyles.radioBtnActive]}
                                onPress={() => updateQ(i, 'correctIndex', j)}
                            >
                                {q.correctIndex === j && <Feather name="check" size={12} color="#FFF" />}
                            </TouchableOpacity>
                            <TextInput
                                style={[qStyles.optInput, q.correctIndex === j && { borderColor: C.green, backgroundColor: C.greenLight }]}
                                placeholder={`Option ${String.fromCharCode(65 + j)}`}
                                placeholderTextColor={C.sub}
                                value={opt}
                                onChangeText={v => updateOpt(i, j, v)}
                            />
                        </View>
                    ))}
                </View>
            ))}
            <TouchableOpacity style={qStyles.addBtn} onPress={addQuestion}>
                <Feather name="plus-circle" size={18} color={C.primary} />
                <Text style={qStyles.addBtnText}>Add Question</Text>
            </TouchableOpacity>
        </View>
    );
}

const qStyles = StyleSheet.create({
    card: { backgroundColor: C.card, borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: C.border },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    qNum: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: C.primary },
    input: { borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 10, fontSize: 14, fontFamily: 'Poppins_400Regular', color: C.text, marginBottom: 12, minHeight: 60 },
    optLabel: { fontSize: 12, color: C.sub, fontFamily: 'Poppins_500Medium', marginBottom: 8 },
    optRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    radioBtn: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
    radioBtnActive: { backgroundColor: C.green, borderColor: C.green },
    optInput: { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 8, fontSize: 13, fontFamily: 'Poppins_400Regular', color: C.text },
    addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderWidth: 1.5, borderColor: C.primary, borderRadius: 12, borderStyle: 'dashed' },
    addBtnText: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: C.primary },
});

// ─────────────────────────────────────────────────────────────────
// QUIZ LIST ITEM
// ─────────────────────────────────────────────────────────────────
function QuizListItem({ quiz, onToggle, onDelete }) {
    const modeColor = quiz.mode === 'manual' ? C.primary : quiz.mode === 'ai_topic' ? C.amber : C.green;
    return (
        <View style={listStyles.card}>
            <View style={listStyles.row}>
                <View style={[listStyles.modeTag, { backgroundColor: modeColor + '20' }]}>
                    <Text style={[listStyles.modeText, { color: modeColor }]}>{quiz.mode.toUpperCase()}</Text>
                </View>
                <Text style={listStyles.title} numberOfLines={1}>{quiz.title}</Text>
            </View>
            <Text style={listStyles.meta}>
                {(quiz.questions || []).length} questions • {quiz.difficulty} • {quiz.quiz_date || 'Any day'}
            </Text>
            <View style={listStyles.actions}>
                <Switch
                    value={quiz.is_active}
                    onValueChange={() => onToggle(quiz.id)}
                    thumbColor={quiz.is_active ? C.green : '#D1D5DB'}
                    trackColor={{ false: '#E5E7EB', true: C.greenLight }}
                />
                <Text style={{ fontSize: 12, color: quiz.is_active ? C.green : C.sub, fontFamily: 'Poppins_500Medium' }}>
                    {quiz.is_active ? 'Active' : 'Inactive'}
                </Text>
                <TouchableOpacity onPress={() => onDelete(quiz.id)} style={{ marginLeft: 'auto' }}>
                    <Feather name="trash-2" size={18} color={C.red} />
                </TouchableOpacity>
            </View>
        </View>
    );
}

const listStyles = StyleSheet.create({
    card: { backgroundColor: C.card, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
    modeTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    modeText: { fontSize: 10, fontFamily: 'Poppins_700Bold', letterSpacing: 1 },
    title: { flex: 1, fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: C.text },
    meta: { fontSize: 12, color: C.sub, fontFamily: 'Poppins_400Regular', marginBottom: 12 },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});

// ─────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────
export default function AdminDailyQuizManager({ userEmail }) {
    const [view, setView] = useState('list'); // 'list' | 'create'
    const [quizzes, setQuizzes] = useState([]);
    const [loadingList, setLoadingList] = useState(true);
    const [creating, setCreating] = useState(false);
    const [generatingAI, setGeneratingAI] = useState(false);
    const [previewQuestions, setPreviewQuestions] = useState([]);

    // Form state
    const [mode, setMode] = useState('manual');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [topic, setTopic] = useState('');
    const [difficulty, setDifficulty] = useState('medium');
    const [timeLimit, setTimeLimit] = useState('10');
    const [numQuestions, setNumQuestions] = useState('5');
    const [quizDate, setQuizDate] = useState(new Date().toISOString().split('T')[0]);
    const [manualQuestions, setManualQuestions] = useState([]);
    const [sendNotif, setSendNotif] = useState(true);

    useEffect(() => { fetchQuizzes(); }, []);

    const fetchQuizzes = async () => {
        setLoadingList(true);
        try {
            const r = await fetch(`${API_URL}/api/v1/daily-quiz/admin/list`, {
                headers: { Authorization: `Bearer ${await getToken()}` }
            });
            const d = await r.json();
            setQuizzes(d.quizzes || []);
        } catch (e) { console.error(e); }
        finally { setLoadingList(false); }
    };

    const getToken = async () => {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        return await AsyncStorage.getItem('userToken') || '';
    };

    const handleGeneratePreview = async () => {
        setGeneratingAI(true);
        setPreviewQuestions([]);
        try {
            const r = await fetch(`${API_URL}/api/v1/daily-quiz/admin/generate-ai-preview`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getToken()}` },
                body: JSON.stringify({ topic, difficulty, num_questions: parseInt(numQuestions, 10), mode }),
            });
            const d = await r.json();
            if (d.questions) setPreviewQuestions(d.questions);
        } catch (e) { Alert.alert('Error', 'AI generation failed: ' + e.message); }
        finally { setGeneratingAI(false); }
    };

    const handleCreate = async () => {
        if (!title.trim()) { Alert.alert('Validation', 'Please enter a quiz title'); return; }
        if (mode === 'manual' && manualQuestions.length === 0) {
            Alert.alert('Validation', 'Add at least one question'); return;
        }
        if ((mode === 'ai_topic') && !topic.trim()) {
            Alert.alert('Validation', 'Please enter a topic for AI generation'); return;
        }

        setCreating(true);
        try {
            const body = {
                title: title.trim(),
                description: description.trim(),
                mode,
                topic: topic.trim(),
                difficulty,
                time_limit_minutes: parseInt(timeLimit, 10) || 10,
                num_questions: parseInt(numQuestions, 10) || 5,
                questions: mode === 'manual' ? manualQuestions : [],
                quiz_date: quizDate,
                send_notification: sendNotif,
                assigned_users: [],
                assigned_roles: [],
                assigned_stores: [],
            };

            const r = await fetch(`${API_URL}/api/v1/daily-quiz/admin/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getToken()}` },
                body: JSON.stringify(body),
            });
            const d = await r.json();
            if (d.status === 'success') {
                Alert.alert('✅ Success', `Daily quiz created with ${d.questions_count} questions!`);
                resetForm();
                setView('list');
                fetchQuizzes();
            } else {
                Alert.alert('Error', d.detail || 'Failed to create quiz');
            }
        } catch (e) { Alert.alert('Error', e.message); }
        finally { setCreating(false); }
    };

    const handleToggle = async (quizId) => {
        try {
            await fetch(`${API_URL}/api/v1/daily-quiz/admin/${quizId}/toggle`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${await getToken()}` },
            });
            fetchQuizzes();
        } catch (e) { console.error(e); }
    };

    const handleDelete = (quizId) => {
        Alert.alert('Delete Quiz', 'Are you sure you want to delete this quiz?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete', style: 'destructive',
                onPress: async () => {
                    await fetch(`${API_URL}/api/v1/daily-quiz/admin/${quizId}`, {
                        method: 'DELETE',
                        headers: { Authorization: `Bearer ${await getToken()}` },
                    });
                    fetchQuizzes();
                }
            }
        ]);
    };

    const resetForm = () => {
        setTitle(''); setDescription(''); setTopic(''); setDifficulty('medium');
        setTimeLimit('10'); setNumQuestions('5'); setManualQuestions([]);
        setPreviewQuestions([]); setMode('manual');
    };

    // ── LIST VIEW ──
    if (view === 'list') {
        return (
            <View style={{ flex: 1, backgroundColor: C.bg }}>
                <View style={s.listHeader}>
                    <Text style={s.listTitle}>Daily Quizzes</Text>
                    <TouchableOpacity style={s.createBtn} onPress={() => setView('create')}>
                        <Feather name="plus" size={16} color="#FFF" />
                        <Text style={s.createBtnText}>Create</Text>
                    </TouchableOpacity>
                </View>

                {loadingList ? (
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                        <ActivityIndicator size="large" color={C.primary} />
                    </View>
                ) : quizzes.length === 0 ? (
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 }}>
                        <MaterialCommunityIcons name="brain" size={60} color={C.border} />
                        <Text style={s.emptyTitle}>No Daily Quizzes Yet</Text>
                        <Text style={s.emptySub}>Create your first daily quiz for employees</Text>
                        <TouchableOpacity style={s.emptyCreateBtn} onPress={() => setView('create')}>
                            <Text style={{ color: C.primary, fontFamily: 'Poppins_600SemiBold' }}>Create Quiz</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <FlatList
                        data={quizzes}
                        keyExtractor={q => q.id}
                        renderItem={({ item }) => (
                            <QuizListItem quiz={item} onToggle={handleToggle} onDelete={handleDelete} />
                        )}
                        contentContainerStyle={{ padding: 16 }}
                    />
                )}
            </View>
        );
    }

    // ── CREATE VIEW ──
    const isAI = mode === 'ai_topic' || mode === 'revision';

    return (
        <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
            {/* Header */}
            <View style={s.formHeader}>
                <TouchableOpacity onPress={() => { resetForm(); setView('list'); }}>
                    <Feather name="arrow-left" size={22} color={C.text} />
                </TouchableOpacity>
                <Text style={s.formTitle}>Create Daily Quiz</Text>
            </View>

            {/* Mode Selector */}
            <Text style={s.sectionLabel}>Quiz Mode</Text>
            <View style={s.modeRow}>
                {MODE_OPTIONS.map(m => (
                    <TouchableOpacity
                        key={m.id}
                        style={[s.modeCard, mode === m.id && s.modeCardActive]}
                        onPress={() => setMode(m.id)}
                    >
                        <MaterialCommunityIcons name={m.icon} size={22} color={mode === m.id ? C.primary : C.sub} />
                        <Text style={[s.modeLabel, mode === m.id && { color: C.primary }]}>{m.label}</Text>
                        <Text style={s.modeDesc}>{m.desc}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Title */}
            <Text style={s.sectionLabel}>Quiz Title *</Text>
            <TextInput style={s.input} placeholder="e.g. Coffee Mastery Daily Quiz" placeholderTextColor={C.sub}
                value={title} onChangeText={setTitle} />

            {/* Description */}
            <Text style={s.sectionLabel}>Description (optional)</Text>
            <TextInput style={[s.input, { height: 70 }]} placeholder="Brief description for employees..."
                placeholderTextColor={C.sub} value={description} onChangeText={setDescription} multiline />

            {/* Topic (AI modes) */}
            {mode === 'ai_topic' && (
                <>
                    <Text style={s.sectionLabel}>Topic *</Text>
                    <TextInput style={s.input} placeholder="e.g. Espresso Extraction Techniques"
                        placeholderTextColor={C.sub} value={topic} onChangeText={setTopic} />
                </>
            )}

            {/* Difficulty */}
            <Text style={s.sectionLabel}>Difficulty</Text>
            <View style={s.diffRow}>
                {DIFFICULTY_OPTIONS.map(d => (
                    <TouchableOpacity
                        key={d}
                        style={[s.diffBtn, difficulty === d && { backgroundColor: DIFF_COLORS[d], borderColor: DIFF_COLORS[d] }]}
                        onPress={() => setDifficulty(d)}
                    >
                        <Text style={[s.diffText, difficulty === d && { color: '#FFF' }]}>
                            {d.charAt(0).toUpperCase() + d.slice(1)}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Time + Num Questions (2-column) */}
            <View style={s.twoCol}>
                <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={s.sectionLabel}>Time (minutes)</Text>
                    <TextInput style={s.input} keyboardType="numeric" value={timeLimit}
                        onChangeText={setTimeLimit} placeholder="10" placeholderTextColor={C.sub} />
                </View>
                {isAI && (
                    <View style={{ flex: 1 }}>
                        <Text style={s.sectionLabel}>No. of Questions</Text>
                        <TextInput style={s.input} keyboardType="numeric" value={numQuestions}
                            onChangeText={setNumQuestions} placeholder="5" placeholderTextColor={C.sub} />
                    </View>
                )}
            </View>

            {/* Date */}
            <Text style={s.sectionLabel}>Quiz Date (YYYY-MM-DD)</Text>
            <TextInput style={s.input} value={quizDate} onChangeText={setQuizDate}
                placeholder="2025-02-28" placeholderTextColor={C.sub} />

            {/* Send Notification toggle */}
            <View style={s.toggleRow}>
                <View>
                    <Text style={s.toggleLabel}>Send Notification</Text>
                    <Text style={s.toggleSub}>Alert employees when quiz is created</Text>
                </View>
                <Switch value={sendNotif} onValueChange={setSendNotif}
                    thumbColor={sendNotif ? C.primary : '#D1D5DB'}
                    trackColor={{ false: '#E5E7EB', true: '#C7D2FE' }} />
            </View>

            {/* ─── AI Preview Section ─── */}
            {isAI && (
                <View style={s.aiSection}>
                    <View style={s.aiHeader}>
                        <MaterialCommunityIcons name="brain" size={20} color={C.primary} />
                        <Text style={s.aiTitle}>AI Question Preview</Text>
                    </View>
                    <Text style={s.aiSub}>
                        {mode === 'revision'
                            ? 'AI will generate questions based on all your course content.'
                            : `AI will generate ${numQuestions} questions about "${topic || 'your topic'}".`}
                    </Text>
                    <TouchableOpacity style={s.previewBtn} onPress={handleGeneratePreview} disabled={generatingAI}>
                        {generatingAI
                            ? <ActivityIndicator color="#FFF" />
                            : <><Feather name="zap" size={16} color="#FFF" /><Text style={s.previewBtnText}>Generate Preview</Text></>}
                    </TouchableOpacity>

                    {previewQuestions.length > 0 && (
                        <View style={{ marginTop: 14 }}>
                            <Text style={s.previewHeading}>Preview ({previewQuestions.length} questions)</Text>
                            {previewQuestions.map((q, i) => (
                                <View key={i} style={s.previewCard}>
                                    <Text style={s.previewQText}>{i + 1}. {q.question}</Text>
                                    {(q.options || []).map((o, j) => (
                                        <Text key={j} style={[s.previewOpt, j === q.correctIndex && { color: C.green, fontFamily: 'Poppins_600SemiBold' }]}>
                                            {j === q.correctIndex ? '✅' : '○'} {o}
                                        </Text>
                                    ))}
                                </View>
                            ))}
                        </View>
                    )}
                </View>
            )}

            {/* ─── Manual Questions ─── */}
            {mode === 'manual' && (
                <>
                    <Text style={s.sectionLabel}>Questions *</Text>
                    <QuestionEditor questions={manualQuestions} onChange={setManualQuestions} />
                </>
            )}

            {/* Create Button */}
            <TouchableOpacity style={[s.submitBtn, creating && { opacity: 0.7 }]} onPress={handleCreate} disabled={creating}>
                {creating
                    ? <ActivityIndicator color="#FFF" />
                    : <><Feather name="check-circle" size={18} color="#FFF" />
                        <Text style={s.submitBtnText}>
                            {isAI ? 'Generate & Publish Quiz' : 'Publish Daily Quiz'}
                        </Text></>}
            </TouchableOpacity>
        </ScrollView>
    );
}

const s = StyleSheet.create({
    // List
    listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border },
    listTitle: { fontSize: 18, fontFamily: 'Poppins_700Bold', color: C.text },
    createBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, gap: 6 },
    createBtnText: { color: '#FFF', fontFamily: 'Poppins_600SemiBold', fontSize: 13 },
    emptyTitle: { fontSize: 18, fontFamily: 'Poppins_600SemiBold', color: C.text, marginTop: 14 },
    emptySub: { fontSize: 13, color: C.sub, fontFamily: 'Poppins_400Regular', textAlign: 'center', marginTop: 6 },
    emptyCreateBtn: { marginTop: 16, borderWidth: 1.5, borderColor: C.primary, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10 },

    // Form
    formHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
    formTitle: { fontSize: 20, fontFamily: 'Poppins_700Bold', color: C.text },
    sectionLabel: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: C.text, marginBottom: 8, marginTop: 16 },
    input: { borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12, fontSize: 14, fontFamily: 'Poppins_400Regular', color: C.text, backgroundColor: C.card },
    modeRow: { flexDirection: 'row', gap: 10 },
    modeCard: { flex: 1, borderRadius: 14, padding: 12, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.card, alignItems: 'center', gap: 4 },
    modeCardActive: { borderColor: C.primary, backgroundColor: C.primaryLight },
    modeLabel: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: C.sub },
    modeDesc: { fontSize: 10, fontFamily: 'Poppins_400Regular', color: C.sub, textAlign: 'center' },
    diffRow: { flexDirection: 'row', gap: 10 },
    diffBtn: { flex: 1, borderRadius: 10, borderWidth: 1.5, borderColor: C.border, paddingVertical: 10, alignItems: 'center' },
    diffText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: C.sub },
    twoCol: { flexDirection: 'row', marginTop: 4 },
    toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.card, borderRadius: 14, padding: 16, marginTop: 16, borderWidth: 1, borderColor: C.border },
    toggleLabel: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: C.text },
    toggleSub: { fontSize: 12, color: C.sub, fontFamily: 'Poppins_400Regular', marginTop: 2 },

    // AI Section
    aiSection: { backgroundColor: C.primaryLight, borderRadius: 14, padding: 16, marginTop: 16, borderWidth: 1, borderColor: '#C7D2FE' },
    aiHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
    aiTitle: { fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: C.primary },
    aiSub: { fontSize: 12, color: '#4338CA', fontFamily: 'Poppins_400Regular', marginBottom: 12 },
    previewBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary, borderRadius: 10, paddingVertical: 11, gap: 8 },
    previewBtnText: { color: '#FFF', fontFamily: 'Poppins_600SemiBold', fontSize: 14 },
    previewHeading: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: C.text, marginBottom: 8 },
    previewCard: { backgroundColor: C.card, borderRadius: 10, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: C.border },
    previewQText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: C.text, marginBottom: 8 },
    previewOpt: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: C.sub, marginBottom: 3 },

    // Submit
    submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary, borderRadius: 16, paddingVertical: 16, marginTop: 28, gap: 10 },
    submitBtnText: { color: '#FFF', fontSize: 16, fontFamily: 'Poppins_700Bold' },
});
