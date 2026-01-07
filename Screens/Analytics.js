import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Dimensions,
    Alert,
    ActivityIndicator,
    RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, { FadeInDown } from 'react-native-reanimated';
import API_URL from '../config';

const { width } = Dimensions.get('window');

const Analytics = ({ navigation }) => {
    const [userActivity, setUserActivity] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedTab, setSelectedTab] = useState('attendance'); // attendance | location | quizzes

    useEffect(() => {
        fetchUserActivity();
    }, []);

    const fetchUserActivity = async () => {
        try {
            setLoading(true);
            const response = await fetch(`${API_URL}/reports/user-activity`);
            const data = await response.json();
            setUserActivity(data);
        } catch (error) {
            console.error('Failed to fetch user activity:', error);
            Alert.alert('Error', 'Failed to load reports');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const onRefresh = () => {
        setRefreshing(true);
        fetchUserActivity();
    };

    // Calculate summary stats
    const totalEmployees = userActivity.length;
    const currentlyWorking = userActivity.filter(u => u.attendance_today?.is_working).length;
    const totalHoursToday = userActivity.reduce((sum, u) => sum + (u.attendance_today?.total_hours || 0), 0);
    const locationSharingCount = userActivity.filter(u => u.location_sharing).length;

    if (loading) {
        return (
            <SafeAreaView style={styles.container} edges={['top']}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#F59E0B" />
                    <Text style={styles.loadingText}>Loading Reports...</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            {/* GRADIENT BACKGROUND */}
            <LinearGradient
                colors={['#FFFBEB', '#FFF7ED', '#FFFFFF']}
                style={StyleSheet.absoluteFill}
            />

            {/* HEADER */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Feather name="arrow-left" size={24} color="#111827" />
                </TouchableOpacity>

                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle}>Team Reports</Text>
                    <Text style={styles.headerSubtitle}>Real-time Activity Dashboard</Text>
                </View>

                <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn}>
                    <Feather name="refresh-cw" size={20} color="#F59E0B" />
                </TouchableOpacity>
            </View>

            {/* SUMMARY CARDS */}
            <ScrollView
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#F59E0B" />}
            >
                <View style={styles.summaryContainer}>
                    {/* Working Now */}
                    <Animated.View entering={FadeInDown.delay(0)} style={[styles.summaryCard, styles.workingCard]}>
                        <View style={styles.summaryIcon}>
                            <Feather name="users" size={24} color="#10B981" />
                        </View>
                        <Text style={[styles.summaryValue, { color: '#10B981' }]}>{currentlyWorking}</Text>
                        <Text style={styles.summaryLabel}>Working Now</Text>
                    </Animated.View>

                    {/* Total Hours */}
                    <Animated.View entering={FadeInDown.delay(100)} style={[styles.summaryCard, styles.hoursCard]}>
                        <View style={styles.summaryIcon}>
                            <Feather name="clock" size={24} color="#F59E0B" />
                        </View>
                        <Text style={[styles.summaryValue, { color: '#F59E0B' }]}>{totalHoursToday.toFixed(1)}</Text>
                        <Text style={styles.summaryLabel}>Hours Today</Text>
                    </Animated.View>

                    {/* Location Sharing */}
                    <Animated.View entering={FadeInDown.delay(200)} style={[styles.summaryCard, styles.locationCard]}>
                        <View style={styles.summaryIcon}>
                            <Feather name="map-pin" size={24} color="#3B82F6" />
                        </View>
                        <Text style={[styles.summaryValue, { color: '#3B82F6' }]}>{locationSharingCount}</Text>
                        <Text style={styles.summaryLabel}>Sharing Location</Text>
                    </Animated.View>
                </View>

                {/* TAB SELECTOR */}
                <View style={styles.tabContainer}>
                    <TouchableOpacity
                        style={[styles.tab, selectedTab === 'attendance' && styles.tabActive]}
                        onPress={() => setSelectedTab('attendance')}
                    >
                        <Feather
                            name="clock"
                            size={18}
                            color={selectedTab === 'attendance' ? '#F59E0B' : '#6B7280'}
                        />
                        <Text style={[
                            styles.tabText,
                            selectedTab === 'attendance' && styles.tabTextActive
                        ]}>Attendance</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.tab, selectedTab === 'location' && styles.tabActive]}
                        onPress={() => setSelectedTab('location')}
                    >
                        <Feather
                            name="map-pin"
                            size={18}
                            color={selectedTab === 'location' ? '#F59E0B' : '#6B7280'}
                        />
                        <Text style={[
                            styles.tabText,
                            selectedTab === 'location' && styles.tabTextActive
                        ]}>Location</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.tab, selectedTab === 'quizzes' && styles.tabActive]}
                        onPress={() => setSelectedTab('quizzes')}
                    >
                        <Feather
                            name="award"
                            size={18}
                            color={selectedTab === 'quizzes' ? '#F59E0B' : '#6B7280'}
                        />
                        <Text style={[
                            styles.tabText,
                            selectedTab === 'quizzes' && styles.tabTextActive
                        ]}>Quizzes</Text>
                    </TouchableOpacity>
                </View>

                {/* EMPLOYEE CARDS */}
                <View style={styles.employeeList}>
                    {userActivity.map((employee, index) => (
                        <Animated.View
                            key={employee.user_id}
                            entering={FadeInDown.delay(index * 50)}
                        >
                            <EmployeeCard employee={employee} selectedTab={selectedTab} />
                        </Animated.View>
                    ))}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

