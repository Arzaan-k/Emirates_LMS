import React, { useState, useEffect, useRef } from "react";
import {
    View,
    Text,
    StyleSheet,
    ImageBackground,
    TouchableOpacity,
    Dimensions,
    Animated,
    Easing,
    ScrollView,
} from "react-native";
import { Ionicons, MaterialCommunityIcons, Feather, FontAwesome5 } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";

const { width, height } = Dimensions.get("window");

// --- ASSETS ---
const STORE_MAP_BG = "https://images.unsplash.com/photo-1556910103-1c02745a30bf?q=80&w=2000&auto=format&fit=crop"; // Placeholder for Iso Map
const ZONES = [
    { id: 'kitchen', title: 'The Kitchen', icon: 'chef-hat', x: 20, y: 30, color: '#EF4444' },
    { id: 'counter', title: 'Front Counter', icon: 'cash-register', x: 60, y: 40, color: '#F59E0B' },
    { id: 'dining', title: 'Dining Area', icon: 'table-chair', x: 40, y: 70, color: '#10B981' },
    { id: 'inventory', title: 'Inventory Room', icon: 'warehouse', x: 80, y: 20, color: '#6366F1' },
];

const TASKS = {
    'kitchen': {
        title: "Make a Classic Waffle (Kitchen)",
        bg: "https://images.unsplash.com/photo-1556910103-1c02745a30bf?q=80&w=2000&auto=format&fit=crop",
        steps: [
            { id: 'clean', label: "Sanitize Hands", x: 10, y: 70, icon: "hand-wash-outline" },
            { id: 'batter', label: "Pour Batter", x: 30, y: 50, icon: "cup-water" },
            { id: 'iron', label: "Close Iron", x: 50, y: 60, icon: "toaster-oven" },
            { id: 'timer', label: "Set Timer", x: 70, y: 40, icon: "timer-outline" },
            { id: 'serve', label: "Serve", x: 80, y: 80, icon: "room-service-outline" },
        ]
    },
    'counter': {
        title: "Take an Order (Front Counter)",
        bg: "https://images.unsplash.com/photo-1556742049-0cfed4f7a07d?q=80&w=2000&auto=format&fit=crop",
        steps: [
            { id: 'greet', label: "Greet Guest", x: 50, y: 30, icon: "emoticon-happy-outline" },
            { id: 'pos', label: "Enter Order", x: 50, y: 60, icon: "monitor-dashboard" },
            { id: 'pay', label: "Take Payment", x: 70, y: 60, icon: "credit-card" },
            { id: 'receipt', label: "Give Receipt", x: 30, y: 60, icon: "receipt" },
        ]
    },
    'dining': {
        title: "Sanitize Tables (Dining)",
        bg: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=2000&auto=format&fit=crop",
        steps: [
            { id: 'spray', label: "Spray Table", x: 20, y: 60, icon: "spray-bottle" },
            { id: 'wipe', label: "Wipe Down", x: 50, y: 50, icon: "hand-wash" },
            { id: 'reset', label: "Reset Chairs", x: 80, y: 60, icon: "chair-rolling" },
        ]
    },
    'inventory': {
        title: "Stock Check (Inventory)",
        bg: "https://images.unsplash.com/photo-1580674285054-bed31e145f59?q=80&w=2000&auto=format&fit=crop",
        steps: [
            { id: 'count', label: "Count Mix", x: 30, y: 40, icon: "counter" },
            { id: 'check', label: "Check Expiry", x: 60, y: 40, icon: "calendar-clock" },
            { id: 'log', label: "Log Data", x: 50, y: 70, icon: "clipboard-check" },
        ]
    }
};

