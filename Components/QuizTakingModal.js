import React, { useState } from 'react';
import {
    View,
    Text,
    Modal,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    Dimensions
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');
const API_URL = "http://192.168.1.37:8000";

export default function QuizTakingModal({ visible, quiz, onClose, userName = "User" }) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [answers, setAnswers] = useState([]);
    const [showResult, setShowResult] = useState(false);
    const [score, setScore] = useState(null);

    if (!visible || !quiz) return null;

    const handleAnswer = (optionIndex) => {
        const newAnswers = [...answers];
        newAnswers[currentIndex] = optionIndex;
        setAnswers(newAnswers);

        if (currentIndex < quiz.questions.length - 1) {
            setCurrentIndex(currentIndex + 1);
        }
    };

    const submitQuiz = async () => {
        try {
            const response = await fetch(`${API_URL}/quiz/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    quiz_id: quiz.quiz_id,
                    user_name: userName,
                    answers: answers
                })
            });

            const result = await response.json();
            setScore(result);
            setShowResult(true);
        } catch (error) {
            console.error("Error submitting quiz:", error);
            alert("Failed to submit quiz");
        }
    };

    const resetQuiz = () => {
        setCurrentIndex(0);
        setAnswers([]);
        setShowResult(false);
        setScore(null);
        onClose();
    };

    if (showResult && score) {
        return (
            <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
                <LinearGradient colors={['#1E293B', '#0F172A']} style={styles.container}>
                    <Text style={styles.resultTitle}>Quiz Complete!</Text>
                    <View style={styles.scoreCircle}>
                        <Text style={styles.scoreNumber}>{score.score}/{score.total}</Text>
                        <Text style={styles.scorePercent}>{score.percentage}%</Text>
                    </View>
                    <TouchableOpacity style={styles.doneBtn} onPress={resetQuiz}>
                        <Text style={styles.doneBtnText}>Done</Text>
                    </TouchableOpacity>
                </LinearGradient>
            </Modal>
        );
    }

    const currentQuestion = quiz.questions ? quiz.questions[currentIndex] : null;
    if (!currentQuestion) return null;

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
            <LinearGradient colors={['#1E293B', '#0F172A']} style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={onClose}>
                        <Feather name="x" size={24} color="#FFF" />
                    </TouchableOpacity>
                    <Text style={styles.quizTitle}>{quiz.title}</Text>
                    <Text style={styles.questionCounter}>
                        {currentIndex + 1}/{quiz.questions.length}
                    </Text>
                </View>

                {/* Progress Bar */}
                <View style={styles.progressBar}>
                    <View style={[styles.progressFill, { width: `${((currentIndex + 1) / quiz.questions.length) * 100}%` }]} />
                </View>

                <ScrollView contentContainerStyle={styles.scrollContent}>
                    {/* Question */}
                    <Text style={styles.question}>{currentQuestion.question}</Text>

                    {/* Options */}
                    {currentQuestion.options.map((option, index) => (
                        <TouchableOpacity
                            key={index}
                            style={[
                                styles.option,
                                answers[currentIndex] === index && styles.optionSelected
                            ]}
                            onPress={() => handleAnswer(index)}
                        >
                            <View style={styles.optionCircle}>
                                {answers[currentIndex] === index && <View style={styles.optionDot} />}
                            </View>
                            <Text style={styles.optionText}>{option}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                {/* Footer Buttons */}
                <View style={styles.footer}>
                    {currentIndex > 0 && (
                        <TouchableOpacity
                            style={styles.backBtn}
                            onPress={() => setCurrentIndex(currentIndex - 1)}
                        >
                            <Text style={styles.backBtnText}>Back</Text>
                        </TouchableOpacity>
                    )}
                    {currentIndex === quiz.questions.length - 1 ? (
                        <TouchableOpacity
                            style={[styles.submitBtn, answers.length !== quiz.questions.length && styles.submitBtnDisabled]}
                            onPress={submitQuiz}
                            disabled={answers.length !== quiz.questions.length}
                        >
                            <Text style={styles.submitBtnText}>Submit Quiz</Text>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity
                            style={[styles.nextBtn, answers[currentIndex] === undefined && styles.nextBtnDisabled]}
                            onPress={() => setCurrentIndex(currentIndex + 1)}
                            disabled={answers[currentIndex] === undefined}
                        >
                            <Text style={styles.nextBtnText}>Next</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </LinearGradient>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingTop: 50
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16
    },
    quizTitle: {
        fontSize: 18,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
        flex: 1,
        textAlign: 'center',
        marginHorizontal: 16
    },
    questionCounter: {
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        color: '#94A3B8'
    },
    progressBar: {
        height: 4,
        backgroundColor: '#334155',
        marginHorizontal: 20,
        borderRadius: 2,
        overflow: 'hidden'
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#F59E0B'
    },
    scrollContent: {
        padding: 20,
        paddingBottom: 100
    },
    question: {
        fontSize: 20,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
        marginBottom: 24,
        lineHeight: 28
    },
    option: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1E293B',
        borderWidth: 2,
        borderColor: '#334155',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12
    },
    optionSelected: {
        borderColor: '#F59E0B',
        backgroundColor: 'rgba(245, 158, 11, 0.1)'
    },
    optionCircle: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: '#94A3B8',
        marginRight: 12,
        justifyContent: 'center',
        alignItems: 'center'
    },
    optionDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#F59E0B'
    },
    optionText: {
        flex: 1,
        fontSize: 15,
        fontFamily: 'Poppins_400Regular',
        color: '#FFF'
    },
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        padding: 20,
        backgroundColor: '#0F172A'
    },
    backBtn: {
        flex: 1,
        paddingVertical: 16,
        borderRadius: 12,
        backgroundColor: '#334155',
        alignItems: 'center',
        marginRight: 10
    },
    backBtnText: {
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF'
    },
    nextBtn: {
        flex: 1,
        paddingVertical: 16,
        borderRadius: 12,
        backgroundColor: '#F59E0B',
        alignItems: 'center'
    },
    nextBtnDisabled: {
        backgroundColor: '#64748B'
    },
    nextBtnText: {
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF'
    },
    submitBtn: {
        flex: 1,
        paddingVertical: 16,
        borderRadius: 12,
        backgroundColor: '#10B981',
        alignItems: 'center'
    },
    submitBtnDisabled: {
        backgroundColor: '#64748B'
    },
    submitBtnText: {
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF'
    },
    // Result Styles
    resultTitle: {
        fontSize: 28,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
        textAlign: 'center',
        marginTop: 40,
        marginBottom: 40
    },
    scoreCircle: {
        width: 200,
        height: 200,
        borderRadius: 100,
        backgroundColor: 'rgba(245, 158, 11, 0.2)',
        borderWidth: 8,
        borderColor: '#F59E0B',
        justifyContent: 'center',
        alignItems: 'center',
        alignSelf: 'center',
        marginBottom: 40
    },
    scoreNumber: {
        fontSize: 48,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF'
    },
    scorePercent: {
        fontSize: 20,
        fontFamily: 'Poppins_500Medium',
        color: '#94A3B8'
    },
    doneBtn: {
        marginHorizontal: 20,
        paddingVertical: 16,
        borderRadius: 12,
        backgroundColor: '#F59E0B',
        alignItems: 'center'
    },
    doneBtnText: {
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF'
    }
});
