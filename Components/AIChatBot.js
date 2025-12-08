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
} from "react-native";
import { BlurView } from "expo-blur";
import { MaterialCommunityIcons, Feather, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

const { height } = Dimensions.get("window");

export default function AIChatBot() {
    const [isOpen, setIsOpen] = useState(false);
    const [inputText, setInputText] = useState("");
    const [messages, setMessages] = useState([
        {
            id: 1,
            text: "Hello! I am your Agentic AI. I can analyze your store analytics, suggest recipes, or guide you through SOPs. What do you need?",
            sender: "ai",
            status: "done", // thinking, typing, done
        },
    ]);
    const [aiState, setAiState] = useState("idle"); // idle, thinking, typing

    // Animation Values
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const slideAnim = useRef(new Animated.Value(height)).current;

    useEffect(() => {
        // Pulse Animation for the Button
        if (!isOpen) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, {
                        toValue: 1.1,
                        duration: 1000,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: true,
                    }),
                    Animated.timing(pulseAnim, {
                        toValue: 1,
                        duration: 1000,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: true,
                    }),
                ])
            ).start();
        } else {
            pulseAnim.setValue(1); // Reset when open
        }
    }, [isOpen]);

    useEffect(() => {
        // Slide Up/Down for Chat Window
        Animated.timing(slideAnim, {
            toValue: isOpen ? 0 : height,
            duration: 300,
            easing: Easing.out(Easing.poly(4)),
            useNativeDriver: true,
        }).start();
    }, [isOpen]);

    const handleSend = () => {
        if (!inputText.trim()) return;

        const newMsg = { id: Date.now(), text: inputText, sender: "user" };
        setMessages((prev) => [...prev, newMsg]);
        setInputText("");

        // Start Agentic Simulation
        simulateAgenticResponse();
    };

    const simulateAgenticResponse = () => {
        setAiState("thinking");

        // Phase 1: Thinking / Analyzing (2s)
        setTimeout(() => {
            setAiState("typing");

            // Phase 2: Typing (1.5s)
            setTimeout(() => {
                const responseText = "I've analyzed the recent sales data. It seems 'Red Velvet' waffles are trending down. I recommend running a 10% promo on them. Would you like me to draft a notification?";

                setMessages((prev) => [
                    ...prev,
                    { id: Date.now() + 1, text: responseText, sender: "ai", status: "done" },
                ]);
                setAiState("idle");
            }, 1500);

        }, 2000);
    };

    return (
        <>
            {/* GLOBAL FLOATING BUTTON */}
            {!isOpen && (
                <Animated.View
                    style={[
                        styles.fabContainer,
                        { transform: [{ scale: pulseAnim }] },
                    ]}
                >
                    <TouchableOpacity
                        style={styles.fab}
                        onPress={() => setIsOpen(true)}
                        activeOpacity={0.8}
                    >
                        <LinearGradient
                            colors={["#6366F1", "#A855F7"]} // Indigo to Purple (AI Colors)
                            style={styles.fabGradient}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                        >
                            <MaterialCommunityIcons name="robot-happy" size={28} color="#FFF" />
                        </LinearGradient>
                    </TouchableOpacity>
                </Animated.View>
            )}

            {/* CHAT OVERLAY */}
            <Animated.View
                style={[
                    styles.overlayContainer,
                    { transform: [{ translateY: slideAnim }] },
                ]}
            >
                <BlurView intensity={90} tint="dark" style={styles.blurContainer}>
                    <KeyboardAvoidingView
                        behavior={Platform.OS === "ios" ? "padding" : "height"}
                        style={styles.keyboardView}
                    >

                        {/* HEADER */}
                        <View style={styles.header}>
                            <View style={styles.headerTitleContainer}>
                                <View style={styles.aiIconSmall}>
                                    <MaterialCommunityIcons name="robot-happy" size={18} color="#FFF" />
                                </View>
                                <View>
                                    <Text style={styles.headerTitle}>Agentic AI</Text>
                                    <Text style={styles.headerStatus}>
                                        {aiState === "thinking" ? "🧠 Analyzing Context..." :
                                            aiState === "typing" ? "✍️ Drafting Response..." :
                                                "🟢 Online"}
                                    </Text>
                                </View>
                            </View>
                            <TouchableOpacity onPress={() => setIsOpen(false)} style={styles.closeBtn}>
                                <Feather name="x" size={24} color="#FFF" />
                            </TouchableOpacity>
                        </View>

                        {/* MESSAGES */}
                        <View style={styles.messagesContainer}>
                            {messages.map((msg) => (
                                <View key={msg.id} style={[
                                    styles.msgBubble,
                                    msg.sender === "user" ? styles.msgUser : styles.msgAi
                                ]}>
                                    <Text style={[
                                        styles.msgText,
                                        msg.sender === "user" ? styles.msgTextUser : styles.msgTextAi
                                    ]}>
                                        {msg.text}
                                    </Text>
                                </View>
                            ))}

                            {/* STATUS INDICATORS */}
                            {aiState === "thinking" && (
                                <View style={styles.statusBubble}>
                                    <Text style={styles.statusText}>Searching Knowledge Base...</Text>
                                </View>
                            )}
                        </View>

                        {/* INPUT */}
                        <View style={styles.inputContainer}>
                            <TextInput
                                placeholder="Ask anything..."
                                placeholderTextColor="rgba(255,255,255,0.5)"
                                style={styles.input}
                                value={inputText}
                                onChangeText={setInputText}
                                onSubmitEditing={handleSend}
                            />
                            <TouchableOpacity style={styles.sendBtn} onPress={handleSend}>
                                <Ionicons name="send" size={20} color="#FFF" />
                            </TouchableOpacity>
                        </View>

                    </KeyboardAvoidingView>
                </BlurView>
            </Animated.View>
        </>
    );
}

