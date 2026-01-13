import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Dimensions,
    Image,
    Modal,
    ActivityIndicator,
    ScrollView,
    StatusBar,
    TouchableWithoutFeedback,
    Animated as RNAnimated,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, {
    FadeIn,
    FadeInDown,
    FadeInUp,
    FadeOut,
    SlideInUp,
    SlideOutDown,
    ZoomIn,
    Layout,
    withSpring,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
    withSequence,
    withDelay,
} from 'react-native-reanimated';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import API_URL from '../config';

const { width, height } = Dimensions.get('window');

// --- WRONG CHOICE CONSEQUENCE MODAL ---
const WrongChoiceModal = ({ visible, consequence, onRetry }) => {
    if (!visible) return null;

    return (
        <Modal visible={visible} transparent animationType="fade">
            <View style={wrongStyles.overlay}>
                <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
                <Animated.View entering={ZoomIn.springify()} style={wrongStyles.container}>
                    <LinearGradient
                        colors={['#1F1520', '#2D1F2D', '#1A1520']}
                        style={wrongStyles.gradient}
                    >
                        {/* Error Icon */}
                        <View style={wrongStyles.iconContainer}>
                            <View style={wrongStyles.iconCircle}>
                                <MaterialCommunityIcons name="alert-circle" size={60} color="#EF4444" />
                            </View>
                        </View>

                        <Text style={wrongStyles.title}>Wrong Choice!</Text>
                        <Text style={wrongStyles.subtitle}>Here's what could happen:</Text>

                        <View style={wrongStyles.consequenceBox}>
                            <MaterialCommunityIcons name="lightning-bolt" size={20} color="#F59E0B" />
                            <Text style={wrongStyles.consequenceText}>{consequence}</Text>
                        </View>

                        <View style={wrongStyles.penaltyBox}>
                            <Text style={wrongStyles.penaltyLabel}>Score Penalty</Text>
                            <Text style={wrongStyles.penaltyValue}>-10 points</Text>
                        </View>

                        <TouchableOpacity style={wrongStyles.retryBtn} onPress={onRetry}>
                            <LinearGradient
                                colors={['#8B5CF6', '#7C3AED']}
                                style={wrongStyles.retryGradient}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                            >
                                <MaterialCommunityIcons name="refresh" size={20} color="#FFF" />
                                <Text style={wrongStyles.retryText}>Try Again</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </LinearGradient>
                </Animated.View>
            </View>
        </Modal>
    );
};

