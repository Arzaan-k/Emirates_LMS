import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Dimensions,
    Image,
    FlatList,
    ActivityIndicator,
    StatusBar,
    Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, { FadeIn, FadeInDown, FadeInRight, FadeInUp, Layout } from 'react-native-reanimated';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import API_URL from '../config';
import InteractiveSimulation from './InteractiveSimulation';

const { width, height } = Dimensions.get('window');

// --- SIMULATION CARD COMPONENT ---
const SimulationCard = ({ simulation, onStart, index }) => {
    const difficultyColors = {
        'easy': '#10B981',
        'medium': '#F59E0B',
        'hard': '#EF4444',
        'Easy': '#10B981',
        'Medium': '#F59E0B',
        'Hard': '#EF4444',
    };

    return (
        <Animated.View
            entering={FadeInUp.delay(200 + index * 100).springify()}
            style={styles.cardContainer}
        >
            <TouchableOpacity
                style={styles.simulationCard}
                onPress={() => onStart(simulation)}
                activeOpacity={0.9}
            >
                {/* Thumbnail */}
                <View style={styles.thumbnailContainer}>
                    {simulation.thumbnailUrl ? (
                        <Image
                            source={{ uri: simulation.thumbnailUrl }}
                            style={styles.thumbnail}
                            resizeMode="cover"
                        />
                    ) : (
                        <LinearGradient
                            colors={['#1E293B', '#334155']}
                            style={styles.thumbnailPlaceholder}
                        >
                            <MaterialCommunityIcons name="video-vintage" size={40} color="#64748B" />
                        </LinearGradient>
                    )}

                    {/* Duration Badge */}
                    <View style={styles.durationBadge}>
                        <Feather name="clock" size={12} color="#FFF" />
                        <Text style={styles.durationText}>{simulation.duration || simulation.estimatedTime || '5 min'}</Text>
                    </View>

                    {/* Play Button Overlay */}
                    <View style={styles.playOverlay}>
                        <View style={styles.playButton}>
                            <Ionicons name="play" size={24} color="#FFF" style={{ marginLeft: 3 }} />
                        </View>
                    </View>
                </View>

                {/* Content */}
                <View style={styles.cardContent}>
                    <View style={styles.cardHeader}>
                        <View style={[styles.difficultyBadge, { backgroundColor: `${difficultyColors[simulation.difficulty] || '#6B7280'}20` }]}>
                            <View style={[styles.difficultyDot, { backgroundColor: difficultyColors[simulation.difficulty] || '#6B7280' }]} />
                            <Text style={[styles.difficultyText, { color: difficultyColors[simulation.difficulty] || '#6B7280' }]}>
                                {simulation.difficulty || 'Medium'}
                            </Text>
                        </View>

                        {simulation.completedByUser && (
                            <View style={styles.completedBadge}>
                                <Feather name="check-circle" size={14} color="#10B981" />
                            </View>
                        )}
                    </View>

                    <Text style={styles.cardTitle} numberOfLines={2}>{simulation.title}</Text>
                    <Text style={styles.cardDescription} numberOfLines={2}>{simulation.description}</Text>

                    <View style={styles.cardMeta}>
                        <View style={styles.metaItem}>
                            <MaterialCommunityIcons name="movie-open-outline" size={14} color="#9CA3AF" />
                            <Text style={styles.metaText}>{simulation.steps || simulation.total_branches || 0} steps</Text>
                        </View>
                        <View style={styles.metaItem}>
                            <MaterialCommunityIcons name="star-outline" size={14} color="#9CA3AF" />
                            <Text style={styles.metaText}>{simulation.max_score || simulation.maxScore || (simulation.steps || 0) * 10} pts</Text>
                        </View>
                    </View>
                </View>
            </TouchableOpacity>
        </Animated.View>
    );
};

