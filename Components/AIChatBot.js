//AICHATBOT.JS

import React, { useState, useEffect, useRef } from "react";
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    KeyboardAvoidingView,
    Platform,
    Dimensions,
    Animated,
    Easing,
    ScrollView,
    ActivityIndicator,
} from "react-native";
import { BlurView } from "expo-blur";
import { MaterialCommunityIcons, Feather, Ionicons, FontAwesome5 } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Audio } from 'expo-av';
import API_URL from '../config';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { height, width } = Dimensions.get("window");

// Voice Skills
const VOICE_SKILLS = [
    { id: 'daily', title: "Daily Briefing", icon: "sun", color: ["#F59E0B", "#D97706"] },
    { id: 'roleplay', title: 'Angry Customer', icon: "theater-masks", color: ["#EF4444", "#B91C1C"] },
    { id: 'quiz', title: "SOP Quiz", icon: "clipboard-list", color: ["#10B981", "#059669"] },
    { id: 'timer', title: "Timer", icon: "stopwatch", color: ["#6366F1", "#4F46E5"] },
];

// Default suggestions (will be replaced by dynamic ones from API)
const DEFAULT_SUGGESTIONS = [
    "What is the Batter Recipe?",
    "Check Opening SOPs",
    "Iron Temperature?",
    "Cleaning Schedule",
];

