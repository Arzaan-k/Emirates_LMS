import React, { useState, useEffect } from 'react';
import {
    Platform,
    TextInput,
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
// Conditional import for DateTimePicker to avoid Web crash
let DateTimePicker = () => null;
if (Platform.OS !== 'web') {
    DateTimePicker = require('@react-native-community/datetimepicker').default;
}
import API_URL from '../config';

const { width, height } = Dimensions.get('window');

const ACTION_COLORS = {
    // User actions
    CREATE_USER: '#10B981',
    DELETE_USER: '#EF4444',
    UPDATE_USER: '#3B82F6',
    USER_LOGIN: '#6366F1',
    // Content actions
    UPLOAD_CONTENT: '#3B82F6',
    DELETE_CONTENT: '#EF4444',
    UPDATE_CONTENT: '#D71A21',
    // Quiz actions
    CREATE_QUIZ: '#8B5CF6',
    DELETE_QUIZ: '#EF4444',
    UPDATE_QUIZ: '#D71A21',
    ASSIGN_QUIZ: '#D71A21',
    SUBMIT_QUIZ: '#10B981',
    // Assessment actions
    CREATE_ASSESSMENT: '#8B5CF6',
    DELETE_ASSESSMENT: '#EF4444',
    SUBMIT_ASSESSMENT: '#10B981',
    // Campaign/notification actions
    CREATE_CAMPAIGN: '#8B5CF6',
    DELETE_CAMPAIGN: '#EF4444',
    SEND_NOTIFICATION: '#EC4899',
    // Compliance/access
    UPDATE_COMPLIANCE: '#10B981',
    UPDATE_ACCESS: '#6366F1',
    // Store actions
    CREATE_STORE: '#10B981',
    DELETE_STORE: '#EF4444',
    UPDATE_STORE: '#3B82F6',
    // Level/bucket actions
    CREATE_LEVEL: '#8B5CF6',
    DELETE_LEVEL: '#EF4444',
    UPDATE_LEVEL: '#D71A21',
    // Other actions
    RECORD_ATTENDANCE: '#10B981',
    START_SIMULATION: '#3B82F6',
    SUBMIT_AUDIT: '#D71A21',
};

const ACTION_ICONS = {
    // User actions
    CREATE_USER: 'account-plus',
    DELETE_USER: 'account-minus',
    UPDATE_USER: 'account-edit',
    USER_LOGIN: 'login',
    // Content actions
    UPLOAD_CONTENT: 'cloud-upload',
    DELETE_CONTENT: 'delete',
    UPDATE_CONTENT: 'file-edit',
    // Quiz actions
    CREATE_QUIZ: 'clipboard-plus',
    DELETE_QUIZ: 'clipboard-remove',
    UPDATE_QUIZ: 'clipboard-edit',
    ASSIGN_QUIZ: 'clipboard-check',
    SUBMIT_QUIZ: 'clipboard-check-outline',
    // Assessment actions
    CREATE_ASSESSMENT: 'file-document-edit',
    DELETE_ASSESSMENT: 'file-remove',
    SUBMIT_ASSESSMENT: 'file-check',
    // Campaign/notification actions
    CREATE_CAMPAIGN: 'bullhorn',
    DELETE_CAMPAIGN: 'bullhorn-outline',
    SEND_NOTIFICATION: 'bell',
    // Compliance/access
    UPDATE_COMPLIANCE: 'shield-check',
    UPDATE_ACCESS: 'lock',
    // Store actions
    CREATE_STORE: 'store-plus',
    DELETE_STORE: 'store-remove',
    UPDATE_STORE: 'store-edit',
    // Level/bucket actions
    CREATE_LEVEL: 'layers-plus',
    DELETE_LEVEL: 'layers-remove',
    UPDATE_LEVEL: 'layers-edit',
    // Other actions
    RECORD_ATTENDANCE: 'clock-check',
    START_SIMULATION: 'play-circle',
    SUBMIT_AUDIT: 'clipboard-check',
};

// Web Date Input specific component
const WebDateInput = ({ value, onChange }) => {
    return React.createElement('input', {
        type: 'date',
        value: value,
        onChange: (e) => onChange(e.target.value),
        style: {
            backgroundColor: 'rgba(255,255,255,0.05)',
            border: '1px solid #6366F1',
            borderRadius: '8px',
            color: '#E5E7EB',
            padding: '8px 12px',
            fontSize: '12px',
            fontFamily: 'Poppins, sans-serif',
            outline: 'none',
            colorScheme: 'dark',
            cursor: 'pointer',
            minWidth: '130px'
        }
    });
};

// Log Entry
const LogEntry = ({ log, index }) => {
    const action = log.action || 'UNKNOWN_ACTION';
    const color = ACTION_COLORS[action] || '#6B7280';
    const icon = ACTION_ICONS[action] || 'file';
    const time = log.timestamp ? new Date(log.timestamp) : new Date();

    return (
        <Animated.View entering={FadeInDown.delay(index * 50)} style={styles.logEntry}>
            <View style={[styles.logIcon, { backgroundColor: color + '20' }]}>
                <MaterialCommunityIcons name={icon} size={18} color={color} />
            </View>
            <View style={styles.logContent}>
                <View style={styles.logHeader}>
                    <Text style={styles.logAction}>{action.replace(/_/g, ' ')}</Text>
                    <Text style={styles.logTime}>
                        {time.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })} {time.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                </View>
                <Text style={styles.logTarget}>Target: {log.target}</Text>
                {log.details && <Text style={styles.logDetails}>{log.details}</Text>}
                <View style={styles.logFooter}>
                    <MaterialCommunityIcons name="account" size={12} color="#6B7280" />
                    <Text style={styles.logAdmin}>{log.user_name || log.user_email || 'System'}</Text>
                </View>
            </View>
        </Animated.View>
    );
};

