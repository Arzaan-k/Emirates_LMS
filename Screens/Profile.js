import React, { useState } from "react";
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
import Svg, { Circle, G, Text as SvgText } from "react-native-svg";

const { width } = Dimensions.get("window");

// --- MOCK DATA ---
const COMPLETED_LESSONS = [
    { id: 1, title: "Espresso Mastery 101", date: "Dec 05", score: "100%", icon: "coffee" },
    { id: 2, title: "Hygiene Protocols", date: "Dec 04", score: "95%", icon: "shield-check" },
    { id: 3, title: "Customer Empathy", date: "Dec 02", score: "90%", icon: "heart-outline" },
];

const INCOMPLETE_LESSONS = [
    { id: 4, title: "Advanced Waffle Textures", progress: 0.7, due: "Today" },
    { id: 5, title: "Inventory Management", progress: 0.3, due: "Tomorrow" },
];

const EXTRA_CREDIT = [
    { id: 6, title: "Mystery Shopper Sim", xp: "+500 XP", tag: "RECOMMENDED" },
    { id: 7, title: "Speed Service Drill", xp: "+200 XP", tag: "OPTIONAL" },
];

const BADGES = [
    { id: 1, name: "Early Bird", icon: "weather-sunny", color: "#F59E0B", bg: "#FEF3C7" },
    { id: 2, name: "Fast Learner", icon: "lightning-bolt", color: "#EF4444", bg: "#FEE2E2" },
    { id: 3, name: "Team Player", icon: "account-group", color: "#3B82F6", bg: "#DBEAFE" },
    { id: 4, name: "Safety First", icon: "shield-check", color: "#10B981", bg: "#D1FAE5" },
];

