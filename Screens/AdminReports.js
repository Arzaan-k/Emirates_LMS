/**
 * AdminReports.js - Comprehensive Reports Module
 * Professional reports with CSV and PDF download capabilities
 * PDF reports include data insights and visualizations
 */

import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    Dimensions,
    Platform,
    Alert,
    Linking,
    TextInput,
    Switch,
    Modal,
    FlatList,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import API_URL from '../config';

const { width } = Dimensions.get('window');
const isWeb = Platform.OS === 'web';

// Report categories with their endpoints
const REPORT_CATEGORIES = [
    {
        id: 'users',
        name: 'User Analytics',
        icon: 'users',
        color: '#3B82F6',
        description: 'User engagement and progress metrics',
        endpoint: '/api/v1/reports/users',
        downloadEndpoint: '/api/v1/reports/users/download',
        pdfEndpoint: '/api/v1/reports/users/pdf',
    },
    {
        id: 'training',
        name: 'Training Effectiveness',
        icon: 'book-open',
        color: '#10B981',
        description: 'Course completion and performance data',
        endpoint: '/api/v1/reports/training',
        downloadEndpoint: '/api/v1/reports/training/download',
        pdfEndpoint: '/api/v1/reports/training/pdf',
    },
    {
        id: 'quizzes',
        name: 'Quiz Performance',
        icon: 'edit-3',
        color: '#F59E0B',
        description: 'Quiz scores and submission metrics',
        endpoint: '/api/v1/reports/quizzes',
        downloadEndpoint: '/api/v1/reports/quizzes/download',
        pdfEndpoint: '/api/v1/reports/quizzes/pdf',
    },
    {
        id: 'assessments',
        name: 'Assessment Results',
        icon: 'clipboard',
        color: '#8B5CF6',
        description: 'Proctored assessment performance',
        endpoint: '/api/v1/reports/assessments',
        downloadEndpoint: '/api/v1/reports/assessments/download',
        pdfEndpoint: '/api/v1/reports/assessments/pdf',
    },
    {
        id: 'attendance',
        name: 'Attendance & Hours',
        icon: 'clock',
        color: '#EC4899',
        description: 'Learning time and engagement',
        endpoint: '/api/v1/reports/attendance',
        downloadEndpoint: '/api/v1/reports/attendance/download',
        pdfEndpoint: '/api/v1/reports/attendance/pdf',
    },
    {
        id: 'stores',
        name: 'Store Performance',
        icon: 'home',
        color: '#14B8A6',
        description: 'Store-wise training metrics',
        endpoint: '/api/v1/reports/stores',
        downloadEndpoint: '/api/v1/reports/stores/download',
        pdfEndpoint: '/api/v1/reports/stores/pdf',
    },
    {
        id: 'simulations',
        name: 'Simulation Progress',
        icon: 'play-circle',
        color: '#6366F1',
        description: 'Interactive simulation completion',
        endpoint: '/api/v1/reports/simulations',
        downloadEndpoint: '/api/v1/reports/simulations/download',
        pdfEndpoint: '/api/v1/reports/simulations/pdf',
    },
    {
        id: 'content',
        name: 'Content Engagement',
        icon: 'video',
        color: '#EF4444',
        description: 'Video and content consumption',
        endpoint: '/api/v1/reports/content',
        downloadEndpoint: '/api/v1/reports/content/download',
        pdfEndpoint: '/api/v1/reports/content/pdf',
    },
    {
        id: 'executive',
        name: 'Executive Summary',
        icon: 'bar-chart-2',
        color: '#F97316',
        description: 'AI-powered insights overview',
        endpoint: '/api/v1/reports/executive-summary',
        downloadEndpoint: '/api/v1/reports/executive-summary/download',
        pdfEndpoint: '/api/v1/reports/executive-summary/pdf',
    },
];

