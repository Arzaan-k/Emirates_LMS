import React, { useState, useEffect } from "react";
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Dimensions,
    ScrollView,
    Modal,
    Image,
    Pressable,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { MaterialCommunityIcons, Feather, Ionicons } from "@expo/vector-icons";
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    withSequence,
    withSpring,
    Easing,
    runOnJS,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";

const { width, height } = Dimensions.get("window");
const NODE_RADIUS = 40;
const VERTICAL_SPACING = 140;
const AMPLITUDE = width * 0.28;
const CENTER_X = width / 2;
import API_URL from '../config';

// const API_URL = "http://172.20.10.2:8000:8000"; // Physical Device
const ICONS = ["coffee", "water", "flower", "cog", "flask", "clipboard-list", "account-heart"]; // Pool for dynamic items

// Mock Data
// Static Fallback (if backend empty)
const STATIC_LEVELS = [
    { id: 1, title: "Espresso Basics", icon: "coffee", status: "completed", desc: "Learn the art of pulling the perfect shot.", lessonCount: 3, xp: 50 },
    { id: 2, title: "Milk Tech", icon: "water", status: "completed", desc: "Frothing, steaming, and pouring like a pro.", lessonCount: 4, xp: 60 },
    { id: 3, title: "Latte Art", icon: "flower", status: "active", desc: "Create hearts, rosettas, and tulips.", lessonCount: 5, xp: 100 },
];

/**
 * Animated Node Component
 */
const PathNode = ({ item, index, x, y, onPress }) => {
    const isCompleted = item.status === "completed";
    const isActive = item.status === "active";
    const isLocked = item.status === "locked";

    // Pulse Animation
    const scale = useSharedValue(1);
    const shake = useSharedValue(0); // For locked shake

    useEffect(() => {
        if (isActive) {
            scale.value = withRepeat(
                withSequence(withTiming(1.1, { duration: 1000 }), withTiming(1, { duration: 1000 })),
                -1,
                true
            );
        }
    }, [isActive]);

    const handlePress = () => {
        if (isLocked) {
            // Shake Animation
            shake.value = withSequence(
                withTiming(10, { duration: 50 }),
                withTiming(-10, { duration: 50 }),
                withTiming(10, { duration: 50 }),
                withTiming(0, { duration: 50 })
            );
        } else {
            onPress();
        }
    };

    const animatedStyle = useAnimatedStyle(() => {
        return {
            transform: [{ scale: scale.value }, { translateX: shake.value }],
        };
    });

    // Style Logic
    let gradientColors = ["#E5E7EB", "#D1D5DB"]; // Locked Gray
    let iconColor = "#9CA3AF";
    let ringColor = "rgba(0,0,0,0.05)";

    if (isCompleted) {
        gradientColors = ["#F59E0B", "#D97706"]; // Gold
        iconColor = "#FFF";
    } else if (isActive) {
        gradientColors = ["#FBBF24", "#F59E0B"]; // Brighter Gold
        iconColor = "#FFF";
        ringColor = "rgba(245, 158, 11, 0.3)";
    }

    // Calculate distinct Y offset for the "3D" depth look
    const depth = 6;

    return (
        <View style={[styles.nodeWrapper, { left: x - NODE_RADIUS - 10, top: y - NODE_RADIUS - 10 }]}>
            <Animated.View style={[styles.ringContainer, { backgroundColor: ringColor }, animatedStyle]}>
                <TouchableOpacity activeOpacity={0.9} onPress={handlePress} style={styles.touchableNode}>
                    {/* 3D Button Construction */}
                    <View style={[styles.nodeBase, { backgroundColor: isLocked ? "#9CA3AF" : "#B45309", top: depth }]} />
                    <LinearGradient colors={gradientColors} style={styles.nodeFace}>
                        {isCompleted ? (
                            <MaterialCommunityIcons name="check-bold" size={32} color="#FFF" />
                        ) : (
                            <MaterialCommunityIcons name={item.icon} size={30} color={iconColor} />
                        )}
                    </LinearGradient>

                    {/* Shine Effect */}
                    {!isLocked && <View style={styles.shine} />}
                </TouchableOpacity>
            </Animated.View>

            {/* CROWN (Active Only) */}
            {isActive && (
                <View style={styles.crownContainer}>
                    <MaterialCommunityIcons name="crown" size={28} color="#F59E0B" style={styles.crownShadow} />
                    <MaterialCommunityIcons name="crown-outline" size={28} color="#FFF" style={{ position: 'absolute' }} />
                </View>
            )}

            {/* LABEL (Floating Card) */}
            {/* <View style={[styles.labelTag, isLocked && styles.labelLocked]}>
           <Text style={styles.labelText}>{item.title}</Text>
       </View> */}
        </View>
    );
};