export default function AIDigitalTwin({ onClose }) {
    const [viewMode, setViewMode] = useState('map'); // 'map' or 'zone'
    const [activeZone, setActiveZone] = useState(null);

    // Zone State
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [feedback, setFeedback] = useState("Select a Zone to start training.");
    const [feedbackType, setFeedbackType] = useState("info");
    const [score, setScore] = useState(100);
    const [mistakes, setMistakes] = useState(0);

    // Animations
    const pulseAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 1.2, duration: 800, useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
            ])
        ).start();
    }, []);

    const handleZoneSelect = (zoneId) => {
        setActiveZone(zoneId);
        setViewMode('zone');
        setCurrentStepIndex(0);
        setScore(100);
        setMistakes(0);
        setFeedback(`Welcome to ${TASKS[zoneId].title}. Follow the steps!`);
        setFeedbackType('info');
    };

    const handleStepPress = (stepIndex) => {
        const zoneTask = TASKS[activeZone];
        const expectedStep = zoneTask.steps[currentStepIndex];

        if (stepIndex === currentStepIndex) {
            setFeedbackType("success");
            setFeedback(`Correct! ${expectedStep.label} done.`);
            setCurrentStepIndex(prev => prev + 1);
        } else if (stepIndex > currentStepIndex) {
            setFeedbackType("error");
            setFeedback(`Wait! You need to ${expectedStep.label} first.`);
            setScore(prev => Math.max(0, prev - 10));
            setMistakes(prev => prev + 1);
        }
    };

    const isZoneComplete = activeZone && currentStepIndex >= TASKS[activeZone].steps.length;

    return (
        <View style={styles.container}>

            {/* -------------------- MAP VIEW -------------------- */}
            {viewMode === 'map' && (
                <View style={styles.mapContainer}>
                    <ImageBackground source={{ uri: STORE_MAP_BG }} style={styles.mapBg} blurRadius={5}>
                        <LinearGradient colors={["rgba(0,0,0,0.5)", "rgba(15, 23, 42, 0.9)"]} style={StyleSheet.absoluteFill} />

                        <View style={styles.mapHeader}>
                            <Text style={styles.mapTitle}>STORE 104 • DIGITAL TWIN</Text>
                            <Text style={styles.mapSub}>Select a Zone to Inspect</Text>
                        </View>

                        {/* ZONES */}
                        {ZONES.map((zone) => (
                            <TouchableOpacity
                                key={zone.id}
                                style={[styles.zonePin, { left: `${zone.x}%`, top: `${zone.y}%` }]}
                                onPress={() => handleZoneSelect(zone.id)}
                            >
                                <Animated.View style={[styles.zonePulse, { borderColor: zone.color, transform: [{ scale: pulseAnim }] }]} />
                                <View style={[styles.zoneIcon, { backgroundColor: zone.color }]}>
                                    <MaterialCommunityIcons name={zone.icon} size={24} color="#FFF" />
                                </View>
                                <View style={styles.zoneLabel}>
                                    <Text style={styles.zoneLabelText}>{zone.title}</Text>
                                </View>
                            </TouchableOpacity>
                        ))}
                    </ImageBackground>

                    <TouchableOpacity style={styles.closeBtnAbsolute} onPress={onClose}>
                        <Feather name="x" size={24} color="#FFF" />
                    </TouchableOpacity>
                </View>
            )}

            {/* -------------------- ZONE VIEW -------------------- */}
            {viewMode === 'zone' && activeZone && (
                <View style={styles.zoneContainer}>
                    <ImageBackground source={{ uri: TASKS[activeZone].bg }} style={styles.bgImage}>
                        <LinearGradient colors={["rgba(0,0,0,0.3)", "rgba(0,0,0,0.8)"]} style={styles.gradientOverlay} />

                        {/* HOTSPOTS */}
                        {!isZoneComplete && TASKS[activeZone].steps.map((step, index) => {
                            const isActive = index === currentStepIndex;
                            const isDone = index < currentStepIndex;
                            if (isDone) return null;

                            return (
                                <TouchableOpacity
                                    key={step.id}
                                    style={[styles.hotspot, { left: `${step.x}%`, top: `${step.y}%`, borderColor: isActive ? "#F59E0B" : "rgba(255,255,255,0.3)", backgroundColor: isActive ? "rgba(245, 158, 11, 0.2)" : "rgba(0,0,0,0.4)" }]}
                                    onPress={() => handleStepPress(index)}
                                >
                                    {isActive && <Animated.View style={[styles.pulseRing, { transform: [{ scale: pulseAnim }] }]} />}
                                    <MaterialCommunityIcons name={step.icon} size={24} color="#FFF" />
                                    {isActive && <View style={styles.labelTag}><Text style={styles.labelText}>{step.label}</Text></View>}
                                </TouchableOpacity>
                            );
                        })}
                    </ImageBackground>

                    {/* UI OVERLAY */}
                    <View style={styles.uiOverlay}>
                        {/* HEADER */}
                        <BlurView intensity={80} tint="dark" style={styles.header}>
                            <TouchableOpacity onPress={() => setViewMode('map')} style={styles.backBtn}>
                                <Feather name="arrow-left" size={24} color="#FFF" />
                            </TouchableOpacity>
                            <View style={styles.headerInfo}>
                                <Text style={styles.modeText}>LIVE SIMULATION</Text>
                                <Text style={styles.taskText}>{TASKS[activeZone].title}</Text>
                            </View>
                            <View style={styles.scoreContainer}>
                                <Text style={styles.scoreLabel}>SCORE</Text>
                                <Text style={[styles.scoreVal, { color: score > 80 ? "#10B981" : "#EF4444" }]}>{score}%</Text>
                            </View>
                        </BlurView>

                        {/* AI FEEDBACK */}
                        <View style={styles.aiHub}>
                            <BlurView intensity={90} tint="prominent" style={styles.aiHubBlur}>
                                <View style={styles.aiAvatar}>
                                    <MaterialCommunityIcons name="robot-happy" size={28} color="#FFF" />
                                </View>
                                <View style={styles.aiTextContainer}>
                                    <Text style={[styles.aiTitle, { color: feedbackType === 'error' ? '#EF4444' : feedbackType === 'success' ? '#10B981' : '#6366F1' }]}>
                                        {feedbackType === 'error' ? '⚠️ Mistake' : feedbackType === 'success' ? '✅ Great!' : '🤖 AI Guide'}
                                    </Text>
                                    <Text style={styles.aiMessage}>{feedback}</Text>
                                </View>
                            </BlurView>
                        </View>

                        {/* COMPLETION MODAL */}
                        {isZoneComplete && (
                            <View style={styles.completionOverlay}>
                                <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
                                <View style={styles.resultCard}>
                                    <MaterialCommunityIcons name="trophy" size={60} color="#F59E0B" style={{ marginBottom: 20 }} />
                                    <Text style={styles.resultTitle}>Zone Cleared!</Text>
                                    <Text style={styles.resultScore}>Score: {score}%</Text>
                                    <TouchableOpacity style={styles.finishBtn} onPress={() => setViewMode('map')}>
                                        <Text style={styles.finishBtnText}>Back to Map</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}
                    </View>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },

    // MAP VIEW
    mapContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    mapBg: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
    mapHeader: { position: 'absolute', top: 60, alignItems: 'center' },
    mapTitle: { color: "#FFF", fontSize: 24, fontFamily: "Poppins_700Bold", letterSpacing: 2 },
    mapSub: { color: "#94A3B8", fontSize: 14, fontFamily: "Poppins_400Regular" },
    closeBtnAbsolute: { position: 'absolute', top: 50, right: 20, padding: 10, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20 },

    zonePin: { position: 'absolute', alignItems: 'center' },
    zoneIcon: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 5 },
    zonePulse: { position: 'absolute', width: 70, height: 70, borderRadius: 35, borderWidth: 2, top: -10, left: -10, opacity: 0.6 },
    zoneLabel: { marginTop: 8, backgroundColor: 'rgba(0,0,0,0.8)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
    zoneLabelText: { color: "#FFF", fontSize: 10, fontFamily: "Poppins_700Bold" },

    // ZONE VIEW
    zoneContainer: { flex: 1 },
    bgImage: { flex: 1 },
    gradientOverlay: { ...StyleSheet.absoluteFillObject },

    hotspot: { position: 'absolute', width: 60, height: 60, borderRadius: 30, borderWidth: 2, justifyContent: 'center', alignItems: 'center', shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5, elevation: 5 },
    pulseRing: { position: 'absolute', width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: '#F59E0B', opacity: 0.5 },
    labelTag: { position: 'absolute', top: 65, backgroundColor: 'rgba(0,0,0,0.8)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
    labelText: { color: "#FFF", fontSize: 10, fontFamily: "Poppins_600SemiBold" },

    // UI OVERLAY
    uiOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between' },
    header: { flexDirection: 'row', alignItems: 'center', paddingTop: 50, paddingBottom: 20, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
    backBtn: { padding: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20, marginRight: 16 },
    headerInfo: { flex: 1 },
    modeText: { color: "#94A3B8", fontSize: 10, fontFamily: "Poppins_700Bold", letterSpacing: 1 },
    taskText: { color: "#FFF", fontSize: 16, fontFamily: "Poppins_600SemiBold" },
    scoreContainer: { alignItems: 'flex-end' },
    scoreLabel: { color: "#94A3B8", fontSize: 10, fontFamily: "Poppins_700Bold" },
    scoreVal: { fontSize: 20, fontFamily: "Poppins_700Bold" },

    aiHub: { padding: 20, paddingBottom: 40 },
    aiHubBlur: { flexDirection: 'row', padding: 16, borderRadius: 24, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.6)' },
    aiAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#1E293B', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
    aiTextContainer: { flex: 1, justifyContent: 'center' },
    aiTitle: { fontSize: 12, fontFamily: "Poppins_700Bold", marginBottom: 2, textTransform: 'uppercase' },
    aiMessage: { color: "#FFF", fontSize: 14, fontFamily: "Poppins_400Regular", lineHeight: 20 },

    completionOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', zIndex: 999 },
    resultCard: { width: '80%', padding: 30, backgroundColor: '#1E293B', borderRadius: 30, alignItems: 'center', shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 10 },
    resultTitle: { color: "#FFF", fontSize: 24, fontFamily: "Poppins_700Bold", marginBottom: 8 },
    resultScore: { color: "#10B981", fontSize: 32, fontFamily: "Poppins_700Bold", marginBottom: 20 },
    finishBtn: { backgroundColor: "#F59E0B", paddingHorizontal: 30, paddingVertical: 14, borderRadius: 16 },
    finishBtnText: { color: "#FFF", fontSize: 16, fontFamily: "Poppins_700Bold" },
});
