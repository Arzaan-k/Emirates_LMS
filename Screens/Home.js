// Screens/Home.js
import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  Image,
  TextInput,
  TouchableOpacity,
  Dimensions,
  Platform,
  ImageBackground,
  Modal,
  ActivityIndicator,
} from "react-native";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Video, ResizeMode } from 'expo-av';
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useFocusEffect } from "@react-navigation/native";
import { BlurView } from "expo-blur";
import { Feather, Octicons, Ionicons, MaterialIcons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ScreenOrientation from 'expo-screen-orientation';
import Animated, {
  FadeInDown,
  FadeInRight,
  FadeInUp,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing
} from "react-native-reanimated";
import QuizScreen from '../Screens/QuizScreen';

// Import Screens
import Courses from "./Courses";
import Resources from "./Resources";
import Profile from "./Profile";

// Import AI Components
import SimulationHub from "../Components/SimulationHub"; // RESTORED: Customer Simulation (AI Roleplay)
import InteractiveSimulationHub from "../Components/InteractiveSimulationHub"; // NEW: Interactive Video Simulations
import AIScanner from "../Components/AIScanner";
import AIFlashcards from "../Components/AIFlashcards";
import AIChatBot from "../Components/AIChatBot";
import AIDigitalTwin from "../Components/AIDigitalTwin";
import QuizTakingModal from "../Components/QuizTakingModal";
import UpcomingExamsCard from "../Components/UpcomingExamsCard"; // [NEW] Scheduled Exams
import { useNavigation, useRoute } from "@react-navigation/native";
import { useLanguage } from "../context/language.context";
import API_URL from "../config";

// Performance utilities
import { cachedFetch, prefetch, clearCache } from '../utils/requestCache';
import { SkeletonHorizontalList, SkeletonList, SkeletonBanner } from '../Components/SkeletonLoader';
import useTabPrefetch from '../hooks/useTabPrefetch';

const { width, height } = Dimensions.get('window');

// --- PREMIUM ACCENT: FLOATING WAFFLE ---
const FloatingWaffle = ({ delay, duration, size, top, left, rotate }) => {
  const translateY = useSharedValue(0);

  useEffect(() => {
    translateY.value = withRepeat(
      withTiming(20, { duration: duration, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { rotate: rotate }]
  }));

  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', top, left, opacity: 0.1 }, animatedStyle]}>
      <MaterialCommunityIcons name="grid" size={size} color="#D97706" />
    </Animated.View>
  );
};

// --- SHARED: FULLSCREEN HANDLER FOR VIDEO COMPONENTS ---
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

// --- NEW: NOTIFICATIONS LIST MODAL ---
function NotificationsModal({ visible, notifications, onClose, onAction }) {
  const renderNotif = useCallback(({ item: notif }) => (
    <TouchableOpacity
      style={styles.notifItem}
      onPress={() => onAction(notif)}
      activeOpacity={0.7}
    >
      <View style={[styles.notifIconBox, { backgroundColor: notif.type === 'quiz' ? '#F59E0B' : (notif.type === 'crucial' ? '#EF4444' : '#3B82F6') }]}>
        <MaterialCommunityIcons
          name={notif.type === 'quiz' ? 'school' : (notif.type === 'proctored' ? 'shield-lock' : ((notif.mediaUrl || notif.media_url) ? 'paperclip' : 'bell'))}
          size={20}
          color="#FFF"
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.notifItemTitle}>{notif.title}</Text>
        <Text style={styles.notifItemMsg} numberOfLines={2}>
          {(notif.mediaUrl || notif.media_url) && "📎 "}{notif.message}
        </Text>
        <Text style={styles.notifTime}>{new Date(notif.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
      </View>
      <Feather name="chevron-right" size={16} color="rgba(255,255,255,0.3)" />
    </TouchableOpacity>
  ), [onAction]);

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.notifModalOverlay}>
        <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={styles.notifModalContent}>
          <View style={styles.notifHeader}>
            <Text style={styles.notifHeaderTitle}>Notifications</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeNotifBtn}>
              <Feather name="x" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>

          <FlatList
            data={notifications}
            keyExtractor={(item, index) => String(item.id || index)}
            renderItem={renderNotif}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 20 }}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={5}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Feather name="bell-off" size={48} color="rgba(255,255,255,0.2)" />
                <Text style={styles.emptyStateText}>No notifications yet</Text>
              </View>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

// --- NEW: NOTIFICATION DETAIL MODAL ---
function NotificationDetailModal({ visible, notification, onClose }) {
  if (!visible || !notification) return null;

  const isVideo = notification.mediaType === 'video';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.detailModalContainer}>
        {/* CLOSE BUTTON */}
        <TouchableOpacity style={styles.closeDetailBtn} onPress={onClose}>
          <Feather name="x" size={24} color="#FFF" />
        </TouchableOpacity>

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 50 }}>
          {/* MEDIA */}
          {(notification.mediaUrl || notification.media_url) && (
            <View style={styles.mediaContainer}>
              {isVideo ? (
                <Video
                  source={{ uri: notification.mediaUrl || notification.media_url }}
                  style={{ width: '100%', height: 250, borderRadius: 16 }}
                  useNativeControls
                  resizeMode={ResizeMode.CONTAIN}
                  shouldPlay
                  onFullscreenUpdate={handleVideoFullscreenUpdate}
                />
              ) : (
                <Image
                  source={{ uri: notification.mediaUrl || notification.media_url }}
                  style={{ width: '100%', height: 300, borderRadius: 16 }}
                  resizeMode="contain"
                />
              )}
            </View>
          )}

          <Text style={styles.detailTitle}>{notification.title}</Text>
          <Text style={styles.detailTime}>{new Date(notification.created_at).toLocaleString()}</Text>

          <View style={styles.detailDivider} />

          <Text style={styles.detailMessage}>{notification.message}</Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

