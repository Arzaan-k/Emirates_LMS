import React, { useState, useEffect } from "react";
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    TextInput,
    Dimensions,
    ActivityIndicator,
    RefreshControl
} from "react-native";
import { Feather, MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import API_URL from '../config';

const { width } = Dimensions.get("window");

// Static fallback for Recommendations (can be made dynamic later)
const RECOMMENDED = [
    { id: 1, title: "How to fix Grinder Jam", type: "AI Solution", time: "2 min read", icon: "robot-happy-outline" },
    { id: 2, title: "Closing Shift Checklist", type: "PDF Guide", time: "500 KB", icon: "file-pdf-box" },
];

const MANDATORY_MODULES = [
    { id: 1, name: "Batter Preparation", icon: "beaker-outline", count: 4, color: ["#EC4899", "#DB2777"], bg: "#FCE7F3" },
    { id: 2, name: "Waffle Baking Standards", icon: "cookie", count: 6, color: ["#F59E0B", "#D97706"], bg: "#FEF3C7" },
    { id: 3, name: "Topping Application", icon: "food-apple-outline", count: 5, color: ["#8B5CF6", "#7C3AED"], bg: "#EDE9FE" },
    { id: 4, name: "Equipment Maintenance", icon: "tools", count: 8, color: ["#3B82F6", "#2563EB"], bg: "#DBEAFE" },
];

export default function Resources() {
    const insets = useSafeAreaInsets();
    const [search, setSearch] = useState("");
    const navigation = useNavigation();

    // DYNAMIC DATA
    const [categories, setCategories] = useState([]);
    const [resources, setResources] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchData = async () => {
        try {
            // Fetch Categories
            const catRes = await fetch(`${API_URL}/resources/categories`);
            const catData = await catRes.json();
            setCategories(catData);

            // Fetch Resources
            const resRes = await fetch(`${API_URL}/resources`);
            const resData = await resRes.json();
            setResources(resData.reverse()); // Show newest first
        } catch (error) {
            console.error("Error fetching knowledge base:", error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const onRefresh = () => {
        setRefreshing(true);
        fetchData();
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <ScrollView
                contentContainerStyle={{ paddingBottom: 100 }}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >

                {/* HEADER */}
                <View style={styles.header}>
                    <Text style={styles.pageTitle}>Knowledge Base</Text>
                    <View style={styles.aiBadge}>
                        <MaterialCommunityIcons name="star-four-points" size={12} color="#F59E0B" />
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

                {/* DYNAMIC CATEGORIES GRID */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Browse Categories</Text>
                    {loading ? <ActivityIndicator color="#F59E0B" /> : (
                        <View style={styles.grid}>
                            {categories.map((cat, index) => (
                                <TouchableOpacity
                                    key={index}
                                    style={styles.catCard}
                                    onPress={() => {
                                        // Navigate to a filtered list or internal screen
                                        if (cat.name === "Interview Modules") {
                                            navigation.navigate("InterviewModules");
                                        } else {
                                            // Future: Navigate to Generic Resource List filtered by category
                                            console.log("Open category:", cat.name);
                                        }
                                    }}
                                >
                                    <LinearGradient
                                        colors={cat.color || ["#9CA3AF", "#6B7280"]}
                                        style={styles.catGradient}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 1 }}
                                    >
                                        <MaterialCommunityIcons name={cat.icon || "folder-outline"} size={32} color="#FFF" />
                                    </LinearGradient>
                                    <View style={styles.catContent}>
                                        <Text style={styles.catName}>{cat.name}</Text>
                                        <View style={styles.catBadge}>
                                            <Text style={styles.catCount}>View Files</Text>
                                        </View>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}
                </View>

                {/* MANDATORY MODULES (OJT) */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Mandatory Modules (OJT)</Text>
                    <Text style={[styles.sectionTitle, { fontSize: 13, fontFamily: 'Poppins_400Regular', color: '#6B7280', marginTop: -5, marginBottom: 15 }]}>
                        Process & Framework for Waffle Manufacturing
                    </Text>
                    <View style={styles.grid}>
                        {MANDATORY_MODULES.map((mod) => (
                            <TouchableOpacity
                                key={mod.id}
                                style={styles.catCard}
                                onPress={() => navigation.navigate("ModuleDetail", { moduleName: mod.name })}
                            >
                                <LinearGradient
                                    colors={mod.color}
                                    style={styles.catGradient}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                >
                                    <MaterialCommunityIcons name={mod.icon} size={32} color="#FFF" />
                                </LinearGradient>
                                <View style={styles.catContent}>
                                    <Text style={styles.catName}>{mod.name}</Text>
                                    <View style={styles.catBadge}>
                                        <Text style={styles.catCount}>{mod.count} modules</Text>
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
                        <TouchableOpacity style={{ padding: 4 }} onPress={fetchData}>
                            <Feather name="refresh-cw" size={14} color="#F59E0B" />
                        </TouchableOpacity>
                    </View>

                    {loading ? <ActivityIndicator size="small" /> : (
                        resources.length === 0 ? (
                            <Text style={{ textAlign: 'center', color: '#9CA3AF', fontStyle: 'italic', marginTop: 10 }}>No recent uploads.</Text>
                        ) : (
                            resources.map((item, index) => (
                                <View key={index} style={styles.fileRow}>
                                    <View style={[styles.fileIcon, {
                                        backgroundColor: item.type === 'Video' ? '#FEF2F2' : item.type === 'PDF' ? '#EFF6FF' : '#F0FDF4'
                                    }]}>
                                        <MaterialCommunityIcons
                                            name={item.type === 'Video' ? "file-video-outline" : item.type === 'PDF' ? "file-pdf-box" : "file-document-outline"}
                                            size={24}
                                            color={item.type === 'Video' ? "#EF4444" : item.type === 'PDF' ? "#3B82F6" : "#10B981"}
                                        />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.fileName}>{item.title}</Text>
                                        <Text style={styles.fileMeta}>{item.type} • {item.category} • {new Date(item.timestamp).toLocaleDateString()}</Text>
                                    </View>
                                    <Feather name="download" size={20} color="#9CA3AF" />
                                </View>
                            ))
                        )
                    )}
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
