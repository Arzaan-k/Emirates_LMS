import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Dimensions,
    ActivityIndicator,
    Modal,
    TextInput,
    Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { LineChart, BarChart } from 'react-native-chart-kit';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import API_URL from '../config';

const { width, height } = Dimensions.get('window');

// Analytics Main Menu Component
const AnalyticsMenu = ({ onSelect }) => {
    const menuItems = [
        { id: 'dashboard', title: 'Dashboard', icon: 'view-dashboard', color: '#3B82F6' },
        { id: 'stores', title: 'Store Performance', icon: 'store', color: '#10B981' },
        { id: 'employees', title: 'Employee Performance', icon: 'account-group', color: '#F59E0B' },
        { id: 'training', title: 'Training Effectiveness', icon: 'school', color: '#8B5CF6' },
        { id: 'hygiene', title: 'Hygiene & Compliance', icon: 'shield-check', color: '#EF4444' },
        { id: 'customer', title: 'Customer Experience Impact', icon: 'heart', color: '#EC4899' },
        { id: 'ai-insights', title: 'AI Learning Insights', icon: 'brain', color: '#6366F1' },
        { id: 'reports', title: 'Reports & Export', icon: 'file-chart', color: '#14B8A6' },
    ];

    return (
        <ScrollView style={styles.menuContainer} contentContainerStyle={{ paddingBottom: 20 }}>
            <Text style={styles.menuTitle}>📊 Analytics Modules</Text>
            {menuItems.map((item, index) => (
                <Animated.View key={item.id} entering={FadeInRight.delay(index * 100).duration(500)}>
                    <TouchableOpacity
                        style={[styles.menuItem, { borderLeftColor: item.color }]}
                        onPress={() => onSelect(item.id)}
                        activeOpacity={0.7}
                    >
                        <View style={[styles.menuIcon, { backgroundColor: `${item.color}20` }]}>
                            <MaterialCommunityIcons name={item.icon} size={24} color={item.color} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.menuItemTitle}>{item.title}</Text>
                        </View>
                        <Feather name="chevron-right" size={20} color="#9CA3AF" />
                    </TouchableOpacity>
                </Animated.View>
            ))}
        </ScrollView>
    );
};

// Dashboard Component
const AnalyticsDashboard = ({ onNavigate }) => {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState(null);

    useEffect(() => {
        fetchDashboard();
    }, []);

    const fetchDashboard = async () => {
        try {
            const res = await fetch(`${API_URL}/analytics/dashboard`);
            const json = await res.json();
            
            // Check if response has expected structure
            if (json.overview && json.trend && json.risk_summary) {
                setData(json);
            } else {
                console.error('Invalid API response:', json);
                Alert.alert('Error', 'Analytics endpoint not available. Please ensure backend is running.');
            }
        } catch (e) {
            console.error('Dashboard error:', e);
            Alert.alert('Connection Error', 'Could not connect to analytics server. Please check your connection.');
        } finally {
            setLoading(false);
        }
    };

    const generateAISummary = async () => {
        try {
            Alert.alert('Generating...', 'AI is analyzing your training data');
            const res = await fetch(`${API_URL}/analytics/ai-executive-summary`);
            const json = await res.json();
            if (json.status === 'success') {
                Alert.alert('AI Executive Summary', json.summary, [{ text: 'OK' }]);
            }
        } catch (e) {
            Alert.alert('Error', 'Failed to generate summary');
        }
    };

    if (loading || !data) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#3B82F6" />
                <Text style={styles.loadingText}>Loading Dashboard...</Text>
            </View>
        );
    }

    const chartConfig = {
        backgroundColor: '#1E293B',
        backgroundGradientFrom: '#334155',
        backgroundGradientTo: '#1E293B',
        decimalPlaces: 0,
        color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
        labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
        style: { borderRadius: 16 },
        propsForDots: { r: '4', strokeWidth: '2', stroke: '#3B82F6' }
    };

    return (
        <ScrollView style={styles.contentContainer} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* Overview Cards */}
            <Text style={styles.sectionTitle}>Key Metrics</Text>
            <View style={styles.statsGrid}>
                <StatCard label="Total Stores" value={data.overview.total_stores} icon="store" color="#3B82F6" />
                <StatCard label="Total Employees" value={data.overview.total_employees} icon="account-group" color="#10B981" />
                <StatCard label="Avg Completion" value={`${data.overview.avg_completion}%`} icon="chart-line" color="#F59E0B" />
                <StatCard label="Avg Quiz Score" value={`${data.overview.avg_quiz_score}%`} icon="school" color="#8B5CF6" />
                <StatCard label="Compliance" value={`${data.overview.compliance_score}%`} icon="shield-check" color="#EF4444" />
                <StatCard label="Customer Sat" value={`${data.overview.customer_satisfaction}%`} icon="heart" color="#EC4899" />
            </View>

            {/* Trend Chart */}
            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Training Completion Trend (30 Days)</Text>
            <LineChart
                data={{
                    labels: data.trend.slice(-7).map(d => d.date.slice(5)),
                    datasets: [{ data: data.trend.slice(-7).map(d => d.completions || 0) }]
                }}
                width={width - 40}
                height={220}
                chartConfig={chartConfig}
                bezier
                style={styles.chart}
            />

            {/* Risk Summary */}
            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Risk Summary</Text>
            <View style={styles.riskContainer}>
                <RiskCard
                    label="High Risk Stores"
                    value={data.risk_summary.high_risk_stores}
                    color="#EF4444"
                    icon="alert-circle"
                />
                <RiskCard
                    label="Employees Needing Retraining"
                    value={data.risk_summary.employees_needing_retraining}
                    color="#F59E0B"
                    icon="account-alert"
                />
                <RiskCard
                    label="Fully Compliant Stores"
                    value={data.risk_summary.fully_compliant_stores}
                    color="#10B981"
                    icon="check-circle"
                />
            </View>

            {/* Action Buttons */}
            <View style={styles.buttonRow}>
                <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#3B82F6' }]} onPress={() => onNavigate('reports')}>
                    <Feather name="file-text" size={18} color="#FFF" />
                    <Text style={styles.actionButtonText}>View Reports</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#10B981' }]} onPress={() => onNavigate('hygiene')}>
                    <Feather name="shield" size={18} color="#FFF" />
                    <Text style={styles.actionButtonText}>Compliance</Text>
                </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.aiSummaryButton} onPress={generateAISummary}>
                <LinearGradient colors={['#6366F1', '#8B5CF6']} style={styles.aiButtonGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                    <MaterialCommunityIcons name="brain" size={20} color="#FFF" />
                    <Text style={styles.aiButtonText}>Generate AI Executive Summary</Text>
                </LinearGradient>
            </TouchableOpacity>
        </ScrollView>
    );
};

