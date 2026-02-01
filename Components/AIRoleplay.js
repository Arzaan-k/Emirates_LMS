import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Dimensions, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, StatusBar } from 'react-native';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp, FadeInRight, Layout } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';

// TODO: Move this to .env in production
import API_URL from '../config';
// const API_URL = "http://172.20.10.2:8000:8000"; // Ensure this matches Home.js
const { width, height } = Dimensions.get('window');
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LanguageDisclaimerModal from './LanguageDisclaimerModal'; // [NEW] Disclaimer

// Mock initial data
const MESSAGES = [
    { id: 1, text: "[Angry] Arre bhai, meri waffle thandi hai! I want a refund now!", sender: 'ai', mood: 20 },
];

export default function AIRoleplay({ onClose, scenario }) {
    const insets = useSafeAreaInsets();
    const [mood, setMood] = useState(20); // 0-100
    const [reply, setReply] = useState('');
    const [chat, setChat] = useState(MESSAGES);
    const [recording, setRecording] = useState(null);
    const [isRecording, setIsRecording] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [resolutionProgress, setResolutionProgress] = useState(0); // 0-100 - How close to resolving

    // Audio Playback State
    const [playingMsgId, setPlayingMsgId] = useState(null);
    const soundRef = useRef(null);
    const scrollViewRef = useRef(null);

    useEffect(() => {
        const setupAudio = async () => {
            try {
                const { status } = await Audio.requestPermissionsAsync();
                if (status !== 'granted') {
                    Alert.alert("Permission Error", "Microphone permission is required.");
                }
                await Audio.setAudioModeAsync({
                    allowsRecordingIOS: true,
                    playsInSilentModeIOS: true,
                    shouldDuckAndroid: true,
                    playThroughEarpieceAndroid: false,
                    staysActiveInBackground: true,
                });
            } catch (e) {
                console.error("Audio Setup Error:", e);
                Alert.alert("Audio Setup Error", e.message);
            }
        };
        setupAudio();
    }, []);

    // --- PLAY AUDIO (User or AI) ---
    const playAudio = async (uri, msgId) => {
        try {
            console.log("Attempting to play:", uri);
            // Stop current if playing
            if (soundRef.current) {
                await soundRef.current.unloadAsync();
                soundRef.current = null;
                setPlayingMsgId(null);
            }

            // If clicking the same button, just stop
            if (playingMsgId === msgId) {
                return;
            }

            setPlayingMsgId(msgId);
            const { sound } = await Audio.Sound.createAsync(
                { uri: uri },
                { shouldPlay: true }
            );
            soundRef.current = sound;

            sound.setOnPlaybackStatusUpdate((status) => {
                if (status.didJustFinish) {
                    setPlayingMsgId(null);
                    soundRef.current = null;
                }
            });

        } catch (error) {
            console.error("Playback Error:", error);
            Alert.alert("Playback Error", error.message);
            setPlayingMsgId(null);
        }
    };

    // --- GENERATE & PLAY AI VOICE ---


    // --- RECORDING ---
    const recordingRef = useRef(null);

    // --- RECORDING ---
    const startRecording = async () => {
        try {
            // Safety check: Unload any existing
            if (recordingRef.current) {
                try {
                    await recordingRef.current.stopAndUnloadAsync();
                } catch (e) { /* ignore */ }
                recordingRef.current = null;
                setRecording(null);
            }

            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
            });
            const { recording } = await Audio.Recording.createAsync(
                Audio.RecordingOptionsPresets.HIGH_QUALITY
            );
            recordingRef.current = recording;
            setRecording(recording);
            setIsRecording(true);
        } catch (err) {
            console.error('Failed to start recording', err);
            Alert.alert("Recording Error", err.message);
        }
    };

    const stopRecording = async () => {
        if (!recordingRef.current) return;

        try {
            setIsRecording(false);
            const r = recordingRef.current;
            recordingRef.current = null;
            setRecording(null);

            await r.stopAndUnloadAsync();
            const uri = r.getURI();

            // Handle Voice Input
            handleSendWithAudio(uri);

        } catch (error) {
            console.error("Stop Recording Error:", error);
        }
    };

    // Helper to map scenario ID to backend context
    const getContext = () => {
        if (!scenario) return 'cold_waffle';
        if (scenario.id === 'confused') return 'payment_trouble';
        if (scenario.id === 'happy') return 'positive_feedback';
        return 'cold_waffle'; // Default/Angry
    };

    const handleSendWithAudio = async (uri) => {
        setIsProcessing(true);
        // Optimistic UI for voice
        const userMsgId = Date.now();
        const userMsg = { id: userMsgId, text: "🎤 Audio Message", sender: 'user', mood: mood };
        setChat(prev => [...prev, userMsg]);

        try {
            const formData = new FormData();
            formData.append('file', {
                uri: uri,
                type: 'audio/m4a', // or audio/mp4 depending on iOS/Android
                name: 'upload.m4a'
            });
            formData.append('history', JSON.stringify(chat));
            formData.append('context', getContext()); // Pass Context

            const response = await fetch(`${API_URL}/api/v1/roleplay/voice`, {
                method: 'POST',
                body: formData,
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });

            const data = await response.json();

            if (data.error) {
                Alert.alert("AI Error", data.error);
                setIsProcessing(false);
                return;
            }

            // Update user message with transcript AND scoring
            if (data.user_transcription) {
                setChat(prev => prev.map(msg =>
                    msg.id === userMsgId ? {
                        ...msg,
                        text: data.user_transcription,
                        score: data.user_score,
                        tip: data.improvement_tip // FIXED: tip -> improvement_tip
                    } : msg
                ));
            }

            const aiMsg = {
                id: Date.now() + 1,
                text: data.customer_response, // FIXED: text -> customer_response
                sender: 'ai',
                mood: data.mood_score, // FIXED: mood -> mood_score
                audio: data.audio_base64
            };

            setChat(prev => [...prev, aiMsg]);
            setMood(data.mood_score); // Update Customer Mood
            if (data.resolution_progress !== undefined) {
                setResolutionProgress(data.resolution_progress);
            }

            if (data.audio_base64) {
                // Use the existing playBase64Audio function
                playBase64Audio(data.audio_base64);
            }

        } catch (e) {
            console.error("Voice Upload Error:", e);
            Alert.alert("Upload Error", "Failed to send audio.");
        } finally {
            setIsProcessing(false);
        }
    };

    // --- SEND MESSAGE ---
    const handleSend = async () => {
        if (!reply.trim()) return;

        const newMsg = { id: Date.now(), text: reply, sender: 'user', mood: mood };
        const updatedChat = [...chat, newMsg];
        setChat(updatedChat);
        setReply('');
        setIsProcessing(true);

        try {
            // SEND TO BACKEND
            const response = await fetch(`${API_URL}/api/v1/roleplay`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_text: newMsg.text,
                    history: chat,
                    context: getContext() // Pass Context
                })
            });

            const data = await response.json();

            if (data.error) {
                Alert.alert("AI Error", data.error);
                setIsProcessing(false);
                return;
            }

            // ADD AI RESPONSE
            const aiMsg = {
                id: Date.now() + 1,
                text: data.customer_response, // FIXED: text -> customer_response
                sender: 'ai',
                mood: data.mood_score, // FIXED: mood -> mood_score
                audio: data.audio_base64 // Store base64 for playback
            };

            setChat(prev => [...prev, aiMsg]);
            setMood(data.mood_score); // Update Customer Mood
            if (data.resolution_progress !== undefined) {
                setResolutionProgress(data.resolution_progress);
            }

            // AUTO PLAY AUDIO
            if (data.audio_base64) {
                playBase64Audio(data.audio_base64);
            }

        } catch (error) {
            console.error("API Error:", error);
            Alert.alert("Error", "Failed to get AI response");
        } finally {
            setIsProcessing(false);
        }
    };

    const playBase64Audio = async (base64String) => {
        try {
            // Stop current if playing
            if (soundRef.current) {
                await soundRef.current.unloadAsync();
                soundRef.current = null;
                setPlayingMsgId(null);
            }

            // DIRECT PLAYBACK VIA DATA URI (No FileSystem needed)
            const uri = `data:audio/mp3;base64,${base64String}`;

            const { sound } = await Audio.Sound.createAsync(
                { uri },
                { shouldPlay: true }
            );
            soundRef.current = sound;

            sound.setOnPlaybackStatusUpdate((status) => {
                if (status.isLoaded && status.didJustFinish) {
                    setPlayingMsgId(null);
                    soundRef.current = null;
                }
            });

        } catch (e) {
            console.error("Audio Play Error", e);
            Alert.alert("Audio Playback Error", e.message);
            setPlayingMsgId(null);
        }
    };

    // --- DYNAMIC THEME BASED ON MOOD ---
    const getMoodTheme = (currentMood) => {
        if (currentMood < 40) {
            return {
                gradient: ['#1a0000', '#3d0000', '#1F2937'],
                accent: '#EF4444',
                emoji: '😠',
                bgOpacity: 0.15,
                label: 'Angry Customer',
                hint: 'Stay calm, show empathy'
            };
        }
        if (currentMood < 70) {
            return {
                gradient: ['#1a1400', '#3d2800', '#1F2937'],
                accent: '#F59E0B',
                emoji: '😐',
                bgOpacity: 0.12,
                label: 'Annoyed',
                hint: 'Keep listening'
            };
        }
        return {
            gradient: ['#001a10', '#003d20', '#1F2937'],
            accent: '#10B981',
            emoji: '😊',
            bgOpacity: 0.10,
            label: 'Satisfied',
            hint: 'Great work!'
        };
    };

    const getMoodColor = (currentMood) => {
        if (currentMood < 40) return '#EF4444'; // Red for angry
        if (currentMood < 70) return '#F59E0B'; // Orange for annoyed
        return '#10B981'; // Green for satisfied
    };

    const theme = getMoodTheme(mood);

    // --- START SESSION EFFECT ---
    useEffect(() => {
        const startSession = async () => {
            if (!scenario) return;
            setIsProcessing(true);
            try {
                const response = await fetch(`${API_URL}/api/v1/roleplay/start`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ scenario_id: scenario.id })
                });
                const data = await response.json();

                // Overwrite initial message
                const newInitial = {
                    id: Date.now(),
                    text: data.customer_response || data.text, // FIXED: Handle both keys
                    sender: 'ai',
                    mood: data.mood,
                    audio: data.audio_base64
                };
                setChat([newInitial]);
                setMood(data.mood);

                if (data.audio_base64) {
                    setTimeout(() => playBase64Audio(data.audio_base64), 500); // Small delay for UX
                }
            } catch (e) {
                console.error("Start Session Error", e);
            } finally {
                setIsProcessing(false);
            }
        };
        startSession();
    }, [scenario]);

    // --- END SESSION ---
    const handleEndSession = () => {
        // Calculate average score
        const userMsgs = chat.filter(m => m.sender === 'user' && m.score !== undefined);
        const avgScore = userMsgs.length > 0
            ? Math.round(userMsgs.reduce((acc, curr) => acc + curr.score, 0) / userMsgs.length)
            : 0; // If no interaction, 0

        let grade = "C";
        if (avgScore >= 90) grade = "A+";
        else if (avgScore >= 80) grade = "A";
        else if (avgScore >= 70) grade = "B";
        else if (avgScore >= 60) grade = "C";
        else grade = "D";

        Alert.alert(
            "Session Ended",
            `Final Grade: ${grade}\nAverage Score: ${avgScore}/100\n\nGreat practice! Check History for details.`,
            [{ text: "OK", onPress: onClose }]
        );
    };

    // --- RENDER ---
    const renderMsg = (item) => (
        <Animated.View
            key={item.id}
            entering={FadeInUp.delay(100)}
            style={[styles.msgBubble, item.sender === 'user' ? styles.userBubble : styles.aiBubble]}
        >
            <Text style={[styles.msgText, item.sender === 'user' ? styles.userText : styles.aiText]}>{item.text}</Text>

            {/* Coach Tip & Score */}
            {item.sender === 'user' && item.score !== undefined && (
                <View style={styles.tipContainer}>
                    <View style={styles.scoreBadgeSmall}>
                        <Text style={styles.scoreTextSmall}>{item.score}</Text>
                    </View>
                    <Text style={styles.tipLabel}>COACH TIP:</Text>
                    <Text style={styles.tipText}>{item.tip}</Text>
                </View>
            )}

            {/* AI Audio Play Button */}
            {item.audio && (
                <TouchableOpacity onPress={() => playBase64Audio(item.audio)} style={styles.audioBtn}>
                    <Ionicons name={playingMsgId === item.audio ? "pause-circle" : "play-circle"} size={16} color="rgba(255,255,255,0.7)" />
                    <Text style={{ marginLeft: 6, color: 'rgba(255,255,255,0.6)', fontSize: 10 }}>
                        {playingMsgId === item.audio ? "Playing..." : "Replay Voice"}
                    </Text>
                </TouchableOpacity>
            )}
        </Animated.View>
    );

    return (
        <View style={styles.container}>
            {/* DYNAMIC GRADIENT BACKGROUND */}
            <LinearGradient
                colors={theme.gradient}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
            />

            {/* GHOST WAFFLE DECORATIONS */}
            <View style={styles.ghostContainer} pointerEvents="none">
                <Animated.Text
                    entering={FadeInUp.delay(100)}
                    style={[styles.ghostWaffle, { top: '8%', left: '5%', opacity: theme.bgOpacity, transform: [{ rotate: '-15deg' }] }]}
                >🧇</Animated.Text>
                <Animated.Text
                    entering={FadeInUp.delay(200)}
                    style={[styles.ghostWaffle, { top: '12%', right: '8%', opacity: theme.bgOpacity, transform: [{ rotate: '20deg' }], fontSize: 32 }]}
                >🧇</Animated.Text>
                <Animated.Text
                    entering={FadeInUp.delay(300)}
                    style={[styles.ghostWaffle, { bottom: '25%', left: '3%', opacity: theme.bgOpacity, transform: [{ rotate: '10deg' }] }]}
                >🧇</Animated.Text>
                <Animated.Text
                    entering={FadeInUp.delay(400)}
                    style={[styles.ghostWaffle, { bottom: '15%', right: '5%', opacity: theme.bgOpacity, transform: [{ rotate: '-25deg' }], fontSize: 28 }]}
                >🧇</Animated.Text>
            </View>

            {/* PREMIUM HEADER */}
            <BlurView intensity={30} tint="dark" style={[styles.header, { paddingTop: insets.top }]}>
                <TouchableOpacity onPress={onClose} style={styles.backBtn}>
                    <Feather name="arrow-left" size={24} color="#FFF" />
                </TouchableOpacity>
                <View style={{ alignItems: 'center' }}>
                    {/* Brand Badge */}
                    <View style={styles.brandBadge}>
                        <Text style={styles.brandEmoji}>🧇</Text>
                        <Text style={styles.brandText}>Belgian Waffle Co.</Text>
                    </View>
                    <Text style={styles.headerTitle}>{scenario ? scenario.title : "Customer Simulation"}</Text>
                    {/* Mood Status Pill */}
                    <View style={[styles.moodPill, { backgroundColor: `${theme.accent}20`, borderColor: theme.accent }]}>
                        <Text style={styles.moodEmoji}>{theme.emoji}</Text>
                        <Text style={[styles.moodPillText, { color: theme.accent }]}>{theme.label}</Text>
                    </View>
                </View>
                <TouchableOpacity onPress={handleEndSession} style={styles.endBtn}>
                    <Text style={styles.endText}>End</Text>
                </TouchableOpacity>
            </BlurView>

            {/* AVATAR AREA */}
            <View style={styles.avatarContainer}>
                {/* Avatar with Dynamic Glow */}
                <View style={[styles.avatarGlow, { shadowColor: theme.accent }]}>
                    <View style={[styles.avatarCircle, { borderColor: theme.accent }]}>
                        <Text style={styles.avatarEmoji}>{theme.emoji}</Text>
                    </View>
                </View>

                {/* Satisfaction Meter */}
                <View style={styles.meterContainer}>
                    <View style={styles.meterHeader}>
                        <Text style={styles.meterLabel}>Customer Satisfaction</Text>
                        <Text style={[styles.meterValue, { color: theme.accent }]}>{mood}%</Text>
                    </View>
                    <View style={styles.meterBarBg}>
                        <Animated.View
                            style={[styles.meterBarFill, { width: `${mood}%`, backgroundColor: theme.accent }]}
                        />
                    </View>
                </View>

                {/* Resolution Progress */}
                <View style={styles.resolutionContainer}>
                    <View style={styles.resolutionHeader}>
                        <Text style={styles.resolutionLabel}>🎯 Resolution Progress</Text>
                        <Text style={[styles.resolutionPercent, { color: resolutionProgress > 70 ? '#10B981' : resolutionProgress > 40 ? '#F59E0B' : '#EF4444' }]}>
                            {resolutionProgress}%
                        </Text>
                    </View>
                    <View style={styles.resolutionBarBg}>
                        <Animated.View
                            style={[
                                styles.resolutionBarFill,
                                {
                                    width: `${resolutionProgress}%`,
                                    backgroundColor: resolutionProgress > 70 ? '#10B981' : resolutionProgress > 40 ? '#F59E0B' : '#EF4444'
                                }
                            ]}
                        />
                    </View>
                    <Text style={styles.resolutionHint}>
                        {resolutionProgress < 30 ? '💡 Acknowledge the issue first' :
                            resolutionProgress < 60 ? '💡 Offer a solution' :
                                resolutionProgress < 90 ? '💡 Almost there! Confirm resolution' : '🎉 Issue resolved!'}
                    </Text>
                </View>
            </View>

            {/* CHAT AREA */}
            <ScrollView
                ref={scrollViewRef}
                style={styles.chatArea}
                contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
                onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
            >
                {chat.map(msg => renderMsg(msg))}

                {isProcessing && (
                    <View style={styles.typingIndicator}>
                        <View style={styles.typingDots}>
                            <Animated.View entering={FadeInUp.delay(0).duration(500)} style={styles.typingDot} />
                            <Animated.View entering={FadeInUp.delay(100).duration(500)} style={styles.typingDot} />
                            <Animated.View entering={FadeInUp.delay(200).duration(500)} style={styles.typingDot} />
                        </View>
                        <Text style={styles.typingText}>Customer is responding...</Text>
                    </View>
                )}
            </ScrollView>

            {/* PREMIUM INPUT AREA */}
            <BlurView intensity={40} tint="dark" style={styles.controls}>
                <View style={styles.inputRow}>
                    <TextInput
                        style={styles.input}
                        placeholder="Type your response to the customer..."
                        placeholderTextColor="rgba(255,255,255,0.4)"
                        value={reply}
                        onChangeText={setReply}
                        editable={!isProcessing && !isRecording}
                        multiline
                    />
                    {reply.length > 0 ? (
                        <TouchableOpacity style={[styles.sendBtn, { backgroundColor: theme.accent }]} onPress={handleSend}>
                            <Feather name="send" size={20} color="#FFF" />
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity
                            style={[styles.micBtn, isRecording && styles.micActive]}
                            onPressIn={startRecording}
                            onPressOut={stopRecording}
                            disabled={isProcessing}
                        >
                            <Feather name="mic" size={24} color="#FFF" />
                        </TouchableOpacity>
                    )}
                </View>
                <Text style={styles.hintText}>
                    {isRecording ? '🎤 Recording... Release to send' : '💬 Type or hold mic to speak'}
                </Text>
            </BlurView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1F2937', // Darker background
    },
    closeBtn: {
        padding: 8,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 12,
    },
    avatarContainer: { alignItems: 'center', marginVertical: 20, marginTop: 100 },

    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 20, position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
    headerTitle: { color: '#FFF', fontSize: 18, fontFamily: 'Poppins_700Bold' },
    headerSub: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontFamily: 'Poppins_500Medium' },
    backBtn: { padding: 8, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)' },
    endBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: 'rgba(239, 68, 68, 0.2)', borderWidth: 1, borderColor: '#EF4444' },
    endText: { color: '#EF4444', fontSize: 12, fontFamily: 'Poppins_600SemiBold' },

    avatarCircle: { width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center', borderWidth: 3 },
    moodBadge: { marginTop: 10, alignItems: 'center' },
    moodText: { color: "#FFF", fontSize: 14, fontFamily: "Poppins_600SemiBold", marginBottom: 4 },
    moodBar: { height: 4, borderRadius: 2 },

    moodContainer: { marginBottom: 20 },
    moodHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    moodLabel: { color: "rgba(255,255,255,0.7)", fontFamily: "Poppins_500Medium" },
    moodScore: { fontFamily: "Poppins_700Bold" },
    moodBarBg: { height: 8, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
    moodBarFill: { height: '100%', borderRadius: 4 },
    moodHint: { color: "rgba(255,255,255,0.5)", fontSize: 11, fontFamily: "Poppins_400Regular" },

    chatArea: { flex: 1 },
    msgBubble: { padding: 12, borderRadius: 16, marginBottom: 12, maxWidth: '85%' },
    userBubble: { backgroundColor: '#4F46E5', alignSelf: 'flex-end', borderBottomRightRadius: 4 },
    aiBubble: { backgroundColor: 'rgba(255,255,255,0.1)', alignSelf: 'flex-start', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
    msgText: { color: '#FFF', fontSize: 14, lineHeight: 20, fontFamily: "Poppins_400Regular" },

    // New Styles for Tips
    tipContainer: { marginTop: 8, backgroundColor: 'rgba(0,0,0,0.2)', padding: 8, borderRadius: 8, borderLeftWidth: 3, borderLeftColor: '#FCD34D' },
    tipLabel: { color: '#FCD34D', fontSize: 10, fontFamily: 'Poppins_700Bold', marginBottom: 2 },
    tipText: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontFamily: 'Poppins_400Regular' },
    scoreBadgeSmall: { position: 'absolute', top: -10, right: -10, backgroundColor: '#10B981', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, borderWidth: 2, borderColor: '#1E293B' },
    scoreTextSmall: { color: '#FFF', fontSize: 10, fontFamily: 'Poppins_700Bold' },

    userText: { color: '#FFF' },
    aiText: { color: '#E2E8F0' },

    audioBtn: { marginTop: 8, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, alignSelf: 'flex-start' },
    playText: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontFamily: "Poppins_500Medium" },

    typingIndicator: { flexDirection: 'row', alignItems: 'center', marginLeft: 10, marginTop: 10 },
    typingText: { color: "rgba(255,255,255,0.5)", fontSize: 12, marginLeft: 8 },

    controls: { padding: 20, backgroundColor: 'rgba(0,0,0,0.3)', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
    inputRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    input: { flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 25, paddingHorizontal: 16, paddingVertical: 12, color: '#FFF', fontFamily: "Poppins_400Regular", marginRight: 12 },
    micBtn: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
    micActive: { backgroundColor: '#EF4444' },
    sendBtn: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#4F46E5', justifyContent: 'center', alignItems: 'center' },

    hintText: { color: "rgba(255,255,255,0.5)", fontSize: 12, textAlign: 'center', fontFamily: "Poppins_400Regular" },

    // Ghost Waffle Decorations
    ghostContainer: { ...StyleSheet.absoluteFillObject, overflow: 'hidden', zIndex: 0 },
    ghostWaffle: { position: 'absolute', fontSize: 40 },

    // Brand Badge
    brandBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(245, 158, 11, 0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginBottom: 6 },
    brandEmoji: { fontSize: 14, marginRight: 4 },
    brandText: { color: '#F59E0B', fontSize: 10, fontFamily: 'Poppins_600SemiBold', letterSpacing: 0.5 },

    // Mood Status Pill
    moodPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, marginTop: 6 },
    moodEmoji: { fontSize: 12, marginRight: 4 },
    moodPillText: { fontSize: 10, fontFamily: 'Poppins_600SemiBold' },

    // Avatar with Glow
    avatarGlow: { shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 20, elevation: 15 },
    avatarEmoji: { fontSize: 60 },

    // Satisfaction Meter
    meterContainer: { marginTop: 16, width: '85%', backgroundColor: 'rgba(0,0,0,0.4)', padding: 14, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    meterHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    meterLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontFamily: 'Poppins_500Medium' },
    meterValue: { fontSize: 18, fontFamily: 'Poppins_700Bold' },
    meterBarBg: { height: 10, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 5, overflow: 'hidden' },
    meterBarFill: { height: '100%', borderRadius: 5 },

    // Resolution Progress Bar
    resolutionContainer: { marginTop: 12, width: '85%', backgroundColor: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 14 },
    resolutionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    resolutionLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontFamily: 'Poppins_500Medium' },
    resolutionPercent: { fontSize: 13, fontFamily: 'Poppins_700Bold' },
    resolutionBarBg: { height: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' },
    resolutionBarFill: { height: '100%', borderRadius: 3 },
    resolutionHint: { color: 'rgba(255,255,255,0.5)', fontSize: 10, fontFamily: 'Poppins_400Regular', marginTop: 6, textAlign: 'center' },

    // Typing Indicator
    typingDots: { flexDirection: 'row', marginRight: 8 },
    typingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.5)', marginHorizontal: 2 },
});
