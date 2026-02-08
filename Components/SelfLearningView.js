import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    FlatList,
    Image,
    Dimensions,
    ActivityIndicator,
    ScrollView,
    RefreshControl,
    Modal,
    Platform,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import CertificateModal from './CertificateModal';
import API_URL from '../config';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2;

const THEME = {
    bg: '#FFFDF7',
    card: '#FFFFFF',
    primary: '#F59E0B',
    primaryDark: '#78350F',
    textMain: '#1F2937',
    textSub: '#6B7280',
    green: '#10B981',
    border: '#F3F4F6',
};

const BUCKET_COLORS = ['#10B981', '#F59E0B', '#3B82F6', '#8B5CF6', '#EF4444', '#EC4899', '#14B8A6', '#F97316'];

export default function SelfLearningView({ userEmail = 'user', onOpenCourse }) {
    const [buckets, setBuckets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState('my_courses');
    const [selectedBucket, setSelectedBucket] = useState(null);
    const [bucketCourses, setBucketCourses] = useState([]);
    const [loadingCourses, setLoadingCourses] = useState(false);
    const [certModalVisible, setCertModalVisible] = useState(false);
    const [certCourseId, setCertCourseId] = useState(null);

    useEffect(() => {
        fetchBuckets();
    }, []);

    const fetchBuckets = async () => {
        try {
            const response = await fetch(`${API_URL}/api/v1/self-learning/buckets?user_email=${userEmail}`);
            const data = await response.json();
            setBuckets(data.buckets || []);
        } catch (error) {
            console.error('Error fetching self-learning buckets:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const fetchBucketCourses = async (bucket) => {
        setSelectedBucket(bucket);
        setLoadingCourses(true);
        try {
            const response = await fetch(
                `${API_URL}/api/v1/self-learning/buckets/${bucket.id}/courses?user_email=${userEmail}`
            );
            const data = await response.json();
            setBucketCourses(data.courses || []);
        } catch (error) {
            console.error('Error fetching bucket courses:', error);
        } finally {
            setLoadingCourses(false);
        }
    };

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchBuckets();
    }, []);

    const formatDate = (dateStr) => {
        if (!dateStr) return null;
        const d = new Date(dateStr);
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thur', 'Fri', 'Sat'];
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]},${String(d.getFullYear()).slice(2)}`;
    };

    // ==========================================
    // BUCKET CARD (Folder View - matches UI reference)
    // ==========================================
    const renderBucketCard = ({ item: bucket, index }) => {
        const color = bucket.color || BUCKET_COLORS[index % BUCKET_COLORS.length];
        const progress = bucket.progress_percent || 0;
        const lastAttended = formatDate(bucket.last_attended);

        return (
            <Animated.View entering={FadeInDown.delay(index * 80).springify()}>
                <TouchableOpacity
                    style={styles.bucketCard}
                    activeOpacity={0.85}
                    onPress={() => fetchBucketCourses(bucket)}
                >
                    {/* Thumbnail / Cover */}
                    <View style={[styles.bucketThumbnail, { backgroundColor: color + '15' }]}>
                        {bucket.thumbnail ? (
                            <Image source={{ uri: bucket.thumbnail }} style={styles.bucketImage} resizeMode="cover" />
                        ) : (
                            <View style={[styles.bucketIconWrap, { backgroundColor: color + '25' }]}>
                                <MaterialCommunityIcons
                                    name={bucket.icon || 'folder-open'}
                                    size={42}
                                    color={color}
                                />
                            </View>
                        )}

                        {/* Play Button Overlay */}
                        <View style={styles.playBtnWrap}>
                            <View style={styles.playBtn}>
                                <Feather name="play" size={16} color="#000" />
                            </View>
                        </View>

                        {/* Course Count Badge */}
                        <View style={styles.countBadge}>
                            <Text style={styles.countText}>{bucket.total_courses || 0}</Text>
                        </View>
                    </View>

                    {/* Title */}
                    <Text style={styles.bucketTitle} numberOfLines={2}>{bucket.name}</Text>

                    {/* Last Attended */}
                    {lastAttended ? (
                        <View style={styles.lastAttendedRow}>
                            <Text style={styles.lastAttendedLabel}>Last attended on</Text>
                            <Text style={styles.lastAttendedDate}>{lastAttended}</Text>
                        </View>
                    ) : (
                        <Text style={styles.lastAttendedLabel}>Not started yet</Text>
                    )}

                    {/* Progress Bar */}
                    <View style={styles.progressRow}>
                        <View style={styles.progressBarBg}>
                            <View style={[styles.progressBarFill, {
                                width: `${Math.min(progress, 100)}%`,
                                backgroundColor: progress >= 100 ? THEME.green : color,
                            }]} />
                        </View>
                        <Text style={[styles.progressText, { color: progress >= 100 ? THEME.green : color }]}>
                            {Math.round(progress)}%
                        </Text>
                        <Text style={styles.progressLabel}>Completed</Text>
                    </View>

                    {/* Linear Badge */}
                    {bucket.is_linear && (
                        <View style={styles.linearBadge}>
                            <Feather name="list" size={10} color="#78350F" />
                            <Text style={styles.linearText}>Sequential</Text>
                        </View>
                    )}
                </TouchableOpacity>
            </Animated.View>
        );
    };

    // ==========================================
    // COURSE CARD (Inside a bucket)
    // ==========================================
    const renderCourseCard = ({ item: course, index }) => {
        const isLocked = course.status === 'locked';
        const isCompleted = course.status === 'completed';
        const watchedPct = course.watched_percent || 0;

        return (
            <Animated.View entering={FadeInDown.delay(index * 60).springify()}>
                <TouchableOpacity
                    style={[styles.courseCard, isLocked && styles.courseCardLocked]}
                    activeOpacity={isLocked ? 1 : 0.85}
                    onPress={() => {
                        if (!isLocked && onOpenCourse) {
                            onOpenCourse(course);
                        }
                    }}
                >
                    {/* Thumbnail */}
                    <View style={styles.courseThumbnailWrap}>
                        {course.thumbnail ? (
                            <Image source={{ uri: course.thumbnail }} style={styles.courseThumb} resizeMode="cover" />
                        ) : (
                            <View style={[styles.courseThumbPlaceholder, { backgroundColor: isCompleted ? '#D1FAE5' : '#FEF3C7' }]}>
                                <MaterialCommunityIcons
                                    name={course.resource_type === 'Video' ? 'play-circle' : 'file-document'}
                                    size={32}
                                    color={isCompleted ? THEME.green : THEME.primary}
                                />
                            </View>
                        )}

                        {/* Status Overlay */}
                        {isCompleted && (
                            <View style={styles.completedOverlay}>
                                <Feather name="check-circle" size={24} color="#FFF" />
                            </View>
                        )}
                        {isLocked && (
                            <View style={styles.lockedOverlay}>
                                <Feather name="lock" size={20} color="#FFF" />
                            </View>
                        )}

                        {/* Play Button */}
                        {!isLocked && !isCompleted && (
                            <View style={styles.coursePlayBtn}>
                                <Feather name="play" size={14} color="#000" />
                            </View>
                        )}
                    </View>

                    {/* Info */}
                    <View style={styles.courseInfo}>
                        <Text style={[styles.courseTitle, isLocked && { color: '#9CA3AF' }]} numberOfLines={2}>
                            {course.title}
                        </Text>

                        {course.duration && (
                            <View style={styles.durationRow}>
                                <Feather name="clock" size={11} color="#9CA3AF" />
                                <Text style={styles.durationText}>{course.duration}</Text>
                            </View>
                        )}

                        {/* Watch Progress */}
                        <View style={styles.courseProgressRow}>
                            <View style={styles.courseProgressBg}>
                                <View style={[styles.courseProgressFill, {
                                    width: `${isCompleted ? 100 : watchedPct}%`,
                                    backgroundColor: isCompleted ? THEME.green : THEME.primary,
                                }]} />
                            </View>
                            <Text style={styles.courseProgressText}>
                                {isCompleted ? '100%' : `${Math.round(watchedPct)}%`}
                            </Text>
                        </View>

                        {/* Tags */}
                        <View style={styles.courseTagsRow}>
                            {course.xp > 0 && (
                                <View style={styles.xpBadge}>
                                    <MaterialCommunityIcons name="star-four-points" size={10} color="#F59E0B" />
                                    <Text style={styles.xpText}>{course.xp} XP</Text>
                                </View>
                            )}
                            {!course.allow_fast_forward && (
                                <View style={[styles.xpBadge, { backgroundColor: '#FEE2E2' }]}>
                                    <Feather name="fast-forward" size={10} color="#EF4444" />
                                    <Text style={[styles.xpText, { color: '#EF4444' }]}>No Skip</Text>
                                </View>
                            )}
                            {course.enable_certificate && isCompleted && (
                                <TouchableOpacity
                                    onPress={() => { setCertCourseId(course.id); setCertModalVisible(true); }}
                                    style={[styles.xpBadge, { backgroundColor: '#D1FAE5' }]}
                                >
                                    <Feather name="award" size={10} color="#059669" />
                                    <Text style={[styles.xpText, { color: '#059669' }]}>Cert</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                </TouchableOpacity>
            </Animated.View>
        );
    };

    // ==========================================
    // BUCKET DETAIL VIEW (Courses inside a folder)
    // ==========================================
    if (selectedBucket) {
        return (
            <>
            <View style={styles.container}>
                {/* Back Header */}
                <View style={styles.bucketHeader}>
                    <TouchableOpacity onPress={() => { setSelectedBucket(null); setBucketCourses([]); }} style={styles.backBtn}>
                        <Feather name="arrow-left" size={22} color={THEME.primaryDark} />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.bucketHeaderTitle} numberOfLines={1}>{selectedBucket.name}</Text>
                        <Text style={styles.bucketHeaderSub}>
                            {bucketCourses.length} modules {selectedBucket.is_linear ? '• Sequential' : '• Free access'}
                        </Text>
                    </View>
                </View>

                {loadingCourses ? (
                    <View style={styles.loadingWrap}>
                        <ActivityIndicator size="large" color={THEME.primary} />
                    </View>
                ) : (
                    <FlatList
                        data={bucketCourses}
                        keyExtractor={(item) => item.id}
                        renderItem={renderCourseCard}
                        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
                        showsVerticalScrollIndicator={false}
                        ListEmptyComponent={
                            <View style={styles.emptyWrap}>
                                <MaterialCommunityIcons name="folder-open-outline" size={60} color="#E5E7EB" />
                                <Text style={styles.emptyText}>No courses in this bucket yet</Text>
                            </View>
                        }
                    />
                )}
            </View>
            <CertificateModal
                visible={certModalVisible}
                onClose={() => { setCertModalVisible(false); setCertCourseId(null); }}
                courseId={certCourseId}
                userEmail={userEmail}
            />
            </>
        );
    }

    // ==========================================
    // MAIN VIEW (Bucket Grid / Folder View)
    // ==========================================
    return (
        <View style={styles.container}>
            {/* Tab Bar */}
            <View style={styles.tabBar}>
                {[
                    { key: 'my_courses', label: 'My Courses' },
                    { key: 'trending', label: 'Trending' },
                    { key: 'new', label: 'New' },
                ].map(tab => (
                    <TouchableOpacity
                        key={tab.key}
                        style={[styles.tab, activeTab === tab.key && styles.tabActive]}
                        onPress={() => setActiveTab(tab.key)}
                    >
                        <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                            {tab.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {loading ? (
                <View style={styles.loadingWrap}>
                    <ActivityIndicator size="large" color={THEME.primary} />
                    <Text style={styles.loadingText}>Loading courses...</Text>
                </View>
            ) : (
                <FlatList
                    key="bucket-grid-2col"
                    data={buckets}
                    keyExtractor={(item) => item.id}
                    renderItem={renderBucketCard}
                    numColumns={2}
                    columnWrapperStyle={styles.gridRow}
                    contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={THEME.primary} />
                    }
                    ListEmptyComponent={
                        <View style={styles.emptyWrap}>
                            <MaterialCommunityIcons name="book-open-variant" size={70} color="#E5E7EB" />
                            <Text style={styles.emptyTitle}>No Self-Learning Content</Text>
                            <Text style={styles.emptyText}>Courses will appear here once assigned by your admin.</Text>
                        </View>
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: THEME.bg,
    },

    // Tab Bar
    tabBar: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 4,
        gap: 8,
    },
    tab: {
        paddingHorizontal: 18,
        paddingVertical: 10,
        borderRadius: 25,
        backgroundColor: '#F3F4F6',
    },
    tabActive: {
        backgroundColor: '#1F2937',
    },
    tabText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#6B7280',
    },
    tabTextActive: {
        color: '#FFFFFF',
    },

    // Grid
    gridRow: {
        justifyContent: 'space-between',
        marginBottom: 16,
    },

    // Bucket Card
    bucketCard: {
        width: CARD_WIDTH,
        backgroundColor: THEME.card,
        borderRadius: 16,
        overflow: 'hidden',
        ...Platform.select({
            ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 },
            android: { elevation: 3 },
            web: { boxShadow: '0 2px 8px rgba(0,0,0,0.08)' },
        }),
    },
    bucketThumbnail: {
        width: '100%',
        height: CARD_WIDTH * 0.75,
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
    },
    bucketImage: {
        width: '100%',
        height: '100%',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
    },
    bucketIconWrap: {
        width: 80,
        height: 80,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    playBtnWrap: {
        position: 'absolute',
        bottom: 10,
        right: 10,
    },
    playBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#FFF',
        justifyContent: 'center',
        alignItems: 'center',
        ...Platform.select({
            ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.15, shadowRadius: 3 },
            android: { elevation: 3 },
            web: { boxShadow: '0 1px 3px rgba(0,0,0,0.15)' },
        }),
    },
    countBadge: {
        position: 'absolute',
        top: 8,
        right: 8,
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 10,
    },
    countText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#FFF',
    },
    bucketTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: THEME.textMain,
        paddingHorizontal: 10,
        paddingTop: 10,
        lineHeight: 18,
    },
    lastAttendedRow: {
        paddingHorizontal: 10,
        paddingTop: 4,
    },
    lastAttendedLabel: {
        fontSize: 10,
        color: '#10B981',
        paddingHorizontal: 10,
        paddingTop: 4,
    },
    lastAttendedDate: {
        fontSize: 11,
        fontWeight: '600',
        color: THEME.textMain,
    },
    progressRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingTop: 8,
        paddingBottom: 10,
        gap: 6,
    },
    progressBarBg: {
        flex: 1,
        height: 4,
        backgroundColor: '#F3F4F6',
        borderRadius: 2,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        borderRadius: 2,
    },
    progressText: {
        fontSize: 11,
        fontWeight: '700',
    },
    progressLabel: {
        fontSize: 10,
        color: THEME.textSub,
    },
    linearBadge: {
        position: 'absolute',
        top: 8,
        left: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        backgroundColor: '#FEF3C7',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 8,
    },
    linearText: {
        fontSize: 9,
        fontWeight: '700',
        color: '#78350F',
    },

    // Course Card (inside bucket)
    courseCard: {
        flexDirection: 'row',
        backgroundColor: THEME.card,
        borderRadius: 14,
        marginBottom: 12,
        overflow: 'hidden',
        ...Platform.select({
            ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6 },
            android: { elevation: 2 },
            web: { boxShadow: '0 1px 6px rgba(0,0,0,0.06)' },
        }),
    },
    courseCardLocked: {
        opacity: 0.55,
    },
    courseThumbnailWrap: {
        width: 100,
        height: 100,
        position: 'relative',
    },
    courseThumb: {
        width: '100%',
        height: '100%',
    },
    courseThumbPlaceholder: {
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    completedOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(16,185,129,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    lockedOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(107,114,128,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    coursePlayBtn: {
        position: 'absolute',
        bottom: 6,
        right: 6,
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: '#FFF',
        justifyContent: 'center',
        alignItems: 'center',
        ...Platform.select({
            ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.15, shadowRadius: 2 },
            android: { elevation: 2 },
            web: { boxShadow: '0 1px 2px rgba(0,0,0,0.15)' },
        }),
    },
    courseInfo: {
        flex: 1,
        padding: 10,
        justifyContent: 'center',
    },
    courseTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: THEME.textMain,
        lineHeight: 17,
    },
    durationRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 4,
    },
    durationText: {
        fontSize: 11,
        color: '#9CA3AF',
    },
    courseProgressRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 6,
    },
    courseProgressBg: {
        flex: 1,
        height: 3,
        backgroundColor: '#F3F4F6',
        borderRadius: 2,
        overflow: 'hidden',
    },
    courseProgressFill: {
        height: '100%',
        borderRadius: 2,
    },
    courseProgressText: {
        fontSize: 10,
        fontWeight: '700',
        color: THEME.textSub,
    },
    courseTagsRow: {
        flexDirection: 'row',
        gap: 6,
        marginTop: 6,
        flexWrap: 'wrap',
    },
    xpBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        backgroundColor: '#FEF3C7',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 8,
    },
    xpText: {
        fontSize: 9,
        fontWeight: '700',
        color: '#92400E',
    },

    // Bucket Detail Header
    bucketHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        gap: 12,
        borderBottomWidth: 1,
        borderBottomColor: THEME.border,
        backgroundColor: THEME.card,
    },
    backBtn: {
        width: 38,
        height: 38,
        borderRadius: 12,
        backgroundColor: '#FEF3C7',
        justifyContent: 'center',
        alignItems: 'center',
    },
    bucketHeaderTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: THEME.primaryDark,
    },
    bucketHeaderSub: {
        fontSize: 12,
        color: THEME.textSub,
        marginTop: 2,
    },

    // Loading / Empty
    loadingWrap: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: 80,
    },
    loadingText: {
        marginTop: 12,
        fontSize: 13,
        color: THEME.textSub,
    },
    emptyWrap: {
        alignItems: 'center',
        paddingTop: 80,
    },
    emptyTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: THEME.textMain,
        marginTop: 16,
    },
    emptyText: {
        fontSize: 13,
        color: THEME.textSub,
        marginTop: 6,
        textAlign: 'center',
        paddingHorizontal: 40,
    },
});
