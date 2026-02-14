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
    Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import API_URL from '../config';
import SimulationFlowBuilder from './SimulationFlowBuilder';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// --- SIMULATION ADMIN MANAGER ---
// For managers to view, edit, delete, and create simulations
export default function SimulationAdminManager({ onClose }) {
    const [simulations, setSimulations] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showBuilder, setShowBuilder] = useState(false);
    const [editingSimulation, setEditingSimulation] = useState(null);
    const [analytics, setAnalytics] = useState({});
    const [analyticsLoading, setAnalyticsLoading] = useState(false);
    const [selectedAnalytics, setSelectedAnalytics] = useState(null); // for modal
    const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);

    useEffect(() => {
        fetchSimulations();
    }, []);

    const fetchSimulations = async () => {
        setIsLoading(true);
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const res = await fetch(`${API_URL}/api/v1/simulations/`, {
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            const data = await res.json();
            const simList = Array.isArray(data) ? data : [];
            setSimulations(simList);

            // Fetch analytics in parallel
            if (simList.length > 0) {
                setAnalyticsLoading(true);
                Promise.all(
                    simList.map(async (sim) => {
                        try {
                            const analyticsRes = await fetch(`${API_URL}/api/v1/simulations/analytics/${sim.id}`);
                            const analyticsData = await analyticsRes.json();
                            setAnalytics(prev => ({ ...prev, [sim.id]: analyticsData }));
                        } catch (e) {
                            // Silent fail — analytics non-blocking
                        }
                    })
                ).finally(() => setAnalyticsLoading(false));
            }
        } catch (e) {
            console.error('Failed to fetch simulations:', e);
            setSimulations([]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleEdit = async (simulation) => {
        try {
            setIsLoading(true);
            const res = await fetch(`${API_URL}/api/v1/simulations/${simulation.id}`);
            const fullSimulation = await res.json();
            setEditingSimulation(fullSimulation);
            setShowBuilder(true);
        } catch (e) {
            console.error('Failed to fetch simulation details:', e);
            Alert.alert('Warning', 'Could not load full simulation data. Some steps may be missing.');
            setEditingSimulation(simulation);
            setShowBuilder(true);
        } finally {
            setIsLoading(false);
        }
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

    const handleSaveSimulation = () => {
        setShowBuilder(false);
        setEditingSimulation(null);
        fetchSimulations();
    };

    const openAnalyticsModal = async (simulation) => {
        // Open modal immediately with cached basic data
        setSelectedAnalytics({
            simulation,
            aggregate: null,   // null = still loading
            recentAttempts: [],
        });
        setShowAnalyticsModal(true);

        try {
            const res = await fetch(`${API_URL}/api/v1/simulations/analytics/${simulation.id}/detailed`);
            if (!res.ok) throw new Error('fetch failed');
            const json = await res.json();
            setSelectedAnalytics({
                simulation,
                aggregate: json.aggregate,
                recentAttempts: json.recentAttempts || [],
            });
        } catch (e) {
            // Fallback to basic cached data
            const basic = analytics[simulation.id] || {};
            setSelectedAnalytics({
                simulation,
                aggregate: {
                    total_attempts: basic.totalAttempts || 0,
                    total_completed: basic.totalAttempts || 0,
                    total_passed: 0,
                    total_failed: 0,
                    avg_score: basic.averageScore || 0,
                    highest_score: 0,
                    lowest_score: 0,
                    pass_rate: basic.passRate || 0,
                    avg_time_seconds: 0,
                    last_attempt_at: null,
                },
                recentAttempts: [],
            });
        }
    };

    // --- Aggregated stats ---
    const totalAttempts = Object.values(analytics).reduce((sum, a) => sum + (a.totalAttempts || 0), 0);
    const allScores = Object.values(analytics).filter(a => a.totalAttempts > 0).map(a => a.averageScore);
    const overallAvgScore = allScores.length > 0
        ? Math.round(allScores.reduce((s, v) => s + v, 0) / allScores.length)
        : 0;
    const allPassRates = Object.values(analytics).filter(a => a.totalAttempts > 0).map(a => a.passRate);
    const overallPassRate = allPassRates.length > 0
        ? Math.round(allPassRates.reduce((s, v) => s + v, 0) / allPassRates.length)
        : 0;

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

            {/* Stats Summary — 4 cards in 2x2 grid */}
            <Animated.View entering={FadeInDown.delay(100)} style={styles.statsGrid}>
                <View style={[styles.statCard, { borderColor: 'rgba(139,92,246,0.3)' }]}>
                    <View style={[styles.statIconWrap, { backgroundColor: 'rgba(139,92,246,0.15)' }]}>
                        <MaterialCommunityIcons name="movie-open" size={20} color="#8B5CF6" />
                    </View>
                    <Text style={styles.statValue}>{simulations.length}</Text>
                    <Text style={styles.statLabel}>Total Simulations</Text>
                </View>

                <View style={[styles.statCard, { borderColor: 'rgba(16,185,129,0.3)' }]}>
                    <View style={[styles.statIconWrap, { backgroundColor: 'rgba(16,185,129,0.15)' }]}>
                        <MaterialCommunityIcons name="chart-line" size={20} color="#10B981" />
                    </View>
                    {analyticsLoading && totalAttempts === 0
                        ? <ActivityIndicator size="small" color="#10B981" style={{ marginTop: 8 }} />
                        : <Text style={styles.statValue}>{totalAttempts}</Text>
                    }
                    <Text style={styles.statLabel}>Total Attempts</Text>
                </View>

                <View style={[styles.statCard, { borderColor: 'rgba(245,158,11,0.3)' }]}>
                    <View style={[styles.statIconWrap, { backgroundColor: 'rgba(245,158,11,0.15)' }]}>
                        <MaterialCommunityIcons name="percent" size={20} color="#F59E0B" />
                    </View>
                    {analyticsLoading && overallAvgScore === 0
                        ? <ActivityIndicator size="small" color="#F59E0B" style={{ marginTop: 8 }} />
                        : <Text style={styles.statValue}>{overallAvgScore}%</Text>
                    }
                    <Text style={styles.statLabel}>Avg Score</Text>
                </View>

                <View style={[styles.statCard, { borderColor: 'rgba(59,130,246,0.3)' }]}>
                    <View style={[styles.statIconWrap, { backgroundColor: 'rgba(59,130,246,0.15)' }]}>
                        <MaterialCommunityIcons name="trophy" size={20} color="#3B82F6" />
                    </View>
                    {analyticsLoading && overallPassRate === 0
                        ? <ActivityIndicator size="small" color="#3B82F6" style={{ marginTop: 8 }} />
                        : <Text style={styles.statValue}>{overallPassRate}%</Text>
                    }
                    <Text style={styles.statLabel}>Pass Rate</Text>
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
                        const simA = analytics[item.id] || {};
                        const avgScore = simA.averageScore || 0;
                        const passRate = simA.passRate || 0;
                        const attempts = simA.totalAttempts || 0;
                        const steps = item.steps || item.total_branches || 0;

                        // Score colour band
                        const scoreColor = avgScore >= 70 ? '#10B981' : avgScore >= 40 ? '#F59E0B' : '#EF4444';
                        const passColor = passRate >= 70 ? '#10B981' : passRate >= 40 ? '#F59E0B' : '#EF4444';

                        return (
                            <Animated.View
                                entering={FadeInDown.delay(150 + index * 50)}
                                style={styles.simCard}
                            >
                                {/* Card Header */}
                                <View style={styles.simHeader}>
                                    <View style={styles.simInfo}>
                                        <Text style={styles.simTitle} numberOfLines={1}>{item.title}</Text>
                                        <View style={styles.simMeta}>
                                            <View style={styles.metaBadge}>
                                                <Text style={styles.metaText}>{item.category}</Text>
                                            </View>
                                            <View style={[styles.metaBadge, {
                                                backgroundColor: item.difficulty === 'Easy' ? 'rgba(16,185,129,0.2)' :
                                                    item.difficulty === 'Medium' ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.2)'
                                            }]}>
                                                <Text style={[styles.metaText, {
                                                    color: item.difficulty === 'Easy' ? '#10B981' :
                                                        item.difficulty === 'Medium' ? '#F59E0B' : '#EF4444'
                                                }]}>{item.difficulty}</Text>
                                            </View>
                                        </View>
                                    </View>
                                </View>

                                {/* Quick stats row */}
                                <View style={styles.analyticsRow}>
                                    <View style={styles.analyticsItem}>
                                        <Feather name="layers" size={13} color="#9CA3AF" />
                                        <Text style={styles.analyticsText}>{steps} steps</Text>
                                    </View>
                                    <View style={styles.analyticsItem}>
                                        <Feather name="users" size={13} color="#9CA3AF" />
                                        <Text style={styles.analyticsText}>{attempts} attempts</Text>
                                    </View>
                                    <View style={styles.analyticsItem}>
                                        <Feather name="award" size={13} color="#9CA3AF" />
                                        <Text style={[styles.analyticsText, { color: scoreColor }]}>
                                            Avg {avgScore}%
                                        </Text>
                                    </View>
                                    <View style={styles.analyticsItem}>
                                        <Feather name="check-circle" size={13} color="#9CA3AF" />
                                        <Text style={[styles.analyticsText, { color: passColor }]}>
                                            Pass {passRate}%
                                        </Text>
                                    </View>
                                </View>

                                {/* Score & Pass rate mini bars */}
                                {attempts > 0 && (
                                    <View style={styles.barsSection}>
                                        <View style={styles.barRow}>
                                            <Text style={styles.barLabel}>Avg Score</Text>
                                            <View style={styles.barTrack}>
                                                <View style={[styles.barFill, { width: `${avgScore}%`, backgroundColor: scoreColor }]} />
                                            </View>
                                            <Text style={[styles.barValue, { color: scoreColor }]}>{avgScore}%</Text>
                                        </View>
                                        <View style={styles.barRow}>
                                            <Text style={styles.barLabel}>Pass Rate</Text>
                                            <View style={styles.barTrack}>
                                                <View style={[styles.barFill, { width: `${passRate}%`, backgroundColor: passColor }]} />
                                            </View>
                                            <Text style={[styles.barValue, { color: passColor }]}>{passRate}%</Text>
                                        </View>
                                    </View>
                                )}

                                {/* Actions */}
                                <View style={styles.actionsRow}>
                                    <TouchableOpacity
                                        style={styles.analyticsBtn}
                                        onPress={() => openAnalyticsModal(item)}
                                    >
                                        <Feather name="bar-chart-2" size={15} color="#3B82F6" />
                                        <Text style={[styles.actionText, { color: '#3B82F6' }]}>Analytics</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.actionBtn}
                                        onPress={() => handleEdit(item)}
                                    >
                                        <Feather name="edit-2" size={15} color="#8B5CF6" />
                                        <Text style={[styles.actionText, { color: '#8B5CF6' }]}>Edit</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.actionBtn}
                                        onPress={() => handleDelete(item.id, item.title)}
                                    >
                                        <Feather name="trash-2" size={15} color="#EF4444" />
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

            {/* Analytics Detail Modal */}
            <Modal
                visible={showAnalyticsModal}
                transparent
                animationType="slide"
                onRequestClose={() => setShowAnalyticsModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <Animated.View entering={FadeInUp.duration(300)} style={styles.analyticsModal}>
                        <LinearGradient colors={['#1E293B', '#0F172A']} style={StyleSheet.absoluteFill} borderRadius={24} />

                        {/* Modal Header */}
                        <View style={styles.modalHeader}>
                            <View>
                                <Text style={styles.modalTitle}>
                                    {selectedAnalytics?.simulation?.title || 'Analytics'}
                                </Text>
                                <Text style={styles.modalSubtitle}>Simulation Performance Report</Text>
                            </View>
                            <TouchableOpacity onPress={() => setShowAnalyticsModal(false)} style={styles.modalCloseBtn}>
                                <Feather name="x" size={20} color="#9CA3AF" />
                            </TouchableOpacity>
                        </View>

                        {selectedAnalytics && (
                            <ScrollView showsVerticalScrollIndicator={false}>
                                {/* Loading state */}
                                {!selectedAnalytics.aggregate && (
                                    <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                                        <ActivityIndicator size="large" color="#8B5CF6" />
                                        <Text style={{ color: '#6B7280', marginTop: 12, fontFamily: 'Poppins_400Regular', fontSize: 13 }}>
                                            Loading analytics…
                                        </Text>
                                    </View>
                                )}

                                {selectedAnalytics.aggregate && (() => {
                                    const agg = selectedAnalytics.aggregate;
                                    const sim = selectedAnalytics.simulation;
                                    return (
                                        <>
                                            {/* KPI Cards — 4 tiles */}
                                            <View style={styles.kpiGrid}>
                                                <KpiCard icon="users" label="Total Attempts" value={agg.total_attempts} color="#10B981" suffix="" />
                                                <KpiCard icon="check-circle" label="Completed" value={agg.total_completed} color="#3B82F6" suffix="" />
                                                <KpiCard icon="thumbs-up" label="Passed" value={agg.total_passed} color="#8B5CF6" suffix="" />
                                                <KpiCard icon="thumbs-down" label="Failed" value={agg.total_failed} color="#EF4444" suffix="" />
                                            </View>

                                            {/* Score Breakdown */}
                                            <View style={styles.breakdownCard}>
                                                <Text style={styles.breakdownTitle}>Score Breakdown</Text>
                                                <ScoreBar label="Average Score" value={agg.avg_score} max={100}
                                                    color={agg.avg_score >= 70 ? '#10B981' : agg.avg_score >= 40 ? '#F59E0B' : '#EF4444'} />
                                                <ScoreBar label="Highest Score" value={agg.highest_score} max={100} color="#10B981" />
                                                <ScoreBar label="Lowest Score" value={agg.lowest_score} max={100} color="#EF4444" />
                                                <ScoreBar label="Pass Rate" value={agg.pass_rate} max={100}
                                                    color={agg.pass_rate >= 70 ? '#10B981' : agg.pass_rate >= 40 ? '#F59E0B' : '#EF4444'} />
                                                <ScoreBar label="Passing Threshold" value={sim.passing_score || 70} max={100} color="#9CA3AF" dashed />
                                            </View>

                                            {/* Avg time */}
                                            {agg.avg_time_seconds > 0 && (
                                                <View style={styles.breakdownCard}>
                                                    <Text style={styles.breakdownTitle}>Engagement</Text>
                                                    <InfoRow icon="clock" label="Avg Time Spent"
                                                        value={agg.avg_time_seconds >= 60
                                                            ? `${Math.floor(agg.avg_time_seconds / 60)}m ${Math.round(agg.avg_time_seconds % 60)}s`
                                                            : `${Math.round(agg.avg_time_seconds)}s`}
                                                    />
                                                    {agg.last_attempt_at && (
                                                        <InfoRow icon="calendar" label="Last Attempt"
                                                            value={new Date(agg.last_attempt_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                        />
                                                    )}
                                                </View>
                                            )}

                                            {/* Performance Rating */}
                                            <View style={styles.breakdownCard}>
                                                <Text style={styles.breakdownTitle}>Performance Rating</Text>
                                                <PerformanceBadge avgScore={agg.avg_score} passRate={agg.pass_rate} totalAttempts={agg.total_attempts} />
                                            </View>

                                            {/* Simulation Details */}
                                            <View style={styles.breakdownCard}>
                                                <Text style={styles.breakdownTitle}>Simulation Details</Text>
                                                <InfoRow icon="tag" label="Category" value={sim.category || '—'} />
                                                <InfoRow icon="zap" label="Difficulty" value={sim.difficulty || '—'}
                                                    valueColor={sim.difficulty === 'Easy' ? '#10B981' : sim.difficulty === 'Medium' ? '#F59E0B' : '#EF4444'} />
                                                <InfoRow icon="target" label="Passing Score" value={`${sim.passing_score || 70}%`} />
                                                <InfoRow icon="star" label="Max Score" value={`${sim.max_score || 100}%`} />
                                                <InfoRow icon="layers" label="Steps" value={sim.steps || sim.total_branches || 0} />
                                            </View>

                                            {/* Recent Attempts History */}
                                            {selectedAnalytics.recentAttempts.length > 0 && (
                                                <View style={styles.breakdownCard}>
                                                    <Text style={styles.breakdownTitle}>
                                                        Recent Attempts ({selectedAnalytics.recentAttempts.length})
                                                    </Text>
                                                    {selectedAnalytics.recentAttempts.map((attempt, idx) => (
                                                        <View key={attempt.id || idx} style={attemptStyles.row}>
                                                            <View style={attemptStyles.left}>
                                                                <Text style={attemptStyles.email} numberOfLines={1}>
                                                                    {attempt.user_email}
                                                                </Text>
                                                                <Text style={attemptStyles.date}>
                                                                    {attempt.completed_at
                                                                        ? new Date(attempt.completed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                                                                        : attempt.started_at
                                                                            ? new Date(attempt.started_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                                                                            : '—'}
                                                                    {attempt.time_spent_seconds > 0 && ` · ${Math.round(attempt.time_spent_seconds / 60)}m`}
                                                                </Text>
                                                            </View>
                                                            <View style={attemptStyles.right}>
                                                                <Text style={[attemptStyles.score, {
                                                                    color: attempt.score >= 70 ? '#10B981' : attempt.score >= 40 ? '#F59E0B' : '#EF4444'
                                                                }]}>
                                                                    {attempt.score}%
                                                                </Text>
                                                                <View style={[attemptStyles.badge, {
                                                                    backgroundColor: attempt.passed ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'
                                                                }]}>
                                                                    <Text style={[attemptStyles.badgeText, {
                                                                        color: attempt.passed ? '#10B981' : '#EF4444'
                                                                    }]}>
                                                                        {attempt.passed ? 'Pass' : 'Fail'}
                                                                    </Text>
                                                                </View>
                                                            </View>
                                                        </View>
                                                    ))}
                                                </View>
                                            )}
                                        </>
                                    );
                                })()}
                            </ScrollView>
                        )}
                    </Animated.View>
                </View>
            </Modal>
        </View>
    );
}

// --- Sub-components ---

function KpiCard({ icon, label, value, color, suffix }) {
    return (
        <View style={[kpiStyles.card, { borderColor: `${color}33` }]}>
            <View style={[kpiStyles.iconWrap, { backgroundColor: `${color}22` }]}>
                <Feather name={icon} size={18} color={color} />
            </View>
            <Text style={[kpiStyles.value, { color }]}>{value}{suffix}</Text>
            <Text style={kpiStyles.label}>{label}</Text>
        </View>
    );
}

function ScoreBar({ label, value, max, color, dashed }) {
    const pct = Math.min(100, Math.max(0, (value / max) * 100));
    return (
        <View style={barStyles.row}>
            <Text style={barStyles.label}>{label}</Text>
            <View style={barStyles.trackWrap}>
                <View style={barStyles.track}>
                    <View style={[
                        barStyles.fill,
                        { width: `${pct}%`, backgroundColor: color },
                        dashed && barStyles.dashed,
                    ]} />
                </View>
            </View>
            <Text style={[barStyles.pct, { color }]}>{value}%</Text>
        </View>
    );
}

function PerformanceBadge({ avgScore, passRate, totalAttempts }) {
    let grade, color, desc;
    if (totalAttempts === 0) {
        grade = '—'; color = '#6B7280'; desc = 'No attempts yet';
    } else if (avgScore >= 85 && passRate >= 80) {
        grade = 'Excellent'; color = '#10B981'; desc = 'Learners are performing exceptionally well';
    } else if (avgScore >= 70 && passRate >= 60) {
        grade = 'Good'; color = '#3B82F6'; desc = 'Learners meeting expectations';
    } else if (avgScore >= 50 && passRate >= 40) {
        grade = 'Average'; color = '#F59E0B'; desc = 'Room for improvement in training quality';
    } else {
        grade = 'Needs Attention'; color = '#EF4444'; desc = 'Consider reviewing simulation difficulty';
    }
    return (
        <View style={[perfStyles.badge, { borderColor: `${color}44`, backgroundColor: `${color}11` }]}>
            <Text style={[perfStyles.grade, { color }]}>{grade}</Text>
            <Text style={perfStyles.desc}>{desc}</Text>
        </View>
    );
}

function InfoRow({ icon, label, value, valueColor }) {
    return (
        <View style={infoStyles.row}>
            <View style={infoStyles.left}>
                <Feather name={icon} size={14} color="#6B7280" />
                <Text style={infoStyles.label}>{label}</Text>
            </View>
            <Text style={[infoStyles.value, valueColor && { color: valueColor }]}>{value}</Text>
        </View>
    );
}

// --- Styles ---

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0F172A' },
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
    // 2x2 stats grid
    statsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: 20,
        gap: 10,
        marginBottom: 20,
    },
    statCard: {
        width: (SCREEN_WIDTH - 50) / 2,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 16,
        padding: 14,
        alignItems: 'center',
        borderWidth: 1,
    },
    statIconWrap: {
        width: 38,
        height: 38,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 6,
    },
    statValue: {
        color: '#FFF',
        fontSize: 26,
        fontFamily: 'Poppins_700Bold',
        marginTop: 2,
    },
    statLabel: {
        color: '#9CA3AF',
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
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
    simHeader: { marginBottom: 12 },
    simInfo: {},
    simTitle: {
        color: '#FFF',
        fontSize: 17,
        fontFamily: 'Poppins_600SemiBold',
        marginBottom: 8,
    },
    simMeta: { flexDirection: 'row', gap: 8 },
    metaBadge: {
        backgroundColor: 'rgba(139,92,246,0.2)',
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
        justifyContent: 'space-between',
        paddingVertical: 10,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.08)',
    },
    analyticsItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    analyticsText: {
        color: '#9CA3AF',
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
    },
    // Mini progress bars inside each card
    barsSection: {
        marginTop: 10,
        gap: 8,
    },
    barRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    barLabel: {
        color: '#6B7280',
        fontSize: 10,
        fontFamily: 'Poppins_400Regular',
        width: 60,
    },
    barTrack: {
        flex: 1,
        height: 5,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 3,
        overflow: 'hidden',
    },
    barFill: {
        height: '100%',
        borderRadius: 3,
    },
    barValue: {
        fontSize: 10,
        fontFamily: 'Poppins_600SemiBold',
        width: 32,
        textAlign: 'right',
    },
    actionsRow: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 4,
        marginTop: 12,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.06)',
        paddingTop: 10,
    },
    analyticsBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingVertical: 7,
        paddingHorizontal: 12,
        borderRadius: 8,
        backgroundColor: 'rgba(59,130,246,0.12)',
        marginRight: 'auto',
    },
    actionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingVertical: 7,
        paddingHorizontal: 12,
        borderRadius: 8,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    actionText: {
        fontSize: 13,
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
    createFirstBtn: { borderRadius: 14, overflow: 'hidden' },
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
    // Modal
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'flex-end',
    },
    analyticsModal: {
        backgroundColor: '#1E293B',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '88%',
        padding: 20,
        paddingBottom: 40,
        overflow: 'hidden',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 20,
    },
    modalTitle: {
        color: '#FFF',
        fontSize: 18,
        fontFamily: 'Poppins_700Bold',
        maxWidth: SCREEN_WIDTH - 100,
    },
    modalSubtitle: {
        color: '#6B7280',
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        marginTop: 2,
    },
    modalCloseBtn: {
        padding: 8,
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    kpiGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        marginBottom: 16,
    },
    breakdownCard: {
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
    },
    breakdownTitle: {
        color: '#9CA3AF',
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        marginBottom: 14,
    },
});

