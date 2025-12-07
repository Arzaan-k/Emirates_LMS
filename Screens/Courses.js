import React, { useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TextInput,
    TouchableOpacity,
    Image,
    FlatList,
    Dimensions,
} from "react-native";
import { Feather, Ionicons, FontAwesome5 } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";

const { width } = Dimensions.get("window");

// Mock Data
const COURSES_DATA = [
    {
        id: "1",
        title: "Mastering Espresso",
        category: "Barista Skills",
        level: "Advanced",
        duration: "45 min",
        rating: 4.9,
        image: "https://images.unsplash.com/photo-1572442388796-11668a67e53d?q=80&w=2000&auto=format&fit=crop",
    },
    {
        id: "2",
        title: "Hygiene & Safety Level 2",
        category: "Safety",
        level: "Intermediate",
        duration: "60 min",
        rating: 4.7,
        image: "https://images.unsplash.com/photo-1628177142898-93e36e4e3a50?q=80&w=2000&auto=format&fit=crop",
    },
    {
        id: "3",
        title: "Inventory Control",
        category: "Management",
        level: "Intermediate",
        duration: "30 min",
        rating: 4.6,
        image: "https://images.unsplash.com/photo-1553413077-190dd305871c?q=80&w=2000&auto=format&fit=crop",
    },
    {
        id: "4",
        title: "Customer Service Magic",
        category: "Service",
        level: "Beginner",
        duration: "20 min",
        rating: 4.9,
        image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=2000&auto=format&fit=crop",
    },
    {
        id: "5",
        title: "The Perfect Waffle Mix",
        category: "Kitchen",
        level: "Expert",
        duration: "90 min",
        rating: 5.0,
        image: "https://images.unsplash.com/photo-1562608420-532c201fac48?q=80&w=2000&auto=format&fit=crop",
    },
];

const LEADERBOARD_DATA = [
    { id: 1, name: "Rahul S.", points: 2400, avatar: "https://ui-avatars.com/api/?name=Rahul+S&background=F59E0B&color=fff", rank: 1 },
    { id: 2, name: "Priya M.", points: 2150, avatar: "https://ui-avatars.com/api/?name=Priya+M&background=D97706&color=fff", rank: 2 },
    { id: 3, name: "Amit K.", points: 1980, avatar: "https://ui-avatars.com/api/?name=Amit+K&background=B45309&color=fff", rank: 3 },
    { id: 4, name: "Sneha G.", points: 1850, avatar: "https://ui-avatars.com/api/?name=Sneha+G&background=78350F&color=fff", rank: 4 },
];

