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
import API_URL from '../config';

const { width, height } = Dimensions.get('window');
// const API_URL = "http://192.168.0.136:8000"; // Updated for physical device using local IP

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
    const { userProfile } = route.params || {};
    const role = userProfile?.role || "Manager";
    const name = userProfile?.name || "User";
    const data = getDashboardData(role);

    // --- RESOURCE UPLOAD STATE ---
    const [uploadVisible, setUploadVisible] = useState(false);
    const [resTitle, setResTitle] = useState('');
    const [resDesc, setResDesc] = useState('');
    const [resCategory, setResCategory] = useState(null);
    const [resFile, setResFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [isPathNode, setIsPathNode] = useState(false); // RESTORED
    const [bulkModalVisible, setBulkModalVisible] = useState(false); // [NEW]

    // Categories
    const [categories, setCategories] = useState([]);
    const [loadingCats, setLoadingCats] = useState(false);
    const [newCatMode, setNewCatMode] = useState(false);
    const [newCatName, setNewCatName] = useState('');

    useEffect(() => {
        if (uploadVisible) fetchCategories();
    }, [uploadVisible]);

    const fetchCategories = async () => {
        setLoadingCats(true);
        try {
            const res = await fetch(`${API_URL}/resources/categories`);
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

            const res = await fetch(`${API_URL}/resources/category`, {
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
        if (!resTitle || !resFile || !resCategory) {
            Alert.alert("Missing Fields", "Please provide title, category, and file.");
            return;
        }

        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('title', resTitle);
            formData.append('category', resCategory);
            formData.append('description', resDesc);
            formData.append('isPathNode', String(isPathNode)); // RESTORED
            formData.append('file', {
                uri: resFile.uri,
                name: resFile.name,
                type: resFile.mimeType || 'application/octet-stream'
            });

            // Use the NEW universal resource upload endpoint
            // It will handle adding to Knowledge Base AND optionally to Learning Path
            const response = await fetch(`${API_URL}/resources/upload`, {
                method: 'POST',
                headers: { 'Content-Type': 'multipart/form-data' },
                body: formData
            });

            const result = await response.json();
            if (result.status === 'success') {
                Alert.alert("Success", "Resource uploaded to Knowledge Base!");
                if (isPathNode) Alert.alert("Note", "Also added to Learning Path.");
                setUploadVisible(false);
                setResTitle('');
                setResDesc('');
                setResFile(null);
                setIsPathNode(false);
            } else {
                Alert.alert("Error", "Upload failed.");
            }
        } catch (error) {
            Alert.alert("Error", "Network error.");
        } finally {
            setUploading(false);
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
                const res = await fetch(`${API_URL}/path/nodes`);
                const data = await res.json();
                setPathNodes(data);
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
            const response = await fetch(`${API_URL}/quiz/create`, {
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
            const response = await fetch(`${API_URL}/quiz/list`);
            const quizzes = await response.json();
            setCreatedQuizzes(quizzes);
        } catch (error) {
            console.error("Error fetching quizzes:", error);
        }
    };

    const viewResults = async (quizId) => {
        try {
            const response = await fetch(`${API_URL}/quiz/${quizId}/results`);
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
            await fetch(`${API_URL}/notify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: "New Quiz Assigned!",
                    message: `Manager ${name} assigned '${role === 'Store Manager' ? 'Espresso Calibration' : 'Safety Drill'}' quiz.`,
                    type: "quiz"
                })
            });
            Alert.alert("Assigned", "Quiz notification sent to all staff!");
        } catch (e) {
            Alert.alert("Error", "Could not send notification.");
        }
    };

    // --- ADVANCED HANDLERS [NEW] ---
    const openEditNode = (node) => {
        setSelectedNode(node);
        setEditModalVisible(true);
    };

    const handleUpdateNode = async (id, updatedData) => {
        try {
            const response = await fetch(`${API_URL}/content/${id}`, {
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
            const response = await fetch(`${API_URL}/content/${id}`, {
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
            const response = await fetch(`${API_URL}/ai/generate_quiz`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transcript })
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
            const response = await fetch(`${API_URL}/notifications/send`, {
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
                        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
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

                    {/* STATS GRID */}
                    <Text style={styles.sectionTitle}>Key Performance Indicators</Text>
                    <View style={styles.statsGrid}>
                        {data.stats.map((item, index) => (
                            <StatCard key={index} item={item} index={index} />
                        ))}
                    </View>

                    {/* AI INSIGHT */}
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
                        <TouchableOpacity style={styles.actionBtn}>
                            <View style={[styles.actionIcon, { backgroundColor: '#E0F2FE' }]}>
                                <Feather name="users" size={24} color="#0284C7" />
                            </View>
                            <Text style={styles.actionText}>Team List</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.actionBtn}>
                            <View style={[styles.actionIcon, { backgroundColor: '#FCE7F3' }]}>
                                <Feather name="bar-chart-2" size={24} color="#DB2777" />
                            </View>
                            <Text style={styles.actionText}>Reports</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.actionBtn} onPress={() => setQuizModalVisible(true)}>
                            <View style={[styles.actionIcon, { backgroundColor: '#FEF3C7' }]}>
                                <MaterialCommunityIcons name="clipboard-check" size={24} color="#F59E0B" />
                            </View>
                            <Text style={styles.actionText}>Assign Quiz</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.actionBtn}>
                            <View style={[styles.actionIcon, { backgroundColor: '#DCFCE7' }]}>
                                <Feather name="check-square" size={24} color="#16A34A" />
                            </View>
                            <Text style={styles.actionText}>Audits</Text>
                        </TouchableOpacity>

                        {/* REPLACED SETTINGS WITH UPLOAD (For Demo) */}
                        <TouchableOpacity style={styles.actionBtn} onPress={() => setUploadVisible(true)}>
                            <View style={[styles.actionIcon, { backgroundColor: '#F3E8FF' }]}>
                                <Feather name="upload-cloud" size={24} color="#7C3AED" />
                            </View>
                            <Text style={styles.actionText}>Upload Training</Text>
                        </TouchableOpacity>

                        {/* BULK UPLOAD BUTTON [NEW] */}
                        <TouchableOpacity style={styles.actionBtn} onPress={() => setBulkModalVisible(true)}>
                            <View style={[styles.actionIcon, { backgroundColor: '#FEF3C7' }]}>
                                <MaterialCommunityIcons name="layers-plus" size={24} color="#D97706" />
                            </View>
                            <Text style={styles.actionText}>Bulk Upload</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('CreateUser')}>
                            <View style={[styles.actionIcon, { backgroundColor: '#ECFEFF' }]}>
                                <Feather name="user-plus" size={24} color="#0891B2" />
                            </View>
                            <Text style={styles.actionText}>Create User</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.actionBtn}
                            onPress={() => navigation.navigate('ProctoredAssessment', { userProfile })}
                        >
                            <View style={[styles.actionIcon, { backgroundColor: '#FFF7ED' }]}>
                                <Feather name="shield" size={24} color="#EA580C" />
                            </View>
                            <Text style={styles.actionText}>Proctored Assessment</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.actionBtn}
                            onPress={() => navigation.navigate('Analytics', { userProfile })}
                        >
                            <View style={[styles.actionIcon, { backgroundColor: '#FFF7ED' }]}>
                                <Feather name="bar-chart" size={24} color="#EA580C" />
                            </View>
                            <Text style={styles.actionText}>View Analytics</Text>
                        </TouchableOpacity>

                        {/* NEW NOTIFICATION BUTTON */}
                        <TouchableOpacity
                            style={styles.actionBtn}
                            onPress={() => setNotifModalVisible(true)}
                        >
                            <View style={[styles.actionIcon, { backgroundColor: '#FEE2E2' }]}>
                                <Feather name="bell" size={24} color="#EF4444" />
                            </View>
                            <Text style={styles.actionText}>Send Notif</Text>
                        </TouchableOpacity>
                    </View>

                    {/* --- [NEW] MANAGE LEARNING PATH SECTION --- */}
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

                </ScrollView >

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

                                <Text style={styles.inputLabel}>Category</Text>
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

                                <TouchableOpacity
                                    style={[styles.uploadBtn, { marginTop: 10 }, uploading && styles.disabledBtn]}
                                    onPress={handleUploadResource}
                                    disabled={uploading}
                                >
                                    {uploading ? <ActivityIndicator color="#FFF" /> : (
                                        <>
                                            <Feather name="upload" size={18} color="#FFF" style={{ marginRight: 8 }} />
                                            <Text style={styles.uploadBtnText}>Upload & Publish</Text>
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
            </View>
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
