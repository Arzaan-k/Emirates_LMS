import React, { useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Dimensions,
    TextInput,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform
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

// --- ASK AI CHAT MODAL ---
function AskAIChatModal({ visible, courseData, onClose }) {
    const [question, setQuestion] = useState('');
    const [messages, setMessages] = useState([]); // {role: 'user'|'ai', content: ''}
    const [loading, setLoading] = useState(false);

    const handleSend = async () => {
        if (!question.trim()) return;

        const userMsg = { role: 'user', content: question };
        setMessages(prev => [...prev, userMsg]);
        setQuestion('');
        setLoading(true);

        try {
            const response = await fetch(`${API_URL}/ask-ai`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    course_id: courseData.id,
                    question: userMsg.content
                })
            });
            const data = await response.json();
            console.log(data);

            const aiMsg = { role: 'ai', content: data.answer || "Sorry, I couldn't generate an answer." };
            setMessages(prev => [...prev, aiMsg]);
        } catch (error) {
            const errorMsg = { role: 'ai', content: "Error connecting to AI. Please try again." };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setLoading(false);
        }
    };

    if (!visible || !courseData) return null;

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                style={{ flex: 1, backgroundColor: '#FFF' }}
            >
                {/* HEADER */}
                <View style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View>
                        <Text style={{ fontSize: 18, fontFamily: 'Poppins_700Bold', color: '#111827' }}>Ask AI Assistant</Text>
                        <Text style={{ fontSize: 12, color: '#6B7280', fontFamily: 'Poppins_400Regular' }}>Context: {courseData.title.substring(0, 30)}...</Text>
                    </View>
                    <TouchableOpacity onPress={onClose} style={{ padding: 5 }}>
                        <Feather name="x" size={24} color="#6B7280" />
                    </TouchableOpacity>
                </View>

                {/* MESSAGES */}
                <ScrollView
                    style={{ flex: 1, padding: 20 }}
                    contentContainerStyle={{ paddingBottom: 20 }}
                    ref={ref => ref?.scrollToEnd({ animated: true })}
                >
                    {messages.length === 0 && (
                        <View style={{ alignItems: 'center', marginTop: 50, opacity: 0.7 }}>
                            <MaterialCommunityIcons name="robot-outline" size={60} color="#E5E7EB" />
                            <Text style={{ marginTop: 15, color: '#9CA3AF', fontFamily: 'Poppins_500Medium', textAlign: 'center' }}>
                                Ask me anything about this course!{"\n"}I've watched the video so you don't have to.
                            </Text>
                        </View>
                    )}

                    {messages.map((msg, idx) => (
                        <View key={idx} style={{
                            alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                            backgroundColor: msg.role === 'user' ? '#7C3AED' : '#F3F4F6',
                            padding: 12,
                            borderRadius: 16,
                            borderBottomRightRadius: msg.role === 'user' ? 2 : 16,
                            borderBottomLeftRadius: msg.role === 'ai' ? 2 : 16,
                            marginBottom: 10,
                            maxWidth: '80%'
                        }}>
                            <Text style={{
                                color: msg.role === 'user' ? '#FFF' : '#374151',
                                fontFamily: 'Poppins_400Regular',
                                lineHeight: 20
                            }}>
                                {msg.content}
                            </Text>
                        </View>
                    ))}
                    {loading && (
                        <View style={{ alignSelf: 'flex-start', padding: 12, backgroundColor: '#F3F4F6', borderRadius: 16, borderBottomLeftRadius: 2 }}>
                            <ActivityIndicator size="small" color="#6B7280" />
                        </View>
                    )}
                </ScrollView>

                {/* INPUT */}
                <View style={{ padding: 15, borderTopWidth: 1, borderTopColor: '#F3F4F6', backgroundColor: '#FFF' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 25, paddingHorizontal: 15, borderWidth: 1, borderColor: '#E5E7EB' }}>
                        <TextInput
                            style={{ flex: 1, height: 50, fontFamily: 'Poppins_400Regular' }}
                            placeholder="Type your question..."
                            value={question}
                            onChangeText={setQuestion}
                            onSubmitEditing={handleSend}
                        />
                        <TouchableOpacity
                            onPress={handleSend}
                            disabled={!question.trim() || loading}
                            style={{ padding: 8, backgroundColor: question.trim() ? '#7C3AED' : '#E5E7EB', borderRadius: 20 }}
                        >
                            <Feather name="arrow-up" size={20} color={question.trim() ? "#FFF" : "#9CA3AF"} />
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const AllCourses = () => {
    const [search, setSearch] = useState("");
    const [selectedCat, setSelectedCat] = useState("All");
    const [modalVisible, setModalVisible] = useState(false);
    const [chatVisible, setChatVisible] = useState(false); // [NEW] Chat Modal State
    const [currentVideo, setCurrentVideo] = useState(null);
    const [courses, setCourses] = useState([]);
    const [loading, setLoading] = useState(true);

    // [NEW] Course buckets state
    const [courseBuckets, setCourseBuckets] = useState([]);
    const [loadingBuckets, setLoadingBuckets] = useState(true);

    React.useEffect(() => {
        fetchCourses();
        fetchBuckets();
    }, []);

    // [NEW] Fetch course buckets from API
    const fetchBuckets = async () => {
        setLoadingBuckets(true);
        try {
            const response = await fetch(`${API_URL}/course-buckets`);
            const data = await response.json();
            setCourseBuckets(data);
        } catch (error) {
            console.error("Failed to fetch buckets:", error);
        } finally {
            setLoadingBuckets(false);
        }
    };

    const fetchCourses = async () => {
        try {
            const response = await fetch(`${API_URL}/content`);
            const data = await response.json();
            // Map backend data to UI model
            const mappedCourses = data.map(item => {
                // Find the bucket for this course to get its color
                const bucket = courseBuckets.find(b => b.name === item.bucket);
                return {
                    id: item.id,
                    title: item.title,
                    category: item.bucket || "Uncategorized", // Use bucket as category
                    duration: "Video", // Placeholder
                    rating: 5.0, // Placeholder
                    image: bucket?.icon || "play-circle-outline", // Use bucket icon
                    color: bucket?.color || "#F59E0B",
                    bg: bucket?.color ? `${bucket.color}15` : "#FFF7ED", // Light version of bucket color
                    videoUrl: item.videoUrl,
                    description: item.description,
                    bucket: item.bucket
                };
            });
            setCourses(mappedCourses);
        } catch (error) {
            console.error("Failed to fetch courses:", error);
        } finally {
            setLoading(false);
        }
    };

    // Refetch courses when buckets are loaded to apply colors
    React.useEffect(() => {
        if (courseBuckets.length > 0 && courses.length > 0) {
            // Update course colors based on buckets
            setCourses(prev => prev.map(course => {
                const bucket = courseBuckets.find(b => b.name === course.bucket);
                return {
                    ...course,
                    image: bucket?.icon || "play-circle-outline",
                    color: bucket?.color || "#F59E0B",
                    bg: bucket?.color ? `${bucket.color}15` : "#FFF7ED"
                };
            }));
        }
    }, [courseBuckets]);

    const filteredCourses = courses.filter(c =>
        (selectedCat === "All" || c.category === selectedCat) &&
        c.title.toLowerCase().includes(search.toLowerCase())
    );

    const playVideo = (course) => {
        setCurrentVideo(course);
        setModalVisible(true);
    };

    const openChat = (course) => {
        setCurrentVideo(course); // Set context course
        setChatVisible(true);
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

            {/* CATEGORIES - Dynamic from Course Buckets */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ height: 50, flexGrow: 0, marginBottom: 20 }}
                contentContainerStyle={{ alignItems: 'center', gap: 10 }}
            >
                {/* ALL chip */}
                <TouchableOpacity
                    style={[
                        styles.catChip,
                        selectedCat === "All" && styles.activeCatChip
                    ]}
                    onPress={() => setSelectedCat("All")}
                >
                    <MaterialCommunityIcons
                        name="view-grid"
                        size={14}
                        color={selectedCat === "All" ? "#FFF" : "#6B7280"}
                        style={{ marginRight: 4 }}
                    />
                    <Text style={[
                        styles.catText,
                        selectedCat === "All" && styles.activeCatText
                    ]}>All</Text>
                </TouchableOpacity>

                {/* Uncategorized chip */}
                <TouchableOpacity
                    style={[
                        styles.catChip,
                        selectedCat === "Uncategorized" && styles.activeCatChip
                    ]}
                    onPress={() => setSelectedCat("Uncategorized")}
                >
                    <MaterialCommunityIcons
                        name="folder-outline"
                        size={14}
                        color={selectedCat === "Uncategorized" ? "#FFF" : "#6B7280"}
                        style={{ marginRight: 4 }}
                    />
                    <Text style={[
                        styles.catText,
                        selectedCat === "Uncategorized" && styles.activeCatText
                    ]}>Uncategorized</Text>
                </TouchableOpacity>

                {/* Dynamic bucket chips */}
                {courseBuckets.map((bucket) => (
                    <TouchableOpacity
                        key={bucket.id}
                        style={[
                            styles.catChip,
                            { borderWidth: 1, borderColor: selectedCat === bucket.name ? bucket.color : '#E5E7EB' },
                            selectedCat === bucket.name && { backgroundColor: bucket.color }
                        ]}
                        onPress={() => setSelectedCat(bucket.name)}
                    >
                        <MaterialCommunityIcons
                            name={bucket.icon || "folder"}
                            size={14}
                            color={selectedCat === bucket.name ? "#FFF" : bucket.color}
                            style={{ marginRight: 4 }}
                        />
                        <Text style={[
                            styles.catText,
                            { color: selectedCat === bucket.name ? "#FFF" : "#4B5563" }
                        ]}>{bucket.name}</Text>
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

                            <View style={{ alignItems: 'flex-end', gap: 10 }}>
                                <Feather name="play-circle" size={24} color="#F59E0B" />

                                {/* ASK AI BUTTON */}
                                <TouchableOpacity
                                    onPress={(e) => {
                                        e.stopPropagation(); // Prevent opening video
                                        openChat(course);
                                    }}
                                    style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: '#C7D2FE' }}
                                >
                                    <MaterialCommunityIcons name="robot" size={12} color="#4F46E5" />
                                    <Text style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: '#4F46E5', marginLeft: 4 }}>Ask AI</Text>
                                </TouchableOpacity>
                            </View>
                        </TouchableOpacity>
                    ))
                )}
            </ScrollView>

            <VideoPlayerModal
                visible={modalVisible}
                videoData={currentVideo}
                onClose={() => setModalVisible(false)}
            />

            {/* ASK AI MODAL */}
            <AskAIChatModal
                visible={chatVisible}
                courseData={currentVideo}
                onClose={() => setChatVisible(false)}
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
        flexDirection: 'row',
        alignItems: 'center',
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
