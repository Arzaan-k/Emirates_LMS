import React, { useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    TextInput,
    Image,
    KeyboardAvoidingView,
    Platform,
} from "react-native";
import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";

const CATEGORIES = [
    { id: 1, name: "Standard Operating Procedures", icon: "file-document-outline", count: 12 },
    { id: 2, name: "Video Tutorials", icon: "play-circle-outline", count: 8 },
    { id: 3, name: "Equipment Manuals", icon: "tools", count: 5 },
    { id: 4, name: "Hygiene Guidelines", icon: "shield-check-outline", count: 15 },
];

const DOWNLOADS = [
    { id: 1, name: "Waffle Batter Ratio Chart", size: "1.2 MB", type: "PDF" },
    { id: 2, name: "Closing Shift Checklist", size: "850 KB", type: "PDF" },
];

export default function Resources() {
    const insets = useSafeAreaInsets();
    const [chatOpen, setChatOpen] = useState(false);
    const [messages, setMessages] = useState([
        { id: 1, text: "Hi! I'm your AI Waffle Assistant. Ask me anything about recipes, ops, or safety!", sender: "ai" },
    ]);
    const [inputText, setInputText] = useState("");

    const handleSend = () => {
        if (!inputText.trim()) return;
        const newMsg = { id: Date.now(), text: inputText, sender: "user" };
        setMessages([...messages, newMsg]);
        setInputText("");

        // Simulate AI Response
        setTimeout(() => {
            setMessages((prev) => [...prev, {
                id: Date.now() + 1,
                text: "That's a great question! According to the SOP, the batter must rest for exactly 15 minutes at room temperature before use.",
                sender: "ai"
            }]);
        }, 1500);
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            {/* MAIN CONTENT */}
            <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
                <View style={styles.header}>
                    <Text style={styles.pageTitle}>Knowledge Base</Text>
                    <Text style={styles.subTitle}>Everything you need to know, in one place.</Text>
                </View>

                {/* QUICK CATEGORIES */}
                <View style={styles.gridContainer}>
                    {CATEGORIES.map((cat) => (
                        <TouchableOpacity key={cat.id} style={styles.catCard}>
                            <View style={styles.iconContainer}>
                                <MaterialCommunityIcons name={cat.icon} size={28} color="#F59E0B" />
                            </View>
                            <Text style={styles.catTitle}>{cat.name}</Text>
                            <Text style={styles.catCount}>{cat.count} items</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* RECENT DOWNLOADS */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Recent Documents</Text>
                    {DOWNLOADS.map((doc) => (
                        <TouchableOpacity key={doc.id} style={styles.docRow}>
                            <View style={styles.docIcon}>
                                <MaterialCommunityIcons name="file-pdf-box" size={30} color="#EF4444" />
                            </View>
                            <View style={styles.docInfo}>
                                <Text style={styles.docName}>{doc.name}</Text>
                                <Text style={styles.docMeta}>{doc.type} • {doc.size}</Text>
                            </View>
                            <Feather name="download" size={20} color="#9CA3AF" />
                        </TouchableOpacity>
                    ))}
                </View>
            </ScrollView>

            {/* FLOATING AI ASSISTANT BUTTON */}
            {!chatOpen && (
                <TouchableOpacity style={styles.fab} onPress={() => setChatOpen(true)}>
                    <LinearGradientContainer style={styles.fabGradient}>
                        <MaterialCommunityIcons name="robot-happy-outline" size={28} color="#FFF" />
                    </LinearGradientContainer>
                </TouchableOpacity>
            )}

            {/* AI CHAT OVERLAY */}
            {chatOpen && (
                <BlurView intensity={20} tint="dark" style={styles.chatOverlay}>
                    <KeyboardAvoidingView
                        behavior={Platform.OS === "ios" ? "padding" : "height"}
                        style={styles.chatContainer}
                    >
                        {/* CHAT HEADER */}
                        <View style={styles.chatHeader}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <View style={styles.aiAvatar}>
                                    <MaterialCommunityIcons name="robot-happy" size={20} color="#FFF" />
                                </View>
                                <View style={{ marginLeft: 10 }}>
                                    <Text style={styles.chatTitle}>Waffle AI</Text>
                                    <Text style={styles.chatStatus}>Online • Helping you</Text>
                                </View>
                            </View>
                            <TouchableOpacity onPress={() => setChatOpen(false)}>
                                <Feather name="x" size={24} color="#6B7280" />
                            </TouchableOpacity>
                        </View>

                        {/* MESSAGES */}
                        <ScrollView style={styles.messagesList} contentContainerStyle={{ padding: 16 }}>
                            {messages.map((msg) => (
                                <View key={msg.id} style={[
                                    styles.msgBubble,
                                    msg.sender === "user" ? styles.msgUser : styles.msgAI
                                ]}>
                                    <Text style={[
                                        styles.msgText,
                                        msg.sender === "user" ? styles.msgTextUser : styles.msgTextAI
                                    ]}>{msg.text}</Text>
                                </View>
                            ))}
                        </ScrollView>

                        {/* INPUT */}
                        <View style={styles.inputArea}>
                            <TextInput
                                value={inputText}
                                onChangeText={setInputText}
                                placeholder="Ask me anything..."
                                placeholderTextColor="#9CA3AF"
                                style={styles.chatInput}
                            />
                            <TouchableOpacity style={styles.sendBtn} onPress={handleSend}>
                                <Ionicons name="send" size={20} color="#FFF" />
                            </TouchableOpacity>
                        </View>
                    </KeyboardAvoidingView>
                </BlurView>
            )}
        </View>
    );
}

// Helper for Gradient
// We can't use LinearGradient inside the return statement directly if it's not imported or defined in scope in a weird way
// But we imported it in other files. Let's make sure we export a simple component if needed or just use View if LinearGradient is issue.
// Re-importing since this is a new file.
// Wait, I forgot to import LinearGradient in this file. Adding it now.
import { LinearGradient } from "expo-linear-gradient";

function LinearGradientContainer({ style, children }) {
    return (
        <LinearGradient
            colors={["#F59E0B", "#D97706"]}
            style={style}
        >
            {children}
        </LinearGradient>
    );
}


const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#F9FAFB",
    },
    header: {
        paddingHorizontal: 20,
        marginBottom: 20,
        marginTop: 10,
    },
    pageTitle: {
        fontSize: 28,
        fontFamily: "Poppins_700Bold",
        color: "#111827",
    },
    subTitle: {
        fontSize: 14,
        fontFamily: "Poppins_400Regular",
        color: "#6B7280",
    },
    gridContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
    },
    catCard: {
        width: '47%',
        backgroundColor: "#FFF",
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 2,
    },
    iconContainer: {
        width: 50,
        height: 50,
        borderRadius: 12,
        backgroundColor: "#FFF7ED", // light amber
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
    },
    catTitle: {
        fontSize: 14,
        fontFamily: "Poppins_600SemiBold",
        color: "#111827",
        marginBottom: 4,
    },
    catCount: {
        fontSize: 12,
        fontFamily: "Poppins_400Regular",
        color: "#9CA3AF",
    },
    section: {
        paddingHorizontal: 20,
        marginTop: 16,
    },
    sectionTitle: {
        fontSize: 18,
        fontFamily: "Poppins_600SemiBold",
        color: "#111827",
        marginBottom: 16,
    },
    docRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: "#FFF",
        padding: 12,
        borderRadius: 12,
        marginBottom: 12,
    },
    docIcon: {
        marginRight: 12,
    },
    docInfo: {
        flex: 1,
    },
    docName: {
        fontSize: 14,
        fontFamily: "Poppins_500Medium",
        color: "#111827",
    },
    docMeta: {
        fontSize: 12,
        fontFamily: "Poppins_400Regular",
        color: "#9CA3AF",
    },
    // FAB
    fab: {
        position: 'absolute',
        bottom: 100,
        right: 20,
        shadowColor: "#F59E0B",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 5,
    },
    fabGradient: {
        width: 60,
        height: 60,
        borderRadius: 30,
        justifyContent: 'center',
        alignItems: 'center',
    },
    // CHAT
    chatOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'flex-end',
    },
    chatContainer: {
        backgroundColor: "#FFF",
        height: "85%", // Take up most of screen
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -5 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 20,
        overflow: 'hidden',
    },
    chatHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: "#F3F4F6",
    },
    aiAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: "#F59E0B",
        justifyContent: 'center',
        alignItems: 'center',
    },
    chatTitle: {
        fontSize: 16,
        fontFamily: "Poppins_600SemiBold",
        color: "#111827",
    },
    chatStatus: {
        fontSize: 12,
        color: "#F59E0B",
        fontFamily: "Poppins_500Medium",
    },
    messagesList: {
        flex: 1,
        backgroundColor: "#F9FAFB",
    },
    msgBubble: {
        maxWidth: '80%',
        padding: 12,
        borderRadius: 16,
        marginBottom: 12,
    },
    msgUser: {
        alignSelf: 'flex-end',
        backgroundColor: "#111827",
        borderBottomRightRadius: 4,
    },
    msgAI: {
        alignSelf: 'flex-start',
        backgroundColor: "#FFF",
        borderBottomLeftRadius: 4,
        borderWidth: 1,
        borderColor: "#E5E7EB",
    },
    msgText: {
        fontFamily: "Poppins_400Regular",
        fontSize: 14,
        lineHeight: 20,
    },
    msgTextUser: {
        color: "#FFF",
    },
    msgTextAI: {
        color: "#1F2937",
    },
    inputArea: {
        padding: 20,
        backgroundColor: "#FFF",
        borderTopWidth: 1,
        borderTopColor: "#F3F4F6",
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20, // safe area padding
    },
    chatInput: {
        flex: 1,
        backgroundColor: "#F3F4F6",
        borderRadius: 24,
        paddingHorizontal: 16,
        paddingVertical: 12,
        fontFamily: "Poppins_400Regular",
        fontSize: 14,
        marginRight: 10,
    },
    sendBtn: {
        width: 46,
        height: 46,
        borderRadius: 23,
        backgroundColor: "#F59E0B",
        justifyContent: 'center',
        alignItems: 'center',
    },
});