const kpiStyles = StyleSheet.create({
    card: {
        width: (SCREEN_WIDTH - 70) / 2,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius: 14,
        padding: 14,
        alignItems: 'center',
        borderWidth: 1,
    },
    iconWrap: {
        width: 36,
        height: 36,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 6,
    },
    value: {
        fontSize: 24,
        fontFamily: 'Poppins_700Bold',
    },
    label: {
        color: '#6B7280',
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        marginTop: 2,
        textAlign: 'center',
    },
});

const barStyles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 12,
    },
    label: {
        color: '#9CA3AF',
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        width: 110,
    },
    trackWrap: { flex: 1 },
    track: {
        height: 8,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 4,
        overflow: 'hidden',
    },
    fill: {
        height: '100%',
        borderRadius: 4,
    },
    dashed: {
        opacity: 0.5,
    },
    pct: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
        width: 40,
        textAlign: 'right',
    },
});

const perfStyles = StyleSheet.create({
    badge: {
        borderRadius: 12,
        borderWidth: 1,
        padding: 14,
        alignItems: 'center',
    },
    grade: {
        fontSize: 22,
        fontFamily: 'Poppins_700Bold',
        marginBottom: 4,
    },
    desc: {
        color: '#9CA3AF',
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
    },
});

const infoStyles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    left: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    label: {
        color: '#6B7280',
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
    },
    value: {
        color: '#E5E7EB',
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
        textTransform: 'capitalize',
    },
});

const attemptStyles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    left: { flex: 1, marginRight: 12 },
    email: {
        color: '#E5E7EB',
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
    },
    date: {
        color: '#6B7280',
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        marginTop: 2,
    },
    right: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    score: {
        fontSize: 14,
        fontFamily: 'Poppins_700Bold',
    },
    badge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
    },
    badgeText: {
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
    },
});