const styles = StyleSheet.create({
    // FAB
    fabContainer: {
        position: "absolute",
        bottom: 100, // Above Tabs
        right: 20,
        zIndex: 999, // On top everything
        shadowColor: "#6366F1",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.5,
        shadowRadius: 15,
        elevation: 10,
    },
    fab: {
        borderRadius: 30,
        overflow: "hidden",
    },
    fabGradient: {
        width: 60,
        height: 60,
        justifyContent: "center",
        alignItems: "center",
    },

    // OVERLAY
    overlayContainer: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
    },
    blurContainer: {
        flex: 1,
        paddingTop: 50, // Safe Area top mostly
    },
    keyboardView: {
        flex: 1,
        flexDirection: "column",
    },

    // HEADER
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 20,
        paddingBottom: 20,
        borderBottomWidth: 1,
        borderBottomColor: "rgba(255,255,255,0.1)",
    },
    headerTitleContainer: {
        flexDirection: "row",
        alignItems: "center",
    },
    aiIconSmall: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: "#6366F1",
        justifyContent: "center",
        alignItems: "center",
        marginRight: 10,
    },
    headerTitle: {
        color: "#FFF",
        fontSize: 18,
        fontFamily: "Poppins_600SemiBold",
    },
    headerStatus: {
        color: "#A5B4FC", // Light Indigo
        fontSize: 12,
        fontFamily: "Poppins_400Regular",
    },
    closeBtn: {
        padding: 5,
    },

    // MESSAGES
    messagesContainer: {
        flex: 1,
        padding: 20,
    },
    msgBubble: {
        maxWidth: "85%",
        padding: 14,
        borderRadius: 18,
        marginBottom: 12,
    },
    msgUser: {
        alignSelf: "flex-end",
        backgroundColor: "#6366F1", // Indigo
        borderBottomRightRadius: 4,
    },
    msgAi: {
        alignSelf: "flex-start",
        backgroundColor: "rgba(255,255,255,0.1)", // Glassy
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.2)",
        borderBottomLeftRadius: 4,
    },
    msgText: {
        fontSize: 14,
        fontFamily: "Poppins_400Regular",
        lineHeight: 22,
    },
    msgTextUser: {
        color: "#FFF",
    },
    msgTextAi: {
        color: "#E0E7FF",
    },
    statusBubble: {
        alignSelf: "flex-start",
        backgroundColor: "transparent",
        marginBottom: 10,
        marginLeft: 4,
    },
    statusText: {
        color: "#A5B4FC",
        fontSize: 12,
        fontStyle: "italic",
    },

    // INPUT
    inputContainer: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 20,
        paddingVertical: 16,
        backgroundColor: "rgba(0,0,0,0.3)",
        marginBottom: Platform.OS === "ios" ? 0 : 20,
    },
    input: {
        flex: 1,
        backgroundColor: "rgba(255,255,255,0.1)",
        height: 50,
        borderRadius: 25,
        paddingHorizontal: 20,
        color: "#FFF",
        fontSize: 15,
        fontFamily: "Poppins_400Regular",
        marginRight: 10,
    },
    sendBtn: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: "#6366F1",
        justifyContent: "center",
        alignItems: "center",
    },
});
