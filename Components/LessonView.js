import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Dimensions,
    ScrollView,
    Image,
    SafeAreaView,
    Alert,
    Modal as RNModal,
    ActivityIndicator,
    TextInput,
    Platform
} from 'react-native';
import { MaterialCommunityIcons, Feather, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, {
    FadeInDown,
    FadeInRight,
    FadeOutDown,
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    withSequence,
    Easing
} from 'react-native-reanimated';
import { Video, ResizeMode } from 'expo-av';
import { WebView } from 'react-native-webview';
import * as ScreenOrientation from 'expo-screen-orientation';
import API_URL from '../config';
import FeedbackFormModal from './FeedbackFormModal';

const { width, height } = Dimensions.get('window');

// Mid-Video Quiz Modal Component
const MidVideoQuizModal = ({ visible, quiz, onSubmit, onClose }) => {
    const [answers, setAnswers] = useState({});
    const [submitted, setSubmitted] = useState(false);
    const [result, setResult] = useState(null);

    useEffect(() => {
        if (visible) {
            setAnswers({});
            setSubmitted(false);
            setResult(null);
        }
    }, [visible]);

    const handleSelect = (questionIdx, optionIdx) => {
        if (submitted) return;
        setAnswers(prev => ({ ...prev, [questionIdx]: optionIdx }));
    };

    const handleSubmit = () => {
        if (Object.keys(answers).length < quiz.questions.length) {
            Alert.alert("Answer All Questions", "Please answer all questions before submitting.");
            return;
        }
        setSubmitted(true);
        onSubmit(Object.values(answers));
    };

    if (!visible || !quiz) return null;

    return (
        <RNModal transparent visible={visible} animationType="fade">
            <View style={midQuizStyles.overlay}>
                <BlurView intensity={80} style={StyleSheet.absoluteFill} />
                <Animated.View entering={FadeInDown.springify()} style={midQuizStyles.container}>
                    <LinearGradient colors={['#1F2937', '#111827']} style={midQuizStyles.gradient}>
                        {/* Header */}
                        <View style={midQuizStyles.header}>
                            <MaterialCommunityIcons name="brain" size={28} color="#F59E0B" />
                            <Text style={midQuizStyles.title}>Quick Check! 🎯</Text>
                        </View>
                        <Text style={midQuizStyles.subtitle}>
                            {quiz.segment
                                ? `Questions based on video ${quiz.segment}. Answer correctly to continue!`
                                : 'Answer correctly to continue watching'
                            }
                        </Text>

                        {/* Questions */}
                        <ScrollView style={midQuizStyles.questionsScroll} showsVerticalScrollIndicator={false}>
                            {quiz.questions.map((q, qIdx) => (
                                <View key={qIdx} style={midQuizStyles.questionCard}>
                                    <Text style={midQuizStyles.questionText}>
                                        {qIdx + 1}. {q.question}
                                    </Text>
                                    {q.options.map((opt, oIdx) => {
                                        const isSelected = answers[qIdx] === oIdx;
                                        const isCorrect = submitted && oIdx === q.correctIndex;
                                        const isWrong = submitted && isSelected && oIdx !== q.correctIndex;

                                        return (
                                            <TouchableOpacity
                                                key={oIdx}
                                                onPress={() => handleSelect(qIdx, oIdx)}
                                                disabled={submitted}
                                                style={[
                                                    midQuizStyles.optionBtn,
                                                    isSelected && !submitted && midQuizStyles.optionSelected,
                                                    isCorrect && midQuizStyles.optionCorrect,
                                                    isWrong && midQuizStyles.optionWrong
                                                ]}
                                            >
                                                <Text style={[
                                                    midQuizStyles.optionText,
                                                    isSelected && !submitted && { color: '#F59E0B' },
                                                    isCorrect && { color: '#10B981' },
                                                    isWrong && { color: '#EF4444' }
                                                ]}>
                                                    {opt}
                                                </Text>
                                                {submitted && isCorrect && (
                                                    <Feather name="check-circle" size={18} color="#10B981" />
                                                )}
                                                {submitted && isWrong && (
                                                    <Feather name="x-circle" size={18} color="#EF4444" />
                                                )}
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            ))}
                        </ScrollView>

                        {/* Submit/Continue Button */}
                        {!submitted ? (
                            <TouchableOpacity style={midQuizStyles.submitBtn} onPress={handleSubmit}>
                                <Text style={midQuizStyles.submitBtnText}>Submit Answers</Text>
                                <Feather name="send" size={18} color="#111827" style={{ marginLeft: 8 }} />
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity style={midQuizStyles.continueBtn} onPress={onClose}>
                                <Text style={midQuizStyles.continueBtnText}>Continue Watching</Text>
                                <Feather name="play" size={18} color="#FFF" style={{ marginLeft: 8 }} />
                            </TouchableOpacity>
                        )}
                    </LinearGradient>
                </Animated.View>
            </View>
        </RNModal>
    );
};

// Cross-platform document viewer - uses Google Docs viewer for fast PDF rendering
const CrossPlatformDocViewer = ({ uri, loadingText = "Loading...", onLoadEnd, disableDownload = true, fileType = 'pdf' }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    const handleLoad = () => {
        setLoading(false);
        if (onLoadEnd) onLoadEnd();
    };

    const handleError = () => {
        setError(true);
        setLoading(false);
    };

    // Use Google Docs viewer for ALL documents (fast, reliable, no download button)
    // This is much faster than native iframe PDF rendering
    const getViewerUrl = () => {
        // Google Docs viewer works great for PDFs and is much faster than native iframe
        // It also hides download options in embedded mode
        return `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(uri)}`;
    };

    const viewerUrl = getViewerUrl();

    // Web platform - use iframe with Google Docs viewer
    if (Platform.OS === 'web') {
        return (
            <View style={{ flex: 1, position: 'relative' }}>
                {loading && !error && (
                    <View style={docViewerStyles.loadingOverlay}>
                        <ActivityIndicator size="large" color="#F59E0B" />
                        <Text style={docViewerStyles.loadingText}>{loadingText}</Text>
                    </View>
                )}
                {error && (
                    <View style={docViewerStyles.errorOverlay}>
                        <MaterialCommunityIcons name="file-alert-outline" size={64} color="#EF4444" />
                        <Text style={docViewerStyles.errorText}>Unable to load document</Text>
                        <Text style={docViewerStyles.errorSubtext}>Please try again later</Text>
                    </View>
                )}
                <iframe
                    src={viewerUrl}
                    style={{
                        width: '100%',
                        height: '100%',
                        border: 'none',
                        backgroundColor: '#1F2937',
                        display: error ? 'none' : 'block'
                    }}
                    onLoad={handleLoad}
                    onError={handleError}
                    title="Document Viewer"
                    allow="fullscreen"
                />
            </View>
        );
    }

    // Native platforms - use WebView
    return (
        <WebView
            source={{ uri: disableDownload ? viewerUrl : uri }}
            style={StyleSheet.absoluteFill}
            startInLoadingState={true}
            renderLoading={() => (
                <View style={docViewerStyles.loadingOverlay}>
                    <ActivityIndicator size="large" color="#F59E0B" />
                    <Text style={docViewerStyles.loadingText}>{loadingText}</Text>
                </View>
            )}
            renderError={() => (
                <View style={docViewerStyles.errorOverlay}>
                    <MaterialCommunityIcons name="file-alert-outline" size={64} color="#EF4444" />
                    <Text style={docViewerStyles.errorText}>Unable to load document</Text>
                    <Text style={docViewerStyles.errorSubtext}>Please check your connection</Text>
                </View>
            )}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            allowFileAccess={false}
            allowUniversalAccessFromFileURLs={false}
            onLoadEnd={handleLoad}
            onError={handleError}
            onShouldStartLoadWithRequest={(request) => {
                // Block download attempts
                if (request.url.includes('/download') || request.url.includes('Content-Disposition')) {
                    return false;
                }
                return true;
            }}
        />
    );
};

const docViewerStyles = StyleSheet.create({
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#1F2937',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
    },
    loadingText: {
        color: '#FFF',
        marginTop: 12,
        fontFamily: 'Poppins_500Medium',
        fontSize: 14,
    },
    errorOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#1F2937',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
    },
    errorText: {
        color: '#EF4444',
        marginTop: 16,
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 16,
    },
    errorSubtext: {
        color: '#9CA3AF',
        marginTop: 8,
        fontFamily: 'Poppins_400Regular',
        fontSize: 14,
    },
});

// GOLDEN THEME Progress Component
const CompletionProgress = ({ videoPercent, quizPassed, videoRequired = 90, quizRequired = 70, hasQuiz = true }) => {
    const videoOk = videoPercent >= videoRequired;
    const displayPercent = videoOk ? 100 : Math.min(100, videoPercent);

    return (
        <View style={progressStyles.container}>
            <LinearGradient
                colors={['#1F2937', '#111827']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
            />

            {/* Video Status */}
            <View style={progressStyles.item}>
                <View style={[progressStyles.iconBg, videoOk && progressStyles.iconBgDone]}>
                    <MaterialCommunityIcons
                        name={videoOk ? "check-decagram" : "play-circle"}
                        size={20}
                        color={videoOk ? "#F59E0B" : "#9CA3AF"}
                    />
                </View>
                <View>
                    <Text style={progressStyles.label}>Video Progress</Text>
                    <Text style={[progressStyles.value, videoOk && progressStyles.valueDone]}>
                        {displayPercent}%
                    </Text>
                </View>
            </View>

            <View style={progressStyles.divider} />

            {/* Quiz Status - or Video Only indicator */}
            <View style={progressStyles.item}>
                <View style={[progressStyles.iconBg, (hasQuiz ? quizPassed : videoOk) && progressStyles.iconBgDone]}>
                    <MaterialCommunityIcons
                        name={hasQuiz ? (quizPassed ? "trophy" : "clipboard-text") : (videoOk ? "check-decagram" : "video-outline")}
                        size={20}
                        color={(hasQuiz ? quizPassed : videoOk) ? "#F59E0B" : "#9CA3AF"}
                    />
                </View>
                <View>
                    <Text style={progressStyles.label}>{hasQuiz ? 'Quiz Status' : 'Completion'}</Text>
                    <Text style={[progressStyles.value, (hasQuiz ? quizPassed : videoOk) && progressStyles.valueDone]}>
                        {hasQuiz
                            ? (quizPassed ? "Passed" : "Pending")
                            : (videoOk ? "Complete" : "Watch Video")
                        }
                    </Text>
                </View>
            </View>
        </View>
    );
};

const TabButton = ({ title, active, onPress, badge }) => (
    <TouchableOpacity onPress={onPress} style={[styles.tabBtn, active && styles.tabBtnActive]}>
        <Text style={[styles.tabBtnText, active && styles.tabBtnTextActive]}>{title}</Text>
        {badge && <View style={styles.tabBadge}><Text style={styles.tabBadgeText}>{badge}</Text></View>}
        {active && <Animated.View entering={FadeInRight.duration(200)} style={styles.activeIndicator} />}
    </TouchableOpacity>
);

export default function LessonView({ lesson, onClose, userEmail = "user", allowFastForward = false, isSelfLearning = false }) {
    const [activeTab, setActiveTab] = useState('transcript');
    const [currentQuizIdx, setCurrentQuizIdx] = useState(0);
    const [quizScore, setQuizScore] = useState(0);
    const [quizComplete, setQuizComplete] = useState(false);
    const [selectedOption, setSelectedOption] = useState(null);
    const [moduleCompleted, setModuleCompleted] = useState(false);
    const videoRef = useRef(null);

    // NEW: Robust learning path states
    const [videoProgress, setVideoProgress] = useState(0);
    const [videoDuration, setVideoDuration] = useState(0);
    const [maxPositionReached, setMaxPositionReached] = useState(0);
    // Requirements come from the server (fetched in fetchNodeProgress)
    // Initialized to null so we know if they haven't loaded yet
    const [requirements, setRequirements] = useState(null);
    const [endQuizPassed, setEndQuizPassed] = useState(false);
    const [nodeProgress, setNodeProgress] = useState(null);
    const [completionResult, setCompletionResult] = useState(null);

    // No-transcript/no-quiz detection
    // Compute locally from lesson props immediately — don't wait for server
    const hasNoTranscriptLocal = !lesson.transcript || lesson.transcript.trim().length === 0;
    const hasQuizLocal = !!(lesson.quiz && Array.isArray(lesson.quiz) && lesson.quiz.length > 0);
    const [hasQuiz, setHasQuiz] = useState(
        isSelfLearning && hasNoTranscriptLocal ? false : (hasQuizLocal || true)
    );

    // Mid-video quiz states
    const [midVideoQuizzes, setMidVideoQuizzes] = useState([]);
    const [currentMidQuiz, setCurrentMidQuiz] = useState(null);
    const [showMidQuizModal, setShowMidQuizModal] = useState(false);
    const [midQuizzesPassed, setMidQuizzesPassed] = useState([]);
    const [isVideoPlaying, setIsVideoPlaying] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    // Web: browser handles its own buffering indicator — don't show ours immediately
    const [videoBuffering, setVideoBuffering] = useState(Platform.OS !== 'web');

    // Track which mid-quiz intervals have been shown
    const shownMidQuizTimes = useRef(new Set());
    const lastProgressUpdate = useRef(0);

    // [NEW] Robust Video Tracking & Speed
    const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
    const watchedSeconds = useRef(new Set());
    // [FIX] Track highest server percent to avoid fluctuations
    const highestServerPercent = useRef(0);
    // [NEW] Track previous playing state for pause detection
    const wasPlaying = useRef(false);
    // [FIX] Track if close was already triggered to prevent double-close
    const isClosing = useRef(false);
    // [FIX] Track if progress has been synced to avoid unnecessary calls
    const lastSyncedPercent = useRef(0);
    // [FIX] Gate progress syncing until server baseline is loaded
    // Prevents regression: video fires status at position=0 before server says 18%
    const progressReady = useRef(false);

    // [NEW] Fullscreen and Orientation state
    const [isFullscreen, setIsFullscreen] = useState(false);

    const toggleSpeed = () => {
        const rates = [1.0, 1.25, 1.5];
        const nextIdx = (rates.indexOf(playbackSpeed) + 1) % rates.length;
        setPlaybackSpeed(rates[nextIdx]);
    };

    const transcriptText = lesson.transcript || lesson.desc || (hasQuiz ? "No transcript available for this lesson." : "This video does not have a transcript. Complete the video to proceed.");

    // Translation State
    const [translationLang, setTranslationLang] = useState('English');
    const [translatedText, setTranslatedText] = useState('');
    const [isTranslating, setIsTranslating] = useState(false);
    const [showLangPicker, setShowLangPicker] = useState(false);
    const [searchLang, setSearchLang] = useState('');

    // [NEW] Feedback Form State
    const [showFeedbackModal, setShowFeedbackModal] = useState(false);

    // Document navigation hint
    const [showDocumentHint, setShowDocumentHint] = useState(true);

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
                    text: transcriptText,
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

    const displayTranscript = translatedText || transcriptText;
    const filteredLanguages = LANGUAGES.filter(l => l.toLowerCase().includes(searchLang.toLowerCase()));

    // Parse Quiz Data safely
    const parseQuizData = () => {
        if (!lesson.quiz) return [];
        if (Array.isArray(lesson.quiz)) return lesson.quiz;
        if (lesson.quiz.questions && Array.isArray(lesson.quiz.questions)) return lesson.quiz.questions;
        return [];
    };

    const quizData = parseQuizData();


    // Fetch node progress and requirements on mount
    useEffect(() => {
        // Run node progress fetch immediately (needed for resume position)
        fetchNodeProgress();
        // Defer mid-video quiz fetch by 2s — video starts playing first
        const midQuizTimer = setTimeout(() => fetchMidVideoQuizzes(), 2000);

        // Auto-complete progress for non-video content (documents)
        const resourceType = lesson.resourceType || lesson.resource_type || 'Video';
        if (resourceType !== 'Video' && resourceType !== 'Audio') {
            // For documents, mark as viewed immediately
            setTimeout(() => {
                handleDocumentViewed();
            }, 2000); // Give 2 seconds for the document to load
        }

        // Single cleanup: clear the deferred quiz timer AND sync progress on unmount
        return () => {
            clearTimeout(midQuizTimer);

            // Skip if progress was never loaded or already closed via handleClose
            if (!progressReady.current) return;
            // Skip if already closed via handleClose
            if (isClosing.current) return;

            // Calculate final progress using the maximum of local and server values
            const watchedCount = watchedSeconds.current.size;
            const localPercent = videoDuration > 0
                ? Math.min(100, Math.floor((watchedCount / videoDuration) * 100))
                : 0;
            const finalPercent = Math.max(localPercent, highestServerPercent.current);

            // Only sync if we have meaningful progress
            if (finalPercent > lastSyncedPercent.current && videoDuration > 0) {
                const formData = new FormData();
                formData.append("user_email", userEmail);
                formData.append("node_id", lesson.id);
                formData.append("video_position_seconds", maxPositionReached.toString());
                formData.append("video_duration_seconds", videoDuration.toString());
                formData.append("explicit_progress_percent", finalPercent.toString());

                console.log(`[Unmount] Syncing final progress: ${finalPercent}%`);

                fetch(`${API_URL}/learning-path/track-video-progress`, {
                    method: "POST",
                    body: formData,
                    keepalive: true
                }).catch(() => { });
            }
        };
    }, [videoDuration, maxPositionReached, userEmail, lesson.id]);

    // Lock orientation to portrait by default, allow changes during fullscreen (native only)
    useEffect(() => {
        // Skip orientation lock on web - it's not supported
        if (Platform.OS === 'web') return;

        // Lock to portrait when component mounts
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);

        return () => {
            // Restore to portrait when component unmounts
            ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        };
    }, []);

    // Handle fullscreen presentation mode changes
    const handleFullscreenUpdate = async ({ fullscreenUpdate }) => {
        switch (fullscreenUpdate) {
            case 1: // FULLSCREEN_UPDATE_PLAYER_WILL_PRESENT
                // Lock to landscape when entering fullscreen (native only)
                if (Platform.OS !== 'web') {
                    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
                }
                setIsFullscreen(true);
                break;
            case 3: // FULLSCREEN_UPDATE_PLAYER_WILL_DISMISS
                // Lock back to portrait when exiting fullscreen (native only)
                if (Platform.OS !== 'web') {
                    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
                }
                setIsFullscreen(false);
                break;
        }
    };

    const handleDocumentViewed = async () => {
        // Mark document as 100% viewed since we can't track scroll/page progress
        const resourceType = lesson.resourceType || lesson.resource_type || 'Video';
        if (resourceType !== 'Video' && resourceType !== 'Audio') {
            setVideoProgress(100);
            highestServerPercent.current = 100;

            // Step 1: Save 100% progress to VideoProgress table
            try {
                const formData = new FormData();
                formData.append("user_email", userEmail);
                formData.append("node_id", lesson.id);
                formData.append("video_position_seconds", "0");
                formData.append("video_duration_seconds", "1");
                formData.append("explicit_progress_percent", "100");

                await fetch(`${API_URL}/learning-path/track-video-progress`, {
                    method: "POST",
                    body: formData
                });
            } catch (err) {
                console.log("Error updating document progress:", err);
            }

            // Step 2: Trigger completion to create CourseCompletion record
            attemptVideoOnlyCompletion();
        }
    };

    const fetchNodeProgress = async () => {
        try {
            const response = await fetch(`${API_URL}/learning-path/node-progress/${userEmail}/${lesson.id}`);
            const data = await response.json();
            if (data.progress) {
                setNodeProgress(data.progress);
                const serverPercent = data.progress.video_watched_percent || 0;
                setVideoProgress(serverPercent);
                highestServerPercent.current = serverPercent;
                lastSyncedPercent.current = serverPercent;
                setMaxPositionReached(data.progress.max_position_reached || 0);
                setEndQuizPassed(data.progress.end_quiz_passed || false);
                setMidQuizzesPassed(data.progress.mid_quizzes_completed || []);
                // Mark already passed mid-quiz times as shown
                (data.progress.mid_quizzes_completed || []).forEach(t => shownMidQuizTimes.current.add(t));

                // [FIX] Pre-populate watchedSeconds based on server progress
                // This prevents progress from jumping back when reopening
                const serverDuration = data.progress.video_duration_seconds || 0;
                if (serverDuration > 0 && serverPercent > 0) {
                    // Calculate how many seconds correspond to server percent
                    const watchedSecondsCount = Math.floor((serverPercent / 100) * serverDuration);
                    // Pre-fill the watchedSeconds Set with sequential seconds
                    // This maintains consistency when calculating local progress
                    for (let i = 0; i < watchedSecondsCount; i++) {
                        watchedSeconds.current.add(i);
                    }
                    console.log(`[Progress] Pre-populated ${watchedSecondsCount} seconds from server (${serverPercent}%)`);
                }
            }
            if (data.requirements) {
                setRequirements(data.requirements);
            }
            // Detect if this content has a quiz (from server response)
            const hasNoTranscript = !lesson.transcript || lesson.transcript.trim().length === 0;
            if (isSelfLearning && hasNoTranscript) {
                // Self-learning with no transcript → skip quiz, video-only completion
                setHasQuiz(false);
            } else if (data.has_quiz !== undefined) {
                setHasQuiz(data.has_quiz);
            } else {
                // Fallback: check lesson data directly
                const quizAvailable = lesson.quiz && Array.isArray(lesson.quiz) && lesson.quiz.length > 0;
                setHasQuiz(quizAvailable || false);
            }
        } catch (err) {
            console.log("Error fetching node progress:", err);
        } finally {
            // [FIX] CRITICAL: Mark progress as ready AFTER server baseline is loaded
            // This unblocks handleVideoPlaybackStatus from syncing progress
            progressReady.current = true;
            console.log('[Progress] Server baseline loaded, progress tracking enabled');
        }
    };

    const fetchMidVideoQuizzes = async () => {
        try {
            const response = await fetch(`${API_URL}/learning-path/mid-video-quizzes/${lesson.id}?user_email=${userEmail}`);
            const data = await response.json();
            if (data.quizzes) {
                setMidVideoQuizzes(data.quizzes);
            }
        } catch (err) {
            console.log("Error fetching mid-video quizzes:", err);
        }
    };

    // Track video progress to backend
    const trackVideoProgress = useCallback(async (position, duration, force = false, overridePercent = null) => {
        // [FIX] Don't sync until server baseline is loaded — prevents regression
        if (!progressReady.current) return;

        // Throttle updates to every 5 seconds (unless forced) to reduce render pressure
        const now = Date.now();
        if (!force && now - lastProgressUpdate.current < 5000) return;
        lastProgressUpdate.current = now;

        try {
            const formData = new FormData();
            formData.append("user_email", userEmail);
            formData.append("node_id", lesson.id);
            formData.append("video_position_seconds", position.toString());
            formData.append("video_duration_seconds", duration.toString());

            // [NEW] Send robust percentage if available
            if (overridePercent !== null) {
                formData.append("explicit_progress_percent", overridePercent.toString());
            }

            const response = await fetch(`${API_URL}/learning-path/track-video-progress`, {
                method: "POST",
                body: formData,
            });
            const result = await response.json();

            // Update local state with server's confirmed percentage
            // CRITICAL FIX: Also update highestServerPercent to prevent progress falling back
            if (result.progress?.video_watched_percent) {
                const serverPercent = result.progress.video_watched_percent;
                setVideoProgress(serverPercent);
                // Sync highest with server's value (server always returns max)
                highestServerPercent.current = Math.max(highestServerPercent.current, serverPercent);
                // [FIX] Update lastSyncedPercent to prevent redundant syncs
                lastSyncedPercent.current = Math.max(lastSyncedPercent.current, serverPercent);
            }
            return result;
        } catch (err) {
            console.log("Error tracking video progress:", err);
            return null;
        }
    }, [userEmail, lesson.id]);

    // Force sync progress before quiz submission
    const forceProgressSync = useCallback(async () => {
        if (videoDuration > 0) {
            const watchedCount = watchedSeconds.current.size;
            const robustPercent = Math.min(100, Math.floor((watchedCount / videoDuration) * 100));
            return await trackVideoProgress(maxPositionReached, videoDuration, true, robustPercent);
        }
        return null;
    }, [trackVideoProgress, maxPositionReached, videoDuration]);

    // Generate mid-video quiz at specific intervals
    const generateMidVideoQuiz = async (triggerTime) => {
        try {
            setIsLoading(true);

            // Get transcript segment for this portion
            const wordCount = transcriptText.split(' ').length;
            const segmentRatio = triggerTime / videoDuration;
            const wordEnd = Math.floor(wordCount * segmentRatio);
            const wordStart = Math.max(0, wordEnd - 100); // ~100 words before current point
            const segment = transcriptText.split(' ').slice(wordStart, wordEnd).join(' ');

            if (segment.length < 50) {
                setIsLoading(false);
                return null;
            }

            const formData = new FormData();
            formData.append("node_id", lesson.id);
            formData.append("transcript_segment", segment);
            formData.append("trigger_time_seconds", triggerTime.toString());
            formData.append("num_questions", "2");

            const response = await fetch(`${API_URL}/learning-path/generate-mid-video-quiz`, {
                method: "POST",
                body: formData,
            });
            const data = await response.json();
            setIsLoading(false);

            if (data.status === "success" || data.status === "exists") {
                return data.quiz;
            }
            return null;
        } catch (err) {
            console.log("Error generating mid-video quiz:", err);
            setIsLoading(false);
            return null;
        }
    };

    // Handle video playback status
    const handleVideoPlaybackStatus = async (status) => {
        if (!status.isLoaded) return;

        // Clear buffering spinner once video is loaded
        if (videoBuffering) setVideoBuffering(false);

        const position = status.positionMillis / 1000;
        const duration = status.durationMillis / 1000;

        setVideoDuration(duration);
        setIsVideoPlaying(status.isPlaying);

        // Update max position (prevent rewind cheating) - LEGACY CHECK
        const newMaxPosition = Math.max(maxPositionReached, position);
        setMaxPositionReached(newMaxPosition);

        // [NEW] Robust Tracking: Count unique seconds watched
        if (status.isPlaying) {
            // Add current second to set (floor to integer)
            const currentSecond = Math.floor(position);
            watchedSeconds.current.add(currentSecond);

            // [FIX] Also add nearby seconds to handle playback speed variations
            // This ensures we don't miss seconds when playing at 1.25x or 1.5x
            if (currentSecond > 0) {
                watchedSeconds.current.add(currentSecond - 1);
            }
        }

        // Calculate and update progress percentage
        // [FIX] Always calculate local progress for UI responsiveness
        // Only SYNC to server after baseline is loaded (to prevent overwriting server progress)
        if (duration > 0) {
            // ROBUST CALCULATION: Unique seconds / Total duration
            const watchedCount = watchedSeconds.current.size;
            const totalSeconds = Math.floor(duration);

            // [FIX] Cap watchedCount at totalSeconds to prevent >100%
            const effectiveWatchedCount = Math.min(watchedCount, totalSeconds);
            const currentSessionPercent = Math.min(100, Math.floor((effectiveWatchedCount / totalSeconds) * 100));

            // [FIX] Prevent fluctuation: Use maximum of server-recorded or current session
            let effectivePercent = Math.max(currentSessionPercent, highestServerPercent.current);

            // Update highest if we exceeded it
            if (effectivePercent > highestServerPercent.current) {
                highestServerPercent.current = effectivePercent;
            }

            // [FIX] Always update UI with local progress (even before server baseline loads)
            setVideoProgress(effectivePercent);

            // [SEAMLESS SYNC] Force sync on pause for immediate progress save
            // Only sync AFTER server baseline is loaded to prevent overwriting
            if (!progressReady.current) return; // Block server sync only, not UI updates

            const justPaused = wasPlaying.current && !status.isPlaying;
            wasPlaying.current = status.isPlaying;

            // [FIX] Only sync if progress increased meaningfully (on pause or significant change)
            const syncThreshold = Math.max(1, Math.floor((requirements?.video_watch_percent || 90) * 0.02));
            const shouldSync = justPaused || (effectivePercent - lastSyncedPercent.current >= syncThreshold);

            if (shouldSync && effectivePercent > lastSyncedPercent.current) {
                lastSyncedPercent.current = effectivePercent;
                trackVideoProgress(position, duration, true, effectivePercent);
            }
        }

        // Fixed checkpoints at 33% and 66% of video duration
        // Skip mid-video quizzes entirely if no transcript/quiz exists
        if (!hasQuiz) {
            // No transcript → no mid-video quizzes, just track video progress
            if (status.didJustFinish) {
                // [FIX] Force sync before attempting completion
                const watchedCount = watchedSeconds.current.size;
                const totalSeconds = Math.floor(duration);
                const finalPercent = Math.min(100, Math.floor((watchedCount / totalSeconds) * 100));
                // Use the actual server requirement — do NOT hardcode a floor
                const videoRequiredPercent = requirements?.video_watch_percent || 90;
                const effectivePercent = Math.max(finalPercent, highestServerPercent.current);

                console.log(`Video finished (no quiz). Progress: local=${finalPercent}%, effective=${effectivePercent}%, required=${videoRequiredPercent}%`);

                // Update local state first
                highestServerPercent.current = effectivePercent;
                setVideoProgress(effectivePercent);

                // Force sync then attempt completion
                trackVideoProgress(duration, duration, true, effectivePercent).then(() => {
                    if (effectivePercent >= videoRequiredPercent) {
                        console.log(`Attempting video-only completion (${effectivePercent}% >= ${videoRequiredPercent}%)...`);
                        attemptVideoOnlyCompletion();
                    }
                });
            }
            return;
        }

        const checkpoint33 = Math.floor(duration * 0.33);
        const checkpoint66 = Math.floor(duration * 0.66);
        const checkpoints = [checkpoint33, checkpoint66];

        for (const checkpoint of checkpoints) {
            // Check if we just passed this checkpoint and haven't shown quiz yet
            if (
                position >= checkpoint &&
                position < checkpoint + 3 && // Within 3 second window
                !shownMidQuizTimes.current.has(checkpoint) &&
                !midQuizzesPassed.includes(checkpoint)
            ) {
                shownMidQuizTimes.current.add(checkpoint);

                // Pause video
                if (videoRef.current) {
                    await videoRef.current.pauseAsync();
                }

                // Determine which segment this checkpoint covers
                const isFirstCheckpoint = checkpoint === checkpoint33;
                const segmentLabel = isFirstCheckpoint ? "0-33%" : "33-66%";

                // Check if quiz exists locally first (pre-fetched from database)
                // Use 15 second tolerance to match backend caching
                let quiz = midVideoQuizzes.find(q => Math.abs(q.trigger_time_seconds - checkpoint) < 15);
                if (!quiz) {
                    // Quiz not in local cache - backend will check database FIRST before generating
                    quiz = await generateMidVideoQuiz(checkpoint);
                }

                if (quiz) {
                    setCurrentMidQuiz({ ...quiz, trigger_time: checkpoint, segment: segmentLabel });
                    setShowMidQuizModal(true);
                } else {
                    // Resume if no quiz generated
                    if (videoRef.current) {
                        await videoRef.current.playAsync();
                    }
                }
                break;
            }
        }

        // Check if video finished (only reached when hasQuiz is true)
        if (status.didJustFinish) {
            // [FIX] Force sync progress when video finishes to ensure 100% is saved
            const watchedCount = watchedSeconds.current.size;
            const totalSeconds = Math.floor(duration);
            const finalPercent = Math.min(100, Math.floor((watchedCount / totalSeconds) * 100));
            // Use the actual server requirement — do NOT hardcode a floor
            const effectivePercent = Math.max(finalPercent, highestServerPercent.current);

            console.log(`Video finished. Syncing progress: local=${finalPercent}%, effective=${effectivePercent}%`);

            // Force immediate sync
            highestServerPercent.current = effectivePercent;
            lastSyncedPercent.current = effectivePercent;
            setVideoProgress(effectivePercent);

            // Sync to server immediately
            trackVideoProgress(duration, duration, true, effectivePercent);

            // [FIX] Trigger feedback if enabled and video is complete
            if (effectivePercent >= videoRequiredPercent && lesson.enable_feedback) {
                console.log("Video complete with feedback enabled, triggering modal...");
                setTimeout(() => setShowFeedbackModal(true), 1500);
            }
        }
    };

    // Attempt to complete a node based on video progress alone (no quiz required)
    const attemptVideoOnlyCompletion = async () => {
        try {
            const formData = new FormData();
            formData.append("user_email", userEmail);
            formData.append("node_id", lesson.id);

            const response = await fetch(`${API_URL}/learning-path/complete-video-only`, {
                method: "POST",
                body: formData,
            });
            const result = await response.json();

            if (result.status === "success" && result.result?.is_complete) {
                setEndQuizPassed(true);
                setModuleCompleted(true);
                setCompletionResult(result.result);
                // [FIX] Trigger feedback if enabled
                if (lesson.enable_feedback) {
                    setTimeout(() => setShowFeedbackModal(true), 500);
                }
                await trackModuleCompletion();
            } else if (result.status === "error") {
                console.log("Video-only completion not yet ready:", result.message);
            }
        } catch (err) {
            console.error("Error in video-only completion:", err);
        }
    };

    // Handle mid-video quiz submission
    const handleMidQuizSubmit = async (answers) => {
        try {
            const formData = new FormData();
            formData.append("user_email", userEmail);
            formData.append("node_id", lesson.id);
            formData.append("quiz_id", currentMidQuiz.quiz_id);
            formData.append("trigger_time_seconds", currentMidQuiz.trigger_time.toString());
            formData.append("answers", JSON.stringify(answers));

            const response = await fetch(`${API_URL}/learning-path/submit-mid-video-quiz`, {
                method: "POST",
                body: formData,
            });
            const data = await response.json();

            if (data.result?.passed) {
                setMidQuizzesPassed(prev => [...prev, currentMidQuiz.trigger_time]);
            } else {
                Alert.alert(
                    "Keep Trying!",
                    `You scored ${data.result.correct}/${data.result.total}. You need 60% to continue.`,
                    [{ text: "OK" }]
                );
            }

            return data.result;
        } catch (err) {
            console.log("Error submitting mid-quiz:", err);
            return null;
        }
    };

    const handleMidQuizClose = async () => {
        setShowMidQuizModal(false);
        setCurrentMidQuiz(null);

        // Resume video
        if (videoRef.current) {
            await videoRef.current.playAsync();
        }
    };

    // Track end quiz completion

    const trackQuizCompletion = async (finalScore, totalQuestions) => {
        try {
            // IMPORTANT: Force sync video progress before submitting quiz
            // This ensures the server has the latest watch percentage
            await forceProgressSync();

            // Submit to new endpoint
            const formData = new FormData();
            formData.append("user_email", userEmail);
            formData.append("node_id", lesson.id);
            formData.append("score", finalScore.toString());
            formData.append("total", totalQuestions.toString());

            const response = await fetch(`${API_URL}/learning-path/submit-end-quiz`, {
                method: "POST",
                body: formData,
            });
            const result = await response.json();

            if (result.result) {
                setEndQuizPassed(result.result.passed);

                if (result.result.is_complete) {
                    // Course fully completed!
                    setModuleCompleted(true);
                    setCompletionResult(result.result);

                    // Also track to legacy endpoint for XP
                    await trackModuleCompletion();

                    // [FIX] Trigger feedback if enabled
                    if (lesson.enable_feedback) {
                        setTimeout(() => setShowFeedbackModal(true), 1200);
                    }
                } else if (!result.result.passed) {
                    Alert.alert(
                        "Quiz Not Passed",
                        `You scored ${finalScore}/${totalQuestions} (${result.result.score_percent.toFixed(0)}%). You need ${requirements?.quiz_pass_percent ?? 70}% to pass.`,
                        [{
                            text: "Try Again", onPress: () => {
                                setQuizComplete(false);
                                setCurrentQuizIdx(0);
                                setQuizScore(0);
                                setSelectedOption(null);
                            }
                        }]
                    );
                } else if (!result.result.video_complete) {
                    // Use server-returned video progress not local state
                    const serverVideoPercent = result.result.current_video_percent || videoProgress;
                    Alert.alert(
                        "Watch More Video",
                        `You passed the quiz! But you need to watch at least ${requirements?.video_watch_percent ?? 90}% of the video. Current: ${serverVideoPercent}%`,
                        [{ text: "OK" }]
                    );
                } else if (result.result.mid_quiz_ok === false) {
                    Alert.alert("Mid-Video Quizzes", "Please complete all mid-video quizzes to proceed.");
                } else if (!result.result.is_complete) {
                    Alert.alert("Course Incomplete", "You have not met all requirements to complete this course.");
                }
            }

            return result;
        } catch (err) {
            console.error("Error tracking quiz:", err);
        }
    };

    // Attempt to assign a CRM task after course completion
    const attemptCrmTaskAssignment = async (categoryId) => {
        try {
            const formData = new FormData();
            formData.append("user_email", userEmail);
            formData.append("user_name", "User");
            formData.append("category_id", categoryId || lesson.bucket || "1");

            const response = await fetch(`${API_URL}/api/v1/crm/assign-task`, {
                method: "POST",
                body: formData,
            });
            const result = await response.json();
            if (result.status === 'success') {
                console.log("CRM Task assigned after completion:", result.assignment?.id);
            }
        } catch (err) {
            console.log("CRM assignment check failed:", err);
        }
    };

    const trackModuleCompletion = async () => {
        if (moduleCompleted) return null;
        try {
            const formData = new FormData();
            formData.append("user_email", userEmail);
            formData.append("course_id", lesson.id || "unknown");
            formData.append("course_title", lesson.title || "Unknown Module");
            formData.append("bucket", lesson.bucket || "general");
            formData.append("xp_earned", (lesson.xp || 50).toString());

            const response = await fetch(`${API_URL}/recommendations/track-completion`, {
                method: "POST",
                body: formData,
            });
            const result = await response.json();
            setModuleCompleted(true);
            setCompletionResult(result);

            attemptCrmTaskAssignment(lesson.bucket);

            return result;
        } catch (err) {
            console.error("Error tracking module:", err);
            return null;
        }
    };

    // [AUTO RECOVERY] Check if course should be completed
    useEffect(() => {
        if (nodeProgress && requirements && !moduleCompleted) {
            const videoOk = (nodeProgress.video_watched_percent || 0) >= requirements.video_watch_percent;

            if (!hasQuiz) {
                // No quiz required → complete based on video progress alone
                if (videoOk) {
                    console.log("Auto-completing course (no quiz, video complete)...");
                    attemptVideoOnlyCompletion();
                }
                return;
            }

            const quizOk = nodeProgress.end_quiz_passed;

            let midOk = true;
            if (requirements.mid_quiz_required) {
                const total = nodeProgress.mid_quizzes_total || 0;
                if (total > 0) {
                    const passed = nodeProgress.mid_quizzes_passed || 0;
                    midOk = (passed / total * 100) >= requirements.mid_quiz_pass_percent;
                }
            }

            if (videoOk && quizOk && midOk) {
                console.log("Auto-completing course based on progress...");
                trackModuleCompletion();
            }
        }
    }, [nodeProgress, requirements, moduleCompleted, hasQuiz]);

    const handleClose = useCallback(() => {
        // [FIX] Prevent double-close which could cause issues
        if (isClosing.current) {
            console.log("[Close] Already closing, ignoring duplicate call");
            return;
        }
        isClosing.current = true;

        // Calculate final progress
        const watchedCount = watchedSeconds.current.size;
        const robustPercent = videoDuration > 0
            ? Math.min(100, Math.floor((watchedCount / videoDuration) * 100))
            : highestServerPercent.current;

        // Use the maximum of local calculation and server-stored value
        const finalPercent = Math.max(robustPercent, highestServerPercent.current);

        console.log(`[Close] Final progress: local=${robustPercent}%, server=${highestServerPercent.current}%, final=${finalPercent}%`);

        // [FIX] Fire-and-forget sync - don't await, close immediately
        // This ensures the back button always works even if network is slow
        if (videoDuration > 0 && finalPercent > lastSyncedPercent.current) {
            const formData = new FormData();
            formData.append("user_email", userEmail);
            formData.append("node_id", lesson.id);
            formData.append("video_position_seconds", maxPositionReached.toString());
            formData.append("video_duration_seconds", videoDuration.toString());
            formData.append("explicit_progress_percent", finalPercent.toString());

            // Use fetch with keepalive for reliable background sync
            fetch(`${API_URL}/learning-path/track-video-progress`, {
                method: "POST",
                body: formData,
                keepalive: true // Ensures request completes even after navigation
            }).then(res => res.json()).then(result => {
                console.log("[Close] Progress synced successfully:", result?.progress?.video_watched_percent);
            }).catch(err => {
                console.log("[Close] Progress sync error (non-blocking):", err);
            });
        }

        // Close immediately - don't wait for network
        onClose(completionResult);
    }, [videoDuration, maxPositionReached, userEmail, lesson.id, completionResult, onClose]);

    const handleOptionSelect = (idx) => {
        if (!quizData[currentQuizIdx]) return;
        setSelectedOption(idx);

        const isCorrect = idx === quizData[currentQuizIdx]?.correctIndex;
        const newScore = isCorrect ? quizScore + 1 : quizScore;

        setTimeout(() => {
            if (isCorrect) {
                setQuizScore(prev => prev + 1);
            }
            if (currentQuizIdx < quizData.length - 1) {
                setCurrentQuizIdx(prev => prev + 1);
                setSelectedOption(null);
            } else {
                setQuizComplete(true);
                const finalScore = isCorrect ? quizScore + 1 : quizScore;
                trackQuizCompletion(finalScore, quizData.length);
            }
        }, 800);
    };

    // Determine if content is a document (not video/audio)
    const handleFeedbackClose = () => {
        setShowFeedbackModal(false);
    };

    const isDocumentType = () => {
        const resourceType = lesson.resourceType || lesson.resource_type || 'Video';
        return resourceType !== 'Video' && resourceType !== 'Audio';
    };

    // Render content viewer based on resource type
    const renderContentViewer = () => {
        const resourceType = lesson.resourceType || lesson.resource_type || 'Video';

        // Check for PDF version first (converted from PPT/DOCX for security)
        const pdfUrl = lesson.pdfUrl || lesson.pdf_url;
        const originalUrl = lesson.videoUrl || lesson.video_url || lesson.fileUrl || lesson.file_url;

        // Use PDF version if available for documents/presentations, otherwise use original
        const contentUrl = pdfUrl || originalUrl;

        // Video or Audio content
        if (resourceType === 'Video' || resourceType === 'Audio') {
            if (contentUrl) {
                return (
                    <>
                        <Video
                            ref={videoRef}
                            style={{ width: '100%', height: '100%' }}
                            source={{
                                uri: contentUrl,
                                // Hint to expo-av/browser: stream progressively, don't wait for full download
                                headers: Platform.OS === 'web' ? {} : { 'Cache-Control': 'no-transform' },
                            }}
                            useNativeControls
                            resizeMode={ResizeMode.CONTAIN}
                            isLooping={false}
                            shouldPlay={true}
                            rate={playbackSpeed}
                            progressUpdateIntervalMillis={500}
                            onPlaybackStatusUpdate={handleVideoPlaybackStatus}
                            onFullscreenUpdate={handleFullscreenUpdate}
                            onReadyForDisplay={() => setVideoBuffering(false)}
                        />

                        {/* Video buffering overlay */}
                        {videoBuffering && (
                            <View style={{
                                ...StyleSheet.absoluteFillObject,
                                backgroundColor: '#0F172A',
                                justifyContent: 'center',
                                alignItems: 'center',
                                zIndex: 5,
                            }}>
                                <ActivityIndicator size="large" color="#F59E0B" />
                                <Text style={{ color: '#94A3B8', fontSize: 13, marginTop: 10, fontFamily: 'Poppins_400Regular' }}>
                                    Loading video...
                                </Text>
                            </View>
                        )}

                        {/* Speed Control Overlay — only shown when admin has enabled fast-forward */}
                        {allowFastForward && (
                            <TouchableOpacity
                                onPress={toggleSpeed}
                                style={{
                                    position: 'absolute',
                                    top: 10,
                                    right: 10,
                                    backgroundColor: 'rgba(0,0,0,0.6)',
                                    paddingHorizontal: 10,
                                    paddingVertical: 5,
                                    borderRadius: 15,
                                    borderWidth: 1,
                                    borderColor: 'rgba(255,255,255,0.2)',
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    zIndex: 10
                                }}
                            >
                                <Feather name="fast-forward" size={12} color="#FBBF24" style={{ marginRight: 4 }} />
                                <Text style={{ color: '#FFF', fontFamily: 'Poppins_600SemiBold', fontSize: 12 }}>
                                    {playbackSpeed.toFixed(1)}x
                                </Text>
                            </TouchableOpacity>
                        )}

                        {/* Fullscreen / Landscape Button */}
                        {Platform.OS !== 'web' && (
                            <TouchableOpacity
                                onPress={async () => {
                                    if (videoRef.current) {
                                        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
                                        await videoRef.current.presentFullscreenPlayer();
                                    }
                                }}
                                style={{
                                    position: 'absolute',
                                    bottom: 10,
                                    right: 10,
                                    backgroundColor: 'rgba(0,0,0,0.55)',
                                    width: 34,
                                    height: 34,
                                    borderRadius: 8,
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    zIndex: 10,
                                    borderWidth: 1,
                                    borderColor: 'rgba(255,255,255,0.15)',
                                }}
                            >
                                <MaterialCommunityIcons name="fullscreen" size={20} color="#FFF" />
                            </TouchableOpacity>
                        )}
                    </>
                );
            } else {
                return (
                    <LinearGradient colors={['#374151', '#1F2937']} style={styles.videoPlaceholder}>
                        <MaterialCommunityIcons name="video-off-outline" size={64} color="rgba(255,255,255,0.5)" />
                        <Text style={styles.videoDuration}>No Video Source</Text>
                    </LinearGradient>
                );
            }
        }

        // PDF content
        if (resourceType === 'PDF') {
            if (contentUrl) {
                // Direct Cloudflare URL - PDFs embedded with toolbar disabled
                return (
                    <>
                        <CrossPlatformDocViewer
                            uri={contentUrl}
                            fileType="pdf"
                            loadingText="Loading PDF..."
                            onLoadEnd={() => {
                                setShowDocumentHint(true);
                                setTimeout(() => setShowDocumentHint(false), 4000);
                            }}
                        />
                        {/* Navigation Hint Overlay */}
                        {showDocumentHint && (
                            <View style={styles.documentHintOverlay}>
                                <View style={styles.documentHintBox}>
                                    <MaterialCommunityIcons name="gesture-swipe-horizontal" size={24} color="#F59E0B" />
                                    <Text style={styles.documentHintText}>
                                        Swipe or scroll to navigate pages
                                    </Text>
                                </View>
                            </View>
                        )}
                    </>
                );
            } else {
                return (
                    <LinearGradient colors={['#374151', '#1F2937']} style={styles.videoPlaceholder}>
                        <MaterialCommunityIcons name="file-pdf-box" size={64} color="rgba(255,255,255,0.5)" />
                        <Text style={styles.videoDuration}>No PDF Source</Text>
                    </LinearGradient>
                );
            }
        }

        // Presentation (PPT, PPTX) content
        if (resourceType === 'Presentation') {
            if (contentUrl) {
                // If PDF version available: Direct Cloudflare viewing (fast, secure)
                // Otherwise: Google Viewer (fallback for unconverted files)
                const viewerFileType = pdfUrl ? 'pdf' : 'presentation';
                return (
                    <>
                        <CrossPlatformDocViewer
                            uri={contentUrl}
                            fileType={viewerFileType}
                            loadingText="Loading Presentation..."
                            onLoadEnd={() => {
                                setShowDocumentHint(true);
                                setTimeout(() => setShowDocumentHint(false), 4000);
                            }}
                        />
                        {/* Navigation Hint Overlay */}
                        {showDocumentHint && (
                            <View style={styles.documentHintOverlay}>
                                <View style={styles.documentHintBox}>
                                    <MaterialCommunityIcons name="gesture-swipe-horizontal" size={24} color="#F59E0B" />
                                    <Text style={styles.documentHintText}>
                                        Swipe or scroll to navigate slides
                                    </Text>
                                </View>
                            </View>
                        )}
                    </>
                );
            } else {
                return (
                    <LinearGradient colors={['#374151', '#1F2937']} style={styles.videoPlaceholder}>
                        <MaterialCommunityIcons name="file-powerpoint" size={64} color="rgba(255,255,255,0.5)" />
                        <Text style={styles.videoDuration}>No Presentation Source</Text>
                    </LinearGradient>
                );
            }
        }

        // Document (Word, DOCX) content
        if (resourceType === 'Document') {
            if (contentUrl) {
                // If PDF version available: Direct Cloudflare viewing (fast, secure)
                // Otherwise: Google Viewer (fallback for unconverted files)
                const viewerFileType = pdfUrl ? 'pdf' : 'document';
                return (
                    <>
                        <CrossPlatformDocViewer
                            uri={contentUrl}
                            fileType={viewerFileType}
                            loadingText="Loading Document..."
                            onLoadEnd={() => {
                                setShowDocumentHint(true);
                                setTimeout(() => setShowDocumentHint(false), 4000);
                            }}
                        />
                        {/* Navigation Hint Overlay */}
                        {showDocumentHint && (
                            <View style={styles.documentHintOverlay}>
                                <View style={styles.documentHintBox}>
                                    <MaterialCommunityIcons name="gesture-swipe-horizontal" size={24} color="#F59E0B" />
                                    <Text style={styles.documentHintText}>
                                        Swipe or scroll to navigate pages
                                    </Text>
                                </View>
                            </View>
                        )}
                    </>
                );
            } else {
                return (
                    <LinearGradient colors={['#374151', '#1F2937']} style={styles.videoPlaceholder}>
                        <MaterialCommunityIcons name="file-word" size={64} color="rgba(255,255,255,0.5)" />
                        <Text style={styles.videoDuration}>No Document Source</Text>
                    </LinearGradient>
                );
            }
        }

        // Other/Unknown content types - use generic document viewer
        if (contentUrl) {
            return (
                <CrossPlatformDocViewer
                    uri={contentUrl}
                    fileType="other"
                    loadingText="Loading Content..."
                />
            );
        } else {
            return (
                <LinearGradient colors={['#374151', '#1F2937']} style={styles.videoPlaceholder}>
                    <MaterialCommunityIcons name="file-document-outline" size={64} color="rgba(255,255,255,0.5)" />
                    <Text style={styles.videoDuration}>No Content Source</Text>
                </LinearGradient>
            );
        }
    };

    const reqVideoPercent = requirements?.video_watch_percent ?? 90;
    const reqQuizPercent = requirements?.quiz_pass_percent ?? 70;

    const canComplete = hasQuiz
        ? (videoProgress >= reqVideoPercent && endQuizPassed)
        : (videoProgress >= reqVideoPercent);

    return (
        <RNModal visible={true} animationType="slide" onRequestClose={handleClose} presentationStyle="fullScreen">
            <View style={styles.container}>
                <LinearGradient colors={['#1F2937', '#111827']} style={StyleSheet.absoluteFill} pointerEvents="none" />

                <SafeAreaView style={{ flex: 1 }}>
                    {/* HEADER */}
                    <View style={styles.header}>
                        <TouchableOpacity
                            onPress={handleClose}
                            style={styles.closeBtn}
                            activeOpacity={0.7}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            <Feather name="chevron-down" size={24} color="#FFF" />
                        </TouchableOpacity>
                        <View style={{ flex: 1, alignItems: 'center' }}>
                            <Text style={styles.headerTitle}>{lesson.title?.toUpperCase() || "LESSON"}</Text>
                            <Text style={styles.headerSubtitle}>Pro Training</Text>
                        </View>
                        <TouchableOpacity style={styles.menuBtn}>
                            <Feather name="more-horizontal" size={24} color="#FFF" />
                        </TouchableOpacity>
                    </View>

                    {/* COMPLETION PROGRESS */}
                    <CompletionProgress
                        videoPercent={videoProgress}
                        quizPassed={endQuizPassed}
                        videoRequired={reqVideoPercent}
                        quizRequired={reqQuizPercent}
                        hasQuiz={hasQuiz}
                    />

                    {/* CONTENT VIEWER (Video, PDF, Documents) */}
                    <View style={isDocumentType() ? styles.documentContainer : styles.videoContainer}>
                        {isLoading && (
                            <View style={styles.loadingOverlay}>
                                <ActivityIndicator size="large" color="#F59E0B" />
                                <Text style={styles.loadingText}>Generating quiz...</Text>
                            </View>
                        )}
                        {renderContentViewer()}
                    </View>

                    {/* TABS */}
                    <View style={styles.tabBar}>
                        <TabButton
                            title="Transcript"
                            active={activeTab === 'transcript'}
                            onPress={() => setActiveTab('transcript')}
                        />
                        {hasQuiz && (
                            <TabButton
                                title="Quiz"
                                active={activeTab === 'quiz'}
                                onPress={() => setActiveTab('quiz')}
                                badge={!endQuizPassed && quizData.length > 0 ? "!" : null}
                            />
                        )}
                        <TabButton
                            title="Resources"
                            active={activeTab === 'resources'}
                            onPress={() => setActiveTab('resources')}
                        />
                    </View>

                    {/* CONTENT AREA */}
                    <View style={styles.contentArea}>
                        {/* TRANSCRIPT VIEW */}
                        {/* TRANSCRIPT VIEW with Translation */}
                        {activeTab === 'transcript' && (
                            <View style={{ flex: 1 }}>
                                {/* Language Selector Bar */}
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, marginBottom: 8 }}>
                                    <Text style={{ color: '#9CA3AF', fontSize: 13, fontFamily: 'Poppins_500Medium' }}>Language</Text>
                                    <TouchableOpacity
                                        style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#374151', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 }}
                                        onPress={() => { setSearchLang(''); setShowLangPicker(true); }}
                                    >
                                        <MaterialCommunityIcons name="translate" size={16} color="#A5B4FC" style={{ marginRight: 6 }} />
                                        <Text style={{ color: '#E5E7EB', fontSize: 13, fontFamily: 'Poppins_500Medium' }}>{translationLang}</Text>
                                        <Feather name="chevron-down" size={14} color="#9CA3AF" style={{ marginLeft: 4 }} />
                                    </TouchableOpacity>
                                </View>

                                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20 }}>
                                    {isTranslating ? (
                                        <View style={{ padding: 40, alignItems: 'center' }}>
                                            <ActivityIndicator size="small" color="#F59E0B" />
                                            <Text style={{ color: '#6B7280', fontSize: 12, marginTop: 10, fontFamily: 'Poppins_400Regular' }}>Translating transcript...</Text>
                                        </View>
                                    ) : (
                                        <Animated.Text entering={FadeInDown.delay(100)} style={[styles.transcriptText, { color: '#E5E7EB', minHeight: 100 }]}>
                                            {displayTranscript && displayTranscript.length > 0 ? displayTranscript : "No transcript content available."}
                                        </Animated.Text>
                                    )}
                                </ScrollView>

                                {/* LANGUAGE PICKER MODAL */}
                                <RNModal visible={showLangPicker} transparent animationType="fade">
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
                                                        <Text style={{ color: lang === translationLang ? '#A5B4FC' : '#D1D5DB', fontFamily: 'Poppins_400Regular', fontSize: 15 }}>{lang}</Text>
                                                        {lang === translationLang && <Feather name="check" size={16} color="#A5B4FC" />}
                                                    </TouchableOpacity>
                                                ))}
                                                {filteredLanguages.length === 0 && (
                                                    <Text style={{ color: '#6B7280', textAlign: 'center', marginTop: 20, paddingBottom: 20 }}>No languages found</Text>
                                                )}
                                            </ScrollView>
                                        </View>
                                    </View>
                                </RNModal>
                            </View>
                        )}

                        {/* QUIZ VIEW */}
                        {activeTab === 'quiz' && (
                            <View style={styles.quizContainer}>
                                {quizData.length === 0 ? (
                                    <View style={styles.quizResult}>
                                        <MaterialCommunityIcons name="clipboard-text-outline" size={64} color="#6B7280" />
                                        <Text style={styles.resultTitle}>No Quiz Available</Text>
                                        <Text style={styles.resultScore}>This lesson doesn't have a quiz yet.</Text>
                                    </View>
                                ) : !quizComplete ? (
                                    <Animated.View entering={FadeInRight} key={currentQuizIdx} style={{ flex: 1 }}>
                                        <ScrollView
                                            showsVerticalScrollIndicator={false}
                                            contentContainerStyle={{ paddingBottom: 100 }}
                                        >
                                            {/* Requirements Notice */}
                                            {videoProgress < reqVideoPercent && (
                                                <View style={styles.warningBanner}>
                                                    <MaterialCommunityIcons name="alert-circle" size={18} color="#F59E0B" />
                                                    <Text style={styles.warningText}>
                                                        {(lesson.resourceType === 'Video' || lesson.resource_type === 'Video' || lesson.resourceType === 'Audio' || lesson.resource_type === 'Audio')
                                                            ? `Watch at least ${reqVideoPercent}% of the content to complete (Current: ${videoProgress}%)`
                                                            : `View the document and complete the quiz to proceed`
                                                        }
                                                    </Text>
                                                </View>
                                            )}

                                            <View style={styles.questionCounter}>
                                                <Text style={styles.counterText}>Question {currentQuizIdx + 1}/{quizData.length}</Text>
                                                <Text style={styles.passRequirement}>Pass: {reqQuizPercent}%</Text>
                                            </View>
                                            <Text style={styles.questionText}>{quizData[currentQuizIdx]?.question || "Question not available"}</Text>

                                            {(quizData[currentQuizIdx]?.options || []).map((option, idx) => {
                                                const isSelected = selectedOption === idx;
                                                const isCorrect = idx === quizData[currentQuizIdx]?.correctIndex;

                                                let borderColor = '#374151';
                                                let bgColor = '#1F2937';
                                                if (isSelected) {
                                                    borderColor = isCorrect ? '#10B981' : '#EF4444';
                                                    bgColor = isCorrect ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)';
                                                }

                                                return (
                                                    <TouchableOpacity
                                                        key={idx}
                                                        onPress={() => handleOptionSelect(idx)}
                                                        disabled={selectedOption !== null}
                                                        style={[styles.quizOption, { borderColor, backgroundColor: bgColor }]}
                                                    >
                                                        <Text style={[styles.quizOptionText, isSelected && { color: isCorrect ? '#10B981' : '#EF4444' }]}>
                                                            {option}
                                                        </Text>
                                                        {isSelected && (
                                                            <Feather name={isCorrect ? "check-circle" : "x-circle"} size={20} color={isCorrect ? '#10B981' : '#EF4444'} />
                                                        )}
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </ScrollView>
                                    </Animated.View>
                                ) : (
                                    <ScrollView
                                        style={{ flex: 1 }}
                                        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingVertical: 40 }}
                                        showsVerticalScrollIndicator={false}
                                    >
                                        <View style={styles.quizResult}>
                                            <MaterialCommunityIcons
                                                name={endQuizPassed ? "trophy-outline" : "reload"}
                                                size={64}
                                                color={endQuizPassed ? "#FBBF24" : "#EF4444"}
                                            />
                                            <Text style={styles.resultTitle}>
                                                {endQuizPassed ? "Quiz Passed!" : "Quiz Not Passed"}
                                            </Text>
                                            <Text style={styles.resultScore}>
                                                You scored {quizScore}/{quizData.length} ({((quizScore / quizData.length) * 100).toFixed(0)}%)
                                            </Text>

                                            {endQuizPassed && moduleCompleted && (
                                                <>
                                                    <View style={styles.xpBadge}>
                                                        <MaterialCommunityIcons name="star" size={20} color="#FBBF24" />
                                                        <Text style={styles.xpBadgeText}>
                                                            +{lesson.xp || 50} XP Earned!
                                                        </Text>
                                                    </View>
                                                    <View style={styles.completeBadge}>
                                                        <MaterialCommunityIcons name="check-circle" size={20} color="#10B981" />
                                                        <Text style={styles.completeBadgeText}>
                                                            Module Completed
                                                        </Text>
                                                    </View>
                                                </>
                                            )}

                                            {!endQuizPassed && (
                                                <Text style={styles.failMessage}>
                                                    You need {reqQuizPercent}% to pass
                                                </Text>
                                            )}

                                            <TouchableOpacity style={styles.restartBtn} onPress={() => {
                                                setQuizComplete(false);
                                                setCurrentQuizIdx(0);
                                                setQuizScore(0);
                                                setSelectedOption(null);
                                            }}>
                                                <Text style={styles.restartBtnText}>
                                                    {endQuizPassed ? "Practice Again" : "Try Again"}
                                                </Text>
                                            </TouchableOpacity>

                                            {/* [NEW] Manual Feedback Button if somehow missed */}
                                            {endQuizPassed && lesson.enable_feedback && (
                                                <TouchableOpacity
                                                    style={[styles.restartBtn, { backgroundColor: '#10B981', marginTop: 10, borderColor: '#059669' }]}
                                                    onPress={() => setShowFeedbackModal(true)}
                                                >
                                                    <Feather name="message-square" size={16} color="#FFF" style={{ marginRight: 8 }} />
                                                    <Text style={styles.restartBtnText}>Give Feedback</Text>
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                    </ScrollView>
                                )}
                            </View>
                        )}

                        {/* RESOURCES VIEW */}
                        {activeTab === 'resources' && (
                            <ScrollView contentContainerStyle={{ padding: 20 }}>
                                <TouchableOpacity style={styles.resourceCard}>
                                    <View style={styles.resourceIconBg}>
                                        <MaterialCommunityIcons name="file-pdf-box" size={24} color="#EF4444" />
                                    </View>
                                    <View>
                                        <Text style={styles.resourceTitle}>Course Materials</Text>
                                        <Text style={styles.resourceSub}>PDF • Download</Text>
                                    </View>
                                    <Feather name="download" size={20} color="#9CA3AF" style={{ marginLeft: 'auto' }} />
                                </TouchableOpacity>
                            </ScrollView>
                        )}
                    </View>
                </SafeAreaView>
            </View>

            {/* Mid-Video Quiz Modal */}
            <MidVideoQuizModal
                visible={showMidQuizModal}
                quiz={currentMidQuiz}
                onSubmit={handleMidQuizSubmit}
                onClose={handleMidQuizClose}
            />
            {/* Feedback Modal */}
            <FeedbackFormModal
                visible={showFeedbackModal}
                onClose={handleFeedbackClose}
                courseId={lesson.id}
                courseTitle={lesson.title}
                bucket={lesson.bucket}
                userEmail={userEmail}
            />
        </RNModal>
    );
}

// Mid-Video Quiz Modal Styles
const midQuizStyles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    container: {
        width: '100%',
        maxWidth: 400,
        maxHeight: Platform.OS === 'web' ? '80vh' : height * 0.8,
        borderRadius: 24,
        overflow: 'hidden',
    },
    gradient: {
        padding: 24,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    title: {
        fontSize: 20,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
        marginLeft: 12,
    },
    subtitle: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        color: '#9CA3AF',
        marginBottom: 20,
    },
    questionsScroll: {
        maxHeight: Platform.OS === 'web' ? '45vh' : height * 0.45,
    },
    questionCard: {
        marginBottom: 20,
    },
    questionText: {
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
        marginBottom: 12,
        lineHeight: 22,
    },
    optionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#374151',
        backgroundColor: '#1F2937',
        marginBottom: 8,
    },
    optionSelected: {
        borderColor: '#F59E0B',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
    },
    optionCorrect: {
        borderColor: '#10B981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
    },
    optionWrong: {
        borderColor: '#EF4444',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
    },
    optionText: {
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        color: '#E5E7EB',
        flex: 1,
    },
    submitBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F59E0B',
        paddingVertical: 14,
        borderRadius: 12,
        marginTop: 16,
    },
    submitBtnText: {
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
        color: '#111827',
    },
    continueBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#10B981',
        paddingVertical: 14,
        borderRadius: 12,
        marginTop: 16,
    },
    continueBtnText: {
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
    },
});

