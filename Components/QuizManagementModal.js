import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    Dimensions,
    FlatList,
    TextInput,
    Alert,
    ActivityIndicator,
    ScrollView,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as DocumentPicker from 'expo-document-picker';
import API_URL from '../config';

const { width, height } = Dimensions.get('window');
const baseFont = Platform.OS === 'web' ? 'system-ui, -apple-system, sans-serif' : undefined;

// ============================================
// Cross-platform alert helpers (web-safe)
// ============================================
const showAlert = (title, message) => {
    if (Platform.OS === 'web') {
        window.alert(`${title}\n\n${message}`);
    } else {
        Alert.alert(title, message);
    }
};

const showConfirm = (title, message) => {
    return new Promise((resolve) => {
        if (Platform.OS === 'web') {
            resolve(window.confirm(`${title}\n\n${message}`));
        } else {
            Alert.alert(title, message, [
                { text: 'Cancel', onPress: () => resolve(false), style: 'cancel' },
                { text: 'Confirm', onPress: () => resolve(true) },
            ]);
        }
    });
};

export default function QuizManagementModal({ visible, onClose, contentItem, onSaveSuccess }) {
    const [questions, setQuestions] = useState([]);
    const [loading, setLoading] = useState(false);

    // UI Modes: 'list', 'edit', 'ai_generate', 'bulk_upload', 'review_staged'
    const [mode, setMode] = useState('list');

    // Editor State
    const [editingIndex, setEditingIndex] = useState(null);
    const [editQuestion, setEditQuestion] = useState('');
    const [editOptions, setEditOptions] = useState(['', '', '', '']);
    const [editCorrectAnswer, setEditCorrectAnswer] = useState(0);

    // AI Generation State
    const [aiDescription, setAiDescription] = useState('');
    const [aiCount, setAiCount] = useState('5');
    const [aiDifficulty, setAiDifficulty] = useState('medium');
    const [isGenerating, setIsGenerating] = useState(false);
    const [aiFile, setAiFile] = useState(null);

    // Bulk Upload State
    const [bulkText, setBulkText] = useState('');
    const [isParsingBulk, setIsParsingBulk] = useState(false);

    // Staging State - for reviewing generated/imported questions before committing
    const [stagedQuestions, setStagedQuestions] = useState([]);
    const [stagedSource, setStagedSource] = useState(''); // 'ai' or 'bulk'

    // Success Toast
    const [toastMessage, setToastMessage] = useState('');
    const [toastVisible, setToastVisible] = useState(false);

    const showToast = (msg) => {
        setToastMessage(msg);
        setToastVisible(true);
        setTimeout(() => setToastVisible(false), 3000);
    };

    // ========================
    // File Pickers
    // ========================
    const pickAiFile = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: [
                    'application/pdf',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'text/plain',
                    'image/*',
                    'application/vnd.ms-powerpoint',
                    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
                ],
                copyToCacheDirectory: true,
            });
            if (result.canceled) return;
            const doc = result.assets[0];
            setAiFile(doc);
        } catch (error) {
            showAlert("Error", "Could not pick file");
        }
    };

    const pickBulkFile = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'],
                copyToCacheDirectory: true,
            });
            if (result.canceled) return;
            const doc = result.assets[0];

            setIsParsingBulk(true);
            const formData = new FormData();

            if (Platform.OS === 'web') {
                formData.append('file', doc.file);
            } else {
                formData.append('file', {
                    uri: doc.uri,
                    name: doc.name,
                    type: doc.mimeType || 'application/octet-stream'
                });
            }

            const res = await fetch(`${API_URL}/api/v1/ai/parse-bulk-quiz`, {
                method: 'POST',
                body: formData
            });

            const data = await res.json();
            if (data.status === 'success' && Array.isArray(data.questions) && data.questions.length > 0) {
                setStagedQuestions(data.questions);
                setStagedSource('bulk');
                setMode('review_staged');
                showToast(`✅ Parsed ${data.questions.length} questions from ${doc.name}`);
            } else {
                showAlert("Parsing Failed", data.error || "No valid questions found. Ensure file matches standard columns.");
            }
        } catch (error) {
            console.error("Bulk File Error:", error);
            showAlert("Error", "Could not parse or upload the bulk file.");
        } finally {
            setIsParsingBulk(false);
        }
    };

    const downloadBulkFormat = () => {
        const csvContent = "Question,Option 1,Option 2,Option 3,Option 4,Answer Row (1-4)\nWhat is the core temperature?,150,200,250,300,2\nWho is the founder?,Alan,Jobs,Steve,Elon,3";
        if (Platform.OS === 'web') {
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", "BWC_Quiz_Template.csv");
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } else {
            showAlert("Format Overview", "On mobile, please upload a standard CSV or Excel document using the exact columns:\n\nQuestion | Opt1 | Opt2 | Opt3 | Opt4 | Answer(1-4)");
        }
    };

    // ========================
    // Bulk Text Parse (Pipe-delimited)
    // ========================
    const handleBulkParse = () => {
        if (!bulkText.trim()) {
            showAlert("Empty", "Please paste quiz data in the text area first.");
            return;
        }
        const lines = bulkText.split('\n');
        const newQuestions = [];

        for (const line of lines) {
            if (!line.trim()) continue;
            const parts = line.split('|').map(p => p.trim());
            if (parts.length >= 6) {
                const q = parts[0];
                const options = parts.slice(1, 5);
                const answerIdx = parseInt(parts[5], 10) - 1;
                if (!isNaN(answerIdx) && answerIdx >= 0 && answerIdx < options.length) {
                    newQuestions.push({ question: q, options, answer: options[answerIdx] });
                }
            }
        }

        if (newQuestions.length > 0) {
            setStagedQuestions(newQuestions);
            setStagedSource('bulk');
            setMode('review_staged');
            setBulkText('');
            showToast(`✅ Parsed ${newQuestions.length} questions successfully`);
        } else {
            showAlert("Parsing Failed", "Ensure exact pipe-delimited format:\nQuestion | Opt1 | Opt2 | Opt3 | Opt4 | CorrectRow (1-4)");
        }
    };

    // ========================
    // Load existing quiz
    // ========================
    useEffect(() => {
        if (visible && contentItem) {
            try {
                const existing = typeof contentItem.quiz === 'string' ? JSON.parse(contentItem.quiz) : contentItem.quiz;
                setQuestions(Array.isArray(existing) ? existing : []);
            } catch {
                setQuestions([]);
            }
            setMode('list');
            setStagedQuestions([]);
            setAiFile(null);
        }
    }, [visible, contentItem]);

    // ========================
    // Save quiz to backend
    // ========================
    const handleSaveQuiz = async () => {
        if (!contentItem) return;
        setLoading(true);

        try {
            const formData = new FormData();
            formData.append('quiz', JSON.stringify(questions));

            const response = await fetch(`${API_URL}/api/v1/content/${contentItem.id}`, {
                method: 'PUT',
                body: formData,
            });

            const result = await response.json();
            if (result.status === 'success') {
                showToast('✅ Quiz saved successfully!');
                if (onSaveSuccess) onSaveSuccess();
                setTimeout(() => onClose(), 1200);
            } else {
                throw new Error("Failed to save changes.");
            }
        } catch (error) {
            console.error(error);
            showAlert("Error", "Could not save quiz.");
        } finally {
            setLoading(false);
        }
    };

    // ========================
    // Manual question editor
    // ========================
    const openEditor = (index = null) => {
        if (index !== null) {
            const q = questions[index];
            setEditQuestion(q.question || '');
            setEditOptions(q.options || ['', '', '', '']);
            setEditCorrectAnswer(q.options?.indexOf(q.answer) !== -1 ? q.options.indexOf(q.answer) : 0);
            setEditingIndex(index);
        } else {
            setEditQuestion('');
            setEditOptions(['', '', '', '']);
            setEditCorrectAnswer(0);
            setEditingIndex(null);
        }
        setMode('edit');
    };

    const saveEditedQuestion = () => {
        if (!editQuestion.trim()) {
            showAlert("Error", "Question text cannot be empty.");
            return;
        }
        if (editOptions.some(opt => !opt.trim())) {
            showAlert("Error", "All option fields must be filled out.");
            return;
        }

        const newQuestion = {
            question: editQuestion.trim(),
            options: editOptions.map(o => o.trim()),
            answer: editOptions[editCorrectAnswer].trim()
        };

        const updated = [...questions];
        if (editingIndex !== null) {
            updated[editingIndex] = newQuestion;
        } else {
            updated.push(newQuestion);
        }

        setQuestions(updated);
        setMode('list');
        showToast(editingIndex !== null ? '✏️ Question updated' : '➕ Question added');
    };

    const deleteQuestion = async (index) => {
        const confirmed = await showConfirm("Delete", "Remove this question?");
        if (confirmed) {
            const filtered = questions.filter((_, i) => i !== index);
            setQuestions(filtered);
            showToast('🗑️ Question removed');
        }
    };

    // ========================
    // Reorder
    // ========================
    const moveQuestionUp = (index) => {
        if (index === 0) return;
        const newArr = [...questions];
        [newArr[index - 1], newArr[index]] = [newArr[index], newArr[index - 1]];
        setQuestions(newArr);
    };

    const moveQuestionDown = (index) => {
        if (index === questions.length - 1) return;
        const newArr = [...questions];
        [newArr[index + 1], newArr[index]] = [newArr[index], newArr[index + 1]];
        setQuestions(newArr);
    };

    // ========================
    // AI Generation
    // ========================
    const handleAIGenerate = async () => {
        if (!aiDescription.trim() && !aiFile) {
            showAlert("Context Required", "Please provide a description or upload a document for the AI to read.");
            return;
        }

        setIsGenerating(true);
        try {
            const formData = new FormData();
            formData.append('text', aiDescription);
            formData.append('num_questions', aiCount);
            formData.append('difficulty', aiDifficulty);

            if (aiFile) {
                if (Platform.OS === 'web') {
                    formData.append('file', aiFile.file);
                } else {
                    formData.append('file', {
                        uri: aiFile.uri,
                        name: aiFile.name,
                        type: aiFile.mimeType || 'application/octet-stream'
                    });
                }
            }

            const res = await fetch(`${API_URL}/api/v1/ai/generate-quiz`, {
                method: 'POST',
                body: formData
            });

            const data = await res.json();
            if (data.status === 'success' && Array.isArray(data.questions) && data.questions.length > 0) {
                // Go to staging/review mode — user reviews before committing
                setStagedQuestions(data.questions);
                setStagedSource('ai');
                setMode('review_staged');
                showToast(`🤖 AI generated ${data.questions.length} questions!`);
            } else {
                throw new Error(data.error || "Failed to parse questions");
            }
        } catch (error) {
            console.error(error);
            showAlert("AI Error", "Could not generate questions. Ensure backend AI tokens are active.");
        } finally {
            setIsGenerating(false);
        }
    };

    // ========================
    // Staging Actions — commit staged questions to main list
    // ========================
    const removeStagedQuestion = (index) => {
        const filtered = stagedQuestions.filter((_, i) => i !== index);
        setStagedQuestions(filtered);
    };

    const commitStagedReplace = () => {
        setQuestions([...stagedQuestions]);
        setStagedQuestions([]);
        setMode('list');
        showToast(`✅ Replaced with ${stagedQuestions.length} new questions`);
    };

    const commitStagedAppend = () => {
        setQuestions([...questions, ...stagedQuestions]);
        setStagedQuestions([]);
        setMode('list');
        showToast(`✅ Appended ${stagedQuestions.length} questions (Total: ${questions.length + stagedQuestions.length})`);
    };

    // ========================
    // Render helpers
    // ========================
    const renderOptionInput = (opt, idx) => (
        <View key={idx} style={styles.optionRow}>
            <TouchableOpacity
                style={[styles.radioBtn, editCorrectAnswer === idx && styles.radioBtnActive]}
                onPress={() => setEditCorrectAnswer(idx)}
            >
                {editCorrectAnswer === idx && <View style={styles.radioBtnInner} />}
            </TouchableOpacity>
            <TextInput
                style={[styles.answerInput, editCorrectAnswer === idx && { borderColor: '#10B981', backgroundColor: '#ECFDF5' }]}
                value={opt}
                onChangeText={(val) => {
                    const newOpts = [...editOptions];
                    newOpts[idx] = val;
                    setEditOptions(newOpts);
                }}
                placeholder={`Option ${idx + 1}`}
                placeholderTextColor="#9CA3AF"
            />
        </View>
    );

    const KeyboardWrapper = Platform.OS === 'ios' ? KeyboardAvoidingView : View;
    const keyboardProps = Platform.OS === 'ios' ? { behavior: 'padding', style: { flex: 1 } } : { style: { flex: 1 } };

    return (
        <Modal visible={visible} animationType="fade" transparent>
            <View style={styles.overlay}>
                <BlurView intensity={25} tint="dark" style={StyleSheet.absoluteFill} />
                <View style={styles.container}>
                    {/* Header */}
                    <LinearGradient
                        colors={['#4F46E5', '#6366F1', '#818CF8']}
                        style={styles.header}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    >
                        <View style={styles.headerTop}>
                            <View style={styles.headerTitleRow}>
                                <View style={styles.headerIcon}>
                                    <Feather name="layers" size={24} color="#FFF" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.headerTitle}>Quiz Configuration</Text>
                                    <Text style={styles.headerSubtitle} numberOfLines={1}>
                                        {contentItem?.title || 'Unknown Module'}
                                    </Text>
                                </View>
                            </View>
                            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                                <Feather name="x" size={20} color="#FFF" />
                            </TouchableOpacity>
                        </View>
                    </LinearGradient>

                    {/* Toast Notification */}
                    {toastVisible && (
                        <View style={styles.toast}>
                            <Text style={styles.toastText}>{toastMessage}</Text>
                        </View>
                    )}

                    {/* Content Body */}
                    <View style={styles.body}>

                        {/* ========== LIST MODE ========== */}
                        {mode === 'list' && (
                            <View style={{ flex: 1 }}>
                                <View style={styles.actionToolbar}>
                                    <TouchableOpacity onPress={() => openEditor(null)} style={styles.addBtn}>
                                        <Feather name="plus" size={16} color="#FFF" />
                                        <Text style={styles.addBtnText}>New Question</Text>
                                    </TouchableOpacity>
                                    <View style={{ flexDirection: 'row', gap: 10 }}>
                                        <TouchableOpacity onPress={() => setMode('bulk_upload')} style={styles.bulkBtn}>
                                            <MaterialCommunityIcons name="table-import" size={18} color="#4F46E5" />
                                            <Text style={styles.bulkBtnText}>Bulk CSV</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={() => setMode('ai_generate')} style={styles.aiBtn}>
                                            <MaterialCommunityIcons name="robot-outline" size={18} color="#FFF" />
                                            <Text style={styles.aiBtnText}>AI Generate</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                {questions.length === 0 ? (
                                    <View style={styles.emptyState}>
                                        <View style={styles.emptyIconCircle}>
                                            <MaterialCommunityIcons name="text-box-search-outline" size={48} color="#9CA3AF" />
                                        </View>
                                        <Text style={styles.emptyTitle}>Module lacks active questions</Text>
                                        <Text style={styles.emptyDesc}>
                                            Create a question manually, import a CSV structure, or let our AI engine generate an assessment natively!
                                        </Text>
                                    </View>
                                ) : (
                                    <FlatList
                                        data={questions}
                                        keyExtractor={(item, index) => index.toString()}
                                        contentContainerStyle={{ paddingBottom: 20 }}
                                        showsVerticalScrollIndicator={false}
                                        renderItem={({ item, index }) => (
                                            <View style={styles.qCard}>
                                                <View style={styles.qCardHeader}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                                        <View style={styles.qCardNumberBadge}>
                                                            <Text style={styles.qCardNumber}>Q{index + 1}</Text>
                                                        </View>
                                                        <View style={styles.reorderControls}>
                                                            <TouchableOpacity disabled={index === 0} onPress={() => moveQuestionUp(index)} style={[styles.reorderBtn, index === 0 && styles.reorderDisabled]}>
                                                                <Feather name="chevron-up" size={14} color={index === 0 ? "#D1D5DB" : "#4F46E5"} />
                                                            </TouchableOpacity>
                                                            <TouchableOpacity disabled={index === questions.length - 1} onPress={() => moveQuestionDown(index)} style={[styles.reorderBtn, index === questions.length - 1 && styles.reorderDisabled]}>
                                                                <Feather name="chevron-down" size={14} color={index === questions.length - 1 ? "#D1D5DB" : "#4F46E5"} />
                                                            </TouchableOpacity>
                                                        </View>
                                                    </View>
                                                    <View style={styles.qCardActions}>
                                                        <TouchableOpacity onPress={() => openEditor(index)} style={styles.iconBtn}>
                                                            <Feather name="edit-2" size={15} color="#4F46E5" />
                                                        </TouchableOpacity>
                                                        <TouchableOpacity onPress={() => deleteQuestion(index)} style={[styles.iconBtn, { backgroundColor: '#FEF2F2' }]}>
                                                            <Feather name="trash-2" size={15} color="#EF4444" />
                                                        </TouchableOpacity>
                                                    </View>
                                                </View>
                                                <Text style={styles.qText}>{item.question}</Text>
                                                <View style={styles.optionsList}>
                                                    {item.options?.map((opt, oIdx) => (
                                                        <View key={oIdx} style={styles.optBlock}>
                                                            <MaterialCommunityIcons
                                                                name={opt === item.answer ? "checkbox-marked-circle" : "radiobox-blank"}
                                                                size={18}
                                                                color={opt === item.answer ? "#10B981" : "#D1D5DB"}
                                                            />
                                                            <Text style={[styles.optText, opt === item.answer && styles.optTextCorrect]}>
                                                                {opt}
                                                            </Text>
                                                        </View>
                                                    ))}
                                                </View>
                                            </View>
                                        )}
                                    />
                                )}

                                <View style={styles.stickyFooterContainer}>
                                    <View style={styles.footerRow}>
                                        <Text style={styles.footerSummary}>
                                            Total: {questions.length} Question{questions.length !== 1 && 's'}
                                        </Text>
                                        <TouchableOpacity
                                            style={styles.saveBtn}
                                            onPress={handleSaveQuiz}
                                            disabled={loading}
                                        >
                                            {loading ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.saveBtnText}>Save Configuration</Text>}
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>
                        )}

                        {/* ========== EDIT MODE ========== */}
                        {mode === 'edit' && (
                            <KeyboardWrapper {...keyboardProps}>
                                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                                    <Text style={styles.sectionTitle}>Question Prompt</Text>
                                    <TextInput
                                        style={styles.textArea}
                                        multiline
                                        numberOfLines={4}
                                        placeholder="e.g. What is the standard temperature for baking a waffle?"
                                        placeholderTextColor="#9CA3AF"
                                        value={editQuestion}
                                        onChangeText={setEditQuestion}
                                    />

                                    <View style={styles.sectionHeaderRow}>
                                        <Text style={styles.sectionTitle}>Possible Options</Text>
                                        <Text style={styles.sectionHelpInline}>Select correct toggle</Text>
                                    </View>

                                    <View style={styles.optionsWrapper}>
                                        {editOptions.map((opt, idx) => renderOptionInput(opt, idx))}
                                    </View>
                                </ScrollView>
                                <View style={styles.stickyFooterContainer}>
                                    <View style={styles.footerRowRight}>
                                        <TouchableOpacity onPress={() => setMode('list')} style={styles.cancelBtn}>
                                            <Text style={styles.cancelBtnText}>Discard</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={saveEditedQuestion} style={[styles.saveBtn, { backgroundColor: '#10B981' }]}>
                                            <Text style={styles.saveBtnText}>{editingIndex !== null ? 'Update Question' : 'Add Question'}</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </KeyboardWrapper>
                        )}

                        {/* ========== AI GENERATE MODE ========== */}
                        {mode === 'ai_generate' && (
                            <KeyboardWrapper {...keyboardProps}>
                                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                                    <LinearGradient colors={['#EEF2FF', '#E0E7FF']} style={styles.aiBanner}>
                                        <MaterialCommunityIcons name="robot-outline" size={38} color="#4F46E5" style={{ marginBottom: 12 }} />
                                        <Text style={[styles.aiBannerTitle, { color: '#4338CA' }]}>AI Quiz Architect</Text>
                                        <Text style={[styles.aiBannerDesc, { color: '#4F46E5' }]}>
                                            Furnish standard operating procedures or transcripts below. Our language model creates complex multiple-choice tests natively attached to this module.
                                        </Text>
                                    </LinearGradient>

                                    <View style={styles.sectionHeaderRow}>
                                        <Text style={styles.sectionTitle}>Context Repository</Text>
                                        <TouchableOpacity onPress={pickAiFile} style={styles.inlineActionBtn}>
                                            <MaterialCommunityIcons name="paperclip" size={16} color="#4F46E5" />
                                            <Text style={styles.inlineActionText}>{aiFile ? aiFile.name : 'Upload File / Photo'}</Text>
                                        </TouchableOpacity>
                                    </View>

                                    <TextInput
                                        style={[styles.textArea, { height: 160 }]}
                                        multiline
                                        textAlignVertical="top"
                                        placeholder="Paste instructional guidelines, bullet points, or video transcripts here..."
                                        placeholderTextColor="#9CA3AF"
                                        value={aiDescription}
                                        onChangeText={setAiDescription}
                                    />

                                    <View style={styles.rowForm}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.sectionTitle}>Total Questions</Text>
                                            <View style={styles.inputWrapper}>
                                                <TextInput
                                                    style={styles.input}
                                                    value={aiCount}
                                                    onChangeText={setAiCount}
                                                    keyboardType="number-pad"
                                                />
                                            </View>
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.sectionTitle}>Complexity</Text>
                                            <View style={styles.inputWrapper}>
                                                <TextInput
                                                    style={styles.input}
                                                    value={aiDifficulty}
                                                    onChangeText={setAiDifficulty}
                                                />
                                            </View>
                                        </View>
                                    </View>
                                </ScrollView>
                                <View style={styles.stickyFooterContainer}>
                                    <View style={styles.footerRowRight}>
                                        <TouchableOpacity onPress={() => setMode('list')} style={styles.cancelBtn}>
                                            <Text style={styles.cancelBtnText}>Cancel</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={handleAIGenerate}
                                            style={styles.saveBtn}
                                            disabled={isGenerating}
                                        >
                                            {isGenerating ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Initialize Generation</Text>}
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </KeyboardWrapper>
                        )}

                        {/* ========== BULK UPLOAD MODE ========== */}
                        {mode === 'bulk_upload' && (
                            <KeyboardWrapper {...keyboardProps}>
                                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                                    <View style={styles.bulkBanner}>
                                        <MaterialCommunityIcons name="table-arrow-right" size={38} color="#0EA5E9" style={{ marginBottom: 12 }} />
                                        <Text style={[styles.aiBannerTitle, { color: '#0369A1' }]}>Bulk Data Insertion</Text>
                                        <Text style={[styles.aiBannerDesc, { color: '#0284C7' }]}>
                                            Use a text stream directly mapped by the 'pipe' separator to bypass native file explorers. Follow this structure precisely mapping 1 to 4 for answer columns:
                                        </Text>
                                        <View style={styles.formatBox}>
                                            <Text style={styles.formatBoxText}>
                                                Question | Opt1 | Opt2 | Opt3 | Opt4 | AnswerNum
                                            </Text>
                                        </View>
                                    </View>

                                    <View style={styles.sectionHeaderRow}>
                                        <Text style={styles.sectionTitle}>Bulk CSV Payload</Text>
                                        <View style={{ flexDirection: 'row', gap: 8 }}>
                                            <TouchableOpacity onPress={downloadBulkFormat} style={styles.inlineActionBtnAlt}>
                                                <MaterialCommunityIcons name="file-download-outline" size={16} color="#0EA5E9" />
                                                <Text style={[styles.inlineActionText, { color: '#0EA5E9' }]}>Format.csv</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity onPress={pickBulkFile} disabled={isParsingBulk} style={[styles.inlineActionBtn, { backgroundColor: '#F0F9FF', borderColor: '#BAE6FD' }]}>
                                                {isParsingBulk ? <ActivityIndicator size="small" color="#0284C7" /> : <MaterialCommunityIcons name="file-upload-outline" size={16} color="#0284C7" />}
                                                <Text style={[styles.inlineActionText, { color: '#0284C7' }]}>Upload File</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>

                                    <TextInput
                                        style={[styles.textArea, { height: 220, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined }]}
                                        multiline
                                        textAlignVertical="top"
                                        placeholder={`Example:\nWhat is the core temperature? | 150 | 200 | 250 | 300 | 2\nWho is the founder? | Alan | Jobs | Steve | Elon | 3`}
                                        placeholderTextColor="#9CA3AF"
                                        value={bulkText}
                                        onChangeText={setBulkText}
                                    />
                                </ScrollView>
                                <View style={styles.stickyFooterContainer}>
                                    <View style={styles.footerRowRight}>
                                        <TouchableOpacity onPress={() => setMode('list')} style={styles.cancelBtn}>
                                            <Text style={styles.cancelBtnText}>Discard</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={handleBulkParse}
                                            style={[styles.saveBtn, { backgroundColor: '#0EA5E9' }]}
                                        >
                                            <Text style={styles.saveBtnText}>Compile Sequence</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </KeyboardWrapper>
                        )}

                        {/* ========== REVIEW STAGED MODE ========== */}
                        {mode === 'review_staged' && (
                            <View style={{ flex: 1 }}>
                                {/* Success Banner */}
                                <View style={styles.stagingBanner}>
                                    <MaterialCommunityIcons
                                        name={stagedSource === 'ai' ? 'robot-outline' : 'check-circle-outline'}
                                        size={24}
                                        color="#059669"
                                    />
                                    <View style={{ flex: 1, marginLeft: 12 }}>
                                        <Text style={styles.stagingBannerTitle}>
                                            {stagedSource === 'ai' ? 'AI Generation Complete!' : 'Import Complete!'}
                                        </Text>
                                        <Text style={styles.stagingBannerDesc}>
                                            {stagedQuestions.length} question{stagedQuestions.length !== 1 ? 's' : ''} ready for review. Remove any unwanted ones, then choose to add them to your quiz.
                                        </Text>
                                    </View>
                                </View>

                                <FlatList
                                    data={stagedQuestions}
                                    keyExtractor={(item, index) => `staged-${index}`}
                                    contentContainerStyle={{ paddingBottom: 20 }}
                                    showsVerticalScrollIndicator={false}
                                    renderItem={({ item, index }) => (
                                        <View style={[styles.qCard, { borderColor: '#BBF7D0', borderWidth: 1.5 }]}>
                                            <View style={styles.qCardHeader}>
                                                <View style={[styles.qCardNumberBadge, { backgroundColor: '#ECFDF5' }]}>
                                                    <Text style={[styles.qCardNumber, { color: '#059669' }]}>NEW {index + 1}</Text>
                                                </View>
                                                <TouchableOpacity onPress={() => removeStagedQuestion(index)} style={[styles.iconBtn, { backgroundColor: '#FEF2F2' }]}>
                                                    <Feather name="trash-2" size={15} color="#EF4444" />
                                                </TouchableOpacity>
                                            </View>
                                            <Text style={styles.qText}>{item.question}</Text>
                                            <View style={styles.optionsList}>
                                                {item.options?.map((opt, oIdx) => (
                                                    <View key={oIdx} style={styles.optBlock}>
                                                        <MaterialCommunityIcons
                                                            name={opt === item.answer ? "checkbox-marked-circle" : "radiobox-blank"}
                                                            size={18}
                                                            color={opt === item.answer ? "#10B981" : "#D1D5DB"}
                                                        />
                                                        <Text style={[styles.optText, opt === item.answer && styles.optTextCorrect]}>
                                                            {opt}
                                                        </Text>
                                                    </View>
                                                ))}
                                            </View>
                                        </View>
                                    )}
                                />

                                <View style={styles.stickyFooterContainer}>
                                    <View style={styles.stagingFooter}>
                                        <TouchableOpacity
                                            onPress={() => { setStagedQuestions([]); setMode('list'); }}
                                            style={styles.cancelBtn}
                                        >
                                            <Text style={styles.cancelBtnText}>Discard All</Text>
                                        </TouchableOpacity>
                                        <View style={{ flexDirection: 'row', gap: 10 }}>
                                            {questions.length > 0 && (
                                                <TouchableOpacity
                                                    onPress={commitStagedReplace}
                                                    style={[styles.saveBtn, { backgroundColor: '#F59E0B' }]}
                                                >
                                                    <Feather name="refresh-cw" size={16} color="#FFF" style={{ marginRight: 6 }} />
                                                    <Text style={styles.saveBtnText}>Replace All</Text>
                                                </TouchableOpacity>
                                            )}
                                            <TouchableOpacity
                                                onPress={commitStagedAppend}
                                                style={[styles.saveBtn, { backgroundColor: '#10B981' }]}
                                            >
                                                <Feather name="plus-circle" size={16} color="#FFF" style={{ marginRight: 6 }} />
                                                <Text style={styles.saveBtnText}>
                                                    {questions.length > 0 ? 'Append' : 'Add'} {stagedQuestions.length} Questions
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                </View>
                            </View>
                        )}

                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    container: {
        width: Platform.OS === 'web' ? Math.min(width * 0.9, 850) : '95%',
        height: Platform.OS === 'web' ? Math.min(height * 0.85, 900) : height * 0.85,
        backgroundColor: '#F8FAFC',
        borderRadius: 24,
        overflow: 'hidden',
        ...(Platform.OS === 'web' ? {
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        } : {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 20 },
            shadowOpacity: 0.15,
            shadowRadius: 40,
            elevation: 15,
        })
    },
    header: {
        padding: 24,
        paddingBottom: 28,
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    headerTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    headerIcon: {
        backgroundColor: 'rgba(255, 255, 255, 0.25)',
        width: 48,
        height: 48,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    headerTitle: {
        fontFamily: baseFont,
        fontWeight: '700',
        fontSize: 22,
        color: '#FFF',
    },
    headerSubtitle: {
        fontFamily: baseFont,
        fontWeight: '400',
        fontSize: 14,
        color: 'rgba(255,255,255,0.85)',
        marginTop: 4,
    },
    closeBtn: {
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
    },
    toast: {
        position: 'absolute',
        top: 90,
        left: 20,
        right: 20,
        backgroundColor: '#065F46',
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderRadius: 12,
        zIndex: 999,
        alignItems: 'center',
        ...(Platform.OS === 'web' ? {
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2)',
        } : {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.2,
            shadowRadius: 10,
            elevation: 10,
        }),
    },
    toastText: {
        color: '#FFF',
        fontFamily: baseFont,
        fontWeight: '600',
        fontSize: 15,
    },
    body: {
        flex: 1,
        backgroundColor: '#F8FAFC',
        padding: 24,
    },
    actionToolbar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    addBtn: {
        backgroundColor: '#10B981',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 18,
        paddingVertical: 12,
        borderRadius: 12,
    },
    addBtnText: {
        color: '#FFF',
        fontFamily: baseFont,
        fontWeight: '600',
        fontSize: 14,
        marginLeft: 8,
    },
    bulkBtn: {
        backgroundColor: '#FFF',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    bulkBtnText: {
        color: '#1E293B',
        fontFamily: baseFont,
        fontWeight: '600',
        fontSize: 14,
        marginLeft: 8,
    },
    aiBtn: {
        backgroundColor: '#4F46E5',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 12,
    },
    aiBtnText: {
        color: '#FFF',
        fontFamily: baseFont,
        fontWeight: '600',
        fontSize: 14,
        marginLeft: 8,
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 30,
        backgroundColor: '#FFF',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderStyle: 'dashed',
        marginBottom: 20,
    },
    emptyIconCircle: {
        width: 90,
        height: 90,
        borderRadius: 45,
        backgroundColor: '#F3F4F6',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    emptyTitle: {
        fontFamily: baseFont,
        fontWeight: '600',
        fontSize: 18,
        color: '#374151',
    },
    emptyDesc: {
        fontFamily: baseFont,
        fontWeight: '400',
        fontSize: 14,
        color: '#6B7280',
        textAlign: 'center',
        lineHeight: 22,
        marginTop: 10,
    },
    stickyFooterContainer: {
        paddingTop: 16,
        borderTopWidth: 1,
        borderColor: '#E2E8F0',
        backgroundColor: '#F8FAFC',
    },
    footerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    footerRowRight: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
    },
    footerSummary: {
        fontFamily: baseFont,
        fontWeight: '500',
        color: '#64748B',
        fontSize: 14,
    },
    saveBtn: {
        backgroundColor: '#4F46E5',
        paddingHorizontal: 24,
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
    },
    saveBtnText: {
        color: '#FFF',
        fontFamily: baseFont,
        fontWeight: '600',
        fontSize: 15,
    },
    cancelBtn: {
        backgroundColor: '#FFF',
        paddingHorizontal: 24,
        paddingVertical: 14,
        borderRadius: 12,
        marginRight: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    cancelBtnText: {
        color: '#64748B',
        fontFamily: baseFont,
        fontWeight: '600',
        fontSize: 15,
    },
    qCard: {
        backgroundColor: '#FFF',
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        ...(Platform.OS === 'web' ? {
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
        } : {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.05,
            shadowRadius: 5,
            elevation: 2,
        }),
    },
    qCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    qCardNumberBadge: {
        backgroundColor: '#EEF2FF',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
        marginRight: 10,
    },
    qCardNumber: {
        fontFamily: baseFont,
        fontWeight: '700',
        fontSize: 13,
        color: '#4F46E5',
    },
    reorderControls: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    reorderBtn: {
        paddingHorizontal: 8,
        paddingVertical: 6,
    },
    reorderDisabled: {
        opacity: 0.5,
    },
    qCardActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    iconBtn: {
        padding: 8,
        backgroundColor: '#F3F4F6',
        borderRadius: 8,
    },
    qText: {
        fontFamily: baseFont,
        fontWeight: '600',
        fontSize: 16,
        color: '#1E293B',
        marginBottom: 16,
        lineHeight: 24,
    },
    optionsList: {
        gap: 10,
    },
    optBlock: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        padding: 14,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#F1F5F9',
    },
    optText: {
        fontFamily: baseFont,
        fontWeight: '400',
        fontSize: 15,
        color: '#475569',
        marginLeft: 12,
        flex: 1,
    },
    optTextCorrect: {
        color: '#059669',
        fontWeight: '600',
    },
    sectionHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        marginTop: 20,
        marginBottom: 12,
    },
    sectionTitle: {
        fontFamily: baseFont,
        fontWeight: '600',
        fontSize: 16,
        color: '#0F172A',
        marginBottom: 8,
        marginTop: 16,
    },
    sectionHelpInline: {
        fontFamily: baseFont,
        fontWeight: '400',
        fontSize: 13,
        color: '#94A3B8',
        marginBottom: 2,
    },
    textArea: {
        backgroundColor: '#FFF',
        borderWidth: 1,
        borderColor: '#CBD5E1',
        borderRadius: 12,
        padding: 16,
        fontSize: 15,
        fontFamily: baseFont,
        fontWeight: '400',
        color: '#1E293B',
        minHeight: 120,
        textAlignVertical: 'top',
    },
    optionsWrapper: {
        gap: 12,
    },
    optionRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    radioBtn: {
        width: 28,
        height: 28,
        borderRadius: 14,
        borderWidth: 2,
        borderColor: '#CBD5E1',
        marginRight: 14,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#FFF',
    },
    radioBtnActive: {
        borderColor: '#10B981',
        backgroundColor: '#ECFDF5',
    },
    radioBtnInner: {
        width: 14,
        height: 14,
        borderRadius: 7,
        backgroundColor: '#10B981',
    },
    answerInput: {
        flex: 1,
        backgroundColor: '#FFF',
        borderWidth: 1,
        borderColor: '#CBD5E1',
        borderRadius: 12,
        padding: 14,
        fontSize: 15,
        fontFamily: baseFont,
        fontWeight: '500',
        color: '#1E293B',
    },
    rowForm: {
        flexDirection: 'row',
        gap: 16,
        marginTop: 10,
    },
    inputWrapper: {
        backgroundColor: '#FFF',
        borderWidth: 1,
        borderColor: '#CBD5E1',
        borderRadius: 12,
        paddingHorizontal: 16,
    },
    input: {
        height: 52,
        fontFamily: baseFont,
        fontWeight: '500',
        fontSize: 15,
        color: '#1E293B',
    },
    aiBanner: {
        borderRadius: 16,
        padding: 24,
        alignItems: 'center',
        marginBottom: 10,
    },
    bulkBanner: {
        backgroundColor: '#F0F9FF',
        borderRadius: 16,
        padding: 24,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#E0F2FE',
        marginBottom: 10,
    },
    aiBannerTitle: {
        fontFamily: baseFont,
        fontWeight: '700',
        fontSize: 19,
        marginBottom: 8,
    },
    aiBannerDesc: {
        fontFamily: baseFont,
        fontWeight: '400',
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 22,
    },
    formatBox: {
        backgroundColor: 'rgba(255,255,255,0.6)',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
        marginTop: 12,
        borderWidth: 1,
        borderColor: 'rgba(2, 132, 199, 0.2)',
    },
    formatBoxText: {
        color: '#0369A1',
        fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
        fontWeight: '600',
        fontSize: 13,
    },
    inlineActionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#EEF2FF',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#E0E7FF',
        gap: 6,
    },
    inlineActionBtnAlt: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#ECFEFF',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#CFFAFE',
        gap: 6,
    },
    inlineActionText: {
        color: '#4F46E5',
        fontFamily: baseFont,
        fontWeight: '600',
        fontSize: 13,
    },
    // Staging/Review mode styles
    stagingBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#ECFDF5',
        borderWidth: 1,
        borderColor: '#BBF7D0',
        borderRadius: 14,
        padding: 16,
        marginBottom: 16,
    },
    stagingBannerTitle: {
        fontFamily: baseFont,
        fontWeight: '700',
        fontSize: 16,
        color: '#065F46',
    },
    stagingBannerDesc: {
        fontFamily: baseFont,
        fontWeight: '400',
        fontSize: 13,
        color: '#047857',
        marginTop: 4,
        lineHeight: 20,
    },
    stagingFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
});
