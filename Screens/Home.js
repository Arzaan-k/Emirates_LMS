// Screens/Home.js
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TextInput,
  TouchableOpacity,
  Dimensions,
  Platform,
  ImageBackground,
  Modal,
} from "react-native";
import { Video, ResizeMode } from 'expo-av'; // IMPORTED
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { BlurView } from "expo-blur";
import { Feather, Octicons, Ionicons, MaterialIcons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown, FadeInRight } from "react-native-reanimated";

// Import Screens
import Courses from "./Courses";
import Resources from "./Resources";
import Profile from "./Profile";

// Import AI Components
import AIRoleplay from "../Components/AIRoleplay";
import AIScanner from "../Components/AIScanner";
import AIFlashcards from "../Components/AIFlashcards";
import AIChatBot from "../Components/AIChatBot";
import AIDigitalTwin from "../Components/AIDigitalTwin";


// --- NEW: VIDEO PLAYER MODAL ---
// --- NEW: VIDEO PLAYER MODAL ---
function VideoPlayerModal({ visible, videoData, onClose }) {
  const [activeTab, setActiveTab] = useState('transcript');
  const [quizIndex, setQuizIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [showResult, setShowResult] = useState(false);

  if (!visible || !videoData) return null;

  const handleAnswer = (optionIndex) => {
    const currentQ = videoData.quiz[quizIndex];
    if (optionIndex === currentQ.correctIndex) {
      setScore(score + 1);
    }

    if (quizIndex < videoData.quiz.length - 1) {
      setQuizIndex(quizIndex + 1);
    } else {
      setShowResult(true);
    }
  };

  const hasQuiz = videoData.quiz && videoData.quiz.length > 0;

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
          style={{ width: '100%', height: 250, marginTop: 40 }}
          useNativeControls
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay
          onError={(e) => console.log("Video Error:", e)}
        />

        {/* INTERACTIVE SECTION */}
        <View style={styles.interactiveContainer}>
          {/* TABS */}
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'transcript' && styles.activeTabBtn]}
              onPress={() => setActiveTab('transcript')}
            >
              <Text style={[styles.tabText, activeTab === 'transcript' && styles.activeTabText]}>Transcript</Text>
            </TouchableOpacity>

            {hasQuiz && (
              <TouchableOpacity
                style={[styles.tabBtn, activeTab === 'quiz' && styles.activeTabBtn]}
                onPress={() => setActiveTab('quiz')}
              >
                <Text style={[styles.tabText, activeTab === 'quiz' && styles.activeTabText]}>AI Quiz</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* CONTENT */}
          <ScrollView style={styles.contentArea}>
            {activeTab === 'transcript' ? (
              <Text style={styles.transcriptText}>
                {videoData.transcript || "No transcript available for this video."}
              </Text>
            ) : (
              <View style={styles.quizContainer}>
                {!showResult ? (
                  <>
                    <View style={styles.quizHeader}>
                      <Text style={styles.quizCount}>Question {quizIndex + 1}/{videoData.quiz.length}</Text>
                      <View style={styles.quizProgress}>
                        <View style={[styles.quizProgressBar, { width: `${((quizIndex + 1) / videoData.quiz.length) * 100}%` }]} />
                      </View>
                    </View>

                    <Text style={styles.questionText}>{videoData.quiz[quizIndex].question}</Text>

                    {videoData.quiz[quizIndex].options.map((option, idx) => (
                      <TouchableOpacity
                        key={idx}
                        style={styles.optionBtn}
                        onPress={() => handleAnswer(idx)}
                      >
                        <View style={styles.optionCircle}>
                          <Text style={styles.optionLetter}>{String.fromCharCode(65 + idx)}</Text>
                        </View>
                        <Text style={styles.optionText}>{option}</Text>
                      </TouchableOpacity>
                    ))}
                  </>
                ) : (
                  <View style={styles.resultContainer}>
                    <Feather name="award" size={60} color="#F59E0B" />
                    <Text style={styles.resultTitle}>Quiz Completed!</Text>
                    <Text style={styles.resultScore}>You scored {score}/{videoData.quiz.length}</Text>
                    <TouchableOpacity style={styles.retryBtn} onPress={() => { setQuizIndex(0); setScore(0); setShowResult(false); }}>
                      <Text style={styles.retryText}>Retake Quiz</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ... (Existing Components)

function LiveFeedSection({ data, onPlay }) {
  if (!data || data.length === 0) return null;

  return (
    <View style={styles.sectionContainer}>
      <View style={[styles.sectionHeader, { paddingHorizontal: 20 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444', marginRight: 8 }} />
          <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Live Updates</Text>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: 20, paddingBottom: 10 }}>
        {data.map((item, index) => (
          <Animated.View key={index} entering={FadeInRight.duration(500)} style={styles.liveCard}>
            <TouchableOpacity
              style={styles.liveCardInner}
              onPress={() => item.videoUrl && onPlay(item)}
            >
              <View style={styles.liveIcon}>
                <Feather name="play-circle" size={24} color="#FFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.liveTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.liveAuthor}>By {item.authorRole}</Text>
              </View>
              <View style={styles.newBadge}>
                <Text style={styles.newBadgeText}>JUST NOW</Text>
              </View>
            </TouchableOpacity>
          </Animated.View>
        ))}
      </ScrollView>
    </View>
  );
}

// ... (NotificationToast Unchanged)

function HomeContent({ onOpenTool, onOpenTwin }) {
  const [liveUpdates, setLiveUpdates] = useState([]);
  const [notification, setNotification] = useState(null);
  const [selectedVideo, setSelectedVideo] = useState(null); // NEW STATE

  useEffect(() => {
    // CONNECT TO WEBSOCKET
    const ws = new WebSocket("ws://192.168.1.35:8000/ws");

    ws.onopen = () => {
      console.log("Connected to Realtime Server");
    };

    ws.onmessage = (e) => {
      try {
        const message = JSON.parse(e.data);
        if (message.type === "NEW_CONTENT") {
          setLiveUpdates(prev => [message.data, ...prev]);
        } else if (message.type === "NOTIFICATION") {
          setNotification(message.data);
          // Hide after 5 seconds
          setTimeout(() => setNotification(null), 5000);
        }
      } catch (err) {
        console.log("WS Error", err);
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* DECORATIVE BG */}
        <View style={styles.decorCircle} />

        <Header />
        <SearchBar />

        {/* LIVE FEED (Dynamic from Python) */}
        <LiveFeedSection
          data={liveUpdates}
          onPlay={(item) => setSelectedVideo(item)}
        />

        {/* TWIN CARD */}
        <DigitalTwinCard onOpen={onOpenTwin} />

        <DailyFocus />
        <AIToolsSection onOpenTool={onOpenTool} />
        <CourseList />
        <NewArrivals />
      </ScrollView>

      {/* ABSOLUTE NOTIFICATION OVERLAY */}
      <View style={styles.overlayContainer} pointerEvents="box-none">
        <NotificationToast visible={!!notification} message={notification} type={notification?.type} />
      </View>

      {/* VIDEO MODAL */}
      <VideoPlayerModal
        visible={!!selectedVideo}
        videoData={selectedVideo}
        onClose={() => setSelectedVideo(null)}
      />
    </View>
  )
}



const Tab = createBottomTabNavigator();
const { width } = Dimensions.get("window");

// Mock Data (Unchanged)
const CATEGORIES = ["All", "Operations", "Hygiene", "Service", "Kitchen"];
const CONTINUE_WATCHING = [
  {
    id: 1,
    title: "Latte Art: The Heart Shape",
    progress: 0.7,
    image: "https://images.unsplash.com/photo-1570539956423-6c84c379a05b?q=80&w=2000&auto=format&fit=crop",
    duration: "4 mins left",
  },
  {
    id: 2,
    title: "Handling Customer Complaints",
    progress: 0.3,
    image: "https://images.unsplash.com/photo-1556742049-0cfed4f7a07d?q=80&w=2000&auto=format&fit=crop",
    duration: "15 mins left",
  },
];
const RECENT_COURSES = [
  {
    id: 3,
    title: "Advanced Waffle Textures",
    author: "Chef Mike",
    rating: 4.9,
    image: "https://images.unsplash.com/photo-1562608420-532c201fac48?q=80&w=2000&auto=format&fit=crop",
  },
  {
    id: 4,
    title: "Inventory Control Basics",
    author: "Ops Team",
    rating: 4.7,
    image: "https://images.unsplash.com/photo-1580674285054-bed31e145f59?q=80&w=2000&auto=format&fit=crop",
  },
];

const AI_TOOLS = [
  { id: 'roleplay', title: 'Customer Sim', desc: 'Practice Empathy', icon: 'chat-processing-outline', color: ['#8B5CF6', '#7C3AED'], accent: '#FFF' },
  { id: 'scanner', title: 'Hygiene Scan', desc: 'AR Inspection', icon: 'camera-iris', color: ['#10B981', '#059669'], accent: '#FFF' },
  { id: 'flashcards', title: 'Wiki Cards', desc: 'Rapid Recall', icon: 'cards-playing-outline', color: ['#F59E0B', '#D97706'], accent: '#FFF' },
];

function Header() {
  const insets = useSafeAreaInsets();
  return (
    <Animated.View entering={FadeInDown.duration(600).springify()} style={[styles.headerContainer, { paddingTop: insets.top + 10 }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.greetingText}>Good Morning,</Text>
        <Text style={styles.nameText}>Aditya</Text>
      </View>

      <View style={styles.headerRight}>
        {/* STREAK */}
        <TouchableOpacity style={styles.streakPill}>
          <MaterialCommunityIcons name="fire" size={20} color="#F59E0B" />
          <Text style={styles.streakText}>5</Text>
        </TouchableOpacity>

        {/* NOTIFICATIONS */}
        <TouchableOpacity style={styles.iconBtn}>
          <Feather name="bell" size={20} color="#111827" />
          <View style={styles.dotBadage} />
        </TouchableOpacity>

        {/* PROFILE */}
        <TouchableOpacity style={styles.profileBtn}>
          <Image
            source={{ uri: "https://ui-avatars.com/api/?name=Aditya+User&background=0F172A&color=fff" }}
            style={styles.profileImage}
          />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

function SearchBar() {
  return (
    <Animated.View entering={FadeInDown.delay(100).duration(600)} style={styles.searchContainer}>
      <Feather name="search" size={20} color="#9CA3AF" style={styles.searchIcon} />
      <TextInput
        placeholder="Find courses, recipes, SOPs..."
        placeholderTextColor="#9CA3AF"
        style={styles.searchInput}
      />
      <View style={styles.micBtn}>
        <Feather name="mic" size={18} color="#4F46E5" />
      </View>
    </Animated.View>
  );
}

// ------ NEW: DIGITAL TWIN HERO CARD ------
function DigitalTwinCard({ onOpen }) {
  return (
    <Animated.View entering={FadeInDown.delay(200).duration(800)} style={styles.twinContainer}>
      <TouchableOpacity style={styles.twinCard} activeOpacity={0.9} onPress={onOpen}>
        <ImageBackground
          source={{ uri: "https://images.unsplash.com/photo-1556910103-1c02745a30bf?q=80&w=2000&auto=format&fit=crop" }}
          style={styles.twinBg}
          imageStyle={{ borderRadius: 24, opacity: 0.6 }}
        >
          <LinearGradient colors={["transparent", "rgba(0,0,0,0.9)"]} style={styles.twinGradient}>
            <View style={styles.twinBadge}>
              <MaterialCommunityIcons name="virtual-reality" size={14} color="#FFF" style={{ marginRight: 4 }} />
              <Text style={styles.twinBadgeText}>DIGITAL TWIN</Text>
            </View>
            <Text style={styles.twinTitle}>Store Simulation</Text>
            <Text style={styles.twinDesc}>Practice Waffle Making & Hygiene in a 2D Virtual Store.</Text>

            <View style={styles.twinBtn}>
              <Text style={styles.twinBtnText}>Enter Simulation</Text>
              <Feather name="arrow-right" size={16} color="#000" />
            </View>
          </LinearGradient>
        </ImageBackground>
      </TouchableOpacity>
    </Animated.View>
  )
}

function DailyFocus() {
  return (
    <Animated.View entering={FadeInDown.delay(300).duration(600)} style={styles.focusContainer}>
      <LinearGradient
        colors={["#1E1B4B", "#312E81"]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.focusCard}
      >
        <MaterialCommunityIcons name="target" size={120} color="rgba(255,255,255,0.05)" style={styles.focusBgIcon} />

        <View style={styles.focusContent}>
          <View>
            <View style={styles.focusBadge}>
              <Text style={styles.focusBadgeText}>TODAY'S GOAL</Text>
            </View>
            <Text style={styles.focusTitle}>Complete Unit 2</Text>
            <Text style={styles.focusSub}>Espresso Mastery</Text>
          </View>
          <View style={styles.ringContainer}>
            <View style={styles.ringOuter}>
              <View style={styles.ringInner}>
                <Text style={styles.ringText}>75%</Text>
              </View>
            </View>
          </View>
        </View>
      </LinearGradient>
    </Animated.View>
  )
}

function AIToolsSection({ onOpenTool }) {
  return (
    <View style={styles.sectionContainer}>
      <Animated.Text entering={FadeInDown.delay(300)} style={[styles.sectionTitle, { paddingHorizontal: 20 }]}>AI Power Suite ⚡</Animated.Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: 20, paddingTop: 10, paddingBottom: 20 }}>
        {AI_TOOLS.map((tool, index) => (
          <Animated.View key={tool.id} entering={FadeInRight.delay(400 + index * 100)}>
            <TouchableOpacity
              style={styles.aiCard}
              onPress={() => onOpenTool(tool.id)}
              activeOpacity={0.9}
            >
              <LinearGradient
                colors={tool.color}
                style={styles.aiCardGradient}
              >
                <MaterialCommunityIcons name={tool.icon} size={32} color="#FFF" />
                <View style={styles.aiCardContent}>
                  <Text style={styles.aiTitle}>{tool.title}</Text>
                  <View style={{ height: 4 }} />
                  <Text style={styles.aiDesc}>{tool.desc}</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        ))}
      </ScrollView>
    </View>
  )
}

function CourseList() {
  return (
    <View style={styles.sectionContainer}>
      <View style={[styles.sectionHeader, { paddingHorizontal: 20 }]}>
        <Text style={styles.sectionTitle}>Jump Back In</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: 20, paddingBottom: 20 }}>
        {CONTINUE_WATCHING.map((item, index) => (
          <Animated.View key={item.id} entering={FadeInRight.delay(600 + index * 100)}>
            <TouchableOpacity style={styles.courseCard}>
              <Image source={{ uri: item.image }} style={styles.courseImg} />
              <BlurView intensity={20} tint="dark" style={styles.playOverlay}>
                <Ionicons name="play-circle" size={40} color="rgba(255,255,255,0.9)" />
              </BlurView>
              <View style={styles.courseMeta}>
                <Text style={styles.courseTitle} numberOfLines={1}>{item.title}</Text>
                <View style={styles.progressRow}>
                  <View style={styles.progressBar}>
                    <View style={[styles.progressFill, { width: `${item.progress * 100}%` }]} />
                  </View>
                  <Text style={styles.durationText}>{item.duration}</Text>
                </View>
              </View>
            </TouchableOpacity>
          </Animated.View>
        ))}
      </ScrollView>
    </View>
  )
}

function NewArrivals() {
  return (
    <View style={[styles.sectionContainer, { marginBottom: 100 }]}>
      <Text style={[styles.sectionTitle, { paddingHorizontal: 20, marginBottom: 15 }]}>Freshly Brewed ☕</Text>
      <View style={{ paddingHorizontal: 20 }}>
        {RECENT_COURSES.map((course, index) => (
          <Animated.View key={course.id} entering={FadeInDown.delay(800 + index * 100)}>
            <TouchableOpacity style={styles.listCard}>
              <Image source={{ uri: course.image }} style={styles.listImg} />
              <View style={styles.listInfo}>
                <View style={styles.tagRow}>
                  <View style={styles.newTag}><Text style={styles.newTagText}>NEW</Text></View>
                  <View style={styles.starRow}>
                    <Ionicons name="star" size={12} color="#F59E0B" />
                    <Text style={styles.ratingVal}>{course.rating}</Text>
                  </View>
                </View>
                <Text style={styles.listTitle}>{course.title}</Text>
                <Text style={styles.listAuthor}>By {course.author}</Text>
              </View>
              <TouchableOpacity style={styles.saveBtn}>
                <Feather name="bookmark" size={20} color="#CBD5E1" />
              </TouchableOpacity>
            </TouchableOpacity>
          </Animated.View>
        ))}
      </View>
    </View>
  )
}


function NotificationToast({ message, type, visible }) {
  if (!visible) return null;
  const isQuiz = type === "quiz";

  return (
    <Animated.View entering={FadeInDown.springify()} style={styles.toastContainer}>
      <BlurView intensity={80} tint="dark" style={styles.toastContent}>
        <View style={[styles.toastIcon, { backgroundColor: isQuiz ? '#F59E0B' : '#3B82F6' }]}>
          <MaterialCommunityIcons name={isQuiz ? "school" : "bell"} size={24} color="#FFF" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.toastTitle}>{message.title || "Notification"}</Text>
          <Text style={styles.toastMsg}>{message.message}</Text>
        </View>
        <TouchableOpacity style={styles.toastBtn}>
          <Text style={styles.toastBtnText}>{isQuiz ? "Start Now" : "View"}</Text>
        </TouchableOpacity>
      </BlurView>
    </Animated.View>
  );
}




// MAIN LAYOUT
export default function Home() {
  const [activeTool, setActiveTool] = useState(null);
  const [showTwin, setShowTwin] = useState(false); // New Twin State

  return (
    <View style={{ flex: 1 }}>
      {/* TWIN OVERLAY */}
      {showTwin && (
        <View style={{ flex: 1, zIndex: 99999, backgroundColor: '#000' }}>
          <AIDigitalTwin onClose={() => setShowTwin(false)} />
        </View>
      )}

      {/* TOOL OVERLAY */}
      {activeTool && !showTwin && (
        <View style={{ flex: 1, zIndex: 9999, backgroundColor: '#FFF' }}>
          {activeTool === 'roleplay' && <AIRoleplay onClose={() => setActiveTool(null)} />}
          {activeTool === 'scanner' && <AIScanner onClose={() => setActiveTool(null)} />}
          {activeTool === 'flashcards' && <AIFlashcards onClose={() => setActiveTool(null)} />}
        </View>
      )}

      {!activeTool && !showTwin && (
        <Tab.Navigator
          screenOptions={({ route }) => ({
            headerShown: false,
            tabBarShowLabel: false,
            tabBarIcon: ({ color, focused }) => {
              let IconComp = Feather;
              let iconName = "home";
              if (route.name === "CoursesTab") iconName = "book-open";
              if (route.name === "ResourcesTab") { IconComp = Ionicons; iconName = "grid-outline"; }
              if (route.name === "ProfileTab") iconName = "user";

              return (
                <View style={[styles.tabIconContainer, focused && styles.activeTabIcon]}>
                  <View style={[styles.iconWrapper, focused && styles.activeIconWrapper]}>
                    <IconComp name={iconName} size={24} color={focused ? "#FFF" : "#94A3B8"} />
                  </View>
                </View>
              );
            },
            tabBarStyle: styles.tabBar,
            tabBarBackground: () => (
              <View style={{ flex: 1, borderRadius: 40, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', backgroundColor: 'transparent' }}>
                <BlurView intensity={70} tint="light" style={StyleSheet.absoluteFill} />
                <LinearGradient
                  colors={['rgba(255,255,255,0.5)', 'rgba(255,255,255,0.1)']}
                  style={StyleSheet.absoluteFill}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                />
              </View>
            ),
          })}
        >
          <Tab.Screen name="HomeTab" children={() => <HomeContent onOpenTool={setActiveTool} onOpenTwin={() => setShowTwin(true)} />} />
          <Tab.Screen name="CoursesTab" component={Courses} />
          <Tab.Screen name="ResourcesTab" component={Resources} />
          <Tab.Screen name="ProfileTab" component={Profile} />
        </Tab.Navigator>
      )}

      {!activeTool && !showTwin && <AIChatBot />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  decorCircle: {
    position: 'absolute',
    top: -150,
    right: -100,
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: 'rgba(245, 158, 11, 0.05)',
  },

  // HEADER
  headerContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingBottom: 10 },
  greetingText: { fontSize: 14, fontFamily: "Poppins_400Regular", color: "#64748B" },
  nameText: { fontSize: 24, fontFamily: "Poppins_700Bold", color: "#0F172A" },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  streakPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF7ED', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, marginRight: 12 },
  streakText: { fontFamily: "Poppins_700Bold", color: "#F59E0B", marginLeft: 4 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#FFF", justifyContent: 'center', alignItems: 'center', marginRight: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  dotBadage: { position: 'absolute', top: 10, right: 12, width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444', borderWidth: 1, borderColor: '#FFF' },
  profileBtn: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
  profileImage: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: '#FFF' },

  // SEARCH
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', marginHorizontal: 24, paddingHorizontal: 16, height: 52, borderRadius: 16, marginBottom: 20, shadowColor: "#64748B", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 },
  searchIcon: { marginRight: 12 },
  searchInput: { flex: 1, fontFamily: "Poppins_400Regular", fontSize: 14, color: "#1E293B" },
  micBtn: { padding: 8, backgroundColor: "#EEF2FF", borderRadius: 10 },

  // TWIN CARD
  twinContainer: { paddingHorizontal: 24, marginBottom: 24 },
  twinCard: { height: 180, borderRadius: 24, backgroundColor: "#000", shadowColor: "#F59E0B", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 15, elevation: 10 },
  twinBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#000', borderRadius: 24 },
  twinGradient: { padding: 20, borderRadius: 24 },
  twinBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F59E0B', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginBottom: 8 },
  twinBadgeText: { color: "#FFF", fontSize: 10, fontFamily: "Poppins_700Bold", letterSpacing: 1 },
  twinTitle: { color: "#FFF", fontSize: 22, fontFamily: "Poppins_700Bold", marginBottom: 4 },
  twinDesc: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontFamily: "Poppins_400Regular", marginBottom: 12 },
  twinBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 },
  twinBtnText: { fontFamily: "Poppins_700Bold", color: "#000", marginRight: 8, fontSize: 12 },

  // DAILY FOCUS
  focusContainer: { paddingHorizontal: 24, marginBottom: 30 },
  focusCard: { borderRadius: 24, padding: 24, position: 'relative', overflow: 'hidden' },
  focusBgIcon: { position: 'absolute', right: -20, bottom: -20 },
  focusContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  focusBadge: { backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start', marginBottom: 8 },
  focusBadgeText: { color: "#818CF8", fontSize: 10, fontFamily: "Poppins_700Bold", letterSpacing: 1 },
  focusTitle: { color: "#FFF", fontSize: 20, fontFamily: "Poppins_700Bold", marginBottom: 2 },
  focusSub: { color: "#94A3B8", fontSize: 14, fontFamily: "Poppins_400Regular" },
  ringContainer: { justifyContent: 'center', alignItems: 'center' },
  ringOuter: { width: 64, height: 64, borderRadius: 32, borderWidth: 4, borderColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
  ringInner: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
  ringText: { color: "#FFF", fontSize: 12, fontFamily: "Poppins_700Bold" },

  // AI TOOLS
  sectionContainer: { marginBottom: 30 },
  sectionTitle: { fontSize: 18, fontFamily: "Poppins_700Bold", color: "#0F172A", marginBottom: 15 },
  aiCard: { width: 140, height: 160, marginRight: 16, borderRadius: 24, shadowColor: "#4F46E5", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 6 },
  aiCardGradient: { flex: 1, borderRadius: 24, padding: 16, justifyContent: 'space-between' },
  aiCardContent: { justifyContent: 'flex-end' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  aiTitle: { color: "#FFF", fontSize: 15, fontFamily: "Poppins_700Bold", lineHeight: 20 },
  aiDesc: { color: "rgba(255,255,255,0.8)", fontSize: 11, fontFamily: "Poppins_500Medium" },

  // COURSES
  courseCard: { width: 220, marginRight: 16, borderRadius: 20, backgroundColor: "#FFF", overflow: 'hidden', shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3 },
  courseImg: { width: '100%', height: 120 },
  playOverlay: { position: 'absolute', top: 0, left: 0, right: 0, height: 120, justifyContent: 'center', alignItems: 'center' },
  courseMeta: { padding: 12 },
  courseTitle: { fontSize: 14, fontFamily: "Poppins_600SemiBold", color: "#1E293B", marginBottom: 8 },
  progressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressBar: { flex: 1, height: 4, backgroundColor: "#F1F5F9", borderRadius: 2, marginRight: 8 },
  progressFill: { height: '100%', backgroundColor: "#F59E0B", borderRadius: 2 },
  durationText: { fontSize: 10, fontFamily: "Poppins_500Medium", color: "#94A3B8" },

  // NEW ARRIVALS
  listCard: { flexDirection: 'row', padding: 12, backgroundColor: "#FFF", borderRadius: 20, marginBottom: 16, borderWidth: 1, borderColor: "#F1F5F9" },
  listImg: { width: 70, height: 70, borderRadius: 14, backgroundColor: "#E2E8F0" },
  listInfo: { flex: 1, marginLeft: 16, justifyContent: 'center' },
  tagRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  newTag: { backgroundColor: "#EFF6FF", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginRight: 8 },
  newTagText: { color: "#3B82F6", fontSize: 9, fontFamily: "Poppins_700Bold" },
  starRow: { flexDirection: 'row', alignItems: 'center' },
  ratingVal: { fontSize: 11, fontFamily: "Poppins_600SemiBold", color: "#475569", marginLeft: 4 },
  listTitle: { fontSize: 15, fontFamily: "Poppins_600SemiBold", color: "#1E293B", marginBottom: 2 },
  listAuthor: { fontSize: 12, fontFamily: "Poppins_400Regular", color: "#94A3B8" },
  saveBtn: { padding: 8 },

  // NAV
  tabBar: { position: "absolute", bottom: 30, left: 20, right: 20, height: 80, borderRadius: 40, backgroundColor: "transparent", borderTopWidth: 0, elevation: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.25, shadowRadius: 25 },
  tabIconContainer: { alignItems: 'center', justifyContent: 'center', top: 15 },
  activeTabIcon: { top: 10 },
  iconWrapper: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', backgroundColor: 'transparent' },
  activeIconWrapper: { backgroundColor: '#F59E0B', shadowColor: "#F59E0B", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },

  // LIVE FEED
  liveCard: { width: 280, marginRight: 16, marginBottom: 5 },
  liveCardInner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#312E81', padding: 12, borderRadius: 16, shadowColor: "#312E81", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  liveIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  liveTitle: { color: "#FFF", fontSize: 13, fontFamily: "Poppins_600SemiBold", marginBottom: 2 },
  liveAuthor: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontFamily: "Poppins_400Regular" },
  newBadge: { position: 'absolute', top: 12, right: 12, backgroundColor: '#EF4444', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  newBadgeText: { color: '#FFF', fontSize: 8, fontFamily: "Poppins_700Bold" },

  // NOTIFICATION OVERLAY
  overlayContainer: { position: 'absolute', top: 120, left: 0, right: 0, paddingHorizontal: 20, zIndex: 9999 },
  toastContainer: { borderRadius: 16, overflow: 'hidden', shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 15, elevation: 10 },
  toastContent: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: 'rgba(0,0,0,0.8)' },
  toastIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  toastTitle: { color: '#FFF', fontSize: 14, fontFamily: "Poppins_700Bold" },
  toastMsg: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontFamily: "Poppins_400Regular" },
  toastBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  toastBtnText: { color: '#FFF', fontSize: 12, fontFamily: "Poppins_600SemiBold" },

  // VIDEO MODAL
  closeVideoBtn: { position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20 },
  interactiveContainer: { flex: 1, backgroundColor: '#111827', borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: -20 },
  tabRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#374151' },
  tabBtn: { flex: 1, paddingVertical: 16, alignItems: 'center' },
  activeTabBtn: { borderBottomWidth: 2, borderBottomColor: '#F59E0B' },
  tabText: { color: '#9CA3AF', fontSize: 14, fontFamily: "Poppins_600SemiBold" },
  activeTabText: { color: '#F59E0B' },
  contentArea: { flex: 1, padding: 20 },
  transcriptText: { color: '#D1D5DB', fontSize: 14, fontFamily: "Poppins_400Regular", lineHeight: 24 },

  // QUIZ UI
  quizContainer: { paddingBottom: 40 },
  quizHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  quizCount: { color: '#9CA3AF', fontSize: 12, fontFamily: "Poppins_600SemiBold" },
  quizProgress: { width: 100, height: 6, backgroundColor: '#374151', borderRadius: 3 },
  quizProgressBar: { height: '100%', backgroundColor: '#F59E0B', borderRadius: 3 },
  questionText: { color: '#FFF', fontSize: 18, fontFamily: "Poppins_700Bold", marginBottom: 20 },
  optionBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1F2937', padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#374151' },
  optionCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#374151', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  optionLetter: { color: '#FFF', fontSize: 14, fontFamily: "Poppins_700Bold" },
  optionText: { color: '#E5E7EB', fontSize: 14, fontFamily: "Poppins_500Medium", flex: 1 },

  // QUIZ RESULTS
  resultContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  resultTitle: { color: '#FFF', fontSize: 24, fontFamily: "Poppins_700Bold", marginTop: 16, marginBottom: 8 },
  resultScore: { color: '#9CA3AF', fontSize: 16, fontFamily: "Poppins_500Medium", marginBottom: 24 },
  retryBtn: { backgroundColor: '#F59E0B', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  retryText: { color: '#FFF', fontSize: 14, fontFamily: "Poppins_700Bold" }
});