export default function Courses() {
    const insets = useSafeAreaInsets();
    const [activeFilter, setActiveFilter] = useState("All");

    const RenderCourseCard = ({ item }) => (
        <TouchableOpacity style={styles.cardContainer}>
            <Image source={{ uri: item.image }} style={styles.cardImage} />
            <View style={styles.cardOverlay}>
                <View style={styles.levelBadge}>
                    <Text style={styles.levelText}>{item.level}</Text>
                </View>
            </View>
            <View style={styles.cardContent}>
                <View style={styles.cardHeader}>
                    <Text style={styles.cardCategory}>{item.category}</Text>
                    <View style={styles.ratingContainer}>
                        <Ionicons name="star" size={12} color="#F59E0B" />
                        <Text style={styles.ratingText}>{item.rating}</Text>
                    </View>
                </View>
                <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
                <View style={styles.cardFooter}>
                    <View style={styles.durationContainer}>
                        <Feather name="clock" size={12} color="#9CA3AF" />
                        <Text style={styles.durationText}>{item.duration}</Text>
                    </View>
                    <TouchableOpacity style={styles.startButton}>
                        <Text style={styles.startBtnText}>Start</Text>
                        <Feather name="arrow-right" size={14} color="#FFF" />
                    </TouchableOpacity>
                </View>
            </View>
        </TouchableOpacity>
    );

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
                {/* HEADER */}
                <View style={styles.header}>
                    <Text style={styles.pageTitle}>Explore Courses</Text>
                    <TouchableOpacity style={styles.filterBtn}>
                        <Ionicons name="filter" size={20} color="#111827" />
                    </TouchableOpacity>
                </View>

                {/* SEARCH */}
                <View style={styles.searchBox}>
                    <Feather name="search" size={18} color="#9CA3AF" style={styles.searchIcon} />
                    <TextInput
                        placeholder="Search for skills, topics..."
                        style={styles.input}
                        placeholderTextColor="#9CA3AF"
                    />
                </View>

                {/* GAMIFICATION: TOP LEARNERS */}
                <View style={styles.leaderboardSection}>
                    <Text style={styles.sectionTitle}>🏆 Top Learners This Week</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
                        {LEADERBOARD_DATA.map((user) => (
                            <View key={user.id} style={styles.leaderCard}>
                                {user.rank <= 3 && (
                                    <View style={styles.rankBadge}>
                                        <Text style={styles.rankText}>#{user.rank}</Text>
                                    </View>
                                )}
                                <Image source={{ uri: user.avatar }} style={styles.leaderAvatar} />
                                <Text style={styles.leaderName}>{user.name}</Text>
                                <Text style={styles.leaderPoints}>{user.points} XP</Text>
                            </View>
                        ))}
                    </ScrollView>
                </View>

                {/* ALL COURSES GRID */}
                <View style={styles.coursesSection}>
                    <Text style={styles.sectionTitle}>All Courses</Text>
                    <View style={styles.grid}>
                        {COURSES_DATA.map((item) => (
                            <RenderCourseCard key={item.id} item={item} />
                        ))}
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
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        marginBottom: 16,
        marginTop: 10,
    },
    pageTitle: {
        fontSize: 24,
        fontFamily: "Poppins_700Bold",
        color: "#111827",
    },
    filterBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: "#E5E7EB",
        justifyContent: "center",
        alignItems: "center",
    },
    searchBox: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#FFF",
        marginHorizontal: 20,
        borderRadius: 14,
        paddingHorizontal: 16,
        height: 50,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 2,
        marginBottom: 24,
    },
    searchIcon: {
        marginRight: 10,
    },
    input: {
        flex: 1,
        fontFamily: "Poppins_400Regular",
        fontSize: 14,
        color: "#111827",
    },
    sectionTitle: {
        fontSize: 18,
        fontFamily: "Poppins_600SemiBold",
        color: "#111827",
        paddingHorizontal: 20,
    },
    // LEADERBOARD
    leaderboardSection: {
        marginBottom: 30,
    },
    leaderCard: {
        alignItems: 'center',
        marginRight: 16,
        marginLeft: 4, // for first item shadow
        backgroundColor: "#FFF",
        padding: 12,
        borderRadius: 16,
        width: 100,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 3,
        position: 'relative',
        marginBottom: 10, // shadow space
    },
    rankBadge: {
        position: 'absolute',
        top: -10,
        right: -5,
        backgroundColor: "#F59E0B",
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: "#FFF",
    },
    rankText: {
        color: "#FFF",
        fontSize: 10,
        fontFamily: "Poppins_700Bold",
    },
    leaderAvatar: {
        width: 50,
        height: 50,
        borderRadius: 25,
        marginBottom: 8,
    },
    leaderName: {
        fontSize: 12,
        fontFamily: "Poppins_500Medium",
        color: "#374151",
        textAlign: 'center',
    },
    leaderPoints: {
        fontSize: 10,
        fontFamily: "Poppins_700Bold",
        color: "#D97706",
    },
    // COURSES GRID
    coursesSection: {
        paddingBottom: 20,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: 10, // outer padding
        justifyContent: 'space-between',
        marginTop: 12,
    },
    cardContainer: {
        width: (width / 2) - 20,
        marginHorizontal: 10,
        backgroundColor: "#FFF",
        borderRadius: 16,
        marginBottom: 20,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 3,
        overflow: 'hidden',
    },
    cardImage: {
        width: '100%',
        height: 120,
    },
    cardOverlay: {
        position: 'absolute',
        top: 8,
        left: 8,
    },
    levelBadge: {
        backgroundColor: "rgba(0,0,0,0.6)",
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
    },
    levelText: {
        color: "#FFF",
        fontSize: 10,
        fontFamily: "Poppins_500Medium",
    },
    cardContent: {
        padding: 12,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    cardCategory: {
        fontSize: 10,
        fontFamily: "Poppins_500Medium",
        color: "#F59E0B",
        textTransform: "uppercase",
    },
    ratingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    ratingText: {
        fontSize: 10,
        fontFamily: "Poppins_600SemiBold",
        color: "#374151",
        marginLeft: 2,
    },
    cardTitle: {
        fontSize: 14,
        fontFamily: "Poppins_600SemiBold",
        color: "#111827",
        marginBottom: 10,
        lineHeight: 20,
        height: 40, // fix height for 2 lines
    },
    cardFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    durationContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    durationText: {
        fontSize: 10,
        fontFamily: "Poppins_400Regular",
        color: "#6B7280",
        marginLeft: 4,
    },
    startButton: {
        backgroundColor: "#111827",
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
    },
    startBtnText: {
        color: "#FFF",
        fontSize: 10,
        fontFamily: "Poppins_600SemiBold",
        marginRight: 4,
    },
});
