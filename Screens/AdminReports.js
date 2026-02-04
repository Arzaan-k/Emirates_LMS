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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
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

    // Fetch overview data on mount
    useEffect(() => {
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
            const response = await fetch(`${API_URL}${categoryInfo.endpoint}`);
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
            const downloadUrl = `${API_URL}${categoryInfo.downloadEndpoint}`;

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
            const downloadUrl = `${API_URL}${categoryInfo.pdfEndpoint}`;

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

                {/* Report Content */}
                {renderReportContent()}

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
});

export default AdminReports;
