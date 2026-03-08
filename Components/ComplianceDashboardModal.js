import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Modal,
    Dimensions,
    ActivityIndicator
} from 'react-native';
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import API_URL from '../config';

const { width, height } = Dimensions.get('window');

const STATUS_COLORS = {
    green: '#10B981',
    yellow: '#D71A21',
    red: '#EF4444'
};

// RAG Status Card
const RAGCard = ({ label, count, color, icon }) => (
    <View style={[styles.ragCard, { borderColor: color + '40' }]}>
        <View style={[styles.ragIcon, { backgroundColor: color + '20' }]}>
            <MaterialCommunityIcons name={icon} size={24} color={color} />
        </View>
        <Text style={[styles.ragCount, { color }]}>{count}</Text>
        <Text style={styles.ragLabel}>{label}</Text>
    </View>
);

// Store Compliance Card
const StoreCard = ({ store }) => {
    const statusColor = STATUS_COLORS[store.status];
    
    return (
        <View style={[styles.storeCard, { borderLeftColor: statusColor }]}>
            <View style={styles.storeHeader}>
                <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                <Text style={styles.storeName}>{store.name}</Text>
                <View style={[styles.scoreBadge, { backgroundColor: statusColor }]}>
                    <Text style={styles.scoreText}>{store.score}%</Text>
                </View>
            </View>
            
            <View style={styles.storeStats}>
                <View style={styles.storeStat}>
                    <MaterialCommunityIcons name="check-circle" size={16} color="#10B981" />
                    <Text style={styles.storeStatValue}>{store.compliant}</Text>
                    <Text style={styles.storeStatLabel}>Compliant</Text>
                </View>
                <View style={styles.storeStat}>
                    <MaterialCommunityIcons name="clock-alert" size={16} color="#D71A21" />
                    <Text style={styles.storeStatValue}>{store.expiring}</Text>
                    <Text style={styles.storeStatLabel}>Expiring</Text>
                </View>
                <View style={styles.storeStat}>
                    <MaterialCommunityIcons name="alert-circle" size={16} color="#EF4444" />
                    <Text style={styles.storeStatValue}>{store.expired}</Text>
                    <Text style={styles.storeStatLabel}>Expired</Text>
                </View>
                <View style={styles.storeStat}>
                    <MaterialCommunityIcons name="account-group" size={16} color="#6B7280" />
                    <Text style={styles.storeStatValue}>{store.total_employees}</Text>
                    <Text style={styles.storeStatLabel}>Staff</Text>
                </View>
            </View>
        </View>
    );
};

// Expiring Certification Alert
const ExpiringAlert = ({ cert }) => {
    const daysColor = cert.days_remaining <= 7 ? '#EF4444' : (cert.days_remaining <= 14 ? '#D71A21' : '#10B981');
    
    return (
        <View style={styles.alertCard}>
            <View style={[styles.alertIcon, { backgroundColor: cert.requirement?.color + '20' || '#EF444420' }]}>
                <MaterialCommunityIcons 
                    name={cert.requirement?.icon || 'certificate'} 
                    size={20} 
                    color={cert.requirement?.color || '#EF4444'} 
                />
            </View>
            <View style={styles.alertInfo}>
                <Text style={styles.alertName}>{cert.requirement?.name}</Text>
                <Text style={styles.alertUser}>{cert.user_email}</Text>
            </View>
            <View style={[styles.daysLeft, { backgroundColor: daysColor + '20' }]}>
                <Text style={[styles.daysText, { color: daysColor }]}>
                    {cert.days_remaining}d
                </Text>
            </View>
        </View>
    );
};

// Requirement Row
const RequirementRow = ({ req }) => (
    <View style={styles.reqRow}>
        <View style={[styles.reqIcon, { backgroundColor: req.color + '20' }]}>
            <MaterialCommunityIcons name={req.icon || 'certificate'} size={20} color={req.color} />
        </View>
        <View style={styles.reqInfo}>
            <Text style={styles.reqName}>{req.name}</Text>
            <Text style={styles.reqMeta}>
                {req.type.charAt(0).toUpperCase() + req.type.slice(1)} • Valid for {req.validity_days} days
            </Text>
        </View>
        {req.is_mandatory && (
            <View style={styles.mandatoryBadge}>
                <Text style={styles.mandatoryText}>Required</Text>
            </View>
        )}
    </View>
);