// --- HISTORY ITEM COMPONENT ---
const HistoryItem = ({ item, index }) => {
    const percentage = Math.round((item.score / (item.totalSteps * 10)) * 100);
    const gradeColor = percentage >= 80 ? '#10B981' : percentage >= 60 ? '#F59E0B' : '#EF4444';

    return (
        <Animated.View
            entering={FadeInRight.delay(index * 100)}
            style={styles.historyCard}
        >
            <View style={styles.historyHeader}>
                <Text style={styles.historyTitle} numberOfLines={1}>{item.simulationTitle}</Text>
                <View style={[styles.historyScore, { backgroundColor: `${gradeColor}20` }]}>
                    <Text style={[styles.historyScoreText, { color: gradeColor }]}>{percentage}%</Text>
                </View>
            </View>

            <View style={styles.historyMeta}>
                <View style={styles.historyMetaItem}>
                    <Feather name="award" size={12} color="#9CA3AF" />
                    <Text style={styles.historyMetaText}>{item.score} pts</Text>
                </View>
                <View style={styles.historyMetaItem}>
                    <Feather name="x-circle" size={12} color="#9CA3AF" />
                    <Text style={styles.historyMetaText}>{item.wrongAttempts} mistakes</Text>
                </View>
                <View style={styles.historyMetaItem}>
                    <Feather name="clock" size={12} color="#9CA3AF" />
                    <Text style={styles.historyMetaText}>{Math.floor(item.timeSpentSeconds / 60)}m</Text>
                </View>
            </View>

            <Text style={styles.historyDate}>
                {new Date(item.completedAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                })}
            </Text>
        </Animated.View>
    );
};

