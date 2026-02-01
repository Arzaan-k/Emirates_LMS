// Screens/Recommendations.js
// AI-Powered Course Recommendation Screen with Skill Gap Analysis

import React, { useState, useEffect, useCallback } from "react";
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Dimensions,
    ActivityIndicator,
    RefreshControl,
    Modal,
} from "react-native";
import { MaterialCommunityIcons, Feather, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import Animated, {
    FadeInDown,
    FadeInRight,
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withSequence,
    withTiming
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import API_URL from "../config";

const { width, height } = Dimensions.get("window");

// --- SKILL GAP CARD COMPONENT ---
const SkillGapCard = ({ skill, index, onPress }) => {
    const getGapColor = (level) => {
        switch (level) {
            case "critical": return ["#EF4444", "#DC2626"];
            case "moderate": return ["#F59E0B", "#D97706"];
            case "minor": return ["#10B981", "#059669"];
            case "none": return ["#3B82F6", "#2563EB"];
            default: return ["#6B7280", "#4B5563"];
        }
    };

    const getGapLabel = (level) => {
        switch (level) {
            case "critical": return "Needs Focus";
            case "moderate": return "Improving";
            case "minor": return "Good";
            case "none": return "Excellent";
            default: return "Unexplored";
        }
    };

    const colors = getGapColor(skill.gap_level);

    return (
        <Animated.View entering={FadeInRight.delay(index * 100).springify()}>
            <TouchableOpacity
                style={styles.skillCard}
                activeOpacity={0.8}
                onPress={onPress}
            >
                <LinearGradient
                    colors={[colors[0] + "20", colors[1] + "10"]}
                    style={styles.skillCardGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                >
                    <View style={[styles.skillIconContainer, { backgroundColor: colors[0] + "30" }]}>
                        <MaterialCommunityIcons name={skill.icon || "school"} size={24} color={colors[0]} />
                    </View>
                    <View style={styles.skillInfo}>
                        <Text style={styles.skillName}>{skill.skill_name}</Text>
                        <View style={styles.skillMeta}>
                            <View style={[styles.gapBadge, { backgroundColor: colors[0] + "20" }]}>
                                <Text style={[styles.gapLabel, { color: colors[0] }]}>
                                    {getGapLabel(skill.gap_level)}
                                </Text>
                            </View>
                            <Text style={styles.skillAttempts}>
                                {skill.attempts > 0 ? `${skill.attempts} attempts` : "Not started"}
                            </Text>
                        </View>
                    </View>
                    <View style={styles.skillScore}>
                        <Text style={[styles.scoreValue, { color: colors[0] }]}>
                            {Math.round(skill.percentage)}%
                        </Text>
                        <View style={styles.progressBar}>
                            <View
                                style={[
                                    styles.progressFill,
                                    { width: `${skill.percentage}%`, backgroundColor: colors[0] }
                                ]}
                            />
                        </View>
                    </View>
                </LinearGradient>
            </TouchableOpacity>
        </Animated.View>
    );
};

// --- RECOMMENDED COURSE CARD ---
const RecommendedCourseCard = ({ course, index, onStart }) => {
    const getPriorityStyle = (priority) => {
        switch (priority) {
            case "high": return { bg: "#FEE2E2", color: "#DC2626", icon: "fire" };
            case "medium": return { bg: "#FEF3C7", color: "#D97706", icon: "trending-up" };
            case "low": return { bg: "#D1FAE5", color: "#059669", icon: "leaf" };
            default: return { bg: "#E0E7FF", color: "#4F46E5", icon: "star" };
        }
    };

    const priorityStyle = getPriorityStyle(course.priority);

    return (
        <Animated.View entering={FadeInDown.delay(200 + index * 150).springify()}>
            <TouchableOpacity
                style={styles.courseCard}
                activeOpacity={0.9}
                onPress={() => onStart(course)}
            >
                <LinearGradient
                    colors={["#1F2937", "#111827"]}
                    style={styles.courseCardGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                >
                    {/* Priority Badge */}
                    <View style={[styles.priorityBadge, { backgroundColor: priorityStyle.bg }]}>
                        <MaterialCommunityIcons
                            name={priorityStyle.icon}
                            size={14}
                            color={priorityStyle.color}
                        />
                        <Text style={[styles.priorityText, { color: priorityStyle.color }]}>
                            {course.priority?.toUpperCase()} PRIORITY
                        </Text>
                    </View>

                    {/* Course Title */}
                    <Text style={styles.courseTitle} numberOfLines={2}>
                        {course.course_title || course.course_data?.title}
                    </Text>

                    {/* AI Reason */}
                    <View style={styles.reasonContainer}>
                        <MaterialCommunityIcons name="robot" size={16} color="#818CF8" />
                        <Text style={styles.reasonText} numberOfLines={3}>
                            {course.reason}
                        </Text>
                    </View>

                    {/* Skill Addressed */}
                    {course.skill_addressed && (
                        <View style={styles.skillAddressed}>
                            <MaterialCommunityIcons name="target" size={14} color="#10B981" />
                            <Text style={styles.skillAddressedText}>
                                Strengthens: {course.skill_addressed}
                            </Text>
                        </View>
                    )}

                    {/* Expected Improvement */}
                    {course.expected_improvement && (
                        <View style={styles.improvementContainer}>
                            <MaterialCommunityIcons name="trending-up" size={14} color="#F59E0B" />
                            <Text style={styles.improvementText} numberOfLines={2}>
                                {course.expected_improvement}
                            </Text>
                        </View>
                    )}

                    {/* Start Button */}
                    <TouchableOpacity
                        style={styles.startButton}
                        onPress={() => onStart(course)}
                    >
                        <LinearGradient
                            colors={["#6366F1", "#4F46E5"]}
                            style={styles.startButtonGradient}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                        >
                            <Text style={styles.startButtonText}>Start Learning</Text>
                            <Feather name="arrow-right" size={18} color="#FFF" />
                        </LinearGradient>
                    </TouchableOpacity>

                    {/* XP Badge */}
                    <View style={styles.xpBadge}>
                        <MaterialCommunityIcons name="star-four-points" size={14} color="#F59E0B" />
                        <Text style={styles.xpText}>+{course.course_data?.xp || 50} XP</Text>
                    </View>
                </LinearGradient>
            </TouchableOpacity>
        </Animated.View>
    );
};

// --- PROFILE SUMMARY CARD ---
const ProfileSummaryCard = ({ profile, skillGaps }) => {
    const weakCount = skillGaps?.filter(g => g.needs_improvement).length || 0;
    const strongCount = skillGaps?.filter(g => g.gap_level === "none" && g.attempts > 0).length || 0;

    return (
        <Animated.View entering={FadeInDown.springify()}>
            <LinearGradient
                colors={["#6366F1", "#4F46E5", "#4338CA"]}
                style={styles.profileCard}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
            >
                {/* Decorative Elements */}
                <View style={styles.decorCircle1} />
                <View style={styles.decorCircle2} />

                <View style={styles.profileHeader}>
                    <View style={styles.profileIcon}>
                        <MaterialCommunityIcons name="brain" size={28} color="#FFF" />
                    </View>
                    <View style={styles.profileTitleContainer}>
                        <Text style={styles.profileTitle}>Your Learning Profile</Text>
                        <Text style={styles.profileSubtitle}>AI-Powered Insights</Text>
                    </View>
                </View>

                <View style={styles.statsRow}>
                    <View style={styles.statItem}>
                        <View style={styles.statIcon}>
                            <MaterialCommunityIcons name="star" size={20} color="#F59E0B" />
                        </View>
                        <Text style={styles.statValue}>{profile?.total_xp || 0}</Text>
                        <Text style={styles.statLabel}>Total XP</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                        <View style={styles.statIcon}>
                            <MaterialCommunityIcons name="book-check" size={20} color="#10B981" />
                        </View>
                        <Text style={styles.statValue}>{profile?.courses_completed || 0}</Text>
                        <Text style={styles.statLabel}>Courses</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                        <View style={styles.statIcon}>
                            <MaterialCommunityIcons name="alert-circle" size={20} color="#EF4444" />
                        </View>
                        <Text style={styles.statValue}>{weakCount}</Text>
                        <Text style={styles.statLabel}>To Improve</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                        <View style={styles.statIcon}>
                            <MaterialCommunityIcons name="check-circle" size={20} color="#3B82F6" />
                        </View>
                        <Text style={styles.statValue}>{strongCount}</Text>
                        <Text style={styles.statLabel}>Strong</Text>
                    </View>
                </View>
            </LinearGradient>
        </Animated.View>
    );
};

// --- AI ADVICE CARD ---
const AIAdviceCard = ({ advice, focusAreas }) => {
    if (!advice) return null;

    return (
        <Animated.View entering={FadeInDown.delay(100).springify()}>
            <View style={styles.adviceCard}>
                <View style={styles.adviceHeader}>
                    <LinearGradient
                        colors={["#818CF8", "#6366F1"]}
                        style={styles.adviceIconGradient}
                    >
                        <MaterialCommunityIcons name="robot-happy" size={24} color="#FFF" />
                    </LinearGradient>
                    <View>
                        <Text style={styles.adviceTitle}>AI Learning Coach</Text>
                        <Text style={styles.adviceSubtitle}>Personalized for you</Text>
                    </View>
                </View>

                <Text style={styles.adviceText}>{advice}</Text>

                {focusAreas && focusAreas.length > 0 && (
                    <View style={styles.focusAreasContainer}>
                        <Text style={styles.focusAreasTitle}>Priority Focus Areas:</Text>
                        <View style={styles.focusAreasTags}>
                            {focusAreas.map((area, idx) => (
                                <View key={idx} style={styles.focusAreaTag}>
                                    <MaterialCommunityIcons name="target" size={12} color="#6366F1" />
                                    <Text style={styles.focusAreaText}>{area}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                )}
            </View>
        </Animated.View>
    );
};

// --- MAIN RECOMMENDATIONS SCREEN ---
export default function Recommendations({ navigation }) {
    const insets = useSafeAreaInsets();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [recommendations, setRecommendations] = useState([]);
    const [profile, setProfile] = useState(null);
    const [skillGaps, setSkillGaps] = useState([]);
    const [advice, setAdvice] = useState("");
    const [focusAreas, setFocusAreas] = useState([]);
    const [activeTab, setActiveTab] = useState("recommendations"); // recommendations, skills
    const [error, setError] = useState(null);
    const [userEmail, setUserEmail] = useState(null);

    // Get user email from AsyncStorage on mount
    useEffect(() => {
        const getUserEmail = async () => {
            try {
                // Try to get stored user profile
                const storedProfile = await AsyncStorage.getItem('userProfile');
                if (storedProfile) {
                    const profile = JSON.parse(storedProfile);
                    if (profile.email) {
                        console.log('[Recommendations] Got user email from profile:', profile.email);
                        setUserEmail(profile.email);
                        return;
                    }
                }

                // Fallback: Try userEmail key directly
                const storedEmail = await AsyncStorage.getItem('userEmail');
                if (storedEmail) {
                    console.log('[Recommendations] Got user email from userEmail key:', storedEmail);
                    setUserEmail(storedEmail);
                    return;
                }

                // Last resort: use default
                console.log('[Recommendations] No user email found, using default');
                setUserEmail('user');
            } catch (e) {
                console.error('[Recommendations] Error getting user email:', e);
                setUserEmail('user');
            }
        };
        getUserEmail();
    }, []);

    const fetchRecommendations = async () => {
        if (!userEmail) return;

        try {
            setError(null);
            console.log(`[Recommendations] Fetching for user: ${userEmail}`);
            const response = await fetch(`${API_URL}/api/v1/analytics/recommendations/${encodeURIComponent(userEmail)}?limit=5`);
            const data = await response.json();

            if (data.status === "success") {
                setRecommendations(data.recommendations || []);
                setAdvice(data.overall_advice || "");
                setFocusAreas(data.focus_areas || []);
                setSkillGaps(data.skill_gaps || []);
                setProfile(data.profile_summary || {});
            } else {
                setError("Failed to load recommendations");
            }
        } catch (err) {
            console.error("Fetch recommendations error:", err);
            setError("Unable to connect to server");
        }
    };

    const fetchProfile = async () => {
        if (!userEmail) return;

        try {
            const response = await fetch(`${API_URL}/api/v1/analytics/profile/${encodeURIComponent(userEmail)}`);
            const data = await response.json();

            if (data.status === "success") {
                setProfile(data.profile);
                setSkillGaps(data.skill_gaps || []);
            }
        } catch (err) {
            console.error("Fetch profile error:", err);
        }
    };

    const loadData = async () => {
        if (!userEmail) return;

        setLoading(true);
        await Promise.all([fetchRecommendations(), fetchProfile()]);
        setLoading(false);
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    }, [userEmail]);

    // Load data when userEmail becomes available
    useEffect(() => {
        if (userEmail) {
            loadData();
        }
    }, [userEmail]);

    const handleStartCourse = async (course) => {
        // Track interaction
        try {
            const formData = new FormData();
            formData.append("user_email", userEmail);
            formData.append("interaction_type", "start");
            formData.append("content_id", course.course_id || course.course_data?.id);
            formData.append("content_type", "course");
            formData.append("metadata", JSON.stringify({ from_recommendation: true }));

            await fetch(`${API_URL}/api/v1/analytics/track/interaction`, {
                method: "POST",
                body: formData,
            });
        } catch (err) {
            console.error("Track interaction error:", err);
        }

        // Navigate to Home with CoursesTab - Courses is a nested tab inside Home
        // We navigate to Home and it will handle displaying the video/course
        navigation.navigate("Home", {
            screen: "CoursesTab",
            params: course.course_data?.videoUrl ? { autoPlay: course.course_data } : undefined,
        });
    };

    if (loading) {
        return (
            <View style={[styles.container, styles.loadingContainer]}>
                <ActivityIndicator size="large" color="#6366F1" />
                <Text style={styles.loadingText}>Analyzing your learning profile...</Text>
                <Text style={styles.loadingSubtext}>AI is generating personalized recommendations</Text>
            </View>
        );
    }

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => navigation.goBack()}
                >
                    <Feather name="arrow-left" size={24} color="#FFF" />
                </TouchableOpacity>
                <View style={styles.headerTitleContainer}>
                    <Text style={styles.headerTitle}>AI Recommendations</Text>
                    <Text style={styles.headerSubtitle}>Personalized learning path</Text>
                </View>
                <TouchableOpacity
                    style={styles.refreshButton}
                    onPress={onRefresh}
                >
                    <Feather name="refresh-cw" size={20} color="#818CF8" />
                </TouchableOpacity>
            </View>

            {/* Tab Switcher */}
            <View style={styles.tabContainer}>
                <TouchableOpacity
                    style={[
                        styles.tab,
                        activeTab === "recommendations" && styles.activeTab
                    ]}
                    onPress={() => setActiveTab("recommendations")}
                >
                    <MaterialCommunityIcons
                        name="lightbulb-on"
                        size={18}
                        color={activeTab === "recommendations" ? "#FFF" : "#9CA3AF"}
                    />
                    <Text style={[
                        styles.tabText,
                        activeTab === "recommendations" && styles.activeTabText
                    ]}>
                        For You
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[
                        styles.tab,
                        activeTab === "skills" && styles.activeTab
                    ]}
                    onPress={() => setActiveTab("skills")}
                >
                    <MaterialCommunityIcons
                        name="chart-bar"
                        size={18}
                        color={activeTab === "skills" ? "#FFF" : "#9CA3AF"}
                    />
                    <Text style={[
                        styles.tabText,
                        activeTab === "skills" && styles.activeTabText
                    ]}>
                        Skill Gaps
                    </Text>
                </TouchableOpacity>
            </View>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor="#6366F1"
                        colors={["#6366F1"]}
                    />
                }
            >
                {/* Profile Summary */}
                <ProfileSummaryCard profile={profile} skillGaps={skillGaps} />

                {activeTab === "recommendations" ? (
                    <>
                        {/* AI Advice */}
                        <AIAdviceCard advice={advice} focusAreas={focusAreas} />

                        {/* Recommendations Section */}
                        <View style={styles.sectionHeader}>
                            <MaterialCommunityIcons name="school" size={22} color="#6366F1" />
                            <Text style={styles.sectionTitle}>Recommended For You</Text>
                        </View>

                        {recommendations.length > 0 ? (
                            recommendations.map((course, index) => (
                                <RecommendedCourseCard
                                    key={course.course_id || index}
                                    course={course}
                                    index={index}
                                    onStart={handleStartCourse}
                                />
                            ))
                        ) : (
                            <View style={styles.emptyState}>
                                <MaterialCommunityIcons name="check-all" size={48} color="#10B981" />
                                <Text style={styles.emptyTitle}>Great job!</Text>
                                <Text style={styles.emptyText}>
                                    You've completed all available courses. Check back later for new content!
                                </Text>
                            </View>
                        )}
                    </>
                ) : (
                    <>
                        {/* Skills Analysis Section */}
                        <View style={styles.sectionHeader}>
                            <MaterialCommunityIcons name="chart-timeline-variant" size={22} color="#6366F1" />
                            <Text style={styles.sectionTitle}>Your Skill Analysis</Text>
                        </View>

                        {skillGaps.length > 0 ? (
                            skillGaps.map((skill, index) => (
                                <SkillGapCard
                                    key={skill.skill_key}
                                    skill={skill}
                                    index={index}
                                    onPress={() => {
                                        // Could navigate to skill-specific courses
                                        setActiveTab("recommendations");
                                    }}
                                />
                            ))
                        ) : (
                            <View style={styles.emptyState}>
                                <MaterialCommunityIcons name="school-outline" size={48} color="#6B7280" />
                                <Text style={styles.emptyTitle}>Start Learning</Text>
                                <Text style={styles.emptyText}>
                                    Complete courses and quizzes to see your skill analysis here.
                                </Text>
                            </View>
                        )}
                    </>
                )}

                {/* Bottom Padding */}
                <View style={{ height: 100 }} />
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#0F172A",
    },
    loadingContainer: {
        justifyContent: "center",
        alignItems: "center",
    },
    loadingText: {
        color: "#FFF",
        fontSize: 16,
        fontWeight: "600",
        marginTop: 20,
    },
    loadingSubtext: {
        color: "#9CA3AF",
        fontSize: 14,
        marginTop: 8,
    },

    // Header
    header: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 16,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: "rgba(255,255,255,0.1)",
        justifyContent: "center",
        alignItems: "center",
    },
    headerTitleContainer: {
        flex: 1,
        marginLeft: 12,
    },
    headerTitle: {
        color: "#FFF",
        fontSize: 22,
        fontWeight: "700",
    },
    headerSubtitle: {
        color: "#9CA3AF",
        fontSize: 13,
        marginTop: 2,
    },
    refreshButton: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: "rgba(129, 140, 248, 0.2)",
        justifyContent: "center",
        alignItems: "center",
    },

    // Tabs
    tabContainer: {
        flexDirection: "row",
        marginHorizontal: 16,
        marginBottom: 16,
        backgroundColor: "rgba(255,255,255,0.05)",
        borderRadius: 16,
        padding: 4,
    },
    tab: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 12,
        borderRadius: 12,
        gap: 6,
    },
    activeTab: {
        backgroundColor: "#6366F1",
    },
    tabText: {
        color: "#9CA3AF",
        fontSize: 14,
        fontWeight: "600",
    },
    activeTabText: {
        color: "#FFF",
    },

    // Scroll
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 16,
    },

    // Profile Card
    profileCard: {
        borderRadius: 20,
        padding: 20,
        marginBottom: 16,
        overflow: "hidden",
    },
    decorCircle1: {
        position: "absolute",
        top: -30,
        right: -30,
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: "rgba(255,255,255,0.1)",
    },
    decorCircle2: {
        position: "absolute",
        bottom: -20,
        left: -20,
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: "rgba(255,255,255,0.05)",
    },
    profileHeader: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 20,
    },
    profileIcon: {
        width: 50,
        height: 50,
        borderRadius: 16,
        backgroundColor: "rgba(255,255,255,0.2)",
        justifyContent: "center",
        alignItems: "center",
        marginRight: 12,
    },
    profileTitleContainer: {},
    profileTitle: {
        color: "#FFF",
        fontSize: 18,
        fontWeight: "700",
    },
    profileSubtitle: {
        color: "rgba(255,255,255,0.7)",
        fontSize: 13,
        marginTop: 2,
    },
    statsRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    statItem: {
        alignItems: "center",
        flex: 1,
    },
    statIcon: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: "rgba(255,255,255,0.15)",
        justifyContent: "center",
        alignItems: "center",
        marginBottom: 8,
    },
    statValue: {
        color: "#FFF",
        fontSize: 20,
        fontWeight: "700",
    },
    statLabel: {
        color: "rgba(255,255,255,0.7)",
        fontSize: 11,
        marginTop: 4,
    },
    statDivider: {
        width: 1,
        height: 40,
        backgroundColor: "rgba(255,255,255,0.2)",
    },

    // AI Advice Card
    adviceCard: {
        backgroundColor: "rgba(255,255,255,0.05)",
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: "rgba(129, 140, 248, 0.3)",
    },
    adviceHeader: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 12,
    },
    adviceIconGradient: {
        width: 44,
        height: 44,
        borderRadius: 12,
        justifyContent: "center",
        alignItems: "center",
        marginRight: 12,
    },
    adviceTitle: {
        color: "#FFF",
        fontSize: 16,
        fontWeight: "700",
    },
    adviceSubtitle: {
        color: "#9CA3AF",
        fontSize: 12,
        marginTop: 2,
    },
    adviceText: {
        color: "#D1D5DB",
        fontSize: 14,
        lineHeight: 22,
    },
    focusAreasContainer: {
        marginTop: 16,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: "rgba(255,255,255,0.1)",
    },
    focusAreasTitle: {
        color: "#9CA3AF",
        fontSize: 12,
        fontWeight: "600",
        marginBottom: 8,
    },
    focusAreasTags: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
    },
    focusAreaTag: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "rgba(99, 102, 241, 0.2)",
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        gap: 4,
    },
    focusAreaText: {
        color: "#A5B4FC",
        fontSize: 12,
        fontWeight: "500",
    },

    // Section Header
    sectionHeader: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 16,
        marginTop: 8,
        gap: 8,
    },
    sectionTitle: {
        color: "#FFF",
        fontSize: 18,
        fontWeight: "700",
    },

    // Skill Card
    skillCard: {
        marginBottom: 12,
        borderRadius: 16,
        overflow: "hidden",
    },
    skillCardGradient: {
        flexDirection: "row",
        alignItems: "center",
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.1)",
    },
    skillIconContainer: {
        width: 48,
        height: 48,
        borderRadius: 14,
        justifyContent: "center",
        alignItems: "center",
        marginRight: 12,
    },
    skillInfo: {
        flex: 1,
    },
    skillName: {
        color: "#FFF",
        fontSize: 16,
        fontWeight: "600",
        marginBottom: 4,
    },
    skillMeta: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    gapBadge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
    },
    gapLabel: {
        fontSize: 10,
        fontWeight: "700",
    },
    skillAttempts: {
        color: "#9CA3AF",
        fontSize: 12,
    },
    skillScore: {
        alignItems: "flex-end",
        width: 60,
    },
    scoreValue: {
        fontSize: 18,
        fontWeight: "700",
        marginBottom: 4,
    },
    progressBar: {
        width: 50,
        height: 4,
        backgroundColor: "rgba(255,255,255,0.1)",
        borderRadius: 2,
        overflow: "hidden",
    },
    progressFill: {
        height: "100%",
        borderRadius: 2,
    },

    // Course Card
    courseCard: {
        marginBottom: 16,
        borderRadius: 20,
        overflow: "hidden",
    },
    courseCardGradient: {
        padding: 20,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.1)",
    },
    priorityBadge: {
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-start",
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 8,
        gap: 4,
        marginBottom: 12,
    },
    priorityText: {
        fontSize: 10,
        fontWeight: "700",
        letterSpacing: 0.5,
    },
    courseTitle: {
        color: "#FFF",
        fontSize: 18,
        fontWeight: "700",
        marginBottom: 12,
        lineHeight: 24,
    },
    reasonContainer: {
        flexDirection: "row",
        backgroundColor: "rgba(129, 140, 248, 0.1)",
        padding: 12,
        borderRadius: 12,
        marginBottom: 12,
        gap: 8,
    },
    reasonText: {
        flex: 1,
        color: "#C7D2FE",
        fontSize: 13,
        lineHeight: 19,
    },
    skillAddressed: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        marginBottom: 8,
    },
    skillAddressedText: {
        color: "#10B981",
        fontSize: 13,
        fontWeight: "500",
    },
    improvementContainer: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 6,
        marginBottom: 16,
    },
    improvementText: {
        flex: 1,
        color: "#FCD34D",
        fontSize: 12,
        lineHeight: 18,
    },
    startButton: {
        borderRadius: 14,
        overflow: "hidden",
    },
    startButtonGradient: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 14,
        gap: 8,
    },
    startButtonText: {
        color: "#FFF",
        fontSize: 15,
        fontWeight: "600",
    },
    xpBadge: {
        position: "absolute",
        top: 20,
        right: 20,
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "rgba(245, 158, 11, 0.2)",
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 8,
        gap: 4,
    },
    xpText: {
        color: "#F59E0B",
        fontSize: 12,
        fontWeight: "700",
    },

    // Empty State
    emptyState: {
        alignItems: "center",
        paddingVertical: 40,
    },
    emptyTitle: {
        color: "#FFF",
        fontSize: 18,
        fontWeight: "600",
        marginTop: 16,
    },
    emptyText: {
        color: "#9CA3AF",
        fontSize: 14,
        textAlign: "center",
        marginTop: 8,
        paddingHorizontal: 20,
        lineHeight: 22,
    },
});
