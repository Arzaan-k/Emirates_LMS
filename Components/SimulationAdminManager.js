import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    FlatList,
    Alert,
    ActivityIndicator,
    Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import API_URL from '../config';
import SimulationFlowBuilder from './SimulationFlowBuilder';

// --- SIMULATION ADMIN MANAGER ---
// For managers to view, edit, delete, and create simulations
export default function SimulationAdminManager({ onClose }) {
    const [simulations, setSimulations] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showBuilder, setShowBuilder] = useState(false);
    const [editingSimulation, setEditingSimulation] = useState(null);
    const [analytics, setAnalytics] = useState({});

    useEffect(() => {
        fetchSimulations();
    }, []);

    const fetchSimulations = async () => {
        setIsLoading(true);
        try {
            // Add timeout for faster loading
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const res = await fetch(`${API_URL}/api/v1/simulations/`, {
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            const data = await res.json();
            const simList = Array.isArray(data) ? data : [];
            setSimulations(simList);

            // Fetch analytics in parallel (don't block UI)
            if (simList.length > 0) {
                Promise.all(
                    simList.map(async (sim) => {
                        try {
                            const analyticsRes = await fetch(`${API_URL}/api/v1/simulations/analytics/${sim.id}`);
                            const analyticsData = await analyticsRes.json();
                            setAnalytics(prev => ({ ...prev, [sim.id]: analyticsData }));
                        } catch (e) {
                            // Silent fail for analytics
                        }
                    })
                );
            }
        } catch (e) {
            console.error('Failed to fetch simulations:', e);
            setSimulations([]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleEdit = (simulation) => {
        setEditingSimulation(simulation);
        setShowBuilder(true);
    };

    const handleDelete = async (simulationId, title) => {
        Alert.alert(
            'Delete Simulation',
            `Are you sure you want to delete "${title}"?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await fetch(`${API_URL}/api/v1/simulations/${simulationId}`, {
                                method: 'DELETE',
                            });
                            fetchSimulations();
                            Alert.alert('Deleted', 'Simulation deleted successfully');
                        } catch (e) {
                            Alert.alert('Error', 'Failed to delete simulation');
                        }
                    },
                },
            ]
        );
    };

    const handleCreate = () => {
        setEditingSimulation(null);
        setShowBuilder(true);
    };

    const handleSaveSimulation = (simulation) => {
        setShowBuilder(false);
        setEditingSimulation(null);
        fetchSimulations();
    };

    if (showBuilder) {
        return (
            <SimulationFlowBuilder
                existingSimulation={editingSimulation}
                onSave={handleSaveSimulation}
                onClose={() => {
                    setShowBuilder(false);
                    setEditingSimulation(null);
                }}
            />
        );
    }

    return (
        <View style={styles.container}>
            <LinearGradient colors={['#0F172A', '#1E293B', '#0F172A']} style={StyleSheet.absoluteFill} />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={onClose} style={styles.backBtn}>
                    <Feather name="arrow-left" size={24} color="#FFF" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Simulation Manager</Text>
                <TouchableOpacity onPress={handleCreate} style={styles.createBtn}>
                    <Feather name="plus" size={20} color="#FFF" />
                </TouchableOpacity>
            </View>

            {/* Stats Summary */}
            <Animated.View entering={FadeInDown.delay(100)} style={styles.statsRow}>
                <View style={styles.statCard}>
                    <MaterialCommunityIcons name="movie-open" size={24} color="#8B5CF6" />
                    <Text style={styles.statValue}>{simulations.length}</Text>
                    <Text style={styles.statLabel}>Total Simulations</Text>
                </View>
                <View style={styles.statCard}>
                    <MaterialCommunityIcons name="chart-line" size={24} color="#10B981" />
                    <Text style={styles.statValue}>
                        {Object.values(analytics).reduce((sum, a) => sum + (a.totalAttempts || 0), 0)}
                    </Text>
                    <Text style={styles.statLabel}>Total Attempts</Text>
                </View>
            </Animated.View>

            {/* Simulations List */}
            {isLoading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#F59E0B" />
                </View>
            ) : (
                <FlatList
                    data={simulations}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    renderItem={({ item, index }) => {
                        const simAnalytics = analytics[item.id] || {};

                        return (
                            <Animated.View
                                entering={FadeInDown.delay(150 + index * 50)}
                                style={styles.simCard}
                            >
                                <View style={styles.simHeader}>
                                    <View style={styles.simInfo}>
                                        <Text style={styles.simTitle} numberOfLines={1}>{item.title}</Text>
                                        <View style={styles.simMeta}>
                                            <View style={styles.metaBadge}>
                                                <Text style={styles.metaText}>{item.category}</Text>
                                            </View>
                                            <View style={[styles.metaBadge, {
                                                backgroundColor: item.difficulty === 'Easy' ? 'rgba(16, 185, 129, 0.2)' :
                                                    item.difficulty === 'Medium' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(239, 68, 68, 0.2)'
                                            }]}>
                                                <Text style={[styles.metaText, {
                                                    color: item.difficulty === 'Easy' ? '#10B981' :
                                                        item.difficulty === 'Medium' ? '#F59E0B' : '#EF4444'
                                                }]}>{item.difficulty}</Text>
                                            </View>
                                        </View>
                                    </View>
                                </View>

                                {/* Analytics Row */}
                                <View style={styles.analyticsRow}>
                                    <View style={styles.analyticsItem}>
                                        <Feather name="layers" size={14} color="#9CA3AF" />
                                        <Text style={styles.analyticsText}>{item.nodes?.length || 0} steps</Text>
                                    </View>
                                    <View style={styles.analyticsItem}>
                                        <Feather name="users" size={14} color="#9CA3AF" />
                                        <Text style={styles.analyticsText}>{simAnalytics.totalAttempts || 0} attempts</Text>
                                    </View>
                                    <View style={styles.analyticsItem}>
                                        <Feather name="award" size={14} color="#9CA3AF" />
                                        <Text style={styles.analyticsText}>Avg: {simAnalytics.averageScore || 0}%</Text>
                                    </View>
                                </View>

                                {/* Actions */}
                                <View style={styles.actionsRow}>
                                    <TouchableOpacity
                                        style={styles.actionBtn}
                                        onPress={() => handleEdit(item)}
                                    >
                                        <Feather name="edit-2" size={16} color="#8B5CF6" />
                                        <Text style={[styles.actionText, { color: '#8B5CF6' }]}>Edit</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.actionBtn}
                                        onPress={() => handleDelete(item.id, item.title)}
                                    >
                                        <Feather name="trash-2" size={16} color="#EF4444" />
                                        <Text style={[styles.actionText, { color: '#EF4444' }]}>Delete</Text>
                                    </TouchableOpacity>
                                </View>
                            </Animated.View>
                        );
                    }}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <MaterialCommunityIcons name="movie-open-plus-outline" size={60} color="#4B5563" />
                            <Text style={styles.emptyText}>No simulations yet</Text>
                            <Text style={styles.emptySubtext}>Create your first interactive simulation</Text>
                            <TouchableOpacity style={styles.createFirstBtn} onPress={handleCreate}>
                                <LinearGradient
                                    colors={['#8B5CF6', '#7C3AED']}
                                    style={styles.createFirstGradient}
                                >
                                    <Feather name="plus" size={20} color="#FFF" />
                                    <Text style={styles.createFirstText}>Create Simulation</Text>
                                </LinearGradient>
                            </TouchableOpacity>
                        </View>
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0F172A',
    },
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
    createBtn: {
        padding: 10,
        borderRadius: 12,
        backgroundColor: '#8B5CF6',
    },
    statsRow: {
        flexDirection: 'row',
        paddingHorizontal: 20,
        gap: 12,
        marginBottom: 20,
    },
    statCard: {
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 16,
        padding: 16,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    statValue: {
        color: '#FFF',
        fontSize: 28,
        fontFamily: 'Poppins_700Bold',
        marginTop: 8,
    },
    statLabel: {
        color: '#9CA3AF',
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    listContent: {
        paddingHorizontal: 20,
        paddingBottom: 100,
    },
    simCard: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    simHeader: {
        marginBottom: 12,
    },
    simInfo: {},
    simTitle: {
        color: '#FFF',
        fontSize: 17,
        fontFamily: 'Poppins_600SemiBold',
        marginBottom: 8,
    },
    simMeta: {
        flexDirection: 'row',
        gap: 8,
    },
    metaBadge: {
        backgroundColor: 'rgba(139, 92, 246, 0.2)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    metaText: {
        color: '#A78BFA',
        fontSize: 11,
        fontFamily: 'Poppins_500Medium',
        textTransform: 'capitalize',
    },
    analyticsRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingVertical: 12,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.08)',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.08)',
    },
    analyticsItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    analyticsText: {
        color: '#9CA3AF',
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
    },
    actionsRow: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 16,
        marginTop: 12,
    },
    actionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 8,
        paddingHorizontal: 12,
    },
    actionText: {
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
    },
    emptyContainer: {
        alignItems: 'center',
        paddingTop: 60,
    },
    emptyText: {
        color: '#9CA3AF',
        fontSize: 18,
        fontFamily: 'Poppins_600SemiBold',
        marginTop: 16,
    },
    emptySubtext: {
        color: '#6B7280',
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        marginTop: 4,
        marginBottom: 24,
    },
    createFirstBtn: {
        borderRadius: 14,
        overflow: 'hidden',
    },
    createFirstGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 24,
        gap: 8,
    },
    createFirstText: {
        color: '#FFF',
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
    },
});