// Stat Card Component
const StatCard = ({ label, value, icon, color }) => (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
        <View style={[styles.statIcon, { backgroundColor: `${color}20` }]}>
            <MaterialCommunityIcons name={icon} size={20} color={color} />
        </View>
        <View>
            <Text style={styles.statLabel}>{label}</Text>
            <Text style={styles.statValue}>{value}</Text>
        </View>
    </View>
);

// Risk Card Component
const RiskCard = ({ label, value, color, icon }) => (
    <View style={[styles.riskCard, { backgroundColor: `${color}15` }]}>
        <MaterialCommunityIcons name={icon} size={32} color={color} />
        <Text style={[styles.riskValue, { color }]}>{value}</Text>
        <Text style={styles.riskLabel}>{label}</Text>
    </View>
);

// Store Performance Component
const StorePerformance = ({ onSelectStore }) => {
    const [stores, setStores] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchStores();
    }, []);

    const fetchStores = async () => {
        try {
            const res = await fetch(`${API_URL}/analytics/stores`);
            const json = await res.json();
            
            // Ensure we got an array
            if (Array.isArray(json)) {
                setStores(json);
            } else {
                console.error('Invalid stores response:', json);
                setStores([]);
                Alert.alert('Error', 'Could not load store data');
            }
        } catch (e) {
            console.error(e);
            setStores([]);
            Alert.alert('Connection Error', 'Could not fetch store analytics');
        } finally {
            setLoading(false);
        }
    };

    const getRiskColor = (level) => {
        if (level === 'green') return '#10B981';
        if (level === 'yellow') return '#F59E0B';
        return '#EF4444';
    };

    if (loading) return <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#3B82F6" /></View>;

    if (!stores || stores.length === 0) {
        return (
            <View style={styles.loadingContainer}>
                <Text style={styles.sectionTitle}>No Store Data Available</Text>
                <Text style={styles.loadingText}>Please ensure backend is running and has store data</Text>
            </View>
        );
    }

    return (
        <ScrollView style={styles.contentContainer} contentContainerStyle={{ paddingBottom: 20 }}>
            <Text style={styles.sectionTitle}>Store Performance</Text>
            {stores.map((store, index) => (
                <TouchableOpacity
                    key={store.store_id}
                    style={styles.storeCard}
                    onPress={() => onSelectStore(store.store_name)}
                    activeOpacity={0.7}
                >
                    <View style={styles.storeHeader}>
                        <View style={[styles.riskDot, { backgroundColor: getRiskColor(store.risk_level) }]} />
                        <Text style={styles.storeName}>{store.store_name}</Text>
                    </View>
                    <View style={styles.storeMetrics}>
                        <MetricBadge label="Completion" value={`${store.completion_percent}%`} />
                        <MetricBadge label="Quiz Score" value={`${store.avg_quiz_score}%`} />
                        <MetricBadge label="Hygiene" value={`${store.hygiene_score}%`} />
                    </View>
                    <View style={[styles.riskBadge, { backgroundColor: `${getRiskColor(store.risk_level)}20` }]}>
                        <Text style={[styles.riskBadgeText, { color: getRiskColor(store.risk_level) }]}>
                            {store.risk_level.toUpperCase()} RISK
                        </Text>
                    </View>
                </TouchableOpacity>
            ))}
        </ScrollView>
    );
};

