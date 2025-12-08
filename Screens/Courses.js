import React, { useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Dimensions,
} from "react-native";
import { MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import CoursePath from "../Components/CoursePath";
import QuizSection from "../Components/QuizSection";

const { width } = Dimensions.get("window");

const LEADERBOARD_DATA = [
    { id: 1, name: "Rahul S.", points: 2400, rank: 1 },
    { id: 2, name: "Priya M.", points: 2150, rank: 2 },
    { id: 3, name: "Amit K.", points: 1980, rank: 3 },
    { id: 4, name: "Sneha G.", points: 1850, rank: 4 },
];

export default function Courses() {
    const insets = useSafeAreaInsets();
    const [activeTab, setActiveTab] = useState('path'); // 'path' or 'quizzes'

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>

            {/* HEADER SECTION (Fixed at Top) */}
            <View style={styles.header}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <View>
                        <Text style={styles.pageTitle}>My Learning Path</Text>
                        <Text style={styles.subTitle}>Unit 2: Espresso Mastery</Text>
                    </View>
                    <View style={styles.xpContainer}>
                        <MaterialCommunityIcons name="lightning-bolt" size={20} color="#F59E0B" />
                        <Text style={styles.xpText}>1,240 XP</Text>
                    </View>
                </View>

                {/* SEGMENTED TOGGLE */}
                <View style={styles.toggleContainer}>
                    <TouchableOpacity
                        style={[styles.toggleBtn, activeTab === 'path' && styles.activeToggle]}
                        onPress={() => setActiveTab('path')}
                    >
                        <Text style={[styles.toggleText, activeTab === 'path' && styles.activeToggleText]}>Path</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.toggleBtn, activeTab === 'quizzes' && styles.activeToggle]}
                        onPress={() => setActiveTab('quizzes')}
                    >
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={[styles.toggleText, activeTab === 'quizzes' && styles.activeToggleText]}>AI Quizzes</Text>
                            {activeTab !== 'quizzes' && <View style={styles.dot} />}
                        </View>
                    </TouchableOpacity>
                </View>
            </View>

            {/* MAIN CONTENT */}
            <View style={{ flex: 1 }}>
                {activeTab === 'path' ? (
                    <CoursePath />
                ) : (
                    <QuizSection />
                )}
            </View>

        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#F9FAFB",
    },
    header: {
        paddingHorizontal: 20,
        paddingBottom: 0, // Removed bottom padding as toggle sits on bottom
        backgroundColor: "#FFF",
        borderBottomWidth: 1,
        borderBottomColor: "#F3F4F6",
        paddingTop: 10,
        zIndex: 10,
        elevation: 4,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
    },
    pageTitle: {
        fontSize: 24,
        fontFamily: "Poppins_700Bold",
        color: "#111827",
    },
    subTitle: {
        fontSize: 14,
        fontFamily: "Poppins_500Medium",
        color: "#F59E0B",
    },
    xpContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: "#FFF7ED",
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: "#FCD34D",
    },
    xpText: {
        marginLeft: 4,
        fontSize: 14,
        fontFamily: "Poppins_600SemiBold",
        color: "#D97706",
    },

    // TOGGLE
    toggleContainer: {
        flexDirection: 'row',
        marginTop: 10,
    },
    toggleBtn: {
        paddingVertical: 12,
        marginRight: 24,
        borderBottomWidth: 3,
        borderBottomColor: 'transparent',
    },
    activeToggle: {
        borderBottomColor: '#F59E0B',
    },
    toggleText: {
        fontSize: 16,
        fontFamily: "Poppins_500Medium",
        color: "#9CA3AF",
    },
    activeToggleText: {
        color: "#111827",
        fontFamily: "Poppins_600SemiBold",
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: "#EF4444",
        marginLeft: 6,
    },

    leaderboardTeaser: {
        marginTop: 20,
    },
    lbHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    lbTitle: {
        fontSize: 14,
        fontFamily: "Poppins_600SemiBold",
        color: "#4B5563",
    },
    lbLink: {
        fontSize: 12,
        fontFamily: "Poppins_500Medium",
        color: "#F59E0B",
    },
    lbCard: {
        marginRight: 15,
        alignItems: 'center',
    },
    lbAvatar: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: "#E5E7EB",
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 4,
        borderWidth: 2,
        borderColor: "#FFF",
    },
    lbRank: {
        fontSize: 14,
        fontFamily: "Poppins_700Bold",
        color: "#6B7280",
    },
    lbName: {
        fontSize: 12,
        fontFamily: "Poppins_500Medium",
        color: "#111827",
    },
    lbPoints: {
        fontSize: 10,
        fontFamily: "Poppins_400Regular",
        color: "#F59E0B",
    },
});
