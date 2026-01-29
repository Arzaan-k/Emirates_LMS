import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions, StatusBar, FlatList } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp, FadeInRight, Layout } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import AIRoleplay from './AIRoleplay';
import API_URL from '../config';

const { width, height } = Dimensions.get('window');

// Mock Scenarios
const SCENARIOS = [
    { id: 'angry', title: 'The Cold Waffle', subtitle: 'Angry Customer', icon: 'alert-circle', color: '#EF4444' },
    { id: 'confused', title: 'Payment Trouble', subtitle: 'Confused Customer', icon: 'help-circle', color: '#F59E0B' },
    { id: 'happy', title: 'Positive Feedback', subtitle: 'Loyal Customer', icon: 'heart', color: '#10B981' },
];

export default function SimulationHub({ onClose }) {
    const [view, setView] = useState('menu'); // menu, active, history
    const [selectedScenario, setSelectedScenario] = useState(null);
    const [history, setHistory] = useState([]);

    useEffect(() => {
        if (view === 'history') fetchHistory();
    }, [view]);

    const fetchHistory = async () => {
        try {
            const res = await fetch(`${API_URL}/api/v1/roleplay/history`);
            const data = await res.json();
            setHistory(data);
        } catch (e) {
            console.error(e);
        }
    };

    const startScenario = (scenario) => {
        setSelectedScenario(scenario);
        setView('active');
    };

    if (view === 'active') {
        return <AIRoleplay scenario={selectedScenario} onClose={() => setView('menu')} />;
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" />
            <LinearGradient colors={['#0F172A', '#1E293B', '#0F172A']} style={styles.background} />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={onClose} style={styles.backBtn}>
                    <Feather name="arrow-left" size={24} color="#FFF" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>AI Simulation Hub</Text>
                <TouchableOpacity onPress={() => setView('history')} style={styles.historyBtn}>
                    <MaterialCommunityIcons name="history" size={24} color="#FFF" />
                </TouchableOpacity>
            </View>

            {view === 'menu' && (
                <ScrollView contentContainerStyle={styles.menuContent}>
                    <Animated.Text entering={FadeInUp.delay(100)} style={styles.sectionTitle}>Choose a Scenario</Animated.Text>
                    <Animated.Text entering={FadeInUp.delay(200)} style={styles.sectionSub}>Test your skills in real-world situations</Animated.Text>

                    <View style={styles.grid}>
                        {SCENARIOS.map((item, index) => (
                            <Animated.View key={item.id} entering={FadeInUp.delay(300 + index * 100)} layout={Layout.springify()}>
                                <TouchableOpacity style={[styles.card, { borderColor: item.color }]} onPress={() => startScenario(item)}>
                                    <LinearGradient colors={['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.02)']} style={styles.cardGradient} />
                                    <View style={[styles.iconCircle, { backgroundColor: `${item.color}20` }]}>
                                        <Feather name={item.icon} size={32} color={item.color} />
                                    </View>
                                    <Text style={styles.cardTitle}>{item.title}</Text>
                                    <Text style={styles.cardSub}>{item.subtitle}</Text>
                                    <View style={styles.startBadge}>
                                        <Text style={styles.startText}>Start</Text>
                                        <Feather name="arrow-right" size={14} color="#FFF" />
                                    </View>
                                </TouchableOpacity>
                            </Animated.View>
                        ))}
                    </View>
                </ScrollView>
            )}

            {view === 'history' && (
                <View style={styles.historyContent}>
                    <Text style={styles.sectionTitle}>Performance History</Text>
                    <FlatList
                        data={history}
                        keyExtractor={item => item.id}
                        contentContainerStyle={{ paddingBottom: 40 }}
                        renderItem={({ item, index }) => (
                            <Animated.View entering={FadeInRight.delay(index * 100)} style={styles.historyItem}>
                                <View style={styles.historyHeader}>
                                    <Text style={styles.dateText}>{new Date(item.timestamp).toLocaleTimeString()}</Text>
                                    <View style={[styles.scoreBadge, { backgroundColor: item.score >= 70 ? '#10B981' : item.score >= 50 ? '#F59E0B' : '#EF4444' }]}>
                                        <Text style={styles.scoreText}>{item.score}</Text>
                                    </View>
                                </View>
                                <Text style={styles.userText} numberOfLines={2}>You: "{item.user_text}"</Text>
                                <View style={styles.tipBox}>
                                    <Feather name="zap" size={14} color="#FBBF24" />
                                    <Text style={styles.tipText}>{item.tip}</Text>
                                </View>
                            </Animated.View>
                        )}
                        ListEmptyComponent={<Text style={styles.emptyText}>No history yet.</Text>}
                    />
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0F172A' },
    background: { ...StyleSheet.absoluteFillObject },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 50, paddingBottom: 20 },
    headerTitle: { color: '#FFF', fontSize: 20, fontFamily: 'Poppins_700Bold' },
    backBtn: { padding: 10, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)' },
    historyBtn: { padding: 10, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)' },

    menuContent: { padding: 20, paddingBottom: 100 },
    sectionTitle: { color: '#FFF', fontSize: 28, fontFamily: 'Poppins_700Bold', marginBottom: 5, marginRight: 60 },
    sectionSub: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontFamily: 'Poppins_400Regular', marginBottom: 30, marginRight: 60 },

    grid: { gap: 20 },
    card: { height: 180, borderRadius: 24, borderWidth: 1, overflow: 'hidden', padding: 20, justifyContent: 'space-between' },
    cardGradient: { ...StyleSheet.absoluteFillObject },
    iconCircle: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
    cardTitle: { color: '#FFF', fontSize: 20, fontFamily: 'Poppins_600SemiBold' },
    cardSub: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontFamily: 'Poppins_400Regular' },
    startBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginTop: 10 },
    startText: { color: '#FFF', fontSize: 12, fontFamily: 'Poppins_600SemiBold', marginRight: 5 },

    historyContent: { flex: 1, padding: 20 },
    historyItem: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 16, marginBottom: 12, borderLeftWidth: 4, borderLeftColor: '#FBBF24' },
    historyHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    dateText: { color: 'rgba(255,255,255,0.4)', fontSize: 12 },
    scoreBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
    scoreText: { color: '#FFF', fontFamily: 'Poppins_700Bold', fontSize: 12 },
    userText: { color: 'rgba(255,255,255,0.8)', fontSize: 14, marginBottom: 10, fontStyle: 'italic' },
    tipBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(251, 191, 36, 0.1)', padding: 8, borderRadius: 8 },
    tipText: { color: '#FBBF24', fontSize: 12, marginLeft: 8, flex: 1, fontFamily: 'Poppins_500Medium' },
    emptyText: { color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: 50 }
});
