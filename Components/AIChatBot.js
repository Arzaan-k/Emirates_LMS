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
} from "react-native";
import { BlurView } from "expo-blur";
import { MaterialCommunityIcons, Feather, Ionicons, FontAwesome5 } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Audio } from 'expo-av';
import API_URL from '../config';

const { height, width } = Dimensions.get("window");

// --- BELGIAN WAFFLE KNOWLEDGE BASE ---
const BWC_QA_DB = {
    "recipe": {
        keywords: ["recipe", "batter", "mix", "ingredients"],
        answer: "For the **Classic Waffle Batter**:\n1. Mix 5kg Premix with 4L Water.\n2. Whisk for 3 mins until smooth.\n3. Add 500g Oil and whisk for 1 min.\n4. Rest for 15 mins before use. 🧇",
    },
    "temp": {
        keywords: ["temp", "temperature", "heat", "iron"],
        answer: "Standard Baking Temperature: **180°C - 190°C**.\nCooking Time: **3:30 - 4:00 minutes** depending on crispiness preference. 🔥",
    },
    "opening": {
        keywords: ["opening", "morning", "start"],
        answer: "**Opening Checklist:**\n1. Turn on Irons (15 mins warmup).\n2. Count Cash Float.\n3. Check Milk/Batter Inventory.\n4. Wipe Counters.\n5. Log into POS. ✅",
    },
    "cleaning": {
        keywords: ["cleaning", "wash", "sanitizer"],
        answer: "**Cleaning Protocol:**\n- Irons: Brush every hour.\n- Deep Clean: End of shift using 'Carbon-Off'.\n- Surfaces: Sanitize with Red Bucket solution every 2 hours. 🧼",
    },
    "uniform": {
        keywords: ["uniform", "dress", "wear"],
        answer: "**Standard Uniform:**\n- BWC Branded Cap\n- Black T-Shirt with Logo\n- Black Apron\n- Non-slip Closed Shoes\n- No visible jewelry while cooking. 👕",
    }
};

const SUGGESTED_QUESTIONS = [
    "What is the Batter Recipe?",
    "Check Opening SOPs",
    "Iron Temperature?",
    "Cleaning Schedule",
];

// Voice Skills Mock Data
const VOICE_SKILLS = [
    { id: 'daily', title: "Daily Briefing", icon: "sun", color: ["#F59E0B", "#D97706"] },
    { id: 'roleplay', title: 'Angry Customer', icon: "theater-masks", color: ["#EF4444", "#B91C1C"] },
    { id: 'quiz', title: "SOP Quiz", icon: "clipboard-list", color: ["#10B981", "#059669"] },
    { id: 'timer', title: "Timer", icon: "stopwatch", color: ["#6366F1", "#4F46E5"] },
];