// --- NEW: VIDEO PLAYER MODAL ---
// --- NEW: VIDEO PLAYER MODAL ---
function VideoPlayerModal({ visible, videoData, userEmail, onClose }) {
  const [activeTab, setActiveTab] = useState('transcript');
  const [quizIndex, setQuizIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const videoRef = useRef(null);
  const progressTrackTimer = useRef(null);

  // Translation State
  const [translationLang, setTranslationLang] = useState('English');
  const [translatedText, setTranslatedText] = useState('');
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

  // Track state for progress calculation
  const watchedSecondsRef = useRef(new Set());
  const wasPlayingRef = useRef(false);
  const maxPositionRef = useRef(0);
  const durationRef = useRef(0);

  // Track progress periodically while watching from Jump Back In
  const handlePlaybackStatusUpdate = (status) => {
    if (!status.isLoaded || !videoData?.id || !userEmail) return;

    const position = status.positionMillis / 1000;
    const duration = status.durationMillis ? status.durationMillis / 1000 : 0;
    if (duration <= 0) return;

    // Update refs for cleanup sync
    durationRef.current = duration;
    maxPositionRef.current = Math.max(maxPositionRef.current, position);

    // Track unique seconds watched
    if (status.isPlaying) {
      watchedSecondsRef.current.add(Math.floor(position));
    }

    // Detect pause event for immediate sync
    const justPaused = wasPlayingRef.current && !status.isPlaying;
    wasPlayingRef.current = status.isPlaying;

    if (!status.isPlaying && !justPaused) return;

    // Throttle: only send update every 2 seconds (reduced from 10s for responsiveness)
    const now = Date.now();
    if (!justPaused && progressTrackTimer.current && now - progressTrackTimer.current < 2000) return;
    progressTrackTimer.current = now;

    // Calculate robust progress
    const watchedCount = watchedSecondsRef.current.size;
    const progressPercent = Math.min(100, Math.floor((watchedCount / duration) * 100));

    const formData = new FormData();
    formData.append("user_email", userEmail);
    formData.append("node_id", videoData.id);
    formData.append("video_position_seconds", position.toString());
    formData.append("video_duration_seconds", duration.toString());
    formData.append("explicit_progress_percent", progressPercent.toString());

    fetch(`${API_URL}/api/v1/learning-path/track-video-progress`, {
      method: "POST",
      body: formData,
    }).catch(() => { });
  };

  // Force sync progress when modal closes
  const handleClose = async () => {
    if (durationRef.current > 0 && videoData?.id && userEmail) {
      const watchedCount = watchedSecondsRef.current.size;
      const progressPercent = Math.min(100, Math.floor((watchedCount / durationRef.current) * 100));

      const formData = new FormData();
      formData.append("user_email", userEmail);
      formData.append("node_id", videoData.id);
      formData.append("video_position_seconds", maxPositionRef.current.toString());
      formData.append("video_duration_seconds", durationRef.current.toString());
      formData.append("explicit_progress_percent", progressPercent.toString());

      await fetch(`${API_URL}/api/v1/learning-path/track-video-progress`, {
        method: "POST",
        body: formData,
      }).catch(() => { });
    }
    // Reset refs for next video
    watchedSecondsRef.current = new Set();
    maxPositionRef.current = 0;
    durationRef.current = 0;
    onClose();
  };

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

  const handleTranslate = async (targetLang) => {
    setTranslationLang(targetLang);
    setShowLangPicker(false);

    if (targetLang === 'English') {
      setTranslatedText(''); // Reset to original
      return;
    }

    setIsTranslating(true);
    try {
      const response = await fetch(`${API_URL}/api/v1/ai/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: videoData.transcript || "No transcript available.",
          target_language: targetLang
        })
      });
      const data = await response.json();
      if (data.translated_text) {
        setTranslatedText(data.translated_text);
      }
    } catch (error) {
      console.error("Translation error:", error);
    } finally {
      setIsTranslating(false);
    }
  };

  const filteredLanguages = LANGUAGES.filter(l => l.toLowerCase().includes(searchLang.toLowerCase()));
  const displayTranscript = translatedText || videoData.transcript || "No transcript available for this video.";

  const hasQuiz = videoData.quiz && videoData.quiz.length > 0;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" statusBarTranslucent={true}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {/* CLOSE BUTTON */}
        <TouchableOpacity style={styles.closeVideoBtn} onPress={handleClose}>
          <Feather name="x" size={24} color="#FFF" />
        </TouchableOpacity>

        {/* VIDEO PLAYER */}
        {videoData.videoUrl?.includes('youtube.com') || videoData.videoUrl?.includes('youtu.be') ? (
          <YouTubePlayer
            url={videoData.videoUrl}
            style={{ marginTop: 40 }}
          />
        ) : (
          <Video
            ref={videoRef}
            source={{ uri: videoData.videoUrl }}
            style={{ width: '100%', height: 250, marginTop: 40 }}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay
            positionMillis={videoData.resumePosition ? videoData.resumePosition * 1000 : 0}
            onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
            onError={(e) => console.log("Video Error:", e)}
            onFullscreenUpdate={handleVideoFullscreenUpdate}
          />
        )}

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
          <ScrollView style={styles.contentArea} contentContainerStyle={{ paddingBottom: 40 }}>
            {activeTab === 'transcript' ? (
              <View>
                {/* Language Selector Bar */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <Text style={{ color: '#9CA3AF', fontSize: 13, fontFamily: 'Poppins_500Medium' }}>Language</Text>
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#334155', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 }}
                    onPress={() => { setSearchLang(''); setShowLangPicker(true); }}
                  >
                    <MaterialCommunityIcons name="translate" size={16} color="#A5B4FC" style={{ marginRight: 6 }} />
                    <Text style={{ color: '#E5E7EB', fontSize: 13, fontFamily: 'Poppins_500Medium' }}>{translationLang}</Text>
                    <Feather name="chevron-down" size={14} color="#9CA3AF" style={{ marginLeft: 4 }} />
                  </TouchableOpacity>
                </View>

                {isTranslating ? (
                  <View style={{ padding: 40, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color="#F59E0B" />
                    <Text style={{ color: '#6B7280', fontSize: 12, marginTop: 10, fontFamily: 'Poppins_400Regular' }}>Translating transcript...</Text>
                  </View>
                ) : (
                  <Text style={styles.transcriptText}>
                    {displayTranscript}
                  </Text>
                )}
              </View>
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
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: 12,
                    backgroundColor: translationLang === lang ? '#374151' : 'transparent',
                    borderRadius: 10,
                    marginBottom: 4
                  }}
                  onPress={() => handleTranslate(lang)}
                >
                  <Text style={{ color: translationLang === lang ? '#F59E0B' : '#E5E7EB', flex: 1, fontFamily: translationLang === lang ? 'Poppins_600SemiBold' : 'Poppins_400Regular' }}>
                    {lang}
                  </Text>
                  {translationLang === lang && <Feather name="check" size={16} color="#F59E0B" />}
                </TouchableOpacity>
              ))}
              {filteredLanguages.length === 0 && (
                <Text style={{ color: '#6B7280', textAlign: 'center', padding: 20 }}>No languages found</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

// ... (Existing Components)

const LiveFeedSection = memo(function LiveFeedSection({ data, onPlay }) {
  const { t } = useLanguage();
  if (!data || data.length === 0) return null;

  const renderItem = useCallback(({ item, index }) => (
    <Animated.View entering={FadeInRight.duration(500)} style={styles.liveCard}>
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
          <Text style={styles.newBadgeText}>{t('justNow')}</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  ), [onPlay, t]);

  return (
    <View style={styles.sectionContainer}>
      <View style={[styles.sectionHeader, { paddingHorizontal: 20 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444', marginRight: 8 }} />
          <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Live Updates</Text>
        </View>
      </View>
      <FlatList
        data={data}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingLeft: 20, paddingBottom: 10 }}
        keyExtractor={(item, index) => String(item.id || index)}
        renderItem={renderItem}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={3}
        removeClippedSubviews={true}
      />
    </View>
  );
});

const QuizFeedSection = memo(function QuizFeedSection({ data, onStart }) {
  const { t } = useLanguage();
  if (!data || data.length === 0) return null;

  const renderItem = useCallback(({ item }) => (
    <Animated.View entering={FadeInRight.duration(500)} style={styles.quizFeedCard}>
      <TouchableOpacity style={styles.quizFeedCardInner} onPress={() => onStart(item)}>
        <View style={styles.quizFeedIcon}>
          <MaterialCommunityIcons name="school" size={24} color="#FFF" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.quizFeedTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.quizFeedMeta}>Assigned by Manager</Text>
        </View>
        <View style={styles.quizFeedBadge}>
          <Text style={styles.quizFeedBadgeText}>{t('actionRequired')}</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  ), [onStart, t]);

  return (
    <View style={styles.sectionContainer}>
      <View style={[styles.sectionHeader, { paddingHorizontal: 20 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#F59E0B', marginRight: 8 }} />
          <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Assigned Quizzes</Text>
        </View>
      </View>
      <FlatList
        data={data}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingLeft: 20, paddingBottom: 10 }}
        keyExtractor={(item, index) => String(item.id || index)}
        renderItem={renderItem}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={3}
        removeClippedSubviews={true}
      />
    </View>
  );
});

const ProctoredFeedSection = memo(function ProctoredFeedSection({ data, onStart }) {
  const { t } = useLanguage();
  if (!data || data.length === 0) return null;

  const renderItem = useCallback(({ item }) => (
    <Animated.View entering={FadeInRight.duration(500)} style={styles.proctorFeedCard}>
      <TouchableOpacity style={styles.proctorFeedCardInner} onPress={() => onStart(item)}>
        <View style={styles.proctorFeedIcon}>
          <MaterialCommunityIcons name="shield-lock" size={24} color="#FFF" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.proctorFeedTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.proctorFeedMeta}>Proctored • High Stakes</Text>
        </View>
        <View style={styles.proctorFeedBadge}>
          <Text style={styles.proctorFeedBadgeText}>{t('official')}</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  ), [onStart, t]);

  return (
    <View style={styles.sectionContainer}>
      <View style={[styles.sectionHeader, { paddingHorizontal: 20 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444', marginRight: 8 }} />
          <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Live Assessments</Text>
        </View>
      </View>
      <FlatList
        data={data}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingLeft: 20, paddingBottom: 10 }}
        keyExtractor={(item, index) => String(item.id || index)}
        renderItem={renderItem}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={3}
        removeClippedSubviews={true}
      />
    </View>
  );
});

// --- NEW: MEETINGS FEED SECTION ---
function MeetingsFeedSection({ data, onJoin }) {
  const { t } = useLanguage();
  if (!data || data.length === 0) return null;

  const formatTime = (isoString) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <View style={styles.sectionContainer}>
      <View style={[styles.sectionHeader, { paddingHorizontal: 20 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#6366F1', marginRight: 8 }} />
          <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Upcoming Meetings</Text>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: 20, paddingBottom: 10 }}>
        {data.map((item, index) => (
          <Animated.View key={index} entering={FadeInRight.duration(500)} style={styles.meetingFeedCard}>
            <TouchableOpacity
              style={styles.meetingFeedCardInner}
              onPress={() => onJoin(item)}
            >
              <View style={styles.meetingFeedIcon}>
                <MaterialCommunityIcons name="video" size={24} color="#FFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.meetingFeedTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.meetingFeedMeta}>{formatTime(item.scheduled_at)} • {item.duration_minutes}min</Text>
              </View>
              <View style={styles.meetingFeedBadge}>
                <Text style={styles.meetingFeedBadgeText}>Join</Text>
              </View>
            </TouchableOpacity>
          </Animated.View>
        ))}
      </ScrollView>
    </View>
  );
}

// --- NEW: CRM TASKS FEED SECTION ---
const PRIORITY_COLORS = {
  low: '#10B981',
  medium: '#F59E0B',
  high: '#EF4444',
  critical: '#7C3AED'
};

const TYPE_ICONS = {
  Query: 'help-circle',
  Request: 'git-pull-request',
  Complaint: 'alert-triangle'
};

function CRMTasksFeedSection({ data, onOpenTask }) {
  if (!data || data.length === 0) return null;

  // Filter to show only pending tasks
  const pendingTasks = data.filter(t => t.status !== 'completed');
  if (pendingTasks.length === 0) return null;

  return (
    <View style={styles.sectionContainer}>
      <View style={[styles.sectionHeader, { paddingHorizontal: 20 }]}>
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#F59E0B', marginRight: 8 }} />
            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>🎯 Live Assessments</Text>
          </View>
          <Text style={styles.sectionSubtitle}>Real customer tickets to practice</Text>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: 20, paddingBottom: 10 }}>
        {pendingTasks.map((item, index) => {
          const ticket = item.ticket || {};
          const priorityColor = PRIORITY_COLORS[ticket.priority] || '#F59E0B';
          const typeIcon = TYPE_ICONS[ticket.type] || 'file';

          return (
            <Animated.View key={item.id || index} entering={FadeInRight.delay(index * 100).duration(500)} style={styles.crmTaskCard}>
              <TouchableOpacity
                style={styles.crmTaskCardInner}
                onPress={() => onOpenTask(item)}
                activeOpacity={0.8}
              >
                {/* Priority color bar */}
                <View style={[styles.crmPriorityBar, { backgroundColor: priorityColor }]} />

                <View style={styles.crmTaskContent}>
                  {/* Header with type badge and XP */}
                  <View style={styles.crmTaskHeader}>
                    <View style={styles.crmTypeBadge}>
                      <Feather name={typeIcon} size={10} color="#A5B4FC" />
                      <Text style={styles.crmTypeText}>{ticket.type || 'Task'}</Text>
                    </View>
                    <View style={styles.crmXpBadge}>
                      <Text style={styles.crmXpText}>+50 XP</Text>
                    </View>
                  </View>

                  {/* Title */}
                  <Text style={styles.crmTaskTitle} numberOfLines={2}>{ticket.subject || 'Customer Ticket'}</Text>

                  {/* Customer name */}
                  <Text style={styles.crmTaskCustomer} numberOfLines={1}>
                    <Feather name="user" size={10} color="#94A3B8" /> {ticket.customer_name || 'Customer'}
                  </Text>

                  {/* Footer */}
                  <View style={styles.crmTaskFooter}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: priorityColor, marginRight: 6 }} />
                      <Text style={[styles.crmStatusText, { color: priorityColor }]}>{ticket.priority?.toUpperCase() || 'MEDIUM'}</Text>
                    </View>
                    <Feather name="arrow-right" size={14} color="#9CA3AF" />
                  </View>
                </View>
              </TouchableOpacity>
            </Animated.View>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ... (NotificationToast Unchanged)

// --- NEW: PREMIUM CRUCIAL NOTIFICATION COMPONENT ---
function CrucialNotificationModal({ notification, onAcknowledge }) {
  const [shake, setShake] = useState(0);
  const [isChecked, setIsChecked] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const insets = useSafeAreaInsets();
  const { width } = Dimensions.get('window');

  if (!notification) return null;

  // DEBUG: Log the notification object to see if mediaUrl is present
  console.log('[CrucialNotification] Notification object:', JSON.stringify(notification, null, 2));

  const handlePressOutside = () => {
    setShake(prev => prev + 1);
    // Reset shake after animation
    setTimeout(() => setShake(0), 500);
  };

  const handleScroll = (event) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const progress = Math.min(100, (contentOffset.y / (contentSize.height - layoutMeasurement.height)) * 100);
    setScrollProgress(Math.max(scrollProgress, progress));
  };

  const canCheckbox = scrollProgress > 80 || (notification.message && notification.message.length < 200);

  return (
    <Modal visible={true} transparent animationType="fade">
      <View style={crucialStyles.overlay}>
        {/* Premium Gradient Background */}
        <LinearGradient
          colors={['rgba(15, 23, 42, 0.98)', 'rgba(30, 27, 75, 0.98)', 'rgba(15, 23, 42, 0.98)']}
          style={StyleSheet.absoluteFill}
        />

        {/* Ghost Waffle Decorations */}
        <View style={crucialStyles.ghostContainer} pointerEvents="none">
          <Text style={[crucialStyles.ghostWaffle, { top: '5%', left: '10%', transform: [{ rotate: '-15deg' }] }]}>🧇</Text>
          <Text style={[crucialStyles.ghostWaffle, { top: '15%', right: '8%', transform: [{ rotate: '20deg' }] }]}>🧇</Text>
          <Text style={[crucialStyles.ghostWaffle, { bottom: '20%', left: '5%', transform: [{ rotate: '10deg' }] }]}>🧇</Text>
          <Text style={[crucialStyles.ghostWaffle, { bottom: '10%', right: '12%', transform: [{ rotate: '-25deg' }] }]}>🧇</Text>
        </View>

        <TouchableOpacity
          style={crucialStyles.clickLayer}
          onPress={handlePressOutside}
          activeOpacity={1}
        >
          <Animated.View
            entering={FadeInUp.springify().damping(15)}
            style={[
              crucialStyles.card,
              shake > 0 && { transform: [{ translateX: shake % 2 === 0 ? 0 : 8 }] }
            ]}
          >
            {/* Glassmorphism Background */}
            <BlurView intensity={40} tint="dark" style={crucialStyles.cardBlur}>
              {/* Alert Icon with Glow */}
              <View style={crucialStyles.iconGlow}>
                <View style={crucialStyles.iconBg}>
                  <MaterialCommunityIcons name="alert-decagram" size={28} color="#EF4444" />
                </View>
              </View>

              {/* Priority Badge */}
              <View style={crucialStyles.priorityBadge}>
                <View style={crucialStyles.priorityDot} />
                <Text style={crucialStyles.priorityText}>CRITICAL UPDATE</Text>
              </View>

              {/* Content - Media Display (Image/Video) */}
              {(notification.mediaUrl || notification.media_url) && (
                <View style={{ marginBottom: 12, borderRadius: 12, overflow: 'hidden', width: '100%' }}>
                  {(notification.mediaUrl || notification.media_url).toLowerCase().includes('.mp4') ||
                    (notification.mediaUrl || notification.media_url).toLowerCase().includes('.mov') ||
                    (notification.mediaUrl || notification.media_url).toLowerCase().includes('.webm') ? (
                    <Video
                      source={{ uri: notification.mediaUrl || notification.media_url }}
                      style={{ width: '100%', height: 220, borderRadius: 12 }}
                      resizeMode={ResizeMode.COVER}
                      useNativeControls
                      shouldPlay={false}
                      onFullscreenUpdate={handleVideoFullscreenUpdate}
                    />
                  ) : (
                    <Image
                      source={{ uri: notification.mediaUrl || notification.media_url }}
                      style={{ width: '100%', height: 220, borderRadius: 12 }}
                      resizeMode="cover"
                      onError={(e) => console.log('[CrucialNotification] Image load error:', e.nativeEvent.error)}
                      onLoad={() => console.log('[CrucialNotification] Image loaded successfully:', notification.mediaUrl || notification.media_url)}
                    />
                  )}
                </View>
              )}

              <Text style={crucialStyles.title}>{notification.title}</Text>

              <ScrollView
                style={crucialStyles.scrollArea}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                showsVerticalScrollIndicator={true}
              >
                <Text style={crucialStyles.message}>{notification.message}</Text>
              </ScrollView>

              {/* Waffle Divider */}
              <View style={crucialStyles.dividerRow}>
                <View style={crucialStyles.dividerLine} />
                <Text style={crucialStyles.dividerEmoji}>🧇</Text>
                <View style={crucialStyles.dividerLine} />
              </View>

              {/* Checkbox with Premium Styling */}
              <TouchableOpacity
                style={[
                  crucialStyles.checkboxRow,
                  !canCheckbox && crucialStyles.checkboxDisabled
                ]}
                onPress={() => canCheckbox && setIsChecked(!isChecked)}
                activeOpacity={canCheckbox ? 0.8 : 1}
              >
                <View style={[
                  crucialStyles.checkbox,
                  isChecked && crucialStyles.checkboxChecked
                ]}>
                  {isChecked && <Feather name="check" size={14} color="#FFF" />}
                </View>
                <Text style={[
                  crucialStyles.checkboxText,
                  !canCheckbox && { color: 'rgba(255,255,255,0.3)' }
                ]}>
                  {canCheckbox ? "I have read the entire notification" : "Please scroll to read the full message"}
                </Text>
              </TouchableOpacity>

              {/* Acknowledge Button */}
              <TouchableOpacity
                style={[
                  crucialStyles.ackBtn,
                  !isChecked && crucialStyles.ackBtnDisabled
                ]}
                onPress={() => isChecked && onAcknowledge(notification.id)}
                disabled={!isChecked}
                activeOpacity={isChecked ? 0.8 : 1}
              >
                <LinearGradient
                  colors={isChecked ? ['#EF4444', '#DC2626'] : ['#4B5563', '#374151']}
                  style={crucialStyles.ackBtnGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Text style={crucialStyles.ackBtnText}>
                    {isChecked ? "Acknowledge & Continue" : "Read Above First"}
                  </Text>
                  {isChecked && <Feather name="check-circle" size={18} color="#FFF" style={{ marginLeft: 8 }} />}
                </LinearGradient>
              </TouchableOpacity>

              {/* Warning Text */}
              {shake > 0 && (
                <Animated.Text
                  entering={FadeInUp.duration(300)}
                  style={crucialStyles.warnText}
                >
                  ⚠️ You must acknowledge this to continue using the app
                </Animated.Text>
              )}
            </BlurView>
          </Animated.View>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// Premium Crucial Notification Styles
const crucialStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ghostContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  ghostWaffle: {
    position: 'absolute',
    fontSize: 40,
    opacity: 0.05,
  },
  clickLayer: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 24,
  },
  card: {
    width: '100%',
    maxHeight: '95%',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 18,
  },
  cardBlur: {
    padding: 16,
    alignItems: 'center',
    backgroundColor: 'rgba(30, 27, 75, 0.92)',
  },
  iconGlow: {
    padding: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    marginBottom: 8,
  },
  iconBg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  priorityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  priorityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EF4444',
    marginRight: 6,
  },
  priorityText: {
    color: '#EF4444',
    fontSize: 10,
    fontFamily: 'Poppins_700Bold',
    letterSpacing: 1.5,
  },
  title: {
    color: '#FFF',
    fontSize: 18,
    fontFamily: 'Poppins_700Bold',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 24,
  },
  scrollArea: {
    maxHeight: 100,
    width: '100%',
    marginBottom: 8,
  },
  message: {
    color: '#CBD5E1',
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    textAlign: 'center',
    lineHeight: 22,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginVertical: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  dividerEmoji: {
    fontSize: 16,
    marginHorizontal: 10,
    opacity: 0.5,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 12,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  checkboxDisabled: {
    opacity: 0.5,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  checkboxText: {
    flex: 1,
    color: '#E5E7EB',
    fontSize: 13,
    fontFamily: 'Poppins_500Medium',
  },
  ackBtn: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
  ackBtnDisabled: {
    shadowOpacity: 0,
    elevation: 0,
  },
  ackBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  ackBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontFamily: 'Poppins_600SemiBold',
  },
  warnText: {
    color: '#F87171',
    fontSize: 11,
    fontFamily: 'Poppins_500Medium',
    marginTop: 10,
    textAlign: 'center',
  },
});

function HomeContent({ onOpenTool, onOpenTwin, userEmail, userProfile }) {
  const navigation = useNavigation();
  const { t } = useLanguage();
  const [liveUpdates, setLiveUpdates] = useState([]);
  const [notification, setNotification] = useState(null);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [selectedNews, setSelectedNews] = useState(null);

  // QUIZ STATE
  const [assignedQuizzes, setAssignedQuizzes] = useState([]);
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [quizModalVisible, setQuizModalVisible] = useState(false);
  const [currentQuizIndex, setCurrentQuizIndex] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState([]);
  const [quizScore, setQuizScore] = useState(null);

  const [assignedProctoring, setAssignedProctoring] = useState([]);
  const [pathNodes, setPathNodes] = useState([]);
  const [hasRealWatchHistory, setHasRealWatchHistory] = useState(false);
  const [authHeaders, setAuthHeaders] = useState({});
  const [crucialNotif, setCrucialNotif] = useState(null);
  const acknowledgedNotifIds = useRef(new Set()); // Track acknowledged notifications locally
  const [goalModalVisible, setGoalModalVisible] = useState(false);

  const [allNotifications, setAllNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState(null);

  // DYNAMIC NEWS & QUIZZES
  const [newsData, setNewsData] = useState([]);
  const [liveQuizzesData, setLiveQuizzesData] = useState([]);

  // [NEW] MEETINGS STATE
  const [upcomingMeetings, setUpcomingMeetings] = useState([]);
  const [crmTasks, setCrmTasks] = useState([]);

  // [RESTORED] Exam refresh key
  const [examRefreshKey, setExamRefreshKey] = useState(0);

  useFocusEffect(
    React.useCallback(() => {
      setExamRefreshKey(prev => prev + 1);
    }, [])
  );

  useEffect(() => {
    const loadAuthHeaders = async () => {
      try {
        const token = await AsyncStorage.getItem('userToken');
        setAuthHeaders(token ? { Authorization: `Bearer ${token}` } : {});
      } catch {
        setAuthHeaders({});
      }
    };
    loadAuthHeaders();
  }, []);

  const handleAcknowledge = async (id) => {
    try {
      // Add to local tracking FIRST to prevent re-display
      acknowledgedNotifIds.current.add(id);

      // PERSIST to AsyncStorage
      await AsyncStorage.setItem('acknowledged_notifications', JSON.stringify(Array.from(acknowledgedNotifIds.current)));

      setCrucialNotif(null);
      await fetch(`${API_URL}/api/v1/notifications/${id}/read`, { method: 'POST' });
    } catch (e) {
      console.error("Ack Error", e);
      setCrucialNotif(null);
    }
  };

  const handleGoalContinue = () => {
    setGoalModalVisible(false);
    navigation.navigate("CoursesTab");
  };

  // FETCH RECENTLY VIEWED (Jump Back In) - per-user based on real watch history
  // Note: Not cached — personalized per-user, should always be fresh
  const fetchPathNodes = async () => {
    try {
      // Get email - either from props or AsyncStorage
      const email = userEmail || await AsyncStorage.getItem('userEmail');
      if (email) {
        const response = await fetch(`${API_URL}/api/v1/learning-path/recently-viewed/${encodeURIComponent(email)}?limit=10`);
        const data = await response.json();
        if (data.status === 'success' && data.items && data.items.length > 0) {
          // Real watch history found - show it
          setPathNodes(data.items);
          setHasRealWatchHistory(true);
          return;
        }
        // No watch history yet - show empty state (don't show fake data)
        setPathNodes([]);
        setHasRealWatchHistory(false);
        return;
      }
      // No email yet - keep empty, will re-fetch when userEmail prop arrives
      setPathNodes([]);
      setHasRealWatchHistory(false);
    } catch (error) {
      console.error("Error fetching recently viewed:", error);
      setPathNodes([]);
      setHasRealWatchHistory(false);
    }
  };

  // FETCH NEWS FEED — cached for 2 minutes
  const fetchNews = async () => {
    try {
      const data = await cachedFetch(`${API_URL}/api/v1/notifications/news`, {}, { ttl: 120000 });
      if (Array.isArray(data)) {
        setNewsData(data);
      }
    } catch (error) {
      console.error("Error fetching news:", error);
    }
  };

  // FETCH LIVE QUIZZES — cached for 60 seconds
  const fetchLiveQuizzes = async () => {
    try {
      const data = await cachedFetch(`${API_URL}/api/v1/quizzes/live`, {}, { ttl: 60000 });
      if (Array.isArray(data)) {
        setLiveQuizzesData(data);
      }
    } catch (error) {
      console.error("Error fetching live quizzes:", error);
    }
  };

  const startQuiz = async (quizData) => {
    if (!quizData.questions) {
      try {
        const response = await fetch(`${API_URL}/api/v1/quizzes/${quizData.quiz_id || quizData.id}`);
        const fullQuiz = await response.json();
        if (fullQuiz.error) throw new Error(fullQuiz.error);
        setActiveQuiz(fullQuiz);
      } catch (err) {
        console.error("Error fetching quiz:", err);
        alert("Could not load quiz details.");
        return;
      }
    } else {
      setActiveQuiz(quizData);
    }
    setQuizModalVisible(true);
  };

  // FETCH NOTIFICATIONS — cached for 30 seconds
  const fetchNotifications = async () => {
    if (!userEmail) return;
    try {
      const data = await cachedFetch(`${API_URL}/api/v1/notifications`, {}, { ttl: 30000 });
      if (Array.isArray(data)) {
        // Filter notifications relevant to this user
        const filtered = data.filter(n => {
          if (!n.target_users || n.target_users.length === 0) return true;
          return n.target_users.includes(userEmail);
        });
        setAllNotifications(filtered);
      }
    } catch (e) {
      console.log("Error fetching notifications", e);
    }
  };

  // FETCH PROCTORED ASSESSMENTS
  const fetchProctoredAssessments = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const response = await fetch(`${API_URL}/api/v1/assessments/proctored`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (Array.isArray(data)) {
        setAssignedProctoring(data);
      }
    } catch (error) {
      console.error("Error fetching proctored assessments:", error);
    }
  };

  // FETCH CRUCIAL NOTIFICATIONS - Runs on load to block app if needed
  const fetchCrucialNotifications = async () => {
    try {
      // LOAD ACKNOWLEDGED IDs FROM STORAGE FIRST
      try {
        const storedAck = await AsyncStorage.getItem('acknowledged_notifications');
        if (storedAck) {
          const ids = JSON.parse(storedAck);
          ids.forEach(id => acknowledgedNotifIds.current.add(id));
        }
      } catch (err) { console.log("Error loading acks", err); }

      const res = await fetch(`${API_URL}/api/v1/notifications/crucial`);
      const data = await res.json();

      // DEBUG: Log the response from the API
      console.log('[CrucialNotification] API Response:', JSON.stringify(data, null, 2));

      // If there's an unread crucial notification AND not already acknowledged locally
      if (data && data.id && !data.read && !acknowledgedNotifIds.current.has(data.id)) {
        console.log('[CrucialNotification] Setting notification with mediaUrl:', data.mediaUrl);
        setCrucialNotif(data);
      }
    } catch (e) {
      console.log("Error fetching crucial notifications", e);
    }
  };

  // [NEW] FETCH MEETINGS — cached for 60 seconds
  const fetchMeetings = async () => {
    try {
      const data = await cachedFetch(`${API_URL}/api/v1/meetings`, {}, { ttl: 60000 });
      if (Array.isArray(data)) {
        // Filter only scheduled/ongoing meetings
        const active = data.filter(m => m.status !== 'ended');
        setUpcomingMeetings(active);
      }
    } catch (error) {
      console.error("Error fetching meetings:", error);
    }
  };

  const fetchCrmTasks = async () => {
    try {
      // Use actual user email from props
      if (!userEmail) return; // Skip if userEmail not loaded yet
      const data = await cachedFetch(`${API_URL}/api/v1/crm/my-tasks?user_email=${encodeURIComponent(userEmail)}`, {}, { ttl: 60000 });
      if (Array.isArray(data)) {
        setCrmTasks(data);
      }
    } catch (error) {
      console.error("Error fetching CRM tasks:", error);
    }
  };

  // Prefetch adjacent tab data 2 seconds after mount to make tab switches instant
  const prefetchTargets = React.useMemo(() => ([
    { url: `${API_URL}/api/v1/self-learning/buckets?user_email=${userEmail || ''}`, ttl: 120000 },
    { url: `${API_URL}/api/v1/analytics/dashboard`, ttl: 60000 },
  ]), [userEmail]);
  useTabPrefetch(prefetchTargets, authHeaders);

  useEffect(() => {
    // CRITICAL: Fetch crucial notifications FIRST to block app if needed
    fetchCrucialNotifications();

    // Fire all non-critical fetches in parallel — eliminates sequential waterfall
    Promise.all([
      fetchPathNodes(),
      fetchNews(),
      fetchLiveQuizzes(),
      fetchProctoredAssessments(),
      fetchMeetings(),
      fetchCrmTasks(),
    ]).catch(() => { }); // individual functions handle their own errors
  }, []);

  useEffect(() => {
    if (userEmail) {
      fetchNotifications();
      // Re-fetch recently viewed now that we have the user email
      fetchPathNodes();
    }
  }, [userEmail]);

  // [SEAMLESS SYNC] Refresh recently viewed (Jump Back In) when Home tab regains focus
  useFocusEffect(
    React.useCallback(() => {
      if (userEmail) {
        fetchPathNodes();
      }
    }, [userEmail])
  );

  useEffect(() => {
    // CONNECT TO WEBSOCKET
    const socketUrl = API_URL.replace('http', 'ws') + '/ws';
    const ws = new WebSocket(socketUrl);

    ws.onopen = () => {
      console.log("Connected to Realtime Server");
    };

    ws.onmessage = (e) => {
      try {
        const message = JSON.parse(e.data);
        if (message.type === "NEW_CONTENT") {
          setLiveUpdates(prev => [message.data, ...prev]);
        } else if (message.type === "NOTIFICATION") {
          const notif = message.data;
          // [NEW] Filter by target_users
          if (notif.target_users && notif.target_users.length > 0 && userEmail && !notif.target_users.includes(userEmail)) {
            return;
          }
          setNotification(notif);
          setAllNotifications(prev => [notif, ...prev]);
          setTimeout(() => setNotification(null), 5000);
        } else if (message.type === "QUIZ_ASSIGNED") {
          setAssignedQuizzes(prev => [message.data, ...prev]);
          const notif = {
            title: "New Quiz!",
            message: message.data.title,
            type: "quiz",
            data: message.data,
            created_at: new Date().toISOString()
          };
          setNotification(notif);
          setAllNotifications(prev => [notif, ...prev]);
          setTimeout(() => setNotification(null), 5000);
        } else if (message.type === "CRUCIAL_NOTIFICATION") {
          // Only show if not already acknowledged locally
          if (message.data?.id && !acknowledgedNotifIds.current.has(message.data.id)) {
            setCrucialNotif(message.data);
          }
        } else if (message.type === "proctored") {
          setAssignedProctoring(prev => [message.data, ...prev]);
        } else if (message.type === "MEETING_SCHEDULED") {
          // [NEW] Handle new meeting notification
          setUpcomingMeetings(prev => [message.data, ...prev]);
        } else if (message.type === "MEETING_ENDED") {
          // Remove ended meeting from list
          setUpcomingMeetings(prev => prev.filter(m => m.id !== message.data.meeting_id));
          const notif = {
            title: "Locked Assessment!",
            message: message.data.title,
            type: "proctored",
            data: message.data,
            created_at: new Date().toISOString()
          };
          setNotification(notif);
          setAllNotifications(prev => [notif, ...prev]);
          setTimeout(() => setNotification(null), 5000);
        } else if (message.type === "NEWS_POSTED") {
          // Real-time news update
          setNewsData(prev => [message.data, ...prev]);
        } else if (message.type === "QUIZ_POSTED") {
          // Real-time quiz update
          setLiveQuizzesData(prev => [message.data, ...prev]);
        }
        else if (message.type === "CRM_TASK_ASSIGNED") {
          // [NEW] Handle CRM task assignment
          const taskData = message.data;
          setCrmTasks(prev => [{ ...taskData.assignment, ticket: taskData.ticket }, ...prev]);
          const notif = {
            title: "🎯 Live Assessment Assigned!",
            message: taskData.ticket?.subject || 'New CRM task',
            type: "crm_task",
            data: taskData,
            created_at: new Date().toISOString()
          };
          setNotification(notif);
          setAllNotifications(prev => [notif, ...prev]);
          setTimeout(() => setNotification(null), 5000);
        }
        else if (message.type === "EXAM_SCHEDULED" || message.type === "EXAM_START_ENABLED") {
          // Show notification if present and applicable
          if (message.notification) {
            const notif = message.notification;
            if (!notif.target_users || (userEmail && notif.target_users.includes(userEmail))) {
              setNotification(notif);
              setAllNotifications(prev => [notif, ...prev]);
              setTimeout(() => setNotification(null), 5000);
            }
          }
          // Refresh exams list
          setExamRefreshKey(prev => prev + 1);
        }
      } catch (err) {
        console.log("WS Error", err);
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  const handleNotificationAction = (notif) => {
    setShowNotifications(false);
    if (notif.type === 'quiz' && notif.data) {
      startQuiz(notif.data);
    } else if (notif.type === 'proctored' && notif.data) {
      navigation.navigate('ProctoredAssessment', {
        assessmentData: notif.data,
        userProfile: userProfile
      });
    } else {
      setSelectedNotification(notif);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.decorCircle} />
        <Header onNotificationPress={() => setShowNotifications(true)} userName={userProfile?.name} userProfile={userProfile} />
        <SearchBar />

        {/* [NEW] SCHEDULED EXAMS - High Priority */}
        <UpcomingExamsCard
          refreshKey={examRefreshKey}
          userEmail={userEmail}
          onStartExam={(examData) => navigation.navigate('ProctoredAssessment', {
            assessmentData: examData,
            userProfile: userProfile,
            isScheduledExam: true
          })}
        />

        <LiveFeedSection
          data={liveUpdates}
          onPlay={(item) => setSelectedVideo(item)}
        />

        <ProctoredFeedSection
          data={assignedProctoring}
          onStart={(assessment) => navigation.navigate('ProctoredAssessment', {
            assessmentData: assessment,
            userProfile: userProfile
          })}
        />

        <QuizFeedSection
          data={assignedQuizzes}
          onStart={(quiz) => startQuiz(quiz)}
        />



        {/* [NEW] MEETINGS FEED */}
        {/* [NEW] MEETINGS FEED */}
        {/* <MeetingsFeedSection
          data={upcomingMeetings}
          onJoin={(meeting) => navigation.navigate('MeetingRoom', {
            meeting,
            userEmail: userEmail,
            userName: 'User'
          })}
        /> */}

        {/* [NEW] CRM TASKS FEED - Live Assessments */}
        {/* <CRMTasksFeedSection
          data={crmTasks}
          onOpenTask={(task) => navigation.navigate('CRMTask', {
            task,
            userEmail: userEmail
          })}
        /> */}

        <DigitalTwinCard onOpen={onOpenTwin} />

        <DailyFocus
          item={pathNodes.length > 0 ? pathNodes[0] : null}
          onPress={() => setGoalModalVisible(true)}
        />

        <AIRecommendationsCard navigation={navigation} />

        <AIToolsSection onOpenTool={onOpenTool} />

        <TopicQuizzes
          quizzes={liveQuizzesData}
          onStartQuiz={(quiz) => {
            setActiveQuiz(quiz);
            setQuizModalVisible(true);
          }}
        />

        <CourseList items={pathNodes} hasRealWatchHistory={hasRealWatchHistory} onPlay={(item) => setSelectedVideo(item)} />
        <NewArrivals
          news={newsData}
          onOpenNews={(news) => {
            console.log("Opening news:", news?.title);
            setSelectedNews(news);
          }}
        />
      </ScrollView>

      <View style={styles.overlayContainer} pointerEvents="box-none">
        <NotificationToast
          visible={!!notification}
          message={notification}
          type={notification?.type}
          onPress={() => {
            if (notification?.type === 'quiz' && notification?.data) {
              startQuiz(notification.data);
            } else if (notification?.type === 'proctored' && notification?.data) {
              navigation.navigate('ProctoredAssessment', {
                assessmentData: notification.data,
                userProfile: userProfile
              });
            } else {
              setSelectedNotification(notification);
            }
          }}
        />
      </View>

      <TodaysGoalModal
        visible={goalModalVisible}
        item={pathNodes.length > 0 ? pathNodes[0] : null}
        onClose={() => setGoalModalVisible(false)}
        onContinue={handleGoalContinue}
      />

      <CrucialNotificationModal
        notification={crucialNotif}
        onAcknowledge={handleAcknowledge}
      />

      <VideoPlayerModal
        visible={!!selectedVideo}
        videoData={selectedVideo}
        userEmail={userEmail}
        onClose={() => { setSelectedVideo(null); fetchPathNodes(); }}
      />

      <QuizTakingModal
        visible={quizModalVisible}
        quiz={activeQuiz}
        onClose={() => {
          setQuizModalVisible(false);
          setActiveQuiz(null);
        }}
        userName={userProfile?.name || "User"}
        userEmail={userEmail}
      />

      <NotificationsModal
        visible={showNotifications}
        notifications={allNotifications}
        onClose={() => setShowNotifications(false)}
        onAction={handleNotificationAction}
      />

      {/* NEWS DETAIL MODAL */}
      <Modal visible={!!selectedNews} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' }}>
          <View style={{ flex: 1, paddingTop: 50 }}>
            <TouchableOpacity
              style={{ position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 10 }}
              onPress={() => setSelectedNews(null)}
            >
              <Feather name="x" size={28} color="#FFF" />
            </TouchableOpacity>

            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              {selectedNews?.image && (
                <Image
                  source={{ uri: selectedNews.image }}
                  style={{ width: '100%', height: 250 }}
                  resizeMode="cover"
                />
              )}
              <View style={{ padding: 20 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                  <Text style={{ color: '#F59E0B', fontFamily: 'Poppins_600SemiBold', fontSize: 13 }}>
                    {selectedNews?.author || 'Team'}
                  </Text>
                  <Text style={{ color: '#6B7280', fontSize: 12, marginLeft: 8 }}>
                    • {selectedNews?.date || 'Today'}
                  </Text>
                </View>
                <Text style={{ color: '#FFF', fontFamily: 'Poppins_700Bold', fontSize: 24, marginBottom: 16 }}>
                  {selectedNews?.title}
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.8)', fontFamily: 'Poppins_400Regular', fontSize: 16, lineHeight: 26 }}>
                  {selectedNews?.content}
                </Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <NotificationDetailModal
        visible={!!selectedNotification}
        notification={selectedNotification}
        onClose={() => setSelectedNotification(null)}
      />

    </View>
  )
}



const Tab = createBottomTabNavigator();

// CONSTANTS

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
  { id: 'videosim', title: 'Video Training', desc: 'Interactive Sims', icon: 'movie-filter', color: ['#EC4899', '#BE185D'], accent: '#FFF' },
  { id: 'scanner', title: 'Hygiene Scan', desc: 'AR Inspection', icon: 'camera-iris', color: ['#10B981', '#059669'], accent: '#FFF' },
  { id: 'flashcards', title: 'Wiki Cards', desc: 'Rapid Recall', icon: 'cards-playing-outline', color: ['#F59E0B', '#D97706'], accent: '#FFF' },
];

function Header({ onNotificationPress, userName, userProfile }) {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const displayName = userName || 'User';
  const avatarName = encodeURIComponent(displayName.replace(/\s+/g, '+'));
  const profilePic = userProfile?.profile_data?.profile_pic;

  return (
    <Animated.View entering={FadeInDown.duration(600).springify()} style={[styles.headerContainer, { paddingTop: insets.top + 10 }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.greetingText}>{t('goodMorning')}</Text>
        <Text style={styles.nameText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{displayName}</Text>
      </View>

      <View style={styles.headerRight}>
        {/* STREAK */}
        <TouchableOpacity style={styles.streakPill}>
          <MaterialCommunityIcons name="fire" size={20} color="#F59E0B" />
          <Text style={styles.streakText}>5</Text>
        </TouchableOpacity>

        {/* NOTIFICATIONS */}
        <TouchableOpacity style={styles.iconBtn} onPress={onNotificationPress}>
          <Feather name="bell" size={20} color="#111827" />
          <View style={styles.dotBadage} />
        </TouchableOpacity>

        {/* PROFILE */}
        <TouchableOpacity style={styles.profileBtn}>
          <Image
            source={{ uri: profilePic || `https://ui-avatars.com/api/?name=${avatarName}&background=0F172A&color=fff` }}
            style={styles.profileImage}
          />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

function SearchBar() {
  const { t } = useLanguage();
  return (
    <Animated.View entering={FadeInDown.delay(100).duration(600)} style={styles.searchContainer}>
      <Feather name="search" size={20} color="#9CA3AF" style={styles.searchIcon} />
      <TextInput
        placeholder={t('searchPlaceholder')}
        placeholderTextColor="#9CA3AF"
        style={styles.searchInput}
      />
      <View style={styles.micBtn}>
        <Feather name="mic" size={18} color="#4F46E5" />
      </View>
    </Animated.View>
  );
}

// ------ INTERACTIVE SIMULATION HERO CARD ------
// NOTE: This replaces the old Digital Twin card with Interactive Video Simulations
function DigitalTwinCard({ onOpen }) {
  const { t } = useLanguage();
  return (
    <Animated.View entering={FadeInDown.delay(200).duration(800)} style={styles.twinContainer}>
      <TouchableOpacity style={styles.twinCard} activeOpacity={0.9} onPress={onOpen}>
        <ImageBackground
          source={{ uri: "https://images.unsplash.com/photo-1562376552-0d160a2f238d?q=80&w=2000&auto=format&fit=crop" }}
          style={styles.twinBg}
          imageStyle={{ borderRadius: 24, opacity: 0.6 }}
        >
          <LinearGradient colors={["transparent", "rgba(0,0,0,0.9)"]} style={styles.twinGradient}>
            <View style={styles.twinBadge}>
              <MaterialCommunityIcons name="movie-filter" size={14} color="#FFF" style={{ marginRight: 4 }} />
              <Text style={styles.twinBadgeText}>INTERACTIVE</Text>
            </View>
            <Text style={styles.twinTitle}>First-Person Simulations</Text>
            <Text style={styles.twinDesc}>Experience real scenarios through immersive video training. Make choices, learn from consequences.</Text>

            <View style={styles.twinBtn}>
              <Text style={styles.twinBtnText}>Start Training</Text>
              <Feather name="play" size={16} color="#000" />
            </View>
          </LinearGradient>
        </ImageBackground>
      </TouchableOpacity>
    </Animated.View>
  )
}

// --- MOCK NEWS DATA ---
const NEWS_FEED_DATA = [
  {
    id: 1,
    title: "New Summer Menu Launch!",
    author: "Head Chef",
    date: "2 hours ago",
    image: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?q=80&w=2000&auto=format&fit=crop",
    content: "Get ready for the summer season with our refreshing new waffle toppings! Mango Madness and Berry Blast are joining the menu starting next week. Training modules are now live."
  },
  {
    id: 2,
    title: "Employee of the Month: Sarah",
    author: "HR Team",
    date: "1 day ago",
    image: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=2000&auto=format&fit=crop",
    content: "Congratulations to Sarah for achieving 100% customer satisfaction rating this month! Her dedication to service excellence is an inspiration to us all."
  },
  {
    id: 3,
    title: "Hygiene Protocol Update",
    author: "Safety Officer",
    date: "2 days ago",
    image: "https://images.unsplash.com/photo-1584634731339-252c581abfc5?q=80&w=2000&auto=format&fit=crop",
    content: "Please review the updated hand-washing protocols. A new 5-step process has been introduced to ensure maximum safety. Check the 'Hygiene' course for details."
  },
];

// --- TODAY'S GOAL MODAL ---
function TodaysGoalModal({ visible, item, onClose, onContinue }) {
  if (!visible) return null;
  const { t } = useLanguage();

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.goalModalOverlay}>
        <BlurView intensity={95} tint="dark" style={StyleSheet.absoluteFill} />
        <Animated.View entering={FadeInDown.springify()} style={styles.goalModalContent}>
          <TouchableOpacity style={styles.closeGoalBtn} onPress={onClose}>
            <Feather name="x" size={24} color="#FFF" />
          </TouchableOpacity>

          <View style={styles.goalIconContainer}>
            <MaterialCommunityIcons name="target" size={60} color="#F59E0B" />
          </View>

          <Text style={styles.goalModalTitle}>{t('todaysGoal')}</Text>
          <Text style={styles.goalModalSub}>{item ? item.title : "Complete Unit 1"}</Text>

          <View style={styles.goalDetailsBox}>
            <View style={styles.goalDetailRow}>
              <Feather name="clock" size={18} color="#9CA3AF" />
              <Text style={styles.goalDetailText}>Est. Time: 15 mins</Text>
            </View>
            <View style={styles.goalDetailRow}>
              <Feather name="award" size={18} color="#9CA3AF" />
              <Text style={styles.goalDetailText}>Reward: +50 XP</Text>
            </View>
          </View>

          <Text style={styles.goalDesc}>
            {item ? (item.description || "Master the basics of waffle preparation.") : "Start your journey by completing the first training unit."}
          </Text>

          <TouchableOpacity style={styles.continueGoalBtn} onPress={onContinue}>
            <LinearGradient
              colors={['#F59E0B', '#D97706']}
              style={styles.continueGoalGradient}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            >
              <Text style={styles.continueGoalText}>Continue Learning</Text>
              <Feather name="arrow-right" size={20} color="#FFF" />
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

function DailyFocus({ item, onPress }) {
  const { t } = useLanguage();

  // Use first item or fallback if empty
  const goalTitle = item ? item.title : "Complete Unit 1";
  const goalSub = item ? (item.description || "Training Module") : "Introduction";

  return (
    <Animated.View entering={FadeInDown.delay(300).duration(600)} style={styles.focusContainer}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.9}>
        <LinearGradient
          colors={["#1E1B4B", "#312E81"]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.focusCard}
        >
          <MaterialCommunityIcons name="target" size={120} color="rgba(255,255,255,0.05)" style={styles.focusBgIcon} />

          <View style={styles.focusContent}>
            <View>
              <View style={styles.focusBadge}>
                <Text style={styles.focusBadgeText}>{t('todaysGoal')}</Text>
              </View>
              <Text style={styles.focusTitle} numberOfLines={2}>{goalTitle}</Text>
              <Text style={styles.focusSub} numberOfLines={1}>{goalSub}</Text>
            </View>
            <View style={styles.ringContainer}>
              <View style={styles.ringOuter}>
                <View style={styles.ringInner}>
                  <Text style={styles.ringText}>{item ? "0%" : "0%"}</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.tapHint}>
            <Text style={styles.tapHintText}>Tap to view details</Text>
            <Feather name="chevron-right" size={14} color="rgba(255,255,255,0.6)" />
          </View>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  )
}

// --- AI RECOMMENDATIONS CARD ---
function AIRecommendationsCard({ navigation }) {
  const { t } = useLanguage();

  return (
    <Animated.View entering={FadeInDown.delay(350).duration(600)} style={styles.recsContainer}>
      <TouchableOpacity
        onPress={() => navigation.navigate('Recommendations')}
        activeOpacity={0.9}
      >
        <LinearGradient
          colors={["#312E81", "#1E1B4B", "#0F172A"]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.recsCard}
        >
          {/* Decorative Icons */}
          <View style={styles.recsDecorContainer} pointerEvents="none">
            <MaterialCommunityIcons name="brain" size={80} color="rgba(99, 102, 241, 0.1)" style={{ position: 'absolute', top: -10, right: -10, transform: [{ rotate: '15deg' }] }} />
            <MaterialCommunityIcons name="lightbulb-on" size={50} color="rgba(245, 158, 11, 0.1)" style={{ position: 'absolute', bottom: 10, left: 10, transform: [{ rotate: '-10deg' }] }} />
          </View>

          <View style={styles.recsContent}>
            <View style={styles.recsLeft}>
              <View style={styles.recsBadge}>
                <MaterialCommunityIcons name="robot" size={12} color="#FFF" />
                <Text style={styles.recsBadgeText}>AI POWERED</Text>
              </View>
              <Text style={styles.recsTitle}>Smart Recommendations</Text>
              <Text style={styles.recsDesc}>Personalized courses based on your skill gaps and learning history</Text>
            </View>

            <View style={styles.recsRight}>
              <View style={styles.recsIconBg}>
                <MaterialCommunityIcons name="lightbulb-on-outline" size={28} color="#F59E0B" />
              </View>
              <View style={styles.recsArrow}>
                <Feather name="chevron-right" size={20} color="rgba(255,255,255,0.7)" />
              </View>
            </View>
          </View>

          {/* Mini Skill Indicators */}
          <View style={styles.recsSkillRow}>
            <View style={[styles.recsSkillDot, { backgroundColor: '#EF4444' }]} />
            <Text style={styles.recsSkillText}>Identify gaps</Text>
            <View style={[styles.recsSkillDot, { backgroundColor: '#F59E0B' }]} />
            <Text style={styles.recsSkillText}>Get suggestions</Text>
            <View style={[styles.recsSkillDot, { backgroundColor: '#10B981' }]} />
            <Text style={styles.recsSkillText}>Improve skills</Text>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

const AIToolsSection = memo(function AIToolsSection({ onOpenTool }) {
  const { t } = useLanguage();

  const renderTool = useCallback(({ item: tool, index }) => (
    <Animated.View entering={FadeInRight.delay(400 + index * 100)}>
      <TouchableOpacity style={styles.aiCard} onPress={() => onOpenTool(tool.id)} activeOpacity={0.9}>
        <LinearGradient colors={tool.color} style={styles.aiCardGradient}>
          <MaterialCommunityIcons name={tool.icon} size={32} color="#FFF" />
          <View style={styles.aiCardContent}>
            <Text style={styles.aiTitle}>{tool.title}</Text>
            <View style={{ height: 4 }} />
            <Text style={styles.aiDesc}>{tool.desc}</Text>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  ), [onOpenTool]);

  return (
    <View style={styles.sectionContainer}>
      <Animated.Text entering={FadeInDown.delay(300)} style={[styles.sectionTitle, { paddingHorizontal: 20 }]}>{t('aiPowerSuite')}</Animated.Text>
      <FlatList
        data={AI_TOOLS}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingLeft: 20, paddingTop: 10, paddingBottom: 20 }}
        keyExtractor={(item) => item.id}
        renderItem={renderTool}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={3}
        removeClippedSubviews={true}
      />
    </View>
  );
});

const CourseList = memo(function CourseList({ items, hasRealWatchHistory, onPlay, isLoading }) {
  const { t } = useLanguage();

  const formatResumeTime = useCallback((seconds) => {
    if (!seconds || seconds <= 0) return null;
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }, []);

  const renderCourse = useCallback(({ item, index }) => {
    const progressPct = item.progress_percent ?? 0;
    const resumeTime = formatResumeTime(item.resume_position);
    const isCompleted = item.completed || progressPct >= 100;

    return (
      <Animated.View entering={FadeInRight.delay(Math.min(index * 80, 400))}>
        <TouchableOpacity
          style={styles.courseCard}
          onPress={() => (item.videoUrl || item.video_url) && onPlay({ ...item, videoUrl: item.videoUrl || item.video_url, resumePosition: item.resume_position || 0 })}
        >
          <Image
            source={{ uri: item.thumbnail || "https://images.unsplash.com/photo-1497935586351-b67a49e012bf?q=80&w=2000" }}
            style={styles.courseImg}
          />
          <BlurView intensity={20} tint="dark" style={styles.playOverlay}>
            <Ionicons name={isCompleted ? "checkmark-circle" : "play-circle"} size={40} color={isCompleted ? "#10B981" : "rgba(255,255,255,0.9)"} />
          </BlurView>

          {resumeTime && !isCompleted && (
            <View style={styles.resumeBadge}>
              <Ionicons name="time-outline" size={10} color="#FFF" />
              <Text style={styles.resumeBadgeText}>{resumeTime}</Text>
            </View>
          )}

          <View style={[
            styles.pathTypeBadge,
            { backgroundColor: item.learning_path_type === 'self_learning' ? 'rgba(16, 185, 129, 0.9)' : 'rgba(99, 102, 241, 0.9)' }
          ]}>
            <Ionicons name={item.learning_path_type === 'self_learning' ? 'book-outline' : 'trending-up-outline'} size={10} color="#FFF" />
            <Text style={styles.pathTypeBadgeText}>
              {item.learning_path_type === 'self_learning' ? 'Self Learning' : 'Career'}
            </Text>
          </View>

          <View style={styles.courseMeta}>
            <Text style={styles.courseTitle} numberOfLines={1}>{item.title}</Text>
            <View style={styles.progressRow}>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${Math.min(100, progressPct)}%`, backgroundColor: isCompleted ? '#10B981' : '#F59E0B' }]} />
              </View>
              <Text style={styles.durationText}>{isCompleted ? '✓ Done' : `${Math.round(progressPct)}%`}</Text>
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  }, [formatResumeTime, onPlay]);

  return (
    <View style={styles.sectionContainer}>
      <View style={[styles.sectionHeader, { paddingHorizontal: 20 }]}>
        <Text style={styles.sectionTitle}>{t('jumpBackIn')}</Text>
      </View>

      {/* Skeleton while loading */}
      {isLoading && <SkeletonHorizontalList count={3} cardWidth={160} cardHeight={140} />}

      {/* Empty state */}
      {!isLoading && !hasRealWatchHistory && (
        <View style={{ paddingHorizontal: 20, paddingBottom: 20 }}>
          <View style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
            <Ionicons name="play-circle-outline" size={40} color="#4B5563" />
            <Text style={{ color: '#9CA3AF', fontSize: 14, fontFamily: 'Poppins_500Medium', marginTop: 10, textAlign: 'center' }}>Nothing here yet</Text>
            <Text style={{ color: '#6B7280', fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 4, textAlign: 'center' }}>Start watching a course and it'll appear here</Text>
          </View>
        </View>
      )}

      {/* Real watch history — virtualized */}
      {!isLoading && hasRealWatchHistory && items.length > 0 && (
        <FlatList
          data={items}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingLeft: 20, paddingBottom: 20 }}
          keyExtractor={(item, index) => String(item.id || index)}
          renderItem={renderCourse}
          initialNumToRender={3}
          maxToRenderPerBatch={3}
          windowSize={3}
          removeClippedSubviews={true}
        />
      )}
    </View>
  );
});

const NewArrivals = memo(function NewArrivals({ news = [], onOpenNews, isLoading }) {
  const { t } = useLanguage();

  const renderNews = useCallback(({ item, index }) => (
    <Animated.View entering={FadeInDown.delay(Math.min(index * 80, 400))}>
      <TouchableOpacity style={styles.newsCard} onPress={() => onOpenNews && onOpenNews(item)}>
        <Image source={{ uri: item.image }} style={styles.newsImg} />
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)']} style={styles.newsOverlay}>
          <View style={styles.newsContent}>
            <View style={styles.newsMetaRow}>
              <Text style={styles.newsAuthor}>{item.author}</Text>
              <Text style={styles.newsDate}>• {item.date}</Text>
            </View>
            <Text style={styles.newsTitle}>{item.title}</Text>
            <Text style={styles.newsBody} numberOfLines={2}>{item.content}</Text>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  ), [onOpenNews]);

  return (
    <View style={[styles.sectionContainer, { marginBottom: 100 }]}>
      <Text style={[styles.sectionTitle, { paddingHorizontal: 20, marginBottom: 15 }]}>{t('freshlyBrewed')}</Text>
      <View style={{ paddingHorizontal: 20 }}>
        {isLoading && <SkeletonList count={3} />}
        {!isLoading && news.length === 0 && (
          <View style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 30, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderStyle: 'dashed' }}>
            <MaterialCommunityIcons name="newspaper-variant-outline" size={48} color="#4B5563" />
            <Text style={{ color: '#9CA3AF', fontSize: 14, fontFamily: 'Poppins_500Medium', marginTop: 12, textAlign: 'center' }}>No news at this time</Text>
            <Text style={{ color: '#6B7280', fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 4 }}>Check back later for updates!</Text>
          </View>
        )}
        {!isLoading && news.length > 0 && (
          <FlatList
            data={news}
            keyExtractor={(item, index) => String(item.id || index)}
            renderItem={renderNews}
            scrollEnabled={false}
            initialNumToRender={3}
            maxToRenderPerBatch={3}
            windowSize={3}
          />
        )}
      </View>
    </View>
  );
});

// --- TOPIC QUIZZES DATA ---
const LIVE_QUIZZES = [
  {
    id: 'q1',
    title: 'Espresso Mastery',
    questions: [
      { question: "What is the ideal tamping pressure for espresso?", options: ["10 lbs", "30 lbs", "50 lbs", "100 lbs"], correct: 1 },
      { question: "How long should a standard espresso shot take?", options: ["10-15s", "20-30s", "40-50s", "1 min"], correct: 1 },
      { question: "Which part of the espresso is the 'crema'?", options: ["The dark bottom", "The golden foam on top", "The bitter aftertaste", "The grounds"], correct: 1 },
      { question: "What temperature should water be for brewing?", options: ["190°F - 200°F", "212°F (Boiling)", "150°F", "Cold"], correct: 0 },
      { question: "A double shot is typically how many ounces?", options: ["1 oz", "2 oz", "3 oz", "4 oz"], correct: 1 }
    ],
    time: '10 min',
    difficulty: 'Hard',
    image: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?q=80&w=600'
  },
  {
    id: 'q2',
    title: 'Waffle Crisp Science',
    questions: [
      { question: "What ingredient adds the most crispness?", options: ["Milk", "Cornstarch/Rice Flour", "Sugar", "Eggs"], correct: 1 },
      { question: "When should you flip the waffle maker?", options: ["Immediately", "After 1 min", "Never", "When it beeps"], correct: 0 },
      { question: "Why do we let batter rest?", options: ["To thicken", "To relax gluten", "To cool down", "To separate"], correct: 1 },
      { question: "What is the best way to keep waffles warm?", options: ["Stack them", "Cover with foil", "Wire rack in oven", "Microwave"], correct: 2 },
      { question: "Overmixing the batter causes what?", options: ["Fluffiness", "Toughness", "Sweetness", "Crispness"], correct: 1 }
    ],
    time: '15 min',
    difficulty: 'Medium',
    image: 'https://images.unsplash.com/photo-1568051243851-f9b136146e97?q=80&w=600'
  },
  {
    id: 'q3',
    title: 'Customer Hygiene',
    questions: [
      { question: "How long should you wash your hands?", options: ["5 seconds", "10 seconds", "20 seconds", "1 minute"], correct: 2 },
      { question: "When should you wear gloves?", options: ["Always", "Handling ready-to-eat food", "Taking cash", "Sweeping"], correct: 1 },
      { question: "What is the danger zone for food temp?", options: ["0-32°F", "40-140°F", "150-200°F", "300°F+"], correct: 1 },
      { question: "How to dry hands?", options: ["Apron", "Air dry", "Paper towel", "Shake them"], correct: 2 },
      { question: "Sanitizer water should be?", options: ["Boiling", "Lukewarm", "Freezing", "Room Temp"], correct: 1 }
    ],
    time: '20 min',
    difficulty: 'Easy',
    image: 'https://images.unsplash.com/photo-1584634731339-252c581abfc5?q=80&w=600'
  },
];

const TopicQuizzes = memo(function TopicQuizzes({ quizzes = [], onStartQuiz }) {
  const renderQuiz = useCallback(({ item: quiz, index }) => (
    <Animated.View entering={FadeInRight.delay(400 + Math.min(index * 100, 400))}>
      <TouchableOpacity style={styles.topicQuizCard} onPress={() => onStartQuiz(quiz)}>
        <Image source={{ uri: quiz.image }} style={styles.topicQuizBg} />
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.95)']} style={styles.topicQuizGradient}>

          <View style={styles.topicQuizTop}>
            <BlurView intensity={30} tint="light" style={styles.topicQuizBadge}>
              <Text style={[styles.topicQuizBadgeText, { color: quiz.difficulty === 'Hard' ? '#EF4444' : quiz.difficulty === 'Medium' ? '#F59E0B' : '#10B981' }]}>
                {quiz.difficulty}
              </Text>
            </BlurView>
          </View>

          <View>
            <Text style={styles.topicQuizTitle}>{quiz.title}</Text>
            <View style={styles.topicQuizMetaRow}>
              <View style={styles.topicQuizMetaItem}>
                <MaterialCommunityIcons name="help-circle-outline" size={14} color="#CBD5E1" />
                <Text style={styles.topicQuizMetaText}>{quiz.questions?.length || 0} Qs</Text>
              </View>
              <View style={styles.topicQuizMetaItem}>
                <MaterialCommunityIcons name="clock-outline" size={14} color="#CBD5E1" />
                <Text style={styles.topicQuizMetaText}>{quiz.time}</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.startQuizBtnSmall} onPress={() => onStartQuiz(quiz)}>
              <Text style={styles.startQuizBtnText}>Start</Text>
              <Feather name="arrow-right" size={12} color="#FFF" />
            </TouchableOpacity>
          </View>

        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  ), [onStartQuiz]);

  return (
    <View style={styles.sectionContainer}>
      <View style={[styles.sectionHeader, { paddingHorizontal: 20 }]}>
        <Text style={styles.sectionTitle}>Live Topic Quizzes</Text>
        <TouchableOpacity>
          <Text style={{ color: '#F59E0B', fontFamily: 'Poppins_600SemiBold', fontSize: 13 }}>See All</Text>
        </TouchableOpacity>
      </View>

      {quizzes.length === 0 ? (
        <View style={{ marginHorizontal: 20, marginBottom: 20, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 30, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderStyle: 'dashed' }}>
          <MaterialCommunityIcons name="head-question-outline" size={48} color="#4B5563" />
          <Text style={{ color: '#9CA3AF', fontSize: 14, fontFamily: 'Poppins_500Medium', marginTop: 12, textAlign: 'center' }}>No quizzes available</Text>
          <Text style={{ color: '#6B7280', fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 4 }}>New quizzes coming soon!</Text>
        </View>
      ) : (
        <FlatList
          data={quizzes}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderQuiz}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingLeft: 20, paddingBottom: 20 }}
          initialNumToRender={4}
          maxToRenderPerBatch={4}
          windowSize={3}
          removeClippedSubviews={true}
        />
      )}
    </View>
  );
});




/**
 * @param {object} props
 * @param {any} props.message
 * @param {string} props.type
 * @param {boolean} props.visible
 * @param {any} [props.navigation]
 * @param {string} [props.targetScreen]
 * @param {() => void} [props.onPress]
 */
function NotificationToast({ message, type, visible, navigation, targetScreen, onPress }) {

  if (!visible) return null;
  const isQuiz = type === "quiz";

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else if (navigation && targetScreen) {
      navigation.navigate(targetScreen);
    }
  };

  return (
    <Animated.View
      entering={FadeInDown.springify()}
      style={styles.toastContainer}
      pointerEvents="box-none" // ensures touches pass through properly
    >
      <BlurView intensity={80} tint="dark" style={styles.toastContent}>
        <View style={[styles.toastIcon, { backgroundColor: isQuiz ? "#F59E0B" : "#3B82F6" }]}>
          <MaterialCommunityIcons name={isQuiz ? "school" : "bell"} size={24} color="#FFF" />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.toastTitle}>{message?.title || "Notification"}</Text>
          <Text style={styles.toastMsg}>{message?.message || ""}</Text>
        </View>

        <TouchableOpacity style={styles.toastBtn} onPress={handlePress}>
          <Text style={styles.toastBtnText}>{isQuiz ? "Start Now" : "View"}</Text>
        </TouchableOpacity>
      </BlurView>
    </Animated.View>
  );
}




// MAIN LAYOUT
export default function Home() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const [activeTool, setActiveTool] = useState(null);
  const [showTwin, setShowTwin] = useState(false); // New Twin State

  // User email and profile for user-specific features
  const [userEmail, setUserEmail] = useState(null);
  const [userProfile, setUserProfile] = useState(null);

  // Get user profile from navigation params OR fallback to fetching from context
  useFocusEffect(
    React.useCallback(() => {
      const getUserEmail = async () => {
        try {
          // 0. Try Route Params (Immediate Context from Login/Switch)
          if (route.params?.userProfile) {
            const profile = route.params.userProfile;
            console.log('[Home] User profile from Route Params:', profile.email);
            setUserEmail(profile.email);
            setUserProfile(profile);
            // Ensure it is saved for next time
            await AsyncStorage.setItem('userProfile', JSON.stringify(profile));
            return;
          }

          // 1. Try AsyncStorage (Source of Truth for updates)
          const stored = await AsyncStorage.getItem('userProfile');
          if (stored) {
            const profile = JSON.parse(stored);
            console.log('[Home] User profile from AsyncStorage:', profile.email);
            setUserEmail(profile.email);
            setUserProfile(profile);
            return;
          }

          // 2. Try route params (from Login navigation - fallback)
          const parentRoute = navigation.getParent()?.getState()?.routes?.[0]?.params?.userProfile;
          if (parentRoute?.email) {
            console.log('[Home] Got email from parent route:', parentRoute.email);
            setUserEmail(parentRoute.email);
            setUserProfile(parentRoute);
            // Save to AsyncStorage for future use
            await AsyncStorage.setItem('userProfile', JSON.stringify(parentRoute));
            return;
          }

          // 3. Fallback: Fetch current user from login API session or use default
          const loginEmail = await AsyncStorage.getItem('userEmail');
          if (loginEmail) {
            console.log('[Home] User email from userEmail key:', loginEmail);
            setUserEmail(loginEmail);
            setUserProfile({ email: loginEmail, name: 'User' });
            return;
          }

          // 4. Last resort: default user for testing
          console.log('[Home] No user email found in any source, using default');
          setUserEmail('user'); // Default test user
          setUserProfile({ email: 'user', name: 'Test User' });

        } catch (e) {
          console.error('Error getting user email:', e);
          setUserEmail('user'); // Fallback to default
          setUserProfile({ email: 'user', name: 'Test User' });
        }
      };
      getUserEmail();
    }, [navigation])
  );

  return (
    <View style={{ flex: 1 }}>
      {/* 1. PREMIUM BACKGROUND */}
      <LinearGradient
        colors={['#FFFBEB', '#FEF3C7', '#FCD34D']} // Cream -> Amber Gradient
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* 2. FLOATING ACCENTS */}
      <FloatingWaffle delay={0} duration={8000} size={150} top={-20} left={-40} rotate="15deg" />
      <FloatingWaffle delay={1000} duration={9000} size={100} top={height * 0.4} left={width - 60} rotate="-10deg" />
      <FloatingWaffle delay={2000} duration={10000} size={180} top={height * 0.8} left={-50} rotate="30deg" />

      {/* TWIN OVERLAY */}
      {showTwin && (
        <View style={{ flex: 1, zIndex: 99999, backgroundColor: '#000' }}>
          <AIDigitalTwin onClose={() => setShowTwin(false)} />
        </View>
      )}

      {/* TOOL OVERLAY */}
      {activeTool && !showTwin && (
        <View style={{ flex: 1, zIndex: 9999, backgroundColor: '#FFF' }}>
          {activeTool === 'roleplay' && <SimulationHub onClose={() => setActiveTool(null)} />}
          {activeTool === 'videosim' && <InteractiveSimulationHub onClose={() => setActiveTool(null)} userProfile={userProfile} />}
          {activeTool === 'scanner' && <AIScanner onClose={() => setActiveTool(null)} />}
          {activeTool === 'flashcards' && <AIFlashcards onClose={() => setActiveTool(null)} />}
        </View>
      )}

      {!activeTool && !showTwin && (
        <Tab.Navigator
          sceneContainerStyle={{ backgroundColor: 'transparent' }} // ENSURE TRANSPARENCY
          screenOptions={({ route }) => ({
            headerShown: false,
            tabBarShowLabel: false,
            tabBarIcon: ({ color, focused }) => {
              let iconName = "home";
              let IconComp = Feather;

              if (route.name === "CoursesTab") {
                iconName = "book-open";
                IconComp = Feather;
              } else if (route.name === "ResourcesTab") {
                iconName = "grid-outline";
                IconComp = Ionicons;
              } else if (route.name === "ProfileTab") {
                iconName = "user";
                IconComp = Feather;
              }

              return (
                <View style={[styles.tabIconContainer, focused && styles.activeTabIcon]}>
                  <View style={[styles.iconWrapper, focused && styles.activeIconWrapper]}>
                    <IconComp name={iconName} size={24} color={focused ? "#FFF" : "#64748B"} />
                  </View>
                </View>
              );
            },
            tabBarStyle: [styles.tabBar, { bottom: 20 + insets.bottom, height: 75 }],
            tabBarBackground: () => (
              <BlurView intensity={50} tint="light" style={[StyleSheet.absoluteFill, { borderRadius: 40, overflow: 'hidden' }]}>
                <LinearGradient
                  colors={['rgba(255,255,255,0.8)', 'rgba(255,255,255,0.4)']}
                  style={StyleSheet.absoluteFill}
                />
              </BlurView>
            ),
          })}
        >
          <Tab.Screen name="HomeTab" children={() => <HomeContent onOpenTool={setActiveTool} onOpenTwin={() => setActiveTool('videosim')} userEmail={userEmail} userProfile={userProfile} />} />
          <Tab.Screen name="CoursesTab" children={() => <Courses userEmail={userEmail} />} />
          <Tab.Screen name="ResourcesTab" component={Resources} />
          <Tab.Screen name="ProfileTab" children={() => <Profile navigation={navigation} route={{ params: { userProfile: userProfile } }} />} />
        </Tab.Navigator>
      )}

      {!activeTool && !showTwin && <AIChatBot />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 }, // Transparent container for gradient
  decorCircle: { display: 'none' }, // Removed old decor

  // HEADER
  headerContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingBottom: 10 },
  greetingText: { fontSize: 14, fontFamily: "Poppins_400Regular", color: "#64748B" },
  nameText: { fontSize: 24, fontFamily: "Poppins_700Bold", color: "#1E293B" },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  streakPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.6)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, marginRight: 12, borderWidth: 1, borderColor: '#FFF' },
  streakText: { fontFamily: "Poppins_700Bold", color: "#D97706", marginLeft: 4 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.6)', justifyContent: 'center', alignItems: 'center', marginRight: 12, borderWidth: 1, borderColor: '#FFF' },
  dotBadage: { position: 'absolute', top: 10, right: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444', borderWidth: 1, borderColor: '#FFF' },
  profileBtn: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
  profileImage: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: '#FFF' },

  // SEARCH
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.7)', marginHorizontal: 24, paddingHorizontal: 16, height: 52, borderRadius: 16, marginBottom: 20, borderWidth: 1, borderColor: '#FFF', shadowColor: "#D97706", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10 },
  searchIcon: { marginRight: 12 },
  searchInput: { flex: 1, fontFamily: "Poppins_400Regular", fontSize: 14, color: "#1E293B" },
  micBtn: { padding: 8, backgroundColor: "rgba(255,247,237, 0.8)", borderRadius: 10 },

  // TWIN CARD
  twinContainer: { paddingHorizontal: 24, marginBottom: 24 },
  twinCard: { height: 200, borderRadius: 28, overflow: 'hidden', shadowColor: "#F59E0B", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.25, shadowRadius: 15, elevation: 10 },
  twinBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#000' },
  twinGradient: { padding: 24, paddingBottom: 20 },
  twinBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F59E0B', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginBottom: 10 },
  twinBadgeText: { color: "#FFF", fontSize: 10, fontFamily: "Poppins_700Bold", letterSpacing: 1 },
  twinTitle: { color: "#FFF", fontSize: 24, fontFamily: "Poppins_700Bold", marginBottom: 6, textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 },
  twinDesc: { color: "rgba(255,255,255,0.9)", fontSize: 13, fontFamily: "Poppins_400Regular", marginBottom: 16 },
  twinBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', alignSelf: 'flex-start', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 14 },
  twinBtnText: { fontFamily: "Poppins_700Bold", color: "#D97706", marginRight: 8, fontSize: 12 },

  // DAILY FOCUS
  focusContainer: { paddingHorizontal: 24, marginBottom: 30 },
  focusCard: { borderRadius: 28, padding: 24, overflow: 'hidden', shadowColor: "#4F46E5", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 15 },
  focusBgIcon: { position: 'absolute', right: -20, bottom: -20, opacity: 0.1 },
  focusContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  focusBadge: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start', marginBottom: 12 },
  focusBadgeText: { color: "#FFF", fontSize: 10, fontFamily: "Poppins_700Bold", letterSpacing: 1 },
  focusTitle: { color: "#FFF", fontSize: 22, fontFamily: "Poppins_700Bold", marginBottom: 4 },
  focusSub: { color: "rgba(255,255,255,0.7)", fontSize: 14, fontFamily: "Poppins_400Regular" },
  ringContainer: { justifyContent: 'center', alignItems: 'center' },
  ringOuter: { width: 64, height: 64, borderRadius: 32, borderWidth: 4, borderColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
  ringInner: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
  ringText: { color: "#FFF", fontSize: 12, fontFamily: "Poppins_700Bold" },

  // SECTIONS (AI TOOLS, FEED)
  sectionContainer: { marginBottom: 35 },
  sectionTitle: { fontSize: 18, fontFamily: "Poppins_700Bold", color: "#334155", marginBottom: 15 },

  // AI TOOLS CARDS
  aiCard: { width: 150, height: 170, marginRight: 16, borderRadius: 24, shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 6 },
  aiCardGradient: { flex: 1, borderRadius: 24, padding: 18, justifyContent: 'space-between' },
  aiCardContent: { justifyContent: 'flex-end' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  aiTitle: { color: "#FFF", fontSize: 16, fontFamily: "Poppins_700Bold", lineHeight: 22 },
  aiDesc: { color: "rgba(255,255,255,0.9)", fontSize: 11, fontFamily: "Poppins_500Medium" },

  // COURSE LIST
  courseCard: { width: 220, marginRight: 20, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.6)', overflow: 'hidden', borderWidth: 1, borderColor: '#FFF', shadowColor: "#D97706", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10 },
  courseImg: { width: '100%', height: 130 },
  playOverlay: { position: 'absolute', top: 0, left: 0, right: 0, height: 130, justifyContent: 'center', alignItems: 'center' },
  resumeBadge: { position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  resumeBadgeText: { fontSize: 9, color: '#FFF', fontFamily: 'Poppins_600SemiBold' },
  pathTypeBadge: { position: 'absolute', top: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  pathTypeBadgeText: { fontSize: 9, color: '#FFF', fontFamily: 'Poppins_600SemiBold' },
  courseMeta: { padding: 16 },
  courseTitle: { fontSize: 15, fontFamily: "Poppins_600SemiBold", color: "#1E293B", marginBottom: 10 },
  progressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressBar: { flex: 1, height: 6, backgroundColor: "rgba(0,0,0,0.05)", borderRadius: 3, marginRight: 10 },
  progressFill: { height: '100%', backgroundColor: "#F59E0B", borderRadius: 3 },
  durationText: { fontSize: 11, fontFamily: "Poppins_700Bold", color: "#D97706" },

  // NEW ARRIVALS
  listCard: { flexDirection: 'row', padding: 14, backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 20, marginBottom: 16, borderWidth: 1, borderColor: '#FFF' },
  listImg: { width: 70, height: 70, borderRadius: 16, backgroundColor: "#E2E8F0" },
  listInfo: { flex: 1, marginLeft: 16, justifyContent: 'center' },
  tagRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  newTag: { backgroundColor: "#DBEAFE", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginRight: 8 },
  newTagText: { color: "#2563EB", fontSize: 10, fontFamily: "Poppins_700Bold" },
  starRow: { flexDirection: 'row', alignItems: 'center' },
  ratingVal: { fontSize: 12, fontFamily: "Poppins_700Bold", color: "#475569", marginLeft: 4 },
  listTitle: { fontSize: 16, fontFamily: "Poppins_600SemiBold", color: "#1E293B", marginBottom: 2 },
  listAuthor: { fontSize: 12, fontFamily: "Poppins_400Regular", color: "#64748B" },
  saveBtn: { padding: 8 },

  // NAV
  tabBar: { position: "absolute", bottom: 30, left: 24, right: 24, height: 80, borderRadius: 40, backgroundColor: "transparent", borderTopWidth: 0, elevation: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.15, shadowRadius: 20 },
  tabIconContainer: { alignItems: 'center', justifyContent: 'center', top: 18 },
  activeTabIcon: { top: 12 },
  iconWrapper: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', backgroundColor: 'transparent' },
  activeIconWrapper: { backgroundColor: '#F59E0B', shadowColor: "#F59E0B", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10 },

  // FEED STYLES (Unified)
  liveCard: { width: 280, marginRight: 16, marginBottom: 5 },
  liveCardInner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#312E81', padding: 14, borderRadius: 20, shadowColor: "#312E81", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 6 },
  liveIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  liveTitle: { color: "#FFF", fontSize: 14, fontFamily: "Poppins_600SemiBold", marginBottom: 2 },
  liveAuthor: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontFamily: "Poppins_400Regular" },
  newBadge: { position: 'absolute', top: 12, right: 12, backgroundColor: '#EF4444', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  newBadgeText: { color: '#FFF', fontSize: 9, fontFamily: "Poppins_700Bold" },

  // QUIZ FEED
  quizFeedCard: { width: 280, marginRight: 16, marginBottom: 5 },
  quizFeedCardInner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#4338CA', padding: 14, borderRadius: 20, shadowColor: "#4338CA", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 6 },
  quizFeedIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  quizFeedTitle: { color: "#FFF", fontSize: 14, fontFamily: "Poppins_600SemiBold", marginBottom: 2 },
  quizFeedMeta: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontFamily: "Poppins_400Regular" },
  quizFeedBadge: { position: 'absolute', top: 12, right: 12, backgroundColor: '#F59E0B', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  quizFeedBadgeText: { color: '#FFF', fontSize: 9, fontFamily: "Poppins_700Bold" },

  // PROCTORED FEED
  proctorFeedCard: { width: 280, marginRight: 16, marginBottom: 5 },
  proctorFeedCardInner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E293B', padding: 14, borderRadius: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 6 },
  proctorFeedIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(239, 68, 68, 0.2)', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  proctorFeedTitle: { color: "#FFF", fontSize: 14, fontFamily: "Poppins_600SemiBold", marginBottom: 2 },
  proctorFeedMeta: { color: "#94A3B8", fontSize: 12, fontFamily: "Poppins_400Regular" },
  proctorFeedBadge: { position: 'absolute', top: 12, right: 12, backgroundColor: '#EF4444', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  proctorFeedBadgeText: { color: '#FFF', fontSize: 9, fontFamily: "Poppins_700Bold" },

  // [NEW] MEETING FEED STYLES
  meetingFeedCard: { width: 280, marginRight: 16, marginBottom: 5 },
  meetingFeedCardInner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#4F46E5', padding: 14, borderRadius: 20, shadowColor: "#4F46E5", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 6 },
  meetingFeedIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  meetingFeedTitle: { color: "#FFF", fontSize: 14, fontFamily: "Poppins_600SemiBold", marginBottom: 2 },
  meetingFeedMeta: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontFamily: "Poppins_400Regular" },
  meetingFeedBadge: { position: 'absolute', top: 12, right: 12, backgroundColor: '#10B981', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  meetingFeedBadgeText: { color: '#FFF', fontSize: 10, fontFamily: "Poppins_600SemiBold" },

  // NOTIFICATIONS
  overlayContainer: { position: 'absolute', top: 120, left: 0, right: 0, paddingHorizontal: 20, zIndex: 9999 },
  toastContainer: { borderRadius: 20, overflow: 'hidden', shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 15, elevation: 10 },
  toastContent: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: 'rgba(15, 23, 42, 0.9)' },
  toastIcon: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  toastTitle: { color: '#FFF', fontSize: 14, fontFamily: "Poppins_700Bold", marginBottom: 2 },
  toastMsg: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontFamily: "Poppins_400Regular" },
  toastBtn: { backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  toastBtnText: { color: '#FFF', fontSize: 12, fontFamily: "Poppins_600SemiBold" },

  // MODAL OVERLAYS
  notifModalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  notifModalContent: { height: '85%', backgroundColor: '#0F172A', borderTopLeftRadius: 36, borderTopRightRadius: 36, padding: 24, paddingTop: 30 },
  notifHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  notifHeaderTitle: { color: '#FFF', fontSize: 24, fontFamily: "Poppins_700Bold" },
  closeNotifBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
  emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 100 },
  emptyStateText: { color: 'rgba(255,255,255,0.4)', marginTop: 16, fontFamily: "Poppins_400Regular" },
  notifItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E293B', padding: 16, borderRadius: 20, marginBottom: 12 },
  notifIconBox: { width: 48, height: 48, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  notifItemTitle: { color: '#FFF', fontSize: 15, fontFamily: "Poppins_600SemiBold", marginBottom: 4 },
  notifItemMsg: { color: '#94A3B8', fontSize: 13, fontFamily: "Poppins_400Regular", marginBottom: 6 },
  notifTime: { color: 'rgba(255,255,255,0.3)', fontSize: 11, fontFamily: "Poppins_500Medium" },

  // CRUCIAL STYLES (Unchanged mostly, just refined radius)
  crucialOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  crucialClickLayer: { flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center', padding: 20 },
  crucialCard: { width: '100%', maxWidth: 350, backgroundColor: '#1E1B4B', borderRadius: 32, padding: 32, alignItems: 'center', shadowColor: "#EF4444", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.6, shadowRadius: 24, elevation: 20, borderWidth: 1, borderColor: "rgba(239,68,68,0.4)" },
  crucialIconBg: { width: 88, height: 88, borderRadius: 44, backgroundColor: 'rgba(239,68,68,0.15)', justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  crucialLabel: { color: "#EF4444", fontSize: 12, fontFamily: "Poppins_700Bold", letterSpacing: 2.5, marginBottom: 10 },
  crucialTitle: { color: "#FFF", fontSize: 24, fontFamily: "Poppins_700Bold", textAlign: 'center', marginBottom: 16 },
  crucialMsg: { color: "#CBD5E1", fontSize: 15, fontFamily: "Poppins_400Regular", textAlign: 'center', lineHeight: 26 },
  crucialDivider: { width: 60, height: 4, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: 24, borderRadius: 2 },
  crucialCheckboxRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, backgroundColor: 'rgba(0,0,0,0.2)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  crucialCheckbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#6B7280', marginRight: 12, justifyContent: 'center', alignItems: 'center' },
  crucialCheckboxChecked: { backgroundColor: '#10B981', borderColor: '#10B981' },
  crucialCheckboxText: { color: '#E5E7EB', fontSize: 14, fontFamily: "Poppins_500Medium" },
  crucialAckBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EF4444', paddingHorizontal: 24, paddingVertical: 16, borderRadius: 18, width: '100%', justifyContent: 'center' },
  crucialAckText: { color: '#FFF', fontSize: 16, fontFamily: "Poppins_600SemiBold", marginRight: 8 },
  crucialWarn: { color: "#F87171", fontSize: 13, fontFamily: "Poppins_500Medium", marginTop: 16 },

  // VIDEO MODAL
  closeVideoBtn: { position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 10, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 24 },
  interactiveContainer: { flex: 1, backgroundColor: '#0F172A', borderTopLeftRadius: 32, borderTopRightRadius: 32, marginTop: -24 },
  tabRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#334155' },
  tabBtn: { flex: 1, paddingVertical: 18, alignItems: 'center' },
  activeTabBtn: { borderBottomWidth: 2, borderBottomColor: '#F59E0B' },
  tabText: { color: '#94A3B8', fontSize: 14, fontFamily: "Poppins_600SemiBold" },
  activeTabText: { color: '#F59E0B' },
  contentArea: { flex: 1, padding: 24 },
  transcriptText: { color: '#CBD5E1', fontSize: 15, fontFamily: "Poppins_400Regular", lineHeight: 26 },

  // QUIZ UI (Dark polished)
  quizContainer: { paddingBottom: 50 },
  quizHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  quizCount: { color: '#94A3B8', fontSize: 13, fontFamily: "Poppins_600SemiBold" },
  quizProgress: { width: 120, height: 8, backgroundColor: '#334155', borderRadius: 4 },
  quizProgressBar: { height: '100%', backgroundColor: '#F59E0B', borderRadius: 4 },
  questionText: { color: '#FFF', fontSize: 20, fontFamily: "Poppins_700Bold", marginBottom: 24, lineHeight: 28 },
  optionBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E293B', padding: 20, borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: '#334155' },
  optionCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#334155', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  optionLetter: { color: '#FFF', fontSize: 14, fontFamily: "Poppins_700Bold" },
  optionText: { color: '#E2E8F0', fontSize: 15, fontFamily: "Poppins_500Medium", flex: 1 },
  resultContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  resultTitle: { color: '#FFF', fontSize: 28, fontFamily: "Poppins_700Bold", marginTop: 20, marginBottom: 10 },
  resultScore: { color: '#CBD5E1', fontSize: 18, fontFamily: "Poppins_500Medium", marginBottom: 30 },
  retryBtn: { backgroundColor: '#F59E0B', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 16 },
  retryText: { color: '#FFF', fontSize: 16, fontFamily: "Poppins_700Bold" },

  // OTHERS
  detailModalContainer: { flex: 1, backgroundColor: '#0F172A', paddingTop: 60 },
  closeDetailBtn: { position: 'absolute', top: 50, right: 20, zIndex: 10, width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20 },
  mediaContainer: { marginBottom: 24, borderRadius: 20, overflow: 'hidden', backgroundColor: '#1E293B' },
  detailTitle: { fontSize: 24, fontFamily: "Poppins_700Bold", color: '#FFF', marginBottom: 8 },
  detailTime: { fontSize: 13, fontFamily: "Poppins_500Medium", color: 'rgba(255,255,255,0.5)' },
  detailDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: 20 },
  detailMessage: { fontSize: 16, fontFamily: "Poppins_400Regular", color: '#E2E8F0', lineHeight: 26 },

  // --- GOAL MODAL STYLES ---
  goalModalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  goalModalContent: { width: '85%', backgroundColor: '#FFF', borderRadius: 24, padding: 24, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.25, shadowRadius: 20, elevation: 10 },
  closeGoalBtn: { position: 'absolute', top: 16, right: 16, zIndex: 10, backgroundColor: '#F3F4F6', borderRadius: 20, padding: 4 },
  goalIconContainer: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#FEF3C7', justifyContent: 'center', alignItems: 'center', marginBottom: 20, borderWidth: 4, borderColor: '#FFFBEB' },
  goalModalTitle: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: '#F59E0B', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  goalModalSub: { fontSize: 24, fontFamily: 'Poppins_700Bold', color: '#111827', textAlign: 'center', marginBottom: 20 },
  goalDesc: { fontSize: 14, fontFamily: 'Poppins_400Regular', color: '#6B7280', textAlign: 'center', marginBottom: 24, lineHeight: 22 },

  goalDetailsBox: { flexDirection: 'row', gap: 16, marginBottom: 24 },
  goalDetailRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  goalDetailText: { fontSize: 12, fontFamily: 'Poppins_500Medium', color: '#4B5563', marginLeft: 6 },

  continueGoalBtn: { width: '100%', shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
  continueGoalGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 16, gap: 8 },
  continueGoalText: { fontSize: 16, fontFamily: 'Poppins_600SemiBold', color: '#FFF' },

  // --- NEWS FEED STYLES ---
  newsCard: { height: 200, borderRadius: 20, overflow: 'hidden', marginBottom: 16, backgroundColor: '#FFF', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 3 },
  newsImg: { width: '100%', height: '100%' },
  newsOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '70%', justifyContent: 'flex-end', padding: 16 },
  newsContent: {},
  newsMetaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  newsAuthor: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: '#F59E0B' },
  newsDate: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: '#D1D5DB' },
  newsTitle: { fontSize: 18, fontFamily: 'Poppins_700Bold', color: '#FFF', marginBottom: 4, lineHeight: 24 },
  newsBody: { fontSize: 13, fontFamily: 'Poppins_400Regular', color: 'rgba(255,255,255,0.9)', lineHeight: 18 },

  tapHint: { flexDirection: 'row', alignItems: 'center', marginTop: 16, opacity: 0.7 },
  tapHintText: { fontSize: 12, fontFamily: 'Poppins_500Medium', color: '#FFF', marginRight: 4 },

  // --- NEWS DETAIL MODAL STYLES ---
  newsModalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center' },
  newsModalContent: { flex: 1, backgroundColor: '#0F172A', marginTop: 0 },
  newsHeroContainer: { height: 350, width: '100%', position: 'relative' },
  newsHeroImage: { width: '100%', height: '100%' },
  newsHeroGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 200 },
  closeNewsBtn: { position: 'absolute', top: 50, right: 20, zIndex: 10, borderRadius: 24, overflow: 'hidden' },
  closeNewsBlur: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  newsHeroText: { position: 'absolute', bottom: 30, left: 24, right: 24 },
  newsBadge: { backgroundColor: '#F59E0B', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start', marginBottom: 12 },
  newsBadgeText: { fontSize: 11, fontFamily: 'Poppins_700Bold', color: '#FFF', letterSpacing: 1 },
  newsHeroTitle: { fontSize: 26, fontFamily: 'Poppins_700Bold', color: '#FFF', marginBottom: 8, lineHeight: 34 },
  newsHeroMeta: { flexDirection: 'row', alignItems: 'center' },
  newsHeroAuthor: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: '#F59E0B' },
  newsHeroDate: { fontSize: 13, fontFamily: 'Poppins_400Regular', color: '#CBD5E1' },
  newsBodyContainer: { flex: 1 },
  newsBodyText: { fontSize: 16, fontFamily: 'Poppins_400Regular', color: '#CBD5E1', lineHeight: 28 },
  shareBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#334155', paddingVertical: 16, borderRadius: 16, marginTop: 40, borderWidth: 1, borderColor: '#475569' },
  shareBtnText: { fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: '#FFF' },

  // --- TOPIC QUIZZES STYLES ---
  topicQuizCard: { width: 180, height: 240, marginRight: 16, borderRadius: 24, overflow: 'hidden', backgroundColor: '#334155', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8 },
  topicQuizBg: { width: '100%', height: '100%' },
  topicQuizGradient: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'space-between', padding: 16 },
  topicQuizTop: { flexDirection: 'row', justifyContent: 'flex-end' },
  topicQuizBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.2)' },
  topicQuizBadgeText: { fontSize: 10, fontFamily: 'Poppins_700Bold' },
  topicQuizTitle: { fontSize: 16, fontFamily: 'Poppins_700Bold', color: '#FFF', marginBottom: 8, lineHeight: 22 },
  topicQuizMetaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  topicQuizMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  topicQuizMetaText: { fontSize: 11, fontFamily: 'Poppins_500Medium', color: '#CBD5E1' },
  startQuizBtnSmall: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F59E0B', paddingVertical: 8, borderRadius: 10, gap: 6 },
  startQuizBtnText: { fontSize: 12, fontFamily: 'Poppins_700Bold', color: '#FFF' },

  // --- AI RECOMMENDATIONS CARD STYLES ---
  recsContainer: { paddingHorizontal: 20, marginBottom: 20 },
  recsCard: { borderRadius: 24, padding: 20, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(99, 102, 241, 0.3)', shadowColor: '#6366F1', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 16, elevation: 8 },
  recsDecorContainer: { ...StyleSheet.absoluteFillObject },
  recsContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  recsLeft: { flex: 1, marginRight: 12 },
  recsBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(99, 102, 241, 0.3)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, alignSelf: 'flex-start', marginBottom: 10, gap: 4 },
  recsBadgeText: { fontSize: 10, fontFamily: 'Poppins_700Bold', color: '#A5B4FC', letterSpacing: 0.5 },
  recsTitle: { fontSize: 18, fontFamily: 'Poppins_700Bold', color: '#FFF', marginBottom: 6, lineHeight: 24 },
  recsDesc: { fontSize: 13, fontFamily: 'Poppins_400Regular', color: '#94A3B8', lineHeight: 19 },
  recsRight: { alignItems: 'center' },
  recsIconBg: { width: 56, height: 56, borderRadius: 18, backgroundColor: 'rgba(245, 158, 11, 0.15)', justifyContent: 'center', alignItems: 'center', marginBottom: 8, borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.3)' },
  recsArrow: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
  recsSkillRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
  recsSkillDot: { width: 8, height: 8, borderRadius: 4 },
  recsSkillText: { fontSize: 11, fontFamily: 'Poppins_500Medium', color: '#94A3B8', marginRight: 8 },
  crmTaskCard: { width: 220, marginRight: 12 },
  crmTaskCardInner: { backgroundColor: '#1E293B', borderRadius: 16, overflow: 'hidden', flexDirection: 'row' },
  crmPriorityBar: { width: 4 },
  crmTaskContent: { flex: 1, padding: 14 },
  crmTaskHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  crmTypeBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(99, 102, 241, 0.3)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, gap: 4 },
  crmTypeText: { fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: '#A5B4FC' },
  crmXpBadge: { backgroundColor: 'rgba(16, 185, 129, 0.2)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  crmXpText: { fontSize: 10, fontFamily: 'Poppins_700Bold', color: '#10B981' },
  crmTaskTitle: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: '#FFF', marginBottom: 6, lineHeight: 18 },
  crmTaskCustomer: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: '#94A3B8', marginBottom: 8 },
  crmTaskFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  crmStatusText: { fontSize: 10, fontFamily: 'Poppins_600SemiBold' },
  sectionSubtitle: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: '#94A3B8', marginTop: 2 },
});


