import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Dimensions } from 'react-native';
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp } from 'react-native-reanimated';

const { width } = Dimensions.get('window');

const MESSAGES = [
    { id: 1, text: "Excuse me, my waffle is cold and this coffee tastes burnt. I want a refund immediately!", sender: 'ai', mood: 20 },
];

export default function AIRoleplay({ onClose }) {
    const [mood, setMood] = useState(20); // 0-100
    const [reply, setReply] = useState('');

    return (
        <View style={styles.container}>
            {/* HEADER */}
            <View style={styles.header}>
                <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                    <Feather name="x" size={24} color="#FFF" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Customer Sim</Text>
                <View style={styles.liveBadge}>
                    <View style={styles.dot} />
                    <Text style={styles.liveText}>LIVE SCENARIO</Text>
                </View>
            </View>

            {/* MOOD METER */}
            <View style={styles.moodSection}>
                <Text style={styles.moodTitle}>Customer Mood</Text>
                <View style={styles.moodBarBg}>
                    <LinearGradient
                        colors={mood < 30 ? ['#EF4444', '#F87171'] : ['#10B981', '#34D399']}
                        style={[styles.moodBarFill, { width: `${mood}%` }]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                    />
                </View>
                <Text style={styles.moodStatus}>{mood < 30 ? "Angry 😡" : "Happy 😊"}</Text>
            </View>

            {/* CHAT AREA */}
            <ScrollView contentContainerStyle={styles.chatContainer}>
                {MESSAGES.map((msg) => (
                    <Animated.View entering={FadeInUp} key={msg.id} style={[styles.msgWrapper, msg.sender === 'ai' ? styles.aiMsg : styles.userMsg]}>
                        {msg.sender === 'ai' && (
                            <View style={styles.aiAvatar}>
                                <MaterialCommunityIcons name="robot-angry" size={24} color="#FFF" />
                            </View>
                        )}
                        <View style={[styles.bubble, msg.sender === 'ai' ? styles.aiBubble : styles.userBubble]}>
                            <Text style={[styles.msgText, msg.sender === 'user' && { color: '#FFF' }]}>{msg.text}</Text>
                        </View>
                    </Animated.View>
                ))}
            </ScrollView>

            {/* INPUT AREA */}
            <View style={styles.inputArea}>
                <View style={styles.inputWrapper}>
                    <TextInput
                        style={styles.input}
                        placeholder="Type your response..."
                        placeholderTextColor="#9CA3AF"
                        value={reply}
                        onChangeText={setReply}
                    />
                    <TouchableOpacity style={styles.sendBtn}>
                        <Feather name="send" size={20} color="#FFF" />
                    </TouchableOpacity>
                </View>
                <View style={styles.hints}>
                    <Text style={styles.hintText}>💡 Tip: Empathize first, then offer a solution.</Text>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F9FAFB',
    },
    header: {
        backgroundColor: '#111827',
        paddingTop: 50,
        paddingBottom: 20,
        paddingHorizontal: 20,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    closeBtn: {
        padding: 8,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 12,
    },
    headerTitle: {
        color: '#FFF',
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
    },
    liveBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#EF4444',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#FFF',
        marginRight: 4,
    },
    liveText: {
        color: '#FFF',
        fontSize: 10,
        fontFamily: 'Poppins_700Bold',
    },
    // MOOD
    moodSection: {
        backgroundColor: '#FFF',
        padding: 20,
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 5,
        zIndex: 10,
    },
    moodTitle: {
        fontSize: 12,
        color: '#6B7280',
        marginBottom: 8,
        fontFamily: 'Poppins_600SemiBold',
        textAlign: 'center',
    },
    moodBarBg: {
        height: 12,
        backgroundColor: '#F3F4F6',
        borderRadius: 6,
        overflow: 'hidden',
        marginBottom: 8,
    },
    moodBarFill: {
        height: '100%',
        borderRadius: 6,
    },
    moodStatus: {
        textAlign: 'center',
        fontSize: 14,
        fontFamily: 'Poppins_700Bold',
        color: '#111827',
    },
    // CHAT
    chatContainer: {
        padding: 20,
        paddingBottom: 100,
    },
    msgWrapper: {
        marginBottom: 20,
        flexDirection: 'row',
        maxWidth: '85%',
    },
    aiMsg: {
        alignSelf: 'flex-start',
    },
    userMsg: {
        alignSelf: 'flex-end',
        justifyContent: 'flex-end',
    },
    aiAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#F87171',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10,
    },
    bubble: {
        padding: 16,
        borderRadius: 20,
    },
    aiBubble: {
        backgroundColor: '#FFF',
        borderTopLeftRadius: 4,
    },
    userBubble: {
        backgroundColor: '#4F46E5',
        borderBottomRightRadius: 4,
    },
    msgText: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        color: '#374151',
        lineHeight: 22,
    },
    // INPUT
    inputArea: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#FFF',
        padding: 20,
        borderTopWidth: 1,
        borderTopColor: '#F3F4F6',
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F9FAFB',
        borderRadius: 16,
        paddingHorizontal: 16,
        height: 56,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    input: {
        flex: 1,
        height: '100%',
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        color: '#111827',
    },
    sendBtn: {
        backgroundColor: '#4F46E5',
        width: 40,
        height: 40,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    hints: {
        marginTop: 10,
        alignItems: 'center',
    },
    hintText: {
        fontSize: 11,
        color: '#9CA3AF',
        fontStyle: 'italic',
    },
});