// --- SIMULATION COMPLETE MODAL ---
const SimulationCompleteModal = ({ visible, score, totalSteps, wrongAttempts, timeSpent, onClose, onReplay }) => {
    if (!visible) return null;

    const percentage = Math.round((score / (totalSteps * 10)) * 100) || 0;
    const grade = percentage >= 90 ? 'A+' : percentage >= 80 ? 'A' : percentage >= 70 ? 'B' : percentage >= 60 ? 'C' : 'D';
    const gradeColor = percentage >= 80 ? '#10B981' : percentage >= 60 ? '#F59E0B' : '#EF4444';

    return (
        <Modal visible={visible} transparent animationType="fade">
            <View style={completeStyles.overlay}>
                <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
                <Animated.View entering={ZoomIn.springify()} style={completeStyles.container}>
                    <LinearGradient
                        colors={['#0F172A', '#1E293B', '#0F172A']}
                        style={completeStyles.gradient}
                    >
                        {/* Trophy/Star Icon */}
                        <View style={completeStyles.trophyContainer}>
                            <MaterialCommunityIcons
                                name={percentage >= 80 ? "trophy" : percentage >= 60 ? "medal" : "school"}
                                size={80}
                                color="#F59E0B"
                            />
                        </View>

                        <Text style={completeStyles.title}>Simulation Complete!</Text>

                        {/* Grade Circle */}
                        <View style={[completeStyles.gradeCircle, { borderColor: gradeColor }]}>
                            <Text style={[completeStyles.gradeText, { color: gradeColor }]}>{grade}</Text>
                            <Text style={completeStyles.percentText}>{percentage}%</Text>
                        </View>

                        {/* Stats */}
                        <View style={completeStyles.statsContainer}>
                            <View style={completeStyles.statItem}>
                                <Feather name="award" size={20} color="#10B981" />
                                <Text style={completeStyles.statValue}>{score}</Text>
                                <Text style={completeStyles.statLabel}>Score</Text>
                            </View>
                            <View style={completeStyles.statDivider} />
                            <View style={completeStyles.statItem}>
                                <Feather name="check-circle" size={20} color="#8B5CF6" />
                                <Text style={completeStyles.statValue}>{totalSteps}</Text>
                                <Text style={completeStyles.statLabel}>Steps</Text>
                            </View>
                            <View style={completeStyles.statDivider} />
                            <View style={completeStyles.statItem}>
                                <Feather name="x-circle" size={20} color="#EF4444" />
                                <Text style={completeStyles.statValue}>{wrongAttempts}</Text>
                                <Text style={completeStyles.statLabel}>Mistakes</Text>
                            </View>
                            <View style={completeStyles.statDivider} />
                            <View style={completeStyles.statItem}>
                                <Feather name="clock" size={20} color="#F59E0B" />
                                <Text style={completeStyles.statValue}>{Math.floor(timeSpent / 60)}m</Text>
                                <Text style={completeStyles.statLabel}>Time</Text>
                            </View>
                        </View>

                        {/* Feedback Message */}
                        <View style={completeStyles.feedbackBox}>
                            <Text style={completeStyles.feedbackText}>
                                {percentage >= 80
                                    ? "Excellent work! You've mastered this simulation."
                                    : percentage >= 60
                                        ? "Good job! A bit more practice and you'll be an expert."
                                        : "Keep practicing! Review the training materials and try again."}
                            </Text>
                        </View>

                        {/* Buttons */}
                        <View style={completeStyles.buttonRow}>
                            <TouchableOpacity style={completeStyles.replayBtn} onPress={onReplay}>
                                <MaterialCommunityIcons name="replay" size={20} color="#8B5CF6" />
                                <Text style={completeStyles.replayText}>Replay</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={completeStyles.doneBtn} onPress={onClose}>
                                <LinearGradient
                                    colors={['#F59E0B', '#D97706']}
                                    style={completeStyles.doneGradient}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                >
                                    <Text style={completeStyles.doneText}>Done</Text>
                                    <Feather name="check" size={20} color="#FFF" />
                                </LinearGradient>
                            </TouchableOpacity>
                        </View>
                    </LinearGradient>
                </Animated.View>
            </View>
        </Modal>
    );
};

// --- PAUSE MENU MODAL ---
const PauseMenuModal = ({ visible, onResume, onRestart, onQuit }) => {
    if (!visible) return null;

    return (
        <Modal visible={visible} transparent animationType="fade">
            <View style={pauseStyles.overlay}>
                <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
                <Animated.View entering={ZoomIn.springify()} style={pauseStyles.container}>
                    <Text style={pauseStyles.title}>PAUSED</Text>

                    <TouchableOpacity style={pauseStyles.menuItem} onPress={onResume}>
                        <Feather name="play" size={24} color="#10B981" />
                        <Text style={pauseStyles.menuText}>Resume</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={pauseStyles.menuItem} onPress={onRestart}>
                        <Feather name="refresh-cw" size={24} color="#F59E0B" />
                        <Text style={pauseStyles.menuText}>Restart Simulation</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={[pauseStyles.menuItem, pauseStyles.quitItem]} onPress={onQuit}>
                        <Feather name="log-out" size={24} color="#EF4444" />
                        <Text style={[pauseStyles.menuText, { color: '#EF4444' }]}>Quit Simulation</Text>
                    </TouchableOpacity>
                </Animated.View>
            </View>
        </Modal>
    );
};