const MetricBadge = ({ label, value }) => (
    <View style={styles.metricBadge}>
        <Text style={styles.metricLabel}>{label}</Text>
        <Text style={styles.metricValue}>{value}</Text>
    </View>
);

// MAIN Analytics Screen
export default function Analytics({ navigation, route }) {
    const [currentView, setCurrentView] = useState('menu');
    const [selectedStore, setSelectedStore] = useState(null);

    const renderContent = () => {
        switch (currentView) {
            case 'menu':
                return <AnalyticsMenu onSelect={setCurrentView} />;
            case 'dashboard':
                return <AnalyticsDashboard onNavigate={setCurrentView} />;
            case 'stores':
                return <StorePerformance onSelectStore={(store) => {
                    setSelectedStore(store);
                    // Navigate to detail (implement StoreDetail component)
                }} />;
            // Add other modules similarly
            default:
                return <AnalyticsMenu onSelect={setCurrentView} />;
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <LinearGradient colors={['#1E293B', '#0F172A']} style={styles.header}>
                <View style={styles.headerContent}>
                    {currentView !== 'menu' && (
                        <TouchableOpacity onPress={() => setCurrentView('menu')} style={styles.backButton}>
                            <Feather name="arrow-left" size={24} color="#FFF" />
                        </TouchableOpacity>
                    )}
                    <View style={{ flex: 1 }}>
                        <Text style={styles.headerTitle}>Analytics</Text>
                        <Text style={styles.headerSubtitle}>
                            {currentView === 'menu' ? 'Select a module' : currentView.replace('-', ' ').toUpperCase()}
                        </Text>
                    </View>
                    <TouchableOpacity onPress={() => navigation.goBack()}>
                        <Feather name="x" size={24} color="#FFF" />
                    </TouchableOpacity>
                </View>
            </LinearGradient>
            {renderContent()}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0F172A',
    },
    header: {
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    headerContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    backButton: {
        marginRight: 12,
    },
    headerTitle: {
        fontSize: 24,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
    },
    headerSubtitle: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#94A3B8',
        marginTop: 2,
    },
    menuContainer: {
        flex: 1,
        padding: 20,
    },
    menuTitle: {
        fontSize: 18,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
        marginBottom: 16,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1E293B',
        padding: 16,
        borderRadius: 12,
        marginBottom: 12,
        borderLeftWidth: 4,
    },
    menuIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    menuItemTitle: {
        fontSize: 16,
        fontFamily: 'Poppins_500Medium',
        color: '#FFF',
    },
    contentContainer: {
        flex: 1,
        padding: 20,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        color: '#94A3B8',
        marginTop: 12,
    },
    sectionTitle: {
        fontSize: 18,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
        marginBottom: 16,
    },
    statsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },
    statCard: {
        width: '48%',
        backgroundColor: '#1E293B',
        padding: 12,
        borderRadius: 12,
        marginBottom: 12,
        borderLeftWidth: 3,
        flexDirection: 'row',
        alignItems: 'center',
    },
    statIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10,
    },
    statLabel: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        color: '#94A3B8',
    },
    statValue: {
        fontSize: 18,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
        marginTop: 2,
    },
    chart: {
        marginVertical: 8,
        borderRadius: 16,
    },
    riskContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    riskCard: {
        flex: 1,
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
        marginHorizontal: 4,
    },
    riskValue: {
        fontSize: 28,
        fontFamily: 'Poppins_700Bold',
        marginTop: 8,
    },
    riskLabel: {
        fontSize: 11,
        fontFamily: 'Poppins_500Medium',
        color: '#94A3B8',
        textAlign: 'center',
        marginTop: 4,
    },
    buttonRow: {
        flexDirection: 'row',
        marginTop: 20,
        justifyContent: 'space-between',
    },
    actionButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        borderRadius: 12,
        marginHorizontal: 4,
    },
    actionButtonText: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
        marginLeft: 8,
    },
    aiSummaryButton: {
        marginTop: 16,
        borderRadius: 12,
        overflow: 'hidden',
    },
    aiButtonGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
    },
    aiButtonText: {
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
        marginLeft: 10,
    },
    storeCard: {
        backgroundColor: '#1E293B',
        padding: 16,
        borderRadius: 12,
        marginBottom: 12,
    },
    storeHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    riskDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        marginRight: 10,
    },
    storeName: {
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
    },
    storeMetrics: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    metricBadge: {
        backgroundColor: '#334155',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
    },
    metricLabel: {
        fontSize: 10,
        fontFamily: 'Poppins_400Regular',
        color: '#94A3B8',
    },
    metricValue: {
        fontSize: 14,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
        marginTop: 2,
    },
    riskBadge: {
        alignSelf: 'flex-start',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 6,
    },
    riskBadgeText: {
        fontSize: 11,
        fontFamily: 'Poppins_700Bold',
        letterSpacing: 0.5,
    },
});
