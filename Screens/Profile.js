import React from "react";
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Image,
    TouchableOpacity,
    Dimensions,
} from "react-native";
import { Feather, Ionicons, FontAwesome5 } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Rect, G, Text as SvgText } from "react-native-svg";

const { width } = Dimensions.get("window");

const BADGES = [
    { id: 1, name: "Early Bird", icon: "sun", color: "#F59E0B" },
    { id: 2, name: "Fast Learner", icon: "zap", color: "#EF4444" },
    { id: 3, name: "Team Player", icon: "users", color: "#3B82F6" },
    { id: 4, name: "Safety First", icon: "shield", color: "#10B981" },
];

// Simple Bar Chart Component
const SimpleBarChart = () => {
    const data = [40, 65, 30, 80, 55, 90, 45]; // Random activity data
    const max = 100;
    const barWidth = 20;
    const spacing = 15;
    const chartHeight = 150;

    return (
        <View style={styles.chartContainer}>
            <Text style={styles.chartTitle}>Learning Activity</Text>
            <Svg height={chartHeight} width="100%">
                {data.map((value, index) => (
                    <React.Fragment key={index}>
                        {/* Bar */}
                        <Rect
                            x={index * (barWidth + spacing) + 10}
                            y={chartHeight - (value / max) * chartHeight}
                            width={barWidth}
                            height={(value / max) * chartHeight}
                            fill={value > 70 ? "#F59E0B" : "#E5E7EB"}
                            rx={6}
                        />
                        {/* Day Label */}
                        <SvgText
                            x={index * (barWidth + spacing) + 10 + barWidth / 2}
                            y={chartHeight + 15}
                            fontSize="10"
                            fill="#9CA3AF"
                            textAnchor="middle"
                        >
                            {["M", "T", "W", "T", "F", "S", "S"][index]}
                        </SvgText>
                    </React.Fragment>
                ))}
            </Svg>
        </View>
    );
};

