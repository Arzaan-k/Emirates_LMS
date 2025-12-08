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
import { Feather, MaterialCommunityIcons, FontAwesome5 } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Rect, Text as SvgText } from "react-native-svg";

const { width } = Dimensions.get("window");

const BADGES = [
    { id: 1, name: "Early Bird", icon: "weather-sunny", color: "#F59E0B", bg: "#FEF3C7" },
    { id: 2, name: "Fast Learner", icon: "lightning-bolt", color: "#EF4444", bg: "#FEE2E2" },
    { id: 3, name: "Team Player", icon: "account-group", color: "#3B82F6", bg: "#DBEAFE" },
    { id: 4, name: "Safety First", icon: "shield-check", color: "#10B981", bg: "#D1FAE5" },
    { id: 5, name: "Coffee Guru", icon: "coffee", color: "#78350F", bg: "#FEF3C7" },
];

const AI_INSIGHTS = [
    { type: 'strength', text: "You're in the top 5% for Latte Art!", icon: 'trending-up', color: '#10B981' },
    { type: 'focus', text: "Focus strictly on Grinder Calibration this week.", icon: 'target', color: '#F59E0B' },
];

// Simple Bar Chart Component
const ActivityChart = () => {
    const data = [40, 65, 30, 80, 55, 90, 45];
    const max = 100;
    const barWidth = 12;
    const spacing = 20;
    const chartHeight = 120;
    const labels = ["M", "T", "W", "T", "F", "S", "S"];

    return (
        <View style={styles.chartCard}>
            <View style={styles.chartHeader}>
                <View>
                    <Text style={styles.chartTitle}>Learning Activity</Text>
                    <Text style={styles.chartSubtitle}>+12% vs last week</Text>
                </View>
                <View style={styles.chartBadge}>
                    <Text style={styles.chartBadgeText}>Weekly</Text>
                </View>
            </View>

            <View style={{ alignItems: 'center' }}>
                <Svg height={chartHeight + 30} width={width - 80}>
                    {data.map((value, index) => (
                        <React.Fragment key={index}>
                            <Rect
                                x={index * (barWidth + spacing)}
                                y={chartHeight - (value / max) * chartHeight}
                                width={barWidth}
                                height={(value / max) * chartHeight}
                                fill={value > 70 ? "#F59E0B" : "#E5E7EB"}
                                rx={6}
                            />
                            <SvgText
                                x={index * (barWidth + spacing) + barWidth / 2}
                                y={chartHeight + 20}
                                fontSize="12"
                                fontFamily="Poppins_500Medium"
                                fill="#9CA3AF"
                                textAnchor="middle"
                            >
                                {labels[index]}
                            </SvgText>
                        </React.Fragment>
                    ))}
                </Svg>
            </View>
        </View>
    );
};

