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
    const [certificateTemplate, setCertificateTemplate] = useState('classic');
    const [showCertPreview, setShowCertPreview] = useState(false);
    const [xpPoints, setXpPoints] = useState('50');
    const [isPublished, setIsPublished] = useState(true);
    const [scheduledAt, setScheduledAt] = useState('');

    // Shared: User Assignment (for both course and bucket)
    const [assignmentData, setAssignmentData] = useState({ emails: [], roles: [], stores: [], categories: [], regions: [], cities: [], states: [], designations: [], departments: [] });
    const [pickerVisible, setPickerVisible] = useState(false);

    // Bucket settings
    const [isLinear, setIsLinear] = useState(false);
    const [showInBothPaths, setShowInBothPaths] = useState(false);

    // Notification
    const [notifTitle, setNotifTitle] = useState('');
    const [notifMessage, setNotifMessage] = useState('');
    const [notifPriority, setNotifPriority] = useState('normal');
    const [sendingNotif, setSendingNotif] = useState(false);

    // Analytics
    const [analytics, setAnalytics] = useState(null);
    const [loadingAnalytics, setLoadingAnalytics] = useState(false);

    // Feedback (legacy ratings view)
    const [feedbackData, setFeedbackData] = useState(null);
    const [loadingFeedback, setLoadingFeedback] = useState(false);

    // Survey Builder
    const [survey, setSurvey] = useState(null);
    const [surveyTitle, setSurveyTitle] = useState('Course Feedback Survey');
    const [surveyDesc, setSurveyDesc] = useState('');
    const [surveyActive, setSurveyActive] = useState(true);
    const [surveyQuestions, setSurveyQuestions] = useState([]);
    const [loadingSurvey, setLoadingSurvey] = useState(false);
    const [savingSurvey, setSavingSurvey] = useState(false);
    const [surveyResponses, setSurveyResponses] = useState(null);
    const [loadingResponses, setLoadingResponses] = useState(false);
    const [surveyTab, setSurveyTab] = useState('builder'); // 'builder' | 'responses'
    const [editingQuestion, setEditingQuestion] = useState(null); // question being edited
    const [showAddQuestion, setShowAddQuestion] = useState(false);
    const [newQType, setNewQType] = useState('text');
    const [newQLabel, setNewQLabel] = useState('');
    const [newQMandatory, setNewQMandatory] = useState(false);
    const [newQOptions, setNewQOptions] = useState(['', '']);

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
                setCertificateTemplate(data.certificate_template || 'classic');
                setXpPoints(String(data.xp || 50));
                setIsPublished(data.is_published !== false);
                setScheduledAt(data.scheduled_at || '');
                // Course-level user assignment
                const cau = data.assigned_users || {};
                setAssignmentData({
                    emails: Array.isArray(cau.emails) ? cau.emails : [],
                    roles: Array.isArray(cau.roles) ? cau.roles : [],
                    stores: Array.isArray(cau.stores) ? cau.stores : [],
                    categories: Array.isArray(cau.categories) ? cau.categories : [],
                    regions: Array.isArray(cau.regions) ? cau.regions : [],
                    cities: Array.isArray(cau.cities) ? cau.cities : [],
                    states: Array.isArray(cau.states) ? cau.states : [],
                    designations: Array.isArray(cau.designations) ? cau.designations : [],
                    departments: Array.isArray(cau.departments) ? cau.departments : [],
                });
            } else if (itemType === 'bucket' && Array.isArray(data)) {
                // Find the specific bucket from the list
                const bucket = data.find(b => b.id === item.id);
                if (bucket) {
                    setIsLinear(bucket.is_linear || false);
                    setShowInBothPaths(bucket.show_in_both_paths || false);
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
            setCertificateTemplate(item.certificate_template || 'classic');
            setXpPoints(String(item.xp || 50));
            setIsPublished(item.is_published !== false);
            setScheduledAt(item.scheduled_at || '');
            // Course-level user assignment
            const cau = item.assigned_users || {};
            setAssignmentData({
                emails: Array.isArray(cau.emails) ? cau.emails : [],
                roles: Array.isArray(cau.roles) ? cau.roles : [],
                stores: Array.isArray(cau.stores) ? cau.stores : [],
                categories: Array.isArray(cau.categories) ? cau.categories : [],
                regions: Array.isArray(cau.regions) ? cau.regions : [],
                cities: Array.isArray(cau.cities) ? cau.cities : [],
                states: Array.isArray(cau.states) ? cau.states : [],
                designations: Array.isArray(cau.designations) ? cau.designations : [],
                departments: Array.isArray(cau.departments) ? cau.departments : [],
            });
        } else {
            setIsLinear(item.is_linear || false);
            setShowInBothPaths(item.show_in_both_paths || false);
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

    const fetchSurvey = async () => {
        if (!item || itemType !== 'course') return;
        setLoadingSurvey(true);
        try {
            const token = await AsyncStorage.getItem('userToken');
            const res = await fetch(`${API_URL}/api/v1/self-learning/admin/survey/${item.id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.survey) {
                setSurvey(data.survey);
                setSurveyTitle(data.survey.title || 'Course Feedback Survey');
                setSurveyDesc(data.survey.description || '');
                setSurveyActive(data.survey.is_active !== false);
                setSurveyQuestions(data.survey.questions || []);
            } else {
                setSurvey(null);
                setSurveyTitle('Course Feedback Survey');
                setSurveyDesc('');
                setSurveyActive(true);
                setSurveyQuestions([]);
            }
        } catch (e) {
            console.error('Survey fetch error:', e);
        } finally {
            setLoadingSurvey(false);
        }
    };

    const fetchSurveyResponses = async () => {
        if (!item || itemType !== 'course') return;
        setLoadingResponses(true);
        try {
            const token = await AsyncStorage.getItem('userToken');
            const res = await fetch(`${API_URL}/api/v1/self-learning/admin/survey/${item.id}/responses`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setSurveyResponses(await res.json());
        } catch (e) {
            console.error('Survey responses fetch error:', e);
        } finally {
            setLoadingResponses(false);
        }
    };

    const handleSaveSurvey = async () => {
        if (!item) return;
        setSavingSurvey(true);
        try {
            const token = await AsyncStorage.getItem('userToken');
            const res = await fetch(`${API_URL}/api/v1/self-learning/admin/survey/${item.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    title: surveyTitle,
                    description: surveyDesc,
                    is_active: surveyActive,
                    questions: surveyQuestions,
                }),
            });
            const data = await res.json();
            if (data.status === 'success') {
                setSurvey(data.survey);
                showAlert('Saved', 'Survey saved successfully!');
            }
        } catch (e) {
            showAlert('Error', 'Failed to save survey');
        } finally {
            setSavingSurvey(false);
        }
    };

    const handleDeleteSurvey = async () => {
        if (!item || !survey) return;
        if (Platform.OS === 'web') {
            if (!window.confirm('Delete this survey? All responses will remain but the survey will be removed.')) return;
        }
        try {
            const token = await AsyncStorage.getItem('userToken');
            await fetch(`${API_URL}/api/v1/self-learning/admin/survey/${item.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` },
            });
            setSurvey(null);
            setSurveyQuestions([]);
            showAlert('Deleted', 'Survey deleted');
        } catch (e) {
            showAlert('Error', 'Failed to delete survey');
        }
    };

    const addQuestion = () => {
        if (!newQLabel.trim()) {
            showAlert('Missing', 'Please enter a question label');
            return;
        }
        const q = {
            id: `q_${Date.now()}`,
            type: newQType,
            label: newQLabel.trim(),
            mandatory: newQMandatory,
            options: newQType === 'mcq' ? newQOptions.filter(o => o.trim()) : [],
        };
        setSurveyQuestions(prev => [...prev, q]);
        setNewQLabel('');
        setNewQMandatory(false);
        setNewQOptions(['', '']);
        setShowAddQuestion(false);
    };

    const removeQuestion = (qid) => {
        setSurveyQuestions(prev => prev.filter(q => q.id !== qid));
    };

    const moveQuestion = (index, dir) => {
        setSurveyQuestions(prev => {
            const arr = [...prev];
            const target = index + dir;
            if (target < 0 || target >= arr.length) return arr;
            [arr[index], arr[target]] = [arr[target], arr[index]];
            return arr;
        });
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
                    certificate_template: certificateTemplate,
                    assigned_users: assignmentData,
                    xp: parseInt(xpPoints) || 50,
                    is_published: isPublished,
                    scheduled_at: scheduledAt || null,
                }
                : {
                    is_linear: isLinear,
                    assigned_users: assignmentData,
                    show_in_both_paths: showInBothPaths,
                };

            const res = await fetch(endpoint, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (data.status === 'success') {
                showAlert('Saved', 'Settings updated successfully');

                // Clear all SL caches so employee view reflects changes immediately
                try {
                    await AsyncStorage.removeItem('sl_hierarchy_cache');
                    await AsyncStorage.removeItem('sl_hierarchy_timestamp');
                    const allKeys = await AsyncStorage.getAllKeys();
                    const courseCacheKeys = allKeys.filter(k => k.startsWith('sl_courses_'));
                    if (courseCacheKeys.length > 0) {
                        await AsyncStorage.multiRemove(courseCacheKeys);
                    }
                } catch (cacheErr) {
                    console.log('Cache clear error (non-critical):', cacheErr);
                }

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

    const hasAssignment = assignmentData.emails.length > 0 || assignmentData.roles.length > 0 ||
        assignmentData.stores.length > 0 || assignmentData.categories.length > 0 ||
        (assignmentData.regions?.length > 0) || (assignmentData.cities?.length > 0) ||
        (assignmentData.states?.length > 0) || (assignmentData.designations?.length > 0) ||
        (assignmentData.departments?.length > 0);

    const renderAssignmentSummary = (type) => {
        if (hasAssignment) {
            return (
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
            );
        }
        return <Text style={[styles.sectionDesc, { marginTop: 8, fontStyle: 'italic' }]}>All users can access this {type}</Text>;
    };

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
                                if (s.key === 'feedback') { fetchSurvey(); setSurveyTab('builder'); }
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

                                    {/* Certificate Template & Preview (shown when certificate is enabled) */}
                                    {enableCertificate && (
                                        <View style={styles.certSection}>
                                            <Text style={styles.certSectionTitle}>Certificate Template</Text>
                                            <View style={styles.certTemplateRow}>
                                                {[
                                                    { key: 'classic', label: 'Classic', color: '#78350F', bg: '#FFFBEB', border: '#FDE68A', icon: 'certificate' },
                                                    { key: 'modern', label: 'Modern', color: '#1E40AF', bg: '#EFF6FF', border: '#BFDBFE', icon: 'shield-check' },
                                                    { key: 'elegant', label: 'Elegant', color: '#6B21A8', bg: '#F5F3FF', border: '#DDD6FE', icon: 'star-four-points' },
                                                ].map(t => (
                                                    <TouchableOpacity
                                                        key={t.key}
                                                        style={[
                                                            styles.certTemplateCard,
                                                            { backgroundColor: t.bg, borderColor: certificateTemplate === t.key ? t.color : t.border },
                                                            certificateTemplate === t.key && { borderWidth: 2 }
                                                        ]}
                                                        onPress={() => setCertificateTemplate(t.key)}
                                                    >
                                                        <MaterialCommunityIcons name={t.icon} size={20} color={t.color} />
                                                        <Text style={[styles.certTemplateLabel, { color: t.color }]}>{t.label}</Text>
                                                        {certificateTemplate === t.key && (
                                                            <View style={[styles.certCheckBadge, { backgroundColor: t.color }]}>
                                                                <Feather name="check" size={10} color="#FFF" />
                                                            </View>
                                                        )}
                                                    </TouchableOpacity>
                                                ))}
                                            </View>

                                            {/* Certificate Preview Button */}
                                            <TouchableOpacity
                                                style={styles.certPreviewBtn}
                                                onPress={() => setShowCertPreview(!showCertPreview)}
                                            >
                                                <Feather name={showCertPreview ? 'eye-off' : 'eye'} size={16} color="#78350F" />
                                                <Text style={styles.certPreviewBtnText}>
                                                    {showCertPreview ? 'Hide Preview' : 'Preview Certificate'}
                                                </Text>
                                            </TouchableOpacity>

                                            {/* Certificate Preview */}
                                            {showCertPreview && (
                                                <View style={[
                                                    styles.certPreviewContainer,
                                                    certificateTemplate === 'classic' && { backgroundColor: '#FFFDF7', borderColor: '#D4A574' },
                                                    certificateTemplate === 'modern' && { backgroundColor: '#F0F9FF', borderColor: '#3B82F6' },
                                                    certificateTemplate === 'elegant' && { backgroundColor: '#FAF5FF', borderColor: '#8B5CF6' },
                                                ]}>
                                                    {/* Decorative top border */}
                                                    <View style={[
                                                        styles.certTopBorder,
                                                        certificateTemplate === 'classic' && { backgroundColor: '#D4A574' },
                                                        certificateTemplate === 'modern' && { backgroundColor: '#3B82F6' },
                                                        certificateTemplate === 'elegant' && { backgroundColor: '#8B5CF6' },
                                                    ]} />
                                                    <Text style={[
                                                        styles.certPreviewCompany,
                                                        certificateTemplate === 'modern' && { color: '#1E40AF' },
                                                        certificateTemplate === 'elegant' && { color: '#6B21A8', fontStyle: 'italic' },
                                                    ]}>Belgian Waffle Co.</Text>
                                                    <Text style={[
                                                        styles.certPreviewHeading,
                                                        certificateTemplate === 'modern' && { color: '#1E40AF', letterSpacing: 3 },
                                                        certificateTemplate === 'elegant' && { color: '#6B21A8', letterSpacing: 2 },
                                                    ]}>CERTIFICATE OF COMPLETION</Text>
                                                    <Text style={styles.certPreviewSubtext}>This is to certify that</Text>
                                                    <Text style={[
                                                        styles.certPreviewName,
                                                        certificateTemplate === 'modern' && { color: '#1E40AF' },
                                                        certificateTemplate === 'elegant' && { color: '#6B21A8', fontStyle: 'italic' },
                                                    ]}>John Doe</Text>
                                                    <Text style={styles.certPreviewSubtext}>has successfully completed</Text>
                                                    <Text style={[
                                                        styles.certPreviewCourse,
                                                        certificateTemplate === 'modern' && { color: '#1E40AF' },
                                                        certificateTemplate === 'elegant' && { color: '#6B21A8' },
                                                    ]}>{item?.title || 'Course Title'}</Text>
                                                    <View style={styles.certPreviewFooter}>
                                                        <Text style={styles.certPreviewDate}>Date: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</Text>
                                                        <Text style={styles.certPreviewId}>ID: CERT-XXXXXXXX</Text>
                                                    </View>
                                                    {/* Decorative bottom border */}
                                                    <View style={[
                                                        styles.certBottomBorder,
                                                        certificateTemplate === 'classic' && { backgroundColor: '#D4A574' },
                                                        certificateTemplate === 'modern' && { backgroundColor: '#3B82F6' },
                                                        certificateTemplate === 'elegant' && { backgroundColor: '#8B5CF6' },
                                                    ]} />
                                                </View>
                                            )}
                                        </View>
                                    )}

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

                                    {/* Assign Users for Course */}
                                    <Text style={[styles.sectionTitle, { marginTop: 20, marginBottom: 4 }]}>Assign Users</Text>
                                    <Text style={styles.sectionDesc}>Control who can access this course. Leave empty to allow everyone.</Text>

                                    <TouchableOpacity style={styles.assignBtn} onPress={() => setPickerVisible(true)}>
                                        <Feather name="users" size={18} color={THEME.primaryDark} />
                                        <Text style={styles.assignBtnText}>Manage Assigned Users</Text>
                                        <Feather name="chevron-right" size={16} color="#9CA3AF" />
                                    </TouchableOpacity>

                                    {renderAssignmentSummary('course')}

                                    <UserAssignmentPicker
                                        visible={pickerVisible}
                                        onClose={() => setPickerVisible(false)}
                                        currentAssignment={assignmentData}
                                        onSave={(data) => setAssignmentData(data)}
                                    />
                                </>
                            ) : (
                                <>
                                    <SettingRow label="Linear (Sequential)" desc="Users must complete modules in order" icon="list">
                                        <Switch value={isLinear} onValueChange={setIsLinear} trackColor={{ true: THEME.green }} />
                                    </SettingRow>

                                    <SettingRow
                                        label={`Also show in ${(item?.original_learning_path_type || item?.learning_path_type) === 'self_learning' ? 'Career Progression' : 'Self Learning'}`}
                                        desc={`Display this folder and its courses in the ${(item?.original_learning_path_type || item?.learning_path_type) === 'self_learning' ? 'Career Progression' : 'Self Learning'} section as well`}
                                        icon="copy"
                                    >
                                        <Switch value={showInBothPaths} onValueChange={setShowInBothPaths} trackColor={{ true: '#3B82F6' }} />
                                    </SettingRow>

                                    <Text style={[styles.sectionTitle, { marginTop: 20, marginBottom: 4 }]}>User Assignment</Text>
                                    <Text style={styles.sectionDesc}>Control who can access this bucket. Leave empty to allow everyone.</Text>

                                    <TouchableOpacity style={styles.assignBtn} onPress={() => setPickerVisible(true)}>
                                        <Feather name="users" size={18} color={THEME.primaryDark} />
                                        <Text style={styles.assignBtnText}>Manage Assigned Users</Text>
                                        <Feather name="chevron-right" size={16} color="#9CA3AF" />
                                    </TouchableOpacity>

                                    {renderAssignmentSummary('bucket')}

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

                    {/* ========== SURVEY BUILDER ========== */}
                    {activeSection === 'feedback' && itemType === 'course' && (
                        <View>
                            {/* Sub-tabs: Builder | Responses */}
                            <View style={styles.surveySubTabs}>
                                <TouchableOpacity
                                    style={[styles.surveySubTab, surveyTab === 'builder' && styles.surveySubTabActive]}
                                    onPress={() => setSurveyTab('builder')}
                                >
                                    <Feather name="edit-3" size={13} color={surveyTab === 'builder' ? '#FFF' : THEME.primaryDark} />
                                    <Text style={[styles.surveySubTabText, surveyTab === 'builder' && { color: '#FFF' }]}>Survey Builder</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.surveySubTab, surveyTab === 'responses' && styles.surveySubTabActive]}
                                    onPress={() => { setSurveyTab('responses'); fetchSurveyResponses(); fetchFeedback(); }}
                                >
                                    <Feather name="bar-chart-2" size={13} color={surveyTab === 'responses' ? '#FFF' : THEME.primaryDark} />
                                    <Text style={[styles.surveySubTabText, surveyTab === 'responses' && { color: '#FFF' }]}>Responses</Text>
                                </TouchableOpacity>
                            </View>

                            {/* ---- BUILDER TAB ---- */}
                            {surveyTab === 'builder' && (
                                loadingSurvey ? (
                                    <ActivityIndicator size="large" color={THEME.primary} style={{ marginTop: 40 }} />
                                ) : (
                                    <View>
                                        {/* Survey Meta */}
                                        <View style={styles.surveyMetaCard}>
                                            <Text style={styles.inputLabel}>Survey Title</Text>
                                            <TextInput
                                                style={styles.input}
                                                value={surveyTitle}
                                                onChangeText={setSurveyTitle}
                                                placeholder="e.g. Course Feedback Survey"
                                                placeholderTextColor="#9CA3AF"
                                            />
                                            <Text style={[styles.inputLabel, { marginTop: 10 }]}>Description (optional)</Text>
                                            <TextInput
                                                style={[styles.input, { minHeight: 60 }]}
                                                value={surveyDesc}
                                                onChangeText={setSurveyDesc}
                                                placeholder="Brief description shown to users"
                                                placeholderTextColor="#9CA3AF"
                                                multiline
                                                textAlignVertical="top"
                                            />
                                            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 10 }}>
                                                <Switch value={surveyActive} onValueChange={setSurveyActive} trackColor={{ true: THEME.green }} />
                                                <Text style={styles.settingLabel}>Survey Active (shown to users)</Text>
                                            </View>
                                        </View>

                                        {/* Questions List */}
                                        <Text style={[styles.sectionTitle, { marginTop: 16, marginBottom: 8 }]}>
                                            Questions ({surveyQuestions.length})
                                        </Text>

                                        {surveyQuestions.length === 0 && (
                                            <View style={styles.emptyQBox}>
                                                <Feather name="clipboard" size={28} color="#D1D5DB" />
                                                <Text style={styles.emptyQText}>No questions yet. Add your first question below.</Text>
                                            </View>
                                        )}

                                        {surveyQuestions.map((q, idx) => (
                                            <View key={q.id} style={styles.questionCard}>
                                                <View style={styles.questionCardHeader}>
                                                    <View style={[styles.qTypeBadge, {
                                                        backgroundColor: q.type === 'rating' ? '#FEF3C7' : q.type === 'mcq' ? '#EFF6FF' : q.type === 'name' ? '#F0FDF4' : '#F5F3FF'
                                                    }]}>
                                                        <Text style={[styles.qTypeBadgeText, {
                                                            color: q.type === 'rating' ? '#92400E' : q.type === 'mcq' ? '#1E40AF' : q.type === 'name' ? '#166534' : '#6B21A8'
                                                        }]}>
                                                            {q.type === 'rating' ? '⭐ Rating' : q.type === 'mcq' ? '☑ MCQ' : q.type === 'name' ? '👤 Name' : '✏ Text'}
                                                        </Text>
                                                    </View>
                                                    {q.mandatory && (
                                                        <View style={styles.mandatoryBadge}>
                                                            <Text style={styles.mandatoryBadgeText}>Required</Text>
                                                        </View>
                                                    )}
                                                    <View style={{ flex: 1 }} />
                                                    <TouchableOpacity onPress={() => moveQuestion(idx, -1)} style={styles.qActionBtn}>
                                                        <Feather name="chevron-up" size={16} color="#6B7280" />
                                                    </TouchableOpacity>
                                                    <TouchableOpacity onPress={() => moveQuestion(idx, 1)} style={styles.qActionBtn}>
                                                        <Feather name="chevron-down" size={16} color="#6B7280" />
                                                    </TouchableOpacity>
                                                    <TouchableOpacity onPress={() => removeQuestion(q.id)} style={[styles.qActionBtn, { backgroundColor: '#FEE2E2' }]}>
                                                        <Feather name="trash-2" size={14} color={THEME.red} />
                                                    </TouchableOpacity>
                                                </View>
                                                <Text style={styles.questionLabel}>{idx + 1}. {q.label}</Text>
                                                {q.type === 'mcq' && q.options?.length > 0 && (
                                                    <View style={{ marginTop: 6, gap: 3 }}>
                                                        {q.options.map((opt, oi) => (
                                                            <Text key={oi} style={styles.mcqOptionPreview}>○  {opt}</Text>
                                                        ))}
                                                    </View>
                                                )}
                                            </View>
                                        ))}

                                        {/* Add Question Panel */}
                                        {showAddQuestion ? (
                                            <View style={styles.addQCard}>
                                                <Text style={styles.addQTitle}>New Question</Text>

                                                {/* Type Selector */}
                                                <Text style={styles.inputLabel}>Question Type</Text>
                                                <View style={styles.qTypeRow}>
                                                    {[
                                                        { key: 'text', label: '✏ Text', color: '#6B21A8', bg: '#F5F3FF' },
                                                        { key: 'mcq', label: '☑ MCQ', color: '#1E40AF', bg: '#EFF6FF' },
                                                        { key: 'rating', label: '⭐ Rating', color: '#92400E', bg: '#FEF3C7' },
                                                        { key: 'name', label: '👤 Name', color: '#166534', bg: '#F0FDF4' },
                                                    ].map(t => (
                                                        <TouchableOpacity
                                                            key={t.key}
                                                            style={[styles.qTypeChip, { backgroundColor: newQType === t.key ? t.color : t.bg, borderColor: t.color }]}
                                                            onPress={() => setNewQType(t.key)}
                                                        >
                                                            <Text style={[styles.qTypeChipText, { color: newQType === t.key ? '#FFF' : t.color }]}>{t.label}</Text>
                                                        </TouchableOpacity>
                                                    ))}
                                                </View>

                                                {/* Label */}
                                                <Text style={[styles.inputLabel, { marginTop: 10 }]}>Question Label *</Text>
                                                <TextInput
                                                    style={styles.input}
                                                    value={newQLabel}
                                                    onChangeText={setNewQLabel}
                                                    placeholder={newQType === 'name' ? 'e.g. Your Full Name' : newQType === 'rating' ? 'e.g. Rate this course' : newQType === 'mcq' ? 'e.g. How did you find the content?' : 'e.g. Any additional comments?'}
                                                    placeholderTextColor="#9CA3AF"
                                                />

                                                {/* MCQ Options */}
                                                {newQType === 'mcq' && (
                                                    <View style={{ marginTop: 10 }}>
                                                        <Text style={styles.inputLabel}>Options</Text>
                                                        {newQOptions.map((opt, oi) => (
                                                            <View key={oi} style={{ flexDirection: 'row', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                                                                <TextInput
                                                                    style={[styles.input, { flex: 1, marginBottom: 0 }]}
                                                                    value={opt}
                                                                    onChangeText={v => {
                                                                        const arr = [...newQOptions];
                                                                        arr[oi] = v;
                                                                        setNewQOptions(arr);
                                                                    }}
                                                                    placeholder={`Option ${oi + 1}`}
                                                                    placeholderTextColor="#9CA3AF"
                                                                />
                                                                {newQOptions.length > 2 && (
                                                                    <TouchableOpacity onPress={() => setNewQOptions(prev => prev.filter((_, i) => i !== oi))}>
                                                                        <Feather name="x" size={16} color={THEME.red} />
                                                                    </TouchableOpacity>
                                                                )}
                                                            </View>
                                                        ))}
                                                        <TouchableOpacity
                                                            style={styles.addOptionBtn}
                                                            onPress={() => setNewQOptions(prev => [...prev, ''])}
                                                        >
                                                            <Feather name="plus" size={14} color={THEME.primaryDark} />
                                                            <Text style={styles.addOptionBtnText}>Add Option</Text>
                                                        </TouchableOpacity>
                                                    </View>
                                                )}

                                                {/* Mandatory toggle */}
                                                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 10 }}>
                                                    <Switch value={newQMandatory} onValueChange={setNewQMandatory} trackColor={{ true: THEME.red }} />
                                                    <Text style={styles.settingLabel}>Mandatory (required to submit)</Text>
                                                </View>

                                                <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                                                    <TouchableOpacity style={[styles.scheduleBtn, { flex: 1, backgroundColor: '#F3F4F6' }]} onPress={() => setShowAddQuestion(false)}>
                                                        <Text style={[styles.scheduleBtnText, { color: THEME.textMain }]}>Cancel</Text>
                                                    </TouchableOpacity>
                                                    <TouchableOpacity style={[styles.scheduleBtn, { flex: 2, backgroundColor: THEME.primaryDark }]} onPress={addQuestion}>
                                                        <Feather name="plus" size={16} color="#FFF" />
                                                        <Text style={styles.scheduleBtnText}>Add Question</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            </View>
                                        ) : (
                                            <TouchableOpacity
                                                style={styles.addQBtn}
                                                onPress={() => setShowAddQuestion(true)}
                                            >
                                                <Feather name="plus-circle" size={18} color={THEME.primaryDark} />
                                                <Text style={styles.addQBtnText}>Add Question</Text>
                                            </TouchableOpacity>
                                        )}

                                        {/* Save / Delete Survey */}
                                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
                                            {survey && (
                                                <TouchableOpacity
                                                    style={[styles.scheduleBtn, { flex: 1, backgroundColor: '#FEE2E2' }]}
                                                    onPress={handleDeleteSurvey}
                                                >
                                                    <Feather name="trash-2" size={15} color={THEME.red} />
                                                    <Text style={[styles.scheduleBtnText, { color: THEME.red }]}>Delete</Text>
                                                </TouchableOpacity>
                                            )}
                                            <TouchableOpacity
                                                style={[styles.saveBtn, { flex: 3, marginTop: 0 }]}
                                                onPress={handleSaveSurvey}
                                                disabled={savingSurvey}
                                            >
                                                {savingSurvey ? <ActivityIndicator color="#FFF" /> : (
                                                    <>
                                                        <Feather name="save" size={16} color="#FFF" />
                                                        <Text style={styles.saveBtnText}>{survey ? 'Update Survey' : 'Create Survey'}</Text>
                                                    </>
                                                )}
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                )
                            )}

                            {/* ---- RESPONSES TAB ---- */}
                            {surveyTab === 'responses' && (
                                loadingResponses ? (
                                    <ActivityIndicator size="large" color={THEME.primary} style={{ marginTop: 40 }} />
                                ) : surveyResponses ? (
                                    <View>
                                        {/* Summary */}
                                        <View style={styles.responseSummaryCard}>
                                            <Feather name="users" size={20} color="#3B82F6" />
                                            <Text style={styles.responseSummaryCount}>{surveyResponses.total || 0}</Text>
                                            <Text style={styles.responseSummaryLabel}>Total Responses</Text>
                                        </View>

                                        {/* Per-question stats */}
                                        {(surveyResponses.survey?.questions || []).map(q => {
                                            const stat = (surveyResponses.stats || {})[q.id];
                                            return (
                                                <View key={q.id} style={styles.responseStatCard}>
                                                    <Text style={styles.responseStatQ}>{q.label}</Text>
                                                    {stat?.type === 'rating' && (
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                                                            <Text style={styles.responseStatAvg}>{stat.average || '—'}</Text>
                                                            <View style={{ flexDirection: 'row', gap: 2 }}>
                                                                {[1, 2, 3, 4, 5].map(s => (
                                                                    <MaterialCommunityIcons key={s} name={s <= Math.round(stat.average || 0) ? 'star' : 'star-outline'} size={16} color="#F59E0B" />
                                                                ))}
                                                            </View>
                                                            <Text style={styles.responseStatCount}>({stat.count} responses)</Text>
                                                        </View>
                                                    )}
                                                    {stat?.type === 'mcq' && (
                                                        <View style={{ marginTop: 6, gap: 4 }}>
                                                            {Object.entries(stat.counts || {}).map(([opt, cnt]) => {
                                                                const total = Object.values(stat.counts).reduce((a, b) => a + b, 0);
                                                                const pct = total > 0 ? Math.round((cnt / total) * 100) : 0;
                                                                return (
                                                                    <View key={opt}>
                                                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                                            <Text style={styles.mcqOptLabel}>{opt}</Text>
                                                                            <Text style={styles.mcqOptCount}>{cnt} ({pct}%)</Text>
                                                                        </View>
                                                                        <View style={styles.mcqBar}>
                                                                            <View style={[styles.mcqBarFill, { width: `${pct}%` }]} />
                                                                        </View>
                                                                    </View>
                                                                );
                                                            })}
                                                        </View>
                                                    )}
                                                    {(stat?.type === 'text' || stat?.type === 'name') && (
                                                        <Text style={styles.responseStatCount}>{stat.count} answered</Text>
                                                    )}
                                                </View>
                                            );
                                        })}

                                        {/* Individual responses */}
                                        {surveyResponses.total > 0 && (
                                            <>
                                                <Text style={[styles.inputLabel, { marginTop: 16, marginBottom: 8 }]}>Individual Responses</Text>
                                                {(surveyResponses.responses || []).map((r, i) => (
                                                    <View key={r.id} style={styles.feedbackItem}>
                                                        <Text style={styles.feedbackUser}>{r.user_name || r.user_email}</Text>
                                                        <Text style={[styles.feedbackComment, { fontSize: 10, marginBottom: 4 }]}>{r.created_at?.slice(0, 10)}</Text>
                                                        {(surveyResponses.survey?.questions || []).map(q => (
                                                            <Text key={q.id} style={styles.feedbackComment}>
                                                                <Text style={{ fontWeight: '600' }}>{q.label}: </Text>
                                                                {String((r.answers || {})[q.id] ?? '—')}
                                                            </Text>
                                                        ))}
                                                    </View>
                                                ))}
                                            </>
                                        )}

                                        {surveyResponses.total === 0 && (
                                            <Text style={styles.emptyText}>No survey responses yet</Text>
                                        )}

                                        {/* Legacy Feedback */}
                                        {feedbackData && feedbackData.feedbacks && feedbackData.feedbacks.length > 0 && (
                                            <>
                                                <Text style={[styles.inputLabel, { marginTop: 24, marginBottom: 8 }]}>Legacy Feedback (Ratings & Comments)</Text>
                                                <View style={styles.feedbackSummary}>
                                                    <Text style={styles.feedbackAvg}>
                                                        {feedbackData.average_rating || 0}
                                                        <Text style={{ fontSize: 18, color: '#9CA3AF' }}>/5</Text>
                                                    </Text>
                                                    <View style={{ flexDirection: 'row', gap: 2, marginVertical: 4 }}>
                                                        {[1, 2, 3, 4, 5].map((s) => (
                                                            <MaterialCommunityIcons
                                                                key={s}
                                                                name={s <= Math.round(feedbackData.average_rating || 0) ? 'star' : 'star-outline'}
                                                                size={20}
                                                                color="#F59E0B"
                                                            />
                                                        ))}
                                                    </View>
                                                    <Text style={styles.feedbackCount}>Based on {feedbackData.total} ratings</Text>
                                                </View>
                                                {feedbackData.feedbacks.map((f, i) => (
                                                    <View key={f.id} style={styles.feedbackItem}>
                                                        <Text style={styles.feedbackUser}>{f.user_email}</Text>
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, marginBottom: 4 }}>
                                                            {[1, 2, 3, 4, 5].map(s => (
                                                                <MaterialCommunityIcons
                                                                    key={s}
                                                                    name={s <= f.rating ? 'star' : 'star-outline'}
                                                                    size={14}
                                                                    color="#F59E0B"
                                                                />
                                                            ))}
                                                        </View>
                                                        <Text style={styles.feedbackComment}>{f.comment || 'No comment provided'}</Text>
                                                    </View>
                                                ))}
                                            </>
                                        )}

                                    </View>
                                ) : (
                                    <TouchableOpacity style={styles.loadBtn} onPress={() => { fetchSurveyResponses(); fetchFeedback(); }}>
                                        <Feather name="refresh-cw" size={16} color={THEME.primaryDark} />
                                        <Text style={styles.loadBtnText}>Load Responses</Text>
                                    </TouchableOpacity>
                                )
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

    // Certificate Section
    certSection: {
        backgroundColor: '#FFFBEB', borderRadius: 14, padding: 16, marginTop: 12, marginBottom: 4,
        borderWidth: 1, borderColor: '#FDE68A',
    },
    certSectionTitle: { fontSize: 14, fontWeight: '700', color: '#78350F', marginBottom: 10 },
    certTemplateRow: { flexDirection: 'row', gap: 8 },
    certTemplateCard: {
        flex: 1, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8,
        borderRadius: 12, borderWidth: 1, gap: 4,
    },
    certTemplateLabel: { fontSize: 11, fontWeight: '700' },
    certCheckBadge: {
        position: 'absolute', top: -4, right: -4,
        width: 18, height: 18, borderRadius: 9,
        justifyContent: 'center', alignItems: 'center',
    },
    certPreviewBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        marginTop: 12, paddingVertical: 10, borderRadius: 10,
        backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#FDE68A',
    },
    certPreviewBtnText: { fontSize: 12, fontWeight: '600', color: '#78350F' },
    certPreviewContainer: {
        marginTop: 12, borderRadius: 12, borderWidth: 2, padding: 20,
        alignItems: 'center', overflow: 'hidden',
    },
    certTopBorder: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
    certBottomBorder: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 4 },
    certPreviewCompany: { fontSize: 10, fontWeight: '600', color: '#78350F', letterSpacing: 2, marginBottom: 4 },
    certPreviewHeading: { fontSize: 14, fontWeight: '800', color: '#78350F', letterSpacing: 1, marginBottom: 10 },
    certPreviewSubtext: { fontSize: 9, color: '#6B7280', marginBottom: 2 },
    certPreviewName: { fontSize: 18, fontWeight: '800', color: '#78350F', marginVertical: 4 },
    certPreviewCourse: { fontSize: 12, fontWeight: '700', color: '#78350F', marginTop: 2, marginBottom: 10, textAlign: 'center' },
    certPreviewFooter: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 8 },
    certPreviewDate: { fontSize: 8, color: '#9CA3AF' },
    certPreviewId: { fontSize: 8, color: '#9CA3AF' },

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

    // Survey Builder
    surveySubTabs: {
        flexDirection: 'row', gap: 8, marginBottom: 16,
        backgroundColor: '#FEF3C7', borderRadius: 12, padding: 4,
    },
    surveySubTab: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
        paddingVertical: 8, borderRadius: 10,
    },
    surveySubTabActive: { backgroundColor: THEME.primaryDark },
    surveySubTabText: { fontSize: 12, fontWeight: '700', color: THEME.primaryDark },

    surveyMetaCard: {
        backgroundColor: '#FFFBEB', borderRadius: 14, padding: 14,
        borderWidth: 1, borderColor: '#FDE68A', marginBottom: 4,
    },

    emptyQBox: {
        alignItems: 'center', paddingVertical: 28, gap: 8,
        backgroundColor: '#F9FAFB', borderRadius: 12, marginBottom: 12,
        borderWidth: 1, borderColor: THEME.border, borderStyle: 'dashed',
    },
    emptyQText: { fontSize: 13, color: THEME.textSub, textAlign: 'center' },

    questionCard: {
        backgroundColor: THEME.card, borderRadius: 12, padding: 12,
        borderWidth: 1, borderColor: THEME.border, marginBottom: 8,
    },
    questionCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
    questionLabel: { fontSize: 14, fontWeight: '600', color: THEME.textMain },

    qTypeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    qTypeBadgeText: { fontSize: 11, fontWeight: '700' },

    mandatoryBadge: {
        backgroundColor: '#FEE2E2', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6,
    },
    mandatoryBadgeText: { fontSize: 10, fontWeight: '700', color: THEME.red },

    qActionBtn: {
        width: 28, height: 28, borderRadius: 8, backgroundColor: '#F3F4F6',
        justifyContent: 'center', alignItems: 'center',
    },

    mcqOptionPreview: { fontSize: 12, color: THEME.textSub, paddingLeft: 4 },

    addQCard: {
        backgroundColor: '#F0FDF4', borderRadius: 14, padding: 14,
        borderWidth: 1, borderColor: '#BBF7D0', marginBottom: 12,
    },
    addQTitle: { fontSize: 14, fontWeight: '700', color: '#166534', marginBottom: 10 },

    qTypeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    qTypeChip: {
        paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1.5,
    },
    qTypeChipText: { fontSize: 12, fontWeight: '700' },

    addOptionBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8,
        backgroundColor: '#FEF3C7', marginTop: 4, alignSelf: 'flex-start',
    },
    addOptionBtnText: { fontSize: 12, fontWeight: '600', color: THEME.primaryDark },

    addQBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        paddingVertical: 12, borderRadius: 12, borderWidth: 1.5,
        borderColor: THEME.primaryDark, borderStyle: 'dashed', marginBottom: 4,
    },
    addQBtnText: { fontSize: 14, fontWeight: '600', color: THEME.primaryDark },

    // Responses
    responseSummaryCard: {
        alignItems: 'center', paddingVertical: 20, gap: 4,
        backgroundColor: '#EFF6FF', borderRadius: 14, marginBottom: 14,
        borderWidth: 1, borderColor: '#BFDBFE',
    },
    responseSummaryCount: { fontSize: 36, fontWeight: '800', color: '#1D4ED8' },
    responseSummaryLabel: { fontSize: 12, color: '#3B82F6', fontWeight: '600' },

    responseStatCard: {
        backgroundColor: THEME.card, borderRadius: 12, padding: 12,
        borderWidth: 1, borderColor: THEME.border, marginBottom: 8,
    },
    responseStatQ: { fontSize: 13, fontWeight: '700', color: THEME.textMain },
    responseStatAvg: { fontSize: 22, fontWeight: '800', color: '#F59E0B' },
    responseStatCount: { fontSize: 11, color: THEME.textSub, marginTop: 4 },

    mcqOptLabel: { fontSize: 12, color: THEME.textMain, flex: 1 },
    mcqOptCount: { fontSize: 11, color: THEME.textSub, fontWeight: '600' },
    mcqBar: {
        height: 6, backgroundColor: '#F3F4F6', borderRadius: 3, marginTop: 3, marginBottom: 6,
    },
    mcqBarFill: { height: 6, backgroundColor: '#3B82F6', borderRadius: 3 },
});
