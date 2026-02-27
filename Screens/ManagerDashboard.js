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
import { MaterialCommunityIcons, Feather, Ionicons, MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as DocumentPicker from 'expo-document-picker';
import { Video } from 'expo-av';
import { BlurView } from 'expo-blur';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import Svg, { Circle, G, Text as SvgText } from 'react-native-svg';
import { QuizCreationModal, QuizResultsModal } from '../Components/QuizModals';
import EditNodeModal from '../Components/EditNodeModal';
import BulkUploadModal from '../Components/BulkUploadModal'; // [NEW]
import FolderUploadModal from '../Components/FolderUploadModal'; // [NEW] Folder hierarchy upload
import BucketManagementModal from '../Components/BucketManagementModal'; // [NEW] Bucket management
import CurriculumHierarchyModal from '../Components/CurriculumHierarchyModal'; // Curriculum hierarchy (level-to-course mapping)
import DataAccessControlModal from '../Components/DataAccessControlModal'; // [NEW] Granular user data access control
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
import ModeSwitcher from '../Components/ModeSwitcher'; // [NEW] Mode Switcher
import ModeIndicator from '../Components/ModeIndicator'; // [NEW] Mode Indicator
import ImpactUserPickerModal from '../Components/ImpactUserPickerModal';



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

    // User Mode State
    const [userMode, setUserMode] = useState('admin');

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

    // [NEW] Persist/Fetch profile from Storage if params missing (Logic match with Home.js)
    useEffect(() => {
        const checkProfile = async () => {
            if (userProfile) {
                await AsyncStorage.setItem('userProfile', JSON.stringify(userProfile));
            } else {
                const stored = await AsyncStorage.getItem('userProfile');
                if (stored) {
                    const profile = JSON.parse(stored);
                    if (profile.role && profile.role !== 'User') { // Only restore if it looks like admin
                        // In a real app we might force reload or set state, but here we just log
                        console.log("Restored Admin Profile from Storage:", profile.email);
                    }
                }
            }
        };
        checkProfile();
    }, [userProfile]);

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

    // Impact Existing Users Progress - for single upload
    const [impactExisting, setImpactExisting] = useState(true);
    const [affectedUsers, setAffectedUsers] = useState(null);
    const [loadingAffectedUsers, setLoadingAffectedUsers] = useState(false);
    const [showAffectedUsersModal, setShowAffectedUsersModal] = useState(false);
    const [selectedImpactedUsers, setSelectedImpactedUsers] = useState(new Set());
    const [bulkModalVisible, setBulkModalVisible] = useState(false); // [NEW] - This is for video/content bulk upload
    const [folderUploadVisible, setFolderUploadVisible] = useState(false); // [NEW] - Folder hierarchy upload
    const [bulkUploadTask, setBulkUploadTask] = useState(null); // { id, progress, status, total, current, error }

    // Poll for bulk upload progress
    useEffect(() => {
        let interval;
        if (bulkUploadTask && bulkUploadTask.status === 'processing') {
            interval = setInterval(async () => {
                try {
                    const response = await fetch(`${API_URL}/api/v1/users/bulk-upload/status/${bulkUploadTask.id}`);
                    if (response.ok) {
                        const data = await response.json();
                        setBulkUploadTask(prev => ({ ...prev, ...data }));

                        if (data.status === 'completed') {
                            Alert.alert(
                                "Bulk Upload Complete",
                                `Successfully created ${data.results.created} users.\nSkipped: ${data.results.skipped}\nErrors: ${data.results.errors.length}`
                            );
                            // Clear task after a delay so user sees 100%
                            setTimeout(() => setBulkUploadTask(null), 5000);
                        } else if (data.status === 'failed') {
                            Alert.alert("Bulk Upload Failed", data.error || "Unknown error");
                            // Clear task after delay
                            setTimeout(() => setBulkUploadTask(null), 5000);
                        }
                    }
                } catch (error) {
                    console.error("Error polling bulk upload status:", error);
                }
            }, 2000); // Poll every 2 seconds
        }
        return () => clearInterval(interval);
    }, [bulkUploadTask]);

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

    // Curriculum Hierarchy Modal State (formerly Access Control)
    const [curriculumHierarchyVisible, setCurriculumHierarchyVisible] = useState(false);
    // [NEW] Data Access Control Modal State
    const [dataAccessControlVisible, setDataAccessControlVisible] = useState(false);
    const [loadingBuckets, setLoadingBuckets] = useState(false);

    // [NEW] Simulation Flow Builder State
    const [simulationBuilderVisible, setSimulationBuilderVisible] = useState(false);
    const [editingSimulation, setEditingSimulation] = useState(null);

    // [NEW] Schedule Exam State
    const [scheduleExamVisible, setScheduleExamVisible] = useState(false);
    const [scheduledExamsListVisible, setScheduledExamsListVisible] = useState(false); // [NEW] List Modal
    const [examAttendanceVisible, setExamAttendanceVisible] = useState(false);
    const [selectedExamForAttendance, setSelectedExamForAttendance] = useState(null);
    const [editingExam, setEditingExam] = useState(null); // [NEW] Exam being edited
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

    // Fetch affected users when learning path type changes
    useEffect(() => {
        if (uploadVisible && isPathNode) {
            const learningPathType = isSelfLearning ? 'self_learning' : 'career_progression';
            fetchAffectedUsers(learningPathType);
        }
    }, [uploadVisible, isSelfLearning, isPathNode]);

    const fetchAffectedUsers = async (learningPathType) => {
        setLoadingAffectedUsers(true);
        try {
            const token = await AsyncStorage.getItem('userToken');
            const response = await fetch(
                `${API_URL}/api/v1/self-learning/admin/learning-path/${learningPathType}/affected-users`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                    },
                }
            );
            if (response.ok) {
                const data = await response.json();
                setAffectedUsers(data);
                // By default, select all completed users when Impact mode is on
                if (data.completed_users && impactExisting) {
                    setSelectedImpactedUsers(new Set(data.completed_users.map(u => u.email)));
                }
            }
        } catch (error) {
            console.error('Error fetching affected users:', error);
        } finally {
            setLoadingAffectedUsers(false);
        }
    };

    // Toggle individual user selection for impact
    const toggleUserImpact = (email) => {
        setSelectedImpactedUsers(prev => {
            const newSet = new Set(prev);
            if (newSet.has(email)) {
                newSet.delete(email);
            } else {
                newSet.add(email);
            }
            return newSet;
        });
    };

    // Select all completed users for impact
    const selectAllCompletedUsers = () => {
        if (affectedUsers?.completed_users) {
            setSelectedImpactedUsers(new Set(affectedUsers.completed_users.map(u => u.email)));
        }
    };

    // Deselect all users (no one will be impacted)
    const deselectAllUsers = () => {
        setSelectedImpactedUsers(new Set());
    };

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
            formData.append('impacts_existing_progress', impactExisting ? 'true' : 'false');
            formData.append('impacted_users', JSON.stringify(Array.from(selectedImpactedUsers)));

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
                setImpactExisting(true); // Reset impact setting
                setAffectedUsers(null);
                setShowAffectedUsersModal(false);
                setSelectedImpactedUsers(new Set());
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
                if (Platform.OS === 'web') {
                    // WEB: Convert URI to Blob -> File
                    const response = await fetch(newsImage.uri);
                    const blob = await response.blob();
                    const file = new File([blob], "news_image.jpg", { type: "image/jpeg" });
                    formData.append('image', file);
                } else {
                    // NATIVE: Use internal object format
                    formData.append('image', {
                        uri: newsImage.uri,
                        name: 'news_image.jpg',
                        type: 'image/jpeg'
                    });
                }
            }

            const response = await fetch(`${API_URL}/api/v1/notifications/news`, {
                method: 'POST',
                body: formData
            });

            const result = await response.json();
            if (response.ok) {
                Alert.alert("Success", "News posted to all users!");
                setNewsModalVisible(false);
                setNewsTitle('');
                setNewsContent('');
                setNewsAuthor('');
                setNewsImage(null);
            } else {
                Alert.alert("Error", result.detail || "Failed to post news.");
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

            if (Platform.OS === 'web') {
                // WEB: Convert URI to Blob/File
                const response = await fetch(aiQuizFile.uri);
                const blob = await response.blob();
                const file = new File([blob], aiQuizFile.name, { type: aiQuizFile.mimeType || 'application/octet-stream' });
                formData.append('file', file);
            } else {
                // NATIVE: Use internal object format
                formData.append('file', {
                    uri: aiQuizFile.uri,
                    name: aiQuizFile.name,
                    type: aiQuizFile.mimeType || 'application/octet-stream'
                });
            }

            const response = await fetch(`${API_URL}/api/v1/quizzes/generate/from-content`, {
                method: 'POST',
                body: formData
            });

            const result = await response.json();
            if (response.ok && (result.status === 'success' || result.questions)) {
                // Fill the form with generated questions for manual editing
                const generatedQuestions = (result.questions || []).map(q => ({
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
                // Infer type from extension if needed
                const fileType = notifFile.type === 'video' ? 'video/mp4' : 'image/jpeg';
                const fileName = `upload.${notifFile.type === 'video' ? 'mp4' : 'jpg'}`;

                if (Platform.OS === 'web') {
                    // WEB: Convert URI to Blob/File
                    const response = await fetch(notifFile.uri);
                    const blob = await response.blob();
                    const file = new File([blob], fileName, { type: fileType });
                    formData.append('file', file);
                } else {
                    // NATIVE: Use internal object format
                    formData.append('file', {
                        uri: notifFile.uri,
                        name: fileName,
                        type: fileType
                    });
                }
            }

            // NOTE: Do NOT set Content-Type header manually - FormData sets it automatically with boundary
            const response = await fetch(`${API_URL}/api/v1/notifications/send`, {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (response.ok && (data.status === 'success' || data.id)) {
                Alert.alert("Sent", "Notification broadcasted successfully!");
                setNotifModalVisible(false);
                setNotifTitle('');
                setNotifMessage('');
                setIsCrucial(false);
                setNotifFile(null);
            } else {
                Alert.alert("Error", data.detail || "Failed to send notification");
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
        if (Platform.OS === 'web') {
            const confirm = window.confirm("Are you sure you want to logout?");
            if (confirm) {
                try {
                    await AsyncStorage.removeItem('userToken');
                    await AsyncStorage.removeItem('userRole');
                    navigation.dispatch(
                        CommonActions.reset({
                            index: 0,
                            routes: [{ name: 'Login' }],
                        })
                    );
                } catch (e) {
                    console.error('Logout error:', e);
                    alert('Failed to logout. Please try again.');
                }
            }
            return;
        }

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
                            await SecureStore.deleteItemAsync('userToken');
                            await SecureStore.deleteItemAsync('userRole');

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

    // Load user mode on mount
    useEffect(() => {
        const loadUserMode = async () => {
            try {
                const mode = await AsyncStorage.getItem('userMode');
                if (mode) {
                    setUserMode(mode);
                }
            } catch (error) {
                console.error('Error loading user mode:', error);
            }
        };
        loadUserMode();
    }, []);

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

                    {/* MODE INDICATOR & SWITCHER */}
                    <Animated.View entering={FadeInDown.delay(400)} style={styles.modeSection}>
                        <ModeIndicator mode={userMode} style={{ marginBottom: 12 }} />
                        <ModeSwitcher
                            navigation={navigation}
                            currentMode={userMode}
                            userProfile={userProfile}
                        />
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
                                onPress={() => navigation.navigate('AdminReports', { userProfile })}
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

                        {/* FOLDER UPLOAD - requires bulk_upload privilege, web only */}
                        {hasPrivilege('bulk_upload') && Platform.OS === 'web' && (
                            <TouchableOpacity style={styles.actionBtn} onPress={() => setFolderUploadVisible(true)}>
                                <View style={[styles.actionIcon, { backgroundColor: '#DBEAFE' }]}>
                                    <MaterialCommunityIcons name="folder-upload" size={24} color="#2563EB" />
                                </View>
                                <Text style={styles.actionText}>Upload Folder</Text>
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

                        {/* CURRICULUM HIERARCHY - requires access_control privilege */}
                        {hasPrivilege('access_control') && (
                            <TouchableOpacity
                                style={styles.actionBtn}
                                onPress={() => setCurriculumHierarchyVisible(true)}
                            >
                                <View style={[styles.actionIcon, { backgroundColor: '#FEF3C7' }]}>
                                    <MaterialCommunityIcons name="sitemap" size={24} color="#D97706" />
                                </View>
                                <Text style={styles.actionText}>Curriculum</Text>
                            </TouchableOpacity>
                        )}

                        {/* DATA ACCESS CONTROL - requires data_access_control privilege */}
                        {hasPrivilege('data_access_control') && (
                            <TouchableOpacity
                                style={styles.actionBtn}
                                onPress={() => setDataAccessControlVisible(true)}
                            >
                                <View style={[styles.actionIcon, { backgroundColor: '#DBEAFE' }]}>
                                    <MaterialCommunityIcons name="account-key-outline" size={24} color="#3B82F6" />
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
                        {false && hasPrivilege('schedule_meeting') && (
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

                        {/* LMS SUPPORT - requires support_library privilege */}
                        {hasPrivilege('support_library') && (
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


                        {/* [PHASE 2] CONTENT LIBRARY - requires upload_training_view privilege */}
                        {hasPrivilege('upload_training_view') && (
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


                        {/* [PHASE 2] AUDIT LOGS - requires view_audit_logs privilege */}
                        {hasPrivilege('view_audit_logs') && (
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

            {/* [NEW] FOLDER UPLOAD MODAL - Hierarchical folder structure upload */}
            <FolderUploadModal
                visible={folderUploadVisible}
                onClose={() => setFolderUploadVisible(false)}
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


            {/* PROGRESS BAR FOR BULK UPLOAD */}
            {bulkUploadTask && (
                <View style={{
                    position: 'absolute', bottom: Platform.OS === 'web' ? 20 : 100, alignSelf: 'center',
                    width: width * 0.9, maxWidth: 400,
                    backgroundColor: '#FFF', borderRadius: 12, padding: 12,
                    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 10,
                    borderWidth: 1, borderColor: '#E5E7EB',
                    zIndex: 9999
                }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                        <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: '#374151' }}>
                            Bulk Uploading Users: {bulkUploadTask.progress}%
                        </Text>
                        <Text style={{ fontSize: 12, fontFamily: 'Poppins_500Medium', color: '#6B7280' }}>
                            {bulkUploadTask.status === 'processing' ? `${bulkUploadTask.current}/${bulkUploadTask.total}` : bulkUploadTask.status}
                        </Text>
                    </View>
                    <View style={{ height: 6, backgroundColor: '#F3F4F6', borderRadius: 3, overflow: 'hidden' }}>
                        <View style={{ height: '100%', backgroundColor: '#F59E0B', width: `${bulkUploadTask.progress}%` }} />
                    </View>
                    {bulkUploadTask.status === 'failed' && (
                        <Text style={{ fontSize: 11, color: '#EF4444', marginTop: 4 }}>Error: {bulkUploadTask.error}</Text>
                    )}
                </View>
            )}

            {/* CREATE USER MODAL */}
            <CreateUser
                visible={createUserVisible}
                onClose={() => setCreateUserVisible(false)}
                onCreate={handleCreateUser}
                userProfile={userProfile}
                onBulkUploadStart={(taskId) => {
                    setBulkUploadTask({ id: taskId, progress: 0, status: 'processing', total: 0, current: 0 });
                    setCreateUserVisible(false); // Close modal so user can do other things
                    Alert.alert("Background Upload Started", "The upload will continue in the background. You can track progress on the dashboard.");
                }}
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

                                    {/* IMPACT EXISTING USERS SETTING */}
                                    <View style={styles.impactSettingContainer}>
                                        <View style={styles.impactSettingHeader}>
                                            <MaterialIcons name="info-outline" size={18} color="#3B82F6" />
                                            <Text style={styles.impactSettingTitle}>Impact Existing Users' Progress</Text>
                                        </View>
                                        <Text style={styles.impactSettingDesc}>
                                            Choose whether this course affects users who have already completed this path.
                                        </Text>
                                        <View style={styles.impactButtons}>
                                            <TouchableOpacity
                                                style={[
                                                    styles.impactButton,
                                                    impactExisting && styles.impactButtonActive
                                                ]}
                                                onPress={() => {
                                                    setImpactExisting(true);
                                                    if (affectedUsers?.completed_users) {
                                                        setSelectedImpactedUsers(new Set(affectedUsers.completed_users.map(u => u.email)));
                                                    }
                                                }}
                                            >
                                                <MaterialIcons name="group" size={18} color={impactExisting ? '#FFF' : '#6B7280'} />
                                                <View style={styles.impactButtonTextContainer}>
                                                    <Text style={[styles.impactButtonTitle, impactExisting && styles.impactButtonTitleActive]}>
                                                        Impact All
                                                    </Text>
                                                    <Text style={[styles.impactButtonSubtitle, impactExisting && styles.impactButtonSubtitleActive]}>
                                                        Users must complete
                                                    </Text>
                                                </View>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[
                                                    styles.impactButton,
                                                    !impactExisting && styles.impactButtonActiveGreen
                                                ]}
                                                onPress={() => {
                                                    setImpactExisting(false);
                                                    setSelectedImpactedUsers(new Set());
                                                }}
                                            >
                                                <MaterialIcons name="group-off" size={18} color={!impactExisting ? '#FFF' : '#6B7280'} />
                                                <View style={styles.impactButtonTextContainer}>
                                                    <Text style={[styles.impactButtonTitle, !impactExisting && styles.impactButtonTitleActive]}>
                                                        No Impact
                                                    </Text>
                                                    <Text style={[styles.impactButtonSubtitle, !impactExisting && styles.impactButtonSubtitleActive]}>
                                                        Stay at 100%
                                                    </Text>
                                                </View>
                                            </TouchableOpacity>
                                        </View>

                                        {/* Affected Users Preview */}
                                        {loadingAffectedUsers ? (
                                            <View style={styles.affectedUsersLoading}>
                                                <ActivityIndicator size="small" color="#3B82F6" />
                                                <Text style={styles.affectedUsersLoadingText}>Loading user data...</Text>
                                            </View>
                                        ) : affectedUsers && (
                                            <View style={styles.affectedUsersPreview}>
                                                <View style={styles.affectedUsersSummary}>
                                                    <View style={styles.affectedUserBox}>
                                                        <View style={[styles.affectedUserIcon, { backgroundColor: impactExisting ? '#FEE2E2' : '#D1FAE5' }]}>
                                                            <MaterialIcons
                                                                name={impactExisting ? 'warning' : 'check-circle'}
                                                                size={20}
                                                                color={impactExisting ? '#DC2626' : '#10B981'}
                                                            />
                                                        </View>
                                                        <View style={styles.affectedUserInfo}>
                                                            <Text style={styles.affectedUserCount}>
                                                                {impactExisting ? selectedImpactedUsers.size : 0}
                                                            </Text>
                                                            <Text style={styles.affectedUserLabel}>
                                                                {impactExisting ? 'Impacted' : 'Safe'}
                                                            </Text>
                                                        </View>
                                                    </View>
                                                    <View style={styles.affectedUserBox}>
                                                        <View style={[styles.affectedUserIcon, { backgroundColor: '#FEF3C7' }]}>
                                                            <MaterialIcons name="schedule" size={20} color="#D97706" />
                                                        </View>
                                                        <View style={styles.affectedUserInfo}>
                                                            <Text style={styles.affectedUserCount}>
                                                                {affectedUsers.summary?.in_progress_count || 0}
                                                            </Text>
                                                            <Text style={styles.affectedUserLabel}>In Progress</Text>
                                                        </View>
                                                    </View>
                                                </View>
                                                <TouchableOpacity
                                                    style={styles.viewAllUsersBtn}
                                                    onPress={() => setShowAffectedUsersModal(true)}
                                                >
                                                    <MaterialIcons name="edit" size={16} color="#3B82F6" />
                                                    <Text style={styles.viewAllUsersBtnText}>
                                                        Select Users ({affectedUsers.summary?.total_users || 0})
                                                    </Text>
                                                    <MaterialIcons name="chevron-right" size={18} color="#3B82F6" />
                                                </TouchableOpacity>
                                            </View>
                                        )}
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

            {/* AFFECTED USERS MODAL - for selecting users to impact */}
            <ImpactUserPickerModal
                visible={showAffectedUsersModal}
                onClose={() => setShowAffectedUsersModal(false)}
                completedUsers={affectedUsers?.completed_users || []}
                inProgressUsers={affectedUsers?.in_progress_users || []}
                preSelectedEmails={selectedImpactedUsers}
                onSave={(emailsSet) => setSelectedImpactedUsers(emailsSet)}
            />

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

            {/* CURRICULUM HIERARCHY MODAL */}
            <CurriculumHierarchyModal
                visible={curriculumHierarchyVisible}
                onClose={() => setCurriculumHierarchyVisible(false)}
            />

            {/* DATA ACCESS CONTROL MODAL */}
            <DataAccessControlModal
                visible={dataAccessControlVisible}
                onClose={() => setDataAccessControlVisible(false)}
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
                onClose={() => {
                    setScheduleExamVisible(false);
                    setEditingExam(null);
                }}
                userProfile={userProfile}
                editingExam={editingExam}
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
                    setEditingExam(null);
                    setTimeout(() => setScheduleExamVisible(true), 500);
                }}
                onEditExam={(exam) => {
                    console.log('[ManagerDashboard] Editing exam:', exam);
                    setScheduledExamsListVisible(false);
                    setEditingExam(exam);
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
        backgroundColor: Platform.OS === 'web' ? '#F3F4F6' : '#F9FAFB',
    },
    // HEADER
    headerBg: {
        height: Platform.OS === 'web' ? 320 : 280,
        paddingHorizontal: Platform.OS === 'web' ? 24 : 20,
        paddingTop: Platform.OS === 'web' ? 30 : 20,
        borderBottomLeftRadius: Platform.OS === 'web' ? 40 : 30,
        borderBottomRightRadius: Platform.OS === 'web' ? 40 : 30,
        ...(Platform.OS === 'web' ? {
            shadowColor: '#4F46E5',
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.2,
            shadowRadius: 20,
        } : {})
    },
    headerContent: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginTop: 20,
        ...(Platform.OS === 'web' ? {
            maxWidth: 1200,
            alignSelf: 'center',
            width: '100%',
        } : {})
    },
    backBtn: {
        padding: Platform.OS === 'web' ? 12 : 10,
        backgroundColor: Platform.OS === 'web' ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.2)',
        borderRadius: Platform.OS === 'web' ? 14 : 12,
        marginRight: Platform.OS === 'web' ? 16 : 10,
        ...(Platform.OS === 'web' ? { borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' } : {})
    },
    welcomeText: {
        color: Platform.OS === 'web' ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.8)',
        fontSize: Platform.OS === 'web' ? 16 : 14,
        fontFamily: 'Poppins_400Regular',
        ...(Platform.OS === 'web' ? { letterSpacing: 0.5 } : {})
    },
    nameText: {
        color: '#FFF',
        fontSize: Platform.OS === 'web' ? 28 : 22,
        fontFamily: 'Poppins_700Bold',
        marginBottom: 8,
        ...(Platform.OS === 'web' ? {
            textShadowColor: 'rgba(0,0,0,0.1)',
            textShadowOffset: { width: 0, height: 2 },
            textShadowRadius: 4,
        } : {})
    },
    roleBadge: {
        backgroundColor: 'rgba(255,255,255,0.2)',
        paddingHorizontal: Platform.OS === 'web' ? 14 : 12,
        paddingVertical: Platform.OS === 'web' ? 6 : 4,
        borderRadius: Platform.OS === 'web' ? 30 : 20,
        alignSelf: 'flex-start',
        ...(Platform.OS === 'web' ? { borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' } : {})
    },
    roleText: {
        color: '#FFF',
        fontSize: Platform.OS === 'web' ? 13 : 12,
        fontFamily: 'Poppins_600SemiBold',
    },
    logo: {
        width: Platform.OS === 'web' ? 64 : 60,
        height: Platform.OS === 'web' ? 64 : 60,
        tintColor: '#FFF',
        opacity: Platform.OS === 'web' ? 0.8 : 0.5,
    },

    // BODY & LAYOUT
    bodyContainer: {
        flex: 1,
        marginTop: Platform.OS === 'web' ? -90 : -80,
        paddingHorizontal: Platform.OS === 'web' ? 40 : 20,
        ...(Platform.OS === 'web' ? {
            alignSelf: 'center',
            width: '100%',
            maxWidth: 1200,
        } : {})
    },
    sectionTitle: {
        fontSize: Platform.OS === 'web' ? 20 : 18,
        fontFamily: 'Poppins_700Bold', // changed from 600SemiBold for web, kept generic override but maybe should revert for mobile? -> Wait, original was 600SemiBold.
        // Let's use 600SemiBold for mobile if original was that.
        // Re-checking original: fontFamily: 'Poppins_600SemiBold'
        // So for mobile: Poppins_600SemiBold. For Web: Poppins_700Bold.
        // Actually, let's keep it safe.
        fontFamily: Platform.OS === 'web' ? 'Poppins_700Bold' : 'Poppins_600SemiBold',
        color: Platform.OS === 'web' ? '#1F2937' : '#111827',
        marginBottom: Platform.OS === 'web' ? 20 : 15,
        marginTop: Platform.OS === 'web' ? 32 : 25,
        ...(Platform.OS === 'web' ? { letterSpacing: -0.5 } : {})
    },

    // STATS CARDS
    statsGrid: {
        flexDirection: Platform.OS === 'web' ? 'row' : 'column',
        gap: Platform.OS === 'web' ? 20 : 15,
        flexWrap: 'wrap',
    },
    statCard: {
        backgroundColor: '#FFF',
        borderRadius: Platform.OS === 'web' ? 24 : 16,
        padding: Platform.OS === 'web' ? 20 : 16,
        flexDirection: 'row',
        alignItems: 'center',
        shadowColor: Platform.OS === 'web' ? '#64748B' : '#000',
        shadowOffset: Platform.OS === 'web' ? { width: 0, height: 8 } : { width: 0, height: 4 },
        shadowOpacity: Platform.OS === 'web' ? 0.08 : 0.05,
        shadowRadius: Platform.OS === 'web' ? 24 : 10,
        elevation: Platform.OS === 'web' ? 4 : 3,
        marginBottom: Platform.OS === 'web' ? 0 : 10,
        ...(Platform.OS === 'web' ? {
            flex: 1,
            minWidth: 260,
            borderWidth: 1,
            borderColor: '#F1F5F9',
        } : {})
    },
    statCardAlert: {
        borderLeftWidth: Platform.OS === 'web' ? 6 : 4,
        borderLeftColor: '#EF4444',
    },
    statIconBg: {
        width: Platform.OS === 'web' ? 56 : 48,
        height: Platform.OS === 'web' ? 56 : 48,
        borderRadius: Platform.OS === 'web' ? 18 : 12,
        backgroundColor: Platform.OS === 'web' ? '#F8FAFC' : '#1F2937',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: Platform.OS === 'web' ? 16 : 15,
    },
    statLabel: {
        fontSize: Platform.OS === 'web' ? 13 : 12,
        color: Platform.OS === 'web' ? '#64748B' : '#6B7280',
        fontFamily: 'Poppins_500Medium',
        ...(Platform.OS === 'web' ? { marginBottom: 2 } : {})
    },
    statValue: {
        fontSize: Platform.OS === 'web' ? 22 : 20,
        color: Platform.OS === 'web' ? '#0F172A' : '#111827',
        fontFamily: 'Poppins_700Bold',
        ...(Platform.OS === 'web' ? { letterSpacing: -0.5 } : {})
    },

    // TREND BADGE
    trendBadge: {
        marginLeft: 'auto',
        paddingHorizontal: Platform.OS === 'web' ? 10 : 8,
        paddingVertical: Platform.OS === 'web' ? 6 : 4,
        borderRadius: Platform.OS === 'web' ? 12 : 8,
    },
    trendText: {
        fontSize: 12,
        fontFamily: 'Poppins_700Bold',
    },

    // AI CARD
    aiCard: {
        marginTop: Platform.OS === 'web' ? 0 : 25, // Web handles this via margin on section title maybe? No, let's keep consistent top spacing logic or revert. Original had marginTop 25.
        // My previous edit for web removed marginTop? No, looking at diff, I didn't see marginTop.
        // If I keep 25 for mobile, I should check what web needs. Let's stick closer to original logic but adjusted sizing.
        // Actually, let's keep marginTop 25 for mobile.
        marginTop: Platform.OS === 'web' ? 0 : 25,
        borderRadius: Platform.OS === 'web' ? 28 : 20,
        overflow: 'hidden',
        shadowColor: '#7C3AED',
        shadowOffset: Platform.OS === 'web' ? { width: 0, height: 12 } : { width: 0, height: 8 },
        shadowOpacity: Platform.OS === 'web' ? 0.25 : 0.3,
        shadowRadius: Platform.OS === 'web' ? 30 : 15,
        elevation: Platform.OS === 'web' ? 12 : 8,
        marginBottom: 10,
    },
    aiGradient: {
        padding: Platform.OS === 'web' ? 28 : 20,
    },
    aiHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: Platform.OS === 'web' ? 12 : 10,
    },
    aiTitle: {
        color: Platform.OS === 'web' ? '#FDE68A' : '#FBBF24',
        fontFamily: 'Poppins_700Bold',
        fontSize: Platform.OS === 'web' ? 18 : 16,
        marginLeft: Platform.OS === 'web' ? 10 : 8,
    },
    aiText: {
        color: Platform.OS === 'web' ? '#F9FAFB' : '#FFF',
        fontFamily: 'Poppins_400Regular',
        fontSize: Platform.OS === 'web' ? 15 : 14,
        lineHeight: Platform.OS === 'web' ? 24 : 22,
        marginBottom: Platform.OS === 'web' ? 24 : 15,
        ...(Platform.OS === 'web' ? { opacity: 0.95 } : {})
    },
    aiBtn: {
        backgroundColor: Platform.OS === 'web' ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.2)',
        paddingVertical: Platform.OS === 'web' ? 12 : 10,
        ...(Platform.OS === 'web' ? { paddingHorizontal: 24 } : {}),
        alignItems: 'center',
        borderRadius: Platform.OS === 'web' ? 16 : 12,
        ...(Platform.OS === 'web' ? { alignSelf: 'flex-start', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' } : {})
    },
    aiBtnText: {
        color: '#FFF',
        fontFamily: 'Poppins_600SemiBold',
        ...(Platform.OS === 'web' ? { fontSize: 14 } : {})
    },

    // ACTIVITY FEED
    feedSection: {
        marginBottom: 10,
    },
    feedItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        padding: Platform.OS === 'web' ? 16 : 15,
        borderRadius: Platform.OS === 'web' ? 20 : 12,
        marginBottom: Platform.OS === 'web' ? 12 : 10,
        borderWidth: 1,
        borderColor: Platform.OS === 'web' ? '#F3F4F6' : '#E5E7EB',
        ...(Platform.OS === 'web' ? {
            shadowColor: '#64748B',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.03,
            shadowRadius: 10,
        } : {})
    },
    feedIcon: {
        width: Platform.OS === 'web' ? 44 : 40,
        height: Platform.OS === 'web' ? 44 : 40,
        borderRadius: Platform.OS === 'web' ? 14 : 20,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: Platform.OS === 'web' ? 16 : 15,
    },
    feedTitle: {
        color: Platform.OS === 'web' ? '#1F2937' : '#374151',
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        ...(Platform.OS === 'web' ? { marginBottom: 2 } : {})
    },
    feedTime: {
        color: '#9CA3AF',
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
    },

    // ACTION GRID
    actionGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        ...(Platform.OS === 'web' ? { gap: 16, marginTop: 10 } : { justifyContent: 'space-between', rowGap: 20 }),
    },
    actionBtn: {
        width: Platform.OS === 'web' ? '18%' : '30%',
        ...(Platform.OS === 'web' ? { minWidth: 140, aspectRatio: 1 } : {}),
        alignItems: 'center',
        justifyContent: Platform.OS === 'web' ? 'center' : 'flex-start',
        // marginBottom removed here as rowGap is used in container for mobile
        ...(Platform.OS === 'web' ? {
            marginBottom: 20,
            backgroundColor: '#FFF',
            borderRadius: 24,
            padding: 16,
            shadowColor: '#64748B',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.05,
            shadowRadius: 16,
            elevation: 2,
            borderWidth: 1,
            borderColor: '#F8FAFC',
            cursor: 'pointer',
        } : {})
    },
    actionIcon: {
        width: Platform.OS === 'web' ? 56 : 48,
        height: Platform.OS === 'web' ? 56 : 48,
        borderRadius: Platform.OS === 'web' ? 20 : 16,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: Platform.OS === 'web' ? 12 : 8,
    },
    actionText: {
        color: '#4B5563',
        fontFamily: 'Poppins_600SemiBold',
        fontSize: Platform.OS === 'web' ? 12 : 11,
        textAlign: 'center',
        ...(Platform.OS === 'web' ? { lineHeight: 16 } : {})
    },

    // MODAL STYLES
    modalOverlay: {
        flex: 1,
        backgroundColor: Platform.OS === 'web' ? 'rgba(15, 23, 42, 0.65)' : 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        padding: Platform.OS === 'web' ? 40 : 20,
        ...(Platform.OS === 'web' ? { alignItems: 'center' } : {})
    },
    modalContent: {
        backgroundColor: '#FFF',
        borderRadius: Platform.OS === 'web' ? 32 : 20,
        padding: Platform.OS === 'web' ? 32 : 24,
        shadowColor: '#000',
        shadowOffset: Platform.OS === 'web' ? { width: 0, height: 20 } : { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: Platform.OS === 'web' ? 40 : 20,
        elevation: Platform.OS === 'web' ? 20 : 10,
        ...(Platform.OS === 'web' ? { width: '100%', maxWidth: 600 } : {})
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Platform.OS === 'web' ? 28 : 20
    },
    modalTitle: {
        fontSize: Platform.OS === 'web' ? 24 : 20,
        fontFamily: 'Poppins_700Bold',
        color: Platform.OS === 'web' ? '#0F172A' : '#111827',
        ...(Platform.OS === 'web' ? { letterSpacing: -0.5 } : {})
    },
    inputLabel: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#374151',
        marginBottom: Platform.OS === 'web' ? 8 : 6,
        marginTop: Platform.OS === 'web' ? 16 : 10,
        ...(Platform.OS === 'web' ? { marginLeft: 4 } : {})
    },
    input: {
        borderWidth: 1,
        borderColor: Platform.OS === 'web' ? '#E2E8F0' : '#E5E7EB',
        borderRadius: Platform.OS === 'web' ? 16 : 12,
        padding: Platform.OS === 'web' ? 16 : 12,
        fontSize: Platform.OS === 'web' ? 15 : 16,
        fontFamily: 'Poppins_400Regular',
        ...(Platform.OS === 'web' ? { backgroundColor: '#F8FAFC', color: '#1E293B' } : {})
    },
    uploadBtn: {
        backgroundColor: Platform.OS === 'web' ? '#4F46E5' : '#F59E0B',
        paddingVertical: Platform.OS === 'web' ? 18 : 16,
        borderRadius: Platform.OS === 'web' ? 20 : 14,
        alignItems: 'center',
        marginTop: Platform.OS === 'web' ? 32 : 30,
        ...(Platform.OS === 'web' ? {
            shadowColor: '#4F46E5',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.3,
            shadowRadius: 20,
            elevation: 6,
        } : {})
    },
    disabledBtn: {
        opacity: Platform.OS === 'web' ? 0.6 : 0.7,
        backgroundColor: Platform.OS === 'web' ? '#94A3B8' : '#D1D5DB',
        ...(Platform.OS === 'web' ? { shadowOpacity: 0 } : {})
    },
    uploadBtnText: {
        color: '#FFF',
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
        ...(Platform.OS === 'web' ? { letterSpacing: 0.5 } : {})
    },

    // FILE PICKER
    fileBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: Platform.OS === 'web' ? 16 : 12,
        backgroundColor: Platform.OS === 'web' ? '#F8FAFC' : '#F3F4F6',
        borderRadius: Platform.OS === 'web' ? 16 : 12,
        borderWidth: Platform.OS === 'web' ? 2 : 1,
        borderColor: Platform.OS === 'web' ? '#E2E8F0' : '#E5E7EB',
        borderStyle: 'dashed',
        ...(Platform.OS === 'web' ? { justifyContent: 'center' } : {})
    },
    fileBtnText: {
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        color: Platform.OS === 'web' ? '#64748B' : '#6B7280',
        marginLeft: Platform.OS === 'web' ? 12 : 10
    },
    toggleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: Platform.OS === 'web' ? 20 : 15,
        marginBottom: Platform.OS === 'web' ? 8 : 5,
        ...(Platform.OS === 'web' ? { padding: 4 } : {})
    },
    checkbox: {
        width: Platform.OS === 'web' ? 24 : 20,
        height: Platform.OS === 'web' ? 24 : 20,
        borderRadius: Platform.OS === 'web' ? 8 : 4,
        borderWidth: 2,
        borderColor: Platform.OS === 'web' ? '#94A3B8' : '#9CA3AF',
        marginRight: Platform.OS === 'web' ? 12 : 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    checkboxActive: {
        backgroundColor: '#F59E0B',
        borderColor: '#F59E0B',
    },
    toggleLabel: { fontSize: Platform.OS === 'web' ? 15 : 14, fontFamily: 'Poppins_500Medium', color: '#374151' },

    // PATH MANAGE STYLES
    sectionHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: Platform.OS === 'web' ? 30 : 20,
        marginBottom: Platform.OS === 'web' ? 16 : 10,
        ...(Platform.OS === 'web' ? {} : { marginHorizontal: 20 })
    },
    pathListScroll: {
        marginBottom: Platform.OS === 'web' ? 40 : 30,
        overflow: 'visible',
        ...(Platform.OS === 'web' ? {} : { paddingLeft: 20 })
    },
    pathNodeCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        padding: 16,
        borderRadius: Platform.OS === 'web' ? 20 : 12,
        marginRight: Platform.OS === 'web' ? 16 : 12,
        width: Platform.OS === 'web' ? 260 : 220,
        borderWidth: 1,
        borderColor: Platform.OS === 'web' ? '#F1F5F9' : '#E5E7EB',
        shadowColor: Platform.OS === 'web' ? '#64748B' : '#000',
        shadowOffset: Platform.OS === 'web' ? { width: 0, height: 8 } : { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 16,
    },
    pathNodeIcon: {
        width: Platform.OS === 'web' ? 48 : 40,
        height: Platform.OS === 'web' ? 48 : 40,
        borderRadius: Platform.OS === 'web' ? 16 : 20,
        backgroundColor: Platform.OS === 'web' ? '#FFF7ED' : '#F59E0B',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: Platform.OS === 'web' ? 16 : 10
    },
    pathNodeInfo: { flex: 1 },
    pathNodeTitle: {
        fontSize: Platform.OS === 'web' ? 15 : 14,
        fontFamily: 'Poppins_600SemiBold',
        color: Platform.OS === 'web' ? '#1E293B' : '#111827',
        marginBottom: Platform.OS === 'web' ? 2 : 0
    },
    pathNodeSub: {
        fontSize: Platform.OS === 'web' ? 12 : 11,
        fontFamily: Platform.OS === 'web' ? 'Poppins_500Medium' : 'Poppins_400Regular',
        color: Platform.OS === 'web' ? '#94A3B8' : '#6B7280'
    },
    emptyPathText: {
        marginLeft: 20, // Keep this?
        color: '#9CA3AF',
        fontStyle: 'italic',
        fontSize: 14
    },

    // FILE PICKER UPDATE
    filePickBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        marginBottom: 20,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#D1D5DB',
        borderStyle: 'dashed',
        backgroundColor: '#F9FAFB',
    },
    filePickBtnActive: {
        backgroundColor: '#10B981',
        borderColor: '#10B981',
        borderStyle: 'solid',
    },
    filePickText: {
        marginLeft: 10,
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#6B7280',
    },

    // MODE SECTION STYLES
    modeSection: {
        backgroundColor: '#FFF',
        borderRadius: 20,
        padding: 20,
        marginHorizontal: 20,
        marginTop: -10,
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 4,
    },

    // IMPACT SETTINGS STYLES
    impactSettingContainer: {
        backgroundColor: '#F0F9FF',
        borderRadius: 12,
        padding: 16,
        marginTop: 16,
        borderWidth: 1,
        borderColor: '#BFDBFE',
    },
    impactSettingHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
    },
    impactSettingTitle: {
        fontSize: 15,
        fontFamily: 'Poppins_700Bold',
        color: '#1E40AF',
    },
    impactSettingDesc: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
        marginBottom: 12,
        lineHeight: 18,
    },
    impactButtons: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 8,
    },
    impactButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: 12,
        borderRadius: 10,
        backgroundColor: '#FFF',
        borderWidth: 2,
        borderColor: '#D1D5DB',
    },
    impactButtonActive: {
        backgroundColor: '#3B82F6',
        borderColor: '#3B82F6',
    },
    impactButtonActiveGreen: {
        backgroundColor: '#10B981',
        borderColor: '#10B981',
    },
    impactButtonTextContainer: {
        flex: 1,
    },
    impactButtonTitle: {
        fontSize: 14,
        fontFamily: 'Poppins_700Bold',
        color: '#374151',
    },
    impactButtonTitleActive: {
        color: '#FFF',
    },
    impactButtonSubtitle: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        color: '#9CA3AF',
        marginTop: 2,
    },
    impactButtonSubtitleActive: {
        color: 'rgba(255,255,255,0.8)',
    },

    // AFFECTED USERS PREVIEW STYLES
    affectedUsersLoading: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        paddingVertical: 16,
    },
    affectedUsersLoadingText: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
    },
    affectedUsersPreview: {
        marginTop: 16,
        backgroundColor: '#FFF',
        borderRadius: 10,
        padding: 14,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    affectedUsersSummary: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 12,
    },
    affectedUserBox: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: '#F9FAFB',
        padding: 12,
        borderRadius: 8,
    },
    affectedUserIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    affectedUserInfo: {
        flex: 1,
    },
    affectedUserCount: {
        fontSize: 20,
        fontFamily: 'Poppins_700Bold',
        color: '#111827',
    },
    affectedUserLabel: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
        color: '#374151',
    },
    viewAllUsersBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 10,
        backgroundColor: '#EFF6FF',
        borderRadius: 8,
    },
    viewAllUsersBtnText: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
        color: '#3B82F6',
    },

    // AFFECTED USERS MODAL STYLES
    affectedUsersModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    affectedUsersModalContent: {
        width: '100%',
        maxWidth: 600,
        maxHeight: '85%',
        backgroundColor: '#FFF',
        borderRadius: 16,
        overflow: 'hidden',
    },
    affectedUsersModalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    affectedUsersModalTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    affectedUsersModalTitle: {
        fontSize: 18,
        fontFamily: 'Poppins_700Bold',
        color: '#111827',
    },
    impactModeIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginHorizontal: 20,
        marginTop: 16,
        padding: 12,
        borderRadius: 8,
    },
    impactModeOn: {
        backgroundColor: '#FEF2F2',
    },
    impactModeOff: {
        backgroundColor: '#ECFDF5',
    },
    impactModeText: {
        flex: 1,
        fontSize: 13,
        fontFamily: 'Poppins_500Medium',
    },
    impactModeTextOn: {
        color: '#991B1B',
    },
    impactModeTextOff: {
        color: '#065F46',
    },
    selectAllContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 12,
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 4,
    },
    selectAllBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#EFF6FF',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
    },
    selectAllBtnText: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
        color: '#3B82F6',
    },
    selectNoneBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#F3F4F6',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
    },
    selectNoneBtnText: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
        color: '#6B7280',
    },
    affectedUsersScrollView: {
        flex: 1,
        padding: 20,
    },
    affectedUsersSection: {
        marginBottom: 24,
    },
    affectedUsersSectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 12,
    },
    sectionIconBadge: {
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    affectedUsersSectionTitle: {
        fontSize: 15,
        fontFamily: 'Poppins_700Bold',
        color: '#111827',
    },
    affectedUsersSectionSubtitle: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
        marginTop: 2,
    },
    affectedUserItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: '#F9FAFB',
        padding: 12,
        borderRadius: 10,
        marginBottom: 8,
    },
    affectedUserAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#3B82F6',
        justifyContent: 'center',
        alignItems: 'center',
    },
    affectedUserAvatarText: {
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
    },
    affectedUserDetails: {
        flex: 1,
    },
    affectedUserName: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#111827',
    },
    affectedUserMeta: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
        marginTop: 2,
    },
    affectedUserBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    affectedUserBadgeText: {
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
    },
    progressBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        backgroundColor: '#FEF3C7',
    },
    progressBadgeText: {
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
        color: '#D97706',
    },
    emptyAffectedUsers: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 40,
    },
    emptyAffectedUsersText: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        color: '#9CA3AF',
        marginTop: 12,
        textAlign: 'center',
    },
    affectedUsersModalFooter: {
        padding: 16,
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
        alignItems: 'center',
    },
    affectedUsersCloseBtn: {
        backgroundColor: '#3B82F6',
        paddingVertical: 12,
        paddingHorizontal: 32,
        borderRadius: 8,
    },
    affectedUsersCloseBtnText: {
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
    },
});