export default function Profile() {
    const insets = useSafeAreaInsets();

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>

                {/* HEADER & IDENTITY */}
                <View style={styles.header}>
                    <View style={styles.identityRow}>
                        <View style={styles.avatarWrapper}>
                            <Image
                                source={{ uri: "https://ui-avatars.com/api/?name=Aditya+User&background=F59E0B&color=fff&size=200" }}
                                style={styles.avatar}
                            />
                            <View style={styles.onlineIndicator} />
                        </View>
                        <View style={styles.userInfo}>
                            <Text style={styles.userName}>Aditya User</Text>
                            <Text style={styles.userRole}>Store Manager • Mumbai</Text>
                            <View style={styles.joinDateBadge}>
                                <Feather name="calendar" size={10} color="#6B7280" />
                                <Text style={styles.joinDateText}>Joined Nov 2024</Text>
                            </View>
                        </View>
                        <TouchableOpacity style={styles.settingsBtn}>
                            <Feather name="settings" size={20} color="#374151" />
                        </TouchableOpacity>
                    </View>

                    {/* LEAGUE CARD */}
                    <LinearGradient
                        colors={["#4F46E5", "#7C3AED"]} // Indigo to Violet
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.leagueCard}
                    >
                        <View style={styles.leagueInfo}>
                            <View style={styles.leagueIcon}>
                                <MaterialCommunityIcons name="trophy" size={24} color="#FBBF24" />
                            </View>
                            <View>
                                <Text style={styles.leagueTitle}>Diamond League</Text>
                                <Text style={styles.leagueRank}>Rank #4 • Top 5%</Text>
                            </View>
                        </View>
                        <View style={styles.xpBlock}>
                            <Text style={styles.xpBig}>2,400</Text>
                            <Text style={styles.xpLabel}>Total XP</Text>
                        </View>
                    </LinearGradient>
                </View>

                {/* AI INSIGHTS */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>✨ AI Coach Insights</Text>
                    </View>
                    {AI_INSIGHTS.map((insight, index) => (
                        <View key={index} style={[styles.insightCard, { borderLeftColor: insight.color }]}>
                            <View style={[styles.insightIcon, { backgroundColor: insight.color + '20' }]}>
                                <MaterialCommunityIcons name={insight.icon} size={20} color={insight.color} />
                            </View>
                            <Text style={styles.insightText}>{insight.text}</Text>
                        </View>
                    ))}
                </View>

                {/* STATS GRID */}
                <View style={styles.statsGrid}>
                    <View style={styles.miniStat}>
                        <Text style={styles.miniVal}>12</Text>
                        <Text style={styles.miniLbl}>Certificates</Text>
                    </View>
                    <View style={styles.miniStat}>
                        <Text style={styles.miniVal}>84%</Text>
                        <Text style={styles.miniLbl}>Avg Score</Text>
                    </View>
                    <View style={styles.miniStat}>
                        <Text style={styles.miniVal}>52h</Text>
                        <Text style={styles.miniLbl}>Learning</Text>
                    </View>
                </View>

                {/* ACTIVITY CHART */}
                <ActivityChart />

                {/* BADGES SCROLL */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Achievements</Text>
                        <TouchableOpacity><Text style={styles.seeAll}>See All</Text></TouchableOpacity>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: 20 }}>
                        {BADGES.map((badge) => (
                            <View key={badge.id} style={styles.badgeCard}>
                                <View style={[styles.badgeCircle, { backgroundColor: badge.bg }]}>
                                    <MaterialCommunityIcons name={badge.icon} size={32} color={badge.color} />
                                </View>
                                <Text style={styles.badgeName}>{badge.name}</Text>
                            </View>
                        ))}
                    </ScrollView>
                </View>

                {/* MENU */}
                <View style={styles.menuList}>
                    <TouchableOpacity style={styles.menuRow}>
                        <View style={styles.menuIconBg}><Feather name="bell" size={18} color="#374151" /></View>
                        <Text style={styles.menuLabel}>Notifications</Text>
                        <Feather name="chevron-right" size={18} color="#9CA3AF" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.menuRow}>
                        <View style={styles.menuIconBg}><Feather name="help-circle" size={18} color="#374151" /></View>
                        <Text style={styles.menuLabel}>Help & Support</Text>
                        <Feather name="chevron-right" size={18} color="#9CA3AF" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.menuRow}>
                        <View style={[styles.menuIconBg, { backgroundColor: '#FEE2E2' }]}><Feather name="log-out" size={18} color="#EF4444" /></View>
                        <Text style={[styles.menuLabel, { color: '#EF4444' }]}>Log Out</Text>
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
        backgroundColor: "#FFF",
        paddingBottom: 20,
        borderBottomLeftRadius: 30,
        borderBottomRightRadius: 30,
        paddingHorizontal: 20,
        elevation: 4,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
    },
    identityRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 24,
        marginTop: 10,
    },
    avatarWrapper: {
        position: 'relative',
    },
    avatar: {
        width: 64,
        height: 64,
        borderRadius: 32,
        borderWidth: 2,
        borderColor: "#F3F4F6",
    },
    onlineIndicator: {
        position: 'absolute',
        bottom: 2,
        right: 2,
        width: 14,
        height: 14,
        borderRadius: 7,
        backgroundColor: "#10B981",
        borderWidth: 2,
        borderColor: "#FFF",
    },
    userInfo: {
        flex: 1,
        marginLeft: 16,
    },
    userName: {
        fontSize: 20,
        fontFamily: "Poppins_700Bold",
        color: "#111827",
    },
    userRole: {
        fontSize: 12,
        fontFamily: "Poppins_400Regular",
        color: "#6B7280",
        marginBottom: 4,
    },
    joinDateBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: "#F3F4F6",
        alignSelf: 'flex-start',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 8,
    },
    joinDateText: {
        fontSize: 10,
        color: "#6B7280",
        marginLeft: 4,
        fontFamily: "Poppins_500Medium",
    },
    settingsBtn: {
        padding: 10,
        backgroundColor: "#F3F4F6",
        borderRadius: 12,
    },

    // LEAGUE CARD
    leagueCard: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderRadius: 24,
    },
    leagueInfo: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    leagueIcon: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: "rgba(255,255,255,0.2)",
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    leagueTitle: {
        color: "#FFF",
        fontSize: 16,
        fontFamily: "Poppins_700Bold",
    },
    leagueRank: {
        color: "rgba(255,255,255,0.8)",
        fontSize: 12,
        fontFamily: "Poppins_500Medium",
    },
    xpBlock: {
        alignItems: 'flex-end',
    },
    xpBig: {
        color: "#FFF",
        fontSize: 22,
        fontFamily: "Poppins_700Bold",
    },
    xpLabel: {
        color: "rgba(255,255,255,0.8)",
        fontSize: 10,
        fontFamily: "Poppins_500Medium",
    },

    // SECTIONS
    section: {
        paddingVertical: 24,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 18,
        fontFamily: "Poppins_700Bold",
        color: "#111827",
    },
    seeAll: {
        fontSize: 13,
        color: "#F59E0B",
        fontFamily: "Poppins_600SemiBold",
    },

    // INSIGHTS
    insightCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: "#FFF",
        marginHorizontal: 20,
        marginBottom: 10,
        padding: 16,
        borderRadius: 16,
        borderLeftWidth: 4,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.03,
        shadowRadius: 4,
        elevation: 2,
    },
    insightIcon: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    insightText: {
        flex: 1,
        fontSize: 13,
        fontFamily: "Poppins_500Medium",
        color: "#374151",
        lineHeight: 20,
    },

    // STATS GRID
    statsGrid: {
        flexDirection: 'row',
        paddingHorizontal: 20,
        justifyContent: 'space-between',
        marginBottom: 20,
    },
    miniStat: {
        width: '31%',
        backgroundColor: "#FFF",
        paddingVertical: 14,
        borderRadius: 16,
        alignItems: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.03,
        shadowRadius: 4,
        elevation: 1,
    },
    miniVal: {
        fontSize: 18,
        fontFamily: "Poppins_700Bold",
        color: "#111827",
        marginBottom: 2,
    },
    miniLbl: {
        fontSize: 11,
        color: "#9CA3AF",
        fontFamily: "Poppins_500Medium",
    },

    // CHART
    chartCard: {
        marginHorizontal: 20,
        backgroundColor: "#FFF",
        padding: 20,
        borderRadius: 24,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.03,
        shadowRadius: 8,
        elevation: 2,
    },
    chartHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 20,
    },
    chartTitle: {
        fontSize: 16,
        fontFamily: "Poppins_700Bold",
        color: "#111827",
    },
    chartSubtitle: {
        fontSize: 12,
        color: "#10B981",
        fontFamily: "Poppins_500Medium",
    },
    chartBadge: {
        backgroundColor: "#F3F4F6",
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 20,
    },
    chartBadgeText: {
        fontSize: 11,
        color: "#6B7280",
        fontFamily: "Poppins_600SemiBold",
    },

    // BADGES
    badgeCard: {
        marginRight: 16,
        alignItems: 'center',
        width: 90,
    },
    badgeCircle: {
        width: 70,
        height: 70,
        borderRadius: 35,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 10,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    badgeName: {
        fontSize: 12,
        fontFamily: "Poppins_500Medium",
        color: "#374151",
        textAlign: 'center',
    },

    // MENU
    menuList: {
        paddingHorizontal: 20,
        marginTop: 20,
    },
    menuRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: "#FFF",
        padding: 16,
        borderRadius: 16,
        marginBottom: 12,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.02,
        shadowRadius: 2,
        elevation: 1,
    },
    menuIconBg: {
        width: 36,
        height: 36,
        borderRadius: 12,
        backgroundColor: "#F3F4F6",
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 14,
    },
    menuLabel: {
        flex: 1,
        fontSize: 14,
        fontFamily: "Poppins_500Medium",
        color: "#374151",
    },
});