/**
 * Detail Sheet Modal
 */
/**
 * Detail Sheet Modal
 */
const LevelDetailModal = ({ visible, level, onClose, onStart }) => {
    const translateY = useSharedValue(height);

    useEffect(() => {
        if (visible) {
            translateY.value = withSpring(0, { damping: 15 });
        } else {
            translateY.value = withTiming(height, { duration: 300 });
        }
    }, [visible]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }]
    }));

    if (!level) return null;

    return (
        <Modal transparent visible={visible} animationType="fade">
            <View style={styles.modalOverlay}>
                <Pressable style={styles.backdrop} onPress={onClose} />
                <Animated.View style={[styles.modalContent, animatedStyle]}>
                    <LinearGradient
                        colors={["#FFF", "#FFF7ED"]}
                        style={styles.modalGradient}
                    >
                        {/* HANDLE */}
                        <View style={styles.dragHandle} />

                        {/* CONTENT */}
                        <View style={styles.modalHeader}>
                            <View style={[styles.modalIcon, { backgroundColor: level.status === 'completed' ? '#F59E0B' : '#FBBF24' }]}>
                                <MaterialCommunityIcons name={level.icon} size={40} color="#FFF" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.modalTitle}>{level.title}</Text>
                                <Text style={styles.modalStatus}>
                                    {level.status === 'completed' ? "COMPLETED" : "IN PROGRESS"}
                                </Text>
                            </View>
                        </View>

                        <Text style={styles.modalDesc}>{level.desc}</Text>

                        {/* STATS */}
                        <View style={styles.statsRow}>
                            <View style={styles.statItem}>
                                <Feather name="book-open" size={18} color="#6B7280" />
                                <Text style={styles.statText}>{level.lessonCount} Lessons</Text>
                            </View>
                            <View style={styles.statItem}>
                                <MaterialCommunityIcons name="lightning-bolt" size={18} color="#F59E0B" />
                                <Text style={styles.statText}>+{level.xp} XP</Text>
                            </View>
                        </View>

                        {/* CTA BUTTON */}
                        <TouchableOpacity style={styles.startBtn} onPress={onStart}>
                            <LinearGradient colors={["#F59E0B", "#D97706"]} style={styles.startBtnGradient}>
                                <Text style={styles.startBtnText}>
                                    {level.status === 'completed' ? "Practice Again" : "Start Chapter"}
                                </Text>
                            </LinearGradient>
                        </TouchableOpacity>

                    </LinearGradient>
                </Animated.View>
            </View>
        </Modal>
    );
};

import LessonView from './LessonView';
import RoleAdvancementExam from './RoleAdvancementExam';

import ConfettiSystem from './ConfettiSystem';

/**
 * Level Up Celebration Modal - Shows when user advances to a new tier
 */
const LevelUpCelebrationModal = ({ visible, previousLevel, newLevel, levelColor, levelIcon, onClose }) => {
    const scale = useSharedValue(0);
    const opacity = useSharedValue(0);
    const badgeScale = useSharedValue(0.5);

    useEffect(() => {
        if (visible) {
            opacity.value = withTiming(1, { duration: 300 });
            scale.value = withSpring(1, { damping: 12, stiffness: 100 });
            badgeScale.value = withSequence(
                withTiming(1.3, { duration: 400 }),
                withSpring(1, { damping: 8 })
            );
        } else {
            opacity.value = withTiming(0, { duration: 200 });
            scale.value = withTiming(0, { duration: 200 });
        }
    }, [visible]);

    const containerStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
    }));

    const modalStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    const badgeAnimatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: badgeScale.value }],
    }));

    if (!visible) return null;

    return (
        <Modal transparent visible={visible} animationType="none">
            <Animated.View style={[levelUpStyles.overlay, containerStyle]}>
                <Animated.View style={[levelUpStyles.modal, modalStyle]}>
                    <LinearGradient
                        colors={[levelColor || '#F59E0B', '#D97706']}
                        style={levelUpStyles.gradient}
                    >
                        {/* Stars Decoration */}
                        <View style={levelUpStyles.starsContainer}>
                            <MaterialCommunityIcons name="star" size={24} color="rgba(255,255,255,0.3)" style={{ position: 'absolute', top: 10, left: 30 }} />
                            <MaterialCommunityIcons name="star-four-points" size={18} color="rgba(255,255,255,0.4)" style={{ position: 'absolute', top: 40, right: 20 }} />
                            <MaterialCommunityIcons name="shimmer" size={22} color="rgba(255,255,255,0.5)" style={{ position: 'absolute', bottom: 60, left: 20 }} />
                        </View>

                        {/* Title */}
                        <Text style={levelUpStyles.title}>🎉 LEVEL UP! 🎉</Text>
                        <Text style={levelUpStyles.subtitle}>You have advanced to a new tier</Text>

                        {/* Badge */}
                        <Animated.View style={[levelUpStyles.badgeContainer, badgeAnimatedStyle]}>
                            <View style={levelUpStyles.badgeGlow}>
                                <View style={levelUpStyles.badge}>
                                    <MaterialCommunityIcons name={levelIcon || 'medal'} size={60} color="#FFF" />
                                </View>
                            </View>
                        </Animated.View>

                        {/* Level Name */}
                        <Text style={levelUpStyles.levelName}>{newLevel}</Text>

                        {/* Previous Level */}
                        {previousLevel && (
                            <View style={levelUpStyles.fromContainer}>
                                <Text style={levelUpStyles.fromText}>
                                    Promoted from <Text style={{ fontFamily: 'Poppins_700Bold' }}>{previousLevel}</Text>
                                </Text>
                            </View>
                        )}

                        {/* Continue Button */}
                        <TouchableOpacity style={levelUpStyles.continueBtn} onPress={onClose}>
                            <Text style={levelUpStyles.continueBtnText}>Continue Journey</Text>
                            <Feather name="arrow-right" size={18} color="#F59E0B" style={{ marginLeft: 8 }} />
                        </TouchableOpacity>
                    </LinearGradient>
                </Animated.View>
            </Animated.View>
        </Modal>
    );
};