// --- MAIN HUB COMPONENT ---
export default function InteractiveSimulationHub({ onClose, userProfile }) {
    const [view, setView] = useState('browse'); // browse, playing, history
    const [simulations, setSimulations] = useState([]);
    const [history, setHistory] = useState([]);
    const [selectedSimulation, setSelectedSimulation] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [filter, setFilter] = useState('all'); // all, operations, service, safety, emergency
    const simulationsFetchControllerRef = useRef(null);

    useEffect(() => {
        fetchSimulations();

        return () => {
            if (simulationsFetchControllerRef.current) {
                simulationsFetchControllerRef.current.abort();
                simulationsFetchControllerRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        if (view === 'history') {
            fetchHistory();
        }
    }, [view]);



    const fetchSimulations = async () => {
        setIsLoading(true);

        try {
            const res = await fetch(`${API_URL}/api/v1/simulations/`);
            const data = await res.json();
            setSimulations(Array.isArray(data) ? data : []);
            setIsLoading(false);
        } catch (e) {
            console.error('Failed to fetch simulations:', e);
            setSimulations([]);
            setIsLoading(false);
        }
    };

    const fetchHistory = async () => {
        if (!userProfile?.email) return;
        try {
            const res = await fetch(`${API_URL}/api/v1/simulations/history/user?email=${encodeURIComponent(userProfile.email)}`);
            const data = await res.json();
            setHistory(Array.isArray(data) ? data : []);
        } catch (e) {
            console.error('Failed to fetch history:', e);
            setHistory([]);
        }
    };

    const handleStartSimulation = async (simulation) => {
        try {
            setIsLoading(true);
            
            // Fetch full simulation details from API
            const res = await fetch(`${API_URL}/api/v1/simulations/${simulation.id}`);
            const fullSimulation = await res.json();

            setSelectedSimulation(fullSimulation);
            setView('playing');
        } catch (e) {
            console.error('Failed to fetch simulation details:', e);
            Alert.alert('Error', 'Could not load simulation. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSimulationComplete = () => {
        setSelectedSimulation(null);
        setView('browse');
        fetchSimulations(); // Refresh to update completion status
    };

    const filteredSimulations = simulations.filter(s => {
        if (filter === 'all') return true;
        return s.category?.toLowerCase() === filter;
    });

    // If playing simulation, show the simulation player
    if (view === 'playing' && selectedSimulation) {
        return (
            <InteractiveSimulation
                simulation={selectedSimulation}
                onClose={handleSimulationComplete}
                userId={userProfile?.email}
            />
        );
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

                <Animated.Text entering={FadeIn} style={styles.headerTitle}>
                    Interactive Simulations
                </Animated.Text>

                <TouchableOpacity
                    onPress={() => setView(view === 'history' ? 'browse' : 'history')}
                    style={styles.historyBtn}
                >
                    <MaterialCommunityIcons
                        name={view === 'history' ? 'view-grid' : 'history'}
                        size={24}
                        color="#FFF"
                    />
                </TouchableOpacity>
            </View>

            {view === 'browse' && (
                <>
                    {/* Hero Section */}
                    <Animated.View entering={FadeInDown.delay(100)} style={styles.heroSection}>
                        <LinearGradient
                            colors={['#312E81', '#1E1B4B']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.heroCard}
                        >
                            <View style={styles.heroContent}>
                                <View style={styles.heroBadge}>
                                    <MaterialCommunityIcons name="movie-filter" size={14} color="#FFF" />
                                    <Text style={styles.heroBadgeText}>INTERACTIVE</Text>
                                </View>
                                <Text style={styles.heroTitle}>First-Person Training</Text>
                                <Text style={styles.heroDesc}>
                                    Experience real scenarios through immersive video simulations.
                                    Make choices and learn from consequences.
                                </Text>
                            </View>
                            <MaterialCommunityIcons
                                name="movie-open-check"
                                size={80}
                                color="rgba(255,255,255,0.1)"
                                style={styles.heroIcon}
                            />
                        </LinearGradient>
                    </Animated.View>

                    {/* Category Filters */}
                    <Animated.View entering={FadeInDown.delay(200)}>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.filterContainer}
                        >
                            {['all', 'operations', 'service', 'safety', 'emergency'].map((cat) => (
                                <TouchableOpacity
                                    key={cat}
                                    style={[styles.filterChip, filter === cat && styles.filterChipActive]}
                                    onPress={() => setFilter(cat)}
                                >
                                    <Text style={[styles.filterText, filter === cat && styles.filterTextActive]}>
                                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </Animated.View>

                    {/* Simulations Grid */}
                    {isLoading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color="#F59E0B" />
                        </View>
                    ) : (
                        <FlatList
                            data={filteredSimulations}
                            keyExtractor={(item) => item.id}
                            renderItem={({ item, index }) => (
                                <SimulationCard
                                    simulation={item}
                                    onStart={handleStartSimulation}
                                    index={index}
                                />
                            )}
                            contentContainerStyle={styles.listContent}
                            showsVerticalScrollIndicator={false}
                            ListEmptyComponent={
                                <View style={styles.emptyContainer}>
                                    <MaterialCommunityIcons name="video-off-outline" size={60} color="#4B5563" />
                                    <Text style={styles.emptyText}>No simulations available</Text>
                                    <Text style={styles.emptySubtext}>Check back later for new training content</Text>
                                </View>
                            }
                        />
                    )}
                </>
            )}

            {view === 'history' && (
                <>
                    <Animated.Text entering={FadeIn} style={styles.sectionTitle}>
                        Your Progress
                    </Animated.Text>

                    <FlatList
                        data={history}
                        keyExtractor={(item, index) => item.id || `history-${index}`}
                        renderItem={({ item, index }) => (
                            <HistoryItem item={item} index={index} />
                        )}
                        contentContainerStyle={styles.historyList}
                        showsVerticalScrollIndicator={false}
                        ListEmptyComponent={
                            <View style={styles.emptyContainer}>
                                <MaterialCommunityIcons name="history" size={60} color="#4B5563" />
                                <Text style={styles.emptyText}>No history yet</Text>
                                <Text style={styles.emptySubtext}>Complete simulations to see your progress here</Text>
                            </View>
                        }
                    />
                </>
            )}
        </View>
    );
}

// Mock data removed - all simulations come from backend only

// --- STYLES ---
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0F172A',
    },
    background: {
        ...StyleSheet.absoluteFillObject,
    },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 50,
        paddingBottom: 16,
    },
    backBtn: {
        padding: 10,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    headerTitle: {
        color: '#FFF',
        fontSize: 20,
        fontFamily: 'Poppins_700Bold',
    },
    historyBtn: {
        padding: 10,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },

    // Hero
    heroSection: {
        paddingHorizontal: 20,
        marginBottom: 16,
    },
    heroCard: {
        borderRadius: 20,
        padding: 20,
        position: 'relative',
        overflow: 'hidden',
    },
    heroContent: {
        flex: 1,
        zIndex: 1,
    },
    heroBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        backgroundColor: 'rgba(255,255,255,0.15)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
        marginBottom: 12,
    },
    heroBadgeText: {
        color: '#FFF',
        fontSize: 10,
        fontFamily: 'Poppins_700Bold',
        letterSpacing: 1,
        marginLeft: 4,
    },
    heroTitle: {
        color: '#FFF',
        fontSize: 22,
        fontFamily: 'Poppins_700Bold',
        marginBottom: 8,
    },
    heroDesc: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        lineHeight: 20,
        maxWidth: '80%',
    },
    heroIcon: {
        position: 'absolute',
        right: -10,
        bottom: -10,
    },

    // Filters
    filterContainer: {
        paddingHorizontal: 20,
        paddingBottom: 16,
        gap: 10,
    },
    filterChip: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.08)',
        marginRight: 10,
    },
    filterChipActive: {
        backgroundColor: '#F59E0B',
    },
    filterText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 13,
        fontFamily: 'Poppins_500Medium',
    },
    filterTextActive: {
        color: '#FFF',
    },

    // Cards
    listContent: {
        paddingHorizontal: 20,
        paddingBottom: 100,
    },
    cardContainer: {
        marginBottom: 16,
    },
    simulationCard: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 20,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    thumbnailContainer: {
        height: 160,
        position: 'relative',
    },
    thumbnail: {
        width: '100%',
        height: '100%',
    },
    thumbnailPlaceholder: {
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    durationBadge: {
        position: 'absolute',
        top: 12,
        right: 12,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.7)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    durationText: {
        color: '#FFF',
        fontSize: 11,
        fontFamily: 'Poppins_500Medium',
        marginLeft: 4,
    },
    playOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
    playButton: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: 'rgba(245, 158, 11, 0.9)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    cardContent: {
        padding: 16,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    difficultyBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    difficultyDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        marginRight: 6,
    },
    difficultyText: {
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
    },
    completedBadge: {
        padding: 4,
    },
    cardTitle: {
        color: '#FFF',
        fontSize: 17,
        fontFamily: 'Poppins_600SemiBold',
        marginBottom: 4,
    },
    cardDescription: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        marginBottom: 12,
        lineHeight: 20,
    },
    cardMeta: {
        flexDirection: 'row',
        gap: 16,
    },
    metaItem: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    metaText: {
        color: '#9CA3AF',
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        marginLeft: 4,
    },

    // Loading & Empty
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: 60,
    },
    emptyText: {
        color: '#9CA3AF',
        fontSize: 16,
        fontFamily: 'Poppins_500Medium',
        marginTop: 16,
    },
    emptySubtext: {
        color: '#6B7280',
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        marginTop: 4,
    },

    // Section
    sectionTitle: {
        color: '#FFF',
        fontSize: 20,
        fontFamily: 'Poppins_700Bold',
        paddingHorizontal: 20,
        marginBottom: 16,
    },

    // History
    historyList: {
        paddingHorizontal: 20,
        paddingBottom: 100,
    },
    historyCard: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderLeftWidth: 4,
        borderLeftColor: '#8B5CF6',
    },
    historyHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    historyTitle: {
        color: '#FFF',
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
        flex: 1,
        marginRight: 10,
    },
    historyScore: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    historyScoreText: {
        fontSize: 13,
        fontFamily: 'Poppins_700Bold',
    },
    historyMeta: {
        flexDirection: 'row',
        gap: 16,
        marginBottom: 8,
    },
    historyMetaItem: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    historyMetaText: {
        color: '#9CA3AF',
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        marginLeft: 4,
    },
    historyDate: {
        color: '#6B7280',
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
    },
});
