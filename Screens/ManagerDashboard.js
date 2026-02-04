import React, { useState, useEffect } from 'react';
import * as ImagePicker from 'expo-image-picker'; // SWITCHED TO IMAGE PICKER
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Dimensions,
    Image,
    Platform,
    ActivityIndicator,
    Modal,
    TextInput,
    Alert,
    KeyboardAvoidingView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons, Feather, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as DocumentPicker from 'expo-document-picker';
import { Video } from 'expo-av';
import { BlurView } from 'expo-blur';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import Svg, { Circle, G, Text as SvgText } from 'react-native-svg';
import { QuizCreationModal, QuizResultsModal } from '../Components/QuizModals';
import EditNodeModal from '../Components/EditNodeModal';
import BulkUploadModal from '../Components/BulkUploadModal'; // [NEW]
import BucketManagementModal from '../Components/BucketManagementModal'; // [NEW] Bucket management
import AccessControlModal from '../Components/AccessControlModal'; // [NEW] Hierarchy & Access Control
import CreateUser from '../Screens/CreateUser';
import API_URL from '../config';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CommonActions } from '@react-navigation/native';
import MeetingSchedulerModal from '../Components/MeetingScheduler'; // [NEW] Virtual meetings
import SimulationAdminManager from '../Components/SimulationAdminManager'; // [NEW] Interactive Simulations Admin
import CRMTicketModal from '../Components/CRMTicketModal'; // [NEW] CRM Tickets
import SupportTicketModal from '../Components/SupportTicketModal'; // [NEW] LMS Support

import AuditLogsModal from '../Components/AuditLogsModal'; // [PHASE 2] Audit Logs
import ContentLibraryModal from '../Components/ContentLibraryModal'; // [PHASE 2] Content Library
import ScheduleExamModal from '../Components/ScheduleExamModal'; // [NEW] Schedule Exam
import ExamAttendanceModal from '../Components/ExamAttendanceModal'; // [NEW] Exam Attendance
import ScheduledExamsListModal from '../Components/ScheduledExamsListModal'; // [NEW] Scheduled Exams List
import ExamHistoryModal from '../Components/ExamHistoryModal'; // [NEW] Exam History
import RoleplayHistoryModal from '../Components/RoleplayHistoryModal'; // [NEW] Roleplay History



const { width, height } = Dimensions.get('window');
// const API_URL = "http://172.20.10.2:8000:8000"; // Updated for physical device using local IP

// MOCK DATA GENERATORS
const getDashboardData = (role) => {
    switch (role) {
        case 'Ops Manager':
            return {
                theme: ['#B91C1C', '#7F1D1D'],
                title: "Global Operations",
                stats: [
                    { label: "Total Revenue", value: "$4.2M", icon: "currency-usd", trend: "+12%" },
                    { label: "Avg Compliance", value: "94%", icon: "shield-check", trend: "+2%" },
                    { label: "Critical Incidents", value: "3", icon: "alert-circle", trend: "-1", alert: true },
                ],
                feed: [
                    { title: "Q3 Training Rollout", time: "2h ago", type: "system" },
                    { title: "New Delhi Region exceeded targets", time: "4h ago", type: "positive" },
                ]
            };
        case 'City Manager':
        case 'Deputy City Manager':
            return {
                theme: ['#1E3A8A', '#1E40AF'],
                title: "City Command",
                stats: [
                    { label: "City Revenue", value: "$850k", icon: "chart-line", trend: "+5%" },
                    { label: "Store uptime", value: "99.8%", icon: "clock-check", trend: "0%" },
                    { label: "Staff Turnover", value: "4%", icon: "account-group", trend: "-1%" },
                ],
                feed: [
                    { title: "Store #104 Inspection Due", time: "30m ago", type: "warning" },
                    { title: "Monthly Review Meeting", time: "1d ago", type: "calendar" },
                ]
            };
        case 'Area Manager':
        case 'Deputy Area Manager':
            return {
                theme: ['#047857', '#065F46'],
                title: "Area Oversight",
                stats: [
                    { label: "Area Sales", value: "$125k", icon: "cash", trend: "+8%" },
                    { label: "Audit Score", value: "96/100", icon: "clipboard-check", trend: "+3" },
                    { label: "Training Gaps", value: "12", icon: "book-alert", trend: "-5" },
                ],
                feed: [
                    { title: "Visit Scheduled: Downtown", time: "Tomorrow", type: "calendar" },
                    { title: "Staff Shortage at Mall Branch", time: "1h ago", type: "alert" },
                ]
            };
        case 'Store Manager':
            return {
                theme: ['#D97706', '#B45309'],
                title: "Store Leadership",
                stats: [
                    { label: "Daily Sales", value: "$3.2k", icon: "cash-register", trend: "+15%" },
                    { label: "Shift Fulfilled", value: "100%", icon: "account-check", trend: "0%" },
                    { label: "Cust. Satisfaction", value: "4.8", icon: "star", trend: "+0.1" },
                ],
                feed: [
                    { title: "Morning Checklist Complete", time: "8:00 AM", type: "success" },
                    { title: "Inventory Delivery Arriving", time: "2:00 PM", type: "info" },
                ]
            };
        default:
            return {
                theme: ['#333', '#111'],
                title: "Dashboard",
                stats: [],
                feed: []
            };
    }
};