const levelUpStyles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modal: {
        width: width * 0.85,
        borderRadius: 30,
        overflow: 'hidden',
        shadowColor: '#F59E0B',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 30,
        elevation: 20,
    },
    gradient: {
        padding: 30,
        alignItems: 'center',
    },
    starsContainer: {
        ...StyleSheet.absoluteFillObject,
    },
    title: {
        fontSize: 28,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
        textAlign: 'center',
        marginBottom: 8,
        textShadowColor: 'rgba(0,0,0,0.3)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 4,
    },
    subtitle: {
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        color: 'rgba(255,255,255,0.9)',
        marginBottom: 24,
    },
    badgeContainer: {
        marginBottom: 20,
    },
    badgeGlow: {
        padding: 10,
        borderRadius: 100,
        backgroundColor: 'rgba(255,255,255,0.2)',
    },
    badge: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: 'rgba(255,255,255,0.3)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 3,
        borderColor: 'rgba(255,255,255,0.5)',
    },
    levelName: {
        fontSize: 26,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
        marginBottom: 12,
        textAlign: 'center',
    },
    fromContainer: {
        backgroundColor: 'rgba(255,255,255,0.2)',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        marginBottom: 24,
    },
    fromText: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: 'rgba(255,255,255,0.9)',
    },
    continueBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        paddingHorizontal: 24,
        paddingVertical: 14,
        borderRadius: 25,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 5,
    },
    continueBtnText: {
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
        color: '#F59E0B',
    },
});

const CAR_IMAGE = require('../assets/images/path_car.png');