export default function ComplianceDashboardModal({ visible, onClose }) {
    const [view, setView] = useState('overview'); // overview, stores, expiring, requirements
    const [dashboard, setDashboard] = useState(null);
    const [expiring, setExpiring] = useState([]);
    const [requirements, setRequirements] = useState([]);
    const [loading, setLoading] = useState(false);
    
    useEffect(() => {
        if (visible) {
            fetchData();
        }
    }, [visible]);
    
    const fetchData = async () => {
        setLoading(true);
        try {
            // Fetch dashboard
            const dashRes = await fetch(`${API_URL}/compliance/dashboard`);
            const dashData = await dashRes.json();
            setDashboard(dashData);
            
            // Fetch expiring
            const expRes = await fetch(`${API_URL}/compliance/expiring?days=30`);
            const expData = await expRes.json();
            setExpiring(expData.expiring || []);
            
            // Fetch requirements
            const reqRes = await fetch(`${API_URL}/compliance/requirements`);
            const reqData = await reqRes.json();
            setRequirements(reqData.requirements || []);
            
        } catch (err) {
            console.log('Compliance fetch error:', err);
        }
        setLoading(false);
    };
    
    if (!visible) return null;
    
    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View style={styles.overlay}>
                <BlurView intensity={80} style={StyleSheet.absoluteFill} />
                <Animated.View entering={FadeInUp} style={styles.container}>
                    <LinearGradient colors={['#1F2937', '#111827']} style={styles.gradient}>
                        {/* Header */}
                        <View style={styles.header}>
                            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                                <Feather name="x" size={24} color="#FFF" />
                            </TouchableOpacity>
                            <View style={styles.headerCenter}>
                                <MaterialCommunityIcons name="shield-check" size={24} color="#10B981" />
                                <Text style={styles.headerTitle}>Compliance</Text>
                            </View>
                            <TouchableOpacity style={styles.exportBtn}>
                                <Feather name="download" size={18} color="#FFF" />
                            </TouchableOpacity>
                        </View>
                        
                        {loading ? (
                            <ActivityIndicator size="large" color="#10B981" style={{ marginTop: 40 }} />
                        ) : (
                            <>
                                {/* Compliance Rate Hero */}
                                <View style={styles.heroCard}>
                                    <LinearGradient 
                                        colors={dashboard?.overview?.compliance_rate >= 80 ? ['#10B981', '#059669'] : ['#D71A21', '#B91C1C']} 
                                        style={styles.heroGradient}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 1 }}
                                    >
                                        <View style={styles.heroContent}>
                                            <MaterialCommunityIcons name="shield-check" size={40} color="rgba(255,255,255,0.3)" style={styles.heroIcon} />
                                            <Text style={styles.heroValue}>{dashboard?.overview?.compliance_rate || 0}%</Text>
                                            <Text style={styles.heroLabel}>Overall Compliance Rate</Text>
                                        </View>
                                        <View style={styles.heroStats}>
                                            <View style={styles.heroStat}>
                                                <Text style={styles.heroStatValue}>{dashboard?.overview?.valid || 0}</Text>
                                                <Text style={styles.heroStatLabel}>Valid</Text>
                                            </View>
                                            <View style={styles.heroStatDivider} />
                                            <View style={styles.heroStat}>
                                                <Text style={styles.heroStatValue}>{dashboard?.overview?.expiring_soon || 0}</Text>
                                                <Text style={styles.heroStatLabel}>Expiring</Text>
                                            </View>
                                            <View style={styles.heroStatDivider} />
                                            <View style={styles.heroStat}>
                                                <Text style={styles.heroStatValue}>{dashboard?.overview?.expired || 0}</Text>
                                                <Text style={styles.heroStatLabel}>Expired</Text>
                                            </View>
                                        </View>
                                    </LinearGradient>
                                </View>
                                
                                {/* Store Status Summary */}
                                <View style={styles.ragRow}>
                                    <RAGCard 
                                        label="Healthy" 
                                        count={dashboard?.stores?.green || 0} 
                                        color="#10B981" 
                                        icon="check-circle"
                                    />
                                    <RAGCard 
                                        label="At Risk" 
                                        count={dashboard?.stores?.yellow || 0} 
                                        color="#D71A21" 
                                        icon="alert"
                                    />
                                    <RAGCard 
                                        label="Critical" 
                                        count={dashboard?.stores?.red || 0} 
                                        color="#EF4444" 
                                        icon="alert-circle"
                                    />
                                </View>
                                
                                {/* View Tabs */}
                                <View style={styles.tabRow}>
                                    {['stores', 'expiring', 'requirements'].map(tab => (
                                        <TouchableOpacity 
                                            key={tab}
                                            style={[styles.tab, view === tab && styles.tabActive]}
                                            onPress={() => setView(tab)}
                                        >
                                            <Text style={[styles.tabText, view === tab && styles.tabTextActive]}>
                                                {tab === 'stores' ? 'Stores' : (tab === 'expiring' ? `Expiring (${expiring.length})` : 'Requirements')}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                                
                                {/* Content */}
                                <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                                    {view === 'stores' ? (
                                        <>
                                            <Text style={styles.sectionTitle}>Store Compliance Status</Text>
                                            {dashboard?.store_details?.map((store, idx) => (
                                                <Animated.View key={store.name} entering={FadeInDown.delay(idx * 100)}>
                                                    <StoreCard store={store} />
                                                </Animated.View>
                                            ))}
                                        </>
                                    ) : view === 'expiring' ? (
                                        <>
                                            <Text style={styles.sectionTitle}>Expiring in Next 30 Days</Text>
                                            {expiring.length === 0 ? (
                                                <View style={styles.emptyState}>
                                                    <MaterialCommunityIcons name="check-decagram" size={48} color="#10B981" />
                                                    <Text style={styles.emptyText}>All certifications are up to date!</Text>
                                                </View>
                                            ) : (
                                                expiring.map((cert, idx) => (
                                                    <Animated.View key={idx} entering={FadeInDown.delay(idx * 50)}>
                                                        <ExpiringAlert cert={cert} />
                                                    </Animated.View>
                                                ))
                                            )}
                                        </>
                                    ) : (
                                        <>
                                            <Text style={styles.sectionTitle}>Compliance Requirements</Text>
                                            {requirements.map((req, idx) => (
                                                <Animated.View key={req.id} entering={FadeInDown.delay(idx * 50)}>
                                                    <RequirementRow req={req} />
                                                </Animated.View>
                                            ))}
                                        </>
                                    )}
                                    
                                    <View style={{ height: 40 }} />
                                </ScrollView>
                            </>
                        )}
                    </LinearGradient>
                </Animated.View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    container: {
        height: height * 0.92,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        overflow: 'hidden',
    },
    gradient: {
        flex: 1,
        paddingTop: 16,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingBottom: 16,
    },
    closeBtn: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerCenter: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 20,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
        marginLeft: 10,
    },
    exportBtn: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    // Hero Card
    heroCard: {
        marginHorizontal: 20,
        borderRadius: 20,
        overflow: 'hidden',
        marginBottom: 16,
    },
    heroGradient: {
        padding: 20,
    },
    heroContent: {
        alignItems: 'center',
        marginBottom: 16,
    },
    heroIcon: {
        position: 'absolute',
        right: -20,
        top: -20,
        opacity: 0.2,
    },
    heroValue: {
        fontSize: 56,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
    },
    heroLabel: {
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        color: 'rgba(255,255,255,0.8)',
    },
    heroStats: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        backgroundColor: 'rgba(0,0,0,0.2)',
        borderRadius: 12,
        padding: 12,
    },
    heroStat: {
        alignItems: 'center',
    },
    heroStatValue: {
        fontSize: 20,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
    },
    heroStatLabel: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        color: 'rgba(255,255,255,0.7)',
    },
    heroStatDivider: {
        width: 1,
        height: '80%',
        backgroundColor: 'rgba(255,255,255,0.2)',
    },
    // RAG Cards
    ragRow: {
        flexDirection: 'row',
        paddingHorizontal: 20,
        gap: 10,
        marginBottom: 16,
    },
    ragCard: {
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 14,
        padding: 12,
        alignItems: 'center',
        borderWidth: 1,
    },
    ragIcon: {
        width: 40,
        height: 40,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    ragCount: {
        fontSize: 24,
        fontFamily: 'Poppins_700Bold',
    },
    ragLabel: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        color: '#9CA3AF',
    },
    // Tabs
    tabRow: {
        flexDirection: 'row',
        paddingHorizontal: 20,
        gap: 8,
        marginBottom: 12,
    },
    tab: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.05)',
        alignItems: 'center',
    },
    tabActive: {
        backgroundColor: '#10B981',
    },
    tabText: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
        color: '#9CA3AF',
    },
    tabTextActive: {
        color: '#FFF',
    },
    content: {
        flex: 1,
        paddingHorizontal: 20,
    },
    sectionTitle: {
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
        marginTop: 12,
        marginBottom: 12,
    },
    // Store Card
    storeCard: {
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 14,
        padding: 14,
        marginBottom: 10,
        borderLeftWidth: 4,
    },
    storeHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    statusDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        marginRight: 10,
    },
    storeName: {
        flex: 1,
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
    },
    scoreBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 10,
    },
    scoreText: {
        fontSize: 12,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
    },
    storeStats: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    storeStat: {
        alignItems: 'center',
    },
    storeStatValue: {
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
        marginTop: 4,
    },
    storeStatLabel: {
        fontSize: 10,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
    },
    // Alert Card
    alertCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(239, 68, 68, 0.05)',
        borderRadius: 12,
        padding: 12,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.1)',
    },
    alertIcon: {
        width: 40,
        height: 40,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    alertInfo: {
        flex: 1,
    },
    alertName: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
    },
    alertUser: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
    },
    daysLeft: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
    },
    daysText: {
        fontSize: 12,
        fontFamily: 'Poppins_700Bold',
    },
    // Requirement Row
    reqRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 12,
        padding: 12,
        marginBottom: 8,
    },
    reqIcon: {
        width: 40,
        height: 40,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    reqInfo: {
        flex: 1,
    },
    reqName: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
    },
    reqMeta: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
    },
    mandatoryBadge: {
        backgroundColor: 'rgba(239, 68, 68, 0.2)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    mandatoryText: {
        fontSize: 10,
        fontFamily: 'Poppins_600SemiBold',
        color: '#EF4444',
    },
    // Empty State
    emptyState: {
        alignItems: 'center',
        paddingVertical: 40,
    },
    emptyText: {
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        color: '#10B981',
        marginTop: 12,
    },
});
