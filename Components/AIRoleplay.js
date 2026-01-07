import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Dimensions, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, StatusBar } from 'react-native';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp, FadeInRight, Layout } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';

// TODO: Move this to .env in production
import API_URL from '../config';
// const API_URL = "http://192.168.0.136:8000"; // Ensure this matches Home.js
const { width, height } = Dimensions.get('window');
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
            if (scenario) formData.append('scenario', scenario.id); // Future use

            const response = await fetch(`${API_URL}/ai/roleplay/voice`, {
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
            setMood(data.mood_score); // FIXED: mood -> mood_score

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
            const response = await fetch(`${API_URL}/ai/roleplay`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_text: newMsg.text,
                    history: chat
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

    const getMoodColor = (currentMood) => {
        if (currentMood < 40) return '#EF4444'; // Red for angry
        if (currentMood < 70) return '#F59E0B'; // Orange for annoyed
        return '#10B981'; // Green for satisfied
    };

    // --- START SESSION EFFECT ---
    useEffect(() => {
        const startSession = async () => {
            if (!scenario) return;
            setIsProcessing(true);
            try {
                const response = await fetch(`${API_URL}/ai/roleplay/start`, {
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
            {/* HEADER */}
            <BlurView intensity={20} tint="dark" style={[styles.header, { paddingTop: insets.top }]}>
                <TouchableOpacity onPress={onClose} style={styles.backBtn}>
                    <Feather name="arrow-left" size={24} color="#FFF" />
                </TouchableOpacity>
                <View style={{ alignItems: 'center' }}>
                    <Text style={styles.headerTitle}>{scenario ? scenario.title : "Simulation"}</Text>
                    <Text style={styles.headerSub}>AI Customer Training</Text>
                </View>
                <TouchableOpacity onPress={handleEndSession} style={styles.endBtn}>
                    <Text style={styles.endText}>End</Text>
                </TouchableOpacity>
            </BlurView>

            {/* AVATAR AREA */}
            <View style={styles.avatarContainer}>
                <View style={[styles.avatarCircle, { borderColor: getMoodColor(mood) }]}>
                    {/* Placeholder for real 3D avatar or image */}
                    <MaterialCommunityIcons
                        name={mood < 40 ? "emoticon-angry" : mood > 70 ? "emoticon-happy" : "emoticon-neutral"}
                        size={80}
                        color="#FFF"
                    />
                </View>
                <View style={styles.moodBadge}>
                    <Text style={styles.moodText}>{mood}% Satisfaction</Text>
                    <View style={[styles.moodBar, { width: `${mood}%`, backgroundColor: getMoodColor(mood) }]} />
                </View>
            </View>

            {/* CHAT AREA */}
            <ScrollView
                ref={scrollViewRef}
                style={styles.chatArea}
                contentContainerStyle={{ padding: 20 }}
                onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
            >
                {chat.map(msg => renderMsg(msg))}

                {isProcessing && (
                    <View style={styles.typingIndicator}>
                        <ActivityIndicator size="small" color="#FFF" />
                        <Text style={styles.typingText}>Customer is typing...</Text>
                    </View>
                )}
            </ScrollView>

            {/* INPUT AREA */}
            <View style={styles.controls}>
                <View style={styles.inputRow}>
                    <TextInput
                        style={styles.input}
                        placeholder="Type your response..."
                        placeholderTextColor="rgba(255,255,255,0.5)"
                        value={reply}
                        onChangeText={setReply}
                        editable={!isProcessing && !isRecording}
                    />
                    {reply.length > 0 ? (
                        <TouchableOpacity style={styles.sendBtn} onPress={handleSend}>
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
                <Text style={styles.hintText}>Hold mic to speak, or type your reply.</Text>
            </View>
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

    hintText: { color: "rgba(255,255,255,0.4)", fontSize: 12, textAlign: 'center', fontFamily: "Poppins_400Regular" }
});
