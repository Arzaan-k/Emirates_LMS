import React, { useState, useEffect } from "react";
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Image,
    TouchableOpacity,
    Dimensions,
    Alert,
    Switch,
    ActivityIndicator,
} from "react-native";
import { Feather, MaterialCommunityIcons, FontAwesome5 } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, G, Text as SvgText } from "react-native-svg";
import { useLanguage } from "../context/language.context";
import { Modal } from "react-native";
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import API_URL from '../config';
import ModeSwitcher from '../Components/ModeSwitcher';
import ModeIndicator from '../Components/ModeIndicator';

const { width } = Dimensions.get("window");

// --- PREMIUM ACTIVITY CALENDAR ---
const ActivityCalendar = ({ userEmail }) => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDay, setSelectedDay] = useState(null);
    const [modalVisible, setModalVisible] = useState(false);

    const [calendarLoading, setCalendarLoading] = useState(false);

    const today = new Date();
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const isCurrentMonth = month === today.getMonth() && year === today.getFullYear();

    const [activityData, setActivityData] = useState({});
    const [selectedTimeline, setSelectedTimeline] = useState([]);

    const fetchMonthData = async (targetDate) => {
        try {
            if (!userEmail) return;
            setCalendarLoading(true);

            const y = targetDate.getFullYear();
            const m = targetDate.getMonth() + 1;

            const res = await fetch(
                `${API_URL}/api/v1/analytics/calendar/month?user_email=${encodeURIComponent(userEmail)}&year=${y}&month=${m}`
            );
            const data = await res.json();

            if (res.ok && data && data.days) {
                const mapped = {};
                Object.keys(data.days).forEach((dayKey) => {
                    const dayNum = parseInt(dayKey, 10);
                    const d = data.days[dayKey] || {};
                    mapped[dayNum] = {
                        videos: d.videos || 0,
                        quizzes: d.quizzes || 0,
                        score: d.avg_score ?? 0,
                        focusTime: `${d.focus_minutes || 0}m`,
                        topSkill: d.topSkill || 'General',
                    };
                });
                setActivityData(mapped);
            } else {
                setActivityData({});
            }
        } catch (e) {
            console.error('Calendar month fetch failed:', e);
            setActivityData({});
        } finally {
            setCalendarLoading(false);
        }
    };

    const fetchDayData = async (targetDate) => {
        try {
            if (!userEmail) return null;
            const isoDay = targetDate.toISOString().slice(0, 10);
            const res = await fetch(
                `${API_URL}/api/v1/analytics/calendar/day?user_email=${encodeURIComponent(userEmail)}&day=${encodeURIComponent(isoDay)}`
            );
            const data = await res.json();
            if (res.ok && data && data.summary) {
                return data;
            }
            return null;
        } catch (e) {
            console.error('Calendar day fetch failed:', e);
            return null;
        }
    };

    useEffect(() => {
        fetchMonthData(currentDate);
    }, [userEmail]);

    useEffect(() => {
        fetchMonthData(currentDate);
    }, [year, month]);

    const changeMonth = (increment) => {
        const newDate = new Date(currentDate.setMonth(currentDate.getMonth() + increment));
        setCurrentDate(new Date(newDate));
    };

    const getDaysArray = () => {
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const firstDay = new Date(year, month, 1).getDay();
        const days = [];
        for (let i = 0; i < firstDay; i++) { days.push(null); }
        for (let i = 1; i <= daysInMonth; i++) { days.push(i); }
        return days;
    };

    const days = getDaysArray();
    const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    const handleDayPress = (day) => {
        if (!day) return;

        const local = activityData[day] || null;
        setSelectedDay({ day, ...(local || {}), year, month });
        setSelectedTimeline([]);
        setModalVisible(true);

        const target = new Date(year, month, day);
        fetchDayData(target).then((detail) => {
            if (!detail || !detail.summary) return;
            const summary = detail.summary;

            const timeline = detail?.items?.timeline;
            if (Array.isArray(timeline)) {
                setSelectedTimeline(timeline);
            }

            setSelectedDay((prev) => ({
                ...(prev || {}),
                day,
                year,
                month,
                videos: summary.videos || 0,
                quizzes: summary.quizzes || 0,
                score: summary.avg_score ?? 0,
                focusTime: `${summary.focus_minutes || 0}m`,
                topSkill: summary.topSkill || 'General',
            }));
        });
    };

    return (
        <View style={styles.calendarContainer}>
            {/* GLOW EFFECT */}
            <View style={styles.goldGlow} />

            {/* HEADER */}
            <View style={styles.calHeader}>
                <View>
                    <View style={styles.calBadge}>
                        <Feather name="zap" size={12} color="#B45309" />
                        <Text style={styles.calBadgeText}>PRO INSIGHTS</Text>
                    </View>
                    <Text style={styles.calSubtitle}>{currentDate.toLocaleDateString('default', { month: 'long', year: 'numeric' })}</Text>
                </View>
                <View style={styles.calControls}>
                    <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.calBtn}>
                        <Feather name="chevron-left" size={20} color="#78350F" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => changeMonth(1)} style={styles.calBtn}>
                        <Feather name="chevron-right" size={20} color="#78350F" />
                    </TouchableOpacity>
                </View>
            </View>

            {/* WEEKDAYS */}
            <View style={styles.weekRow}>
                {weekDays.map((d, i) => (
                    <Text key={i} style={styles.weekText}>{d}</Text>
                ))}
            </View>

            {/* DAYS GRID */}
            <View style={styles.daysGrid}>
                {days.map((day, index) => {
                    if (!day) return <View key={index} style={styles.dayCell} />;

                    const hasActivity = activityData[day];
                    const isToday = isCurrentMonth && day === today.getDate();

                    // ACTIVITY INTENSITY LOGIC (YELLOW/GOLD THEME)
                    let cellBg = 'transparent';
                    let cellText = '#4B5563';
                    let cellBorder = 'transparent';

                    if (hasActivity) {
                        const totalActs = hasActivity.videos + hasActivity.quizzes;
                        if (totalActs > 4) {
                            cellBg = '#F59E0B'; // Deep Gold
                            cellText = '#FFF';
                        } else if (totalActs > 0) {
                            cellBg = '#FEF3C7'; // Light Gold
                            cellText = '#92400E';
                        }
                    }

                    if (isToday) {
                        cellBorder = '#F59E0B';
                        if (!hasActivity) cellBg = '#FFFBEB';
                    }

                    return (
                        <TouchableOpacity
                            key={index}
                            style={[styles.dayCell]}
                            onPress={() => handleDayPress(day)}
                        >
                            <View style={[styles.dayBg, { backgroundColor: cellBg, borderColor: cellBorder, borderWidth: isToday ? 2 : 0 }]}>
                                <Text style={[styles.dayText, { color: cellText }]}>{day}</Text>
                                {/* Tiny Indicators */}
                                {hasActivity && (
                                    <View style={styles.dotRow}>
                                        {hasActivity.videos > 0 && <View style={[styles.dot, { backgroundColor: cellText === '#FFF' ? '#FFF' : '#F59E0B' }]} />}
                                        {hasActivity.quizzes > 0 && <View style={[styles.dot, { backgroundColor: cellText === '#FFF' ? 'rgba(255,255,255,0.7)' : '#D97706' }]} />}
                                    </View>
                                )}
                            </View>
                        </TouchableOpacity>
                    )
                })}
            </View>

            {calendarLoading && (
                <View style={{ marginTop: 8 }}>
                    <ActivityIndicator size="small" color="#F59E0B" />
                </View>
            )}

            {/* PREMIUM GOLD MODAL */}
            <Modal visible={modalVisible} transparent animationType="fade">
                <View style={styles.calModalOverlay}>
                    {/* BLUR EFFECT BACKGROUND */}
                    <View style={{ position: 'absolute', width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.6)' }} />

                    <View style={styles.goldModalContent}>
                        <LinearGradient
                            colors={['#F59E0B', '#D97706']}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                            style={styles.goldModalHeader}
                        >
                            <View>
                                <Text style={styles.goldModalDate}>
                                    {selectedDay?.day} {new Date(year, month).toLocaleString('default', { month: 'long' })}
                                </Text>
                                <Text style={styles.goldModalYear}>{year}</Text>
                            </View>
                            <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.goldCloseBtn}>
                                <Feather name="x" size={22} color="#FFF" />
                            </TouchableOpacity>
                        </LinearGradient>

                        <View style={styles.calModalBody}>
                            {selectedDay?.videos !== undefined ? (
                                <>
                                    <View style={styles.goldStatGrid}>
                                        {/* VIDEOS */}
                                        <View style={styles.goldStatItem}>
                                            <View style={styles.goldIconBg}><Feather name="play" size={18} color="#D97706" /></View>
                                            <Text style={styles.goldVal}>{selectedDay.videos}</Text>
                                            <Text style={styles.goldLabel}>Videos</Text>
                                        </View>
                                        {/* QUIZZES */}
                                        <View style={styles.goldStatItem}>
                                            <View style={styles.goldIconBg}><MaterialCommunityIcons name="note-text-outline" size={18} color="#D97706" /></View>
                                            <Text style={styles.goldVal}>{selectedDay.quizzes}</Text>
                                            <Text style={styles.goldLabel}>Quizzes</Text>
                                        </View>
                                        {/* TIME */}
                                        <View style={styles.goldStatItem}>
                                            <View style={styles.goldIconBg}><Feather name="clock" size={18} color="#D97706" /></View>
                                            <Text style={styles.goldVal}>{selectedDay.focusTime}</Text>
                                            <Text style={styles.goldLabel}>Focus</Text>
                                        </View>
                                    </View>

                                    {/* MAIN INSIGHT CARD */}
                                    <LinearGradient colors={['#FFFBEB', '#FEF3C7']} style={styles.insightCard}>
                                        <View style={styles.insightHeader}>
                                            <MaterialCommunityIcons name="lightning-bolt" size={20} color="#F59E0B" />
                                            <Text style={styles.insightTitle}>Performance Highlight</Text>
                                        </View>
                                        <Text style={styles.insightBig}>Top Skill: {selectedDay.topSkill}</Text>
                                        <View style={styles.scoreRow}>
                                            <Text style={styles.scoreLabel}>Daily Avg Score</Text>
                                            <View style={styles.scorePill}>
                                                <Text style={styles.scorePillText}>{selectedDay.score}%</Text>
                                            </View>
                                        </View>
                                    </LinearGradient>

                                    {/* DAILY TIMELINE */}
                                    <View style={{ marginTop: 12 }}>
                                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 8 }}>
                                            Activity Timeline
                                        </Text>

                                        {selectedTimeline.length === 0 ? (
                                            <View style={{ paddingVertical: 10 }}>
                                                <Text style={{ color: '#6B7280' }}>
                                                    No detailed activity items found for this date.
                                                </Text>
                                            </View>
                                        ) : (
                                            <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false}>
                                                {selectedTimeline.map((item, idx) => {
                                                    const t = item?.type || 'activity';
                                                    const title = item?.title || 'Activity';
                                                    const ts = item?.ts ? new Date(item.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                                                    const meta = item?.meta || {};

                                                    const iconName =
                                                        t === 'quiz' ? 'note-text-outline' :
                                                            t === 'assessment' ? 'shield-check' :
                                                                t === 'completion' ? 'check-circle' :
                                                                    t === 'simulation' ? 'gamepad-variant' :
                                                                        t === 'audit' ? 'clipboard-check-outline' :
                                                                            t === 'attendance' ? 'clock-outline' :
                                                                                t === 'video' ? 'play-circle-outline' :
                                                                                    'circle-outline';

                                                    return (
                                                        <View key={`${t}_${idx}`} style={{
                                                            backgroundColor: '#FFF',
                                                            borderRadius: 12,
                                                            padding: 12,
                                                            marginBottom: 8,
                                                            borderWidth: 1,
                                                            borderColor: '#F3F4F6'
                                                        }}>
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                                                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 8 }}>
                                                                    <View style={{
                                                                        width: 34,
                                                                        height: 34,
                                                                        borderRadius: 10,
                                                                        backgroundColor: '#FFFBEB',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        marginRight: 10
                                                                    }}>
                                                                        <MaterialCommunityIcons name={iconName} size={18} color="#D97706" />
                                                                    </View>
                                                                    <View style={{ flex: 1 }}>
                                                                        <Text style={{ fontWeight: '700', color: '#111827' }} numberOfLines={1}>
                                                                            {title}
                                                                        </Text>
                                                                        <Text style={{ color: '#6B7280', marginTop: 2 }} numberOfLines={2}>
                                                                            {t.toUpperCase()}{meta?.store ? ` • ${meta.store}` : ''}{meta?.category ? ` • ${meta.category}` : ''}{meta?.simulation_id ? ` • ${meta.simulation_id}` : ''}{meta?.node_id ? ` • ${meta.node_id}` : ''}
                                                                        </Text>
                                                                    </View>
                                                                </View>
                                                                <Text style={{ color: '#6B7280', fontWeight: '600' }}>{ts}</Text>
                                                            </View>

                                                            {(meta?.time_spent_seconds || meta?.time_taken_seconds || meta?.duration_minutes || meta?.score_percent || meta?.completion_rate || meta?.score) !== undefined && (
                                                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
                                                                    {meta?.time_spent_seconds ? (
                                                                        <Text style={{ color: '#374151', marginRight: 10 }}>
                                                                            Time: {Math.round(meta.time_spent_seconds / 60)}m
                                                                        </Text>
                                                                    ) : null}
                                                                    {meta?.time_taken_seconds ? (
                                                                        <Text style={{ color: '#374151', marginRight: 10 }}>
                                                                            Time: {Math.round(meta.time_taken_seconds / 60)}m
                                                                        </Text>
                                                                    ) : null}
                                                                    {meta?.duration_minutes ? (
                                                                        <Text style={{ color: '#374151', marginRight: 10 }}>
                                                                            Duration: {meta.duration_minutes}m
                                                                        </Text>
                                                                    ) : null}
                                                                    {meta?.score_percent !== undefined && meta?.score_percent !== null ? (
                                                                        <Text style={{ color: '#374151', marginRight: 10 }}>
                                                                            Score: {Math.round(meta.score_percent)}%
                                                                        </Text>
                                                                    ) : null}
                                                                    {meta?.score !== undefined && meta?.score !== null ? (
                                                                        <Text style={{ color: '#374151', marginRight: 10 }}>
                                                                            Score: {Math.round(meta.score)}
                                                                        </Text>
                                                                    ) : null}
                                                                    {meta?.completion_rate !== undefined && meta?.completion_rate !== null ? (
                                                                        <Text style={{ color: '#374151', marginRight: 10 }}>
                                                                            Audit: {Math.round(meta.completion_rate)}%
                                                                        </Text>
                                                                    ) : null}
                                                                </View>
                                                            )}
                                                        </View>
                                                    );
                                                })}
                                                <View style={{ height: 10 }} />
                                            </ScrollView>
                                        )}
                                    </View>
                                </>
                            ) : (
                                <View style={styles.noActivity}>
                                    <Feather name="moon" size={48} color="#E5E7EB" />
                                    <Text style={styles.noActText}>Rest Day. No activity recorded.</Text>
                                    <TouchableOpacity style={styles.startBtn} onPress={() => setModalVisible(false)}>
                                        <Text style={styles.startBtnText}>Start Learning</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

// --- MOCK DATA ---
const COMPLETED_LESSONS = [
    { id: 1, title: "Espresso Mastery 101", date: "Dec 05", score: "100%", icon: "coffee" },
    { id: 2, title: "Hygiene Protocols", date: "Dec 04", score: "95%", icon: "shield-check" },
    { id: 3, title: "Customer Empathy", date: "Dec 02", score: "90%", icon: "heart-outline" },
];

const INCOMPLETE_LESSONS = [
    { id: 4, title: "Advanced Waffle Textures", progress: 0.7, due: "Today" },
    { id: 5, title: "Inventory Management", progress: 0.3, due: "Tomorrow" },
];

const EXTRA_CREDIT = [
    { id: 6, title: "Mystery Shopper Sim", xp: "+500 XP", tag: "RECOMMENDED" },
    { id: 7, title: "Speed Service Drill", xp: "+200 XP", tag: "OPTIONAL" },
];

const BADGES = [
    { id: 1, name: "Early Bird", icon: "weather-sunny", color: "#F59E0B", bg: "#FEF3C7" },
    { id: 2, name: "Fast Learner", icon: "lightning-bolt", color: "#EF4444", bg: "#FEE2E2" },
    { id: 3, name: "Team Player", icon: "account-group", color: "#3B82F6", bg: "#DBEAFE" },
    { id: 4, name: "Safety First", icon: "shield-check", color: "#10B981", bg: "#D1FAE5" },
];

// --- INTERACTIVE DONUT CHART ---
const DonutChart = () => {
    const { t } = useLanguage();
    const size = 180;
    const strokeWidth = 20;
    const center = size / 2;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;

    // Data: Completed, Incomplete, Extra
    const total = 50 + 20 + 30;
    const data = [
        { key: 'completed', value: 50, color: '#10B981', label: t('completed') },
        { key: 'incomplete', value: 20, color: '#EF4444', label: t('incomplete') },
        { key: 'extra', value: 30, color: '#F59E0B', label: t('extraCredit') },
    ];

    const [activeSection, setActiveSection] = useState(data[0]);

    let startAngle = -90;

    return (
        <View style={styles.chartContainer}>
            <View style={styles.chartTitleRow}>
                <Text style={styles.chartMainTitle}>{t('learningBreakdown')}</Text>
                <TouchableOpacity style={styles.chartFilter}><Text style={styles.chartFilterText}>{t('thisWeek')}</Text></TouchableOpacity>
            </View>

            <View style={styles.chartRow}>
                <View style={{ width: size, height: size }}>
                    <Svg width={size} height={size}>
                        <G rotation="-90" origin={`${center}, ${center}`}>
                            {data.map((item, index) => {
                                const strokeDashoffset = circumference - (circumference * item.value) / 100;
                                const angle = (item.value / 100) * 360;
                                const currentAngle = startAngle;
                                startAngle += angle;

                                return (
                                    <Circle
                                        key={item.key}
                                        cx={center}
                                        cy={center}
                                        r={radius}
                                        stroke={item.color}
                                        strokeWidth={activeSection.key === item.key ? strokeWidth + 6 : strokeWidth}
                                        strokeDasharray={`${circumference} ${circumference}`}
                                        strokeDashoffset={strokeDashoffset}
                                        strokeLinecap="round"
                                        rotation={(currentAngle + 90) + (index * 2)} // mild gap
                                        origin={`${center}, ${center}`}
                                        onPress={() => setActiveSection(item)}
                                        fill="transparent"
                                    />
                                );
                            })}
                        </G>
                        {/* Center Text */}
                        <SvgText x={center} y={center - 10} textAnchor="middle" fontSize="28" fontWeight="bold" fill="#111827">
                            {activeSection.value}%
                        </SvgText>
                        <SvgText x={center} y={center + 15} textAnchor="middle" fontSize="12" fill="#6B7280" fontFamily="Poppins_500Medium">
                            {activeSection.label}
                        </SvgText>
                    </Svg>
                </View>

                {/* LEGEND */}
                <View style={styles.legendContainer}>
                    {data.map((item) => (
                        <TouchableOpacity
                            key={item.key}
                            style={[styles.legendItem, activeSection.key === item.key && styles.legendItemActive]}
                            onPress={() => setActiveSection(item)}
                        >
                            <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                            <View>
                                <Text style={styles.legendVal}>{item.value}%</Text>
                                <Text style={styles.legendLabel}>{item.label}</Text>
                            </View>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>
        </View>
    );
};


export default function Profile({ navigation, route }) {
    const insets = useSafeAreaInsets();
    const { t } = useLanguage();
    const userProfile = route?.params?.userProfile || { name: 'Aditya User', email: 'user' };

    // User Mode State
    const [userMode, setUserMode] = useState('user');

    // Location Tracking State
    const [locationEnabled, setLocationEnabled] = useState(false);
    const [locationInterval, setLocationInterval] = useState(null);
    const [lastLocationUpdate, setLastLocationUpdate] = useState(null);

    // Punch In/Out State
    const [isPunchedIn, setIsPunchedIn] = useState(false);
    const [punchInTime, setPunchInTime] = useState(null);
    const [punchOutTime, setPunchOutTime] = useState(null);
    const [workDuration, setWorkDuration] = useState('0h 0m');

    // Location Tracking Functions
    const startLocationTracking = async () => {
        try {
            // Request permission
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission Denied', 'Location permission is required for tracking');
                return;
            }

            setLocationEnabled(true);

            // Start interval
            const interval = setInterval(async () => {
                try {
                    let location = await Location.getCurrentPositionAsync({});
                    const { latitude, longitude } = location.coords;
                    const timestamp = new Date().toISOString();

                    // Send to backend
                    await fetch(`${API_URL}/api/v1/tracking/location/update`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            user_email: userProfile.email,
                            latitude,
                            longitude,
                            timestamp
                        })
                    });

                    setLastLocationUpdate(new Date().toLocaleTimeString());
                } catch (error) {
                    console.error('Location update error:', error);
                }
            }, 10000); // 10 seconds

            setLocationInterval(interval);
            Alert.alert('Tracking Started', 'Your location is being shared every 10 seconds');
        } catch (error) {
            console.error('Start tracking error:', error);
            Alert.alert('Error', 'Failed to start location tracking');
        }
    };

    const stopLocationTracking = async () => {
        if (locationInterval) {
            clearInterval(locationInterval);
            setLocationInterval(null);
        }
        setLocationEnabled(false);
        setLastLocationUpdate(null);

        // Notify backend
        try {
            await fetch(`${API_URL}/api/v1/tracking/location/stop`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_email: userProfile.email })
            });
        } catch (error) {
            console.error('Stop tracking error:', error);
        }

        Alert.alert('Tracking Stopped', 'Location sharing has been disabled');
    };

    const handleLocationToggle = (value) => {
        if (value) {
            startLocationTracking();
        } else {
            stopLocationTracking();
        }
    };

    // Punch In/Out Functions
    const handlePunchIn = async () => {
        const now = new Date();
        setPunchInTime(now);
        setIsPunchedIn(true);

        try {
            await fetch(`${API_URL}/api/v1/tracking/attendance/punch-in`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_email: userProfile.email,
                    timestamp: now.toISOString()
                })
            });
            Alert.alert('Punched In', `Work started at ${now.toLocaleTimeString()}`);
        } catch (error) {
            console.error('Punch in error:', error);
            Alert.alert('Error', 'Failed to punch in');
        }
    };

    const handlePunchOut = async () => {
        const now = new Date();
        setPunchOutTime(now);
        setIsPunchedIn(false);

        if (punchInTime) {
            const duration = now - punchInTime;
            const hours = Math.floor(duration / (1000 * 60 * 60));
            const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
            setWorkDuration(`${hours}h ${minutes}m`);
        }

        try {
            await fetch(`${API_URL}/api/v1/tracking/attendance/punch-out`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_email: userProfile.email,
                    timestamp: now.toISOString()
                })
            });
            Alert.alert('Punched Out', `Work ended at ${now.toLocaleTimeString()}\nDuration: ${workDuration}`);
        } catch (error) {
            console.error('Punch out error:', error);
            Alert.alert('Error', 'Failed to punch out');
        }
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (locationInterval) {
                clearInterval(locationInterval);
            }
        };
    }, [locationInterval]);

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
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>

                {/* HEADER & IDENTITY */}
                <View style={styles.header}>
                    <View style={styles.identityRow}>
                        <View style={styles.avatarWrapper}>
                            <Image
                                source={{ uri: `https://ui-avatars.com/api/?name=${userProfile.name}&background=F59E0B&color=fff&size=200` }}
                                style={styles.avatar}
                            />
                            <View style={styles.onlineIndicator} />
                        </View>
                        <View style={styles.userInfo}>
                            <Text style={styles.userName}>{userProfile.name}</Text>
                            <Text style={styles.userRole}>{userProfile.role} • Mumbai</Text>
                            <View style={styles.joinDateBadge}>
                                <Feather name="calendar" size={10} color="#6B7280" />
                                <Text style={styles.joinDateText}>{t('joined')} Nov 2024</Text>
                            </View>
                        </View>
                        <TouchableOpacity style={styles.settingsBtn} onPress={() => navigation.navigate('Settings')}>
                            <Feather name="settings" size={20} color="#374151" />
                        </TouchableOpacity>
                    </View>

                    {/* LEAGUE CARD */}
                    <LinearGradient
                        colors={["#4F46E5", "#7C3AED"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.leagueCard}
                    >
                        <View style={styles.leagueInfo}>
                            <View style={styles.leagueIcon}>
                                <MaterialCommunityIcons name="trophy" size={24} color="#FBBF24" />
                            </View>
                            <View>
                                <Text style={styles.leagueTitle}>{t('diamondLeague')}</Text>
                                <Text style={styles.leagueRank}>{t('rank')} #4 • {t('top')} 5%</Text>
                            </View>
                        </View>
                        <View style={styles.xpBlock}>
                            <Text style={styles.xpBig}>2,400</Text>
                            <Text style={styles.xpLabel}>{t('totalXP')}</Text>
                        </View>
                    </LinearGradient>
                </View>

                {/* MODE INDICATOR & SWITCHER */}
                <View style={styles.modeSection}>
                    <ModeIndicator mode={userMode} style={{ marginBottom: 12 }} />
                    <ModeSwitcher
                        navigation={navigation}
                        currentMode={userMode}
                        userProfile={userProfile}
                    />
                </View>

                {/* LOCATION TRACKING CARD */}
                <View style={styles.trackingCard}>
                    <View style={styles.trackingHeader}>
                        <View style={styles.trackingIcon}>
                            <Feather name="map-pin" size={20} color="#10B981" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.trackingTitle}>Location Sharing</Text>
                            <Text style={styles.trackingSubtitle}>
                                {locationEnabled ? `📍 Active • Last update: ${lastLocationUpdate || 'Starting...'}` : 'Enable to share your location'}
                            </Text>
                        </View>
                        <Switch
                            value={locationEnabled}
                            onValueChange={handleLocationToggle}
                            trackColor={{ false: '#E5E7EB', true: '#DCFCE7' }}
                            thumbColor={locationEnabled ? '#10B981' : '#9CA3AF'}
                        />
                    </View>
                    {locationEnabled && (
                        <View style={styles.trackingInfo}>
                            <Feather name="info" size={14} color="#6B7280" />
                            <Text style={styles.trackingInfoText}>
                                Updates every 10 seconds. Visible to Store Manager.
                            </Text>
                        </View>
                    )}
                </View>

                {/* PUNCH IN/OUT CARD */}
                <View style={styles.attendanceCard}>
                    <View style={styles.attendanceHeader}>
                        <View style={styles.attendanceIcon}>
                            <Feather name="clock" size={20} color="#F59E0B" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.attendanceTitle}>Attendance</Text>
                            <Text style={styles.attendanceSubtitle}>
                                {isPunchedIn
                                    ? `🕐 Punched in at ${punchInTime?.toLocaleTimeString()}`
                                    : punchOutTime
                                        ? `✅ Worked ${workDuration} today`
                                        : 'Start your shift'}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.punchRow}>
                        <TouchableOpacity
                            style={[
                                styles.punchBtn,
                                isPunchedIn && styles.punchBtnDisabled
                            ]}
                            onPress={handlePunchIn}
                            disabled={isPunchedIn}
                        >
                            <LinearGradient
                                colors={isPunchedIn ? ['#E5E7EB', '#D1D5DB'] : ['#10B981', '#059669']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.punchGradient}
                            >
                                <Feather name="log-in" size={18} color="#FFF" />
                                <Text style={styles.punchText}>Punch In</Text>
                            </LinearGradient>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[
                                styles.punchBtn,
                                !isPunchedIn && styles.punchBtnDisabled
                            ]}
                            onPress={handlePunchOut}
                            disabled={!isPunchedIn}
                        >
                            <LinearGradient
                                colors={!isPunchedIn ? ['#E5E7EB', '#D1D5DB'] : ['#EF4444', '#DC2626']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.punchGradient}
                            >
                                <Feather name="log-out" size={18} color="#FFF" />
                                <Text style={styles.punchText}>Punch Out</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* PREMIUM CALENDAR */}
                <ActivityCalendar userEmail={userProfile.email} />

                {/* ANALYTICS GRAPH */}
                <DonutChart />

                {/* ORGANIZATIONAL HIERARCHY NAVIGATION */}
                <TouchableOpacity
                    style={styles.navCard}
                    onPress={() => navigation.navigate('Hierarchy', { userProfile })}
                >
                    <LinearGradient
                        colors={["#4F46E5", "#7C3AED"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.navCardGradient}
                    >
                        <View style={styles.navCardIcon}>
                            <MaterialCommunityIcons name="sitemap" size={24} color="#FFF" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.navCardTitle}>{t('viewOrgHierarchy') || 'View Organizational Hierarchy'}</Text>
                            <Text style={styles.navCardSub}>See reporting structure & leadership</Text>
                        </View>
                        <Feather name="chevron-right" size={20} color="#FFF" />
                    </LinearGradient>
                </TouchableOpacity>

                {/* SECTIONS LIST */}
                <View style={styles.listSection}>

                    {/* INCOMPLETE */}
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>{t('inProgress')}</Text>
                        <TouchableOpacity><Text style={styles.seeAll}>{t('seeAll')}</Text></TouchableOpacity>
                    </View>
                    {INCOMPLETE_LESSONS.map((item) => (
                        <View key={item.id} style={styles.taskCard}>
                            <View>
                                <Text style={styles.taskTitle}>{item.title}</Text>
                                <Text style={styles.taskDue}>{t('due')}: {item.due}</Text>
                            </View>
                            <View style={styles.progressCircle}>
                                <Text style={styles.progressText}>{item.progress * 100}%</Text>
                            </View>
                        </View>
                    ))}

                    <View style={{ height: 20 }} />

                    {/* COMPLETED */}
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>{t('completed')} ✅</Text>
                        <TouchableOpacity><Text style={styles.seeAll}>{t('history')}</Text></TouchableOpacity>
                    </View>
                    {COMPLETED_LESSONS.map((item) => (
                        <View key={item.id} style={styles.completedCard}>
                            <View style={styles.completedIcon}>
                                <MaterialCommunityIcons name={item.icon} size={20} color="#10B981" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.completedTitle}>{item.title}</Text>
                                <Text style={styles.completedDate}>{item.date}</Text>
                            </View>
                            <View style={styles.scoreBadge}>
                                <Text style={styles.scoreText}>{item.score}</Text>
                            </View>
                        </View>
                    ))}

                    <View style={{ height: 20 }} />

                    {/* EXTRA CREDIT */}
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>{t('extraCredit')} 🚀</Text>
                    </View>
                    {EXTRA_CREDIT.map((item) => (
                        <LinearGradient key={item.id} colors={['#FFF7ED', '#FFF']} style={styles.extraCard}>
                            <View>
                                <View style={styles.extraTag}><Text style={styles.extraTagText}>{item.tag}</Text></View>
                                <Text style={styles.extraTitle}>{item.title}</Text>
                            </View>
                            <View style={styles.xpBadge}>
                                <Text style={styles.xpBadgeText}>{item.xp}</Text>
                            </View>
                        </LinearGradient>
                    ))}
                </View>

                {/* BADGES */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>{t('achievements')}</Text>
                        <TouchableOpacity><Text style={styles.seeAll}>{t('seeAll')}</Text></TouchableOpacity>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: 20 }}>
                        {BADGES.map((badge) => (
                            <View key={badge.id} style={styles.badgeCard}>
                                <View style={[styles.badgeCircle, { backgroundColor: badge.bg }]}>
                                    <MaterialCommunityIcons name={badge.icon} size={32} color={badge.color} />
                                </View>
                                <Text style={styles.badgeName}>{badge.name}</Text>
                            </View>
                        ))}
                    </ScrollView>
                </View>

            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#F9FAFB" },
    header: { backgroundColor: "#FFF", paddingBottom: 20, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, paddingHorizontal: 20, elevation: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10 },
    identityRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, marginTop: 10 },
    avatarWrapper: { position: 'relative' },
    avatar: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: "#F3F4F6" },
    onlineIndicator: { position: 'absolute', bottom: 2, right: 2, width: 14, height: 14, borderRadius: 7, backgroundColor: "#10B981", borderWidth: 2, borderColor: "#FFF" },
    userInfo: { flex: 1, marginLeft: 16 },
    userName: { fontSize: 20, fontFamily: "Poppins_700Bold", color: "#111827" },
    userRole: { fontSize: 12, fontFamily: "Poppins_400Regular", color: "#6B7280", marginBottom: 4 },
    joinDateBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: "#F3F4F6", alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
    joinDateText: { fontSize: 10, color: "#6B7280", marginLeft: 4, fontFamily: "Poppins_500Medium" },
    settingsBtn: { padding: 10, backgroundColor: "#F3F4F6", borderRadius: 12 },

    leagueCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderRadius: 24 },
    leagueInfo: { flexDirection: 'row', alignItems: 'center' },
    leagueIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.2)", justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    leagueTitle: { color: "#FFF", fontSize: 16, fontFamily: "Poppins_700Bold" },
    leagueRank: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontFamily: "Poppins_500Medium" },
    xpBlock: { alignItems: 'flex-end' },
    xpBig: { color: "#FFF", fontSize: 22, fontFamily: "Poppins_700Bold" },
    xpLabel: { color: "rgba(255,255,255,0.8)", fontSize: 10, fontFamily: "Poppins_500Medium" },

    // CHART
    chartContainer: { backgroundColor: "#FFF", margin: 20, borderRadius: 24, padding: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
    chartTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    chartMainTitle: { fontSize: 16, fontFamily: "Poppins_700Bold", color: "#111827" },
    chartFilter: { backgroundColor: "#F3F4F6", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
    chartFilterText: { fontSize: 12, fontFamily: "Poppins_600SemiBold", color: "#4B5563" },
    chartRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    legendContainer: { flex: 1, marginLeft: 20 },
    legendItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, padding: 8, borderRadius: 12 },
    legendItemActive: { backgroundColor: '#F9FAFB' },
    legendDot: { width: 12, height: 12, borderRadius: 6, marginRight: 12 },
    legendVal: { fontSize: 16, fontFamily: "Poppins_700Bold", color: "#111827" },
    legendLabel: { fontSize: 12, fontFamily: "Poppins_400Regular", color: "#6B7280" },

    // LIST SECTIONS
    listSection: { paddingHorizontal: 20 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    sectionTitle: { fontSize: 16, fontFamily: "Poppins_700Bold", color: "#111827" },
    seeAll: { fontSize: 13, color: "#F59E0B", fontFamily: "Poppins_600SemiBold" },

    taskCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: "#FFF", padding: 16, borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: '#F3F4F6' },
    taskTitle: { fontSize: 14, fontFamily: "Poppins_600SemiBold", color: "#111827" },
    taskDue: { fontSize: 12, color: "#EF4444", fontFamily: "Poppins_500Medium", marginTop: 2 },
    progressCircle: { width: 40, height: 40, borderRadius: 20, borderWidth: 3, borderColor: "#E5E7EB", justifyContent: 'center', alignItems: 'center' },
    progressText: { fontSize: 10, fontFamily: "Poppins_700Bold", color: "#4B5563" },

    completedCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: "#FFF", padding: 12, borderRadius: 16, marginBottom: 10 },
    completedIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#D1FAE5", justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    completedTitle: { fontSize: 14, fontFamily: "Poppins_600SemiBold", color: "#111827" },
    completedDate: { fontSize: 12, color: "#9CA3AF", fontFamily: "Poppins_400Regular" },
    scoreBadge: { backgroundColor: "#D1FAE5", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    scoreText: { color: "#10B981", fontSize: 12, fontFamily: "Poppins_700Bold" },

    extraCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: '#FED7AA' },
    extraTag: { backgroundColor: "#FFEDD5", alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginBottom: 4 },
    extraTagText: { fontSize: 10, color: "#C2410C", fontFamily: "Poppins_700Bold" },
    extraTitle: { fontSize: 14, fontFamily: "Poppins_600SemiBold", color: "#111827" },
    xpBadge: { backgroundColor: "#C2410C", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
    xpBadgeText: { color: "#FFF", fontSize: 12, fontFamily: "Poppins_700Bold" },

    // BADGES
    section: { paddingVertical: 24 },
    badgeCard: { marginRight: 16, alignItems: 'center', width: 90 },
    badgeCircle: { width: 70, height: 70, borderRadius: 35, justifyContent: 'center', alignItems: 'center', marginBottom: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
    badgeName: { fontSize: 12, fontFamily: "Poppins_500Medium", color: "#374151", textAlign: 'center' },

    // NAV CARD
    navCard: { marginHorizontal: 20, marginBottom: 24, borderRadius: 24, overflow: 'hidden', elevation: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8 },
    navCardGradient: { flexDirection: 'row', alignItems: 'center', padding: 20 },
    navCardIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.2)", justifyContent: 'center', alignItems: 'center', marginRight: 16 },
    navCardTitle: { color: "#FFF", fontSize: 15, fontFamily: "Poppins_700Bold" },
    navCardSub: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontFamily: "Poppins_400Regular" },

    // CALENDAR STYLES (GOLDEN THEME)
    calendarContainer: { marginHorizontal: 20, marginBottom: 24, padding: 20, backgroundColor: '#FFF', borderRadius: 24, shadowColor: "#F59E0B", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 15, elevation: 5, borderWidth: 1, borderColor: '#FFFBEB', overflow: 'hidden' },
    goldGlow: { position: 'absolute', top: -50, right: -50, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(245, 158, 11, 0.1)' },

    calHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    calBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start', marginBottom: 4 },
    calBadgeText: { fontSize: 10, fontFamily: "Poppins_700Bold", color: "#B45309", marginLeft: 4, letterSpacing: 1 },
    calSubtitle: { fontSize: 18, fontFamily: "Poppins_700Bold", color: "#111827" },

    calControls: { flexDirection: 'row', backgroundColor: '#F3F4F6', borderRadius: 12, padding: 2 },
    calBtn: { padding: 8, borderRadius: 10 },

    weekRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
    weekText: { width: (width - 80) / 7, textAlign: 'center', fontSize: 12, fontFamily: "Poppins_600SemiBold", color: "#9CA3AF" },
    daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    dayCell: { width: (width - 80) / 7, aspectRatio: 1, padding: 3 },
    dayBg: { flex: 1, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    dayText: { fontSize: 12, fontFamily: "Poppins_600SemiBold" },
    dotRow: { flexDirection: 'row', position: 'absolute', bottom: 3, gap: 2 },
    dot: { width: 3, height: 3, borderRadius: 1.5 },

    // GOLD MODAL STYLES
    calModalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
    goldModalContent: { width: '100%', maxWidth: 320, backgroundColor: '#FFF', borderRadius: 24, overflow: 'hidden', shadowColor: "#F59E0B", shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.3, shadowRadius: 30, elevation: 20 },
    goldModalHeader: { padding: 20, paddingTop: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    goldModalDate: { color: '#FFF', fontSize: 20, fontFamily: "Poppins_700Bold" },
    goldModalYear: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontFamily: "Poppins_500Medium" },
    goldCloseBtn: { padding: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12 },

    calModalBody: { padding: 24 },
    goldStatGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
    goldStatItem: { alignItems: 'center', flex: 1 },
    goldIconBg: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#FFFBEB', justifyContent: 'center', alignItems: 'center', marginBottom: 8, borderWidth: 1, borderColor: '#FEF3C7' },
    goldVal: { fontSize: 16, fontFamily: "Poppins_700Bold", color: "#111827" },
    goldLabel: { fontSize: 11, fontFamily: "Poppins_500Medium", color: "#9CA3AF" },

    insightCard: { padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#FDE68A' },
    insightHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    insightTitle: { fontSize: 12, fontFamily: "Poppins_700Bold", color: "#B45309", marginLeft: 6, letterSpacing: 1 },
    insightBig: { fontSize: 16, fontFamily: "Poppins_600SemiBold", color: "#451A03", marginBottom: 12 },
    scoreRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: 'rgba(245, 158, 11, 0.2)', paddingTop: 12 },
    scoreLabel: { fontSize: 12, color: "#92400E", fontFamily: "Poppins_500Medium" },
    scorePill: { backgroundColor: "#FFF", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, shadowColor: "#F59E0B", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 1 },
    scorePillText: { fontSize: 12, fontFamily: "Poppins_700Bold", color: "#D97706" },

    noActivity: { alignItems: 'center', paddingVertical: 30 },
    noActText: { color: '#9CA3AF', marginTop: 12, fontFamily: "Poppins_400Regular", marginBottom: 20 },
    startBtn: { backgroundColor: '#F59E0B', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, shadowColor: "#F59E0B", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
    startBtnText: { color: '#FFF', fontSize: 14, fontFamily: "Poppins_700Bold" },

    // LOCATION TRACKING STYLES
    trackingCard: {
        backgroundColor: '#FFF',
        borderRadius: 20,
        padding: 20,
        marginHorizontal: 20,
        marginTop: 20,
        shadowColor: '#10B981',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 4,
    },
    trackingHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    trackingIcon: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#DCFCE7',
        justifyContent: 'center',
        alignItems: 'center',
    },
    trackingTitle: {
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
        color: '#111827',
    },
    trackingSubtitle: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
        marginTop: 2,
    },
    trackingInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 12,
        padding: 12,
        backgroundColor: '#F9FAFB',
        borderRadius: 12,
    },
    trackingInfoText: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
        flex: 1,
    },

    // ATTENDANCE/PUNCH IN-OUT STYLES
    attendanceCard: {
        backgroundColor: '#FFF',
        borderRadius: 20,
        padding: 20,
        marginHorizontal: 20,
        marginTop: 16,
        shadowColor: '#F59E0B',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 4,
    },
    attendanceHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 16,
    },
    attendanceIcon: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#FEF3C7',
        justifyContent: 'center',
        alignItems: 'center',
    },
    attendanceTitle: {
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
        color: '#111827',
    },
    attendanceSubtitle: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
        marginTop: 2,
    },
    punchRow: {
        flexDirection: 'row',
        gap: 12,
    },
    punchBtn: {
        flex: 1,
        borderRadius: 14,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 4,
    },
    punchBtnDisabled: {
        opacity: 0.5,
    },
    punchGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 50,
        gap: 8,
    },
    punchText: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
    },

    // MODE SECTION STYLES
    modeSection: {
        backgroundColor: '#FFF',
        borderRadius: 20,
        padding: 20,
        marginHorizontal: 20,
        marginTop: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 4,
    },
});
