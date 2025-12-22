import React, { useState, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Dimensions,
    ScrollView,
    Image,
    SafeAreaView
} from 'react-native';
import { MaterialCommunityIcons, Feather, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, {
    FadeInDown,
    FadeInRight,
    FadeOutDown,
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming
} from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');

const MOCK_TRANSCRIPT = `Welcome to the Art of Espresso. In this lesson, we're going to cover the fundamental variables that affect your espresso extraction.

First, let's talk about the grind size. This is often the most critical variable. If your grind is too coarse, the water flows through too fast, resulting in a weak, sour shot. If it's too fine, the water chokes, leading to a bitter, over-extracted mess.

Next, dosing. Consistency is key. You want to aim for 18-20 grams for a standard double shot.

Finally, the tamp. You need a level, firm tamp. 30 pounds of pressure is the standard, but consistency and levelness are more important than exact pressure.`;

const MOCK_QUIZ = [
    {
        id: 1,
        question: "What happens if the grind size is too coarse?",
        options: ["The shot is bitter", "The shot is sour and weak", "The shot is perfect", "The machine explodes"],
        correct: 1
    },
    {
        id: 2,
        question: "What is the recommended dose for a double shot?",
        options: ["10-12g", "14-16g", "18-20g", "22-24g"],
        correct: 2
    }
];

const TabButton = ({ title, active, onPress }) => (
    <TouchableOpacity onPress={onPress} style={[styles.tabBtn, active && styles.tabBtnActive]}>
        <Text style={[styles.tabBtnText, active && styles.tabBtnTextActive]}>{title}</Text>
        {active && <Animated.View entering={FadeInRight.duration(200)} style={styles.activeIndicator} />}
    </TouchableOpacity>
);

export default function LessonView({ lesson, onClose }) {
    const [activeTab, setActiveTab] = useState('transcript');
    const [currentQuizIdx, setCurrentQuizIdx] = useState(0);
    const [quizScore, setQuizScore] = useState(0);
    const [quizComplete, setQuizComplete] = useState(false);
    const [selectedOption, setSelectedOption] = useState(null);

    const handleOptionSelect = (idx) => {
        setSelectedOption(idx);
        setTimeout(() => {
            if (idx === MOCK_QUIZ[currentQuizIdx].correct) {
                setQuizScore(prev => prev + 1);
            }
            if (currentQuizIdx < MOCK_QUIZ.length - 1) {
                setCurrentQuizIdx(prev => prev + 1);
                setSelectedOption(null);
            } else {
                setQuizComplete(true);
            }
        }, 800);
    };

    return (
        <Animated.View entering={FadeInDown.duration(400)} exiting={FadeOutDown.duration(300)} style={styles.container}>
            {/* BACKGROUND */}
            <LinearGradient colors={['#1F2937', '#111827']} style={StyleSheet.absoluteFill} />

            <SafeAreaView style={{ flex: 1 }}>
                {/* HEADER */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                        <Feather name="chevron-down" size={24} color="#FFF" />
                    </TouchableOpacity>
                    <View style={{ flex: 1, alignItems: 'center' }}>
                        <Text style={styles.headerTitle}>ESPRESSO MASTERY</Text>
                        <Text style={styles.headerSubtitle}>Chapter 1: The Basics</Text>
                    </View>
                    <TouchableOpacity style={styles.menuBtn}>
                        <Feather name="more-horizontal" size={24} color="#FFF" />
                    </TouchableOpacity>
                </View>

                {/* VIDEO PLAYER PLACEHOLDER */}
                <View style={styles.videoContainer}>
                    <LinearGradient
                        colors={['#374151', '#1F2937']}
                        style={styles.videoPlaceholder}
                    >
                        <MaterialCommunityIcons name="play-circle-outline" size={64} color="rgba(255,255,255,0.8)" />
                        <Text style={styles.videoDuration}>04:20</Text>
                    </LinearGradient>
                </View>

                {/* TABS */}
                <View style={styles.tabBar}>
                    <TabButton title="Transcript" active={activeTab === 'transcript'} onPress={() => setActiveTab('transcript')} />
                    <TabButton title="Quiz" active={activeTab === 'quiz'} onPress={() => setActiveTab('quiz')} />
                    <TabButton title="Resources" active={activeTab === 'resources'} onPress={() => setActiveTab('resources')} />
                </View>

                {/* CONTENT AREA */}
                <View style={styles.contentArea}>

                    {/* TRANSCRIPT VIEW */}
                    {activeTab === 'transcript' && (
                        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20 }}>
                            <Animated.Text entering={FadeInDown.delay(100)} style={styles.transcriptText}>
                                {MOCK_TRANSCRIPT}
                            </Animated.Text>
                        </ScrollView>
                    )}

                    {/* QUIZ VIEW */}
                    {activeTab === 'quiz' && (
                        <View style={styles.quizContainer}>
                            {!quizComplete ? (
                                <Animated.View entering={FadeInRight} key={currentQuizIdx} style={{ flex: 1 }}>
                                    <View style={styles.questionCounter}>
                                        <Text style={styles.counterText}>Question {currentQuizIdx + 1}/{MOCK_QUIZ.length}</Text>
                                    </View>
                                    <Text style={styles.questionText}>{MOCK_QUIZ[currentQuizIdx].question}</Text>

                                    {MOCK_QUIZ[currentQuizIdx].options.map((option, idx) => {
                                        const isSelected = selectedOption === idx;
                                        const isCorrect = idx === MOCK_QUIZ[currentQuizIdx].correct;

                                        let borderColor = '#374151';
                                        let bgColor = '#1F2937';
                                        if (isSelected) {
                                            borderColor = isCorrect ? '#10B981' : '#EF4444';
                                            bgColor = isCorrect ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)';
                                        }

                                        return (
                                            <TouchableOpacity
                                                key={idx}
                                                onPress={() => handleOptionSelect(idx)}
                                                disabled={selectedOption !== null}
                                                style={[styles.quizOption, { borderColor, backgroundColor: bgColor }]}
                                            >
                                                <Text style={[styles.quizOptionText, isSelected && { color: isCorrect ? '#10B981' : '#EF4444' }]}>
                                                    {option}
                                                </Text>
                                                {isSelected && (
                                                    <Feather name={isCorrect ? "check-circle" : "x-circle"} size={20} color={isCorrect ? '#10B981' : '#EF4444'} />
                                                )}
                                            </TouchableOpacity>
                                        )
                                    })}
                                </Animated.View>
                            ) : (
                                <View style={styles.quizResult}>
                                    <MaterialCommunityIcons name="trophy-outline" size={64} color="#FBBF24" />
                                    <Text style={styles.resultTitle}>Quiz Complete!</Text>
                                    <Text style={styles.resultScore}>You scored {quizScore}/{MOCK_QUIZ.length}</Text>
                                    <TouchableOpacity style={styles.restartBtn} onPress={() => {
                                        setQuizComplete(false);
                                        setCurrentQuizIdx(0);
                                        setQuizScore(0);
                                    }}>
                                        <Text style={styles.restartBtnText}>Retry Quiz</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>
                    )}

                    {/* RESOURCES VIEW */}
                    {activeTab === 'resources' && (
                        <ScrollView contentContainerStyle={{ padding: 20 }}>
                            <TouchableOpacity style={styles.resourceCard}>
                                <View style={styles.resourceIconBg}>
                                    <MaterialCommunityIcons name="file-pdf-box" size={24} color="#EF4444" />
                                </View>
                                <View>
                                    <Text style={styles.resourceTitle}>Espresso Cheat Sheet</Text>
                                    <Text style={styles.resourceSub}>PDF • 2.4 MB</Text>
                                </View>
                                <Feather name="download" size={20} color="#9CA3AF" style={{ marginLeft: 'auto' }} />
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.resourceCard}>
                                <View style={styles.resourceIconBg}>
                                    <MaterialCommunityIcons name="link-variant" size={24} color="#3B82F6" />
                                </View>
                                <View>
                                    <Text style={styles.resourceTitle}>Understanding Extraction</Text>
                                    <Text style={styles.resourceSub}>External Link</Text>
                                </View>
                                <Feather name="external-link" size={20} color="#9CA3AF" style={{ marginLeft: 'auto' }} />
                            </TouchableOpacity>
                        </ScrollView>
                    )}
                </View>

            </SafeAreaView>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: width,
        height: height,
        backgroundColor: '#111827',
        zIndex: 1000,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 15,
    },
    closeBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    menuBtn: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        color: '#FFF',
        fontSize: 14,
        fontFamily: 'Poppins_700Bold',
        letterSpacing: 1,
        color: '#FBBF24',
    },
    headerSubtitle: {
        color: '#FFF',
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
    },
    videoContainer: {
        width: width,
        height: width * 0.5625, // 16:9 Aspect Ratio
        backgroundColor: '#000',
    },
    videoPlaceholder: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    videoDuration: {
        position: 'absolute',
        bottom: 10,
        right: 10,
        backgroundColor: 'rgba(0,0,0,0.7)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
        color: '#FFF',
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
    },
    tabBar: {
        flexDirection: 'row',
        paddingHorizontal: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#374151',
    },
    tabBtn: {
        paddingVertical: 15,
        marginRight: 30,
        position: 'relative',
    },
    tabBtnText: {
        color: '#9CA3AF',
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
    },
    tabBtnActive: {
        // 
    },
    tabBtnTextActive: {
        color: '#FFF',
    },
    activeIndicator: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 3,
        backgroundColor: '#FBBF24',
        borderTopLeftRadius: 3,
        borderTopRightRadius: 3,
    },
    contentArea: {
        flex: 1,
    },
    transcriptText: {
        color: '#D1D5DB',
        fontSize: 16,
        fontFamily: 'Poppins_400Regular',
        lineHeight: 28,
    },
    // QUIZ STYLES
    quizContainer: {
        flex: 1,
        padding: 24,
    },
    questionCounter: {
        marginBottom: 10,
    },
    counterText: {
        color: '#FBBF24',
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 12,
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    questionText: {
        color: '#FFF',
        fontSize: 20,
        fontFamily: 'Poppins_600SemiBold',
        marginBottom: 30,
        lineHeight: 30,
    },
    quizOption: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 12,
    },
    quizOptionText: {
        color: '#E5E7EB',
        fontSize: 16,
        fontFamily: 'Poppins_500Medium',
        flex: 1,
    },
    quizResult: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    resultTitle: {
        color: '#FFF',
        fontSize: 24,
        fontFamily: 'Poppins_700Bold',
        marginTop: 20,
    },
    resultScore: {
        color: '#9CA3AF',
        fontSize: 16,
        fontFamily: 'Poppins_500Medium',
        marginTop: 8,
    },
    restartBtn: {
        marginTop: 40,
        paddingHorizontal: 30,
        paddingVertical: 12,
        backgroundColor: '#FBBF24',
        borderRadius: 25,
    },
    restartBtnText: {
        color: '#111827',
        fontFamily: 'Poppins_700Bold',
        fontSize: 16,
    },
    // RESOURCE STYLES
    resourceCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1F2937',
        padding: 16,
        borderRadius: 12,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#374151',
    },
    resourceIconBg: {
        width: 48,
        height: 48,
        borderRadius: 10,
        backgroundColor: '#374151',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    resourceTitle: {
        color: '#FFF',
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
    },
    resourceSub: {
        color: '#9CA3AF',
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
    },
});
