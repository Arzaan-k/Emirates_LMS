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
import SelfLearningView from "../Components/SelfLearningView";
import LessonView from "../Components/LessonView";
import FeedbackFormModal from "../Components/FeedbackFormModal";
import NotificationBell from "../Components/NotificationBell";
import QuizSection from "../Components/QuizSection";
import DailyQuizTab from "../Components/DailyQuizTab";
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Video, ResizeMode } from 'expo-av';
import { Modal } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { WebView } from 'react-native-webview';

const { width, height } = Dimensions.get("window");

// --- FULLSCREEN HANDLER FOR VIDEO COMPONENTS ---
const handleVideoFullscreenUpdate = async ({ fullscreenUpdate }) => {
    switch (fullscreenUpdate) {
        case 1: // FULLSCREEN_UPDATE_PLAYER_WILL_PRESENT
            await ScreenOrientation.unlockAsync();
            break;
        case 3: // FULLSCREEN_UPDATE_PLAYER_WILL_DISMISS
            await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
            break;
    }
};

// --- VIDEO PLAYER MODAL ---
// --- VIDEO PLAYER MODAL WITH TRANSCRIPT & AI TRANSLATION ---
function VideoPlayerModal({ visible, videoData, onClose }) {
    const [transcript, setTranscript] = useState('');
    const [language, setLanguage] = useState('English');
    const [isTranslating, setIsTranslating] = useState(false);
    const [showLangPicker, setShowLangPicker] = useState(false);
    const [searchLang, setSearchLang] = useState('');

    const LANGUAGES = [
        "English",
        // Indian Languages
        "Hindi", "Bengali", "Telugu", "Marathi", "Tamil", "Urdu", "Gujarati",
        "Kannada", "Malayalam", "Odia", "Punjabi", "Assamese", "Maithili",
        "Santali", "Kashmiri", "Nepali", "Konkani", "Sindhi", "Dogri",
        "Manipuri", "Bodo", "Sanskrit",
        // International Languages
        "Spanish", "French", "German", "Chinese", "Japanese", "Arabic", "Portuguese", "Russian"
    ];

    React.useEffect(() => {
        if (videoData) {
            setTranscript(videoData.transcript || "No transcript available.");
            setLanguage('English'); // Default to English or original
        }
    }, [videoData]);

    const handleTranslate = async (targetLang) => {
        setLanguage(targetLang);
        setShowLangPicker(false);

        // If switching back to English (assuming original is English for now), we could cache original. 
        // But for simplicity/robustness with AI, we just translate. 
        // NOTE: In a production app, we'd cache the original text to avoid re-translating to source.

        setIsTranslating(true);
        try {
            const response = await fetch(`${API_URL}/api/v1/ai/translate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: videoData.transcript || "No transcript available.", // Always translate from source
                    target_language: targetLang
                })
            });
            const data = await response.json();
            if (data.translated_text) {
                setTranscript(data.translated_text);
            }
        } catch (error) {
            console.error("Translation error:", error);
            // Fallback or alert (silent fail to keep UI smooth)
        } finally {
            setIsTranslating(false);
        }
    };

    if (!visible || !videoData) return null;

    const filteredLanguages = LANGUAGES.filter(l => l.toLowerCase().includes(searchLang.toLowerCase()));
    const isVideo = videoData.resource_type === 'Video' || (videoData.videoUrl && videoData.videoUrl.match(/\.(mp4|mov|avi|wmv|flv|mkv)$/i));

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
            <View style={{ flex: 1, backgroundColor: '#000' }}>
                {/* CLOSE BUTTON */}
                <TouchableOpacity
                    style={[styles.closeVideoBtn, { position: 'absolute', top: 40, right: 20, zIndex: 10, backgroundColor: 'rgba(0,0,0,0.5)' }]}
                    onPress={onClose}
                >
                    <Feather name="x" size={24} color="#FFF" />
                </TouchableOpacity>

                {/* CONTENT PLAYER */}
                <View style={{ width: '100%', aspectRatio: isVideo ? 16 / 9 : undefined, height: isVideo ? undefined : '100%', backgroundColor: '#000', justifyContent: 'center' }}>

                    {isVideo ? (
                        <Video
                            source={{ uri: videoData.videoUrl || videoData.video_url }}
                            style={{ width: '100%', height: '100%' }}
                            useNativeControls
                            resizeMode={ResizeMode.CONTAIN}
                            shouldPlay
                            onError={(e) => console.log("Video Error:", e)}
                            onFullscreenUpdate={handleVideoFullscreenUpdate}
                        />
                    ) : (
                        Platform.OS === 'web' ? (
                            <iframe
                                src={`https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(videoData.file_url || videoData.videoUrl)}`}
                                style={{ width: '100%', height: '100%', border: 'none' }}
                            />
                        ) : (
                            <WebView
                                source={{ uri: `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(videoData.file_url || videoData.videoUrl)}` }}
                                style={{ flex: 1, backgroundColor: '#FFF' }}
                                startInLoadingState={true}
                                renderLoading={() => <ActivityIndicator size="large" color="#4F46E5" style={{ position: 'absolute', top: '50%', left: '50%' }} />}
                            />
                        )
                    )}
                </View>

                {/* CONTENT CONTAINER */}
                <View style={{ flex: 1, backgroundColor: '#111827', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' }}>
                    {/* Show Details only for Video (Documents assume WebView takes full screen or logic differs) */}
                    {isVideo && (
                        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 50 }}>
                            {/* HEADER INFO */}
                            <Text style={{ color: '#FFF', fontSize: 20, fontFamily: 'Poppins_600SemiBold', marginBottom: 4 }}>{videoData.title}</Text>
                            <Text style={{ color: '#9CA3AF', fontSize: 14, fontFamily: 'Poppins_400Regular', marginBottom: 24 }}>{videoData.category} • {videoData.duration}</Text>

                            {/* TRANSCRIPT HEADER & LANG SELECTOR */}
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                <Text style={{ color: '#E5E7EB', fontSize: 16, fontFamily: 'Poppins_600SemiBold' }}>Transcript</Text>

                                <TouchableOpacity
                                    style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#374151', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 }}
                                    onPress={() => { setSearchLang(''); setShowLangPicker(true); }}
                                >
                                    <MaterialCommunityIcons name="translate" size={16} color="#A5B4FC" style={{ marginRight: 6 }} />
                                    <Text style={{ color: '#E5E7EB', fontSize: 13, fontFamily: 'Poppins_500Medium' }}>{language}</Text>
                                    <Feather name="chevron-down" size={14} color="#9CA3AF" style={{ marginLeft: 4 }} />
                                </TouchableOpacity>
                            </View>

                            {/* TRANSCRIPT TEXT */}
                            {isTranslating ? (
                                <View style={{ padding: 40, alignItems: 'center' }}>
                                    <ActivityIndicator size="small" color="#A5B4FC" />
                                    <Text style={{ color: '#6B7280', fontSize: 12, marginTop: 10, fontFamily: 'Poppins_400Regular' }}>Translating with AI...</Text>
                                </View>
                            ) : (
                                <View style={{ backgroundColor: 'rgba(31, 41, 55, 0.5)', borderRadius: 16, padding: 16, border: '1px solid #374151' }}>
                                    {transcript ? (
                                        <Text style={{ color: '#D1D5DB', fontSize: 14, fontFamily: 'Poppins_400Regular', lineHeight: 24 }}>
                                            {transcript}
                                        </Text>
                                    ) : (
                                        <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                                            <MaterialCommunityIcons name="text-box-remove-outline" size={40} color="#4B5563" />
                                            <Text style={{ color: '#6B7280', fontSize: 14, marginTop: 8, fontFamily: 'Poppins_400Regular' }}>
                                                No transcript available for this video.
                                            </Text>
                                        </View>
                                    )}
                                </View>
                            )}
                        </ScrollView>
                    )}
                </View>


                {/* LANGUAGE PICKER MODAL */}
                <Modal visible={showLangPicker} transparent animationType="fade">
                    <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 }}>
                        <View style={{ backgroundColor: '#1F2937', borderRadius: 20, maxHeight: '70%', overflow: 'hidden' }}>
                            <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#374151', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Text style={{ color: '#FFF', fontSize: 16, fontFamily: 'Poppins_600SemiBold' }}>Select Language</Text>
                                <TouchableOpacity onPress={() => setShowLangPicker(false)}>
                                    <Feather name="x" size={20} color="#9CA3AF" />
                                </TouchableOpacity>
                            </View>

                            <View style={{ padding: 12 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#374151', borderRadius: 10, paddingHorizontal: 10 }}>
                                    <Feather name="search" size={16} color="#9CA3AF" />
                                    <TextInput
                                        style={{ flex: 1, padding: 10, color: '#FFF', fontFamily: 'Poppins_400Regular' }}
                                        placeholder="Search language..."
                                        placeholderTextColor="#6B7280"
                                        value={searchLang}
                                        onChangeText={setSearchLang}
                                    />
                                </View>
                            </View>

                            <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 12 }}>
                                {filteredLanguages.map(lang => (
                                    <TouchableOpacity
                                        key={lang}
                                        style={{
                                            paddingVertical: 14,
                                            paddingHorizontal: 16,
                                            borderBottomWidth: 1,
                                            borderBottomColor: '#374151',
                                            flexDirection: 'row',
                                            justifyContent: 'space-between',
                                            alignItems: 'center'
                                        }}
                                        onPress={() => handleTranslate(lang)}
                                    >
                                        <Text style={{ color: lang === language ? '#A5B4FC' : '#D1D5DB', fontFamily: 'Poppins_400Regular', fontSize: 15 }}>{lang}</Text>
                                        {lang === language && <Feather name="check" size={16} color="#A5B4FC" />}
                                    </TouchableOpacity>
                                ))}
                                {filteredLanguages.length === 0 && (
                                    <Text style={{ color: '#6B7280', textAlign: 'center', marginTop: 20, paddingBottom: 20 }}>No languages found</Text>
                                )}
                            </ScrollView>
                        </View>
                    </View>
                </Modal>
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
            const response = await fetch(`${API_URL}/api/v1/ai/ask`, {
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
            const response = await fetch(`${API_URL}/api/v1/content/buckets/all`);
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
            // Get auth token for level-based filtering
            const token = await AsyncStorage.getItem('userToken');

            const headers = {};
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const response = await fetch(`${API_URL}/api/v1/content`, { headers });
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
                    bucket: item.bucket,
                    transcript: item.transcript || "No transcript available for this video."
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

export default function Courses({ userEmail = "user" }) {
    const insets = useSafeAreaInsets();
    const [activeTab, setActiveTab] = useState('path'); // 'path' or 'quizzes'
    const [learningPathTab, setLearningPathTab] = useState('self_learning'); // 'self_learning' or 'career_progression'
    const [selfLearningStatus, setSelfLearningStatus] = useState({
        self_learning_completed: true,
        career_path_unlocked: true,
        self_learning_progress: 100,
        completed_courses: 0,
        total_courses: 0
    });
    const [loadingStatus, setLoadingStatus] = useState(true);

    // State for self-learning lesson playback (uses LessonView for full progress tracking)
    const [activeLesson, setActiveLesson] = useState(null);
    const [activeLessonWasComplete, setActiveLessonWasComplete] = useState(false);
    const [slRefreshKey, setSlRefreshKey] = useState(0);
    const [slCourseUpdate, setSlCourseUpdate] = useState(null); // Tracks instant progress updates
    const [slCongratsVisible, setSlCongratsVisible] = useState(false);
    const [slCongratsInfo, setSlCongratsInfo] = useState(null);
    const [feedbackVisible, setFeedbackVisible] = useState(false);
    const [feedbackCourse, setFeedbackCourse] = useState(null);

    // Fetch self-learning status on mount and when userEmail changes
    React.useEffect(() => {
        if (userEmail && userEmail !== "user") {
            fetchSelfLearningStatus();
        }
    }, [userEmail]);

    const fetchSelfLearningStatus = async () => {
        try {
            setLoadingStatus(true);
            const response = await fetch(`${API_URL}/api/v1/users/${userEmail}/self-learning-status`);
            const data = await response.json();
            setSelfLearningStatus(data);
        } catch (error) {
            console.error("Failed to fetch self-learning status:", error);
        } finally {
            setLoadingStatus(false);
        }
    };

    const handlePathTabChange = (tab) => {
        // Both learning paths are always accessible
        setLearningPathTab(tab);
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>

            {/* HEADER SECTION (Fixed at Top) */}
            <View style={styles.header}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <View style={{ flex: 1, marginRight: 10 }}>
                        <Text style={styles.pageTitle} numberOfLines={1} adjustsFontSizeToFit>Employee Learning Path</Text>
                        <Text style={styles.subTitle}>
                            {learningPathTab === 'self_learning' ? '📚 Self Learning Journey'
                                : learningPathTab === 'career_progression' ? '🚀 Career Progression'
                                    : '🧠 Daily Quiz'}
                        </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <NotificationBell
                            userEmail={userEmail}
                            onDailyQuizPress={() => handlePathTabChange('daily_quiz')}
                        />
                        <View style={styles.xpContainer}>
                            <MaterialCommunityIcons name="lightning-bolt" size={20} color="#F59E0B" />
                            <Text style={styles.xpText}>1,240 XP</Text>
                        </View>
                    </View>
                </View>

            </View>

            {/* LEARNING PATH SUB-TABS */}
            {(
                <View style={styles.learningPathTabsContainer}>
                    {/* Self Learning Tab */}
                    <TouchableOpacity
                        style={[
                            styles.learningPathTab,
                            learningPathTab === 'self_learning' && styles.learningPathTabActive,
                            { borderColor: '#10B981' }
                        ]}
                        onPress={() => handlePathTabChange('self_learning')}
                    >
                        <View style={styles.tabContentRow}>
                            <MaterialCommunityIcons
                                name="school"
                                size={18}
                                color={learningPathTab === 'self_learning' ? '#FFF' : '#10B981'}
                            />
                            <Text style={[
                                styles.learningPathTabText,
                                learningPathTab === 'self_learning' && styles.learningPathTabTextActive
                            ]}>Self Learning</Text>
                        </View>
                        {/* Progress Badge */}
                        {selfLearningStatus.total_courses > 0 && (
                            <View style={[
                                styles.progressBadge,
                                styles.progressBadgeFloating,
                                { backgroundColor: learningPathTab === 'self_learning' ? 'rgba(255,255,255,0.3)' : '#D1FAE5' }
                            ]}>
                                <Text style={[styles.progressBadgeText, { color: learningPathTab === 'self_learning' ? '#FFF' : '#059669' }]}>
                                    {selfLearningStatus.completed_courses}/{selfLearningStatus.total_courses}
                                </Text>
                            </View>
                        )}
                    </TouchableOpacity>

                    {/* Career Progression Tab */}
                    <TouchableOpacity
                        style={[
                            styles.learningPathTab,
                            learningPathTab === 'career_progression' && styles.learningPathTabActiveCareer
                        ]}
                        onPress={() => handlePathTabChange('career_progression')}
                    >
                        <MaterialCommunityIcons
                            name="trending-up"
                            size={18}
                            color={learningPathTab === 'career_progression' ? '#FFF' : '#F59E0B'}
                        />
                        <Text style={[
                            styles.learningPathTabText,
                            learningPathTab === 'career_progression' && styles.learningPathTabTextActive
                        ]}>Career Progression</Text>
                    </TouchableOpacity>

                    {/* Daily Quiz Tab */}
                    <TouchableOpacity
                        style={[
                            styles.learningPathTab,
                            learningPathTab === 'daily_quiz' && { backgroundColor: '#6366F1', borderColor: '#6366F1' },
                            { borderColor: '#6366F1' }
                        ]}
                        onPress={() => handlePathTabChange('daily_quiz')}
                    >
                        <MaterialCommunityIcons
                            name="brain"
                            size={18}
                            color={learningPathTab === 'daily_quiz' ? '#FFF' : '#6366F1'}
                        />
                        <Text style={[
                            styles.learningPathTabText,
                            learningPathTab === 'daily_quiz' && styles.learningPathTabTextActive
                        ]}>Daily Quiz</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* MAIN CONTENT */}
            <View style={{ flex: 1 }}>
                {learningPathTab === 'self_learning' && (
                    <SelfLearningView
                        userEmail={userEmail}
                        refreshKey={slRefreshKey}
                        activeCourseUpdate={slCourseUpdate}
                        onOpenCourse={(course) => {
                            setActiveLessonWasComplete(!!(course.status === 'completed' || course.completed));
                            setActiveLesson(course);
                        }}
                    />
                )}
                {learningPathTab === 'career_progression' && (
                    <CoursePath
                        userEmail={userEmail}
                        learningPathType="career_progression"
                        onComplete={fetchSelfLearningStatus}
                    />
                )}
                {learningPathTab === 'daily_quiz' && (
                    <DailyQuizTab userEmail={userEmail} />
                )}
            </View>

            {/* LESSON VIEW FOR SELF LEARNING - Full progress tracking */}
            {activeLesson && (
                <LessonView
                    lesson={activeLesson}
                    onClose={(completionResult, finalPercent) => {
                        const justCompleted = !activeLessonWasComplete && !!(completionResult);
                        const lessonTitle = activeLesson.title || 'Module';
                        const lessonId = activeLesson.id;
                        const lessonBucket = activeLesson.bucket;

                        // Optimistic immediate UI update
                        if (finalPercent !== undefined) {
                            setSlCourseUpdate({
                                id: lessonId,
                                finalPercent: finalPercent,
                                completed: !!completionResult || activeLessonWasComplete
                            });
                        }

                        setActiveLesson(null);
                        setSlRefreshKey(k => k + 1);

                        if (justCompleted) {
                            // Fresh completion → show congrats first, then feedback after dismiss
                            setSlCongratsInfo({ title: lessonTitle, courseId: lessonId, bucket: lessonBucket, completedAt: new Date() });
                            setSlCongratsVisible(true);
                        } else if (activeLessonWasComplete) {
                            // Re-visit of already-completed course → show feedback directly
                            // FeedbackFormModal will silently close itself if user already submitted
                            setFeedbackCourse({ courseId: lessonId, title: lessonTitle, bucket: lessonBucket });
                            setFeedbackVisible(true);
                        }
                    }}
                    userEmail={userEmail}
                    allowFastForward={activeLesson.allow_fast_forward !== false}
                    isSelfLearning={true}
                />
            )}

            {/* CONGRATULATIONS MODAL */}
            <Modal
                visible={slCongratsVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setSlCongratsVisible(false)}
            >
                <View style={slStyles.overlay}>
                    <View style={slStyles.card}>
                        <View style={slStyles.trophyWrap}>
                            <MaterialCommunityIcons name="trophy-award" size={56} color="#F59E0B" />
                        </View>
                        <Text style={slStyles.congrats}>Congratulations! 🎉</Text>
                        <Text style={slStyles.message}>You have completed</Text>
                        <Text style={slStyles.courseTitle} numberOfLines={3}>{slCongratsInfo?.title}</Text>
                        {slCongratsInfo?.completedAt && (
                            <View style={slStyles.dateRow}>
                                <MaterialCommunityIcons name="calendar-check" size={15} color="#6B7280" />
                                <Text style={slStyles.dateText}>
                                    {slCongratsInfo.completedAt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                    {'  ·  '}
                                    {slCongratsInfo.completedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                </Text>
                            </View>
                        )}
                        <TouchableOpacity style={slStyles.closeBtn} onPress={() => {
                            setSlCongratsVisible(false);
                            // Show feedback form after congrats is dismissed
                            if (slCongratsInfo?.courseId) {
                                setFeedbackCourse(slCongratsInfo);
                                setFeedbackVisible(true);
                            }
                        }}>
                            <Text style={slStyles.closeBtnText}>Continue Learning</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* FEEDBACK / SURVEY MODAL - shown after course completion */}
            <FeedbackFormModal
                visible={feedbackVisible}
                onClose={() => { setFeedbackVisible(false); setFeedbackCourse(null); }}
                courseId={feedbackCourse?.courseId}
                courseTitle={feedbackCourse?.title}
                bucket={feedbackCourse?.bucket}
                userEmail={userEmail}
            />

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

    // DUAL LEARNING PATHS STYLES
    learningPathTabsContainer: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: '#FFF',
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
        gap: 10,
    },
    learningPathTab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        paddingHorizontal: 8,
        borderRadius: 12,
        backgroundColor: '#F9FAFB',
        borderWidth: 1.5,
        borderColor: '#E5E7EB',
        gap: 6,
        minHeight: 54,
        position: 'relative',
        overflow: 'hidden',
    },
    tabContentRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        flexShrink: 1,
    },
    learningPathTabActive: {
        backgroundColor: '#10B981',
        borderColor: '#10B981',
    },
    learningPathTabActiveCareer: {
        backgroundColor: '#F59E0B',
        borderColor: '#F59E0B',
    },
    learningPathTabLocked: {
        backgroundColor: '#F3F4F6',
        borderColor: '#E5E7EB',
        opacity: 0.7,
    },
    learningPathTabText: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
        color: '#374151',
        textAlign: 'center',
        flexShrink: 1,
    },
    learningPathTabTextActive: {
        color: '#FFF',
    },
    learningPathTabTextLocked: {
        color: '#9CA3AF',
    },
    progressBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
    },
    progressBadgeFloating: {
        position: 'absolute',
        top: 4,
        right: 4,
    },
    progressBadgeText: {
        fontSize: 11,
        fontFamily: 'Poppins_700Bold',
    },

    // Locked Overlay
    lockedOverlay: {
        flex: 1,
        backgroundColor: '#F9FAFB',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    lockedCard: {
        backgroundColor: '#FFF',
        borderRadius: 24,
        padding: 32,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 5,
        width: '100%',
        maxWidth: 340,
    },
    lockedTitle: {
        fontSize: 20,
        fontFamily: 'Poppins_700Bold',
        color: '#111827',
        marginTop: 16,
        marginBottom: 8,
    },
    lockedMessage: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
        textAlign: 'center',
        marginBottom: 24,
    },
    progressContainer: {
        width: '100%',
        marginBottom: 24,
    },
    progressBar: {
        height: 8,
        backgroundColor: '#E5E7EB',
        borderRadius: 4,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#10B981',
        borderRadius: 4,
    },
    progressText: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
        color: '#059669',
        textAlign: 'center',
        marginTop: 8,
    },
    goToSelfLearningBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#10B981',
        paddingVertical: 14,
        paddingHorizontal: 24,
        borderRadius: 12,
        gap: 8,
    },
    goToSelfLearningBtnText: {
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
    },
});

const slStyles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.55)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    card: {
        backgroundColor: '#FFF',
        borderRadius: 20,
        paddingVertical: 36,
        paddingHorizontal: 28,
        alignItems: 'center',
        width: '100%',
        maxWidth: 360,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18,
        shadowRadius: 20,
        elevation: 12,
    },
    trophyWrap: {
        width: 88,
        height: 88,
        borderRadius: 44,
        backgroundColor: '#FEF3C7',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 18,
    },
    congrats: {
        fontSize: 22,
        fontFamily: 'Poppins_700Bold',
        color: '#111827',
        textAlign: 'center',
        marginBottom: 6,
    },
    message: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
        textAlign: 'center',
    },
    courseTitle: {
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
        color: '#1F2937',
        textAlign: 'center',
        marginTop: 6,
        marginBottom: 16,
        lineHeight: 22,
    },
    dateRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: '#F9FAFB',
        borderRadius: 8,
        paddingVertical: 7,
        paddingHorizontal: 14,
        marginBottom: 24,
    },
    dateText: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
    },
    closeBtn: {
        backgroundColor: '#F59E0B',
        borderRadius: 12,
        paddingVertical: 13,
        paddingHorizontal: 40,
        alignItems: 'center',
        width: '100%',
    },
    closeBtnText: {
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
    },
});
