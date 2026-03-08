import React from 'react';
import {
    View,
    Text,
    Modal,
    TouchableOpacity,
    TextInput,
    ScrollView,
    StyleSheet,
    Dimensions
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

// QUIZ CREATION MODAL
export function QuizCreationModal({
    visible,
    onClose,
    quizTitle,
    setQuizTitle,
    quizDescription,
    setQuizDescription,
    currentQuestion,
    setCurrentQuestion,
    options,
    setOptions,
    correctIndex,
    setCorrectIndex,
    questions,
    onAddQuestion,
    onPublish
}) {
    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
            <View style={styles.modalContainer}>
                {/* Header */}
                <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Create Quiz</Text>
                    <TouchableOpacity onPress={onClose}>
                        <Feather name="x" size={24} color="#111827" />
                    </TouchableOpacity>
                </View>

                <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                    {/* Quiz Metadata */}
                    <View style={styles.inputSection}>
                        <Text style={styles.label}>Quiz Title</Text>
                        <TextInput
                            value={quizTitle}
                            onChangeText={setQuizTitle}
                            placeholder="e.g., Safety Procedures Quiz"
                            style={styles.input}
                        />
                    </View>

                    <View style={styles.inputSection}>
                        <Text style={styles.label}>Description (Optional)</Text>
                        <TextInput
                            value={quizDescription}
                            onChangeText={setQuizDescription}
                            placeholder="What is this quiz about?"
                            style={[styles.input, { height: 60 }]}
                            multiline
                        />
                    </View>

                    {/* Question Builder */}
                    <View style={styles.divider} />
                    <Text style={styles.sectionHeader}>Add Question</Text>

                    <View style={styles.inputSection}>
                        <Text style={styles.label}>Question</Text>
                        <TextInput
                            value={currentQuestion}
                            onChangeText={setCurrentQuestion}
                            placeholder="Type your question here"
                            style={[styles.input, { height: 70 }]}
                            multiline
                        />
                    </View>

                    {/* Options */}
                    {[0, 1, 2, 3].map((index) => (
                        <View key={index} style={styles.optionRow}>
                            <TouchableOpacity
                                style={[
                                    styles.radio,
                                    correctIndex === index && styles.radioSelected
                                ]}
                                onPress={() => setCorrectIndex(index)}
                            >
                                {correctIndex === index && (
                                    <View style={styles.radioDot} />
                                )}
                            </TouchableOpacity>
                            <TextInput
                                value={options[index]}
                                onChangeText={(text) => {
                                    const newOptions = [...options];
                                    newOptions[index] = text;
                                    setOptions(newOptions);
                                }}
                                placeholder={`Option ${index + 1}`}
                                style={styles.optionInput}
                            />
                        </View>
                    ))}

                    <TouchableOpacity style={styles.addBtn} onPress={onAddQuestion}>
                        <MaterialCommunityIcons name="plus-circle" size={20} color="#D71A21" />
                        <Text style={styles.addBtnText}>Add Question</Text>
                    </TouchableOpacity>

                    {/* Added Questions */}
                    {questions.length > 0 && (
                        <>
                            <View style={styles.divider} />
                            <Text style={styles.sectionHeader}>Added Questions ({questions.length})</Text>
                            {questions.map((q, i) => (
                                <View key={i} style={styles.questionCard}>
                                    <Text style={styles.questionNumber}>Q{i + 1}</Text>
                                    <Text style={styles.questionPreview} numberOfLines={2}>{q.question}</Text>
                                </View>
                            ))}
                        </>
                    )}
                </ScrollView>

                {/* Footer */}
                <View style={styles.modalFooter}>
                    <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                        <Text style={styles.cancelBtnText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.publishBtn} onPress={onPublish}>
                        <Text style={styles.publishBtnText}>Publish Quiz</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

// QUIZ RESULTS MODAL
export function QuizResultsModal({ visible, onClose, resultsData }) {
    if (!resultsData) return null;

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
            <View style={styles.modalContainer}>
                <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Quiz Results</Text>
                    <TouchableOpacity onPress={onClose}>
                        <Feather name="x" size={24} color="#111827" />
                    </TouchableOpacity>
                </View>

                <ScrollView style={styles.modalScroll}>
                    {/* Quiz Info */}
                    <View style={styles.resultHeader}>
                        <Text style={styles.resultQuizTitle}>{resultsData.quiz_title}</Text>
                        <Text style={styles.resultDescription}>{resultsData.quiz_description}</Text>
                    </View>

                    {/* Stats */}
                    <View style={styles.statsRow}>
                        <View style={styles.statCard}>
                            <Text style={styles.statValue}>{resultsData.total_submissions}</Text>
                            <Text style={styles.statLabel}>Submissions</Text>
                        </View>
                        <View style={styles.statCard}>
                            <Text style={styles.statValue}>{resultsData.average_score.toFixed(1)}/{resultsData.total_questions}</Text>
                            <Text style={styles.statLabel}>Avg Score</Text>
                        </View>
                    </View>

                    {/* Submissions List */}
                    <Text style={styles.sectionHeader}>Individual Results</Text>
                    {resultsData.submissions && resultsData.submissions.length > 0 ? (
                        resultsData.submissions.map((submission, i) => (
                            <View key={i} style={styles.submissionCard}>
                                <View style={styles.submissionHeader}>
                                    <Text style={styles.userName}>{submission.user_name}</Text>
                                    <Text style={styles.score}>{submission.score}/{submission.total}</Text>
                                </View>
                                <Text style={styles.timestamp}>
                                    {new Date(submission.submitted_at).toLocaleString()}
                                </Text>
                            </View>
                        ))
                    ) : (
                        <Text style={styles.noData}>No submissions yet</Text>
                    )}
                </ScrollView>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    modalContainer: {
        flex: 1,
        backgroundColor: '#F9FAFB'
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
        backgroundColor: '#FFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB'
    },
    modalTitle: {
        fontSize: 20,
        fontFamily: 'Poppins_600SemiBold',
        color: '#111827'
    },
    modalScroll: {
        flex: 1,
        padding: 20
    },
    inputSection: {
        marginBottom: 20
    },
    label: {
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        color: '#374151',
        marginBottom: 8
    },
    input: {
        backgroundColor: '#FFF',
        borderWidth: 1,
        borderColor: '#D1D5DB',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        fontSize: 15,
        fontFamily: 'Poppins_400Regular',
        color: '#111827'
    },
    divider: {
        height: 1,
        backgroundColor: '#E5E7EB',
        marginVertical: 20
    },
    sectionHeader: {
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
        color: '#111827',
        marginBottom: 15
    },
    optionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12
    },
    radio: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: '#D1D5DB',
        marginRight: 12,
        justifyContent: 'center',
        alignItems: 'center'
    },
    radioSelected: {
        borderColor: '#D71A21'
    },
    radioDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#D71A21'
    },
    optionInput: {
        flex: 1,
        backgroundColor: '#FFF',
        borderWidth: 1,
        borderColor: '#D1D5DB',
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 10,
        fontSize: 14,
        fontFamily: 'Poppins_400Regular'
    },
    addBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FEF3C7',
        paddingVertical: 12,
        borderRadius: 12,
        marginTop: 10
    },
    addBtnText: {
        marginLeft: 8,
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
        color: '#D71A21'
    },
    questionCard: {
        flexDirection: 'row',
        backgroundColor: '#FFF',
        padding: 14,
        borderRadius: 12,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: '#E5E7EB'
    },
    questionNumber: {
        fontSize: 14,
        fontFamily: 'Poppins_700Bold',
        color: '#D71A21',
        marginRight: 12
    },
    questionPreview: {
        flex: 1,
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        color: '#374151'
    },
    modalFooter: {
        flexDirection: 'row',
        paddingHorizontal: 20,
        paddingVertical: 16,
        backgroundColor: '#FFF',
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB'
    },
    cancelBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
        marginRight: 10
    },
    cancelBtnText: {
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
        color: '#6B7280'
    },
    publishBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: '#D71A21',
        alignItems: 'center'
    },
    publishBtnText: {
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF'
    },
    // Results Modal Styles
    resultHeader: {
        backgroundColor: '#FFF',
        padding: 16,
        borderRadius: 16,
        marginBottom: 20
    },
    resultQuizTitle: {
        fontSize: 18,
        fontFamily: 'Poppins_700Bold',
        color: '#111827',
        marginBottom: 4
    },
    resultDescription: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280'
    },
    statsRow: {
        flexDirection: 'row',
        marginBottom: 20
    },
    statCard: {
        flex: 1,
        backgroundColor: '#FFF',
        padding: 16,
        borderRadius: 12,
        marginHorizontal: 5,
        alignItems: 'center'
    },
    statValue: {
        fontSize: 24,
        fontFamily: 'Poppins_700Bold',
        color: '#D71A21',
        marginBottom: 4
    },
    statLabel: {
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
        color: '#6B7280'
    },
    submissionCard: {
        backgroundColor: '#FFF',
        padding: 16,
        borderRadius: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB'
    },
    submissionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6
    },
    userName: {
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
        color: '#111827'
    },
    score: {
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
        color: '#10B981'
    },
    timestamp: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#9CA3AF'
    },
    noData: {
        textAlign: 'center',
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        color: '#9CA3AF',
        marginTop: 20
    }
});