const StatCard = ({ item, index }) => (
    <Animated.View
        entering={FadeInDown.delay(index * 100).duration(500)}
        style={[styles.statCard, item.alert && styles.statCardAlert]}
    >
        <View style={styles.statIconBg}>
            <MaterialCommunityIcons name={item.icon} size={24} color={item.alert ? "#EF4444" : "#FFF"} />
        </View>
        <View>
            <Text style={styles.statLabel}>{item.label}</Text>
            <Text style={styles.statValue}>{item.value}</Text>
        </View>
        <View style={[styles.trendBadge, { backgroundColor: item.trend.includes('-') ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)' }]}>
            <Text style={[styles.trendText, { color: item.trend.includes('-') ? '#EF4444' : '#10B981' }]}>{item.trend}</Text>
        </View>
    </Animated.View>
);

const FeedItem = ({ item, index }) => {
    let icon = "bell";
    let color = "#60A5FA";
    if (item.type === 'alert') { icon = "alert"; color = "#EF4444"; }
    if (item.type === 'success') { icon = "check-circle"; color = "#10B981"; }
    if (item.type === 'calendar') { icon = "calendar"; color = "#F59E0B"; }

    return (
        <Animated.View
            entering={FadeInRight.delay(index * 100 + 400).duration(500)}
            style={styles.feedItem}
        >
            <View style={[styles.feedIcon, { backgroundColor: `${color}20` }]}>
                <MaterialCommunityIcons name={icon} size={20} color={color} />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={styles.feedTitle}>{item.title}</Text>
                <Text style={styles.feedTime}>{item.time}</Text>
            </View>
            <Feather name="chevron-right" size={16} color="#6B7280" />
        </Animated.View>
    );
}

export default function ManagerDashboard({ route, navigation }) {
    const [meetingModalVisible, setMeetingModalVisible] = useState(false);
    const [crmModalVisible, setCrmModalVisible] = useState(false); // [NEW]
    const [supportModalVisible, setSupportModalVisible] = useState(false); // [NEW] LMS Support

    // [PHASE 2] New Feature Modals
    const [auditLogsVisible, setAuditLogsVisible] = useState(false);
    const [contentLibraryVisible, setContentLibraryVisible] = useState(false);


    const { userProfile } = route.params || {};
    const role = userProfile?.role || "Manager";
    const name = userProfile?.name || "User";
    const data = getDashboardData(role);

    // Privilege checking for role-based access control
    const isSuperAdmin = userProfile?.is_superadmin || userProfile?.role === 'Super Admin';
    const userPrivileges = userProfile?.privileges || [];

    // Helper function to check if user has a specific privilege
    const hasPrivilege = (privilegeId) => {
        if (isSuperAdmin) return true; // Superadmin has all privileges
        return userPrivileges.includes(privilegeId);
    };

    console.log("ManagerDashboard rendered - isSuperAdmin:", isSuperAdmin, "Privileges:", userPrivileges.length);

    // --- RESOURCE UPLOAD STATE ---
    const [uploadVisible, setUploadVisible] = useState(false);
    const [resTitle, setResTitle] = useState('');
    const [resDesc, setResDesc] = useState('');
    const [resCategory, setResCategory] = useState(null);
    const [resFile, setResFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [isPathNode, setIsPathNode] = useState(false); // RESTORED
    const [isSelfLearning, setIsSelfLearning] = useState(false); // NEW: Self Learning toggle
    const [createUserVisible, setCreateUserVisible] = useState(false); // NEW
    const [bulkModalVisible, setBulkModalVisible] = useState(false); // [NEW]

    // NEWS & QUIZ CREATION STATE
    const [newsModalVisible, setNewsModalVisible] = useState(false);
    const [quizCreationVisible, setQuizCreationVisible] = useState(false);
    const [newsTitle, setNewsTitle] = useState('');
    const [newsContent, setNewsContent] = useState('');
    const [newsAuthor, setNewsAuthor] = useState('');
    const [newsImage, setNewsImage] = useState(null);
    const [postingNews, setPostingNews] = useState(false);

    // Topic quiz creation
    const [topicQuizTitle, setTopicQuizTitle] = useState('');
    const [topicQuizDifficulty, setTopicQuizDifficulty] = useState('Medium');
    const [topicQuizTime, setTopicQuizTime] = useState('10 min');
    const [topicQuizImage, setTopicQuizImage] = useState(null);
    const [topicQuizQuestions, setTopicQuizQuestions] = useState([
        { question: '', options: ['', '', '', ''], correct: 0 }
    ]);
    const [postingQuiz, setPostingQuiz] = useState(false);

    // AI Quiz Generation State
    const [quizMode, setQuizMode] = useState('manual'); // 'manual' or 'ai'
    const [aiQuizFile, setAiQuizFile] = useState(null);
    const [aiQuizNumQuestions, setAiQuizNumQuestions] = useState(5);
    const [generatingAiQuiz, setGeneratingAiQuiz] = useState(false);

    // Categories
    const [categories, setCategories] = useState([]);
    const [loadingCats, setLoadingCats] = useState(false);
    const [newCatMode, setNewCatMode] = useState(false);
    const [newCatName, setNewCatName] = useState('');

    // [NEW] Course Buckets State
    const [bucketModalVisible, setBucketModalVisible] = useState(false);
    const [courseBuckets, setCourseBuckets] = useState([]);
    const [selectedBucket, setSelectedBucket] = useState(null);

    // [NEW] Access Control Modal State
    const [accessControlVisible, setAccessControlVisible] = useState(false);
    const [loadingBuckets, setLoadingBuckets] = useState(false);

    // [NEW] Simulation Flow Builder State
    const [simulationBuilderVisible, setSimulationBuilderVisible] = useState(false);
    const [editingSimulation, setEditingSimulation] = useState(null);

    // [NEW] Schedule Exam State
    const [scheduleExamVisible, setScheduleExamVisible] = useState(false);
    const [scheduledExamsListVisible, setScheduledExamsListVisible] = useState(false); // [NEW] List Modal
    const [examAttendanceVisible, setExamAttendanceVisible] = useState(false);
    const [selectedExamForAttendance, setSelectedExamForAttendance] = useState(null);
    const [scheduledExams, setScheduledExams] = useState([]);
    const [examHistoryVisible, setExamHistoryVisible] = useState(false); // [NEW] Exam History Modal

    // [NEW] Admin AI Analyst State
    const [adminChatVisible, setAdminChatVisible] = useState(false);
    const [chatMessages, setChatMessages] = useState([{ role: 'ai', content: "Hello! I'm your AI Analyst. Ask me anything about users, quizzes, or system performance." }]);
    const [chatInput, setChatInput] = useState('');
    const [isChatLoading, setIsChatLoading] = useState(false);

    const handleAdminAskAI = async () => {
        if (!chatInput.trim()) return;
        const query = chatInput;
        setChatInput('');

        // Add user message
        const newMsgs = [...chatMessages, { role: 'user', content: query }];
        setChatMessages(newMsgs);
        setIsChatLoading(true);

        try {
            // Send request to privilege-aware admin copilot endpoint
            const res = await fetch(`${API_URL}/api/v1/ai/admin-copilot`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question: query,
                    privileges: userPrivileges,
                    is_superadmin: isSuperAdmin,
                    admin_name: name,
                    admin_role: role
                })
            });
            const data = await res.json();

            // Add AI response with data sources info
            let responseContent = data.answer;
            if (data.data_sources && data.data_sources.length > 0) {
                responseContent += `\n\n📊 *Data sources: ${data.data_sources.join(', ')}*`;
            }
            setChatMessages(prev => [...prev, { role: 'ai', content: responseContent }]);
        } catch (error) {
            console.error(error);
            setChatMessages(prev => [...prev, { role: 'ai', content: "Error connecting to Admin Copilot. Please try again." }]);
        } finally {
            setIsChatLoading(false);
        }
    };

    useEffect(() => {
        if (uploadVisible) {
            fetchCategories();
            fetchBuckets();
        }
    }, [uploadVisible]);

    // [NEW] Fetch course buckets
    const fetchBuckets = async () => {
        setLoadingBuckets(true);
        try {
            const res = await fetch(`${API_URL}/api/v1/content/buckets/all`);
            const data = await res.json();
            setCourseBuckets(data);
        } catch (e) { console.error('Error fetching buckets:', e); }
        finally { setLoadingBuckets(false); }
    };

    const fetchCategories = async () => {
        setLoadingCats(true);
        try {
            const res = await fetch(`${API_URL}/api/v1/content/resources/categories`);
            const data = await res.json();
            setCategories(data);
            // Default to first if available
            if (data.length > 0 && !resCategory) setResCategory(data[0].name);
        } catch (e) { console.error(e); }
        finally { setLoadingCats(false); }
    };

    const handleCreateCategory = async () => {
        if (!newCatName) return;
        try {
            const formData = new FormData();
            formData.append('name', newCatName);
            formData.append('icon', 'folder-text-outline'); // Default icon
            formData.append('color1', '#6366F1'); // Default Indigo
            formData.append('color2', '#4338CA');

            const res = await fetch(`${API_URL}/api/v1/content/resources/all/category`, {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.status === 'success') {
                await fetchCategories();
                setResCategory(newCatName);
                setNewCatMode(false);
                setNewCatName('');
                Alert.alert("Created", "New category added!");
            }
        } catch (e) {
            Alert.alert("Error", "Failed to create category");
        }
    };

    const pickResourceFile = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: "*/*", // Allow all types
                copyToCacheDirectory: true
            });

            if (result.assets && result.assets[0]) {
                setResFile(result.assets[0]);
            }
        } catch (err) {
            console.log("File Pick Error:", err);
        }
    };

    const handleUploadResource = async () => {
        if (!resTitle || !resFile || !resCategory || !selectedBucket) {
            Alert.alert("Missing Fields", "Please provide title, resource type, category, and file.");
            return;
        }

        setUploading(true);
        try {
            // Determine learning path type based on toggle
            const learningPathType = isSelfLearning ? 'self_learning' : 'career_progression';

            const formData = new FormData();
            formData.append('title', resTitle);
            formData.append('category', resCategory);
            formData.append('description', resDesc);
            formData.append('is_path_node', String(isPathNode)); // FIX: Changed from 'isPathNode' to 'is_path_node' to match backend
            formData.append('learning_path_type', learningPathType);

            // REQUIRED FIELDS fix for 422 Error
            formData.append('authorRole', role || 'Manager');
            formData.append('timestamp', new Date().toISOString());

            if (selectedBucket) {
                formData.append('bucket', selectedBucket); // Add bucket if selected
            }

            // Handle file differently for web vs mobile
            if (Platform.OS === 'web') {
                // On web, fetch the blob from the uri and create a proper File object
                const fileResponse = await fetch(resFile.uri);
                const blob = await fileResponse.blob();
                const webFile = new File([blob], resFile.name, { type: resFile.mimeType || 'application/octet-stream' });
                formData.append('file', webFile);
            } else {
                // On mobile, use the React Native format
                formData.append('file', {
                    uri: resFile.uri,
                    name: resFile.name,
                    type: resFile.mimeType || 'application/octet-stream'
                });
            }

            // Use the universal resource upload endpoint
            // It will handle adding to Knowledge Base AND optionally to Learning Path
            const response = await fetch(`${API_URL}/api/v1/content/`, {
                method: 'POST',
                body: formData,
                headers: {
                    'Accept': 'application/json',
                },
            });

            const result = await response.json();
            if (result.status === 'success') {
                const pathName = isSelfLearning ? 'Self Learning' : 'Career Progression';
                Alert.alert("Success", `Resource uploaded!${isPathNode ? ` Added to ${pathName} path.` : ''}`);
                setUploadVisible(false);
                setResTitle('');
                setResDesc('');
                setResFile(null);
                setIsPathNode(false);
                setIsSelfLearning(false); // NEW: Reset self learning toggle
                setSelectedBucket(null); // Reset bucket selection
            } else {
                Alert.alert("Error", "Upload failed.");
            }
        } catch (error) {
            console.error("Upload error:", error);
            Alert.alert("Error", "Network error.");
        } finally {
            setUploading(false);
        }
    };

    // --- POST NEWS HANDLER ---
    const handlePostNews = async () => {
        if (!newsTitle || !newsContent || !newsAuthor) {
            Alert.alert("Missing Info", "Please fill in title, content, and author.");
            return;
        }

        setPostingNews(true);
        try {
            const formData = new FormData();
            formData.append('title', newsTitle);
            formData.append('content', newsContent);
            formData.append('author', newsAuthor);

            if (newsImage) {
                formData.append('image', {
                    uri: newsImage.uri,
                    name: 'news_image.jpg',
                    type: 'image/jpeg'
                });
            }

            const response = await fetch(`${API_URL}/api/v1/notifications/news`, {
                method: 'POST',
                body: formData
            });

            const result = await response.json();
            if (result.status === 'success') {
                Alert.alert("Success", "News posted to all users!");
                setNewsModalVisible(false);
                setNewsTitle('');
                setNewsContent('');
                setNewsAuthor('');
                setNewsImage(null);
            } else {
                Alert.alert("Error", "Failed to post news.");
            }
        } catch (error) {
            console.error("Post news error:", error);
            Alert.alert("Error", "Network error while posting news.");
        } finally {
            setPostingNews(false);
        }
    };

    // --- POST TOPIC QUIZ HANDLER ---
    const handlePostTopicQuiz = async () => {
        if (!topicQuizTitle) {
            Alert.alert("Missing Info", "Please enter a quiz title.");
            return;
        }

        // Filter out empty questions
        const validQuestions = topicQuizQuestions.filter(q =>
            q.question.trim() && q.options.filter(o => o.trim()).length >= 2
        );

        if (validQuestions.length === 0) {
            Alert.alert("Missing Info", "Please add at least one question with options.");
            return;
        }

        setPostingQuiz(true);
        try {
            const formData = new FormData();
            formData.append('title', topicQuizTitle);
            formData.append('difficulty', topicQuizDifficulty);
            formData.append('time', topicQuizTime);
            formData.append('questions', JSON.stringify(validQuestions));

            if (topicQuizImage) {
                formData.append('image', {
                    uri: topicQuizImage.uri,
                    name: 'quiz_image.jpg',
                    type: 'image/jpeg'
                });
            }

            const response = await fetch(`${API_URL}/api/v1/quizzes/live`, {
                method: 'POST',
                body: formData
            });

            const result = await response.json();
            if (result.status === 'success') {
                Alert.alert("Success", "Topic Quiz posted to all users!");
                setQuizCreationVisible(false);
                setTopicQuizTitle('');
                setTopicQuizDifficulty('Medium');
                setTopicQuizTime('10 min');
                setTopicQuizQuestions([{ question: '', options: ['', '', '', ''], correct: 0 }]);
                setTopicQuizImage(null);
            } else {
                Alert.alert("Error", "Failed to post quiz.");
            }
        } catch (error) {
            console.error("Post quiz error:", error);
            Alert.alert("Error", "Network error while posting quiz.");
        } finally {
            setPostingQuiz(false);
        }
    };

    // --- AI QUIZ GENERATION HANDLER ---
    const pickAiQuizFile = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ["video/*", "audio/*", "application/pdf", "image/*", "text/*"],
                copyToCacheDirectory: true
            });

            if (result.assets && result.assets[0]) {
                setAiQuizFile(result.assets[0]);
            }
        } catch (err) {
            console.log("AI Quiz File Pick Error:", err);
        }
    };

    const handleGenerateAiQuiz = async () => {
        if (!topicQuizTitle) {
            Alert.alert("Missing Info", "Please enter a quiz title.");
            return;
        }
        if (!aiQuizFile) {
            Alert.alert("Missing Info", "Please select a file to generate quiz from.");
            return;
        }

        setGeneratingAiQuiz(true);
        try {
            const formData = new FormData();
            formData.append('title', topicQuizTitle);
            formData.append('difficulty', topicQuizDifficulty);
            formData.append('num_questions', String(aiQuizNumQuestions));
            formData.append('preview_only', 'true'); // Don't post, just generate
            formData.append('file', {
                uri: aiQuizFile.uri,
                name: aiQuizFile.name,
                type: aiQuizFile.mimeType || 'application/octet-stream'
            });

            const response = await fetch(`${API_URL}/api/v1/quizzes/generate/from-content`, {
                method: 'POST',
                body: formData
            });

            const result = await response.json();
            if (result.status === 'success' && result.questions) {
                // Fill the form with generated questions for manual editing
                const generatedQuestions = result.questions.map(q => ({
                    question: q.question || '',
                    options: q.options?.map(o => typeof o === 'string' ? o : o.text) || ['', '', '', ''],
                    correct: q.correctIndex || q.correct || 0
                }));

                setTopicQuizQuestions(generatedQuestions);
                setQuizMode('manual'); // Switch to manual mode for editing
                setAiQuizFile(null);
                Alert.alert(
                    "AI Quiz Generated!",
                    `${generatedQuestions.length} questions generated. Please review and edit before posting.`,
                    [{ text: "OK" }]
                );
            } else {
                Alert.alert("Error", result.detail || "Failed to generate quiz.");
            }
        } catch (error) {
            console.error("AI Quiz generation error:", error);
            Alert.alert("Error", "Network error while generating quiz.");
        } finally {
            setGeneratingAiQuiz(false);
        }
    };

    // --- LEARNING PATH STATE ---
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [selectedNode, setSelectedNode] = useState(null);
    const [pathNodes, setPathNodes] = useState([]);
    const [refreshPath, setRefreshPath] = useState(0);

    useEffect(() => {
        const fetchPath = async () => {
            try {
                const res = await fetch(`${API_URL}/api/v1/content/path-nodes`);
                const data = await res.json();
                setPathNodes(data.courses || (Array.isArray(data) ? data : []));
            } catch (e) { console.error(e); }
        };
        fetchPath();
    }, [refreshPath]);

    // --- QUIZ STATE ---
    const [quizModalVisible, setQuizModalVisible] = useState(false);
    const [quizTitle, setQuizTitle] = useState('');
    const [quizDescription, setQuizDescription] = useState('');
    const [questions, setQuestions] = useState([]);
    const [currentQuestion, setCurrentQuestion] = useState('');
    const [options, setOptions] = useState(['', '', '', '']);
    const [correctIndex, setCorrectIndex] = useState(0);
    const [createdQuizzes, setCreatedQuizzes] = useState([]);
    const [resultsModalVisible, setResultsModalVisible] = useState(false);
    const [selectedQuizResults, setSelectedQuizResults] = useState(null);

    // --- NOTIFICATION STATE ---
    const [notifModalVisible, setNotifModalVisible] = useState(false);
    const [notifTitle, setNotifTitle] = useState('');
    const [notifMessage, setNotifMessage] = useState('');
    const [isCrucial, setIsCrucial] = useState(false);

    // --- QUIZ FUNCTIONS ---
    const addQuestion = () => {
        if (!currentQuestion || options.some(opt => !opt)) {
            Alert.alert("Incomplete", "Please fill all question fields and 4 options");
            return;
        }

        setQuestions([...questions, {
            question: currentQuestion,
            options: [...options],
            correctIndex
        }]);

        // Reset
        setCurrentQuestion('');
        setOptions(['', '', '', '']);
        setCorrectIndex(0);
        Alert.alert("Added", `Question ${questions.length + 1} added successfully`);
    };

    const createQuiz = async () => {
        if (!quizTitle || questions.length === 0) {
            Alert.alert("Incomplete", "Please add a title and at least one question");
            return;
        }

        try {
            const response = await fetch(`${API_URL}/api/v1/quizzes/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: quizTitle,
                    description: quizDescription,
                    questions: questions,
                    created_by: name
                })
            });

            const result = await response.json();

            if (result.status === 'success') {
                Alert.alert("Success", "Quiz created and assigned to all users!");
                setQuizModalVisible(false);
                setQuizTitle('');
                setQuizDescription('');
                setQuestions([]);
                fetchQuizzes();
            }
        } catch (error) {
            console.error(error);
            Alert.alert("Error", "Failed to create quiz");
        }
    };

    const fetchQuizzes = async () => {
        try {
            const response = await fetch(`${API_URL}/api/v1/quizzes/list`);
            const quizzes = await response.json();
            setCreatedQuizzes(quizzes);
        } catch (error) {
            console.error("Error fetching quizzes:", error);
        }
    };

    const viewResults = async (quizId) => {
        try {
            const response = await fetch(`${API_URL}/api/v1/quizzes/${quizId}/results`);
            const results = await response.json();
            setSelectedQuizResults(results);
            setResultsModalVisible(true);
        } catch (error) {
            console.error("Error fetching results:", error);
            Alert.alert("Error", "Failed to load quiz results");
        }
    };

    // Fetch quizzes on mount
    React.useEffect(() => {
        fetchQuizzes();
    }, []);

    const handleAssignQuiz = async () => {
        try {
            const formData = new FormData();
            formData.append('title', 'New Quiz Assigned!');
            formData.append('message', `Manager ${name} assigned '${role === 'Store Manager' ? 'Espresso Calibration' : 'Safety Drill'}' quiz.`);
            formData.append('type', 'quiz');

            await fetch(`${API_URL}/api/v1/notifications/send`, {
                method: 'POST',
                body: formData
            });
            Alert.alert("Assigned", "Quiz notification sent to all staff!");
        } catch (e) {
            Alert.alert("Error", "Could not send notification.");
        }
    };

    // --- CREATE USER HANDLER ---
    const handleCreateUser = async (userData) => {
        try {
            const response = await fetch(`${API_URL}/api/v1/users/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userData)
            });

            const result = await response.json();

            if (result.status === 'success') {
                Alert.alert('Success', `User ${userData.name} created successfully!`);
                setCreateUserVisible(false);
            } else {
                Alert.alert('Error', result.message || 'Failed to create user');
            }
        } catch (error) {
            Alert.alert('Error', 'Network error. Please try again.');
        }
    };

    // --- ADVANCED HANDLERS [NEW] ---
    const openEditNode = (node) => {
        setSelectedNode(node);
        setEditModalVisible(true);
    };

    const handleUpdateNode = async (id, updatedData) => {
        try {
            const response = await fetch(`${API_URL}/api/v1/content/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedData)
            });
            if (response.ok) {
                Alert.alert("Success", "Node updated successfully");
                setEditModalVisible(false);
                setRefreshPath(prev => prev + 1); // Reload list
            } else {
                Alert.alert("Error", "Failed to update node");
            }
        } catch (error) {
            console.error(error);
            Alert.alert("Error", "Network error updating node");
        }
    };

    const handleDeleteNode = async (id) => {
        try {
            const response = await fetch(`${API_URL}/api/v1/content/${id}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                Alert.alert("Deleted", "Node removed from path");
                setEditModalVisible(false);
                setRefreshPath(prev => prev + 1);
            } else {
                Alert.alert("Error", "Failed to delete node");
            }
        } catch (error) {
            console.error(error);
            Alert.alert("Error", "Network error deleting node");
        }
    };

    const handleGenerateQuiz = async (transcript) => {
        try {
            const response = await fetch(`${API_URL}/api/v1/quizzes/generate/from-topic`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topic: transcript, num_questions: 5 })
            });
            const data = await response.json();
            return data;
        } catch (error) {
            console.error(error);
            throw error;
        }
    };

    const [notifFile, setNotifFile] = useState(null); // [NEW]

    const pickNotifFile = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.All,
                allowsEditing: true,
                quality: 0.8,
            });
            if (!result.canceled) {
                setNotifFile(result.assets[0]);
            }
        } catch (e) {
            console.log(e);
        }
    };

    const handleSendNotification = async () => {
        if (!notifTitle || !notifMessage) {
            Alert.alert("Missing Fields", "Please add a title and message");
            return;
        }
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('title', notifTitle);
            formData.append('message', notifMessage);
            formData.append('type', isCrucial ? 'crucial' : 'ordinary');

            if (notifFile) {
                // Infer type from extension if needed, but 'video/mp4' or 'image/jpeg' usually
                const fileType = notifFile.type === 'video' ? 'video/mp4' : 'image/jpeg';
                formData.append('file', {
                    uri: notifFile.uri,
                    name: `upload.${notifFile.type === 'video' ? 'mp4' : 'jpg'}`,
                    type: fileType
                });
            }

            // Corrected Endpoint
            const response = await fetch(`${API_URL}/api/v1/notifications/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'multipart/form-data' },
                body: formData
            });

            const data = await response.json();

            if (data.status === 'success') {
                Alert.alert("Sent", "Notification broadcasted successfully!");
                setNotifModalVisible(false);
                setNotifTitle('');
                setNotifMessage('');
                setIsCrucial(false);
                setNotifFile(null);
            } else {
                Alert.alert("Error", "Failed to send notification");
            }
        } catch (error) {
            console.error(error);
            Alert.alert("Error", "Network error sending notification");
        } finally {
            setUploading(false);
        }
    };

    // --- LOGOUT HANDLER ---
    const handleLogout = async () => {
        Alert.alert(
            "Logout",
            "Are you sure you want to logout?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Logout",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            if (Platform.OS === 'web') {
                                await AsyncStorage.removeItem('accessToken');
                                await AsyncStorage.removeItem('userRole');
                            } else {
                                await SecureStore.deleteItemAsync('accessToken');
                                await SecureStore.deleteItemAsync('userRole');
                            }
                            navigation.dispatch(
                                CommonActions.reset({
                                    index: 0,
                                    routes: [{ name: 'Login' }],
                                })
                            );
                        } catch (e) {
                            console.error('Logout error:', e);
                            Alert.alert('Error', 'Failed to logout. Please try again.');
                        }
                    }
                }
            ]
        );
    };



    return (
        <View style={styles.container}>
            {/* HEADER BACKGROUND */}
            <LinearGradient
                colors={data.theme}
                style={styles.headerBg}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
            >
                <SafeAreaView style={{ flex: 1 }}>
                    <View style={styles.headerContent}>
                        <TouchableOpacity onPress={handleLogout} style={styles.backBtn}>
                            <Feather name="log-out" size={20} color="rgba(255,255,255,0.8)" />
                        </TouchableOpacity>
                        <View>
                            <Text style={styles.welcomeText}>Welcome back,</Text>
                            <Text style={styles.nameText}>{name}</Text>
                            <View style={styles.roleBadge}>
                                <Text style={styles.roleText}>{role}</Text>
                            </View>
                        </View>
                        <Image source={require('../assets/BW_Logo.png')} style={styles.logo} resizeMode="contain" />
                    </View>
                </SafeAreaView>
            </LinearGradient>

            <View style={styles.bodyContainer}>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

                    {/* AI INSIGHT - Moved to top to overlap header */}
                    <Animated.View entering={FadeInDown.delay(300)} style={styles.aiCard}>
                        <LinearGradient colors={['#4C1D95', '#6D28D9']} style={styles.aiGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                            <View style={styles.aiHeader}>
                                <MaterialCommunityIcons name="robot" size={24} color="#FBBF24" />
                                <Text style={styles.aiTitle}>AI Insight</Text>
                            </View>
                            <Text style={styles.aiText}>
                                "Based on recent quizzes, {role === 'Store Manager' ? 'your team' : 'the Northern Region'} is struggling with 'Espresso Calibration'. Recommend scheduling a refresh session."
                            </Text>
                            <TouchableOpacity style={styles.aiBtn} onPress={handleAssignQuiz}>
                                <Text style={styles.aiBtnText}>Assign Training</Text>
                            </TouchableOpacity>
                        </LinearGradient>
                    </Animated.View>

                    {/* STATS GRID */}
                    <Text style={styles.sectionTitle}>Key Performance Indicators</Text>
                    <View style={styles.statsGrid}>
                        {data.stats.map((item, index) => (
                            <StatCard key={index} item={item} index={index} />
                        ))}
                    </View>

                    {/* ACTIVITY FEED */}
                    <View style={styles.feedSection}>
                        <Text style={styles.sectionTitle}>Live Activity</Text>
                        {data.feed.map((item, index) => (
                            <FeedItem key={index} item={item} index={index} />
                        ))}
                    </View>

                    {/* QUICK ACTIONS */}
                    <Text style={styles.sectionTitle}>Quick Actions</Text>
                    <View style={styles.actionGrid}>
                        {/* TEAM LIST - requires team_list privilege */}
                        {hasPrivilege('team_list') && (
                            <TouchableOpacity
                                style={styles.actionBtn}
                                onPress={() => navigation.navigate('TeamList', { userProfile })}
                            >
                                <View style={[styles.actionIcon, { backgroundColor: '#E0F2FE' }]}>
                                    <Feather name="users" size={24} color="#0284C7" />
                                </View>
                                <Text style={styles.actionText}>Team List</Text>
                            </TouchableOpacity>
                        )}

                        {/* REPORTS - requires reports privilege */}
                        {hasPrivilege('reports') && (
                            <TouchableOpacity
                                style={styles.actionBtn}
                                onPress={() => navigation.navigate('Analytics', { userProfile })}
                            >
                                <View style={[styles.actionIcon, { backgroundColor: '#FCE7F3' }]}>
                                    <Feather name="bar-chart-2" size={24} color="#DB2777" />
                                </View>
                                <Text style={styles.actionText}>Reports</Text>
                            </TouchableOpacity>
                        )}

                        {/* ASSIGN QUIZ - HIDDEN as per request */}
                        {/* {hasPrivilege('assign_quiz') && (
                            <TouchableOpacity style={styles.actionBtn} onPress={() => setQuizModalVisible(true)}>
                                <View style={[styles.actionIcon, { backgroundColor: '#FEF3C7' }]}>
                                    <MaterialCommunityIcons name="clipboard-check" size={24} color="#F59E0B" />
                                </View>
                                <Text style={styles.actionText}>Assign Quiz</Text>
                            </TouchableOpacity>
                        )} */}

                        {/* AUDITS - requires audits privilege */}
                        {hasPrivilege('audits') && (
                            <TouchableOpacity
                                style={styles.actionBtn}
                                onPress={() => navigation.navigate('Audits', { userProfile })}
                            >
                                <View style={[styles.actionIcon, { backgroundColor: '#DCFCE7' }]}>
                                    <Feather name="check-square" size={24} color="#16A34A" />
                                </View>
                                <Text style={styles.actionText}>Audits</Text>
                            </TouchableOpacity>
                        )}

                        {/* UPLOAD TRAINING - requires upload_training privilege */}
                        {hasPrivilege('upload_training') && (
                            <TouchableOpacity style={styles.actionBtn} onPress={() => setUploadVisible(true)}>
                                <View style={[styles.actionIcon, { backgroundColor: '#F3E8FF' }]}>
                                    <Feather name="upload-cloud" size={24} color="#7C3AED" />
                                </View>
                                <Text style={styles.actionText}>Upload Training</Text>
                            </TouchableOpacity>
                        )}

                        {/* BULK UPLOAD - requires bulk_upload privilege */}
                        {hasPrivilege('bulk_upload') && (
                            <TouchableOpacity style={styles.actionBtn} onPress={() => setBulkModalVisible(true)}>
                                <View style={[styles.actionIcon, { backgroundColor: '#FEF3C7' }]}>
                                    <MaterialCommunityIcons name="layers-plus" size={24} color="#D97706" />
                                </View>
                                <Text style={styles.actionText}>Bulk Upload</Text>
                            </TouchableOpacity>
                        )}

                        {/* POST NEWS - requires post_news privilege */}
                        {hasPrivilege('post_news') && (
                            <TouchableOpacity style={styles.actionBtn} onPress={() => setNewsModalVisible(true)}>
                                <View style={[styles.actionIcon, { backgroundColor: '#FEE2E2' }]}>
                                    <MaterialCommunityIcons name="newspaper-variant-outline" size={24} color="#DC2626" />
                                </View>
                                <Text style={styles.actionText}>Post News</Text>
                            </TouchableOpacity>
                        )}

                        {/* POST QUIZ - requires post_quiz privilege */}
                        {hasPrivilege('post_quiz') && (
                            <TouchableOpacity style={styles.actionBtn} onPress={() => setQuizCreationVisible(true)}>
                                <View style={[styles.actionIcon, { backgroundColor: '#E0E7FF' }]}>
                                    <MaterialCommunityIcons name="head-question-outline" size={24} color="#4F46E5" />
                                </View>
                                <Text style={styles.actionText}>Post Quiz</Text>
                            </TouchableOpacity>
                        )}

                        {/* CREATE USER - requires create_user privilege */}
                        {hasPrivilege('create_user') && (
                            <TouchableOpacity style={styles.actionBtn} onPress={() => setCreateUserVisible(true)}>
                                <View style={[styles.actionIcon, { backgroundColor: '#ECFEFF' }]}>
                                    <Feather name="user-plus" size={24} color="#0891B2" />
                                </View>
                                <Text style={styles.actionText}>Create User</Text>
                            </TouchableOpacity>
                        )}

                        {/* LIVE TRACKING - requires live_tracking privilege */}
                        {hasPrivilege('live_tracking') && (
                            <TouchableOpacity
                                style={styles.actionBtn}
                                onPress={() => navigation.navigate('LiveTracking')}
                            >
                                <View style={[styles.actionIcon, { backgroundColor: '#DCFCE7' }]}>
                                    <Feather name="map-pin" size={24} color="#10B981" />
                                </View>
                                <Text style={styles.actionText}>Live Tracking</Text>
                            </TouchableOpacity>
                        )}

                        {/* PROCTORED ASSESSMENT - requires proctored_assessment privilege */}
                        {hasPrivilege('proctored_assessment') && (
                            <TouchableOpacity
                                style={styles.actionBtn}
                                onPress={() => navigation.navigate('ProctoredAssessment', { userProfile })}
                            >
                                <View style={[styles.actionIcon, { backgroundColor: '#FFF7ED' }]}>
                                    <Feather name="shield" size={24} color="#EA580C" />
                                </View>
                                <Text style={styles.actionText}>Proctored Assessment</Text>
                            </TouchableOpacity>
                        )}

                        {/* VIEW ANALYTICS - requires view_analytics privilege */}
                        {/* VIEW ANALYTICS - requires view_analytics privilege */}
                        {/* {hasPrivilege('view_analytics') && (
                            <TouchableOpacity
                                style={styles.actionBtn}
                                onPress={() => navigation.navigate('Analytics', { userProfile })}
                            >
                                <View style={[styles.actionIcon, { backgroundColor: '#FFF7ED' }]}>
                                    <Feather name="bar-chart" size={24} color="#EA580C" />
                                </View>
                                <Text style={styles.actionText}>View Analytics</Text>
                            </TouchableOpacity>
                        )} */}

                        {/* SEND NOTIFICATION - requires send_notification privilege */}
                        {hasPrivilege('send_notification') && (
                            <TouchableOpacity
                                style={styles.actionBtn}
                                onPress={() => setNotifModalVisible(true)}
                            >
                                <View style={[styles.actionIcon, { backgroundColor: '#FEE2E2' }]}>
                                    <Feather name="bell" size={24} color="#EF4444" />
                                </View>
                                <Text style={styles.actionText}>Send Notif</Text>
                            </TouchableOpacity>
                        )}

                        {/* ACCESS CONTROL - requires access_control privilege */}
                        {hasPrivilege('access_control') && (
                            <TouchableOpacity
                                style={styles.actionBtn}
                                onPress={() => setAccessControlVisible(true)}
                            >
                                <View style={[styles.actionIcon, { backgroundColor: '#FEF3C7' }]}>
                                    <MaterialCommunityIcons name="shield-lock-outline" size={24} color="#D97706" />
                                </View>
                                <Text style={styles.actionText}>Access Control</Text>
                            </TouchableOpacity>
                        )}

                        {/* MANAGE BUCKETS - requires manage_buckets privilege */}
                        {hasPrivilege('manage_buckets') && (
                            <TouchableOpacity
                                style={styles.actionBtn}
                                onPress={() => setBucketModalVisible(true)}
                            >
                                <View style={[styles.actionIcon, { backgroundColor: '#EEF2FF' }]}>
                                    <MaterialCommunityIcons name="folder-multiple" size={24} color="#6366F1" />
                                </View>
                                <Text style={styles.actionText}>Manage Buckets</Text>
                            </TouchableOpacity>
                        )}

                        {/* SCHEDULE MEETING - requires schedule_meeting privilege */}
                        {hasPrivilege('schedule_meeting') && (
                            <TouchableOpacity
                                style={styles.actionBtn}
                                onPress={() => setMeetingModalVisible(true)}
                            >
                                <View style={[styles.actionIcon, { backgroundColor: '#DBEAFE' }]}>
                                    <MaterialCommunityIcons name="video-plus" size={24} color="#2563EB" />
                                </View>
                                <Text style={styles.actionText}>Schedule Meeting</Text>
                            </TouchableOpacity>
                        )}

                        {/* CRM TICKETS - requires crm_tickets privilege */}
                        {/* {hasPrivilege('crm_tickets') && (
                            <TouchableOpacity
                                style={styles.actionBtn}
                                onPress={() => setCrmModalVisible(true)}
                            >
                                <View style={[styles.actionIcon, { backgroundColor: '#FEF3C7' }]}>
                                    <MaterialCommunityIcons name="ticket-account" size={24} color="#D97706" />
                                </View>
                                <Text style={styles.actionText}>CRM Tickets</Text>
                            </TouchableOpacity>
                        )} */}

                        {/* MANAGE SIMULATIONS - requires manage_simulations privilege */}
                        {hasPrivilege('manage_simulations') && (
                            <TouchableOpacity
                                style={styles.actionBtn}
                                onPress={() => setSimulationBuilderVisible(true)}
                            >
                                <View style={[styles.actionIcon, { backgroundColor: '#F3E8FF' }]}>
                                    <MaterialCommunityIcons name="movie-filter" size={24} color="#7C3AED" />
                                </View>
                                <Text style={styles.actionText}>Manage Simulations</Text>
                            </TouchableOpacity>
                        )}

                        {/* SCHEDULED EXAMS - Unified Entry Point */}
                        {hasPrivilege('proctored_create_manage') && (
                            <TouchableOpacity
                                style={styles.actionBtn}
                                onPress={() => setScheduledExamsListVisible(true)}
                            >
                                <View style={[styles.actionIcon, { backgroundColor: '#ECFDF5' }]}>
                                    <MaterialCommunityIcons name="calendar-clock" size={24} color="#059669" />
                                </View>
                                <Text style={styles.actionText}>Scheduled Exams</Text>
                            </TouchableOpacity>
                        )}

                        {/* EXAM HISTORY - View all completed exams with reports */}
                        {hasPrivilege('proctored_view_results') && (
                            <TouchableOpacity
                                style={styles.actionBtn}
                                onPress={() => setExamHistoryVisible(true)}
                            >
                                <View style={[styles.actionIcon, { backgroundColor: '#EEF2FF' }]}>
                                    <MaterialCommunityIcons name="clipboard-text-clock" size={24} color="#6366F1" />
                                </View>
                                <Text style={styles.actionText}>Exam Reports</Text>
                            </TouchableOpacity>
                        )}

                        {/* LMS SUPPORT - requires lms_support privilege */}
                        {hasPrivilege('lms_support') && (
                            <TouchableOpacity
                                style={styles.actionBtn}
                                onPress={() => setSupportModalVisible(true)}
                            >
                                <View style={[styles.actionIcon, { backgroundColor: '#FEE2E2' }]}>
                                    <MaterialCommunityIcons name="headset" size={24} color="#DC2626" />
                                </View>
                                <Text style={styles.actionText}>LMS Support</Text>
                            </TouchableOpacity>
                        )}


                        {/* [PHASE 2] CONTENT LIBRARY - requires content_library privilege */}
                        {hasPrivilege('content_library') && (
                            <TouchableOpacity
                                style={styles.actionBtn}
                                onPress={() => setContentLibraryVisible(true)}
                            >
                                <View style={[styles.actionIcon, { backgroundColor: '#DBEAFE' }]}>
                                    <MaterialCommunityIcons name="folder-multiple" size={24} color="#3B82F6" />
                                </View>
                                <Text style={styles.actionText}>Library</Text>
                            </TouchableOpacity>
                        )}


                        {/* [PHASE 2] AUDIT LOGS - requires audit_logs privilege */}
                        {hasPrivilege('audit_logs') && (
                            <TouchableOpacity
                                style={styles.actionBtn}
                                onPress={() => setAuditLogsVisible(true)}
                            >
                                <View style={[styles.actionIcon, { backgroundColor: '#E0E7FF' }]}>
                                    <MaterialCommunityIcons name="history" size={24} color="#6366F1" />
                                </View>
                                <Text style={styles.actionText}>Audit Logs</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* --- [NEW] MANAGE LEARNING PATH SECTION --- */}
                    {hasPrivilege('manage_learning_path') && (
                        <>
                            <View style={styles.sectionHeaderRow}>
                                <Text style={styles.sectionTitle}>Manage Learning Path</Text>
                                <TouchableOpacity onPress={() => setRefreshPath(prev => prev + 1)}>
                                    <Feather name="refresh-cw" size={18} color="#6B7280" />
                                </TouchableOpacity>
                            </View>

                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pathListScroll}>
                                {pathNodes.map((node, index) => (
                                    <TouchableOpacity key={index} style={styles.pathNodeCard} onPress={() => openEditNode(node)}>
                                        <View style={styles.pathNodeIcon}>
                                            <MaterialCommunityIcons name="coffee" size={24} color="#FFF" />
                                        </View>
                                        <View style={styles.pathNodeInfo}>
                                            <Text style={styles.pathNodeTitle} numberOfLines={1}>{node.title}</Text>
                                            <Text style={styles.pathNodeSub}>{node.skippable ? "Skippable" : "Mandatory"}</Text>
                                        </View>
                                        <Feather name="edit-2" size={16} color="#9CA3AF" />
                                    </TouchableOpacity>
                                ))}
                                {pathNodes.length === 0 && (
                                    <Text style={styles.emptyPathText}>No nodes in learning path yet.</Text>
                                )}
                            </ScrollView>
                        </>
                    )}

                </ScrollView>
            </View>

            {/* MODALS */}
            <EditNodeModal
                visible={editModalVisible}
                node={selectedNode}
                onClose={() => setEditModalVisible(false)}
                onSave={handleUpdateNode}
                onDelete={handleDeleteNode}
                onGenerateQuiz={handleGenerateQuiz}
            />

            {/* BULK UPLOAD MODAL */}
            <BulkUploadModal
                visible={bulkModalVisible}
                onClose={() => setBulkModalVisible(false)}
                onUploadComplete={() => setRefreshPath(prev => prev + 1)}
            />

            {/* [NEW] BUCKET MANAGEMENT MODAL */}
            <BucketManagementModal
                visible={bucketModalVisible}
                onClose={() => setBucketModalVisible(false)}
                onBucketsChanged={fetchBuckets}
            />

            <MeetingSchedulerModal
                visible={meetingModalVisible}
                onClose={() => setMeetingModalVisible(false)}
                hostName={name}
                hostEmail={userProfile?.email || 'manager@company.com'}
            />

            {/* [NEW] SIMULATION ADMIN MANAGER - Full Screen */}
            {simulationBuilderVisible && (
                <Modal visible={simulationBuilderVisible} animationType="slide">
                    <SimulationAdminManager
                        onClose={() => {
                            setSimulationBuilderVisible(false);
                            setEditingSimulation(null);
                        }}
                    />
                </Modal>
            )}

            {/* CREATE USER MODAL */}
            <CreateUser
                visible={createUserVisible}
                onClose={() => setCreateUserVisible(false)}
                onCreate={handleCreateUser}
                userProfile={userProfile}
            />

            {/* NOTIFICATION MODAL */}
            <Modal visible={notifModalVisible} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Send Notification</Text>
                            <TouchableOpacity onPress={() => setNotifModalVisible(false)}>
                                <Feather name="x" size={24} color="#374151" />
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.inputLabel}>Title</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Notification Title"
                            value={notifTitle}
                            onChangeText={setNotifTitle}
                        />

                        <Text style={styles.inputLabel}>Message</Text>
                        <TextInput
                            style={[styles.input, { height: 100 }]}
                            placeholder="Message content..."
                            value={notifMessage}
                            onChangeText={setNotifMessage}
                            multiline
                        />

                        <TouchableOpacity
                            style={styles.toggleRow}
                            onPress={() => setIsCrucial(!isCrucial)}
                        >
                            <View style={[styles.checkbox, isCrucial && { backgroundColor: '#EF4444', borderColor: '#EF4444' }]}>
                                {isCrucial && <Feather name="check" size={14} color="#FFF" />}
                            </View>
                            <Text style={styles.toggleLabel}>Mark as Crucial (Blocking)</Text>
                        </TouchableOpacity>

                        {/* FILE PICKER */}
                        <TouchableOpacity
                            style={[styles.filePickBtn, notifFile && styles.filePickBtnActive]}
                            onPress={pickNotifFile}
                        >
                            <Feather name={notifFile ? "check" : "camera"} size={20} color={notifFile ? "#FFF" : "#6B7280"} />
                            <Text style={[styles.filePickText, notifFile && { color: '#FFF' }]}>
                                {notifFile ? "Media Attached" : "Attach Image/Video"}
                            </Text>
                            {notifFile && (
                                <TouchableOpacity onPress={() => setNotifFile(null)} style={{ marginLeft: 10 }}>
                                    <Feather name="x" size={18} color="#FFF" />
                                </TouchableOpacity>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.uploadBtn, { backgroundColor: isCrucial ? '#EF4444' : '#10B981' }]}
                            onPress={handleSendNotification}
                        >
                            {uploading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.uploadBtnText}>Send Notification</Text>}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* PREMIUM UPLOAD MODAL */}
            <Modal visible={uploadVisible} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { maxHeight: height * 0.8 }]}>
                        {/* PREMIUM HEADER - GRADIENT */}
                        <LinearGradient
                            colors={['#7C3AED', '#4F46E5']}
                            style={{ margin: -2, padding: 20, borderTopLeftRadius: 24, borderTopRightRadius: 24, marginBottom: 15 }}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                        >
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', marginRight: 10 }}>
                                        <Feather name="upload-cloud" size={18} color="#FFF" />
                                    </View>
                                    <Text style={{ fontSize: 18, color: '#FFF', fontFamily: 'Poppins_700Bold' }}>Knowledge Base</Text>
                                </View>
                                <TouchableOpacity onPress={() => setUploadVisible(false)} style={{ backgroundColor: 'rgba(255,255,255,0.2)', padding: 5, borderRadius: 8 }}>
                                    <Feather name="x" size={20} color="#FFF" />
                                </TouchableOpacity>
                            </View>
                        </LinearGradient>

                        <ScrollView showsVerticalScrollIndicator={false}>
                            <Text style={styles.inputLabel}>Title</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="e.g. Grinder Maintenance Manual"
                                value={resTitle}
                                onChangeText={setResTitle}
                            />

                            <Text style={styles.inputLabel}>Resource Type</Text>
                            {!newCatMode ? (
                                <View style={{ marginBottom: 15 }}>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row' }}>
                                        {categories.map((cat, i) => (
                                            <TouchableOpacity
                                                key={i}
                                                onPress={() => setResCategory(cat.name)}
                                                style={{
                                                    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginRight: 8,
                                                    backgroundColor: resCategory === cat.name ? '#7C3AED' : '#F3F4F6',
                                                    borderWidth: 1, borderColor: resCategory === cat.name ? '#7C3AED' : '#E5E7EB'
                                                }}
                                            >
                                                <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: resCategory === cat.name ? '#FFF' : '#4B5563' }}>{cat.name}</Text>
                                            </TouchableOpacity>
                                        ))}
                                        <TouchableOpacity
                                            onPress={() => setNewCatMode(true)}
                                            style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#7C3AED', borderStyle: 'dashed' }}
                                        >
                                            <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: '#7C3AED' }}>+ New</Text>
                                        </TouchableOpacity>
                                    </ScrollView>
                                </View>
                            ) : (
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 15, gap: 10 }}>
                                    <TextInput
                                        style={[styles.input, { flex: 1, marginBottom: 0 }]}
                                        placeholder="New Category Name"
                                        value={newCatName}
                                        onChangeText={setNewCatName}
                                    />
                                    <TouchableOpacity onPress={handleCreateCategory} style={{ backgroundColor: '#7C3AED', padding: 12, borderRadius: 12 }}>
                                        <Feather name="check" size={20} color="#FFF" />
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => setNewCatMode(false)} style={{ backgroundColor: '#F3F4F6', padding: 12, borderRadius: 12 }}>
                                        <Feather name="x" size={20} color="#6B7280" />
                                    </TouchableOpacity>
                                </View>
                            )}

                            <Text style={styles.inputLabel}>File (PDF, Video, Excel...)</Text>
                            <TouchableOpacity
                                style={[styles.fileBtn, { borderStyle: 'dashed', borderWidth: 2, borderColor: resFile ? '#10B981' : '#D1D5DB', backgroundColor: resFile ? '#ECFDF5' : '#F9FAFB', height: 100, flexDirection: 'column', gap: 5 }]}
                                onPress={pickResourceFile}
                            >
                                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: resFile ? '#D1FAE5' : '#E5E7EB', justifyContent: 'center', alignItems: 'center' }}>
                                    <Feather name={resFile ? "check" : "file-plus"} size={20} color={resFile ? "#10B981" : "#6B7280"} />
                                </View>
                                <Text style={[styles.fileBtnText, { textAlign: 'center' }]}>
                                    {resFile ? resFile.name : "Tap to Select File"}
                                </Text>
                                {resFile && <Text style={{ fontSize: 10, color: '#6B7280' }}>{(resFile.size / 1024 / 1024).toFixed(2)} MB</Text>}
                            </TouchableOpacity>

                            <Text style={styles.inputLabel}>Description</Text>
                            <TextInput
                                style={[styles.input, { height: 80 }]}
                                placeholder="Brief summary used for AI Search..."
                                value={resDesc}
                                onChangeText={setResDesc}
                                multiline
                            />

                            {/* [NEW] Course Bucket Selector */}
                            <Text style={styles.inputLabel}>Category (Required)</Text>
                            <View style={{ marginBottom: 15 }}>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row' }}>
                                    <TouchableOpacity
                                        onPress={() => setSelectedBucket(null)}
                                        style={{
                                            paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, marginRight: 8,
                                            backgroundColor: !selectedBucket ? '#6366F1' : '#F3F4F6',
                                            borderWidth: 1, borderColor: !selectedBucket ? '#6366F1' : '#E5E7EB',
                                            flexDirection: 'row', alignItems: 'center'
                                        }}
                                    >
                                        <MaterialCommunityIcons name="close-circle" size={14} color={!selectedBucket ? '#FFF' : '#6B7280'} style={{ marginRight: 4 }} />
                                        <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: !selectedBucket ? '#FFF' : '#4B5563' }}>None</Text>
                                    </TouchableOpacity>
                                    {courseBuckets.map((bucket, i) => (
                                        <TouchableOpacity
                                            key={bucket.id}
                                            onPress={() => setSelectedBucket(selectedBucket === bucket.id ? null : bucket.id)}
                                            style={{
                                                paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, marginRight: 8,
                                                backgroundColor: selectedBucket === bucket.id ? bucket.color : '#F3F4F6',
                                                borderWidth: 1, borderColor: selectedBucket === bucket.id ? bucket.color : '#E5E7EB',
                                                flexDirection: 'row', alignItems: 'center'
                                            }}
                                        >
                                            <MaterialCommunityIcons
                                                name={bucket.icon || 'folder'}
                                                size={14}
                                                color={selectedBucket === bucket.id ? '#FFF' : bucket.color}
                                                style={{ marginRight: 4 }}
                                            />
                                            <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: selectedBucket === bucket.id ? '#FFF' : '#4B5563' }}>{bucket.name}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>

                            {/* RESTORED: Add to Path Toggle */}
                            <TouchableOpacity
                                style={styles.toggleRow}
                                onPress={() => setIsPathNode(!isPathNode)}
                            >
                                <View style={[styles.checkbox, isPathNode && { backgroundColor: '#7C3AED', borderColor: '#7C3AED' }]}>
                                    {isPathNode && <Feather name="check" size={14} color="#FFF" />}
                                </View>
                                <Text style={styles.toggleLabel}>Add to Learning Path (Mandatory Training)</Text>
                            </TouchableOpacity>

                            {/* Self Learning Path Toggle - only visible when isPathNode is true */}
                            {isPathNode && (
                                <View style={{ marginTop: 12 }}>
                                    <TouchableOpacity
                                        style={[styles.toggleRow, {
                                            backgroundColor: isSelfLearning ? '#F0FDF4' : '#FFF',
                                            borderWidth: 1,
                                            borderColor: isSelfLearning ? '#10B981' : '#E5E7EB',
                                            borderRadius: 12,
                                            padding: 12
                                        }]}
                                        onPress={() => setIsSelfLearning(!isSelfLearning)}
                                    >
                                        <View style={[styles.checkbox, isSelfLearning && { backgroundColor: '#10B981', borderColor: '#10B981' }]}>
                                            {isSelfLearning && <Feather name="check" size={14} color="#FFF" />}
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                                <MaterialCommunityIcons
                                                    name="school"
                                                    size={16}
                                                    color={isSelfLearning ? '#10B981' : '#6B7280'}
                                                    style={{ marginRight: 6 }}
                                                />
                                                <Text style={[styles.toggleLabel, { color: isSelfLearning ? '#047857' : '#374151' }]}>
                                                    Self Learning Path
                                                </Text>
                                            </View>
                                            <Text style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>
                                                {isSelfLearning
                                                    ? "For mandatory onboarding (Basics, SOPs, Compliance)"
                                                    : "Enable for self-learning, disable for career progression"}
                                            </Text>
                                        </View>
                                    </TouchableOpacity>

                                    {/* Path Type Indicator */}
                                    <View style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: 10,
                                        borderRadius: 10,
                                        marginTop: 10,
                                        backgroundColor: isSelfLearning ? '#ECFDF5' : '#FFF7ED',
                                        borderWidth: 1,
                                        borderColor: isSelfLearning ? '#A7F3D0' : '#FED7AA'
                                    }}>
                                        <MaterialCommunityIcons
                                            name={isSelfLearning ? "book-education" : "trending-up"}
                                            size={18}
                                            color={isSelfLearning ? '#10B981' : '#F59E0B'}
                                        />
                                        <Text style={{
                                            marginLeft: 8,
                                            fontSize: 13,
                                            fontFamily: 'Poppins_600SemiBold',
                                            color: isSelfLearning ? '#047857' : '#D97706'
                                        }}>
                                            {isSelfLearning ? '📚 Self Learning Path' : '🚀 Career Progression Path'}
                                        </Text>
                                    </View>
                                </View>
                            )}

                            <TouchableOpacity
                                style={[styles.uploadBtn, { marginTop: 15 }, uploading && styles.disabledBtn, isSelfLearning && isPathNode && { backgroundColor: '#10B981' }]}
                                onPress={handleUploadResource}
                                disabled={uploading}
                            >
                                {uploading ? <ActivityIndicator color="#FFF" /> : (
                                    <>
                                        <Feather name="upload" size={18} color="#FFF" style={{ marginRight: 8 }} />
                                        <Text style={styles.uploadBtnText}>
                                            {isPathNode
                                                ? (isSelfLearning ? '📚 Upload to Self Learning' : '🚀 Upload to Career Path')
                                                : 'Upload & Publish'
                                            }
                                        </Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </View>
            </Modal >


            {/* QUIZ CREATION MODAL */}
            <QuizCreationModal
                visible={quizModalVisible}
                onClose={() => setQuizModalVisible(false)}
                quizTitle={quizTitle}
                setQuizTitle={setQuizTitle}
                quizDescription={quizDescription}
                setQuizDescription={setQuizDescription}
                currentQuestion={currentQuestion}
                setCurrentQuestion={setCurrentQuestion}
                options={options}
                setOptions={setOptions}
                correctIndex={correctIndex}
                setCorrectIndex={setCorrectIndex}
                questions={questions}
                onAddQuestion={addQuestion}
                onPublish={createQuiz}
            />

            {/* QUIZ RESULTS MODAL */}
            <QuizResultsModal
                visible={resultsModalVisible}
                onClose={() => setResultsModalVisible(false)}
                resultsData={selectedQuizResults}
            />

            {/* NEWS CREATION MODAL */}
            <Modal visible={newsModalVisible} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { maxHeight: '85%' }]}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>📰 Post News</Text>
                            <TouchableOpacity onPress={() => setNewsModalVisible(false)}>
                                <Feather name="x" size={24} color="#6B7280" />
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false}>
                            <Text style={styles.inputLabel}>Title *</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="e.g. New Summer Menu Launch!"
                                value={newsTitle}
                                onChangeText={setNewsTitle}
                            />

                            <Text style={styles.inputLabel}>Author *</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="e.g. HR Team, Head Chef..."
                                value={newsAuthor}
                                onChangeText={setNewsAuthor}
                            />

                            <Text style={styles.inputLabel}>Content *</Text>
                            <TextInput
                                style={[styles.input, { height: 120, textAlignVertical: 'top' }]}
                                placeholder="Write the news content..."
                                value={newsContent}
                                onChangeText={setNewsContent}
                                multiline
                            />

                            <Text style={styles.inputLabel}>Image (Optional)</Text>
                            <TouchableOpacity
                                style={[styles.fileBtn, { borderStyle: 'dashed', borderWidth: 2, borderColor: newsImage ? '#10B981' : '#D1D5DB', backgroundColor: newsImage ? '#ECFDF5' : '#F9FAFB', height: 80 }]}
                                onPress={async () => {
                                    const result = await ImagePicker.launchImageLibraryAsync({
                                        mediaTypes: ImagePicker.MediaTypeOptions.Images,
                                        quality: 0.8
                                    });
                                    if (!result.canceled) {
                                        setNewsImage(result.assets[0]);
                                    }
                                }}
                            >
                                <Feather name={newsImage ? "check" : "image"} size={24} color={newsImage ? "#10B981" : "#6B7280"} />
                                <Text style={styles.fileBtnText}>
                                    {newsImage ? "Image Selected" : "Add Cover Image"}
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.uploadBtn, { opacity: postingNews ? 0.6 : 1 }]}
                                onPress={handlePostNews}
                                disabled={postingNews}
                            >
                                {postingNews ? <ActivityIndicator color="#FFF" /> : (
                                    <>
                                        <MaterialCommunityIcons name="send" size={18} color="#FFF" style={{ marginRight: 8 }} />
                                        <Text style={styles.uploadBtnText}>Publish News</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* TOPIC QUIZ CREATION MODAL */}
            <Modal visible={quizCreationVisible} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { maxHeight: '90%' }]}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>🧠 Create Topic Quiz</Text>
                            <TouchableOpacity onPress={() => setQuizCreationVisible(false)}>
                                <Feather name="x" size={24} color="#6B7280" />
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false}>
                            {/* AI/MANUAL TOGGLE */}
                            <View style={{ flexDirection: 'row', backgroundColor: '#F3F4F6', borderRadius: 12, padding: 4, marginBottom: 20 }}>
                                <TouchableOpacity
                                    style={{ flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: quizMode === 'manual' ? '#FFF' : 'transparent' }}
                                    onPress={() => setQuizMode('manual')}
                                >
                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                        <Feather name="edit-3" size={16} color={quizMode === 'manual' ? '#4F46E5' : '#6B7280'} />
                                        <Text style={{ marginLeft: 6, fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: quizMode === 'manual' ? '#4F46E5' : '#6B7280' }}>Manual</Text>
                                    </View>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={{ flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: quizMode === 'ai' ? '#FFF' : 'transparent' }}
                                    onPress={() => setQuizMode('ai')}
                                >
                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                        <MaterialCommunityIcons name="robot-outline" size={18} color={quizMode === 'ai' ? '#7C3AED' : '#6B7280'} />
                                        <Text style={{ marginLeft: 6, fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: quizMode === 'ai' ? '#7C3AED' : '#6B7280' }}>AI Generate</Text>
                                    </View>
                                </TouchableOpacity>
                            </View>

                            <Text style={styles.inputLabel}>Quiz Title *</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="e.g. Espresso Mastery"
                                value={topicQuizTitle}
                                onChangeText={setTopicQuizTitle}
                            />

                            {/* Difficulty and Time (Stacked for better UI) */}
                            <View style={{ marginTop: 10 }}>
                                <Text style={styles.inputLabel}>Difficulty</Text>
                                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                                    {['Easy', 'Medium', 'Hard'].map(d => (
                                        <TouchableOpacity
                                            key={d}
                                            onPress={() => setTopicQuizDifficulty(d)}
                                            style={{
                                                paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8,
                                                backgroundColor: topicQuizDifficulty === d ?
                                                    (d === 'Easy' ? '#10B981' : d === 'Medium' ? '#F59E0B' : '#EF4444') : '#F3F4F6',
                                                minWidth: 80, alignItems: 'center'
                                            }}
                                        >
                                            <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: topicQuizDifficulty === d ? '#FFF' : '#4B5563' }}>{d}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>

                            {quizMode === 'manual' && (
                                <View style={{ marginTop: 15 }}>
                                    <Text style={styles.inputLabel}>Time (minutes)</Text>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="e.g. 10"
                                        keyboardType="numeric"
                                        value={topicQuizTime}
                                        onChangeText={setTopicQuizTime}
                                    />
                                </View>
                            )}

                            {/* AI MODE CONTENT */}
                            {quizMode === 'ai' && (
                                <View style={{ marginTop: 15 }}>
                                    <Text style={styles.inputLabel}>Upload Content (Video, PDF, Image, Text)</Text>
                                    <TouchableOpacity
                                        style={{
                                            borderWidth: 2, borderStyle: 'dashed', borderRadius: 16, padding: 20,
                                            borderColor: aiQuizFile ? '#7C3AED' : '#D1D5DB',
                                            backgroundColor: aiQuizFile ? '#F5F3FF' : '#F9FAFB',
                                            alignItems: 'center', marginBottom: 15
                                        }}
                                        onPress={pickAiQuizFile}
                                    >
                                        <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: aiQuizFile ? '#7C3AED' : '#E5E7EB', justifyContent: 'center', alignItems: 'center', marginBottom: 10 }}>
                                            <MaterialCommunityIcons name={aiQuizFile ? "check" : "file-upload-outline"} size={24} color={aiQuizFile ? "#FFF" : "#6B7280"} />
                                        </View>
                                        <Text style={{ fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: aiQuizFile ? '#7C3AED' : '#4B5563' }}>
                                            {aiQuizFile ? aiQuizFile.name : 'Tap to Select File'}
                                        </Text>
                                        <Text style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>
                                            Supported: MP4, PDF, JPG, PNG, TXT
                                        </Text>
                                    </TouchableOpacity>

                                    <Text style={styles.inputLabel}>Number of Questions: {aiQuizNumQuestions}</Text>
                                    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
                                        {[3, 5, 7, 10].map(n => (
                                            <TouchableOpacity
                                                key={n}
                                                onPress={() => setAiQuizNumQuestions(n)}
                                                style={{
                                                    flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
                                                    backgroundColor: aiQuizNumQuestions === n ? '#7C3AED' : '#F3F4F6'
                                                }}
                                            >
                                                <Text style={{ fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: aiQuizNumQuestions === n ? '#FFF' : '#4B5563' }}>{n}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>

                                    <TouchableOpacity
                                        style={[styles.uploadBtn, { backgroundColor: '#7C3AED', opacity: generatingAiQuiz ? 0.6 : 1 }]}
                                        onPress={handleGenerateAiQuiz}
                                        disabled={generatingAiQuiz}
                                    >
                                        {generatingAiQuiz ? (
                                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                                <ActivityIndicator color="#FFF" />
                                                <Text style={[styles.uploadBtnText, { marginLeft: 10 }]}>AI Generating...</Text>
                                            </View>
                                        ) : (
                                            <>
                                                <MaterialCommunityIcons name="robot" size={18} color="#FFF" style={{ marginRight: 8 }} />
                                                <Text style={styles.uploadBtnText}>Generate Quiz with AI</Text>
                                            </>
                                        )}
                                    </TouchableOpacity>
                                </View>
                            )}

                            {/* MANUAL MODE CONTENT */}
                            {quizMode === 'manual' && (
                                <>
                                    <Text style={[styles.inputLabel, { marginTop: 15 }]}>Questions</Text>
                                    {topicQuizQuestions.map((q, qi) => (
                                        <View key={qi} style={{ backgroundColor: '#F9FAFB', padding: 12, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#E5E7EB' }}>
                                            <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: '#6B7280', marginBottom: 8 }}>Question {qi + 1}</Text>
                                            <TextInput
                                                style={[styles.input, { marginBottom: 8 }]}
                                                placeholder="Enter question..."
                                                value={q.question}
                                                onChangeText={(text) => {
                                                    const updated = [...topicQuizQuestions];
                                                    updated[qi].question = text;
                                                    setTopicQuizQuestions(updated);
                                                }}
                                            />
                                            {q.options.map((opt, oi) => (
                                                <View key={oi} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                                    <TouchableOpacity
                                                        onPress={() => {
                                                            const updated = [...topicQuizQuestions];
                                                            updated[qi].correct = oi;
                                                            setTopicQuizQuestions(updated);
                                                        }}
                                                        style={{
                                                            width: 24, height: 24, borderRadius: 12, borderWidth: 2,
                                                            borderColor: q.correct === oi ? '#10B981' : '#D1D5DB',
                                                            backgroundColor: q.correct === oi ? '#10B981' : 'transparent',
                                                            justifyContent: 'center', alignItems: 'center'
                                                        }}
                                                    >
                                                        {q.correct === oi && <Feather name="check" size={12} color="#FFF" />}
                                                    </TouchableOpacity>
                                                    <TextInput
                                                        style={[styles.input, { flex: 1, marginBottom: 0 }]}
                                                        placeholder={`Option ${oi + 1}`}
                                                        value={opt}
                                                        onChangeText={(text) => {
                                                            const updated = [...topicQuizQuestions];
                                                            updated[qi].options[oi] = text;
                                                            setTopicQuizQuestions(updated);
                                                        }}
                                                    />
                                                </View>
                                            ))}
                                        </View>
                                    ))}

                                    <TouchableOpacity
                                        style={{ padding: 12, backgroundColor: '#F3F4F6', borderRadius: 12, alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: '#E5E7EB', borderStyle: 'dashed' }}
                                        onPress={() => setTopicQuizQuestions([...topicQuizQuestions, { question: '', options: ['', '', '', ''], correct: 0 }])}
                                    >
                                        <Feather name="plus" size={20} color="#6B7280" />
                                        <Text style={{ fontSize: 12, fontFamily: 'Poppins_500Medium', color: '#6B7280', marginTop: 4 }}>Add Question</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={[styles.uploadBtn, { opacity: postingQuiz ? 0.6 : 1 }]}
                                        onPress={handlePostTopicQuiz}
                                        disabled={postingQuiz}
                                    >
                                        {postingQuiz ? <ActivityIndicator color="#FFF" /> : (
                                            <>
                                                <MaterialCommunityIcons name="send" size={18} color="#FFF" style={{ marginRight: 8 }} />
                                                <Text style={styles.uploadBtnText}>Publish Quiz</Text>
                                            </>
                                        )}
                                    </TouchableOpacity>
                                </>
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* ACCESS CONTROL MODAL */}
            <AccessControlModal
                visible={accessControlVisible}
                onClose={() => setAccessControlVisible(false)}
            />

            {/* CRM TICKET MODAL */}
            <CRMTicketModal
                visible={crmModalVisible}
                onClose={() => setCrmModalVisible(false)}
            />
            {/* LMS SUPPORT TICKET MODAL */}
            <SupportTicketModal
                visible={supportModalVisible}
                onClose={() => setSupportModalVisible(false)}
                userEmail={userProfile?.email || "admin@example.com"}
                userName={name}
                userRole={isSuperAdmin ? "superadmin" : "manager"}
            />



            {/* [PHASE 2] CONTENT LIBRARY MODAL */}
            <ContentLibraryModal
                visible={contentLibraryVisible}
                onClose={() => setContentLibraryVisible(false)}
            />



            {/* [PHASE 2] AUDIT LOGS MODAL */}
            <AuditLogsModal
                visible={auditLogsVisible}
                onClose={() => setAuditLogsVisible(false)}
            />

            {/* [NEW] SCHEDULE EXAM MODAL */}
            <ScheduleExamModal
                visible={scheduleExamVisible}
                onClose={() => setScheduleExamVisible(false)}
                userProfile={userProfile}
            />

            {/* [NEW] EXAM ATTENDANCE MODAL */}
            <ExamAttendanceModal
                visible={examAttendanceVisible}
                onClose={() => setExamAttendanceVisible(false)}
                exam={selectedExamForAttendance}
                userProfile={userProfile}
            />

            {/* [NEW] SCHEDULED EXAMS LIST MODAL */}
            <ScheduledExamsListModal
                visible={scheduledExamsListVisible}
                onClose={() => setScheduledExamsListVisible(false)}
                userProfile={userProfile}
                onSelectExam={(exam) => {
                    setScheduledExamsListVisible(false);
                    setSelectedExamForAttendance(exam);
                    setTimeout(() => setExamAttendanceVisible(true), 500);
                }}
                onCreateNew={() => {
                    setScheduledExamsListVisible(false);
                    setTimeout(() => setScheduleExamVisible(true), 500);
                }}
            />

            {/* [NEW] EXAM HISTORY MODAL */}
            <ExamHistoryModal
                visible={examHistoryVisible}
                onClose={() => setExamHistoryVisible(false)}
            />

            {/* ADMIN AI ANALYST FLOATING BUTTON */}
            {isSuperAdmin && (
                <TouchableOpacity
                    style={{
                        position: 'absolute', bottom: 30, right: 30,
                        backgroundColor: '#7C3AED', width: 60, height: 60,
                        borderRadius: 30, justifyContent: 'center', alignItems: 'center',
                        shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.4, shadowRadius: 10, elevation: 8
                    }}
                    onPress={() => setAdminChatVisible(true)}
                >
                    <MaterialCommunityIcons name="robot" size={32} color="#FFF" />
                </TouchableOpacity>
            )}

            {/* ADMIN AI ANALYST MODAL */}
            <Modal visible={adminChatVisible} animationType="slide" transparent>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                    <View style={styles.modalOverlay}>
                        <View style={[styles.modalContent, { height: '80%', padding: 0, overflow: 'hidden' }]}>
                            {/* Chat Header */}
                            <LinearGradient
                                colors={['#7C3AED', '#4F46E5']}
                                style={{ padding: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                            >
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', marginRight: 10 }}>
                                        <MaterialCommunityIcons name="robot" size={20} color="#FFF" />
                                    </View>
                                    <Text style={{ fontSize: 18, fontFamily: 'Poppins_700Bold', color: '#FFF' }}>Admin Analyst AI</Text>
                                </View>
                                <TouchableOpacity onPress={() => setAdminChatVisible(false)}>
                                    <Feather name="x" size={24} color="#FFF" />
                                </TouchableOpacity>
                            </LinearGradient>

                            {/* Chat Messages */}
                            <ScrollView
                                style={{ flex: 1, backgroundColor: '#F3F4F6', padding: 15 }}
                                contentContainerStyle={{ paddingBottom: 20 }}
                                ref={ref => ref?.scrollToEnd({ animated: true })}
                            >
                                {chatMessages.map((msg, i) => (
                                    <View
                                        key={i}
                                        style={{
                                            alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                                            backgroundColor: msg.role === 'user' ? '#7C3AED' : '#FFF',
                                            padding: 12,
                                            borderRadius: 16,
                                            borderBottomRightRadius: msg.role === 'user' ? 4 : 16,
                                            borderTopLeftRadius: msg.role === 'ai' ? 4 : 16,
                                            maxWidth: '80%',
                                            marginBottom: 10,
                                            shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, elevation: 1
                                        }}
                                    >
                                        <Text style={{ fontSize: 14, fontFamily: 'Poppins_400Regular', color: msg.role === 'user' ? '#FFF' : '#374151' }}>
                                            {msg.content}
                                        </Text>
                                    </View>
                                ))}
                                {isChatLoading && (
                                    <View style={{ alignSelf: 'flex-start', backgroundColor: '#FFF', padding: 12, borderRadius: 16, borderTopLeftRadius: 4, marginBottom: 10 }}>
                                        <ActivityIndicator size="small" color="#7C3AED" />
                                    </View>
                                )}
                            </ScrollView>

                            {/* Chat Input */}
                            <View style={{ padding: 15, backgroundColor: '#FFF', borderTopWidth: 1, borderColor: '#E5E7EB', flexDirection: 'row', alignItems: 'center' }}>
                                <TextInput
                                    style={{ flex: 1, backgroundColor: '#F9FAFB', borderRadius: 24, paddingHorizontal: 20, paddingVertical: 12, fontSize: 14, fontFamily: 'Poppins_400Regular', borderWidth: 1, borderColor: '#E5E7EB', marginRight: 10 }}
                                    placeholder="Ask about system stats, user trends, or quizzes..."
                                    value={chatInput}
                                    onChangeText={setChatInput}
                                    onSubmitEditing={handleAdminAskAI}
                                />
                                <TouchableOpacity
                                    onPress={handleAdminAskAI}
                                    disabled={!chatInput.trim() || isChatLoading}
                                    style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: chatInput.trim() ? '#7C3AED' : '#D1D5DB', justifyContent: 'center', alignItems: 'center' }}
                                >
                                    <MaterialCommunityIcons name="send" size={20} color="#FFF" />
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({

    container: {
        flex: 1,
        backgroundColor: '#F9FAFB',
    },
    headerBg: {
        height: 280,
        paddingHorizontal: 20,
        paddingTop: 20,
        borderBottomLeftRadius: 30,
        borderBottomRightRadius: 30,
    },
    headerContent: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginTop: 20,
    },
    backBtn: {
        padding: 10,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 12,
        marginRight: 10,
    },
    welcomeText: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
    },
    nameText: {
        color: '#FFF',
        fontSize: 22,
        fontFamily: 'Poppins_700Bold',
        marginBottom: 8,
    },
    roleBadge: {
        backgroundColor: 'rgba(255,255,255,0.2)',
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 20,
        alignSelf: 'flex-start',
    },
    roleText: {
        color: '#FFF',
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
    },
    logo: {
        width: 60,
        height: 60,
        tintColor: '#FFF',
        opacity: 0.5,
    },
    bodyContainer: {
        flex: 1,
        marginTop: -80,
        paddingHorizontal: 20,
    },
    sectionTitle: {
        fontSize: 18,
        fontFamily: 'Poppins_600SemiBold',
        color: '#111827',
        marginBottom: 15,
        marginTop: 25,
    },
    statsGrid: {
        gap: 15,
    },
    statCard: {
        backgroundColor: '#FFF',
        borderRadius: 16,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 3,
        marginBottom: 10,
    },
    statCardAlert: {
        borderLeftWidth: 4,
        borderLeftColor: '#EF4444',
    },
    statIconBg: {
        width: 48,
        height: 48,
        borderRadius: 12,
        backgroundColor: '#1F2937',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 15,
    },
    statLabel: {
        fontSize: 12,
        color: '#6B7280',
        fontFamily: 'Poppins_500Medium',
    },
    statValue: {
        fontSize: 20,
        color: '#111827',
        fontFamily: 'Poppins_700Bold',
    },
    trendBadge: {
        marginLeft: 'auto',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    trendText: {
        fontSize: 12,
        fontFamily: 'Poppins_700Bold',
    },
    aiCard: {
        marginTop: 25,
        borderRadius: 20,
        overflow: 'hidden',
        shadowColor: '#4C1D95',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 15,
        elevation: 8,
    },
    aiGradient: {
        padding: 20,
    },
    aiHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
    },
    aiTitle: {
        color: '#FBBF24',
        fontFamily: 'Poppins_700Bold',
        fontSize: 16,
        marginLeft: 8,
    },
    aiText: {
        color: '#FFF',
        fontFamily: 'Poppins_400Regular',
        fontSize: 14,
        lineHeight: 22,
        marginBottom: 15,
    },
    aiBtn: {
        backgroundColor: 'rgba(255,255,255,0.2)',
        paddingVertical: 10,
        alignItems: 'center',
        borderRadius: 12,
    },
    aiBtnText: {
        color: '#FFF',
        fontFamily: 'Poppins_600SemiBold',
    },
    feedSection: {
        marginBottom: 10,
    },
    feedItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        padding: 15,
        borderRadius: 12,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    feedIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 15,
    },
    feedTitle: {
        color: '#374151',
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
    },
    feedTime: {
        color: '#9CA3AF',
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
    },
    actionGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        gap: 15,
    },
    actionBtn: {
        width: (width - 55) / 2, // 2 cols
        backgroundColor: '#FFF',
        padding: 20,
        borderRadius: 16,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 2,
    },
    actionIcon: {
        width: 50,
        height: 50,
        borderRadius: 25,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
    },
    actionText: {
        color: '#374151',
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 14,
    },

    // MODAL STYLES
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        padding: 20
    },
    modalContent: {
        backgroundColor: '#FFF',
        borderRadius: 20,
        padding: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 20,
        elevation: 10,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20
    },
    modalTitle: {
        fontSize: 20,
        fontFamily: 'Poppins_700Bold',
        color: '#111827'
    },
    inputLabel: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#374151',
        marginBottom: 6,
        marginTop: 10
    },
    input: {
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 12,
        padding: 12,
        fontSize: 16,
        fontFamily: 'Poppins_400Regular',
    },
    uploadBtn: {
        backgroundColor: '#F59E0B',
        paddingVertical: 16,
        borderRadius: 14,
        alignItems: 'center',
        marginTop: 30
    },
    disabledBtn: {
        opacity: 0.7,
        backgroundColor: '#D1D5DB'
    },
    uploadBtnText: {
        color: '#FFF',
        fontSize: 16,
        fontFamily: 'Poppins_700Bold'
    },

    // FILE PICKER
    fileBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        backgroundColor: '#F3F4F6',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderStyle: 'dashed'
    },
    fileBtnText: {
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        color: '#6B7280',
        marginLeft: 10
    },
    toggleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 15,
        marginBottom: 5,
    },
    checkbox: {
        width: 20,
        height: 20,
        borderRadius: 4,
        borderWidth: 2,
        borderColor: '#9CA3AF',
        marginRight: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    checkboxActive: {
        backgroundColor: '#F59E0B',
        borderColor: '#F59E0B',
    },
    toggleLabel: { fontSize: 14, fontFamily: 'Poppins_500Medium', color: '#374151' },

    // PATH MANAGE STYLES [NEW]
    sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 20, marginTop: 20, marginBottom: 10 },
    pathListScroll: { paddingLeft: 20, marginBottom: 30 },
    pathNodeCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 12, borderRadius: 12, marginRight: 12, width: 220, borderWidth: 1, borderColor: '#E5E7EB', shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05 },
    pathNodeIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F59E0B', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
    pathNodeInfo: { flex: 1 },
    pathNodeTitle: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: '#111827' },
    pathNodeSub: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: '#6B7280' },
    emptyPathText: { marginLeft: 20, color: '#9CA3AF', fontStyle: 'italic' },

    // QUICK ACTION STYLES
    sectionContainer: { marginTop: 24, paddingHorizontal: 20 },
    sectionTitle: { fontSize: 18, fontFamily: 'Poppins_700Bold', color: '#111827', marginBottom: 16 },
    actionGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    actionBtn: { width: (width - 60) / 4, alignItems: 'center', marginBottom: 20 },
    actionIcon: { width: 50, height: 50, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
    actionText: { fontSize: 11, fontFamily: 'Poppins_500Medium', color: '#4B5563', textAlign: 'center' }
});