// --- MAIN INTERACTIVE SIMULATION COMPONENT ---
// Instagram Reels-like fullscreen video experience
export default function InteractiveSimulation({ simulation, onClose, userId = 'user' }) {
    const [currentNodeId, setCurrentNodeId] = useState(null);
    const [currentNode, setCurrentNode] = useState(null);
    const [isVideoPlaying, setIsVideoPlaying] = useState(false);
    const [showOptions, setShowOptions] = useState(false); // Start hidden until video loads
    const [isLoading, setIsLoading] = useState(true);
    const [isPaused, setIsPaused] = useState(false);
    const [showWrongModal, setShowWrongModal] = useState(false);
    const [wrongConsequence, setWrongConsequence] = useState('');
    const [showCompleteModal, setShowCompleteModal] = useState(false);
    const [showControls, setShowControls] = useState(true); // For showing/hiding header controls

    // Scoring & Tracking
    const [score, setScore] = useState(0);
    const [wrongAttempts, setWrongAttempts] = useState(0);
    const [stepsCompleted, setStepsCompleted] = useState(0);
    const [startTime] = useState(Date.now());
    const [attemptHistory, setAttemptHistory] = useState([]);

    const videoRef = useRef(null);
    const controlsTimeout = useRef(null);
    const [videoKey, setVideoKey] = useState(0); // Key to force video re-mount on step change

    // Initialize simulation
    useEffect(() => {
        if (simulation && simulation.nodes && simulation.nodes.length > 0) {
            const startNode = simulation.nodes.find(n => n.isStart) || simulation.nodes[0];
            setCurrentNodeId(startNode.id);
            setCurrentNode(startNode);
            setIsLoading(false);
            // Show options after a brief delay for Reel-like experience
            setTimeout(() => setShowOptions(true), 500);
        }
    }, [simulation]);

    // Auto-hide controls after 3 seconds when video is playing
    useEffect(() => {
        if (isVideoPlaying) {
            setShowControls(false);
        } else {
            setShowControls(true);
        }
    }, [isVideoPlaying]);

    // Handle tap on video to toggle controls
    const handleVideoTap = () => {
        if (isVideoPlaying) {
            setShowControls(prev => !prev);
        }
    };

    // Handle option selection
    const handleOptionSelect = async (option, index) => {
        if (isVideoPlaying) return;

        const isCorrect = option.isCorrect;

        // Record attempt
        const attempt = {
            nodeId: currentNode.id,
            selectedOption: index,
            isCorrect,
            timestamp: new Date().toISOString(),
        };
        setAttemptHistory(prev => [...prev, attempt]);

        if (isCorrect) {
            // Correct choice - hide options, play video
            setScore(prev => prev + 10);
            setStepsCompleted(prev => prev + 1);
            setShowOptions(false);
            setIsVideoPlaying(true);

            // Play video
            if (videoRef.current && currentNode.videoUrl) {
                await videoRef.current.playAsync();
            } else {
                // No video - proceed to next step after short delay
                setTimeout(() => {
                    handleVideoEnd({ didJustFinish: true });
                }, 1500);
            }
        } else {
            // Wrong choice - show consequence modal
            setWrongAttempts(prev => prev + 1);
            setScore(prev => Math.max(0, prev - 10)); // Penalty

            // Generate or use provided consequence
            if (option.consequence) {
                setWrongConsequence(option.consequence);
            } else {
                // Generate AI consequence
                try {
                    const res = await fetch(`${API_URL}/simulation/generate-consequence`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            scenario: simulation.title,
                            currentStep: currentNode.title,
                            wrongOption: option.text,
                        }),
                    });
                    const data = await res.json();
                    setWrongConsequence(data.consequence || 'This action could lead to problems. Think carefully!');
                } catch (e) {
                    setWrongConsequence('This is not the right choice. Consider the proper procedure and try again.');
                }
            }
            setShowWrongModal(true);
        }
    };

    // Handle video completion
    const handleVideoEnd = async (status) => {
        if (status.didJustFinish && isVideoPlaying) {
            setIsVideoPlaying(false);

            // Find next node based on correct option
            const correctOption = currentNode.options.find(o => o.isCorrect);

            // Calculate total steps in the simulation
            const totalSteps = simulation.nodes.length;
            // stepsCompleted is incremented BEFORE this function is called (in handleOptionSelect)
            // So after completing last step, stepsCompleted will equal totalSteps
            const allStepsCompleted = (stepsCompleted >= totalSteps);

            // Determine if there's a valid next node to navigate to
            let nextNode = null;
            if (correctOption && correctOption.nextNodeId) {
                nextNode = simulation.nodes.find(n => n.id === correctOption.nextNodeId);
            }

            // Check if this is the intentional final step (correct option has no nextNodeId)
            const isIntentionalFinalStep = correctOption && !correctOption.nextNodeId;

            // Simulation should complete ONLY when:
            // 1. This is the intentional final step (no nextNodeId set), OR
            // 2. All steps have been completed AND there's no valid next node
            if (isIntentionalFinalStep && allStepsCompleted) {
                // Intentional completion - all steps done and marked as final
                handleSimulationComplete();
            } else if (nextNode) {
                // Navigate to the next node
                setCurrentNodeId(nextNode.id);
                setCurrentNode(nextNode);

                // Force video component to re-mount with new source
                setVideoKey(prev => prev + 1);

                // Show options after short transition (video paused, waiting for user)
                setTimeout(() => {
                    setShowOptions(true);
                }, 400);
            } else if (allStepsCompleted) {
                // All steps completed but no explicit next node - complete the simulation
                handleSimulationComplete();
            } else {
                // Edge case: nextNodeId points to non-existent node but steps remain
                // Find the next node in sequence that hasn't been visited
                console.warn('nextNodeId reference not found, attempting to find next sequential node');

                // Get current node index and try to go to next node in array order
                const currentIndex = simulation.nodes.findIndex(n => n.id === currentNode.id);
                if (currentIndex >= 0 && currentIndex < simulation.nodes.length - 1) {
                    const fallbackNextNode = simulation.nodes[currentIndex + 1];
                    setCurrentNodeId(fallbackNextNode.id);
                    setCurrentNode(fallbackNextNode);
                    setVideoKey(prev => prev + 1);
                    setTimeout(() => {
                        setShowOptions(true);
                    }, 400);
                } else {
                    // Truly no more nodes available - complete simulation
                    handleSimulationComplete();
                }
            }
        }
    };

    // Handle simulation completion
    const handleSimulationComplete = async () => {
        const timeSpent = Math.round((Date.now() - startTime) / 1000);

        // Save progress to backend
        try {
            await fetch(`${API_URL}/simulation/complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    simulationId: simulation.id,
                    score,
                    totalSteps: stepsCompleted,
                    wrongAttempts,
                    timeSpentSeconds: timeSpent,
                    attemptHistory,
                    completedAt: new Date().toISOString(),
                }),
            });
        } catch (e) {
            console.error('Failed to save simulation progress:', e);
        }

        setShowCompleteModal(true);
    };

    // Replay video
    const handleReplayVideo = async () => {
        if (videoRef.current) {
            await videoRef.current.setPositionAsync(0);
            await videoRef.current.playAsync();
            setIsVideoPlaying(true);
            setShowOptions(false);
        }
    };

    // Restart simulation
    const handleRestart = () => {
        setIsPaused(false);
        setShowCompleteModal(false);
        setScore(0);
        setWrongAttempts(0);
        setStepsCompleted(0);
        setAttemptHistory([]);

        const startNode = simulation.nodes.find(n => n.isStart) || simulation.nodes[0];
        setCurrentNodeId(startNode.id);
        setCurrentNode(startNode);
        setShowOptions(true);
        setIsVideoPlaying(false);
        setVideoKey(prev => prev + 1); // Force video re-mount
    };

    if (isLoading || !currentNode) {
        return (
            <View style={styles.loadingContainer}>
                <StatusBar hidden />
                <LinearGradient colors={['#0F172A', '#1E293B']} style={StyleSheet.absoluteFill} />
                <ActivityIndicator size="large" color="#F59E0B" />
                <Text style={styles.loadingText}>Loading Simulation...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar hidden />

            {/* FULLSCREEN VIDEO - Instagram Reels Style */}
            <TouchableWithoutFeedback onPress={handleVideoTap}>
                <View style={styles.fullscreenVideoContainer}>
                    {currentNode.videoUrl ? (
                        <Video
                            key={`video-${videoKey}-${currentNodeId}`}
                            ref={videoRef}
                            source={{ uri: currentNode.videoUrl }}
                            style={styles.fullscreenVideo}
                            resizeMode={ResizeMode.COVER}
                            shouldPlay={false}
                            isLooping={false}
                            onPlaybackStatusUpdate={handleVideoEnd}
                        />
                    ) : (
                        // Placeholder gradient when no video
                        <LinearGradient
                            colors={['#1E293B', '#0F172A', '#1E293B']}
                            style={styles.fullscreenVideo}
                        >
                            <View style={styles.noVideoPlaceholder}>
                                <MaterialCommunityIcons name="chef-hat" size={80} color="rgba(255,255,255,0.2)" />
                            </View>
                        </LinearGradient>
                    )}

                    {/* Dark Overlay when options are visible */}
                    {showOptions && (
                        <View style={styles.darkOverlay} pointerEvents="none" />
                    )}

                    {/* TOP CONTROLS - Floating over video */}
                    {(showControls || showOptions) && (
                        <Animated.View
                            entering={FadeIn.duration(200)}
                            exiting={FadeOut.duration(200)}
                            style={styles.topControls}
                        >
                            <LinearGradient
                                colors={['rgba(0,0,0,0.7)', 'transparent']}
                                style={styles.topGradient}
                            >
                                <View style={styles.headerRow}>
                                    <TouchableOpacity style={styles.controlBtn} onPress={() => setIsPaused(true)}>
                                        <Feather name="pause" size={22} color="#FFF" />
                                    </TouchableOpacity>

                                    <View style={styles.headerCenter}>
                                        <Text style={styles.simulationTitle} numberOfLines={1}>{simulation.title}</Text>
                                        <Text style={styles.stepIndicator}>Step {stepsCompleted + 1} of {simulation.nodes.length}</Text>
                                    </View>

                                    <View style={styles.scoreContainer}>
                                        <MaterialCommunityIcons name="star" size={16} color="#F59E0B" />
                                        <Text style={styles.scoreText}>{score}</Text>
                                    </View>
                                </View>

                                {/* Progress Bar */}
                                <View style={styles.progressContainer}>
                                    <View style={styles.progressBg}>
                                        <View
                                            style={[
                                                styles.progressFill,
                                                { width: `${((stepsCompleted) / simulation.nodes.length) * 100}%` }
                                            ]}
                                        />
                                    </View>
                                </View>
                            </LinearGradient>
                        </Animated.View>
                    )}

                    {/* Playing Indicator */}
                    {isVideoPlaying && showControls && (
                        <View style={styles.playingIndicator}>
                            <View style={styles.playingDot} />
                            <Text style={styles.playingText}>Playing...</Text>
                        </View>
                    )}

                    {/* BOTTOM OPTIONS OVERLAY - Blur style over video */}
                    {showOptions && (
                        <Animated.View
                            entering={FadeInUp.duration(300)}
                            exiting={FadeOut.duration(150)}
                            style={styles.bottomOptionsContainer}
                        >
                            <BlurView intensity={50} tint="dark" style={styles.optionsBlur}>
                                {/* Step Info */}
                                <View style={styles.stepInfoContainer}>
                                    <Text style={styles.stepTitle}>{currentNode.title}</Text>
                                    {currentNode.description && (
                                        <Text style={styles.stepDescription}>{currentNode.description}</Text>
                                    )}
                                </View>

                                {/* Question */}
                                <Text style={styles.questionText}>What should you do?</Text>

                                {/* Options List */}
                                <ScrollView
                                    style={styles.optionsScroll}
                                    showsVerticalScrollIndicator={false}
                                    contentContainerStyle={styles.optionsScrollContent}
                                >
                                    {currentNode.options.map((option, index) => (
                                        <Animated.View
                                            key={option.id || index}
                                            entering={FadeIn.delay(100 + index * 50).duration(250)}
                                        >
                                            <TouchableOpacity
                                                style={styles.optionCard}
                                                onPress={() => handleOptionSelect(option, index)}
                                                activeOpacity={0.7}
                                            >
                                                <View style={styles.optionNumber}>
                                                    <Text style={styles.optionNumberText}>{index + 1}</Text>
                                                </View>
                                                <Text style={styles.optionText}>{option.text}</Text>
                                                <Feather name="chevron-right" size={18} color="rgba(255,255,255,0.4)" />
                                            </TouchableOpacity>
                                        </Animated.View>
                                    ))}
                                </ScrollView>

                                {/* Replay hint */}
                                {stepsCompleted > 0 && (
                                    <TouchableOpacity style={styles.replayHint} onPress={handleReplayVideo}>
                                        <MaterialCommunityIcons name="replay" size={16} color="rgba(255,255,255,0.6)" />
                                        <Text style={styles.replayHintText}>Replay Video</Text>
                                    </TouchableOpacity>
                                )}
                            </BlurView>
                        </Animated.View>
                    )}
                </View>
            </TouchableWithoutFeedback>

            {/* Modals */}
            <WrongChoiceModal
                visible={showWrongModal}
                consequence={wrongConsequence}
                onRetry={() => setShowWrongModal(false)}
            />

            <SimulationCompleteModal
                visible={showCompleteModal}
                score={score}
                totalSteps={stepsCompleted}
                wrongAttempts={wrongAttempts}
                timeSpent={Math.round((Date.now() - startTime) / 1000)}
                onClose={onClose}
                onReplay={handleRestart}
            />

            <PauseMenuModal
                visible={isPaused}
                onResume={() => setIsPaused(false)}
                onRestart={handleRestart}
                onQuit={onClose}
            />
        </View>
    );
}

// --- MAIN STYLES (Instagram Reels-like) ---
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#000',
    },
    loadingText: {
        color: '#FFF',
        fontSize: 16,
        fontFamily: 'Poppins_500Medium',
        marginTop: 16,
    },

    // Fullscreen Video
    fullscreenVideoContainer: {
        flex: 1,
        backgroundColor: '#000',
    },
    fullscreenVideo: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    noVideoPlaceholder: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    darkOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.3)',
    },

    // Top Controls
    topControls: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10,
    },
    topGradient: {
        paddingTop: 50,
        paddingHorizontal: 16,
        paddingBottom: 30,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    controlBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.15)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerCenter: {
        flex: 1,
        alignItems: 'center',
        paddingHorizontal: 12,
    },
    simulationTitle: {
        color: '#FFF',
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
        textShadowColor: 'rgba(0,0,0,0.8)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 4,
    },
    stepIndicator: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
    },
    scoreContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(245, 158, 11, 0.25)',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 16,
    },
    scoreText: {
        color: '#F59E0B',
        fontSize: 14,
        fontFamily: 'Poppins_700Bold',
        marginLeft: 4,
    },

    // Progress
    progressContainer: {
        marginTop: 16,
    },
    progressBg: {
        height: 3,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 2,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#10B981',
        borderRadius: 2,
    },

    // Playing Indicator
    playingIndicator: {
        position: 'absolute',
        top: 120,
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(239, 68, 68, 0.9)',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
    },
    playingDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#FFF',
        marginRight: 8,
    },
    playingText: {
        color: '#FFF',
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
    },

    // Bottom Options Container
    bottomOptionsContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        maxHeight: height * 0.65,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        overflow: 'hidden',
    },
    optionsBlur: {
        padding: 20,
        paddingTop: 24,
        paddingBottom: 40,
    },
    stepInfoContainer: {
        marginBottom: 16,
    },
    stepTitle: {
        color: '#FFF',
        fontSize: 22,
        fontFamily: 'Poppins_700Bold',
        marginBottom: 4,
    },
    stepDescription: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
    },
    questionText: {
        color: 'rgba(255,255,255,0.9)',
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
        marginBottom: 12,
    },
    optionsScroll: {
        maxHeight: height * 0.35,
    },
    optionsScrollContent: {
        paddingBottom: 10,
    },
    optionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 14,
        padding: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    optionNumber: {
        width: 28,
        height: 28,
        borderRadius: 8,
        backgroundColor: 'rgba(139, 92, 246, 0.4)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    optionNumberText: {
        color: '#C4B5FD',
        fontSize: 13,
        fontFamily: 'Poppins_700Bold',
    },
    optionText: {
        flex: 1,
        color: '#FFF',
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        lineHeight: 20,
    },
    replayHint: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 12,
        paddingVertical: 8,
    },
    replayHintText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 13,
        fontFamily: 'Poppins_500Medium',
        marginLeft: 6,
    },
});

// Wrong Choice Modal Styles
const wrongStyles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    container: {
        width: '100%',
        maxWidth: 380,
        borderRadius: 28,
        overflow: 'hidden',
    },
    gradient: {
        padding: 28,
        alignItems: 'center',
    },
    iconContainer: {
        marginBottom: 20,
    },
    iconCircle: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: {
        color: '#EF4444',
        fontSize: 24,
        fontFamily: 'Poppins_700Bold',
        marginBottom: 8,
    },
    subtitle: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        marginBottom: 16,
    },
    consequenceBox: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 20,
        borderLeftWidth: 3,
        borderLeftColor: '#F59E0B',
    },
    consequenceText: {
        flex: 1,
        color: 'rgba(255,255,255,0.9)',
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        marginLeft: 12,
        lineHeight: 22,
    },
    penaltyBox: {
        alignItems: 'center',
        marginBottom: 24,
    },
    penaltyLabel: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
    },
    penaltyValue: {
        color: '#EF4444',
        fontSize: 20,
        fontFamily: 'Poppins_700Bold',
    },
    retryBtn: {
        width: '100%',
        borderRadius: 14,
        overflow: 'hidden',
    },
    retryGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
    },
    retryText: {
        color: '#FFF',
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
        marginLeft: 8,
    },
});

// Simulation Complete Modal Styles
const completeStyles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    container: {
        width: '100%',
        maxWidth: 400,
        borderRadius: 28,
        overflow: 'hidden',
    },
    gradient: {
        padding: 28,
        alignItems: 'center',
    },
    trophyContainer: {
        marginBottom: 16,
    },
    title: {
        color: '#FFF',
        fontSize: 24,
        fontFamily: 'Poppins_700Bold',
        marginBottom: 20,
    },
    gradeCircle: {
        width: 100,
        height: 100,
        borderRadius: 50,
        borderWidth: 4,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
    },
    gradeText: {
        fontSize: 32,
        fontFamily: 'Poppins_700Bold',
    },
    percentText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
    },
    statsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        width: '100%',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 20,
    },
    statItem: {
        alignItems: 'center',
    },
    statValue: {
        color: '#FFF',
        fontSize: 20,
        fontFamily: 'Poppins_700Bold',
        marginTop: 4,
    },
    statLabel: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
    },
    statDivider: {
        width: 1,
        height: 40,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    feedbackBox: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 12,
        padding: 16,
        marginBottom: 24,
    },
    feedbackText: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
        lineHeight: 22,
    },
    buttonRow: {
        flexDirection: 'row',
        gap: 12,
    },
    replayBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#8B5CF6',
        borderRadius: 14,
        paddingVertical: 14,
    },
    replayText: {
        color: '#8B5CF6',
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
        marginLeft: 6,
    },
    doneBtn: {
        flex: 1,
        borderRadius: 14,
        overflow: 'hidden',
    },
    doneGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
    },
    doneText: {
        color: '#FFF',
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
        marginRight: 6,
    },
});

// Pause Menu Modal Styles
const pauseStyles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    container: {
        width: '100%',
        maxWidth: 340,
        backgroundColor: 'rgba(30, 41, 59, 0.95)',
        borderRadius: 24,
        padding: 28,
        alignItems: 'center',
    },
    title: {
        color: '#FFF',
        fontSize: 28,
        fontFamily: 'Poppins_700Bold',
        letterSpacing: 4,
        marginBottom: 30,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        width: '100%',
        paddingVertical: 16,
        paddingHorizontal: 20,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.05)',
        marginBottom: 12,
    },
    quitItem: {
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
    },
    menuText: {
        color: '#FFF',
        fontSize: 16,
        fontFamily: 'Poppins_500Medium',
        marginLeft: 16,
    },
});
