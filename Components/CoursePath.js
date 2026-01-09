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

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }, { translateX: shake.value }],
    }));

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

export default function CoursePath() {
    const [selectedLevel, setSelectedLevel] = useState(null);
    const [activeLesson, setActiveLesson] = useState(null);
    const [levels, setLevels] = useState([]);

    useEffect(() => {
        fetchPathNodes();
    }, []);

    const fetchPathNodes = async () => {
        try {
            console.log("Fetching path nodes from:", `${API_URL}/path/nodes`);
            const response = await fetch(`${API_URL}/path/nodes`);
            const data = await response.json();
            console.log("Path nodes response:", data);

            if (data && data.length > 0) {
                // Map backend data to UI Nodes
                const mappedLevels = data.map((item, index) => ({
                    id: item.videoUrl || index, // Use URL as unique ID
                    title: item.title,
                    desc: item.description,
                    transcript: item.transcript, // Pass transcript to lesson
                    icon: ICONS[index % ICONS.length], // Cycle through icons
                    status: index === 0 ? "active" : "locked", // Linear unlock logic: 1st Active, others Locked
                    lessonCount: 1, // Single video per node for now
                    xp: item.xp || 50,
                    videoUrl: item.videoUrl,
                    quiz: item.quiz
                }));
                setLevels(mappedLevels);
            } else {
                console.log("No path nodes found. Data:", data);
                // Optional: Force a refresh or show empty state
            }
        } catch (error) {
            console.error("Error fetching path:", error);
            // Alert for user feedback
            // alert("Debug: Error fetching path. Check console.");
        }
    };

    const getPosition = (index) => {
        const y = index * VERTICAL_SPACING + 100;
        const x = CENTER_X + Math.sin(index * Math.PI / 2) * AMPLITUDE;
        return { x, y };
    };

    const renderCurvedConnections = () => {
        // Create a single path string for optimized rendering?
        // Or multiple segments. Multiple segments allows coloring.
        return levels.map((item, index) => {
            if (index === levels.length - 1) return null;

            const curr = getPosition(index);
            const next = getPosition(index + 1);

            // Control Points for Curve
            const cp1x = curr.x;
            const cp1y = curr.y + (VERTICAL_SPACING / 2);
            const cp2x = next.x;
            const cp2y = next.y - (VERTICAL_SPACING / 2);

            const isUnlocked = levels[index + 1].status !== "locked";
            const color = isUnlocked ? "#F59E0B" : "#E5E7EB";

            return (
                <Path
                    key={`path-${index}`}
                    d={`M ${curr.x} ${curr.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${next.x} ${next.y}`}
                    stroke={color}
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={!isUnlocked ? "15, 15" : ""}
                    fill="none"
                />
            )
        })
    }

    const handleNodePress = (item) => {
        setSelectedLevel(item);
    };

    const handleStartLesson = () => {
        const lessonToStart = selectedLevel;
        setSelectedLevel(null); // Close modal
        // Small delay to allow modal exit animation if desired, or instant switch
        setTimeout(() => {
            setActiveLesson(lessonToStart);
        }, 100);
    };

    const totalHeight = levels.length * VERTICAL_SPACING + 250;

    return (
        <>
            <ScrollView
                style={styles.container}
                contentContainerStyle={{ height: totalHeight }}
                showsVerticalScrollIndicator={false}
            >
                {/* DEBUG OVERLAY */}
                {levels.length === 0 && (
                    <View style={{ padding: 20, backgroundColor: '#FEF2F2', margin: 20, borderRadius: 10, borderWidth: 1, borderColor: '#EF4444' }}>
                        <Text style={{ color: '#B91C1C', fontFamily: 'Poppins_700Bold' }}>DEBUG INFO:</Text>
                        <Text style={{ color: '#EF4444' }}>0 Path Nodes Loaded.</Text>
                        <Text style={{ color: '#EF4444', fontSize: 10, marginTop: 5 }}>API: {API_URL}</Text>
                        <Text style={{ color: '#EF4444', fontSize: 10 }}>Check console logs for details.</Text>
                    </View>
                )}

                <View style={styles.pathArea}>
                    {/* DECORATIONS */}
                    <MaterialCommunityIcons name="cloud" size={50} color="#E5E7EB" style={{ position: 'absolute', top: 50, left: 20, opacity: 0.5 }} />
                    <MaterialCommunityIcons name="cloud" size={80} color="#E5E7EB" style={{ position: 'absolute', top: 300, right: -20, opacity: 0.5 }} />
                    <MaterialCommunityIcons name="star-four-points" size={30} color="#FCD34D" style={{ position: 'absolute', top: 150, left: 50 }} />

                    {/* CONNECTIONS */}
                    <Svg height={totalHeight} width={width} style={styles.svgLayer}>
                        {renderCurvedConnections()}
                    </Svg>

                    {/* NODES */}
                    {levels.map((item, index) => {
                        const { x, y } = getPosition(index);
                        return (
                            <PathNode
                                key={item.id}
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
                    onClose={() => setActiveLesson(null)}
                />
            )}
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
});
