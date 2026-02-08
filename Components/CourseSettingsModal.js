import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    ScrollView,
    TextInput,
    Switch,
    Dimensions,
    Platform,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import UserAssignmentPicker from './UserAssignmentPicker';
import API_URL from '../config';

const { width, height } = Dimensions.get('window');

const THEME = {
    bg: '#FFFDF7',
    card: '#FFFFFF',
    primary: '#F59E0B',
    primaryDark: '#78350F',
    textMain: '#1F2937',
    textSub: '#6B7280',
    green: '#10B981',
    red: '#EF4444',
    border: '#E5E7EB',
};

const showAlert = (title, msg) => {
    if (Platform.OS === 'web') window.alert(`${title}\n${msg}`);
    else Alert.alert(title, msg);
};

export default function CourseSettingsModal({ visible, onClose, item, itemType = 'course', onSaveSuccess }) {
    // itemType: 'course' or 'bucket'
    // onSaveSuccess: optional callback to refetch data after save
    const [saving, setSaving] = useState(false);
    const [activeSection, setActiveSection] = useState('general');

    // Course settings
    const [allowFastForward, setAllowFastForward] = useState(true);
    const [enableFeedback, setEnableFeedback] = useState(false);
    const [enableCertificate, setEnableCertificate] = useState(false);
    const [xpPoints, setXpPoints] = useState('50');
    const [isPublished, setIsPublished] = useState(true);
    const [scheduledAt, setScheduledAt] = useState('');

    // Bucket settings
    const [isLinear, setIsLinear] = useState(false);
    const [assignmentData, setAssignmentData] = useState({ emails: [], roles: [], stores: [], categories: [], regions: [], cities: [], states: [], designations: [], departments: [] });
    const [pickerVisible, setPickerVisible] = useState(false);

    // Notification
    const [notifTitle, setNotifTitle] = useState('');
    const [notifMessage, setNotifMessage] = useState('');
    const [notifPriority, setNotifPriority] = useState('normal');
    const [sendingNotif, setSendingNotif] = useState(false);

    // Analytics
    const [analytics, setAnalytics] = useState(null);
    const [loadingAnalytics, setLoadingAnalytics] = useState(false);

    // Feedback
    const [feedbackData, setFeedbackData] = useState(null);
    const [loadingFeedback, setLoadingFeedback] = useState(false);

    // Fetch latest bucket/course data when modal opens
    const fetchLatestData = async () => {
        if (!item) return;

        try {
            const token = await AsyncStorage.getItem('userToken');
            const endpoint = itemType === 'course'
                ? `${API_URL}/api/v1/content/${item.id}`
                : `${API_URL}/api/v1/content/buckets/all`;

            const res = await fetch(endpoint, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const data = await res.json();

            if (itemType === 'course' && res.ok) {
                // Update course settings from fetched data
                setAllowFastForward(data.allow_fast_forward !== false);
                setEnableFeedback(data.enable_feedback || false);
                setEnableCertificate(data.enable_certificate || false);
                setXpPoints(String(data.xp || 50));
                setIsPublished(data.is_published !== false);
                setScheduledAt(data.scheduled_at || '');
            } else if (itemType === 'bucket' && Array.isArray(data)) {
                // Find the specific bucket from the list
                const bucket = data.find(b => b.id === item.id);
                if (bucket) {
                    setIsLinear(bucket.is_linear || false);
                    const au = bucket.assigned_users || {};
                    setAssignmentData({
                        emails: Array.isArray(au.emails) ? au.emails : [],
                        roles: Array.isArray(au.roles) ? au.roles : [],
                        stores: Array.isArray(au.stores) ? au.stores : [],
                        categories: Array.isArray(au.categories) ? au.categories : [],
                        regions: Array.isArray(au.regions) ? au.regions : [],
                        cities: Array.isArray(au.cities) ? au.cities : [],
                        states: Array.isArray(au.states) ? au.states : [],
                        designations: Array.isArray(au.designations) ? au.designations : [],
                        departments: Array.isArray(au.departments) ? au.departments : [],
                    });
                }
            }
        } catch (error) {
            console.error('Failed to fetch latest data:', error);
            // Fallback to item prop data if fetch fails
            loadFromItemProp();
        }
    };

    const loadFromItemProp = () => {
        if (!item) return;

        if (itemType === 'course') {
            setAllowFastForward(item.allow_fast_forward !== false);
            setEnableFeedback(item.enable_feedback || false);
            setEnableCertificate(item.enable_certificate || false);
            setXpPoints(String(item.xp || 50));
            setIsPublished(item.is_published !== false);
            setScheduledAt(item.scheduled_at || '');
        } else {
            setIsLinear(item.is_linear || false);
            const au = item.assigned_users || {};
            setAssignmentData({
                emails: Array.isArray(au.emails) ? au.emails : [],
                roles: Array.isArray(au.roles) ? au.roles : [],
                stores: Array.isArray(au.stores) ? au.stores : [],
                categories: Array.isArray(au.categories) ? au.categories : [],
                regions: Array.isArray(au.regions) ? au.regions : [],
                cities: Array.isArray(au.cities) ? au.cities : [],
                states: Array.isArray(au.states) ? au.states : [],
                designations: Array.isArray(au.designations) ? au.designations : [],
                departments: Array.isArray(au.departments) ? au.departments : [],
            });
        }
    };

    useEffect(() => {
        if (visible && item) {
            // Fetch latest data from API instead of relying on stale prop
            fetchLatestData();
            setActiveSection('general');
        }
    }, [visible, item]);

    const fetchAnalytics = async () => {
        if (!item) return;
        setLoadingAnalytics(true);
        try {
            const token = await AsyncStorage.getItem('userToken');
            const endpoint = itemType === 'course'
                ? `${API_URL}/api/v1/self-learning/admin/analytics/course/${item.id}`
                : `${API_URL}/api/v1/self-learning/admin/analytics/bucket/${item.id}`;
            const res = await fetch(endpoint, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            setAnalytics(data);
        } catch (e) {
            console.error('Analytics fetch error:', e);
        } finally {
            setLoadingAnalytics(false);
        }
    };

    const fetchFeedback = async () => {
        if (!item || itemType !== 'course') return;
        setLoadingFeedback(true);
        try {
            const token = await AsyncStorage.getItem('userToken');
            const res = await fetch(`${API_URL}/api/v1/self-learning/admin/feedback/${item.id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setFeedbackData(await res.json());
        } catch (e) {
            console.error('Feedback fetch error:', e);
        } finally {
            setLoadingFeedback(false);
        }
    };

    const handleSaveSettings = async () => {
        setSaving(true);
        try {
            const token = await AsyncStorage.getItem('userToken');
            const endpoint = itemType === 'course'
                ? `${API_URL}/api/v1/self-learning/admin/courses/${item.id}/settings`
                : `${API_URL}/api/v1/self-learning/admin/buckets/${item.id}/settings`;

            const body = itemType === 'course'
                ? {
                    allow_fast_forward: allowFastForward,
                    enable_feedback: enableFeedback,
                    enable_certificate: enableCertificate,
                    xp: parseInt(xpPoints) || 50,
                    is_published: isPublished,
                    scheduled_at: scheduledAt || null,
                }
                : {
                    is_linear: isLinear,
                    assigned_users: assignmentData,
                };

            const res = await fetch(endpoint, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (data.status === 'success') {
                showAlert('Saved', 'Settings updated successfully');

                // Trigger callback to refetch data in parent component
                if (onSaveSuccess) {
                    onSaveSuccess();
                }
            }
        } catch (e) {
            console.error('Save settings error:', e);
            showAlert('Error', 'Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    const handleSendNotification = async () => {
        if (!notifTitle.trim() || !notifMessage.trim()) {
            showAlert('Missing Info', 'Please enter a title and message');
            return;
        }
        setSendingNotif(true);
        try {
            const token = await AsyncStorage.getItem('userToken');
            const body = {
                title: notifTitle.trim(),
                message: notifMessage.trim(),
                notification_type: 'course',
                priority: notifPriority,
                source_bucket_id: itemType === 'bucket' ? item.id : null,
                source_course_id: itemType === 'course' ? item.id : null,
                target_users: [],
                target_roles: [],
                target_stores: [],
            };
            const res = await fetch(`${API_URL}/api/v1/self-learning/admin/notifications/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (data.status === 'success') {
                showAlert('Sent', 'Push notification sent to all assigned users');
                setNotifTitle('');
                setNotifMessage('');
            }
        } catch (e) {
            console.error('Send notification error:', e);
            showAlert('Error', 'Failed to send notification');
        } finally {
            setSendingNotif(false);
        }
    };

    const handleSchedule = async (launchNow = false) => {
        setSaving(true);
        try {
            const token = await AsyncStorage.getItem('userToken');
            const body = launchNow ? { launch_now: true } : { scheduled_at: scheduledAt };
            const res = await fetch(`${API_URL}/api/v1/self-learning/admin/courses/${item.id}/schedule`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (data.status === 'success') {
                showAlert('Success', data.message);
                if (launchNow) {
                    setIsPublished(true);
                    setScheduledAt('');
                }
            }
        } catch (e) {
            showAlert('Error', 'Failed to schedule course');
        } finally {
            setSaving(false);
        }
    };

    if (!item) return null;

    const sections = itemType === 'course'
        ? [
            { key: 'general', label: 'Settings', icon: 'settings' },
            { key: 'schedule', label: 'Schedule', icon: 'calendar' },
            { key: 'notify', label: 'Notify', icon: 'bell' },
            { key: 'analytics', label: 'Analytics', icon: 'bar-chart-2' },
            { key: 'feedback', label: 'Feedback', icon: 'message-square' },
        ]
        : [
            { key: 'general', label: 'Settings', icon: 'settings' },
            { key: 'notify', label: 'Notify', icon: 'bell' },
            { key: 'analytics', label: 'Analytics', icon: 'bar-chart-2' },
        ];

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                        <Feather name="x" size={22} color="#6B7280" />
                    </TouchableOpacity>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.headerTitle} numberOfLines={1}>
                            {itemType === 'course' ? 'Course Settings' : 'Bucket Settings'}
                        </Text>
                        <Text style={styles.headerSub} numberOfLines={1}>{item.title || item.name}</Text>
                    </View>
                </View>

                {/* Section Tabs */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={{ paddingHorizontal: 16, gap: 6 }}>
                    {sections.map(s => (
                        <TouchableOpacity
                            key={s.key}
                            style={[styles.sectionTab, activeSection === s.key && styles.sectionTabActive]}
                            onPress={() => {
                                setActiveSection(s.key);
                                if (s.key === 'analytics') fetchAnalytics();
                                if (s.key === 'feedback') fetchFeedback();
                            }}
                        >
                            <Feather name={s.icon} size={14} color={activeSection === s.key ? '#FFF' : '#78350F'} />
                            <Text style={[styles.sectionTabText, activeSection === s.key && { color: '#FFF' }]}>{s.label}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>

                    {/* ========== GENERAL SETTINGS ========== */}
                    {activeSection === 'general' && (
                        <View>
                            {itemType === 'course' ? (
                                <>
                                    <SettingRow label="Allow Fast Forward" desc="Users can change playback speed" icon="fast-forward">
                                        <Switch value={allowFastForward} onValueChange={setAllowFastForward} trackColor={{ true: THEME.green }} />
                                    </SettingRow>
                                    <SettingRow label="Enable Feedback Form" desc="Show rating form after completion" icon="message-square">
                                        <Switch value={enableFeedback} onValueChange={setEnableFeedback} trackColor={{ true: THEME.green }} />
                                    </SettingRow>
                                    <SettingRow label="Enable Certificate" desc="Auto-generate certificate on completion" icon="award">
                                        <Switch value={enableCertificate} onValueChange={setEnableCertificate} trackColor={{ true: THEME.green }} />
                                    </SettingRow>
                                    <SettingRow label="Published" desc="Visible to assigned users" icon="eye">
                                        <Switch value={isPublished} onValueChange={setIsPublished} trackColor={{ true: THEME.green }} />
                                    </SettingRow>
                                    <View style={styles.settingRow}>
                                        <View style={styles.settingIcon}><MaterialCommunityIcons name="star-four-points" size={18} color={THEME.primary} /></View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.settingLabel}>XP Points</Text>
                                            <Text style={styles.settingDesc}>Points awarded on completion</Text>
                                        </View>
                                        <TextInput
                                            style={styles.xpInput}
                                            value={xpPoints}
                                            onChangeText={setXpPoints}
                                            keyboardType="numeric"
                                            maxLength={5}
                                        />
                                    </View>
                                </>
                            ) : (
                                <>
                                    <SettingRow label="Linear (Sequential)" desc="Users must complete modules in order" icon="list">
                                        <Switch value={isLinear} onValueChange={setIsLinear} trackColor={{ true: THEME.green }} />
                                    </SettingRow>

                                    <Text style={[styles.sectionTitle, { marginTop: 20, marginBottom: 4 }]}>User Assignment</Text>
                                    <Text style={styles.sectionDesc}>Control who can access this bucket. Leave empty to allow everyone.</Text>

                                    <TouchableOpacity style={styles.assignBtn} onPress={() => setPickerVisible(true)}>
                                        <Feather name="users" size={18} color={THEME.primaryDark} />
                                        <Text style={styles.assignBtnText}>Manage Assigned Users</Text>
                                        <Feather name="chevron-right" size={16} color="#9CA3AF" />
                                    </TouchableOpacity>

                                    {/* Assignment Summary */}
                                    {(assignmentData.emails.length > 0 || assignmentData.roles.length > 0 || assignmentData.stores.length > 0 || assignmentData.categories.length > 0) ? (
                                        <View style={styles.assignSummary}>
                                            {assignmentData.emails.length > 0 && (
                                                <View style={styles.assignSummaryRow}>
                                                    <Feather name="mail" size={12} color="#3B82F6" />
                                                    <Text style={styles.assignSummaryLabel}>{assignmentData.emails.length} user{assignmentData.emails.length !== 1 ? 's' : ''}</Text>
                                                </View>
                                            )}
                                            {assignmentData.roles.length > 0 && (
                                                <View style={styles.assignSummaryRow}>
                                                    <Feather name="briefcase" size={12} color="#3B82F6" />
                                                    <Text style={styles.assignSummaryLabel}>Roles: {assignmentData.roles.join(', ')}</Text>
                                                </View>
                                            )}
                                            {assignmentData.stores.length > 0 && (
                                                <View style={styles.assignSummaryRow}>
                                                    <Feather name="map-pin" size={12} color="#8B5CF6" />
                                                    <Text style={styles.assignSummaryLabel}>Stores: {assignmentData.stores.join(', ')}</Text>
                                                </View>
                                            )}
                                            {assignmentData.categories.length > 0 && (
                                                <View style={styles.assignSummaryRow}>
                                                    <Feather name="tag" size={12} color="#10B981" />
                                                    <Text style={styles.assignSummaryLabel}>Categories: {assignmentData.categories.join(', ')}</Text>
                                                </View>
                                            )}
                                            {assignmentData.regions?.length > 0 && (
                                                <View style={styles.assignSummaryRow}>
                                                    <Feather name="globe" size={12} color="#F59E0B" />
                                                    <Text style={styles.assignSummaryLabel}>Regions: {assignmentData.regions.join(', ')}</Text>
                                                </View>
                                            )}
                                            {assignmentData.cities?.length > 0 && (
                                                <View style={styles.assignSummaryRow}>
                                                    <Feather name="map-pin" size={12} color="#EC4899" />
                                                    <Text style={styles.assignSummaryLabel}>Cities: {assignmentData.cities.join(', ')}</Text>
                                                </View>
                                            )}
                                            {assignmentData.states?.length > 0 && (
                                                <View style={styles.assignSummaryRow}>
                                                    <Feather name="map" size={12} color="#6366F1" />
                                                    <Text style={styles.assignSummaryLabel}>States: {assignmentData.states.join(', ')}</Text>
                                                </View>
                                            )}
                                            {assignmentData.designations?.length > 0 && (
                                                <View style={styles.assignSummaryRow}>
                                                    <Feather name="award" size={12} color="#0EA5E9" />
                                                    <Text style={styles.assignSummaryLabel}>Designations: {assignmentData.designations.join(', ')}</Text>
                                                </View>
                                            )}
                                            {assignmentData.departments?.length > 0 && (
                                                <View style={styles.assignSummaryRow}>
                                                    <Feather name="grid" size={12} color="#14B8A6" />
                                                    <Text style={styles.assignSummaryLabel}>Departments: {assignmentData.departments.join(', ')}</Text>
                                                </View>
                                            )}
                                        </View>
                                    ) : (
                                        <Text style={[styles.sectionDesc, { marginTop: 8, fontStyle: 'italic' }]}>All users can access this bucket</Text>
                                    )}

                                    <UserAssignmentPicker
                                        visible={pickerVisible}
                                        onClose={() => setPickerVisible(false)}
                                        currentAssignment={assignmentData}
                                        onSave={(data) => setAssignmentData(data)}
                                    />
                                </>
                            )}

                            <TouchableOpacity style={styles.saveBtn} onPress={handleSaveSettings} disabled={saving}>
                                {saving ? <ActivityIndicator color="#FFF" /> : (
                                    <>
                                        <Feather name="check" size={18} color="#FFF" />
                                        <Text style={styles.saveBtnText}>Save Settings</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* ========== SCHEDULE ========== */}
                    {activeSection === 'schedule' && itemType === 'course' && (
                        <View>
                            <Text style={styles.sectionTitle}>Course Scheduling</Text>
                            <Text style={styles.sectionDesc}>Schedule when this course becomes available to users, or launch it immediately.</Text>

                            <View style={styles.scheduleCard}>
                                <Text style={styles.inputLabel}>Scheduled Launch Date</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="YYYY-MM-DDTHH:MM:SS (e.g. 2025-03-01T09:00:00)"
                                    placeholderTextColor="#9CA3AF"
                                    value={scheduledAt}
                                    onChangeText={setScheduledAt}
                                />
                                <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                                    <TouchableOpacity style={[styles.scheduleBtn, { backgroundColor: THEME.primary }]} onPress={() => handleSchedule(false)} disabled={saving}>
                                        <Feather name="calendar" size={16} color="#FFF" />
                                        <Text style={styles.scheduleBtnText}>Schedule</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={[styles.scheduleBtn, { backgroundColor: THEME.green }]} onPress={() => handleSchedule(true)} disabled={saving}>
                                        <Feather name="zap" size={16} color="#FFF" />
                                        <Text style={styles.scheduleBtnText}>Launch Now</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    )}

                    {/* ========== PUSH NOTIFICATION ========== */}
                    {activeSection === 'notify' && (
                        <View>
                            <Text style={styles.sectionTitle}>Send Push Notification</Text>
                            <Text style={styles.sectionDesc}>
                                Notify assigned users about this {itemType}. The notification will appear in their notification bell.
                            </Text>

                            <View style={styles.notifCard}>
                                <Text style={styles.inputLabel}>Title</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder={`New ${itemType === 'course' ? 'course' : 'content'} available!`}
                                    placeholderTextColor="#9CA3AF"
                                    value={notifTitle}
                                    onChangeText={setNotifTitle}
                                />

                                <Text style={[styles.inputLabel, { marginTop: 12 }]}>Message</Text>
                                <TextInput
                                    style={[styles.input, { minHeight: 80 }]}
                                    placeholder="Describe what's new..."
                                    placeholderTextColor="#9CA3AF"
                                    multiline
                                    textAlignVertical="top"
                                    value={notifMessage}
                                    onChangeText={setNotifMessage}
                                />

                                <Text style={[styles.inputLabel, { marginTop: 12 }]}>Priority</Text>
                                <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                                    {['normal', 'high', 'urgent'].map(p => (
                                        <TouchableOpacity
                                            key={p}
                                            style={[styles.priorityChip, notifPriority === p && styles.priorityChipActive]}
                                            onPress={() => setNotifPriority(p)}
                                        >
                                            <Text style={[styles.priorityText, notifPriority === p && { color: '#FFF' }]}>
                                                {p.charAt(0).toUpperCase() + p.slice(1)}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                <TouchableOpacity style={styles.sendNotifBtn} onPress={handleSendNotification} disabled={sendingNotif}>
                                    {sendingNotif ? <ActivityIndicator color="#FFF" /> : (
                                        <>
                                            <Feather name="send" size={16} color="#FFF" />
                                            <Text style={styles.sendNotifText}>Send Notification</Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}

                    {/* ========== ANALYTICS ========== */}
                    {activeSection === 'analytics' && (
                        <View>
                            <Text style={styles.sectionTitle}>
                                {itemType === 'course' ? 'Course' : 'Bucket'} Analytics
                            </Text>
                            {loadingAnalytics ? (
                                <ActivityIndicator size="large" color={THEME.primary} style={{ marginTop: 40 }} />
                            ) : analytics ? (
                                <>
                                    {/* Summary Cards */}
                                    <View style={styles.statsRow}>
                                        <StatCard label="Users" value={analytics.total_users || 0} icon="users" color="#3B82F6" />
                                        <StatCard label="Completed" value={analytics.total_completed || 0} icon="check-circle" color={THEME.green} />
                                        <StatCard label="Avg Watch" value={`${Math.round(analytics.average_watched || 0)}%`} icon="eye" color="#8B5CF6" />
                                    </View>

                                    {/* User List */}
                                    <Text style={[styles.inputLabel, { marginTop: 16, marginBottom: 8 }]}>Per-Employee Progress</Text>
                                    {(analytics.analytics || []).map((user, i) => (
                                        <View key={i} style={styles.analyticsUserRow}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.analyticsUserName}>{user.user_name}</Text>
                                                <Text style={styles.analyticsUserEmail}>{user.user_email}</Text>
                                            </View>
                                            <View style={{ alignItems: 'flex-end' }}>
                                                <Text style={[styles.analyticsPercent, { color: user.completed ? THEME.green : THEME.primary }]}>
                                                    {Math.round(user.watched_percent || user.progress_percent || 0)}%
                                                </Text>
                                                <Text style={styles.analyticsStatus}>
                                                    {user.completed ? '✓ Done' : 'In Progress'}
                                                </Text>
                                            </View>
                                        </View>
                                    ))}
                                    {(analytics.analytics || []).length === 0 && (
                                        <Text style={styles.emptyText}>No user activity yet</Text>
                                    )}
                                </>
                            ) : (
                                <TouchableOpacity style={styles.loadBtn} onPress={fetchAnalytics}>
                                    <Feather name="refresh-cw" size={16} color={THEME.primaryDark} />
                                    <Text style={styles.loadBtnText}>Load Analytics</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    )}

                    {/* ========== FEEDBACK ========== */}
                    {activeSection === 'feedback' && itemType === 'course' && (
                        <View>
                            <Text style={styles.sectionTitle}>Course Feedback</Text>
                            {loadingFeedback ? (
                                <ActivityIndicator size="large" color={THEME.primary} style={{ marginTop: 40 }} />
                            ) : feedbackData ? (
                                <>
                                    <View style={styles.feedbackSummary}>
                                        <Text style={styles.feedbackAvg}>{feedbackData.average_rating || '—'}</Text>
                                        <View style={{ flexDirection: 'row', gap: 2 }}>
                                            {[1,2,3,4,5].map(s => (
                                                <MaterialCommunityIcons
                                                    key={s}
                                                    name={s <= Math.round(feedbackData.average_rating || 0) ? 'star' : 'star-outline'}
                                                    size={18}
                                                    color="#F59E0B"
                                                />
                                            ))}
                                        </View>
                                        <Text style={styles.feedbackCount}>{feedbackData.total || 0} reviews</Text>
                                    </View>

                                    {(feedbackData.feedbacks || []).map((fb, i) => (
                                        <View key={i} style={styles.feedbackItem}>
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <Text style={styles.feedbackUser}>{fb.user_email}</Text>
                                                <View style={{ flexDirection: 'row', gap: 1 }}>
                                                    {[1,2,3,4,5].map(s => (
                                                        <MaterialCommunityIcons
                                                            key={s}
                                                            name={s <= fb.rating ? 'star' : 'star-outline'}
                                                            size={12}
                                                            color="#F59E0B"
                                                        />
                                                    ))}
                                                </View>
                                            </View>
                                            {fb.comment ? <Text style={styles.feedbackComment}>{fb.comment}</Text> : null}
                                        </View>
                                    ))}
                                </>
                            ) : (
                                <TouchableOpacity style={styles.loadBtn} onPress={fetchFeedback}>
                                    <Feather name="refresh-cw" size={16} color={THEME.primaryDark} />
                                    <Text style={styles.loadBtnText}>Load Feedback</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    )}
                </ScrollView>
            </View>
        </Modal>
    );
}

// Reusable setting row
function SettingRow({ label, desc, icon, children }) {
    return (
        <View style={styles.settingRow}>
            <View style={styles.settingIcon}>
                <Feather name={icon} size={18} color={THEME.primary} />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={styles.settingLabel}>{label}</Text>
                {desc && <Text style={styles.settingDesc}>{desc}</Text>}
            </View>
            {children}
        </View>
    );
}

// Stat card
function StatCard({ label, value, icon, color }) {
    return (
        <View style={[styles.statCard, { borderColor: color + '30' }]}>
            <Feather name={icon} size={18} color={color} />
            <Text style={[styles.statValue, { color }]}>{value}</Text>
            <Text style={styles.statLabel}>{label}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: THEME.bg },
    header: {
        flexDirection: 'row', alignItems: 'center', padding: 16,
        borderBottomWidth: 1, borderBottomColor: THEME.border, backgroundColor: THEME.card,
    },
    closeBtn: { padding: 6, backgroundColor: '#F3F4F6', borderRadius: 10 },
    headerTitle: { fontSize: 17, fontWeight: '700', color: THEME.primaryDark },
    headerSub: { fontSize: 12, color: THEME.textSub, marginTop: 2 },

    tabBar: { maxHeight: 50, borderBottomWidth: 1, borderBottomColor: THEME.border, backgroundColor: THEME.card },
    sectionTab: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20,
        backgroundColor: '#FEF3C7', marginVertical: 6,
    },
    sectionTabActive: { backgroundColor: THEME.primaryDark },
    sectionTabText: { fontSize: 12, fontWeight: '600', color: '#78350F' },

    sectionTitle: { fontSize: 18, fontWeight: '700', color: THEME.textMain, marginBottom: 6 },
    sectionDesc: { fontSize: 13, color: THEME.textSub, marginBottom: 16, lineHeight: 19 },

    settingRow: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F9FAFB',
    },
    settingIcon: {
        width: 36, height: 36, borderRadius: 10, backgroundColor: '#FEF3C7',
        justifyContent: 'center', alignItems: 'center',
    },
    settingLabel: { fontSize: 14, fontWeight: '600', color: THEME.textMain },
    settingDesc: { fontSize: 11, color: THEME.textSub, marginTop: 2 },
    xpInput: {
        width: 70, height: 36, borderRadius: 10, borderWidth: 1, borderColor: THEME.border,
        textAlign: 'center', fontSize: 14, fontWeight: '700', color: THEME.primaryDark, backgroundColor: '#FFFBEB',
    },

    saveBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        backgroundColor: THEME.green, paddingVertical: 14, borderRadius: 14, marginTop: 20,
    },
    saveBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },

    // Schedule
    scheduleCard: { backgroundColor: THEME.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: THEME.border },
    inputLabel: { fontSize: 13, fontWeight: '600', color: THEME.textMain, marginBottom: 6 },
    input: {
        backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: THEME.border, borderRadius: 10,
        padding: 12, fontSize: 14, color: THEME.textMain,
    },
    scheduleBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        paddingVertical: 12, borderRadius: 12,
    },
    scheduleBtnText: { fontSize: 13, fontWeight: '700', color: '#FFF' },

    // Notification
    notifCard: { backgroundColor: THEME.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: THEME.border },
    priorityChip: {
        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
        backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: THEME.border,
    },
    priorityChipActive: { backgroundColor: THEME.primaryDark, borderColor: THEME.primaryDark },
    priorityText: { fontSize: 12, fontWeight: '600', color: THEME.textMain },
    sendNotifBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        backgroundColor: '#3B82F6', paddingVertical: 14, borderRadius: 14, marginTop: 16,
    },
    sendNotifText: { fontSize: 15, fontWeight: '700', color: '#FFF' },

    // Analytics
    statsRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
    statCard: {
        flex: 1, alignItems: 'center', padding: 14, borderRadius: 14,
        backgroundColor: THEME.card, borderWidth: 1,
    },
    statValue: { fontSize: 22, fontWeight: '800', marginTop: 6 },
    statLabel: { fontSize: 11, color: THEME.textSub, marginTop: 2 },
    analyticsUserRow: {
        flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
        borderBottomWidth: 1, borderBottomColor: '#F9FAFB',
    },
    analyticsUserName: { fontSize: 13, fontWeight: '600', color: THEME.textMain },
    analyticsUserEmail: { fontSize: 11, color: THEME.textSub },
    analyticsPercent: { fontSize: 15, fontWeight: '800' },
    analyticsStatus: { fontSize: 10, color: THEME.textSub },

    // Feedback
    feedbackSummary: { alignItems: 'center', paddingVertical: 16, marginBottom: 12 },
    feedbackAvg: { fontSize: 36, fontWeight: '800', color: THEME.primary },
    feedbackCount: { fontSize: 12, color: THEME.textSub, marginTop: 4 },
    feedbackItem: {
        padding: 12, borderRadius: 12, backgroundColor: '#F9FAFB', marginBottom: 8,
    },
    feedbackUser: { fontSize: 12, fontWeight: '600', color: THEME.textMain },
    feedbackComment: { fontSize: 12, color: THEME.textSub, marginTop: 4, lineHeight: 17 },

    loadBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        paddingVertical: 14, borderRadius: 14, backgroundColor: '#FEF3C7', marginTop: 20,
    },
    loadBtnText: { fontSize: 14, fontWeight: '600', color: THEME.primaryDark },
    emptyText: { textAlign: 'center', color: THEME.textSub, marginTop: 20, fontSize: 13 },

    // User Assignment
    assignBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: '#FEF3C7', paddingVertical: 14, paddingHorizontal: 16,
        borderRadius: 14, borderWidth: 1, borderColor: '#FDE68A', marginTop: 8,
    },
    assignBtnText: { flex: 1, fontSize: 14, fontWeight: '600', color: THEME.primaryDark },
    assignSummary: {
        marginTop: 12, backgroundColor: '#F9FAFB', borderRadius: 12, padding: 12, gap: 8,
    },
    assignSummaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    assignSummaryLabel: { fontSize: 12, color: THEME.textMain, fontWeight: '500' },
});