export default function AuditLogsModal({ visible, onClose }) {
    const [logs, setLogs] = useState([]);
    const [totalLogs, setTotalLogs] = useState(0);
    const [filterType, setFilterType] = useState(null);
    const [actionTypes, setActionTypes] = useState([]);
    const [loading, setLoading] = useState(false);

    // Date Filter State
    const [startDate, setStartDate] = useState(null);
    const [endDate, setEndDate] = useState(null);
    const [showStartPicker, setShowStartPicker] = useState(false);
    const [showEndPicker, setShowEndPicker] = useState(false);
    // Web State
    const [webStart, setWebStart] = useState('');
    const [webEnd, setWebEnd] = useState('');

    useEffect(() => {
        if (visible) fetchLogs();
    }, [visible, filterType, startDate, endDate]);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            let url = `${API_URL}/audit-logs`;
            const params = [];

            if (filterType) params.push(`action=${filterType}`);
            if (startDate) params.push(`start_date=${startDate.toISOString()}`);
            if (endDate) params.push(`end_date=${endDate.toISOString()}`);

            if (params.length > 0) {
                url += '?' + params.join('&');
            }

            const res = await fetch(url);
            const data = await res.json();

            // Backend now returns { logs, total, action_types }
            if (Array.isArray(data)) {
                setLogs(data);
                setTotalLogs(data.length);
                const types = [...new Set(data.map(l => l.action))];
                if (types.length > 0) setActionTypes(types);
            } else {
                setLogs(data.logs || []);
                setTotalLogs(data.total !== undefined ? data.total : (data.logs ? data.logs.length : 0));
                if (data.action_types) {
                    setActionTypes(data.action_types);
                } else {
                    // Fallback
                    const types = [...new Set((data.logs || []).map(l => l.action))];
                    if (types.length > 0) setActionTypes(types);
                }
            }
        } catch (err) {
            console.log('Audit logs fetch error:', err);
        }
        setLoading(false);
    };

    const onStartDateChange = (event, selectedDate) => {
        setShowStartPicker(false);
        if (selectedDate) setStartDate(selectedDate);
    };

    const onEndDateChange = (event, selectedDate) => {
        setShowEndPicker(false);
        if (selectedDate) setEndDate(selectedDate);
    };

    const handleWebDateChange = (text, type) => {
        if (type === 'start') setWebStart(text);
        if (type === 'end') setWebEnd(text);

        // Simple validation: YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
            const date = new Date(text);
            if (!isNaN(date.getTime())) {
                if (type === 'start') setStartDate(date);
                if (type === 'end') setEndDate(date);
            }
        } else if (text === '') {
            if (type === 'start') setStartDate(null);
            if (type === 'end') setEndDate(null);
        }
    };

    // Export functionality - exports currently filtered logs as CSV
    const handleExport = () => {
        if (logs.length === 0) {
            if (Platform.OS === 'web') {
                alert('No logs to export');
            }
            return;
        }

        // Build CSV content
        const headers = ['Timestamp', 'Action', 'Target', 'Details', 'User', 'Email', 'IP Address'];
        const csvRows = [headers.join(',')];

        logs.forEach(log => {
            const row = [
                log.timestamp ? new Date(log.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '',
                (log.action || '').replace(/,/g, ';'),
                (log.target || '').replace(/,/g, ';'),
                (log.details || '').replace(/,/g, ';').replace(/\n/g, ' '),
                (log.user_name || '').replace(/,/g, ';'),
                (log.user_email || '').replace(/,/g, ';'),
                (log.ip_address || '').replace(/,/g, ';')
            ];
            csvRows.push(row.map(cell => `"${cell}"`).join(','));
        });

        const csvContent = csvRows.join('\n');

        // Generate filename with filter info
        let filename = 'audit_logs';
        if (filterType) filename += `_${filterType}`;
        if (startDate) filename += `_from_${startDate.toISOString().split('T')[0]}`;
        if (endDate) filename += `_to_${endDate.toISOString().split('T')[0]}`;
        filename += '.csv';

        if (Platform.OS === 'web') {
            // Web: Create and download blob
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } else {
            // Mobile: Use Sharing API if available
            try {
                const Sharing = require('expo-sharing');
                const FileSystem = require('expo-file-system');
                const fileUri = FileSystem.documentDirectory + filename;
                FileSystem.writeAsStringAsync(fileUri, csvContent).then(() => {
                    Sharing.shareAsync(fileUri);
                });
            } catch (e) {
                console.log('Sharing not available:', e);
            }
        }
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
                            <TouchableOpacity style={styles.exportBtn} onPress={handleExport}>
                                <Feather name="download" size={18} color="#FFF" />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.dateFilterRow}>
                            {Platform.OS === 'web' ? (
                                <View style={styles.webDateContainer}>
                                    <WebDateInput
                                        value={webStart}
                                        onChange={(t) => handleWebDateChange(t, 'start')}
                                    />
                                    <Text style={{ color: '#6B7280', marginHorizontal: 8 }}>to</Text>
                                    <WebDateInput
                                        value={webEnd}
                                        onChange={(t) => handleWebDateChange(t, 'end')}
                                    />
                                </View>
                            ) : (
                                <>
                                    <TouchableOpacity onPress={() => setShowStartPicker(true)} style={styles.dateBtn}>
                                        <MaterialCommunityIcons name="calendar" size={16} color="#A5B4FC" />
                                        <Text style={styles.dateText}>
                                            {startDate ? startDate.toLocaleDateString() : 'Start Date'}
                                        </Text>
                                    </TouchableOpacity>

                                    <Text style={{ color: '#6B7280' }}>to</Text>

                                    <TouchableOpacity onPress={() => setShowEndPicker(true)} style={styles.dateBtn}>
                                        <MaterialCommunityIcons name="calendar" size={16} color="#A5B4FC" />
                                        <Text style={styles.dateText}>
                                            {endDate ? endDate.toLocaleDateString() : 'End Date'}
                                        </Text>
                                    </TouchableOpacity>
                                </>
                            )}

                            {(startDate || endDate || webStart || webEnd) ? (
                                <TouchableOpacity
                                    onPress={() => {
                                        setStartDate(null); setEndDate(null);
                                        setWebStart(''); setWebEnd('');
                                    }}
                                    style={styles.clearDateBtn}
                                >
                                    <Feather name="x" size={14} color="#EF4444" />
                                </TouchableOpacity>
                            ) : null}
                        </View>

                        {Platform.OS !== 'web' && showStartPicker && (
                            <DateTimePicker
                                value={startDate || new Date()}
                                mode="date"
                                display="default"
                                onChange={onStartDateChange}
                                maximumDate={new Date()}
                            />
                        )}

                        {Platform.OS !== 'web' && showEndPicker && (
                            <DateTimePicker
                                value={endDate || new Date()}
                                mode="date"
                                display="default"
                                onChange={onEndDateChange}
                                maximumDate={new Date()}
                            />
                        )}

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

                        {/* Stats - reflects currently filtered logs */}
                        <View style={styles.statsRow}>
                            <View style={styles.statCard}>
                                <Text style={styles.statValue}>{logs.length}</Text>
                                <Text style={styles.statLabel}>Total Logs</Text>
                            </View>
                            <View style={styles.statCard}>
                                <Text style={[styles.statValue, { color: '#10B981' }]}>
                                    {logs.filter(l => l.action && (l.action.startsWith('CREATE') || l.action.startsWith('UPLOAD'))).length}
                                </Text>
                                <Text style={styles.statLabel}>Creates</Text>
                            </View>
                            <View style={styles.statCard}>
                                <Text style={[styles.statValue, { color: '#EF4444' }]}>
                                    {logs.filter(l => l.action && l.action.startsWith('DELETE')).length}
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
    // Date Filters
    dateFilterRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 10, gap: 10 },
    dateBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, gap: 6 },
    dateText: { color: '#E0E7FF', fontFamily: 'Poppins_400Regular', fontSize: 12 },
    clearDateBtn: { padding: 8, backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 8 },
    // Web Filters
    webDateContainer: { flexDirection: 'row', alignItems: 'center' },
    webDateInput: { backgroundColor: 'rgba(255,255,255,0.05)', color: '#FFF', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6, fontSize: 12, fontFamily: 'Poppins_400Regular', minWidth: 120, borderBottomWidth: 1, borderBottomColor: '#6366F1' },

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
