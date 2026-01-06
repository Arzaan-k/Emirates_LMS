import React, { useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Dimensions,
    TextInput,
} from "react-native";
import { MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import CoursePath from "../Components/CoursePath";
import QuizSection from "../Components/QuizSection";

import { Video, ResizeMode } from 'expo-av';
import { Modal } from 'react-native';

const { width, height } = Dimensions.get("window");

// --- VIDEO PLAYER MODAL ---
function VideoPlayerModal({ visible, videoData, onClose }) {
    if (!visible || !videoData) return null;

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
            <View style={{ flex: 1, backgroundColor: '#000' }}>
                {/* CLOSE BUTTON */}
                <TouchableOpacity style={styles.closeVideoBtn} onPress={onClose}>
                    <Feather name="x" size={24} color="#FFF" />
                </TouchableOpacity>

                {/* VIDEO PLAYER */}
                <Video
                    source={{ uri: videoData.videoUrl }}
                    style={{ width: '100%', height: 300, marginTop: 100 }}
                    useNativeControls
                    resizeMode={ResizeMode.CONTAIN}
                    shouldPlay
                    onError={(e) => console.log("Video Error:", e)}
                />

                <View style={{ padding: 20 }}>
                    <Text style={{ color: '#FFF', fontSize: 18, fontFamily: 'Poppins_600SemiBold', marginBottom: 10 }}>{videoData.title}</Text>
                    <Text style={{ color: '#9CA3AF', fontSize: 14, fontFamily: 'Poppins_400Regular' }}>{videoData.category} • {videoData.duration}</Text>
                </View>
            </View>
        </Modal>
    );
}

import API_URL from "../config";

const CATEGORIES = ["All", "Barista Skills", "Food Safety", "Customer Service", "Management"];

const AllCourses = () => {
    const [search, setSearch] = useState("");
    const [selectedCat, setSelectedCat] = useState("All");
    const [modalVisible, setModalVisible] = useState(false);
    const [currentVideo, setCurrentVideo] = useState(null);
    const [courses, setCourses] = useState([]);
    const [loading, setLoading] = useState(true);

    React.useEffect(() => {
        fetchCourses();
    }, []);

    const fetchCourses = async () => {
        try {
            const response = await fetch(`${API_URL}/content`);
            const data = await response.json();
            // Map backend data to UI model
            const mappedCourses = data.map(item => ({
                id: item.id,
                title: item.title,
                category: item.authorRole || "General", // Use authorRole as category for now
                duration: "Video", // Placeholder
                rating: 5.0, // Placeholder
                image: "play-circle-outline", // Default icon
                color: "#F59E0B",
                bg: "#FFF7ED",
                videoUrl: item.videoUrl,
                description: item.description
            }));
            setCourses(mappedCourses);
        } catch (error) {
            console.error("Failed to fetch courses:", error);
        } finally {
            setLoading(false);
        }
    };

    const filteredCourses = courses.filter(c =>
        (selectedCat === "All" || c.category === selectedCat) &&
        c.title.toLowerCase().includes(search.toLowerCase())
    );

    const playVideo = (course) => {
        setCurrentVideo(course);
        setModalVisible(true);
    };

    return (
        <View style={{ flex: 1, padding: 20 }}>
            {/* SEARCH */}
            <View style={styles.searchBox}>
                <Feather name="search" size={20} color="#9CA3AF" />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search courses..."
                    placeholderTextColor="#9CA3AF"
                    value={search}
                    onChangeText={setSearch}
                />
            </View>

            {/* CATEGORIES */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ height: 50, flexGrow: 0, marginBottom: 20 }}
                contentContainerStyle={{ alignItems: 'center', gap: 10 }}
            >
                {CATEGORIES.map((cat) => (
                    <TouchableOpacity
                        key={cat}
                        style={[
                            styles.catChip,
                            selectedCat === cat && styles.activeCatChip
                        ]}
                        onPress={() => setSelectedCat(cat)}
                    >
                        <Text style={[
                            styles.catText,
                            selectedCat === cat && styles.activeCatText
                        ]}>{cat}</Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            {/* COURSE LIST */}
            <ScrollView
                style={{ flex: 1 }}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 40 }}
            >
                {loading ? (
                    <Text style={{ textAlign: 'center', color: '#6B7280', marginTop: 20 }}>Loading courses...</Text>
                ) : filteredCourses.length === 0 ? (
                    <Text style={{ textAlign: 'center', color: '#6B7280', marginTop: 20 }}>No courses found.</Text>
                ) : (
                    filteredCourses.map((course) => (
                        <TouchableOpacity
                            key={course.id}
                            style={styles.courseCard}
                            onPress={() => playVideo(course)}
                        >
                            <View style={[styles.courseIcon, { backgroundColor: course.bg }]}>
                                <MaterialCommunityIcons name={course.image} size={32} color={course.color} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.courseTitle}>{course.title}</Text>
                                <Text style={styles.courseMeta}>{course.category} • {course.duration}</Text>
                                <View style={styles.ratingRow}>
                                    <MaterialCommunityIcons name="star" size={14} color="#F59E0B" />
                                    <Text style={styles.ratingText}>{course.rating}</Text>
                                </View>
                            </View>
                            <Feather name="play-circle" size={24} color="#F59E0B" />
                        </TouchableOpacity>
                    ))
                )}
            </ScrollView>

            <VideoPlayerModal
                visible={modalVisible}
                videoData={currentVideo}
                onClose={() => setModalVisible(false)}
            />
        </View>
    );
};

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
                        </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.toggleBtn, activeTab === 'courses' && styles.activeToggle]}
                        onPress={() => setActiveTab('courses')}
                    >
                        <Text style={[styles.toggleText, activeTab === 'courses' && styles.activeToggleText]}>All Courses</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* MAIN CONTENT */}
            <View style={{ flex: 1 }}>
                {activeTab === 'path' && <CoursePath />}
                {activeTab === 'quizzes' && <QuizSection />}
                {activeTab === 'courses' && <AllCourses />}
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

    // SEARCH & COURSES
    searchBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        borderRadius: 12,
        paddingHorizontal: 15,
        height: 50,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    searchInput: {
        flex: 1,
        marginLeft: 10,
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        color: '#111827',
    },
    catChip: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#F3F4F6',
        marginRight: 10,
    },
    activeCatChip: {
        backgroundColor: '#F59E0B',
    },
    catText: {
        fontSize: 13,
        fontFamily: 'Poppins_500Medium',
        color: '#6B7280',
    },
    activeCatText: {
        color: '#FFF',
        fontFamily: 'Poppins_600SemiBold',
    },
    courseCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        padding: 16,
        borderRadius: 16,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 2,
    },
    courseIcon: {
        width: 50,
        height: 50,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    courseTitle: {
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
        color: '#111827',
        marginBottom: 2,
    },
    courseMeta: {
        fontSize: 12,
        color: '#6B7280',
        fontFamily: 'Poppins_400Regular',
        marginBottom: 4,
    },
    ratingRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    ratingText: {
        fontSize: 12,
        color: '#F59E0B',
        fontFamily: 'Poppins_600SemiBold',
        marginLeft: 4,
    },
    closeVideoBtn: {
        position: 'absolute',
        top: 20,
        right: 20,
        zIndex: 20,
        padding: 10,
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderRadius: 20,
    },
});