// EMPLOYEE CARD COMPONENT
const EmployeeCard = ({ employee, selectedTab }) => {
    const isWorking = employee.attendance_today?.is_working;
    const totalHours = employee.attendance_today?.total_hours || 0;
    const punchRecords = employee.attendance_today?.punch_records || [];

    // Safe avatar generation
    const getInitials = (name) => {
        if (!name) return '??';
        return name.split(' ').map(n => n[0]).join('').toUpperCase();
    };

    return (
        <View style={styles.employeeCard}>
            {/* HEADER */}
            <View style={styles.empHeader}>
                <View style={styles.empAvatar}>
                    <Text style={styles.empAvatarText}>
                        {getInitials(employee.name)}
                    </Text>
                </View>
                <View style={styles.empInfo}>
                    <Text style={styles.empName}>{employee.name || 'Unknown User'}</Text>
                    <Text style={styles.empRole}>{employee.role || 'Employee'}</Text>
                </View>
                {isWorking && (
                    <View style={styles.workingBadge}>
                        <View style={styles.pulseDot} />
                        <Text style={styles.workingText}>Working</Text>
                    </View>
                )}
            </View>

            {/* TAB CONTENT */}
            {selectedTab === 'attendance' && (
                <View style={styles.tabContent}>
                    <View style={styles.statRow}>
                        <Feather name="clock" size={16} color="#F59E0B" />
                        <Text style={styles.statLabel}>Total Hours Today:</Text>
                        <Text style={styles.statValue}>{totalHours.toFixed(1)}h</Text>
                    </View>

                    {punchRecords.length > 0 ? (
                        punchRecords.map((record, idx) => (
                            <View key={idx} style={styles.punchRecord}>
                                <View style={styles.punchIn}>
                                    <Feather name="log-in" size={14} color="#10B981" />
                                    <Text style={styles.punchTime}>
                                        {new Date(record.punch_in).toLocaleTimeString('en-US', {
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })}
                                    </Text>
                                </View>
                                {record.punch_out ? (
                                    <>
                                        <View style={styles.arrow}>
                                            <Feather name="arrow-right" size={14} color="#9CA3AF" />
                                        </View>
                                        <View style={styles.punchOut}>
                                            <Feather name="log-out" size={14} color="#EF4444" />

                                            <Text style={styles.punchTime}>
                                                {new Date(record.punch_out).toLocaleTimeString('en-US', {
                                                    hour: '2-digit',
                                                    minute: '2-digit'
                                                })}
                                            </Text>
                                        </View>
                                        <View style={styles.durationBadge}>
                                            <Text style={styles.durationText}>
                                                {Math.floor(record.duration_minutes / 60)}h {record.duration_minutes % 60}m
                                            </Text>
                                        </View>
                                    </>
                                ) : (
                                    <View style={styles.ongoingBadge}>
                                        <Text style={styles.ongoingText}>● Ongoing</Text>
                                    </View>
                                )}
                            </View>
                        ))
                    ) : (
                        <Text style={styles.noData}>No attendance records today</Text>
                    )}
                </View>
            )}

            {selectedTab === 'location' && (
                <View style={styles.tabContent}>
                    <View style={styles.statRow}>
                        <Feather
                            name={employee.location_sharing ? "radio" : "radio"}
                            size={16}
                            color={employee.location_sharing ? "#10B981" : "#9CA3AF"}
                        />
                        <Text style={styles.statLabel}>Status:</Text>
                        <Text style={[
                            styles.statValue,
                            { color: employee.location_sharing ? '#10B981' : '#9CA3AF' }
                        ]}>
                            {employee.location_sharing ? 'Sharing' : 'Offline'}
                        </Text>
                    </View>
                    {employee.location_sharing && (
                        <>
                            <View style={styles.statRow}>
                                <Feather name="map-pin" size={16} color="#3B82F6" />
                                <Text style={styles.statLabel}>Coordinates:</Text>
                                <Text style={styles.statValue}>
                                    {employee.current_lat?.toFixed(4)}, {employee.current_lng?.toFixed(4)}
                                </Text>
                            </View>
                            <View style={styles.statRow}>
                                <Feather name="clock" size={16} color="#6B7280" />
                                <Text style={styles.statLabel}>Last Update:</Text>
                                <Text style={styles.statValue}>
                                    {new Date(employee.last_location_update).toLocaleTimeString()}
                                </Text>
                            </View>
                        </>
                    )}
                </View>
            )}

            {selectedTab === 'quizzes' && (
                <View style={styles.tabContent}>
                    <View style={styles.statRow}>
                        <Feather name="award" size={16} color="#F59E0B" />
                        <Text style={styles.statLabel}>Quizzes Completed:</Text>
                        <Text style={styles.statValue}>{employee.quizzes_completed}</Text>
                    </View>
                    {employee.quizzes_completed === 0 && (
                        <Text style={styles.noData}>No quizzes completed yet</Text>
                    )}
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 12,
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        color: '#6B7280',
    },

    // HEADER
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 5,
    },
    backBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#F3F4F6',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerCenter: {
        flex: 1,
        marginLeft: 16,
    },
    headerTitle: {
        fontSize: 18,
        fontFamily: 'Poppins_700Bold',
        color: '#111827',
    },
    headerSubtitle: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
    },
    refreshBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#FEF3C7',
        justifyContent: 'center',
        alignItems: 'center',
    },

    scrollView: {
        flex: 1,
    },

    // SUMMARY
    summaryContainer: {
        flexDirection: 'row',
        paddingHorizontal: 20,
        paddingTop: 20,
        gap: 12,
    },
    summaryCard: {
        flex: 1,
        backgroundColor: '#FFF',
        borderRadius: 16,
        padding: 16,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 3,
    },
    workingCard: {
        shadowColor: '#10B981',
    },
    hoursCard: {
        shadowColor: '#F59E0B',
    },
    locationCard: {
        shadowColor: '#3B82F6',
    },
    summaryIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#F9FAFB',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    summaryValue: {
        fontSize: 24,
        fontFamily: 'Poppins_700Bold',
    },
    summaryLabel: {
        fontSize: 11,
        fontFamily: 'Poppins_500Medium',
        color: '#6B7280',
        marginTop: 4,
        textAlign: 'center',
    },

    // TABS
    tabContainer: {
        flexDirection: 'row',
        marginHorizontal: 20,
        marginTop: 20,
        backgroundColor: '#FFF',
        borderRadius: 16,
        padding: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        borderRadius: 12,
        gap: 6,
    },
    tabActive: {
        backgroundColor: '#FEF3C7',
    },
    tabText: {
        fontSize: 13,
        fontFamily: 'Poppins_500Medium',
        color: '#6B7280',
    },
    tabTextActive: {
        color: '#F59E0B',
        fontFamily: 'Poppins_600SemiBold',
    },

    // EMPLOYEE LIST
    employeeList: {
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 40,
        gap: 16,
    },
    employeeCard: {
        backgroundColor: '#FFF',
        borderRadius: 20,
        padding: 20,
        shadowColor: '#F59E0B',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 4,
    },

    // EMPLOYEE HEADER
    empHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    empAvatar: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#F59E0B',
        justifyContent: 'center',
        alignItems: 'center',
    },
    empAvatarText: {
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
    },
    empInfo: {
        flex: 1,
        marginLeft: 12,
    },
    empName: {
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
        color: '#111827',
    },
    empRole: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
        marginTop: 2,
    },
    workingBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#DCFCE7',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
        gap: 6,
    },
    pulseDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#10B981',
    },
    workingText: {
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
        color: '#10B981',
    },

    // TAB CONTENT
    tabContent: {
        gap: 12,
    },
    statRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    statLabel: {
        flex: 1,
        fontSize: 13,
        fontFamily: 'Poppins_500Medium',
        color: '#6B7280',
    },
    statValue: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
        color: '#111827',
    },

    // PUNCH RECORDS
    punchRecord: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F9FAFB',
        padding: 12,
        borderRadius: 12,
        gap: 8,
    },
    punchIn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    punchOut: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    punchTime: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
        color: '#111827',
    },
    arrow: {
        marginHorizontal: 4,
    },
    durationBadge: {
        marginLeft: 'auto',
        backgroundColor: '#FEF3C7',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    durationText: {
        fontSize: 11,
        fontFamily: 'Poppins_700Bold',
        color: '#F59E0B',
    },
    ongoingBadge: {
        marginLeft: 'auto',
        backgroundColor: '#DCFCE7',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    ongoingText: {
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
        color: '#10B981',
    },
    noData: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#9CA3AF',
        fontStyle: 'italic',
        textAlign: 'center',
        paddingVertical: 8,
    },
});

export default Analytics;