export default function CoursePath({ userEmail = "user" }) {
    const [selectedLevel, setSelectedLevel] = useState(null);
    const [activeLesson, setActiveLesson] = useState(null);
    const [levels, setLevels] = useState([]);
    const [showConfetti, setShowConfetti] = useState(false);
    const [userProgress, setUserProgress] = useState(null);
    const [levelConfig, setLevelConfig] = useState({});

    // Level Up Celebration State
    const [levelUpInfo, setLevelUpInfo] = useState(null); // { previousLevel, newLevel }

    // Role Advancement Exam State
    const [showAdvancementExam, setShowAdvancementExam] = useState(false);
    const [isEligibleForAdvancement, setIsEligibleForAdvancement] = useState(false);
    const [advancementTarget, setAdvancementTarget] = useState(null);


    // Animation State
    const carX = useSharedValue(CENTER_X);
    const carY = useSharedValue(100);
    const prevActiveIndex = React.useRef(0);

    const isFirstLoad = React.useRef(true);

    // Level stages configuration
    const LEVEL_STAGES = [
        { name: 'Waffler', icon: 'account', color: '#6B7280', minNodes: 0 },
        { name: 'Silver Waffler', icon: 'medal-outline', color: '#9CA3AF', minNodes: 10 },
        { name: 'Gold Waffler', icon: 'medal', color: '#F59E0B', minNodes: 25 },
    ];

    // Level stages configuration
    const HIERARCHY = ['Waffler', 'Silver Waffler', 'Gold Waffler', 'Shift Manager', 'Assistant Store Manager'];
    const LEVEL_COLORS = {
        'Waffler': '#9CA3AF',
        'Silver Waffler': '#60A5FA',
        'Gold Waffler': '#F59E0B',
        'Shift Manager': '#8B5CF6',
        'Assistant Store Manager': '#EF4444'
    };
    const LEVEL_ICONS = {
        'Waffler': 'account',
        'Silver Waffler': 'medal-outline',
        'Gold Waffler': 'medal',
        'Shift Manager': 'account-tie',
        'Assistant Store Manager': 'store'
    };

    useEffect(() => {
        loadCoursePath();
        checkAdvancementEligibility();
    }, []);

    // Check if user is eligible for role advancement exam
    const checkAdvancementEligibility = async () => {
        try {
            const response = await fetch(`${API_URL}/role-advancement/eligibility/${userEmail}`);
            const data = await response.json();
            setIsEligibleForAdvancement(data.eligible === true);
            if (data.eligible) {
                setAdvancementTarget(data.target_role);
            }
        } catch (err) {
            console.log("Error checking advancement eligibility:", err);
        }
    };

    // Handle advancement exam completion
    const handleAdvancementComplete = (result) => {
        if (result?.passed) {
            // Show level up celebration
            setLevelUpInfo({
                previousLevel: userProgress?.current_level || 'Waffler',
                newLevel: result.new_role
            });
            setShowConfetti(true);
            setTimeout(() => setShowConfetti(false), 5000);
            
            // Reload course path to reflect new level
            loadCoursePath();
            checkAdvancementEligibility();
        }
    };

    const loadCoursePath = async () => {
        try {
            // 1. Fetch User Progress
            const progressRes = await fetch(`${API_URL}/user/level-progress/${userEmail}`);
            const progressData = await progressRes.json();
            setUserProgress(progressData);

            // 2. Fetch Access Rules (Curriculum)
            const rulesRes = await fetch(`${API_URL}/admin/access-rules`);
            const rulesData = await rulesRes.json();

            // 3. Fetch All Courses (for details)
            const coursesRes = await fetch(`${API_URL}/content`);
            const allCoursesData = await coursesRes.json();

            // 4. Fetch User Completions 
            // (We can get this from an endpoint or imply it. Let's assume we fetch it to know individual course status)
            // Ideally /path/nodes gives status, but we are constructing custom order.
            // Let's use /path/nodes just to get completion status efficiently if possible, or fetch completions separately.
            // For now, let's look at what we have. 
            // We'll rely on a new fetch to get completions if needed, or re-use logic.
            // Actually, let's use the existing /path/nodes endpoint to get the "status" (completed/active) 
            // but ignore its ordering.
            const statusRes = await fetch(`${API_URL}/path/nodes?user_email=${userEmail}&t=${Date.now()}`);
            const statusData = await statusRes.json();
            const completedIds = new Set(
                statusData.filter(c => c.status === 'completed').map(c => c.id || c.videoUrl)
            );

            // 5. Construct the Ordered Path with SEQUENTIAL UNLOCKING + SMART LEVEL DETECTION
            // Calculate user's EFFECTIVE level based on completions - not just stored role

            // First, determine which levels are fully completed based on course completions
            let effectiveLevelIdx = 0; // Start at Waffler (index 0)

            for (let i = 0; i < HIERARCHY.length; i++) {
                const levelName = HIERARCHY[i];
                const levelRules = rulesData[levelName] || {};
                const courseIds = levelRules.accessible_courses || [];

                if (courseIds.length === 0) {
                    // No courses assigned to this level - skip (consider it completed)
                    effectiveLevelIdx = i + 1;
                    continue;
                }

                // Check if ALL courses in this level are completed
                const allCompleted = courseIds.every(id => completedIds.has(id));

                if (allCompleted) {
                    // This level is complete, user should be at NEXT level
                    effectiveLevelIdx = Math.min(i + 1, HIERARCHY.length - 1);
                } else {
                    // Found incomplete level - user is AT this level
                    effectiveLevelIdx = i;
                    break;
                }
            }

            // Use the higher of: API-reported level OR calculated effective level
            const apiLevelIdx = HIERARCHY.indexOf(progressData.current_level || 'Waffler');
            const userLevelIdx = Math.max(effectiveLevelIdx, apiLevelIdx >= 0 ? apiLevelIdx : 0);
            const userLevel = HIERARCHY[userLevelIdx];

            console.log(`User Level Detection: API says "${progressData.current_level}", Calculated: "${HIERARCHY[effectiveLevelIdx]}", Using: "${userLevel}"`);

            // Now build the path with the correct level
            let builtPath = [];
            let cumulativeIndex = 0;
            let foundFirstIncomplete = false; // Track if we've found the first incomplete node

            HIERARCHY.forEach((levelName) => {
                const levelRules = rulesData[levelName] || {};
                const courseIds = levelRules.accessible_courses || [];

                // Find course objects
                const levelCourses = courseIds.map(id => allCoursesData.find(c => c.id === id)).filter(Boolean);

                // Determine Level Status relative to User
                const thisLevelIdx = HIERARCHY.indexOf(levelName);

                const isPastLevel = userLevelIdx > thisLevelIdx;
                const isCurrentLevel = userLevelIdx === thisLevelIdx;
                const isFutureLevel = userLevelIdx < thisLevelIdx;

                levelCourses.forEach((course) => {
                    const isCompleted = completedIds.has(course.id);

                    let status = "locked";

                    if (isCompleted) {
                        // Already completed - always show as completed
                        status = "completed";
                    } else if (isFutureLevel) {
                        // Future level - always locked
                        status = "locked";
                    } else if (isPastLevel || isCurrentLevel) {
                        // Past or current level - apply sequential logic
                        if (!foundFirstIncomplete) {
                            // This is the FIRST incomplete node - make it active
                            status = "active";
                            foundFirstIncomplete = true;
                        } else {
                            // We already have an active node, lock subsequent ones
                            status = "locked";
                        }
                    }

                    builtPath.push({
                        ...course,
                        icon: ICONS[cumulativeIndex % ICONS.length], // Assign random icon
                        status: status,
                        levelContext: levelName, // To show markers
                        isFirstInLevel: builtPath.length === 0 || builtPath[builtPath.length - 1].levelContext !== levelName
                    });
                    cumulativeIndex++;
                });
            });

            // FALLBACK: If no courses were assigned to any level in the hierarchy,
            // show ALL available courses with sequential unlocking
            if (builtPath.length === 0 && allCoursesData.length > 0) {
                console.log("No curriculum hierarchy configured. Showing all courses with sequential unlock.");
                let fallbackFoundFirst = false;
                allCoursesData.forEach((course, idx) => {
                    const isCompleted = completedIds.has(course.id);
                    let status = "locked";

                    if (isCompleted) {
                        status = "completed";
                    } else if (!fallbackFoundFirst) {
                        status = "active";
                        fallbackFoundFirst = true;
                    }

                    builtPath.push({
                        ...course,
                        icon: ICONS[idx % ICONS.length],
                        status: status,
                        levelContext: 'Waffler',
                        isFirstInLevel: idx === 0
                    });
                });
            }


            // Update userProgress with calculated effective level for header display
            setUserProgress(prev => ({
                ...prev,
                current_level: userLevel,
                next_level: userLevelIdx < HIERARCHY.length - 1 ? HIERARCHY[userLevelIdx + 1] : null
            }));

            setLevels(builtPath);
            updateCarPosition(builtPath);

        } catch (error) {
            console.error("Error loading course path:", error);
        }
    };

    // Helper for milestones (rendering dividers between levels)
    const renderMilestones = () => {
        return levels.map((node, index) => {
            if (node.isFirstInLevel) {
                const pos = getPosition(index);
                const levelName = node.levelContext;
                const config = {
                    name: levelName,
                    icon: LEVEL_ICONS[levelName] || 'star',
                    color: LEVEL_COLORS[levelName] || '#6B7280'
                };

                // Determine if this milestone is "reached" (User is at or past this level)
                const userLvlIdx = HIERARCHY.indexOf(userProgress?.current_level || 'Waffler');
                const thisLvlIdx = HIERARCHY.indexOf(levelName);
                const isReached = userLvlIdx >= thisLvlIdx;

                return (
                    <View
                        key={`milestone-${levelName}`}
                        style={[
                            styles.milestoneBanner,
                            { top: pos.y - VERTICAL_SPACING / 2 - 40 }
                        ]}
                    >
                        <LinearGradient
                            colors={isReached ? [config.color, config.color] : ['#9CA3AF', '#6B7280']}
                            style={styles.milestoneGradient}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                        >
                            <MaterialCommunityIcons
                                name={config.icon}
                                size={20}
                                color="#FFF"
                            />
                            <Text style={styles.milestoneText}>{config.name}</Text>
                            {isReached && <MaterialCommunityIcons name="check-circle" size={16} color="#FFF" style={{ marginLeft: 6 }} />}
                        </LinearGradient>
                    </View>
                );
            }
            return null;
        });
    };

    // Replace getStageMilestones with new logic inside render
    // ... code structure ...


    const updateCarPosition = (currentLevels) => {
        // Find current active node index
        let activeIdx = currentLevels.findIndex(l => l.status === 'active');

        if (activeIdx === -1) {
            // usage case: All locked (new user/empty level) OR All completed.
            // Find last completed to determine progress
            const lastCompletedIdx = currentLevels.map(l => l.status).lastIndexOf('completed');

            if (lastCompletedIdx !== -1) {
                // If we have completions, park at the one after the last completed (if valid), or stay at last completed
                activeIdx = Math.min(lastCompletedIdx + 1, currentLevels.length - 1);
            } else {
                // If nothing completed and nothing active (all locked?), start at 0
                activeIdx = 0;
            }
        }

        const targetPos = getPosition(activeIdx);

        if (isFirstLoad.current) {
            // Initial placement - no animation
            carX.value = targetPos.x;
            carY.value = targetPos.y;
            isFirstLoad.current = false;
            prevActiveIndex.current = activeIdx;
        } else {
            // If progressed
            if (activeIdx > prevActiveIndex.current) {
                // Trigger Animation
                carX.value = withSpring(targetPos.x, { damping: 12 });
                carY.value = withTiming(targetPos.y, { duration: 1500, easing: Easing.bezier(0.25, 0.1, 0.25, 1) });

                // Show Confetti
                setShowConfetti(true);
                setTimeout(() => setShowConfetti(false), 4000);

                prevActiveIndex.current = activeIdx;
            } else {
                // Just sync if went backward or same
                carX.value = targetPos.x;
                carY.value = targetPos.y;
            }
        }
    };

    const getPosition = (index) => {
        const y = index * VERTICAL_SPACING + 100;
        const x = CENTER_X + Math.sin(index * Math.PI / 2) * AMPLITUDE;
        return { x, y };
    };

    // Animated Style for Car
    const carStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: carX.value - 30 }, // Centering (width 60)
            { translateY: carY.value - 40 }, // Resting on top
            { scale: withSequence(withTiming(1.1, { duration: 500 }), withTiming(1, { duration: 500 })) } // Idle breath
        ]
    }));

    const renderCurvedConnections = () => {
        return levels.map((item, index) => {
            if (index === levels.length - 1) return null;

            const curr = getPosition(index);
            const next = getPosition(index + 1);

            const cp1x = curr.x;
            const cp1y = curr.y + (VERTICAL_SPACING / 2);
            const cp2x = next.x;
            const cp2y = next.y - (VERTICAL_SPACING / 2);

            const isNextUnlocked = levels[index + 1].status !== "locked";
            const color = isNextUnlocked ? "#F59E0B" : "#E5E7EB";

            return (
                <Path
                    key={`path-${index}`}
                    d={`M ${curr.x} ${curr.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${next.x} ${next.y}`}
                    stroke={color}
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={!isNextUnlocked ? "15, 15" : ""}
                    fill="none"
                />
            )
        })
    }

    const handleNodePress = (item) => {
        // Allow re-playing completed, or playing active. Block locked.
        if (item.status === 'locked') return;
        setSelectedLevel(item);
    };

    const handleStartLesson = () => {
        const lessonToStart = selectedLevel;
        setSelectedLevel(null);
        setTimeout(() => {
            setActiveLesson(lessonToStart);
        }, 100);
    };

    const handleLessonClose = async (completionResult) => {
        setActiveLesson(null);

        // Check if a level up occurred from the lesson completion
        if (completionResult && completionResult.level_up && completionResult.new_level) {
            // Store previous level before refresh
            const previousLevel = userProgress?.current_level || 'Waffler';

            // Show celebration
            setLevelUpInfo({
                previousLevel: previousLevel,
                newLevel: completionResult.new_level
            });
            setShowConfetti(true);

            // Auto-hide confetti after animation
            setTimeout(() => setShowConfetti(false), 5000);
        }

        // Refresh progress to trigger car movement and update path
        await loadCoursePath();
        
        // Re-check advancement eligibility after course completion
        checkAdvancementEligibility();
    };

    const closeLevelUpModal = () => {
        setLevelUpInfo(null);
    };


    const totalHeight = levels.length * VERTICAL_SPACING + 250;

    return (
        <>
            <ScrollView
                style={styles.container}
                contentContainerStyle={{ height: totalHeight + 100 }}
                showsVerticalScrollIndicator={false}
            >
                {/* USER PROGRESS HEADER */}
                {userProgress && (
                    <View style={styles.progressHeader}>
                        <View style={styles.progressBadge}>
                            <MaterialCommunityIcons
                                name={LEVEL_ICONS[userProgress.current_level] || 'medal-outline'}
                                size={24}
                                color={LEVEL_COLORS[userProgress.current_level] || '#F59E0B'}
                            />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.progressTitle}>
                                {HIERARCHY.includes(userProgress.current_level) ? userProgress.current_level : 'Waffler'}
                            </Text>
                            <Text style={styles.progressSubtitle}>
                                {userProgress.completed_nodes || 0} courses completed
                            </Text>
                        </View>

                        {userProgress.next_level && (
                            <View style={styles.nextLevelBadge}>
                                <Text style={styles.nextLevelText}>
                                    {userProgress.nodes_remaining} to {userProgress.next_level}
                                </Text>
                            </View>
                        )}
                    </View>
                )}

                <View style={styles.pathArea}>
                    {/* DECORATIONS */}
                    <MaterialCommunityIcons name="cloud" size={50} color="#E5E7EB" style={{ position: 'absolute', top: 50, left: 20, opacity: 0.5 }} />
                    <MaterialCommunityIcons name="cloud" size={80} color="#E5E7EB" style={{ position: 'absolute', top: 300, right: -20, opacity: 0.5 }} />
                    <MaterialCommunityIcons name="star-four-points" size={30} color="#FCD34D" style={{ position: 'absolute', top: 150, left: 50 }} />

                    {/* LEVEL STAGE MILESTONES */}
                    {renderMilestones()}

                    {/* CONNECTIONS */}
                    <Svg height={totalHeight} width={width} style={styles.svgLayer}>
                        {renderCurvedConnections()}
                    </Svg>

                    {/* PLAYER CAR */}
                    <Animated.Image
                        source={CAR_IMAGE}
                        style={[styles.playerCar, carStyle]}
                        resizeMode="contain"
                    />

                    {/* NODES */}
                    {levels.map((item, index) => {
                        const { x, y } = getPosition(index);
                        return (
                            <PathNode
                                key={`${item.id}-${index}`}
                                item={item}
                                index={index}
                                x={x} y={y}
                                onPress={() => handleNodePress(item)}
                            />
                        );
                    })}
                </View>
            </ScrollView>

            <LevelDetailModal
                visible={!!selectedLevel}
                level={selectedLevel}
                onClose={() => setSelectedLevel(null)}
                onStart={handleStartLesson}
            />

            {/* FULL SCREEN LESSON VIEW */}
            {activeLesson && (
                <LessonView
                    lesson={activeLesson}
                    onClose={handleLessonClose}
                    userEmail={userEmail}
                />
            )}

            {/* CONFETTI OVERLAY */}
            <ConfettiSystem trigger={showConfetti} />

            {/* LEVEL UP CELEBRATION MODAL */}
            <LevelUpCelebrationModal
                visible={!!levelUpInfo}
                previousLevel={levelUpInfo?.previousLevel}
                newLevel={levelUpInfo?.newLevel}
                levelColor={LEVEL_COLORS[levelUpInfo?.newLevel] || '#F59E0B'}
                levelIcon={LEVEL_ICONS[levelUpInfo?.newLevel] || 'medal'}
                onClose={closeLevelUpModal}
            />

            {/* ROLE ADVANCEMENT BUTTON (Floating) */}
            {isEligibleForAdvancement && (
                <TouchableOpacity 
                    style={styles.advancementBtn}
                    onPress={() => setShowAdvancementExam(true)}
                >
                    <LinearGradient 
                        colors={['#10B981', '#059669']} 
                        style={styles.advancementBtnGradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                    >
                        <MaterialCommunityIcons name="arrow-up-bold-circle" size={22} color="#FFF" />
                        <View style={{ marginLeft: 10 }}>
                            <Text style={styles.advancementBtnLabel}>Ready for</Text>
                            <Text style={styles.advancementBtnText}>{advancementTarget}</Text>
                        </View>
                        <MaterialCommunityIcons name="chevron-right" size={24} color="#FFF" style={{ marginLeft: 'auto' }} />
                    </LinearGradient>
                </TouchableOpacity>
            )}

            {/* ROLE ADVANCEMENT EXAM MODAL */}
            <RoleAdvancementExam
                visible={showAdvancementExam}
                userEmail={userEmail}
                onComplete={handleAdvancementComplete}
                onClose={() => {
                    setShowAdvancementExam(false);
                    checkAdvancementEligibility(); // Re-check in case exam was taken
                }}
            />
        </>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    pathArea: {
        flex: 1,
        position: "relative",
    },
    svgLayer: {
        position: "absolute",
        top: 0,
        left: 0,
        zIndex: -1,
    },

    // NODE STYLES
    nodeWrapper: {
        position: "absolute",
        justifyContent: 'center',
        alignItems: 'center',
        width: (NODE_RADIUS + 10) * 2,
    },
    ringContainer: {
        padding: 8,
        borderRadius: 100,
    },
    touchableNode: {
        width: NODE_RADIUS * 2,
        height: NODE_RADIUS * 2,
    },
    nodeBase: {
        width: '100%',
        height: '100%',
        borderRadius: NODE_RADIUS,
        position: 'absolute',
        // The extrusion color
    },
    nodeFace: {
        width: '100%',
        height: '100%',
        borderRadius: NODE_RADIUS,
        justifyContent: 'center',
        alignItems: 'center',
        // border
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.2)",
    },
    shine: {
        position: 'absolute',
        top: 5,
        left: 10,
        width: 20,
        height: 10,
        borderRadius: 10,
        backgroundColor: "rgba(255,255,255,0.3)",
        transform: [{ rotate: '-20deg' }]
    },

    // CROWN
    crownContainer: {
        position: 'absolute',
        top: -38,
        left: 10,
    },
    crownShadow: {
        shadowColor: "#F59E0B",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.5,
        shadowRadius: 5,
    },

    // LABEL
    labelTag: {
        marginTop: 15,
        backgroundColor: "#FFF",
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    labelLocked: {
        backgroundColor: "#F3F4F6",
    },
    labelText: {
        fontFamily: "Poppins_600SemiBold",
        fontSize: 12,
        color: "#374151",
    },

    // MODAL
    modalOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: "rgba(0,0,0,0.5)",
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
    },
    modalContent: {
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        overflow: 'hidden',
        height: height * 0.45, // Half screen
    },
    modalGradient: {
        flex: 1,
        padding: 24,
    },
    dragHandle: {
        width: 40,
        height: 5,
        backgroundColor: "#E5E7EB",
        borderRadius: 3,
        alignSelf: 'center',
        marginBottom: 20,
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
    },
    modalIcon: {
        width: 64,
        height: 64,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
        shadowColor: "#F59E0B",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
    },
    modalTitle: {
        fontSize: 22,
        fontFamily: "Poppins_700Bold",
        color: "#111827",
    },
    modalStatus: {
        fontSize: 12,
        fontFamily: "Poppins_600SemiBold",
        color: "#F59E0B",
        marginTop: 4,
        letterSpacing: 1,
    },
    modalDesc: {
        fontSize: 14,
        fontFamily: "Poppins_400Regular",
        color: "#6B7280",
        lineHeight: 22,
        marginBottom: 24,
    },
    statsRow: {
        flexDirection: 'row',
        marginBottom: 30,
    },
    statItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginRight: 20,
        backgroundColor: "#FFF",
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#E5E7EB",
    },
    statText: {
        marginLeft: 6,
        fontSize: 14,
        fontFamily: "Poppins_500Medium",
        color: "#374151",
    },
    startBtn: {
        marginTop: 'auto',
        shadowColor: "#F59E0B",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 15,
        elevation: 10,
    },
    startBtnGradient: {
        paddingVertical: 18,
        borderRadius: 20,
        alignItems: 'center',
    },
    startBtnText: {
        color: "#FFF",
        fontSize: 18,
        fontFamily: "Poppins_700Bold",
        letterSpacing: 1,
    },
    playerCar: {
        width: 60,
        height: 60,
        position: 'absolute',
        zIndex: 20,
    },
    // Progress Header Styles
    progressHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        marginHorizontal: 16,
        marginTop: 10,
        marginBottom: 10,
        padding: 12,
        borderRadius: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 2,
    },
    progressBadge: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#FEF3C7',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    progressTitle: {
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
        color: '#111827',
    },
    progressSubtitle: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
    },
    nextLevelBadge: {
        backgroundColor: '#DBEAFE',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12,
    },
    nextLevelText: {
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
        color: '#3B82F6',
    },
    // Milestone Banner Styles
    milestoneBanner: {
        position: 'absolute',
        left: 20,
        right: 20,
        zIndex: 5,
        alignItems: 'center',
    },
    milestoneGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
        elevation: 3,
    },
    milestoneText: {
        fontSize: 13,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
        marginHorizontal: 8,
    },

    // ROLE ADVANCEMENT BUTTON
    advancementBtn: {
        position: 'absolute',
        bottom: 30,
        left: 20,
        right: 20,
        borderRadius: 16,
        overflow: 'hidden',
        shadowColor: '#10B981',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 10,
        elevation: 8,
    },
    advancementBtnGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 18,
    },
    advancementBtnLabel: {
        fontSize: 10,
        fontFamily: 'Poppins_500Medium',
        color: 'rgba(255,255,255,0.8)',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    advancementBtnText: {
        fontSize: 15,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
    },
});