// --- INTERACTIVE DONUT CHART ---
const DonutChart = () => {
    const size = 180;
    const strokeWidth = 20;
    const center = size / 2;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;

    // Data: Completed, Incomplete, Extra
    const total = 50 + 20 + 30;
    const data = [
        { key: 'completed', value: 50, color: '#10B981', label: 'Completed' },
        { key: 'incomplete', value: 20, color: '#EF4444', label: 'Incomplete' },
        { key: 'extra', value: 30, color: '#F59E0B', label: 'Extra Credit' },
    ];

    const [activeSection, setActiveSection] = useState(data[0]);

    let startAngle = -90;

    return (
        <View style={styles.chartContainer}>
            <View style={styles.chartTitleRow}>
                <Text style={styles.chartMainTitle}>Learning Breakdown</Text>
                <TouchableOpacity style={styles.chartFilter}><Text style={styles.chartFilterText}>This Week</Text></TouchableOpacity>
            </View>

            <View style={styles.chartRow}>
                <View style={{ width: size, height: size }}>
                    <Svg width={size} height={size}>
                        <G rotation="-90" origin={`${center}, ${center}`}>
                            {data.map((item, index) => {
                                const strokeDashoffset = circumference - (circumference * item.value) / 100;
                                const angle = (item.value / 100) * 360;
                                const currentAngle = startAngle;
                                startAngle += angle;

                                return (
                                    <Circle
                                        key={item.key}
                                        cx={center}
                                        cy={center}
                                        r={radius}
                                        stroke={item.color}
                                        strokeWidth={activeSection.key === item.key ? strokeWidth + 6 : strokeWidth}
                                        strokeDasharray={`${circumference} ${circumference}`}
                                        strokeDashoffset={strokeDashoffset}
                                        strokeLinecap="round"
                                        rotation={(currentAngle + 90) + (index * 2)} // mild gap
                                        origin={`${center}, ${center}`}
                                        onPress={() => setActiveSection(item)}
                                    />
                                );
                            })}
                        </G>
                        {/* Center Text */}
                        <SvgText x={center} y={center - 10} textAnchor="middle" fontSize="28" fontWeight="bold" fill="#111827">
                            {activeSection.value}%
                        </SvgText>
                        <SvgText x={center} y={center + 15} textAnchor="middle" fontSize="12" fill="#6B7280" fontFamily="Poppins_500Medium">
                            {activeSection.label}
                        </SvgText>
                    </Svg>
                </View>

                {/* LEGEND */}
                <View style={styles.legendContainer}>
                    {data.map((item) => (
                        <TouchableOpacity
                            key={item.key}
                            style={[styles.legendItem, activeSection.key === item.key && styles.legendItemActive]}
                            onPress={() => setActiveSection(item)}
                        >
                            <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                            <View>
                                <Text style={styles.legendVal}>{item.value}%</Text>
                                <Text style={styles.legendLabel}>{item.label}</Text>
                            </View>
                        </TouchableOpacity>
                    ))}
                </View>
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
                        colors={["#4F46E5", "#7C3AED"]}
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

                {/* ANALYTICS GRAPH */}
                <DonutChart />

                {/* SECTIONS LIST */}
                <View style={styles.listSection}>

                    {/* INCOMPLETE */}
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>In Progress ⏳</Text>
                        <TouchableOpacity><Text style={styles.seeAll}>See All</Text></TouchableOpacity>
                    </View>
                    {INCOMPLETE_LESSONS.map((item) => (
                        <View key={item.id} style={styles.taskCard}>
                            <View>
                                <Text style={styles.taskTitle}>{item.title}</Text>
                                <Text style={styles.taskDue}>Due: {item.due}</Text>
                            </View>
                            <View style={styles.progressCircle}>
                                <Text style={styles.progressText}>{item.progress * 100}%</Text>
                            </View>
                        </View>
                    ))}

                    <View style={{ height: 20 }} />

                    {/* COMPLETED */}
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Completed ✅</Text>
                        <TouchableOpacity><Text style={styles.seeAll}>History</Text></TouchableOpacity>
                    </View>
                    {COMPLETED_LESSONS.map((item) => (
                        <View key={item.id} style={styles.completedCard}>
                            <View style={styles.completedIcon}>
                                <MaterialCommunityIcons name={item.icon} size={20} color="#10B981" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.completedTitle}>{item.title}</Text>
                                <Text style={styles.completedDate}>{item.date}</Text>
                            </View>
                            <View style={styles.scoreBadge}>
                                <Text style={styles.scoreText}>{item.score}</Text>
                            </View>
                        </View>
                    ))}

                    <View style={{ height: 20 }} />

                    {/* EXTRA CREDIT */}
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Extra Credit 🚀</Text>
                    </View>
                    {EXTRA_CREDIT.map((item) => (
                        <LinearGradient key={item.id} colors={['#FFF7ED', '#FFF']} style={styles.extraCard}>
                            <View>
                                <View style={styles.extraTag}><Text style={styles.extraTagText}>{item.tag}</Text></View>
                                <Text style={styles.extraTitle}>{item.title}</Text>
                            </View>
                            <View style={styles.xpBadge}>
                                <Text style={styles.xpBadgeText}>{item.xp}</Text>
                            </View>
                        </LinearGradient>
                    ))}
                </View>

                {/* BADGES */}
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

            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#F9FAFB" },
    header: { backgroundColor: "#FFF", paddingBottom: 20, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, paddingHorizontal: 20, elevation: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10 },
    identityRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, marginTop: 10 },
    avatarWrapper: { position: 'relative' },
    avatar: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: "#F3F4F6" },
    onlineIndicator: { position: 'absolute', bottom: 2, right: 2, width: 14, height: 14, borderRadius: 7, backgroundColor: "#10B981", borderWidth: 2, borderColor: "#FFF" },
    userInfo: { flex: 1, marginLeft: 16 },
    userName: { fontSize: 20, fontFamily: "Poppins_700Bold", color: "#111827" },
    userRole: { fontSize: 12, fontFamily: "Poppins_400Regular", color: "#6B7280", marginBottom: 4 },
    joinDateBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: "#F3F4F6", alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
    joinDateText: { fontSize: 10, color: "#6B7280", marginLeft: 4, fontFamily: "Poppins_500Medium" },
    settingsBtn: { padding: 10, backgroundColor: "#F3F4F6", borderRadius: 12 },

    leagueCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderRadius: 24 },
    leagueInfo: { flexDirection: 'row', alignItems: 'center' },
    leagueIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.2)", justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    leagueTitle: { color: "#FFF", fontSize: 16, fontFamily: "Poppins_700Bold" },
    leagueRank: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontFamily: "Poppins_500Medium" },
    xpBlock: { alignItems: 'flex-end' },
    xpBig: { color: "#FFF", fontSize: 22, fontFamily: "Poppins_700Bold" },
    xpLabel: { color: "rgba(255,255,255,0.8)", fontSize: 10, fontFamily: "Poppins_500Medium" },

    // CHART
    chartContainer: { backgroundColor: "#FFF", margin: 20, borderRadius: 24, padding: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
    chartTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    chartMainTitle: { fontSize: 16, fontFamily: "Poppins_700Bold", color: "#111827" },
    chartFilter: { backgroundColor: "#F3F4F6", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
    chartFilterText: { fontSize: 12, fontFamily: "Poppins_600SemiBold", color: "#4B5563" },
    chartRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    legendContainer: { flex: 1, marginLeft: 20 },
    legendItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, padding: 8, borderRadius: 12 },
    legendItemActive: { backgroundColor: '#F9FAFB' },
    legendDot: { width: 12, height: 12, borderRadius: 6, marginRight: 12 },
    legendVal: { fontSize: 16, fontFamily: "Poppins_700Bold", color: "#111827" },
    legendLabel: { fontSize: 12, fontFamily: "Poppins_400Regular", color: "#6B7280" },

    // LIST SECTIONS
    listSection: { paddingHorizontal: 20 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    sectionTitle: { fontSize: 16, fontFamily: "Poppins_700Bold", color: "#111827" },
    seeAll: { fontSize: 13, color: "#F59E0B", fontFamily: "Poppins_600SemiBold" },

    taskCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: "#FFF", padding: 16, borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: '#F3F4F6' },
    taskTitle: { fontSize: 14, fontFamily: "Poppins_600SemiBold", color: "#111827" },
    taskDue: { fontSize: 12, color: "#EF4444", fontFamily: "Poppins_500Medium", marginTop: 2 },
    progressCircle: { width: 40, height: 40, borderRadius: 20, borderWidth: 3, borderColor: "#E5E7EB", justifyContent: 'center', alignItems: 'center' },
    progressText: { fontSize: 10, fontFamily: "Poppins_700Bold", color: "#4B5563" },

    completedCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: "#FFF", padding: 12, borderRadius: 16, marginBottom: 10 },
    completedIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#D1FAE5", justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    completedTitle: { fontSize: 14, fontFamily: "Poppins_600SemiBold", color: "#111827" },
    completedDate: { fontSize: 12, color: "#9CA3AF", fontFamily: "Poppins_400Regular" },
    scoreBadge: { backgroundColor: "#D1FAE5", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    scoreText: { color: "#10B981", fontSize: 12, fontFamily: "Poppins_700Bold" },

    extraCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: '#FED7AA' },
    extraTag: { backgroundColor: "#FFEDD5", alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginBottom: 4 },
    extraTagText: { fontSize: 10, color: "#C2410C", fontFamily: "Poppins_700Bold" },
    extraTitle: { fontSize: 14, fontFamily: "Poppins_600SemiBold", color: "#111827" },
    xpBadge: { backgroundColor: "#C2410C", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
    xpBadgeText: { color: "#FFF", fontSize: 12, fontFamily: "Poppins_700Bold" },

    // BADGES
    section: { paddingVertical: 24 },
    badgeCard: { marginRight: 16, alignItems: 'center', width: 90 },
    badgeCircle: { width: 70, height: 70, borderRadius: 35, justifyContent: 'center', alignItems: 'center', marginBottom: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
    badgeName: { fontSize: 12, fontFamily: "Poppins_500Medium", color: "#374151", textAlign: 'center' },
});