export default function AIChatBot() {
    const insets = useSafeAreaInsets();
    const [isOpen, setIsOpen] = useState(false);
    const [isVoiceMode, setIsVoiceMode] = useState(false);
    const [voiceState, setVoiceState] = useState("idle"); // idle, listening, processing, speaking
    const [inputText, setInputText] = useState("");
    const [messages, setMessages] = useState([
        {
            id: 1,
            text: "Hello! I'm your BWC AI Assistant 🧇\n\nI can help you with:\n• Training courses & learning paths\n• SOPs & recipes\n• Equipment & safety protocols\n• Store operations\n\nAsk me anything!",
            sender: "ai",
            status: "done",
        },
    ]);
    const [aiState, setAiState] = useState("idle"); // idle, thinking, typing
    const [suggestedQuestions, setSuggestedQuestions] = useState(DEFAULT_SUGGESTIONS);
    const scrollViewRef = useRef(null);

    // Animation Values
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const voicePulseAnim = useRef(new Animated.Value(1)).current;
    const slideAnim = useRef(new Animated.Value(height)).current;

    // Fetch dynamic suggestions on mount
    useEffect(() => {
        fetchSuggestedQuestions();
    }, []);

    const fetchSuggestedQuestions = async () => {
        try {
            const res = await fetch(`${API_URL}/ai/suggested-questions`);
            const data = await res.json();
            if (data.suggestions && data.suggestions.length > 0) {
                setSuggestedQuestions(data.suggestions);
            }
        } catch (err) {
            console.log("Using default suggestions");
        }
    };

    // Voice Waveform Animation
    useEffect(() => {
        if (isVoiceMode && voiceState === 'listening') {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(voicePulseAnim, { toValue: 1.5, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                    Animated.timing(voicePulseAnim, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                ])
            ).start();
        } else {
            voicePulseAnim.setValue(1);
        }
    }, [isVoiceMode, voiceState]);

    useEffect(() => {
        if (!isOpen) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, { toValue: 1.1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                    Animated.timing(pulseAnim, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                ])
            ).start();
        } else {
            pulseAnim.setValue(1);
        }
    }, [isOpen]);

    useEffect(() => {
        Animated.timing(slideAnim, {
            toValue: isOpen ? 0 : height,
            duration: 300,
            easing: Easing.out(Easing.poly(4)),
            useNativeDriver: true,
        }).start();
    }, [isOpen]);

    // Scroll to bottom when messages change
    useEffect(() => {
        if (scrollViewRef.current) {
            setTimeout(() => {
                scrollViewRef.current?.scrollToEnd({ animated: true });
            }, 100);
        }
    }, [messages]);

    const handleSend = async (text = inputText) => {
        if (!text.trim()) return;

        const userMsg = { id: Date.now(), text: text.trim(), sender: "user", status: "done" };
        setMessages((prev) => [...prev, userMsg]);
        setInputText("");
        setAiState("thinking");

        try {
            // Build history for context
            const historyForAPI = messages.slice(-10).map(m => ({
                text: m.text,
                sender: m.sender
            }));

            const formData = new FormData();
            formData.append('message', text.trim());
            formData.append('history', JSON.stringify(historyForAPI));

            const response = await fetch(`${API_URL}/ai/chatbot`, {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();

            setAiState("typing");

            // Small delay for typing effect
            await new Promise(resolve => setTimeout(resolve, 500));

            if (data.status === 'success') {
                const aiMsg = {
                    id: Date.now() + 1,
                    text: data.response,
                    sender: "ai",
                    status: "done",
                    isInternal: data.is_internal,
                    sourcesFound: data.sources_found || 0,
                };
                setMessages((prev) => [...prev, aiMsg]);
            } else {
                // Error response
                setMessages((prev) => [...prev, {
                    id: Date.now() + 1,
                    text: data.response || "Sorry, I couldn't process that. Please try again. 🔄",
                    sender: "ai",
                    status: "done",
                }]);
            }
        } catch (error) {
            console.error("AI Chat Error:", error);
            setMessages((prev) => [...prev, {
                id: Date.now() + 1,
                text: "I'm having trouble connecting to the server. Please check your connection and try again. 📡",
                sender: "ai",
                status: "done",
            }]);
        } finally {
            setAiState("idle");
        }
    };

    // --- VOICE LOGIC ---
    const [recording, setRecording] = useState(null);

    const startRecording = async () => {
        try {
            const permission = await Audio.requestPermissionsAsync();
            if (permission.status === "granted") {
                await Audio.setAudioModeAsync({
                    allowsRecordingIOS: true,
                    playsInSilentModeIOS: true,
                });
                const { recording } = await Audio.Recording.createAsync(
                    Audio.RecordingOptionsPresets.HIGH_QUALITY
                );
                setRecording(recording);
                setVoiceState("listening");
            } else {
                setMessages(prev => [...prev, {
                    id: Date.now(),
                    text: "🎤 Microphone permission is required for voice input.",
                    sender: "ai",
                    status: "done"
                }]);
            }
        } catch (err) {
            console.error('Failed to start recording', err);
        }
    };

    const stopRecording = async () => {
        if (!recording) return;
        setVoiceState("processing");
        await recording.stopAndUnloadAsync();
        const uri = recording.getURI();
        setRecording(null);
        handleVoiceUpload(uri);
    };

    const handleVoiceUpload = async (uri) => {
        try {
            const formData = new FormData();
            formData.append('file', {
                uri: uri,
                type: 'audio/m4a',
                name: 'voice_query.m4a'
            });

            const res = await fetch(`${API_URL}/ai/voice_query`, {
                method: 'POST',
                body: formData
            });

            const data = await res.json();
            if (data.status === 'success') {
                // Add User's Transcribed Text
                setMessages(prev => [...prev, {
                    id: Date.now(),
                    text: `🎤 ${data.user_text}`,
                    sender: "user",
                    status: "done"
                }]);

                // Add AI Response
                setVoiceState("speaking");
                setTimeout(() => {
                    setMessages(prev => [...prev, {
                        id: Date.now() + 1,
                        text: data.ai_response,
                        sender: "ai",
                        status: "done"
                    }]);

                    // Close Voice Mode to show chat
                    setIsVoiceMode(false);
                    setVoiceState("idle");
                }, 1000);
            } else {
                setVoiceState("idle");
                setMessages(prev => [...prev, {
                    id: Date.now(),
                    text: "Sorry, I couldn't understand that. Please try again. 🎤",
                    sender: "ai",
                    status: "done"
                }]);
                setIsVoiceMode(false);
            }
        } catch (e) {
            console.error("Voice Upload Error:", e);
            setVoiceState("idle");
            setMessages(prev => [...prev, {
                id: Date.now(),
                text: "Network error. Please check your connection and try again. 📡",
                sender: "ai",
                status: "done"
            }]);
            setIsVoiceMode(false);
        }
    };

    const toggleVoiceMode = () => {
        setIsVoiceMode(!isVoiceMode);
        if (!isVoiceMode) {
            setVoiceState("idle");
        } else {
            if (recording) stopRecording();
        }
    };

    const onMicPress = () => {
        if (voiceState === 'listening' || recording) {
            stopRecording();
        } else {
            startRecording();
        }
    };

    const onVoiceSkillPress = (skill) => {
        // Send skill-specific query
        const skillQueries = {
            'daily': "Give me today's daily briefing and important tasks",
            'roleplay': "Let's practice handling an angry customer scenario",
            'quiz': "Quiz me on the standard operating procedures",
            'timer': "Set a 4 minute timer for waffle baking",
        };

        const query = skillQueries[skill.id] || `Tell me about ${skill.title}`;
        setIsVoiceMode(false);
        handleSend(query);
    };

    const clearChat = () => {
        setMessages([{
            id: Date.now(),
            text: "Chat cleared! 🧹 How can I help you today?",
            sender: "ai",
            status: "done",
        }]);
    };

    // Render message with markdown-like formatting
    const renderMessageText = (text) => {
        // Split by newlines and process
        return text.split('\n').map((line, lineIndex) => {
            // Bold text **text**
            const parts = line.split(/(\*\*[^*]+\*\*)/g);
            return (
                <Text key={lineIndex} style={{ marginBottom: 2 }}>
                    {parts.map((part, partIndex) => {
                        if (part.startsWith('**') && part.endsWith('**')) {
                            return (
                                <Text key={partIndex} style={{ fontWeight: 'bold' }}>
                                    {part.slice(2, -2)}
                                </Text>
                            );
                        }
                        return part;
                    })}
                    {lineIndex < text.split('\n').length - 1 ? '\n' : ''}
                </Text>
            );
        });
    };

    return (
        <>
            {/* GLOBAL FAB */}
            {!isOpen && (
                <Animated.View style={[styles.fabContainer, { transform: [{ scale: pulseAnim }] }]}>
                    <TouchableOpacity style={styles.fab} onPress={() => setIsOpen(true)} activeOpacity={0.8}>
                        <LinearGradient colors={["#6366F1", "#A855F7"]} style={styles.fabGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                            <MaterialCommunityIcons name="robot-happy" size={28} color="#FFF" />
                        </LinearGradient>
                    </TouchableOpacity>
                </Animated.View>
            )}

            {/* MAIN OVERLAY */}
            <Animated.View style={[styles.overlayContainer, { transform: [{ translateY: slideAnim }] }]}>
                {isVoiceMode ? (
                    // ---------------- VOICE MODE UI ----------------
                    <LinearGradient colors={["#0F172A", "#1E1B4B", "#000"]} style={styles.voiceContainer}>

                        {/* HEADER */}
                        <View style={[styles.voiceHeader, { paddingTop: insets.top }]}>
                            <TouchableOpacity onPress={() => setIsVoiceMode(false)} style={styles.voiceCloseBtn}>
                                <Feather name="arrow-left" size={24} color="#FFF" />
                            </TouchableOpacity>
                            <Text style={styles.voiceHeaderTitle}>Voice Trainer</Text>
                            <View style={{ width: 24 }} />
                        </View>

                        {/* VISUALIZER */}
                        <View style={styles.voiceVisualizerContainer}>
                            <Animated.View style={[styles.voiceOrbOuter, { transform: [{ scale: voicePulseAnim }] }]} />
                            <TouchableOpacity style={styles.voiceOrbInner} onPress={onMicPress}>
                                <LinearGradient
                                    colors={voiceState === 'listening' || recording ? ["#EF4444", "#B91C1C"] : ["#6366F1", "#A855F7"]}
                                    style={styles.voiceOrbGradient}
                                >
                                    {voiceState === 'processing' ? (
                                        <ActivityIndicator color="#FFF" size="large" />
                                    ) : (
                                        <MaterialCommunityIcons
                                            name={recording ? "stop" : "microphone"}
                                            size={40}
                                            color="#FFF"
                                        />
                                    )}
                                </LinearGradient>
                            </TouchableOpacity>
                            <Text style={styles.voiceStatusText}>
                                {voiceState === "listening" || recording ? "Listening..." :
                                    voiceState === "processing" ? "Processing..." :
                                        voiceState === "speaking" ? "Responding..." : "Tap to Speak"}
                            </Text>
                        </View>

                        {/* SKILLS CAROUSEL */}
                        <View style={styles.skillsContainer}>
                            <Text style={styles.skillsTitle}>Quick Actions</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20 }}>
                                {VOICE_SKILLS.map((skill) => (
                                    <TouchableOpacity key={skill.id} style={styles.skillCard} onPress={() => onVoiceSkillPress(skill)}>
                                        <LinearGradient colors={skill.color} style={styles.skillIcon}>
                                            <FontAwesome5 name={skill.icon} size={20} color="#FFF" />
                                        </LinearGradient>
                                        <Text style={styles.skillText}>{skill.title}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>

                    </LinearGradient>
                ) : (
                    // ---------------- TEXT CHAT MODE UI ----------------
                    <BlurView intensity={90} tint="dark" style={[styles.blurContainer, { paddingTop: insets.top + 10 }]}>
                        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.keyboardView}>

                            {/* HEADER */}
                            <View style={styles.header}>
                                <View style={styles.headerTitleContainer}>
                                    <View style={styles.aiIconSmall}>
                                        <MaterialCommunityIcons name="robot-happy" size={18} color="#FFF" />
                                    </View>
                                    <View>
                                        <Text style={styles.headerTitle}>BWC Assistant</Text>
                                        <Text style={styles.headerStatus}>
                                            {aiState === "thinking" ? "🧠 Searching knowledge base..." :
                                                aiState === "typing" ? "✍️ Typing..." : "🟢 Online • AI Powered"}
                                        </Text>
                                    </View>
                                </View>
                                <View style={styles.headerActions}>
                                    <TouchableOpacity onPress={clearChat} style={styles.clearBtn}>
                                        <Feather name="trash-2" size={18} color="#A5B4FC" />
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => setIsOpen(false)} style={styles.closeBtn}>
                                        <Feather name="x" size={24} color="#FFF" />
                                    </TouchableOpacity>
                                </View>
                            </View>

                            {/* MESSAGES */}
                            <ScrollView
                                ref={scrollViewRef}
                                style={styles.messagesContainer}
                                contentContainerStyle={{ paddingBottom: 20 }}
                                showsVerticalScrollIndicator={false}
                            >
                                {messages.map((msg) => (
                                    <View key={msg.id} style={[styles.msgBubble, msg.sender === "user" ? styles.msgUser : styles.msgAi]}>
                                        <Text style={[styles.msgText, msg.sender === "user" ? styles.msgTextUser : styles.msgTextAi]}>
                                            {renderMessageText(msg.text)}
                                        </Text>
                                        {/* Source indicator for AI messages */}
                                        {msg.sender === "ai" && msg.sourcesFound > 0 && (
                                            <View style={styles.sourceIndicator}>
                                                <MaterialCommunityIcons name="book-open-variant" size={12} color="#A5B4FC" />
                                                <Text style={styles.sourceText}>
                                                    From {msg.sourcesFound} training source{msg.sourcesFound > 1 ? 's' : ''}
                                                </Text>
                                            </View>
                                        )}
                                    </View>
                                ))}
                                {aiState === "thinking" && (
                                    <View style={styles.thinkingBubble}>
                                        <ActivityIndicator size="small" color="#A5B4FC" style={{ marginRight: 8 }} />
                                        <Text style={styles.statusText}>Searching courses & resources...</Text>
                                    </View>
                                )}
                            </ScrollView>

                            {/* SUGGESTIONS */}
                            <View style={styles.suggestionsContainer}>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20 }}>
                                    {suggestedQuestions.slice(0, 6).map((q, i) => (
                                        <TouchableOpacity
                                            key={i}
                                            style={styles.suggestionChip}
                                            onPress={() => handleSend(q)}
                                            disabled={aiState !== "idle"}
                                        >
                                            <Text style={styles.suggestionText} numberOfLines={1}>{q}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>

                            {/* INPUT */}
                            <View style={styles.inputContainer}>
                                <TouchableOpacity style={styles.voiceToggleBtn} onPress={toggleVoiceMode}>
                                    <MaterialCommunityIcons name="microphone-outline" size={24} color="#A5B4FC" />
                                </TouchableOpacity>
                                <TextInput
                                    placeholder="Ask about courses, SOPs, recipes..."
                                    placeholderTextColor="rgba(255,255,255,0.5)"
                                    style={styles.input}
                                    value={inputText}
                                    onChangeText={setInputText}
                                    onSubmitEditing={() => handleSend(inputText)}
                                    editable={aiState === "idle"}
                                    multiline
                                    maxLength={500}
                                />
                                <TouchableOpacity
                                    style={[styles.sendBtn, (!inputText.trim() || aiState !== "idle") && styles.sendBtnDisabled]}
                                    onPress={() => handleSend(inputText)}
                                    disabled={!inputText.trim() || aiState !== "idle"}
                                >
                                    {aiState !== "idle" ? (
                                        <ActivityIndicator size="small" color="#FFF" />
                                    ) : (
                                        <Ionicons name="send" size={20} color="#FFF" />
                                    )}
                                </TouchableOpacity>
                            </View>

                        </KeyboardAvoidingView>
                    </BlurView>
                )}
            </Animated.View>
        </>
    );
}

const styles = StyleSheet.create({
    fabContainer: { position: "absolute", bottom: 140, right: 20, zIndex: 999, shadowColor: "#6366F1", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 15, elevation: 10 },
    fab: { borderRadius: 30, overflow: "hidden" },
    fabGradient: { width: 60, height: 60, justifyContent: "center", alignItems: "center" },

    overlayContainer: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 },
    blurContainer: { flex: 1 },
    keyboardView: { flex: 1, flexDirection: "column" },

    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.1)" },
    headerTitleContainer: { flexDirection: "row", alignItems: "center", flex: 1 },
    aiIconSmall: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#6366F1", justifyContent: "center", alignItems: "center", marginRight: 12 },
    headerTitle: { color: "#FFF", fontSize: 18, fontFamily: "Poppins_600SemiBold" },
    headerStatus: { color: "#A5B4FC", fontSize: 11, fontFamily: "Poppins_400Regular" },
    headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
    clearBtn: { padding: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12 },
    closeBtn: { padding: 5 },

    messagesContainer: { flex: 1, padding: 20 },
    msgBubble: { maxWidth: "85%", padding: 14, borderRadius: 18, marginBottom: 12 },
    msgUser: { alignSelf: "flex-end", backgroundColor: "#6366F1", borderBottomRightRadius: 4 },
    msgAi: { alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", borderBottomLeftRadius: 4 },
    msgText: { fontSize: 14, fontFamily: "Poppins_400Regular", lineHeight: 22 },
    msgTextUser: { color: "#FFF" },
    msgTextAi: { color: "#E0E7FF" },

    sourceIndicator: { flexDirection: "row", alignItems: "center", marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.1)" },
    sourceText: { color: "#A5B4FC", fontSize: 10, fontFamily: "Poppins_400Regular", marginLeft: 4 },

    thinkingBubble: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.05)", padding: 12, borderRadius: 16, marginBottom: 10 },
    statusText: { color: "#A5B4FC", fontSize: 12, fontStyle: "italic", fontFamily: "Poppins_400Regular" },

    suggestionsContainer: { height: 50, marginBottom: 10 },
    suggestionChip: { backgroundColor: "rgba(255,255,255,0.1)", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, marginRight: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", maxWidth: 180 },
    suggestionText: { color: "#E0E7FF", fontSize: 12, fontFamily: "Poppins_500Medium" },

    inputContainer: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "rgba(0,0,0,0.3)", marginBottom: Platform.OS === "ios" ? 0 : 10 },
    voiceToggleBtn: { marginRight: 10, padding: 10, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20 },
    input: { flex: 1, backgroundColor: "rgba(255,255,255,0.1)", minHeight: 46, maxHeight: 100, borderRadius: 23, paddingHorizontal: 18, paddingVertical: 12, color: "#FFF", fontSize: 15, fontFamily: "Poppins_400Regular", marginRight: 10 },
    sendBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: "#6366F1", justifyContent: "center", alignItems: "center" },
    sendBtnDisabled: { backgroundColor: "rgba(99, 102, 241, 0.4)" },

    // VOICE MODE STYLES
    voiceContainer: { flex: 1, paddingBottom: 40 },
    voiceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 20 },
    voiceCloseBtn: { padding: 10, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20 },
    voiceHeaderTitle: { color: "#FFF", fontSize: 18, fontFamily: "Poppins_700Bold" },

    voiceVisualizerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    voiceOrbOuter: { position: 'absolute', width: 250, height: 250, borderRadius: 125, backgroundColor: 'rgba(99, 102, 241, 0.2)' },
    voiceOrbInner: { width: 120, height: 120, borderRadius: 60, overflow: 'hidden', justifyContent: 'center', alignItems: 'center', borderWidth: 4, borderColor: 'rgba(255,255,255,0.2)' },
    voiceOrbGradient: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
    voiceStatusText: { marginTop: 40, color: "rgba(255,255,255,0.7)", fontSize: 18, fontFamily: "Poppins_500Medium" },

    skillsContainer: { paddingVertical: 20 },
    skillsTitle: { color: "rgba(255,255,255,0.6)", fontSize: 14, fontFamily: "Poppins_600SemiBold", marginLeft: 20, marginBottom: 15, textTransform: 'uppercase', letterSpacing: 1 },
    skillCard: { alignItems: 'center', marginRight: 20 },
    skillIcon: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', marginBottom: 8, borderWidth: 2, borderColor: 'rgba(255,255,255,0.1)' },
    skillText: { color: "#FFF", fontSize: 12, fontFamily: "Poppins_500Medium" },
});