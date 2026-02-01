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

const ACTION_COLORS = {
    CREATE_USER: '#10B981',
    DELETE_USER: '#EF4444',
    UPLOAD_CONTENT: '#3B82F6',
    DELETE_CONTENT: '#EF4444',
    ASSIGN_QUIZ: '#F59E0B',
    UPDATE_COMPLIANCE: '#10B981',
    CREATE_CAMPAIGN: '#8B5CF6',
    SEND_NOTIFICATION: '#EC4899',
    UPDATE_ACCESS: '#6366F1',
};

const ACTION_ICONS = {
    CREATE_USER: 'account-plus',
    DELETE_USER: 'account-minus',
    UPLOAD_CONTENT: 'cloud-upload',
    DELETE_CONTENT: 'delete',
    ASSIGN_QUIZ: 'clipboard-check',
    UPDATE_COMPLIANCE: 'shield-check',
    CREATE_CAMPAIGN: 'bullhorn',
    SEND_NOTIFICATION: 'bell',
    UPDATE_ACCESS: 'lock',
};

// Log Entry
const LogEntry = ({ log, index }) => {
    const color = ACTION_COLORS[log.action] || '#6B7280';
    const icon = ACTION_ICONS[log.action] || 'file';
    const time = new Date(log.timestamp);

    return (
        <Animated.View entering={FadeInDown.delay(index * 50)} style={styles.logEntry}>
            <View style={[styles.logIcon, { backgroundColor: color + '20' }]}>
                <MaterialCommunityIcons name={icon} size={18} color={color} />
            </View>
            <View style={styles.logContent}>
                <View style={styles.logHeader}>
                    <Text style={styles.logAction}>{log.action.replace(/_/g, ' ')}</Text>
                    <Text style={styles.logTime}>
                        {time.toLocaleDateString()} {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                </View>
                <Text style={styles.logTarget}>Target: {log.target}</Text>
                {log.details && <Text style={styles.logDetails}>{log.details}</Text>}
                <View style={styles.logFooter}>
                    <MaterialCommunityIcons name="account" size={12} color="#6B7280" />
                    <Text style={styles.logAdmin}>{log.admin_email}</Text>
                </View>
            </View>
        </Animated.View>
    );
};

export default function AuditLogsModal({ visible, onClose }) {
    const [logs, setLogs] = useState([]);
    const [filterType, setFilterType] = useState(null);
    const [actionTypes, setActionTypes] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (visible) fetchLogs();
    }, [visible, filterType]);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const url = filterType
                ? `${API_URL}/audit-logs?action_type=${filterType}`
                : `${API_URL}/audit-logs`;
            const res = await fetch(url);
            const data = await res.json();
            setLogs(data.logs || []);
            setActionTypes(data.action_types || []);
        } catch (err) {
            console.log('Audit logs fetch error:', err);
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
                                <MaterialCommunityIcons name="history" size={24} color="#6366F1" />
                                <Text style={styles.headerTitle}>Audit Logs</Text>
                            </View>
                            <TouchableOpacity style={styles.exportBtn}>
                                <Feather name="download" size={18} color="#FFF" />
                            </TouchableOpacity>
                        </View>

                        {/* Filter Pills */}
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
                            <TouchableOpacity
                                style={[styles.filterPill, !filterType && styles.filterPillActive]}
                                onPress={() => setFilterType(null)}
                            >
                                <Text style={[styles.filterText, !filterType && styles.filterTextActive]}>All</Text>
                            </TouchableOpacity>
                            {actionTypes.map(type => (
                                <TouchableOpacity
                                    key={type}
                                    style={[styles.filterPill, filterType === type && styles.filterPillActive]}
                                    onPress={() => setFilterType(type)}
                                >
                                    <View style={[styles.filterDot, { backgroundColor: ACTION_COLORS[type] }]} />
                                    <Text style={[styles.filterText, filterType === type && styles.filterTextActive]}>
                                        {type.replace(/_/g, ' ')}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        {/* Stats */}
                        <View style={styles.statsRow}>
                            <View style={styles.statCard}>
                                <Text style={styles.statValue}>{logs.length}</Text>
                                <Text style={styles.statLabel}>Total Logs</Text>
                            </View>
                            <View style={styles.statCard}>
                                <Text style={[styles.statValue, { color: '#10B981' }]}>
                                    {logs.filter(l => l.action.startsWith('CREATE')).length}
                                </Text>
                                <Text style={styles.statLabel}>Creates</Text>
                            </View>
                            <View style={styles.statCard}>
                                <Text style={[styles.statValue, { color: '#EF4444' }]}>
                                    {logs.filter(l => l.action.startsWith('DELETE')).length}
                                </Text>
                                <Text style={styles.statLabel}>Deletes</Text>
                            </View>
                        </View>

                        {/* Logs List */}
                        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                            {loading ? (
                                <ActivityIndicator size="large" color="#6366F1" style={{ marginTop: 40 }} />
                            ) : logs.length === 0 ? (
                                <View style={styles.emptyState}>
                                    <MaterialCommunityIcons name="clipboard-text-off" size={48} color="#6B7280" />
                                    <Text style={styles.emptyText}>No audit logs found</Text>
                                </View>
                            ) : (
                                logs.map((log, idx) => <LogEntry key={log.id} log={log} index={idx} />)
                            )}

                            <View style={{ height: 40 }} />
                        </ScrollView>
                    </LinearGradient>
                </Animated.View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end' },
    container: { height: height * 0.92, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
    gradient: { flex: 1, paddingTop: 16 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 12 },
    closeBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
    headerCenter: { flexDirection: 'row', alignItems: 'center' },
    headerTitle: { fontSize: 20, fontFamily: 'Poppins_700Bold', color: '#FFF', marginLeft: 10 },
    exportBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
    // Filters
    filterRow: { paddingHorizontal: 16, paddingVertical: 8, maxHeight: 60, flexGrow: 0 },
    filterPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.05)', marginRight: 8 },
    filterPillActive: { backgroundColor: '#6366F1' },
    filterDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
    filterText: { fontSize: 11, fontFamily: 'Poppins_500Medium', color: '#9CA3AF' },
    filterTextActive: { color: '#FFF' },
    // Stats
    statsRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 10, marginVertical: 10 },
    statCard: { flex: 1, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 12, alignItems: 'center' },
    statValue: { fontSize: 22, fontFamily: 'Poppins_700Bold', color: '#FFF' },
    statLabel: { fontSize: 10, fontFamily: 'Poppins_400Regular', color: '#6B7280' },
    content: { flex: 1, paddingHorizontal: 20 },
    // Log Entry
    logEntry: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: 14, marginBottom: 10 },
    logIcon: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    logContent: { flex: 1 },
    logHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    logAction: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: '#FFF', textTransform: 'capitalize' },
    logTime: { fontSize: 10, fontFamily: 'Poppins_400Regular', color: '#6B7280' },
    logTarget: { fontSize: 12, fontFamily: 'Poppins_500Medium', color: '#A5B4FC' },
    logDetails: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: '#9CA3AF', marginTop: 2 },
    logFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
    logAdmin: { fontSize: 10, fontFamily: 'Poppins_400Regular', color: '#6B7280', marginLeft: 4 },
    // Empty
    emptyState: { alignItems: 'center', paddingVertical: 60 },
    emptyText: { fontSize: 14, fontFamily: 'Poppins_500Medium', color: '#6B7280', marginTop: 12 },
});