// Progress Indicator Styles
const progressStyles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        paddingHorizontal: 16,
        marginHorizontal: 20,
        marginBottom: 16,
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(245, 158, 11, 0.2)', // Subtle gold border
        backgroundColor: '#1F2937',
    },
    item: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        justifyContent: 'center',
    },
    iconBg: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10,
    },
    iconBgDone: {
        backgroundColor: 'rgba(245, 158, 11, 0.15)',
    },
    label: {
        fontSize: 10,
        fontFamily: 'Poppins_400Regular',
        color: '#9CA3AF',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 2,
    },
    value: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#D1D5DB',
    },
    valueDone: {
        color: '#F59E0B', // Gold
    },
    divider: {
        width: 1,
        height: 30,
        backgroundColor: 'rgba(75, 85, 99, 0.3)',
        marginHorizontal: 10,
    },
});

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: Platform.OS === 'web' ? '100%' : width,
        height: Platform.OS === 'web' ? '100%' : height,
        backgroundColor: '#111827',
        zIndex: 1000,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 15,
        ...(Platform.OS === 'web' && {
            maxWidth: 1200,
            alignSelf: 'center',
            width: '100%',
        }),
    },
    closeBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    menuBtn: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
        letterSpacing: 0.5,
        color: '#F59E0B', // Golden Header
    },
    headerSubtitle: {
        color: '#E5E7EB',
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
    },
    videoContainer: {
        width: '100%',
        height: Platform.OS === 'web' ? '50vh' : width * 0.5625,
        backgroundColor: '#000',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 4.65,
        elevation: 8,
        position: 'relative',
        ...(Platform.OS === 'web' && {
            maxWidth: 1200,
            alignSelf: 'center',
            minHeight: 350,
        }),
    },
    documentContainer: {
        width: Platform.OS === 'web' ? '100%' : width,
        height: Platform.OS === 'web' ? '50vh' : height * 0.35, // Use 50vh on web, 35% on native
        backgroundColor: '#000',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 4.65,
        elevation: 8,
        ...(Platform.OS === 'web' && {
            maxWidth: 1200,
            alignSelf: 'center',
            minHeight: 400,
        }),
    },
    videoPlaceholder: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    videoDuration: {
        position: 'absolute',
        bottom: 10,
        right: 10,
        backgroundColor: 'rgba(17, 24, 39, 0.8)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        color: '#FBBF24', // Amber text
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(245, 158, 11, 0.3)'
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.85)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
    },
    loadingText: {
        color: '#F59E0B',
        marginTop: 12,
        fontFamily: 'Poppins_600SemiBold',
    },
    tabBar: {
        flexDirection: 'row',
        paddingHorizontal: 20,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(245, 158, 11, 0.1)', // Gold divider
        marginTop: 10,
        flexShrink: 0,
        ...(Platform.OS === 'web' && {
            justifyContent: 'center',
            width: '100%',
            maxWidth: 1200,
            alignSelf: 'center',
        }),
    },
    tabBtn: {
        paddingVertical: 15,
        marginRight: 30,
        position: 'relative',
        flexDirection: 'row',
        alignItems: 'center',
    },
    tabBtnText: {
        color: '#6B7280',
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
    },
    tabBtnActive: {},
    tabBtnTextActive: {
        color: '#F59E0B', // Active Gold
    },
    tabBadge: {
        backgroundColor: '#F59E0B', // Gold Badge
        borderRadius: 10,
        paddingHorizontal: 6,
        paddingVertical: 2,
        marginLeft: 6,
    },
    tabBadgeText: {
        color: '#111827', // Dark Text on Gold
        fontSize: 10,
        fontFamily: 'Poppins_700Bold',
    },
    activeIndicator: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 3,
        backgroundColor: '#F59E0B', // Gold Line
        borderTopLeftRadius: 3,
        borderTopRightRadius: 3,
        shadowColor: "#F59E0B",
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.5,
        shadowRadius: 4,
    },
    contentArea: {
        flex: 1,
        ...(Platform.OS === 'web' && {
            width: '100%',
            maxWidth: 1200,
            alignSelf: 'center',
            maxHeight: 200,
            overflow: 'auto',
        }),
    },
    transcriptText: {
        color: '#D1D5DB',
        fontSize: 16,
        fontFamily: 'Poppins_400Regular',
        lineHeight: 28,
    },
    quizContainer: {
        flex: 1,
        padding: 24,
    },
    warningBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(245, 158, 11, 0.15)',
        padding: 12,
        borderRadius: 10,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(245, 158, 11, 0.3)',
    },
    warningText: {
        color: '#F59E0B',
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
        marginLeft: 8,
        flex: 1,
    },
    questionCounter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    counterText: {
        color: '#FBBF24',
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 12,
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    passRequirement: {
        color: '#6B7280',
        fontFamily: 'Poppins_500Medium',
        fontSize: 11,
    },
    questionText: {
        color: '#FFF',
        fontSize: 20,
        fontFamily: 'Poppins_600SemiBold',
        marginBottom: 30,
        lineHeight: 30,
    },
    quizOption: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 12,
    },
    quizOptionText: {
        color: '#E5E7EB',
        fontSize: 16,
        fontFamily: 'Poppins_500Medium',
        flex: 1,
    },
    quizResult: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    resultTitle: {
        color: '#FFF',
        fontSize: 24,
        fontFamily: 'Poppins_700Bold',
        marginTop: 20,
    },
    resultScore: {
        color: '#9CA3AF',
        fontSize: 16,
        fontFamily: 'Poppins_500Medium',
        marginTop: 8,
    },
    failMessage: {
        color: '#EF4444',
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        marginTop: 12,
    },
    xpBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 16,
        backgroundColor: 'rgba(245, 158, 11, 0.2)',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
    },
    xpBadgeText: {
        color: '#FBBF24',
        marginLeft: 6,
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 14,
    },
    completeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 12,
        backgroundColor: 'rgba(16, 185, 129, 0.2)',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
    },
    completeBadgeText: {
        color: '#10B981',
        marginLeft: 6,
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 14,
    },
    restartBtn: {
        marginTop: 40,
        paddingHorizontal: 30,
        paddingVertical: 12,
        backgroundColor: '#FBBF24',
        borderRadius: 25,
    },
    restartBtnText: {
        color: '#111827',
        fontFamily: 'Poppins_700Bold',
        fontSize: 16,
    },
    resourceCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1F2937',
        padding: 16,
        borderRadius: 12,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#374151',
    },
    resourceIconBg: {
        width: 48,
        height: 48,
        borderRadius: 10,
        backgroundColor: '#374151',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    resourceTitle: {
        color: '#FFF',
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
    },
    resourceSub: {
        color: '#9CA3AF',
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
    },
    // Document navigation hint overlay
    documentHintOverlay: {
        position: 'absolute',
        bottom: 20,
        left: 20,
        right: 20,
        alignItems: 'center',
        zIndex: 100,
    },
    documentHintBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(17, 24, 39, 0.95)',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 12,
        gap: 12,
        borderWidth: 1,
        borderColor: 'rgba(245, 158, 11, 0.3)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
    },
    documentHintText: {
        color: '#F3F4F6',
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
    },
});