const AdminReports = ({ navigation }) => {
    const [selectedCategory, setSelectedCategory] = useState('users');
    const [loading, setLoading] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [reportData, setReportData] = useState(null);
    const [overviewData, setOverviewData] = useState(null);

    // Filter states
    const [showFilters, setShowFilters] = useState(false);
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [storeFilter, setStoreFilter] = useState('');
    const [bucketFilter, setBucketFilter] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [minScore, setMinScore] = useState('');

    // Extended Filters
    const [stateFilter, setStateFilter] = useState('');
    const [cityFilter, setCityFilter] = useState('');
    const [regionFilter, setRegionFilter] = useState('');
    const [countryFilter, setCountryFilter] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');

    // Date Picker State
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [datePickerType, setDatePickerType] = useState('from'); // 'from' | 'to'

    // Picker Data
    const [availableRoles, setAvailableRoles] = useState([]);
    const [availableStores, setAvailableStores] = useState([]);
    const [availableStates, setAvailableStates] = useState([]);
    const [availableCities, setAvailableCities] = useState([]);
    const [availableRegions, setAvailableRegions] = useState([]);
    const [availableCountries, setAvailableCountries] = useState([]);
    const [availableCategories, setAvailableCategories] = useState([]);

    const [pickerVisible, setPickerVisible] = useState(false);
    const [pickerType, setPickerType] = useState('role'); // role, store, state, city, region, category, country
    const [pickerSearch, setPickerSearch] = useState('');

    // Subscription State
    const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
    const [subsLoading, setSubsLoading] = useState(false);
    const [subscriptions, setSubscriptions] = useState({});
    const [userEmail, setUserEmail] = useState('');

    useEffect(() => {
        const init = async () => {
            try {
                const email = await AsyncStorage.getItem('userEmail');
                if (email) {
                    setUserEmail(email);
                    fetchSubscriptions(email);
                }
            } catch (e) { console.error(e); }
        };
        init();
    }, []);

    useEffect(() => {
        loadFilterOptions();
        fetchOverviewData();
    }, []);

    const loadFilterOptions = async () => {
        try {
            // Fetch comprehensive filter options
            const response = await fetch(`${API_URL}/api/v1/reports/filters`);
            const data = await response.json();

            if (data) {
                // Formatting for picker (needs id/name)
                const formatOptions = (list) => list.map(item => ({ id: item, name: item }));

                setAvailableRoles(formatOptions(data.roles || []));
                setAvailableStores(formatOptions(data.stores || []));
                setAvailableCategories(formatOptions(data.categories || []));
                setAvailableStates(formatOptions(data.states || []));
                setAvailableRegions(formatOptions(data.regions || []));
                setAvailableCities(formatOptions(data.cities || []));
                setAvailableCountries(formatOptions(data.countries || []));
            }
        } catch (error) {
            console.error('Error loading filter options:', error);
        }
    };

    const fetchSubscriptions = async (email) => {
        try {
            const response = await fetch(`${API_URL}/api/v1/reports/subscriptions?user_email=${email}`);
            if (response.ok) {
                const data = await response.json();
                const divMap = {};
                data.forEach(sub => {
                    divMap[sub.report_type] = {
                        isActive: true, // Only active ones returned or check sub.is_active
                        day: sub.day_of_week || 'Monday',
                        time: sub.time_of_day || '09:00'
                    };
                });
                setSubscriptions(divMap);
            }
        } catch (error) { console.error('Error fetching subscriptions:', error); }
    };

    const toggleSubscription = (reportId) => {
        setSubscriptions(prev => {
            const current = prev[reportId];
            if (current && current.isActive) {
                // If active, deactivate (remove or set isActive false - simplest is remove/toggle)
                const newState = { ...prev };
                delete newState[reportId];
                return newState;
            } else {
                // Activate with defaults
                return {
                    ...prev,
                    [reportId]: { isActive: true, day: 'Monday', time: '09:00' }
                };
            }
        });
    };

    const updateSubscriptionDetail = (reportId, field, value) => {
        setSubscriptions(prev => ({
            ...prev,
            [reportId]: {
                ...prev[reportId],
                [field]: value
            }
        }));
    };

    const saveSubscriptions = async () => {
        setSubsLoading(true);
        try {
            // Build list of active subscriptions
            const subList = [];
            // Iterate all available categories to see which are checked
            REPORT_CATEGORIES.forEach(cat => {
                const sub = subscriptions[cat.id];
                if (sub && sub.isActive) {
                    subList.push({
                        report_type: cat.id,
                        frequency: 'weekly',
                        day_of_week: sub.day,
                        time_of_day: sub.time,
                        format: 'pdf',
                        is_active: true
                    });
                }
            });

            const response = await fetch(`${API_URL}/api/v1/reports/subscriptions?user_email=${userEmail}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subscriptions: subList })
            });

            if (response.ok) {
                Alert.alert('Success', 'Weekly report subscriptions updated!');
                setShowSubscriptionModal(false);
            } else {
                Alert.alert('Error', 'Failed to update subscriptions');
            }
        } catch (error) {
            console.error('Error updating subscriptions:', error);
            Alert.alert('Error', 'Network error');
        } finally {
            setSubsLoading(false);
        }
    };

    useEffect(() => {
        loadFilterOptions();
        fetchOverviewData();
    }, []);

    // Fetch report data when category changes
    useEffect(() => {
        if (selectedCategory) {
            fetchReportData(selectedCategory);
        }
    }, [selectedCategory]);

    const fetchOverviewData = async () => {
        try {
            const response = await fetch(`${API_URL}/api/v1/reports/overview`);
            if (response.ok) {
                const data = await response.json();
                setOverviewData(data);
            }
        } catch (error) {
            console.error('Error fetching overview:', error);
        }
    };

    const fetchReportData = async (category) => {
        const categoryInfo = REPORT_CATEGORIES.find(c => c.id === category);
        if (!categoryInfo) return;

        setLoading(true);
        try {
            // Build query parameters with filters
            const params = new URLSearchParams();
            if (dateFrom) params.append('date_from', dateFrom);
            if (dateTo) params.append('date_to', dateTo);
            if (roleFilter) params.append('role_filter', roleFilter);
            if (storeFilter) params.append('store_filter', storeFilter);
            if (bucketFilter) params.append('bucket_filter', bucketFilter);
            if (searchQuery) params.append('search', searchQuery);
            if (minScore) params.append('min_score', minScore);

            // New filters
            if (stateFilter) params.append('state', stateFilter);
            if (cityFilter) params.append('city', cityFilter);
            if (regionFilter) params.append('region', regionFilter);
            if (countryFilter) params.append('country', countryFilter);
            if (categoryFilter) params.append('category', categoryFilter);

            const url = `${API_URL}${categoryInfo.endpoint}${params.toString() ? '?' + params.toString() : ''}`;
            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                setReportData(data);
            } else {
                setReportData(null);
            }
        } catch (error) {
            console.error('Error fetching report:', error);
            setReportData(null);
        } finally {
            setLoading(false);
        }
    };

    const handleDownloadCSV = async (category) => {
        const categoryInfo = REPORT_CATEGORIES.find(c => c.id === category);
        if (!categoryInfo?.downloadEndpoint) {
            Alert.alert('Info', 'CSV download not available for this report type');
            return;
        }

        setDownloading(true);
        try {
            // Build query parameters with filters
            const params = new URLSearchParams();
            if (dateFrom) params.append('date_from', dateFrom);
            if (dateTo) params.append('date_to', dateTo);
            if (roleFilter) params.append('role_filter', roleFilter);
            if (storeFilter) params.append('store_filter', storeFilter);
            if (bucketFilter) params.append('bucket_filter', bucketFilter);

            if (searchQuery) params.append('search', searchQuery);
            if (minScore) params.append('min_score', minScore);

            // Location & Category Filters
            if (stateFilter) params.append('state', stateFilter);
            if (cityFilter) params.append('city', cityFilter);
            if (regionFilter) params.append('region', regionFilter);
            if (countryFilter) params.append('country', countryFilter);
            if (categoryFilter) params.append('category', categoryFilter);

            const downloadUrl = `${API_URL}${categoryInfo.downloadEndpoint}${params.toString() ? '?' + params.toString() : ''}`;

            if (isWeb) {
                // On web, use fetch and blob to trigger actual file download
                try {
                    const response = await fetch(downloadUrl);
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.style.display = 'none';
                    a.href = url;
                    // Get filename from content-disposition header or use default
                    const contentDisposition = response.headers.get('content-disposition');
                    let filename = `${category}_report.csv`;
                    if (contentDisposition) {
                        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
                        if (filenameMatch && filenameMatch[1]) {
                            filename = filenameMatch[1].replace(/['"]/g, '');
                        }
                    }
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                    Alert.alert('Success', 'CSV report downloaded successfully');
                } catch (fetchError) {
                    console.error('Fetch error, falling back to window.open:', fetchError);
                    window.open(downloadUrl, '_blank');
                    Alert.alert('Success', 'CSV report opened in new tab');
                }
            } else {
                // On mobile, use Linking
                await Linking.openURL(downloadUrl);
                Alert.alert('Success', 'CSV report download initiated');
            }
        } catch (error) {
            console.error('CSV Download failed:', error);
            Alert.alert('Error', 'Failed to download CSV report');
        } finally {
            setDownloading(false);
        }
    };

    const handleDownloadPDF = async (category) => {
        const categoryInfo = REPORT_CATEGORIES.find(c => c.id === category);
        if (!categoryInfo?.pdfEndpoint) {
            Alert.alert('Info', 'PDF download not available for this report type');
            return;
        }

        setDownloading(true);
        try {
            // Build query parameters with filters
            const params = new URLSearchParams();
            if (dateFrom) params.append('date_from', dateFrom);
            if (dateTo) params.append('date_to', dateTo);
            if (roleFilter) params.append('role_filter', roleFilter);
            if (storeFilter) params.append('store_filter', storeFilter);
            if (bucketFilter) params.append('bucket_filter', bucketFilter);

            if (searchQuery) params.append('search', searchQuery);
            if (minScore) params.append('min_score', minScore);

            // Location & Category Filters
            if (stateFilter) params.append('state', stateFilter);
            if (cityFilter) params.append('city', cityFilter);
            if (regionFilter) params.append('region', regionFilter);
            if (countryFilter) params.append('country', countryFilter);
            if (categoryFilter) params.append('category', categoryFilter);

            const downloadUrl = `${API_URL}${categoryInfo.pdfEndpoint}${params.toString() ? '?' + params.toString() : ''}`;

            if (isWeb) {
                // On web, use fetch and blob to trigger actual file download
                try {
                    const response = await fetch(downloadUrl);
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.style.display = 'none';
                    a.href = url;
                    // Get filename from content-disposition header or use default
                    const contentDisposition = response.headers.get('content-disposition');
                    let filename = `${category}_report.pdf`;
                    if (contentDisposition) {
                        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
                        if (filenameMatch && filenameMatch[1]) {
                            filename = filenameMatch[1].replace(/['"]/g, '');
                        }
                    }
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                    Alert.alert('Success', 'PDF report downloaded successfully');
                } catch (fetchError) {
                    console.error('Fetch error, falling back to window.open:', fetchError);
                    // Fallback to window.open if fetch fails
                    window.open(downloadUrl, '_blank');
                    Alert.alert('Success', 'PDF report opened in new tab');
                }
            } else {
                // On mobile, use Linking
                await Linking.openURL(downloadUrl);
                Alert.alert('Success', 'PDF report with insights downloaded');
            }
        } catch (error) {
            console.error('PDF Download failed:', error);
            Alert.alert('Error', 'Failed to download PDF report');
        } finally {
            setDownloading(false);
        }
    };

    // Render overview stats cards
    const renderOverviewStats = () => {
        if (!overviewData?.summary) return null;

        const stats = [
            { label: 'Total Users', value: overviewData.summary.total_users || 0, icon: 'users', color: '#3B82F6' },
            { label: 'Active (30d)', value: overviewData.summary.active_users_30d || 0, icon: 'activity', color: '#10B981' },
            { label: 'Courses Completed', value: overviewData.summary.total_completions || 0, icon: 'award', color: '#F59E0B' },
            { label: 'Avg Score', value: `${overviewData.summary.avg_score || 0}%`, icon: 'trending-up', color: '#8B5CF6' },
        ];

        return (
            <Animated.View entering={FadeInDown.delay(200)} style={styles.statsContainer}>
                {stats.map((stat, index) => (
                    <View key={index} style={styles.statCard}>
                        <View style={[styles.statIcon, { backgroundColor: `${stat.color}20` }]}>
                            <Feather name={stat.icon} size={20} color={stat.color} />
                        </View>
                        <Text style={[styles.statValue, { color: stat.color }]}>{stat.value}</Text>
                        <Text style={styles.statLabel}>{stat.label}</Text>
                    </View>
                ))}
            </Animated.View>
        );
    };

    // Clear all filters
    const handleClearFilters = () => {
        setDateFrom('');
        setDateTo('');
        setRoleFilter('');
        setStoreFilter('');
        setBucketFilter('');
        setSearchQuery('');
        setMinScore('');
        setStateFilter('');
        setCityFilter('');
        setRegionFilter('');
        setCountryFilter('');
        setCategoryFilter('');
    };

    // Apply filters
    const handleApplyFilters = () => {
        fetchReportData(selectedCategory);
        setShowFilters(false);
    };

    // Render filter panel
    const renderFilterPanel = () => {
        if (!showFilters) return null;

        return (
            <Animated.View entering={FadeInDown} style={styles.filterPanel}>
                <View style={styles.filterHeader}>
                    <Text style={styles.filterTitle}>Filter Reports</Text>
                    <TouchableOpacity onPress={() => setShowFilters(false)}>
                        <Feather name="x" size={24} color="#6B7280" />
                    </TouchableOpacity>
                </View>

                {/* Compact Grid Layout for Filters */}

                {/* Row 1: Search & Score (Full Width & Small Input) */}
                <View style={[styles.filterRow, { marginBottom: 12 }]}>
                    <View style={{ flex: 2 }}>
                        <Text style={styles.filterLabel}>Search</Text>
                        <TextInput
                            style={styles.compactInput}
                            placeholder="Name, Email, etc..."
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            placeholderTextColor="#9CA3AF"
                        />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.filterLabel}>Min Score %</Text>
                        <TextInput
                            style={styles.compactInput}
                            placeholder="80"
                            value={minScore}
                            onChangeText={(text) => setMinScore(text.replace(/[^0-9]/g, ''))}
                            keyboardType="numeric"
                            placeholderTextColor="#9CA3AF"
                            maxLength={3}
                        />
                    </View>
                </View>

                {/* Row 2: Dates (Half & Half) */}
                <View style={[styles.filterRow, { marginBottom: 12 }]}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.filterLabel}>From Date</Text>
                        <TouchableOpacity
                            style={styles.compactSelectBtn}
                            onPress={() => { setDatePickerType('from'); setShowDatePicker(true); }}
                        >
                            <Text style={[styles.compactSelectBtnText, !dateFrom && { color: '#9CA3AF' }]}>
                                {dateFrom || 'YYYY-MM-DD'}
                            </Text>
                            <Feather name="calendar" size={14} color="#6B7280" />
                        </TouchableOpacity>
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.filterLabel}>To Date</Text>
                        <TouchableOpacity
                            style={styles.compactSelectBtn}
                            onPress={() => { setDatePickerType('to'); setShowDatePicker(true); }}
                        >
                            <Text style={[styles.compactSelectBtnText, !dateTo && { color: '#9CA3AF' }]}>
                                {dateTo || 'YYYY-MM-DD'}
                            </Text>
                            <Feather name="calendar" size={14} color="#6B7280" />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Row 3: Location Filters (2 Rows of 2) */}
                {['users', 'attendance', 'stores'].includes(selectedCategory) && (
                    <>
                        <View style={[styles.filterRow, { marginBottom: 12 }]}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.filterLabel}>Country</Text>
                                <TouchableOpacity
                                    style={styles.compactSelectBtn}
                                    onPress={() => { setPickerType('country'); setPickerSearch(''); setPickerVisible(true); }}
                                >
                                    <Text numberOfLines={1} style={[styles.compactSelectBtnText, !countryFilter && styles.placeholderText]}>
                                        {countryFilter || 'All'}
                                    </Text>
                                    <Feather name="chevron-down" size={14} color="#6B7280" />
                                </TouchableOpacity>
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.filterLabel}>State</Text>
                                <TouchableOpacity
                                    style={styles.compactSelectBtn}
                                    onPress={() => { setPickerType('state'); setPickerSearch(''); setPickerVisible(true); }}
                                >
                                    <Text numberOfLines={1} style={[styles.compactSelectBtnText, !stateFilter && styles.placeholderText]}>
                                        {stateFilter || 'All'}
                                    </Text>
                                    <Feather name="chevron-down" size={14} color="#6B7280" />
                                </TouchableOpacity>
                            </View>
                        </View>
                        <View style={[styles.filterRow, { marginBottom: 12 }]}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.filterLabel}>Region</Text>
                                <TouchableOpacity
                                    style={styles.compactSelectBtn}
                                    onPress={() => { setPickerType('region'); setPickerSearch(''); setPickerVisible(true); }}
                                >
                                    <Text numberOfLines={1} style={[styles.compactSelectBtnText, !regionFilter && styles.placeholderText]}>
                                        {regionFilter || 'All'}
                                    </Text>
                                    <Feather name="chevron-down" size={14} color="#6B7280" />
                                </TouchableOpacity>
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.filterLabel}>City</Text>
                                <TouchableOpacity
                                    style={styles.compactSelectBtn}
                                    onPress={() => { setPickerType('city'); setPickerSearch(''); setPickerVisible(true); }}
                                >
                                    <Text numberOfLines={1} style={[styles.compactSelectBtnText, !cityFilter && styles.placeholderText]}>
                                        {cityFilter || 'All'}
                                    </Text>
                                    <Feather name="chevron-down" size={14} color="#6B7280" />
                                </TouchableOpacity>
                            </View>
                        </View>
                    </>
                )}

                {/* Row 4: Details (Role, Store, Category) */}
                {['users', 'attendance'].includes(selectedCategory) && (
                    <View style={[styles.filterRow, { marginBottom: 12 }]}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.filterLabel}>Role</Text>
                            <TouchableOpacity
                                style={styles.compactSelectBtn}
                                onPress={() => { setPickerType('role'); setPickerSearch(''); setPickerVisible(true); }}
                            >
                                <Text numberOfLines={1} style={[styles.compactSelectBtnText, !roleFilter && styles.placeholderText]}>
                                    {roleFilter || 'All'}
                                </Text>
                                <Feather name="chevron-down" size={14} color="#6B7280" />
                            </TouchableOpacity>
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.filterLabel}>Store</Text>
                            <TouchableOpacity
                                style={styles.compactSelectBtn}
                                onPress={() => { setPickerType('store'); setPickerSearch(''); setPickerVisible(true); }}
                            >
                                <Text numberOfLines={1} style={[styles.compactSelectBtnText, !storeFilter && styles.placeholderText]}>
                                    {storeFilter || 'All'}
                                </Text>
                                <Feather name="chevron-down" size={14} color="#6B7280" />
                            </TouchableOpacity>
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.filterLabel}>Type</Text>
                            <TouchableOpacity
                                style={styles.compactSelectBtn}
                                onPress={() => { setPickerType('category'); setPickerSearch(''); setPickerVisible(true); }}
                            >
                                <Text numberOfLines={1} style={[styles.compactSelectBtnText, !categoryFilter && styles.placeholderText]}>
                                    {categoryFilter || 'All'}
                                </Text>
                                <Feather name="chevron-down" size={14} color="#6B7280" />
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                {/* Action Buttons */}
                <View style={styles.filterActions}>
                    <TouchableOpacity
                        style={styles.filterClearBtn}
                        onPress={handleClearFilters}
                    >
                        <Text style={styles.filterClearText}>Clear All</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.filterApplyBtn}
                        onPress={handleApplyFilters}
                    >
                        <Text style={styles.filterApplyText}>Apply Filters</Text>
                    </TouchableOpacity>
                </View>
            </Animated.View>
        );
    };

    // Render subscription modal
    const renderSubscriptionModal = () => (
        <Modal
            visible={showSubscriptionModal}
            transparent
            animationType="fade"
            onRequestClose={() => setShowSubscriptionModal(false)}
        >
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <View style={styles.modalHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <MaterialCommunityIcons name="email-fast-outline" size={28} color="#F59E0B" />
                            <Text style={styles.modalTitle}>Weekly Email Reports</Text>
                        </View>
                        <TouchableOpacity onPress={() => setShowSubscriptionModal(false)}>
                            <Feather name="x" size={24} color="#6B7280" />
                        </TouchableOpacity>
                    </View>
                    <Text style={styles.modalSubtitle}>
                        Select reports you want to receive every Monday morning via email.
                    </Text>

                    <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                        {REPORT_CATEGORIES.map(cat => (
                            <View key={cat.id} style={styles.subItem}>
                                <View style={styles.subRow}>
                                    <View style={styles.subInfo}>
                                        <View style={styles.subRowHeader}>
                                            <View style={[styles.miniIcon, { backgroundColor: cat.color + '20' }]}>
                                                <Feather name={cat.icon} size={14} color={cat.color} />
                                            </View>
                                            <Text style={styles.subName}>{cat.name}</Text>
                                        </View>
                                        <Text style={styles.subDesc}>{cat.description}</Text>
                                    </View>
                                    <Switch
                                        value={subscriptions[cat.id]?.isActive || false}
                                        onValueChange={() => toggleSubscription(cat.id)}
                                        trackColor={{ false: '#D1D5DB', true: '#FCD34D' }}
                                        thumbColor={subscriptions[cat.id]?.isActive ? '#F59E0B' : '#F3F4F6'}
                                    />
                                </View>

                                {subscriptions[cat.id]?.isActive && (
                                    <Animated.View entering={FadeInDown} style={styles.subConfig}>
                                        <View style={styles.configItem}>
                                            <Text style={styles.configLabel}>Day</Text>
                                            <View style={styles.daysRow}>
                                                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(d => {
                                                    const fullDay = d === 'Mon' ? 'Monday' : d === 'Tue' ? 'Tuesday' : d === 'Wed' ? 'Wednesday' : d === 'Thu' ? 'Thursday' : 'Friday';
                                                    const isSelected = subscriptions[cat.id].day === fullDay;
                                                    return (
                                                        <TouchableOpacity
                                                            key={d}
                                                            style={[styles.dayChip, isSelected && styles.dayChipActive]}
                                                            onPress={() => updateSubscriptionDetail(cat.id, 'day', fullDay)}
                                                        >
                                                            <Text style={[styles.dayChipText, isSelected && styles.dayChipTextActive]}>{d}</Text>
                                                        </TouchableOpacity>
                                                    );
                                                })}
                                            </View>
                                        </View>

                                        <View style={styles.configItem}>
                                            <Text style={styles.configLabel}>Time (24h)</Text>
                                            <TextInput
                                                style={styles.timeInput}
                                                value={subscriptions[cat.id].time}
                                                onChangeText={(t) => updateSubscriptionDetail(cat.id, 'time', t)}
                                                placeholder="09:00"
                                                maxLength={5}
                                            />
                                            <Text style={styles.timeHint}>e.g. 09:00, 14:30</Text>
                                        </View>
                                    </Animated.View>
                                )}
                            </View>
                        ))}
                    </ScrollView>

                    <View style={styles.modalFooter}>
                        <TouchableOpacity
                            style={styles.btnCancel}
                            onPress={() => setShowSubscriptionModal(false)}
                        >
                            <Text style={styles.btnCancelText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.btnSave}
                            onPress={saveSubscriptions}
                            disabled={subsLoading}
                        >
                            {subsLoading ? (
                                <ActivityIndicator size="small" color="#FFF" />
                            ) : (
                                <Text style={styles.btnSaveText}>Save Preferences</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );

    // Render picker modal for Role/Store selection
    const renderPickerModal = () => {
        let currentOptions = [];
        let currentFilterSetter = null;
        let placeholder = '';
        let currentFilterValue = '';

        switch (pickerType) {
            case 'role':
                currentOptions = availableRoles;
                currentFilterSetter = setRoleFilter;
                placeholder = 'Select Role';
                currentFilterValue = roleFilter;
                break;
            case 'store':
                currentOptions = availableStores;
                currentFilterSetter = setStoreFilter;
                placeholder = 'Select Store';
                currentFilterValue = storeFilter;
                break;
            case 'state':
                currentOptions = availableStates;
                currentFilterSetter = setStateFilter;
                placeholder = 'Select State';
                currentFilterValue = stateFilter;
                break;
            case 'city':
                currentOptions = availableCities;
                currentFilterSetter = setCityFilter;
                placeholder = 'Select City';
                currentFilterValue = cityFilter;
                break;
            case 'region':
                currentOptions = availableRegions;
                currentFilterSetter = setRegionFilter;
                placeholder = 'Select Region';
                currentFilterValue = regionFilter;
                break;
            case 'country':
                currentOptions = availableCountries;
                currentFilterSetter = setCountryFilter;
                placeholder = 'Select Country';
                currentFilterValue = countryFilter;
                break;
            case 'category':
                currentOptions = availableCategories;
                currentFilterSetter = setCategoryFilter;
                placeholder = 'Select Type';
                currentFilterValue = categoryFilter;
                break;
            default:
                return null;
        }

        const filteredOptions = currentOptions.filter(item =>
            item.name.toLowerCase().includes(pickerSearch.toLowerCase())
        );

        return (
            <Modal
                animationType="slide"
                transparent={true}
                visible={pickerVisible}
                onRequestClose={() => {
                    setPickerVisible(!pickerVisible);
                    setPickerSearch('');
                }}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>{placeholder}</Text>
                            <TouchableOpacity onPress={() => { setPickerVisible(false); setPickerSearch(''); }}>
                                <Feather name="x" size={24} color="#6B7280" />
                            </TouchableOpacity>
                        </View>
                        <View style={styles.modalBody}>
                            <View style={styles.pickerSearchBox}>
                                <Feather name="search" size={16} color="#9CA3AF" />
                                <TextInput
                                    style={styles.pickerSearchInput}
                                    placeholder="Search..."
                                    value={pickerSearch}
                                    onChangeText={setPickerSearch}
                                    autoCapitalize="none"
                                />
                            </View>
                            <FlatList
                                data={filteredOptions}
                                keyExtractor={(item) => item.id ? item.id.toString() : item.name}
                                renderItem={({ item }) => {
                                    const isSelected = currentFilterValue === item.name;
                                    return (
                                        <TouchableOpacity
                                            style={[styles.pickerItem, isSelected && styles.pickerItemActive]}
                                            onPress={() => {
                                                currentFilterSetter(item.name);
                                                setPickerVisible(false);
                                                setPickerSearch('');
                                            }}
                                        >
                                            <View style={styles.pickerSubText}>
                                                <Text style={[styles.pickerItemText, isSelected && styles.pickerItemTextActive]}>{item.name}</Text>
                                                {item.city && <Text style={styles.pickerSubText}>{item.city}</Text>}
                                            </View>
                                            {isSelected && <Feather name="check" size={16} color="#D97706" />}
                                        </TouchableOpacity>
                                    );
                                }}
                            />
                        </View>
                        <View style={styles.modalFooter}>
                            <TouchableOpacity style={styles.pickerClearBtn} onPress={() => {
                                currentFilterSetter('');
                                setPickerVisible(false);
                                setPickerSearch('');
                            }}>
                                <Text style={styles.pickerClearText}>Clear Filter</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.btnSave} onPress={() => setPickerVisible(false)}>
                                <Text style={styles.btnSaveText}>Done</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        );
    };

    // Render category tabs
    const renderCategoryTabs = () => (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tabsContainer}
            contentContainerStyle={styles.tabsContent}
        >
            {REPORT_CATEGORIES.map((category, index) => (
                <TouchableOpacity
                    key={category.id}
                    style={[
                        styles.categoryTab,
                        selectedCategory === category.id && [
                            styles.categoryTabActive,
                            { borderColor: category.color }
                        ]
                    ]}
                    onPress={() => setSelectedCategory(category.id)}
                >
                    <Feather
                        name={category.icon}
                        size={18}
                        color={selectedCategory === category.id ? category.color : '#6B7280'}
                    />
                    <Text
                        style={[
                            styles.categoryTabText,
                            selectedCategory === category.id && { color: category.color }
                        ]}
                    >
                        {category.name}
                    </Text>
                </TouchableOpacity>
            ))}
        </ScrollView>
    );

    // Render report content
    const renderReportContent = () => {
        if (loading) {
            return (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#F59E0B" />
                    <Text style={styles.loadingText}>Loading report data...</Text>
                </View>
            );
        }

        if (!reportData) {
            return (
                <View style={styles.emptyContainer}>
                    <Feather name="file-text" size={48} color="#D1D5DB" />
                    <Text style={styles.emptyText}>No data available</Text>
                </View>
            );
        }

        const categoryInfo = REPORT_CATEGORIES.find(c => c.id === selectedCategory);

        return (
            <View style={styles.reportContent}>
                {/* Report Header */}
                <View style={styles.reportHeader}>
                    <View>
                        <Text style={styles.reportTitle}>{categoryInfo?.name}</Text>
                        <Text style={styles.reportDescription}>{categoryInfo?.description}</Text>
                        {reportData.generated_at && (
                            <Text style={styles.generatedAt}>
                                Generated: {new Date(reportData.generated_at).toLocaleString()}
                            </Text>
                        )}
                    </View>
                    <View style={styles.downloadButtonsRow}>
                        {/* PDF Download Button - Primary (with insights) */}
                        {categoryInfo?.pdfEndpoint && (
                            <TouchableOpacity
                                style={[styles.downloadBtn, styles.pdfBtn]}
                                onPress={() => handleDownloadPDF(selectedCategory)}
                                disabled={downloading}
                            >
                                {downloading ? (
                                    <ActivityIndicator size="small" color="#FFF" />
                                ) : (
                                    <>
                                        <Feather name="file-text" size={16} color="#FFF" />
                                        <Text style={styles.downloadBtnText}>PDF</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        )}
                        {/* CSV Download Button */}
                        {categoryInfo?.downloadEndpoint && (
                            <TouchableOpacity
                                style={[styles.downloadBtn, { backgroundColor: categoryInfo.color }]}
                                onPress={() => handleDownloadCSV(selectedCategory)}
                                disabled={downloading}
                            >
                                {downloading ? (
                                    <ActivityIndicator size="small" color="#FFF" />
                                ) : (
                                    <>
                                        <Feather name="download" size={16} color="#FFF" />
                                        <Text style={styles.downloadBtnText}>CSV</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                {/* Summary Section */}
                {reportData.summary && typeof reportData.summary === 'object' && (
                    <View style={styles.summarySection}>
                        <Text style={styles.sectionTitle}>Summary</Text>
                        <View style={styles.summaryGrid}>
                            {Object.entries(reportData.summary).map(([key, value]) => {
                                // Convert value to displayable string
                                let displayValue;
                                if (typeof value === 'object' && value !== null) {
                                    // Skip nested objects in summary display
                                    return null;
                                } else if (typeof value === 'number') {
                                    displayValue = value.toLocaleString();
                                } else if (value === null || value === undefined) {
                                    displayValue = '-';
                                } else {
                                    displayValue = String(value);
                                }
                                return (
                                    <View key={key} style={styles.summaryItem}>
                                        <Text style={styles.summaryValue}>
                                            {displayValue}
                                        </Text>
                                        <Text style={styles.summaryLabel}>
                                            {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                        </Text>
                                    </View>
                                );
                            })}
                        </View>
                    </View>
                )}

                {/* Data Table */}
                {renderDataTable()}

                {/* Additional Sections */}
                {renderAdditionalSections()}
            </View>
        );
    };

    // Render data table based on report type
    const renderDataTable = () => {
        let data = [];
        let columns = [];

        switch (selectedCategory) {
            case 'users':
                data = reportData.users || [];
                columns = [
                    { key: 'name', label: 'Name', width: 120 },
                    { key: 'role', label: 'Role', width: 80 },
                    { key: 'store', label: 'Store', width: 100 },
                    { key: 'courses_completed', label: 'Courses', width: 70 },
                    { key: 'avg_course_score', label: 'Avg Score', width: 80 },
                    { key: 'total_xp', label: 'XP', width: 60 },
                ];
                break;
            case 'training':
                data = reportData.courses || [];
                columns = [
                    { key: 'title', label: 'Course', width: 150 },
                    { key: 'bucket', label: 'Category', width: 100 },
                    { key: 'total_completions', label: 'Completions', width: 90 },
                    { key: 'avg_score_percent', label: 'Avg Score', width: 80 },
                    { key: 'pass_rate', label: 'Pass Rate', width: 80 },
                ];
                break;
            case 'quizzes':
                data = reportData.quizzes || [];
                columns = [
                    { key: 'topic', label: 'Quiz Topic', width: 150 },
                    { key: 'total_attempts', label: 'Attempts', width: 80 },
                    { key: 'avg_score', label: 'Avg Score', width: 80 },
                    { key: 'pass_rate', label: 'Pass Rate', width: 80 },
                ];
                break;
            case 'assessments':
                data = reportData.assessments || [];
                columns = [
                    { key: 'title', label: 'Assessment', width: 150 },
                    { key: 'total_attempts', label: 'Attempts', width: 80 },
                    { key: 'avg_score', label: 'Avg Score', width: 80 },
                    { key: 'pass_rate', label: 'Pass Rate', width: 80 },
                ];
                break;
            case 'attendance':
                data = reportData.attendance || [];
                columns = [
                    { key: 'user_name', label: 'User', width: 120 },
                    { key: 'total_sessions', label: 'Sessions', width: 80 },
                    { key: 'total_hours', label: 'Hours', width: 70 },
                    { key: 'avg_session_minutes', label: 'Avg Session', width: 90 },
                ];
                break;
            case 'stores':
                data = reportData.stores || [];
                columns = [
                    { key: 'store_name', label: 'Store', width: 120 },
                    { key: 'total_users', label: 'Users', width: 70 },
                    { key: 'total_completions', label: 'Completions', width: 90 },
                    { key: 'avg_score', label: 'Avg Score', width: 80 },
                ];
                break;
            case 'simulations':
                data = reportData.simulations || [];
                columns = [
                    { key: 'title', label: 'Simulation', width: 150 },
                    { key: 'total_attempts', label: 'Attempts', width: 80 },
                    { key: 'completion_rate', label: 'Completion', width: 90 },
                    { key: 'avg_score', label: 'Avg Score', width: 80 },
                ];
                break;
            case 'content':
                data = reportData.content || [];
                columns = [
                    { key: 'title', label: 'Content', width: 150 },
                    { key: 'type', label: 'Type', width: 80 },
                    { key: 'views', label: 'Views', width: 70 },
                    { key: 'avg_watch_time', label: 'Avg Watch', width: 90 },
                ];
                break;
            case 'executive':
                // Executive summary has a different layout
                return null;
            default:
                return null;
        }

        if (!data.length) {
            return (
                <View style={styles.emptyTable}>
                    <Text style={styles.emptyTableText}>No records found</Text>
                </View>
            );
        }

        return (
            <View style={styles.tableContainer}>
                <Text style={styles.sectionTitle}>Detailed Data</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                    <View>
                        {/* Table Header */}
                        <View style={styles.tableHeader}>
                            {columns.map((col) => (
                                <Text
                                    key={col.key}
                                    style={[styles.tableHeaderCell, { width: col.width }]}
                                >
                                    {col.label}
                                </Text>
                            ))}
                        </View>
                        {/* Table Body */}
                        {data.slice(0, 20).map((row, rowIndex) => (
                            <View
                                key={rowIndex}
                                style={[
                                    styles.tableRow,
                                    rowIndex % 2 === 0 && styles.tableRowAlt
                                ]}
                            >
                                {columns.map((col) => (
                                    <Text
                                        key={col.key}
                                        style={[styles.tableCell, { width: col.width }]}
                                        numberOfLines={1}
                                    >
                                        {row[col.key] ?? '-'}
                                    </Text>
                                ))}
                            </View>
                        ))}
                    </View>
                </ScrollView>
                {data.length > 20 && (
                    <Text style={styles.tableFooter}>
                        Showing 20 of {data.length} records. Download for full data.
                    </Text>
                )}
            </View>
        );
    };

    // Render additional sections based on report type
    const renderAdditionalSections = () => {
        switch (selectedCategory) {
            case 'quizzes':
                if (reportData.top_performers?.length) {
                    return (
                        <View style={styles.additionalSection}>
                            <Text style={styles.sectionTitle}>Top Performers</Text>
                            {reportData.top_performers.slice(0, 5).map((performer, index) => (
                                <View key={index} style={styles.performerRow}>
                                    <View style={styles.performerRank}>
                                        <Text style={styles.performerRankText}>#{index + 1}</Text>
                                    </View>
                                    <View style={styles.performerInfo}>
                                        <Text style={styles.performerName}>{performer.user_name}</Text>
                                        <Text style={styles.performerMeta}>
                                            {performer.quizzes_taken} quizzes taken
                                        </Text>
                                    </View>
                                    <Text style={styles.performerScore}>{performer.avg_score}%</Text>
                                </View>
                            ))}
                        </View>
                    );
                }
                break;
            case 'executive':
                return (
                    <View style={styles.executiveSection}>
                        {/* Summary */}
                        {reportData.summary && typeof reportData.summary === 'string' && (
                            <View style={styles.executiveSummary}>
                                <MaterialCommunityIcons name="robot" size={24} color="#6366F1" />
                                <Text style={styles.executiveSummaryText}>{reportData.summary}</Text>
                            </View>
                        )}

                        {/* Key Metrics */}
                        {reportData.key_metrics && typeof reportData.key_metrics === 'object' && (
                            <View style={styles.keyMetrics}>
                                <Text style={styles.sectionTitle}>Key Metrics</Text>
                                <View style={styles.metricsGrid}>
                                    {Object.entries(reportData.key_metrics).map(([key, value]) => {
                                        // Convert value to displayable string
                                        let displayValue = value;
                                        if (typeof value === 'object' && value !== null) {
                                            displayValue = JSON.stringify(value);
                                        } else if (typeof value === 'number') {
                                            displayValue = value.toLocaleString();
                                        } else if (value === null || value === undefined) {
                                            displayValue = '-';
                                        } else {
                                            displayValue = String(value);
                                        }
                                        return (
                                            <View key={key} style={styles.metricItem}>
                                                <Text style={styles.metricValue}>{displayValue}</Text>
                                                <Text style={styles.metricLabel}>
                                                    {key.replace(/_/g, ' ')}
                                                </Text>
                                            </View>
                                        );
                                    })}
                                </View>
                            </View>
                        )}

                        {/* Top Performers */}
                        {reportData.top_performers?.length > 0 && (
                            <View style={styles.topPerformersSection}>
                                <Text style={styles.sectionTitle}>Top Performers This Month</Text>
                                {reportData.top_performers.map((performer, index) => (
                                    <View key={index} style={styles.performerRow}>
                                        <View style={[styles.performerRank, { backgroundColor: '#FEF3C7' }]}>
                                            <Text style={styles.performerRankText}>#{index + 1}</Text>
                                        </View>
                                        <View style={styles.performerInfo}>
                                            <Text style={styles.performerName}>{performer.name || performer.user_name || 'Unknown'}</Text>
                                            <Text style={styles.performerMeta}>{performer.store || 'HQ'}</Text>
                                        </View>
                                        <Text style={styles.performerScore}>{performer.completions || 0} courses</Text>
                                    </View>
                                ))}
                            </View>
                        )}

                        {/* Recommendations */}
                        {reportData.recommendations?.length > 0 && (
                            <View style={styles.recommendationsSection}>
                                <Text style={styles.sectionTitle}>AI Recommendations</Text>
                                {reportData.recommendations.map((rec, index) => (
                                    <View key={index} style={styles.recommendationItem}>
                                        <View style={styles.recommendationIcon}>
                                            <Feather name="check-circle" size={16} color="#10B981" />
                                        </View>
                                        <Text style={styles.recommendationText}>{typeof rec === 'string' ? rec : JSON.stringify(rec)}</Text>
                                    </View>
                                ))}
                            </View>
                        )}
                    </View>
                );
            case 'training':
            case 'content':
                if (reportData.by_bucket?.length) {
                    return (
                        <View style={styles.additionalSection}>
                            <Text style={styles.sectionTitle}>By Category</Text>
                            {reportData.by_bucket.map((bucket, index) => (
                                <View key={index} style={styles.bucketRow}>
                                    <Text style={styles.bucketName}>{bucket.bucket}</Text>
                                    <View style={styles.bucketStats}>
                                        <Text style={styles.bucketStat}>{bucket.count} items</Text>
                                        <Text style={styles.bucketStat}>{bucket.completions} completions</Text>
                                    </View>
                                </View>
                            ))}
                        </View>
                    );
                }
                break;
        }
        return null;
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <LinearGradient
                colors={['#F59E0B', '#D97706']}
                style={styles.header}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
            >
                <View style={styles.headerContent}>
                    <TouchableOpacity
                        style={styles.backBtn}
                        onPress={() => navigation.goBack()}
                    >
                        <Feather name="arrow-left" size={24} color="#FFF" />
                    </TouchableOpacity>
                    <View>
                        <Text style={styles.headerTitle}>Reports & Analytics</Text>
                        <Text style={styles.headerSubtitle}>Comprehensive data insights</Text>
                    </View>
                </View>
            </LinearGradient>

            <ScrollView
                style={styles.content}
                showsVerticalScrollIndicator={false}
            >
                {/* Overview Stats */}
                {renderOverviewStats()}

                {/* Category Tabs */}
                {renderCategoryTabs()}

                {/* Filter & Subscription Buttons */}
                <View style={styles.filterButtonContainer}>
                    <TouchableOpacity
                        style={styles.filterButton}
                        onPress={() => setShowFilters(!showFilters)}
                    >
                        <Feather name="filter" size={16} color="#F59E0B" />
                        <Text style={styles.filterButtonText}>Filters</Text>
                        {(dateFrom || dateTo || roleFilter || storeFilter || bucketFilter) && (
                            <View style={styles.filterBadge}>
                                <Text style={styles.filterBadgeText}>•</Text>
                            </View>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.filterButton, { marginLeft: 12, borderColor: '#3B82F6' }]}
                        onPress={() => setShowSubscriptionModal(true)}
                    >
                        <Feather name="mail" size={16} color="#3B82F6" />
                        <Text style={[styles.filterButtonText, { color: '#3B82F6' }]}>Weekly Subscriptions</Text>
                    </TouchableOpacity>
                </View>

                {/* Filter Panel */}
                {renderFilterPanel()}

                {/* Subscription Modal */}
                {renderSubscriptionModal()}

                {/* Picker Modal */}
                {renderPickerModal()}

                {/* Report Content */}
                {renderReportContent()}

                {/* Date Picker Component */}
                {showDatePicker && (
                    <DateTimePicker
                        value={new Date()}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={(event, selectedDate) => {
                            setShowDatePicker(false);
                            if (selectedDate && event.type !== 'dismissed') {
                                const dateStr = selectedDate.toISOString().split('T')[0];
                                if (datePickerType === 'from') setDateFrom(dateStr);
                                else setDateTo(dateStr);
                            }
                        }}
                    />
                )}

                <View style={{ height: 40 }} />
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F3F4F6',
    },
    header: {
        paddingTop: Platform.OS === 'web' ? 20 : 10,
        paddingBottom: 20,
        paddingHorizontal: 16,
    },
    headerContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    headerTitle: {
        fontSize: 22,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
    },
    headerSubtitle: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        color: 'rgba(255,255,255,0.8)',
    },
    content: {
        flex: 1,
    },

    // OVERVIEW STATS
    statsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        padding: 16,
        gap: 12,
    },
    statCard: {
        flex: 1,
        minWidth: (width - 48) / 2 - 6,
        backgroundColor: '#FFF',
        borderRadius: 16,
        padding: 16,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    statIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    statValue: {
        fontSize: 20,
        fontFamily: 'Poppins_700Bold',
    },
    statLabel: {
        fontSize: 10,
        fontFamily: 'Poppins_500Medium',
        color: '#6B7280',
        textAlign: 'center',
        marginTop: 2,
    },

    // CATEGORY TABS
    tabsContainer: {
        marginTop: 20,
    },
    tabsContent: {
        paddingHorizontal: 16,
        gap: 10,
    },
    categoryTab: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: '#FFF',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        gap: 8,
        marginRight: 10,
    },
    categoryTabActive: {
        backgroundColor: '#FEF3C7',
        borderWidth: 2,
    },
    categoryTabText: {
        fontSize: 13,
        fontFamily: 'Poppins_500Medium',
        color: '#6B7280',
    },

    // REPORT CONTENT
    reportContent: {
        paddingHorizontal: 16,
        marginTop: 20,
    },
    reportHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 20,
    },
    reportTitle: {
        fontSize: 18,
        fontFamily: 'Poppins_700Bold',
        color: '#111827',
    },
    reportDescription: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
        marginTop: 2,
    },
    generatedAt: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        color: '#9CA3AF',
        marginTop: 4,
    },
    downloadBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 8,
        gap: 6,
    },
    downloadBtnText: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
    },
    downloadButtonsRow: {
        flexDirection: 'row',
        gap: 8,
        alignItems: 'center',
    },
    pdfBtn: {
        backgroundColor: '#DC2626',
    },

    // SUMMARY SECTION
    summarySection: {
        backgroundColor: '#FFF',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    sectionTitle: {
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
        color: '#111827',
        marginBottom: 12,
    },
    summaryGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    summaryItem: {
        minWidth: '45%',
        backgroundColor: '#F9FAFB',
        borderRadius: 10,
        padding: 12,
    },
    summaryValue: {
        fontSize: 18,
        fontFamily: 'Poppins_700Bold',
        color: '#F59E0B',
    },
    summaryLabel: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
        marginTop: 2,
    },

    // TABLE
    tableContainer: {
        backgroundColor: '#FFF',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    tableHeader: {
        flexDirection: 'row',
        backgroundColor: '#F3F4F6',
        borderRadius: 8,
        paddingVertical: 10,
        paddingHorizontal: 8,
    },
    tableHeaderCell: {
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
        color: '#374151',
        textAlign: 'left',
    },
    tableRow: {
        flexDirection: 'row',
        paddingVertical: 12,
        paddingHorizontal: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    tableRowAlt: {
        backgroundColor: '#FAFAFA',
    },
    tableCell: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#4B5563',
    },
    tableFooter: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        color: '#9CA3AF',
        textAlign: 'center',
        marginTop: 12,
    },
    emptyTable: {
        padding: 40,
        alignItems: 'center',
    },
    emptyTableText: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        color: '#9CA3AF',
    },
    datePickerBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#D1D5DB',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10, // Matching TextInput height roughly
        backgroundColor: '#F9FAFB',
        height: 48,
    },

    // LOADING & EMPTY
    loadingContainer: {
        padding: 60,
        alignItems: 'center',
    },
    loadingText: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
        marginTop: 12,
    },
    emptyContainer: {
        padding: 60,
        alignItems: 'center',
    },
    emptyText: {
        fontSize: 15,
        fontFamily: 'Poppins_400Regular',
        color: '#9CA3AF',
        marginTop: 12,
    },

    // ADDITIONAL SECTIONS
    additionalSection: {
        backgroundColor: '#FFF',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    performerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    performerRank: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#FEF3C7',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    performerRankText: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
        color: '#D97706',
    },
    performerInfo: {
        flex: 1,
    },
    performerName: {
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        color: '#111827',
    },
    performerMeta: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
    },
    performerScore: {
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
        color: '#10B981',
    },
    bucketRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    bucketName: {
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        color: '#111827',
    },
    bucketStats: {
        flexDirection: 'row',
        gap: 12,
    },
    bucketStat: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
    },

    // EXECUTIVE SECTION
    executiveSection: {
        marginBottom: 16,
    },
    executiveSummary: {
        flexDirection: 'row',
        backgroundColor: '#EEF2FF',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        gap: 12,
    },
    executiveSummaryText: {
        flex: 1,
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        color: '#4338CA',
        lineHeight: 22,
    },
    keyMetrics: {
        backgroundColor: '#FFF',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    metricsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    metricItem: {
        minWidth: '45%',
        backgroundColor: '#F9FAFB',
        borderRadius: 10,
        padding: 12,
    },
    metricValue: {
        fontSize: 20,
        fontFamily: 'Poppins_700Bold',
        color: '#F59E0B',
    },
    metricLabel: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
        marginTop: 2,
        textTransform: 'capitalize',
    },
    topPerformersSection: {
        backgroundColor: '#FFF',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    recommendationsSection: {
        backgroundColor: '#F0FDF4',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
    },
    recommendationItem: {
        flexDirection: 'row',
        marginBottom: 10,
        gap: 10,
    },
    recommendationIcon: {
        marginTop: 2,
    },
    recommendationText: {
        flex: 1,
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        color: '#166534',
        lineHeight: 20,
    },

    // FILTER STYLES
    filterButtonContainer: {
        paddingHorizontal: 16,
        marginTop: 16,
        flexDirection: 'row',
    },
    filterButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#F59E0B',
        alignSelf: 'flex-start',
        gap: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    filterButtonText: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#F59E0B',
    },
    filterBadge: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#EF4444',
        justifyContent: 'center',
        alignItems: 'center',
    },
    filterBadgeText: {
        fontSize: 20,
        color: '#FFF',
        fontFamily: 'Poppins_700Bold',
        lineHeight: 20,
    },
    filterPanel: {
        backgroundColor: '#FFF',
        marginHorizontal: 16,
        marginTop: 12,
        borderRadius: 16,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 5,
    },
    filterHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    filterTitle: {
        fontSize: 18,
        fontFamily: 'Poppins_700Bold',
        color: '#111827',
    },
    filterSection: {
        marginBottom: 16,
    },
    filterSectionTitle: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
        color: '#374151',
        marginBottom: 8,
    },
    filterRow: {
        flexDirection: 'row',
        gap: 12,
    },
    filterInputWrapper: {
        flex: 1,
    },
    filterLabel: {
        fontSize: 11,
        fontFamily: 'Poppins_500Medium',
        color: '#6B7280',
        marginBottom: 4,
    },
    filterInput: {
        backgroundColor: '#F9FAFB',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        color: '#111827',
    },
    filterActions: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 8,
    },
    filterClearBtn: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        alignItems: 'center',
        backgroundColor: '#FFF',
    },
    filterClearText: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#6B7280',
    },
    filterApplyBtn: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 10,
        backgroundColor: '#F59E0B',
        alignItems: 'center',
    },
    filterApplyText: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
    },

    // SUBSCRIPTION MODAL STYLES
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20
    },
    modalContent: {
        backgroundColor: '#FFF',
        borderRadius: 20,
        width: '100%',
        maxWidth: 500,
        maxHeight: '80%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 20,
        elevation: 10,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6'
    },
    modalTitle: {
        fontSize: 18,
        fontFamily: 'Poppins_700Bold',
        color: '#111827',
    },
    modalSubtitle: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 4
    },
    modalBody: {
        padding: 20
    },
    subItem: {
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
        paddingVertical: 12,
    },
    subRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
        gap: 12
    },
    subConfig: {
        marginTop: 8,
        padding: 12,
        backgroundColor: '#F9FAFB',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    configItem: {
        marginBottom: 12,
    },
    configLabel: {
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
        color: '#374151',
        marginBottom: 8,
    },
    daysRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    dayChip: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        backgroundColor: '#FFF',
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    dayChipActive: {
        backgroundColor: '#FDE68A',
        borderColor: '#F59E0B',
    },
    dayChipText: {
        fontSize: 11,
        fontFamily: 'Poppins_500Medium',
        color: '#6B7280',
    },
    dayChipTextActive: {
        color: '#92400E',
    },
    timeInput: {
        backgroundColor: '#FFF',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        color: '#111827',
        width: 100,
    },
    timeHint: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        color: '#9CA3AF',
        marginTop: 4,
    },
    subInfo: {
        flex: 1
    },
    subRowHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 4
    },
    miniIcon: {
        width: 24,
        height: 24,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center'
    },
    subName: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#111827'
    },
    subDesc: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280'
    },
    modalFooter: {
        flexDirection: 'row',
        padding: 20,
        borderTopWidth: 1,
        borderTopColor: '#F3F4F6',
        gap: 12
    },
    btnCancel: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        alignItems: 'center',
    },
    btnCancelText: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#6B7280'
    },
    btnSave: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 12,
        backgroundColor: '#F59E0B',
        alignItems: 'center',
        shadowColor: '#F59E0B',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4
    },
    btnSaveText: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF'
    },
    // Select Button Styles
    selectBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderWidth: 1,
        borderColor: '#D1D5DB',
        borderRadius: 8,
        paddingHorizontal: 12,
        height: 44,
        backgroundColor: '#F9FAFB',
    },
    selectBtnText: {
        color: '#1F2937',
        fontSize: 14,
    },
    placeholderText: {
        color: '#9CA3AF',
    },
    // Picker Modal Styles
    pickerSearchBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F3F4F6',
        borderRadius: 10,
        paddingHorizontal: 12,
        height: 40,
        marginBottom: 12,
        gap: 8,
    },
    pickerSearchInput: {
        flex: 1,
        fontSize: 14,
        color: '#1F2937',
    },
    pickerItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        paddingHorizontal: 4,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    pickerItemActive: {
        backgroundColor: '#FFFBEB',
    },
    pickerItemText: {
        fontSize: 14,
        color: '#374151',
    },
    pickerItemTextActive: {
        color: '#D97706',
        fontWeight: '600',
    },
    pickerSubText: {
        fontSize: 12,
        color: '#9CA3AF',
    },
    pickerClearBtn: {
        marginTop: 10,
        alignItems: 'center',
        paddingVertical: 10,
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
    },
    pickerClearText: {
        color: '#EF4444',
        fontSize: 14,
        fontWeight: '600',
    },
    // Compact Filter Styles
    compactInput: {
        backgroundColor: '#F9FAFB',
        borderWidth: 1,
        borderColor: '#D1D5DB',
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 8,
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        color: '#111827',
        height: 40,
    },
    compactSelectBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#F9FAFB',
        borderWidth: 1,
        borderColor: '#D1D5DB',
        borderRadius: 8,
        paddingHorizontal: 10,
        height: 40,
    },
    compactSelectBtnText: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#1F2937',
        flex: 1,
    },
});

export default AdminReports;
