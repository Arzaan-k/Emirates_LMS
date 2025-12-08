import React, { useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    TextInput,
    Dimensions,
} from "react-native";
import { Feather, MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";

const { width } = Dimensions.get("window");

const CATEGORIES = [
    { id: 1, name: "Standard SOPs", icon: "file-document-outline", count: 12, color: ["#3B82F6", "#2563EB"], bg: "#DBEAFE" },
    { id: 2, name: "Video Tutorials", icon: "play-circle-outline", count: 8, color: ["#F59E0B", "#D97706"], bg: "#FEF3C7" },
    { id: 3, name: "Machine Manuals", icon: "tools", count: 5, color: ["#8B5CF6", "#7C3AED"], bg: "#EDE9FE" },
    { id: 4, name: "Safety Guides", icon: "shield-check-outline", count: 15, color: ["#10B981", "#059669"], bg: "#D1FAE5" },
];

const RECOMMENDED = [
    { id: 1, title: "How to fix Grinder Jam", type: "AI Solution", time: "2 min read", icon: "robot-happy-outline" },
    { id: 2, title: "Closing Shift Checklist", type: "PDF Guide", time: "500 KB", icon: "file-pdf-box" },
];

export default function Resources() {
    const insets = useSafeAreaInsets();
    const [search, setSearch] = useState("");

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>

                {/* HEADER */}
                <View style={styles.header}>
                    <Text style={styles.pageTitle}>Knowledge Base</Text>
                    <View style={styles.aiBadge}>
                        <MaterialCommunityIcons name="sparkles" size={12} color="#F59E0B" />
                        <Text style={styles.aiBadgeText}>AI Powered</Text>
                    </View>
                </View>

                {/* AI SEARCH */}
                <View style={styles.searchSection}>
                    <LinearGradient
                        colors={["#FFF", "#F9FAFB"]}
                        style={styles.searchBox}
                    >
                        <MaterialCommunityIcons name="robot" size={24} color="#8B5CF6" />
                        <TextInput
                            placeholder="Ask AI about SOPs, recipes..."
                            style={styles.input}
                            placeholderTextColor="#9CA3AF"
                            value={search}
                            onChangeText={setSearch}
                        />
                        <TouchableOpacity style={styles.micBtn}>
                            <Feather name="mic" size={20} color="#6B7280" />
                        </TouchableOpacity>
                    </LinearGradient>
                    <Text style={styles.aiHint}>Try asking: "How do I clean the steam wand?"</Text>
                </View>

                {/* AI RECOMMENDATIONS */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>✨ Recommended for You</Text>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: 20 }}>
                        {RECOMMENDED.map((item, index) => (
                            <TouchableOpacity key={item.id} style={styles.recCard}>
                                <View style={styles.recIcon}>
                                    <MaterialCommunityIcons name={item.icon} size={24} color="#4B5563" />
                                </View>
                                <View>
                                    <Text style={styles.recTitle}>{item.title}</Text>
                                    <Text style={styles.recMeta}>{item.type} • {item.time}</Text>
                                </View>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>

                {/* VISUAL CATEGORIES GRID */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Browse Categories</Text>
                    <View style={styles.grid}>
                        {CATEGORIES.map((cat) => (
                            <TouchableOpacity key={cat.id} style={styles.catCard}>
                                <LinearGradient
                                    colors={cat.color}
                                    style={styles.catGradient}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                >
                                    <MaterialCommunityIcons name={cat.icon} size={32} color="#FFF" />
                                </LinearGradient>
                                <View style={styles.catContent}>
                                    <Text style={styles.catName}>{cat.name}</Text>
                                    <View style={styles.catBadge}>
                                        <Text style={styles.catCount}>{cat.count} files</Text>
                                    </View>
                                </View>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* RECENT UPLOADS */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Recently Added</Text>
                        <TouchableOpacity><Text style={styles.seeAll}>View All</Text></TouchableOpacity>
                    </View>
                    {/* Dummy Item */}
                    <View style={styles.fileRow}>
                        <View style={styles.fileIcon}>
                            <MaterialCommunityIcons name="file-video-outline" size={24} color="#EF4444" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.fileName}>New Summer Menu Training</Text>
                            <Text style={styles.fileMeta}>Video • 12 mins • Added Today</Text>
                        </View>
                        <Feather name="download" size={20} color="#9CA3AF" />
                    </View>
                </View>

            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#F9FAFB",
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        marginBottom: 20,
        marginTop: 10,
    },
    pageTitle: {
        fontSize: 28,
        fontFamily: "Poppins_700Bold",
        color: "#111827",
    },
    aiBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: "#FFF7ED",
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: "#FCD34D",
    },
    aiBadgeText: {
        fontSize: 10,
        fontFamily: "Poppins_600SemiBold",
        color: "#D97706",
        marginLeft: 4,
    },
    // SEARCH
    searchSection: {
        paddingHorizontal: 20,
        marginBottom: 30,
    },
    searchBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: "#FFF",
        borderRadius: 16,
        paddingHorizontal: 16,
        height: 60,
        shadowColor: "#8B5CF6",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 5,
        borderWidth: 1,
        borderColor: "#F3F4F6",
    },
    input: {
        flex: 1,
        marginLeft: 12,
        fontSize: 14,
        fontFamily: "Poppins_500Medium",
        color: "#111827",
    },
    micBtn: {
        padding: 8,
    },
    aiHint: {
        fontSize: 12,
        color: "#9CA3AF",
        marginTop: 8,
        marginLeft: 10,
        fontStyle: 'italic',
    },
    // RECOMMENDATIONS
    section: {
        marginBottom: 30,
        paddingHorizontal: 20,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 18,
        fontFamily: "Poppins_700Bold",
        color: "#111827",
    },
    recCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: "#FFF",
        padding: 16,
        borderRadius: 16,
        marginRight: 12,
        width: width * 0.7,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 2,
    },
    recIcon: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: "#F3F4F6",
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    recTitle: {
        fontSize: 14,
        fontFamily: "Poppins_600SemiBold",
        color: "#111827",
        marginBottom: 2,
    },
    recMeta: {
        fontSize: 12,
        color: "#6B7280",
    },
    // GRID
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },
    catCard: {
        width: '48%',
        backgroundColor: "#FFF",
        borderRadius: 20,
        marginBottom: 16,
        padding: 6, // inner padding
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 2,
    },
    catGradient: {
        height: 100,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    catContent: {
        paddingHorizontal: 10,
        paddingBottom: 10,
    },
    catName: {
        fontSize: 14,
        fontFamily: "Poppins_600SemiBold",
        color: "#111827",
        marginBottom: 4,
    },
    catBadge: {
        backgroundColor: "#F3F4F6",
        alignSelf: 'flex-start',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 8,
    },
    catCount: {
        fontSize: 10,
        color: "#6B7280",
        fontFamily: "Poppins_500Medium",
    },
    // FILES
    seeAll: {
        fontSize: 13,
        color: "#F59E0B",
        fontFamily: "Poppins_600SemiBold",
    },
    fileRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: "#FFF",
        padding: 16,
        borderRadius: 16,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.03,
        shadowRadius: 2,
    },
    fileIcon: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: "#FEF2F2",
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    fileName: {
        fontSize: 14,
        fontFamily: "Poppins_500Medium",
        color: "#111827",
        marginBottom: 2,
    },
    fileMeta: {
        fontSize: 12,
        color: "#9CA3AF",
    },
});