import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function AIChatBot() {
    const insets = useSafeAreaInsets();
    const [isOpen, setIsOpen] = useState(false);
    const [isVoiceMode, setIsVoiceMode] = useState(false);
    const [voiceState, setVoiceState] = useState("listening"); // listening, processing, speaking
    const [inputText, setInputText] = useState("");
    const [messages, setMessages] = useState([
        {
            id: 1,
            text: "Hello! I am your BWC AI Assistant. Ask me about recipes, SOPs, or store operations! 🧇",
            sender: "ai",
            status: "done",
        },
    ]);
    const [aiState, setAiState] = useState("idle");

    // Animation Values
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const voicePulseAnim = useRef(new Animated.Value(1)).current;
    const slideAnim = useRef(new Animated.Value(height)).current;

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

    const handleSend = (text = inputText) => {
        if (!text.trim()) return;

        const newMsg = { id: Date.now(), text: text, sender: "user", status: "done" };
        setMessages((prev) => [...prev, newMsg]);
        setInputText("");

        // Check Knowledge Base
        const lowerText = text.toLowerCase();
        let matchedResponse = null;

        for (const key in BWC_QA_DB) {
            if (BWC_QA_DB[key].keywords.some(k => lowerText.includes(k))) {
                matchedResponse = BWC_QA_DB[key].answer;
                break;
            }
        }

        simulateAgenticResponse(matchedResponse);
    };

    const simulateAgenticResponse = (customResponse) => {
        setAiState("thinking");
        setTimeout(() => {
            setAiState("typing");
            setTimeout(() => {
                const responseText = customResponse || "I'm not sure about that specific SOP. I've logged this query for the Area Manager. In the meantime, check the Resources tab for the full Operations Manual. 📘";
                setMessages((prev) => [...prev, { id: Date.now() + 1, text: responseText, sender: "ai", status: "done" }]);
                setAiState("idle");
            }, 1000);
        }, 1200);
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
                setMessages(prev => [...prev, { id: Date.now(), text: "Permission to access microphone was denied", sender: "ai", status: "done" }]);
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
                headers: { 'Content-Type': 'multipart/form-data' },
                body: formData
            });

            const data = await res.json();
            if (data.status === 'success') {
                // 1. Add User's Transcribed Text
                setMessages(prev => [...prev, {
                    id: Date.now(),
                    text: `🎤 ${data.user_text}`,
                    sender: "user",
                    status: "done"
                }]);

                // 2. Add AI Response
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
                    setVoiceState("listening"); // Reset
                }, 1500); // Fake "speaking" delay
            } else {
                setVoiceState("listening");
                alert("Sorry, I didn't catch that.");
            }
        } catch (e) {
            console.error(e);
            setVoiceState("listening");
            alert("Network error.");
        }
    };

    const toggleVoiceMode = () => {
        setIsVoiceMode(!isVoiceMode);
        if (!isVoiceMode) {
            // Just opened
            setVoiceState("idle"); // Wait for user to press mic
        } else {
            // Closing
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

    // Replaces the old simulation
    const onVoiceSkillPress = (skill) => {
        // Just a hint for now
        alert(`Try asking about '${skill.title}'! Press the mic to start.`);
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
                        <View style={styles.voiceHeader}>
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
                                <LinearGradient colors={voiceState === 'recording' || recording ? ["#EF4444", "#B91C1C"] : ["#6366F1", "#A855F7"]} style={styles.voiceOrbGradient}>
                                    <MaterialCommunityIcons name={voiceState === 'processing' ? "dots-horizontal" : (recording ? "stop" : "microphone")} size={40} color="#FFF" />
                                </LinearGradient>
                            </TouchableOpacity>
                            <Text style={styles.voiceStatusText}>
                                {voiceState === "listening" ? "Listening..." : voiceState === "processing" ? "Thinking..." : recording ? "Recording..." : "Tap to Speak"}
                            </Text>
                        </View>

                        {/* SKILLS CAROUSEL */}
                        <View style={styles.skillsContainer}>
                            <Text style={styles.skillsTitle}>Try a Skill</Text>
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
                    <BlurView intensity={90} tint="dark" style={[styles.blurContainer, { paddingTop: insets.top + 20 }]}>
                        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.keyboardView}>

                            {/* HEADER */}
                            <View style={styles.header}>
                                <View style={styles.headerTitleContainer}>
                                    <View style={styles.aiIconSmall}>
                                        <MaterialCommunityIcons name="robot-happy" size={18} color="#FFF" />
                                    </View>
                                    <View>
                                        <Text style={styles.headerTitle}>BWC Assistant</Text>
                                        <Text style={styles.headerStatus}>{aiState === "thinking" ? "🧠 Thinking..." : aiState === "typing" ? "✍️ Typing..." : "🟢 Online"}</Text>
                                    </View>
                                </View>
                                <TouchableOpacity onPress={() => setIsOpen(false)} style={styles.closeBtn}>
                                    <Feather name="x" size={24} color="#FFF" />
                                </TouchableOpacity>
                            </View>

                            {/* MESSAGES */}
                            <ScrollView style={styles.messagesContainer} contentContainerStyle={{ paddingBottom: 20 }}>
                                {messages.map((msg) => (
                                    <View key={msg.id} style={[styles.msgBubble, msg.sender === "user" ? styles.msgUser : styles.msgAi]}>
                                        <Text style={[styles.msgText, msg.sender === "user" ? styles.msgTextUser : styles.msgTextAi]}>{msg.text}</Text>
                                    </View>
                                ))}
                                {aiState === "thinking" && <View style={styles.statusBubble}><Text style={styles.statusText}>Searching Knowledge Base...</Text></View>}
                            </ScrollView>

                            {/* SUGGESTIONS */}
                            <View style={styles.suggestionsContainer}>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20 }}>
                                    {SUGGESTED_QUESTIONS.map((q, i) => (
                                        <TouchableOpacity key={i} style={styles.suggestionChip} onPress={() => handleSend(q)}>
                                            <Text style={styles.suggestionText}>{q}</Text>
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
                                    placeholder="Ask about SOPs..."
                                    placeholderTextColor="rgba(255,255,255,0.5)"
                                    style={styles.input}
                                    value={inputText}
                                    onChangeText={setInputText}
                                    onSubmitEditing={() => handleSend(inputText)}
                                />
                                <TouchableOpacity style={styles.sendBtn} onPress={() => handleSend(inputText)}>
                                    <Ionicons name="send" size={20} color="#FFF" />
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

    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.1)" },
    headerTitleContainer: { flexDirection: "row", alignItems: "center" },
    aiIconSmall: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#6366F1", justifyContent: "center", alignItems: "center", marginRight: 10 },
    headerTitle: { color: "#FFF", fontSize: 18, fontFamily: "Poppins_600SemiBold" },
    headerStatus: { color: "#A5B4FC", fontSize: 12, fontFamily: "Poppins_400Regular" },
    closeBtn: { padding: 5 },

    messagesContainer: { flex: 1, padding: 20 },
    msgBubble: { maxWidth: "85%", padding: 14, borderRadius: 18, marginBottom: 12 },
    msgUser: { alignSelf: "flex-end", backgroundColor: "#6366F1", borderBottomRightRadius: 4 },
    msgAi: { alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", borderBottomLeftRadius: 4 },
    msgText: { fontSize: 14, fontFamily: "Poppins_400Regular", lineHeight: 22 },
    msgTextUser: { color: "#FFF" },
    msgTextAi: { color: "#E0E7FF" },
    statusBubble: { alignSelf: "flex-start", backgroundColor: "transparent", marginBottom: 10, marginLeft: 4 },
    statusText: { color: "#A5B4FC", fontSize: 12, fontStyle: "italic" },

    suggestionsContainer: { height: 50, marginBottom: 10 },
    suggestionChip: { backgroundColor: "rgba(255,255,255,0.1)", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginRight: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
    suggestionText: { color: "#E0E7FF", fontSize: 12, fontFamily: "Poppins_500Medium" },

    inputContainer: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 16, backgroundColor: "rgba(0,0,0,0.3)", marginBottom: Platform.OS === "ios" ? 0 : 20 },
    voiceToggleBtn: { marginRight: 12, padding: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20 },
    input: { flex: 1, backgroundColor: "rgba(255,255,255,0.1)", height: 50, borderRadius: 25, paddingHorizontal: 20, color: "#FFF", fontSize: 15, fontFamily: "Poppins_400Regular", marginRight: 10 },
    sendBtn: { width: 50, height: 50, borderRadius: 25, backgroundColor: "#6366F1", justifyContent: "center", alignItems: "center" },

    // VOICE MODE STYLES
    voiceContainer: { flex: 1, paddingTop: 60, paddingBottom: 40 },
    voiceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20 },
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