export default function Profile() {
    const insets = useSafeAreaInsets();

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

                {/* HEADER SECTION */}
                <View style={styles.header}>
                    <View style={styles.profileHeader}>
                        <View style={styles.avatarContainer}>
                            <Image
                                source={{ uri: "https://ui-avatars.com/api/?name=Aditya+User&background=F59E0B&color=fff&size=200" }}
                                style={styles.avatar}
                            />
                            <View style={styles.editBtn}>
                                <Feather name="edit-2" size={14} color="#FFF" />
                            </View>
                        </View>
                        <Text style={styles.userName}>Aditya User</Text>
                        <Text style={styles.userRole}>Store Manager • Mumbai</Text>

                        {/* LEVEL BAR */}
                        <View style={styles.levelContainer}>
                            <View style={styles.levelInfo}>
                                <Text style={styles.levelText}>Level 5</Text>
                                <Text style={styles.xpText}>2400 / 3000 XP</Text>
                            </View>
                            <View style={styles.xpBarBg}>
                                <LinearGradient
                                    colors={["#F59E0B", "#D97706"]}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                    style={[styles.xpBarFill, { width: "80%" }]}
                                />
                            </View>
                        </View>
                    </View>
                </View>

                {/* ANALYTICS SECTION */}
                <View style={styles.statsRow}>
                    <View style={styles.statCard}>
                        <Text style={styles.statValue}>12</Text>
                        <Text style={styles.statLabel}>Courses Done</Text>
                    </View>
                    <View style={styles.statCard}>
                        <Text style={styles.statValue}>4.5h</Text>
                        <Text style={styles.statLabel}>Watch Time</Text>
                    </View>
                    <View style={styles.statCard}>
                        <Text style={styles.statValue}>8</Text>
                        <Text style={styles.statLabel}>Certificates</Text>
                    </View>
                </View>

                {/* VISUALIZATION CHART */}
                <SimpleBarChart />

                {/* BADGES GRID */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Earned Badges</Text>
                        <TouchableOpacity><Text style={styles.seeAll}>See All</Text></TouchableOpacity>
                    </View>
                    <View style={styles.badgesGrid}>
                        {BADGES.map((badge) => (
                            <View key={badge.id} style={styles.badgeItem}>
                                <View style={[styles.badgeIcon, { backgroundColor: badge.color + "20" }]}>
                                    <Feather name={badge.icon} size={24} color={badge.color} />
                                </View>
                                <Text style={styles.badgeName}>{badge.name}</Text>
                            </View>
                        ))}
                    </View>
                </View>

                {/* SETTINGS MENU */}
                <View style={styles.menuSection}>
                    <TouchableOpacity style={styles.menuItem}>
                        <Feather name="settings" size={20} color="#374151" />
                        <Text style={styles.menuText}>Account Settings</Text>
                        <Feather name="chevron-right" size={20} color="#9CA3AF" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.menuItem}>
                        <Feather name="bell" size={20} color="#374151" />
                        <Text style={styles.menuText}>Notifications</Text>
                        <Feather name="chevron-right" size={20} color="#9CA3AF" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.menuItem}>
                        <Feather name="log-out" size={20} color="#EF4444" />
                        <Text style={[styles.menuText, { color: "#EF4444" }]}>Log Out</Text>
                    </TouchableOpacity>
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
        alignItems: 'center',
        paddingVertical: 20,
        backgroundColor: "#FFF",
        borderBottomLeftRadius: 30,
        borderBottomRightRadius: 30,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 5,
    },
    profileHeader: {
        alignItems: 'center',
        width: '100%',
        paddingHorizontal: 40,
    },
    avatarContainer: {
        position: 'relative',
        marginBottom: 16,
    },
    avatar: {
        width: 100,
        height: 100,
        borderRadius: 50,
        borderWidth: 4,
        borderColor: "#F59E0B",
    },
    editBtn: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        backgroundColor: "#111827",
        padding: 8,
        borderRadius: 20,
        borderWidth: 2,
        borderColor: "#FFF",
    },
    userName: {
        fontSize: 22,
        fontFamily: "Poppins_700Bold",
        color: "#111827",
    },
    userRole: {
        fontSize: 14,
        fontFamily: "Poppins_400Regular",
        color: "#6B7280",
        marginBottom: 20,
    },
    levelContainer: {
        width: '100%',
    },
    levelInfo: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    levelText: {
        fontSize: 14,
        fontFamily: "Poppins_600SemiBold",
        color: "#F59E0B",
    },
    xpText: {
        fontSize: 12,
        fontFamily: "Poppins_500Medium",
        color: "#9CA3AF",
    },
    xpBarBg: {
        height: 8,
        backgroundColor: "#F3F4F6",
        borderRadius: 4,
        overflow: 'hidden',
    },
    xpBarFill: {
        height: '100%',
        borderRadius: 4,
    },
    // STATS
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        marginTop: 20,
    },
    statCard: {
        width: '31%',
        backgroundColor: "#FFF",
        paddingVertical: 16,
        borderRadius: 16,
        alignItems: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 2,
    },
    statValue: {
        fontSize: 20,
        fontFamily: "Poppins_700Bold",
        color: "#111827",
    },
    statLabel: {
        fontSize: 10,
        fontFamily: "Poppins_500Medium",
        color: "#9CA3AF",
        marginTop: 4,
    },
    // CHART
    chartContainer: {
        marginTop: 24,
        marginHorizontal: 20,
        backgroundColor: "#FFF",
        borderRadius: 20,
        padding: 20,
        height: 220,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 2,
    },
    chartTitle: {
        fontSize: 16,
        fontFamily: "Poppins_600SemiBold",
        color: "#111827",
        marginBottom: 20,
    },
    // BADGES
    section: {
        marginTop: 24,
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
        fontFamily: "Poppins_600SemiBold",
        color: "#111827",
    },
    seeAll: {
        fontSize: 14,
        fontFamily: "Poppins_500Medium",
        color: "#F59E0B",
    },
    badgesGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },
    badgeItem: {
        width: '23%', // 4 items
        alignItems: 'center',
        marginBottom: 12,
    },
    badgeIcon: {
        width: 60,
        height: 60,
        borderRadius: 30,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    badgeName: {
        fontSize: 10,
        fontFamily: "Poppins_500Medium",
        color: "#374151",
        textAlign: 'center',
    },
    // MENU
    menuSection: {
        marginTop: 30,
        paddingHorizontal: 20,
        marginBottom: 20,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: "#FFF",
        padding: 16,
        borderRadius: 16,
        marginBottom: 12,
    },
    menuText: {
        flex: 1,
        marginLeft: 16,
        fontSize: 14,
        fontFamily: "Poppins_500Medium",
        color: "#374151",
    },
});
