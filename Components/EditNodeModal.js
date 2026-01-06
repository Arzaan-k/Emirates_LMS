import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    Modal,
    TouchableOpacity,
    TextInput,
    ScrollView,
    StyleSheet,
    Switch,
    Dimensions,
    Alert,
    ActivityIndicator
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

const { width, height } = Dimensions.get('window');

export default function EditNodeModal({
    visible,
    node,
    onClose,
    onSave,
    onDelete,
    onGenerateQuiz
}) {
    // TABS: 'details' | 'quiz'
    const [activeTab, setActiveTab] = useState('details');

    // FORM STATE
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [skippable, setSkippable] = useState(false);
    const [questions, setQuestions] = useState([]);

    // UI STATE
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);

    // Initial Load
    useEffect(() => {
        if (node) {
            setTitle(node.title || '');
            setDescription(node.desc || node.description || ''); // Handle both naming conventions
            setSkippable(node.skippable || false);
            setQuestions(node.quiz?.questions || []);
        }
    }, [node]);

    if (!visible || !node) return null;

    const handleSave = async () => {
        setIsSaving(true);
        const updatedData = {
            title,
            description,
            skippable,
            quiz: { questions }
        };
        await onSave(node.id, updatedData);
        setIsSaving(false);
    };

    const handleDelete = async () => {
        Alert.alert(
            "Delete Node",
            "Are you sure? This action cannot be undone.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        setIsDeleting(true);
                        await onDelete(node.id);
                        setIsDeleting(false);
                    }
                }
            ]
        );
    };

    const handleGenerateQuiz = async () => {
        if (!node.transcript) {
            Alert.alert("No Transcript", "This node has no transcript to generate a quiz from.");
            return;
        }
        setIsGenerating(true);
        try {
            const generated = await onGenerateQuiz(node.transcript);
            if (generated && generated.questions) {
                setQuestions(generated.questions);
            }
        } catch (err) {
            Alert.alert("Error", "Failed to generate quiz.");
        } finally {
            setIsGenerating(false);
        }
    };

    const addManualQuestion = () => {
        setQuestions([...questions, {
            question: "New Question",
            options: ["Option A", "Option B", "Option C", "Option D"],
            correctIndex: 0
        }]);
    };

    const updateQuestion = (idx, field, value) => {
        const newQs = [...questions];
        newQs[idx][field] = value;
        setQuestions(newQs);
    };

    const updateOption = (qIdx, oIdx, text) => {
        const newQs = [...questions];
        newQs[qIdx].options[oIdx] = text;
        setQuestions(newQs);
    };

    const deleteQuestion = (idx) => {
        const newQs = questions.filter((_, i) => i !== idx);
        setQuestions(newQs);
    };

    return (
        <Modal visible={visible} animationType="slide" transparent={true}>
            <BlurView intensity={20} tint="dark" style={styles.container}>
                <View style={styles.modalContent}>

                    {/* HEADER */}
                    <View style={styles.header}>
                        <Text style={styles.headerTitle}>Edit Content Node</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <Feather name="x" size={24} color="#6B7280" />
                        </TouchableOpacity>
                    </View>

                    {/* TABS */}
                    <View style={styles.tabs}>
                        <TouchableOpacity
                            style={[styles.tab, activeTab === 'details' && styles.activeTab]}
                            onPress={() => setActiveTab('details')}
                        >
                            <Text style={[styles.tabText, activeTab === 'details' && styles.activeTabText]}>Details</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.tab, activeTab === 'quiz' && styles.activeTab]}
                            onPress={() => setActiveTab('quiz')}
                        >
                            <Text style={[styles.tabText, activeTab === 'quiz' && styles.activeTabText]}>
                                Quiz ({questions.length})
                            </Text>
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>

                        {/* DETAILS TAB */}
                        {activeTab === 'details' && (
                            <View style={styles.section}>
                                <Text style={styles.label}>Title</Text>
                                <TextInput
                                    style={styles.input}
                                    value={title}
                                    onChangeText={setTitle}
                                    placeholder="Node Title"
                                />

                                <Text style={styles.label}>Description</Text>
                                <TextInput
                                    style={[styles.input, { height: 100 }]}
                                    value={description}
                                    onChangeText={setDescription}
                                    multiline
                                    placeholder="Node Description"
                                />

                                <View style={styles.rowBetween}>
                                    <View>
                                        <Text style={styles.label}>Skippable</Text>
                                        <Text style={styles.helperText}>User can skip this node without completing it.</Text>
                                    </View>
                                    <Switch
                                        value={skippable}
                                        onValueChange={setSkippable}
                                        trackColor={{ false: "#D1D5DB", true: "#F59E0B" }}
                                    />
                                </View>
                            </View>
                        )}

                        {/* QUIZ TAB */}
                        {activeTab === 'quiz' && (
                            <View style={styles.section}>
                                <View style={styles.quizActions}>
                                    <TouchableOpacity
                                        style={styles.aiBtn}
                                        onPress={handleGenerateQuiz}
                                        disabled={isGenerating}
                                    >
                                        {isGenerating ? (
                                            <ActivityIndicator color="#FFF" />
                                        ) : (
                                            <>
                                                <MaterialCommunityIcons name="robot" size={20} color="#FFF" />
                                                <Text style={styles.aiBtnText}>Generate with AI</Text>
                                            </>
                                        )}
                                    </TouchableOpacity>

                                    <TouchableOpacity style={styles.manualBtn} onPress={addManualQuestion}>
                                        <Feather name="plus" size={20} color="#374151" />
                                        <Text style={styles.manualBtnText}>Add Manual</Text>
                                    </TouchableOpacity>
                                </View>

                                {questions.map((q, i) => (
                                    <View key={i} style={styles.questionCard}>
                                        <View style={styles.qHeader}>
                                            <Text style={styles.qIndex}>Q{i + 1}</Text>
                                            <TouchableOpacity onPress={() => deleteQuestion(i)}>
                                                <Feather name="trash-2" size={18} color="#EF4444" />
                                            </TouchableOpacity>
                                        </View>

                                        <TextInput
                                            style={styles.qInput}
                                            value={q.question}
                                            onChangeText={(text) => updateQuestion(i, 'question', text)}
                                            placeholder="Question Text"
                                        />

                                        {q.options.map((opt, oIdx) => (
                                            <View key={oIdx} style={styles.optionRow}>
                                                <TouchableOpacity
                                                    style={[styles.radio, q.correctIndex === oIdx && styles.radioActive]}
                                                    onPress={() => updateQuestion(i, 'correctIndex', oIdx)}
                                                />
                                                <TextInput
                                                    style={styles.optionInput}
                                                    value={opt}
                                                    onChangeText={(text) => updateOption(i, oIdx, text)}
                                                    placeholder={`Option ${oIdx + 1}`}
                                                />
                                            </View>
                                        ))}
                                    </View>
                                ))}
                            </View>
                        )}
                    </ScrollView>

                    {/* FOOTER */}
                    <View style={styles.footer}>
                        <TouchableOpacity
                            style={styles.deleteBtn}
                            onPress={handleDelete}
                            disabled={isDeleting}
                        >
                            {isDeleting ? <ActivityIndicator color="#EF4444" /> : <Feather name="trash" size={20} color="#EF4444" />}
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.saveBtn}
                            onPress={handleSave}
                            disabled={isSaving}
                        >
                            <LinearGradient
                                colors={['#F59E0B', '#D97706']}
                                style={styles.gradientBtn}
                            >
                                {isSaving ? (
                                    <ActivityIndicator color="#FFF" />
                                ) : (
                                    <Text style={styles.saveBtnText}>Save Changes</Text>
                                )}
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                </View>
            </BlurView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#F9FAFB',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        height: height * 0.85,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 10,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 24,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    headerTitle: {
        fontSize: 20,
        fontFamily: 'Poppins_700Bold',
        color: '#111827',
    },
    closeBtn: {
        padding: 4,
    },
    tabs: {
        flexDirection: 'row',
        paddingHorizontal: 24,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    tab: {
        paddingVertical: 16,
        marginRight: 24,
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    activeTab: {
        borderBottomColor: '#F59E0B',
    },
    tabText: {
        fontSize: 15,
        fontFamily: 'Poppins_500Medium',
        color: '#6B7280',
    },
    activeTabText: {
        color: '#F59E0B',
        fontFamily: 'Poppins_600SemiBold',
    },
    scrollContent: {
        flex: 1,
        padding: 24,
    },
    section: {
        marginBottom: 40,
    },
    label: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#374151',
        marginBottom: 8,
    },
    input: {
        backgroundColor: '#FFF',
        borderWidth: 1,
        borderColor: '#D1D5DB',
        borderRadius: 12,
        padding: 12,
        fontSize: 15,
        fontFamily: 'Poppins_400Regular',
        color: '#111827',
        marginBottom: 20,
    },
    rowBetween: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    helperText: {
        fontSize: 13,
        color: '#6B7280',
        fontFamily: 'Poppins_400Regular',
    },
    // QUIZ STYLES
    quizActions: {
        flexDirection: 'row',
        marginBottom: 24,
    },
    aiBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#8B5CF6',
        paddingVertical: 12,
        borderRadius: 12,
        marginRight: 10,
    },
    aiBtnText: {
        color: '#FFF',
        fontFamily: 'Poppins_600SemiBold',
        marginLeft: 8,
    },
    manualBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FFF',
        borderWidth: 1,
        borderColor: '#D1D5DB',
        paddingVertical: 12,
        borderRadius: 12,
    },
    manualBtnText: {
        color: '#374151',
        fontFamily: 'Poppins_600SemiBold',
        marginLeft: 8,
    },
    questionCard: {
        backgroundColor: '#FFF',
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        marginBottom: 16,
    },
    qHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    qIndex: {
        fontSize: 14,
        fontFamily: 'Poppins_700Bold',
        color: '#F59E0B',
    },
    qInput: {
        fontSize: 16,
        fontFamily: 'Poppins_500Medium',
        marginBottom: 16,
        color: '#111827',
    },
    optionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    radio: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: '#D1D5DB',
        marginRight: 12,
    },
    radioActive: {
        borderColor: '#10B981',
        backgroundColor: '#10B981',
    },
    optionInput: {
        flex: 1,
        backgroundColor: '#F3F4F6',
        borderRadius: 8,
        padding: 8,
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
    },
    footer: {
        flexDirection: 'row',
        padding: 24,
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
        backgroundColor: '#FFF',
    },
    deleteBtn: {
        width: 50,
        height: 50,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#FEF2F2',
        borderRadius: 14,
        marginRight: 16,
    },
    saveBtn: {
        flex: 1,
    },
    gradientBtn: {
        flex: 1,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        height: 50,
    },
    saveBtnText: {
        color: '#FFF',
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
    },
});
