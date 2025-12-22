import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from 'react-native-reanimated';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';

const { width } = Dimensions.get('window');

const CARDS = [
    { id: 1, question: "What is the correct temperature for milk streaming?", answer: "65°C - 70°C" },
    { id: 2, question: "How often should you backflush the group head?", answer: "Every 20 minutes during busy shifts." },
];

export default function AIFlashcards({ onClose }) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);

    // Simple state-based implementation for now to avoid complex gesture deps issues in this snippet
    // In a full app, we'd use PanGestureHandler

    const handleNext = () => {
        setIsFlipped(false);
        if (currentIndex < CARDS.length - 1) {
            setCurrentIndex(prev => prev + 1);
        } else {
            setCurrentIndex(0); // Loop back
        }
    };

    const currentCard = CARDS[currentIndex];

    return (
        <View style={styles.container}>
            {/* HEADER */}
            <View style={styles.header}>
                <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                    <Feather name="arrow-left" size={24} color="#111827" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>AI Smart Cards</Text>
                <View style={{ width: 40 }} />
            </View>

            {/* CARD */}
            <View style={styles.cardContainer}>
                <TouchableOpacity activeOpacity={0.9} onPress={() => setIsFlipped(!isFlipped)} style={styles.cardWrapper}>
                    <LinearGradient
                        colors={isFlipped ? ['#4F46E5', '#4338CA'] : ['#FFF', '#FFF']}
                        style={[styles.card, isFlipped && styles.cardFlipped]}
                    >
                        {isFlipped ? (
                            <View style={styles.cardContent}>
                                <Text style={styles.answerLabel}>ANSWER</Text>
                                <Text style={styles.answerText}>{currentCard.answer}</Text>
                                <Feather name="check-circle" size={40} color="#FFF" style={styles.icon} />
                            </View>
                        ) : (
                            <View style={styles.cardContent}>
                                <Text style={styles.questionLabel}>QUESTION</Text>
                                <Text style={styles.questionText}>{currentCard.question}</Text>
                                <MaterialCommunityIcons name="help-circle-outline" size={60} color="#F59E0B" style={styles.icon} />
                            </View>
                        )}

                        <View style={styles.tapHint}>
                            <Text style={[styles.tapText, isFlipped && { color: 'rgba(255,255,255,0.7)' }]}>Tap to flip</Text>
                        </View>
                    </LinearGradient>
                </TouchableOpacity>
            </View>

            {/* CONTROLS */}
            <View style={styles.controls}>
                <TouchableOpacity style={[styles.btn, styles.rejectBtn]} onPress={handleNext}>
                    <Feather name="x" size={28} color="#EF4444" />
                </TouchableOpacity>
                <View style={styles.progress}>
                    <Text style={styles.progressText}>{currentIndex + 1} / {CARDS.length}</Text>
                </View>
                <TouchableOpacity style={[styles.btn, styles.acceptBtn]} onPress={handleNext}>
                    <Feather name="check" size={28} color="#10B981" />
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F3F4F6',
    },
    header: {
        paddingTop: 50,
        paddingBottom: 20,
        paddingHorizontal: 20,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    closeBtn: {
        padding: 10,
        backgroundColor: '#FFF',
        borderRadius: 12,
    },
    headerTitle: {
        fontSize: 18,
        fontFamily: 'Poppins_600SemiBold',
        color: '#111827',
    },
    cardContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    cardWrapper: {
        width: '100%',
        height: '70%',
    },
    card: {
        flex: 1,
        backgroundColor: '#FFF', // Default front
        borderRadius: 30,
        padding: 30,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 10,
    },
    cardFlipped: {
        // Background color handled by Gradient
    },
    cardContent: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    questionLabel: {
        color: '#9CA3AF',
        fontSize: 12,
        fontFamily: 'Poppins_700Bold',
        letterSpacing: 2,
        marginBottom: 20,
    },
    answerLabel: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 12,
        fontFamily: 'Poppins_700Bold',
        letterSpacing: 2,
        marginBottom: 20,
    },
    questionText: {
        fontSize: 24,
        fontFamily: 'Poppins_600SemiBold',
        color: '#111827',
        textAlign: 'center',
        marginBottom: 40,
    },
    answerText: {
        fontSize: 24,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
        textAlign: 'center',
        marginBottom: 40,
    },
    icon: {
        opacity: 0.8,
    },
    tapHint: {
        position: 'absolute',
        bottom: 30,
    },
    tapText: {
        color: '#9CA3AF',
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
    },
    controls: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 40,
        paddingBottom: 50,
    },
    btn: {
        width: 64,
        height: 64,
        borderRadius: 32,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#FFF',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 5,
    },
    rejectBtn: {
        borderWidth: 2,
        borderColor: '#EF4444',
    },
    acceptBtn: {
        borderWidth: 2,
        borderColor: '#10B981',
    },
    progress: {
        backgroundColor: '#FFF',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
    },
    progressText: {
        fontFamily: 'Poppins_600SemiBold',
        color: '#374151',
    },
});
