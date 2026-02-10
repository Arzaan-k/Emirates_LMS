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
    Platform,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import Svg, { Circle, G } from 'react-native-svg';
import CertificateModal from './CertificateModal';
import API_URL from '../config';

const { width } = Dimensions.get('window');
const GRID_CARD_WIDTH = (width - 56) / 2;

const THEME = {
    bg: '#F8FAFC',
    card: '#FFFFFF',
    primary: '#3B82F6',
    primaryLight: '#EFF6FF',
    primaryDark: '#1E40AF',
    accent: '#F59E0B',
    textMain: '#1E293B',
    textSub: '#64748B',
    green: '#10B981',
    border: '#E2E8F0',
    toolbar: '#FFFFFF',
};

const BUCKET_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#EC4899', '#14B8A6', '#F97316'];

// Circular Progress Component
const CircularProgress = ({ size = 36, strokeWidth = 3, progress = 0, color = THEME.primary }) => {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (progress / 100) * circumference;
    const isCompleted = progress >= 100;

    return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={size} height={size}>
                <G rotation="-90" origin={`${size / 2}, ${size / 2}`}>
                    <Circle cx={size / 2} cy={size / 2} r={radius} stroke="#E2E8F0" strokeWidth={strokeWidth} fill="transparent" />
                    <Circle cx={size / 2} cy={size / 2} r={radius} stroke={isCompleted ? THEME.green : color} strokeWidth={strokeWidth} fill="transparent" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" />
                </G>
            </Svg>
            <View style={{ position: 'absolute' }}>
                {isCompleted ? (
                    <Feather name="check" size={size * 0.4} color={THEME.green} />
                ) : (
                    <Text style={{ fontSize: size * 0.28, fontWeight: '700', color }}>{Math.round(progress)}</Text>
                )}
            </View>
        </View>
    );
};

export default function SelfLearningView({ userEmail = 'user', onOpenCourse }) {
    const [allBuckets, setAllBuckets] = useState([]); // Flat list of all buckets
    const [hierarchy, setHierarchy] = useState([]); // Root level buckets
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [viewMode, setViewMode] = useState('grid');
    
    // Navigation state - Windows style
    const [currentPath, setCurrentPath] = useState([]); // Array of {id, name, type: 'folder'|'bucket'}
    const [displayItems, setDisplayItems] = useState([]); // Currently visible items
    const [courses, setCourses] = useState([]); // Courses when in leaf bucket
    const [loadingContent, setLoadingContent] = useState(false);
    
    const [certModalVisible, setCertModalVisible] = useState(false);
    const [certCourseId, setCertCourseId] = useState(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const response = await fetch(`${API_URL}/api/v1/self-learning/buckets/hierarchy?user_email=${userEmail}`);
            const data = await response.json();
            const hierarchyData = data.hierarchy || [];
            setHierarchy(hierarchyData);
            
            // Flatten all buckets for easy lookup
            const flattenBuckets = (items, result = []) => {
                items.forEach(item => {
                    result.push(item);
                    if (item.children?.length > 0) {
                        flattenBuckets(item.children, result);
                    }
                });
                return result;
            };
            setAllBuckets(flattenBuckets(hierarchyData));
            
            // Show root level items
            setDisplayItems(hierarchyData);
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const fetchCourses = async (bucketId) => {
        setLoadingContent(true);
        try {
            const response = await fetch(`${API_URL}/api/v1/self-learning/buckets/${bucketId}/courses?user_email=${userEmail}`);
            const data = await response.json();
            setCourses(data.courses || []);
        } catch (error) {
            console.error('Error fetching courses:', error);
        } finally {
            setLoadingContent(false);
        }
    };

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchData();
    }, []);

    // ==========================================
    // WINDOWS-STYLE NAVIGATION
    // ==========================================
    
    const openFolder = (folder) => {
        // Add to path
        const newPath = [...currentPath, { id: folder.id, name: folder.name }];
        setCurrentPath(newPath);
        
        // Check if this folder has children (sub-folders)
        if (folder.children && folder.children.length > 0) {
            // Show sub-folders
            setDisplayItems(folder.children);
            setCourses([]);
        } else {
            // This is a leaf folder - fetch courses
            setDisplayItems([]);
            fetchCourses(folder.id);
        }
    };

    const goBack = () => {
        if (currentPath.length === 0) return;
        
        const newPath = currentPath.slice(0, -1);
        setCurrentPath(newPath);
        setCourses([]);
        
        if (newPath.length === 0) {
            // Back to root
            setDisplayItems(hierarchy);
        } else {
            // Find parent folder and show its children
            const parentId = newPath[newPath.length - 1].id;
            const parent = allBuckets.find(b => b.id === parentId);
            if (parent && parent.children) {
                setDisplayItems(parent.children);
            }
        }
    };

    const goToRoot = () => {
        setCurrentPath([]);
        setDisplayItems(hierarchy);
        setCourses([]);
    };

    const goToPathIndex = (index) => {
        if (index === -1) {
            goToRoot();
            return;
        }
        
        const newPath = currentPath.slice(0, index + 1);
        setCurrentPath(newPath);
        setCourses([]);
        
        // Find the folder at this index and show its contents
        const folderId = newPath[newPath.length - 1].id;
        const folder = allBuckets.find(b => b.id === folderId);
        
        if (folder) {
            if (folder.children && folder.children.length > 0) {
                setDisplayItems(folder.children);
            } else {
                setDisplayItems([]);
                fetchCourses(folder.id);
            }
        }
    };

    const getColor = (index) => BUCKET_COLORS[index % BUCKET_COLORS.length];

    // Check if we're showing courses (in a leaf folder)
    const isShowingCourses = currentPath.length > 0 && displayItems.length === 0;

    // ==========================================
    // TOOLBAR - Windows Explorer Style
    // ==========================================
    const renderToolbar = () => (
        <View style={styles.toolbar}>
            {/* Nav Buttons */}
            <View style={styles.navBtns}>
                <TouchableOpacity
                    style={[styles.navBtn, currentPath.length === 0 && styles.navBtnDisabled]}
                    onPress={goBack}
                    disabled={currentPath.length === 0}
                >
                    <Feather name="arrow-left" size={18} color={currentPath.length === 0 ? '#CBD5E1' : '#475569'} />
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.navBtn, currentPath.length === 0 && styles.navBtnDisabled]}
                    onPress={goToRoot}
                    disabled={currentPath.length === 0}
                >
                    <Feather name="home" size={18} color={currentPath.length === 0 ? '#CBD5E1' : '#475569'} />
                </TouchableOpacity>
            </View>

            {/* Address Bar / Breadcrumb */}
            <View style={styles.addressBar}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.addressContent}>
                    <TouchableOpacity style={styles.pathSegment} onPress={() => goToPathIndex(-1)}>
                        <MaterialCommunityIcons name="folder-home" size={16} color={THEME.primary} />
                        <Text style={styles.pathText}>Self Learning</Text>
                    </TouchableOpacity>
                    
                    {currentPath.map((segment, idx) => (
                        <React.Fragment key={segment.id}>
                            <Feather name="chevron-right" size={14} color="#94A3B8" />
                            <TouchableOpacity style={styles.pathSegment} onPress={() => goToPathIndex(idx)}>
                                <Text style={[styles.pathText, idx === currentPath.length - 1 && styles.pathTextActive]}>
                                    {segment.name}
                                </Text>
                            </TouchableOpacity>
                        </React.Fragment>
                    ))}
                </ScrollView>
            </View>

            {/* View Toggle */}
            <View style={styles.viewToggle}>
                <TouchableOpacity
                    style={[styles.viewBtn, viewMode === 'grid' && styles.viewBtnActive]}
                    onPress={() => setViewMode('grid')}
                >
                    <MaterialCommunityIcons name="view-grid" size={18} color={viewMode === 'grid' ? THEME.primary : '#94A3B8'} />
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.viewBtn, viewMode === 'list' && styles.viewBtnActive]}
                    onPress={() => setViewMode('list')}
                >
                    <MaterialCommunityIcons name="view-list" size={18} color={viewMode === 'list' ? THEME.primary : '#94A3B8'} />
                </TouchableOpacity>
            </View>
        </View>
    );

    // ==========================================
    // FOLDER ITEM - GRID VIEW
    // ==========================================
    const renderFolderGrid = ({ item, index }) => {
        const color = item.color || getColor(index);
        const progress = item.progress_percent || 0;
        const hasSubFolders = item.children && item.children.length > 0;

        return (
            <Animated.View entering={FadeInDown.delay(index * 40).springify()}>
                <TouchableOpacity style={styles.gridCard} activeOpacity={0.7} onPress={() => openFolder(item)}>
                    <View style={[styles.gridIconArea, { backgroundColor: color + '10' }]}>
                        <View style={[styles.gridIconBox, { backgroundColor: color + '20' }]}>
                            <MaterialCommunityIcons
                                name={hasSubFolders ? 'folder-multiple' : 'folder'}
                                size={42}
                                color={color}
                            />
                        </View>
                        <View style={styles.itemCountBadge}>
                            <Text style={styles.itemCountText}>{item.total_courses || 0}</Text>
                        </View>
                    </View>
                    <View style={styles.gridCardInfo}>
                        <Text style={styles.gridCardTitle} numberOfLines={2}>{item.name}</Text>
                        <View style={styles.progressRow}>
                            <CircularProgress size={28} strokeWidth={3} progress={progress} color={color} />
                            <Text style={styles.progressLabel}>{Math.round(progress)}% done</Text>
                        </View>
                    </View>
                </TouchableOpacity>
            </Animated.View>
        );
    };

    // ==========================================
    // FOLDER ITEM - LIST VIEW
    // ==========================================
    const renderFolderList = ({ item, index }) => {
        const color = item.color || getColor(index);
        const progress = item.progress_percent || 0;
        const hasSubFolders = item.children && item.children.length > 0;

        return (
            <Animated.View entering={FadeIn.delay(index * 25)}>
                <TouchableOpacity style={styles.listRow} activeOpacity={0.7} onPress={() => openFolder(item)}>
                    <View style={[styles.listIcon, { backgroundColor: color + '15' }]}>
                        <MaterialCommunityIcons
                            name={hasSubFolders ? 'folder-multiple' : 'folder'}
                            size={26}
                            color={color}
                        />
                    </View>
                    <View style={styles.listInfo}>
                        <Text style={styles.listTitle} numberOfLines={1}>{item.name}</Text>
                        <Text style={styles.listMeta}>{item.total_courses || 0} items • {item.completed_courses || 0} completed</Text>
                    </View>
                    <CircularProgress size={38} strokeWidth={3} progress={progress} color={color} />
                    <Feather name="chevron-right" size={20} color="#CBD5E1" style={{ marginLeft: 10 }} />
                </TouchableOpacity>
            </Animated.View>
        );
    };

    // ==========================================
    // COURSE ITEM - GRID VIEW
    // ==========================================
    const renderCourseGrid = ({ item: course, index }) => {
        const isLocked = course.status === 'locked';
        const isCompleted = course.status === 'completed';
        const progress = isCompleted ? 100 : (course.watched_percent || 0);

        return (
            <Animated.View entering={FadeInDown.delay(index * 40).springify()}>
                <TouchableOpacity
                    style={[styles.gridCard, isLocked && { opacity: 0.5 }]}
                    activeOpacity={isLocked ? 1 : 0.7}
                    onPress={() => !isLocked && onOpenCourse && onOpenCourse(course)}
                >
                    <View style={styles.courseThumbBox}>
                        {course.thumbnail ? (
                            <Image source={{ uri: course.thumbnail }} style={styles.courseThumbImg} />
                        ) : (
                            <View style={[styles.courseThumbPlaceholder, { backgroundColor: isCompleted ? '#D1FAE5' : '#FEF3C7' }]}>
                                <MaterialCommunityIcons
                                    name={course.resource_type === 'Video' ? 'play-circle-outline' : 'file-document-outline'}
                                    size={36}
                                    color={isCompleted ? THEME.green : THEME.accent}
                                />
                            </View>
                        )}
                        {isCompleted && <View style={styles.statusBadgeGreen}><Feather name="check" size={12} color="#FFF" /></View>}
                        {isLocked && <View style={styles.statusBadgeGray}><Feather name="lock" size={12} color="#FFF" /></View>}
                    </View>
                    <View style={styles.gridCardInfo}>
                        <Text style={styles.gridCardTitle} numberOfLines={2}>{course.title}</Text>
                        <View style={styles.progressRow}>
                            <CircularProgress size={28} strokeWidth={3} progress={progress} color={isCompleted ? THEME.green : THEME.primary} />
                            <Text style={styles.progressLabel}>{course.duration || 'N/A'}</Text>
                        </View>
                    </View>
                </TouchableOpacity>
            </Animated.View>
        );
    };

    // ==========================================
    // COURSE ITEM - LIST VIEW
    // ==========================================
    const renderCourseList = ({ item: course, index }) => {
        const isLocked = course.status === 'locked';
        const isCompleted = course.status === 'completed';
        const progress = isCompleted ? 100 : (course.watched_percent || 0);

        return (
            <Animated.View entering={FadeIn.delay(index * 25)}>
                <TouchableOpacity
                    style={[styles.listRow, isLocked && { opacity: 0.5 }]}
                    activeOpacity={isLocked ? 1 : 0.7}
                    onPress={() => !isLocked && onOpenCourse && onOpenCourse(course)}
                >
                    <View style={styles.courseListThumb}>
                        {course.thumbnail ? (
                            <Image source={{ uri: course.thumbnail }} style={styles.courseListThumbImg} />
                        ) : (
                            <View style={[styles.courseListThumbPlaceholder, { backgroundColor: isCompleted ? '#D1FAE5' : THEME.primaryLight }]}>
                                <MaterialCommunityIcons
                                    name={course.resource_type === 'Video' ? 'play-circle-outline' : 'file-document-outline'}
                                    size={22}
                                    color={isCompleted ? THEME.green : THEME.primary}
                                />
                            </View>
                        )}
                    </View>
                    <View style={styles.listInfo}>
                        <Text style={styles.listTitle} numberOfLines={1}>{course.title}</Text>
                        <View style={styles.courseMeta}>
                            <Feather name="clock" size={11} color="#94A3B8" />
                            <Text style={styles.listMeta}>{course.duration || 'N/A'}</Text>
                            {course.xp > 0 && (
                                <>
                                    <MaterialCommunityIcons name="star-four-points" size={11} color="#F59E0B" style={{ marginLeft: 8 }} />
                                    <Text style={[styles.listMeta, { color: '#F59E0B' }]}>{course.xp} XP</Text>
                                </>
                            )}
                        </View>
                    </View>
                    <CircularProgress size={38} strokeWidth={3} progress={progress} color={isCompleted ? THEME.green : THEME.primary} />
                    {isCompleted ? (
                        <TouchableOpacity style={styles.awardBtn} onPress={() => { setCertCourseId(course.id); setCertModalVisible(true); }}>
                            <Feather name="award" size={18} color={THEME.green} />
                        </TouchableOpacity>
                    ) : isLocked ? (
                        <Feather name="lock" size={18} color="#CBD5E1" style={{ marginLeft: 10 }} />
                    ) : (
                        <Feather name="play-circle" size={18} color={THEME.primary} style={{ marginLeft: 10 }} />
                    )}
                </TouchableOpacity>
            </Animated.View>
        );
    };

    // ==========================================
    // MAIN CONTENT
    // ==========================================
    const renderContent = () => {
        if (loading) {
            return (
                <View style={styles.centerWrap}>
                    <ActivityIndicator size="large" color={THEME.primary} />
                    <Text style={styles.loadingText}>Loading...</Text>
                </View>
            );
        }

        if (loadingContent) {
            return (
                <View style={styles.centerWrap}>
                    <ActivityIndicator size="large" color={THEME.primary} />
                </View>
            );
        }

        // Show courses if in leaf folder
        if (isShowingCourses) {
            if (courses.length === 0) {
                return (
                    <View style={styles.emptyWrap}>
                        <MaterialCommunityIcons name="folder-open-outline" size={64} color="#CBD5E1" />
                        <Text style={styles.emptyTitle}>Empty Folder</Text>
                        <Text style={styles.emptyText}>No courses in this folder yet</Text>
                    </View>
                );
            }

            return (
                <FlatList
                    key={viewMode + '-courses'}
                    data={courses}
                    keyExtractor={(item) => item.id}
                    renderItem={viewMode === 'grid' ? renderCourseGrid : renderCourseList}
                    numColumns={viewMode === 'grid' ? 2 : 1}
                    columnWrapperStyle={viewMode === 'grid' ? styles.gridWrap : undefined}
                    contentContainerStyle={styles.contentPadding}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={THEME.primary} />}
                />
            );
        }

        // Show folders
        if (displayItems.length === 0) {
            return (
                <View style={styles.emptyWrap}>
                    <MaterialCommunityIcons name="folder-alert-outline" size={64} color="#CBD5E1" />
                    <Text style={styles.emptyTitle}>No Content</Text>
                    <Text style={styles.emptyText}>Content will appear here once added</Text>
                </View>
            );
        }

        return (
            <FlatList
                key={viewMode + '-folders'}
                data={displayItems}
                keyExtractor={(item) => item.id}
                renderItem={viewMode === 'grid' ? renderFolderGrid : renderFolderList}
                numColumns={viewMode === 'grid' ? 2 : 1}
                columnWrapperStyle={viewMode === 'grid' ? styles.gridWrap : undefined}
                contentContainerStyle={styles.contentPadding}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={THEME.primary} />}
            />
        );
    };

    return (
        <View style={styles.container}>
            {renderToolbar()}
            {renderContent()}
            <CertificateModal
                visible={certModalVisible}
                onClose={() => { setCertModalVisible(false); setCertCourseId(null); }}
                courseId={certCourseId}
                userEmail={userEmail}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: THEME.bg },

    // Toolbar
    toolbar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: THEME.toolbar,
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: THEME.border,
        gap: 8,
    },
    navBtns: { flexDirection: 'row', gap: 4 },
    navBtn: {
        width: 34,
        height: 34,
        borderRadius: 8,
        backgroundColor: '#F1F5F9',
        justifyContent: 'center',
        alignItems: 'center',
    },
    navBtnDisabled: { backgroundColor: '#F8FAFC' },
    addressBar: {
        flex: 1,
        height: 34,
        backgroundColor: '#F1F5F9',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        justifyContent: 'center',
    },
    addressContent: { alignItems: 'center', paddingHorizontal: 10, gap: 4 },
    pathSegment: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 4 },
    pathText: { fontSize: 13, color: '#64748B' },
    pathTextActive: { color: THEME.textMain, fontWeight: '600' },
    viewToggle: { flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 8, padding: 2 },
    viewBtn: { width: 34, height: 30, borderRadius: 6, justifyContent: 'center', alignItems: 'center' },
    viewBtnActive: {
        backgroundColor: '#FFF',
        ...Platform.select({
            ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 },
            android: { elevation: 1 },
            web: { boxShadow: '0 1px 2px rgba(0,0,0,0.1)' },
        }),
    },

    // Content
    contentPadding: { padding: 12, paddingBottom: 100 },
    gridWrap: { justifyContent: 'space-between', marginBottom: 12 },

    // Grid Card
    gridCard: {
        width: GRID_CARD_WIDTH,
        backgroundColor: THEME.card,
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: THEME.border,
    },
    gridIconArea: { height: GRID_CARD_WIDTH * 0.6, justifyContent: 'center', alignItems: 'center', position: 'relative' },
    gridIconBox: { width: 72, height: 72, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
    itemCountBadge: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
    itemCountText: { fontSize: 11, fontWeight: '700', color: '#FFF' },
    gridCardInfo: { padding: 12 },
    gridCardTitle: { fontSize: 14, fontWeight: '600', color: THEME.textMain, lineHeight: 18, marginBottom: 8 },
    progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    progressLabel: { fontSize: 11, color: THEME.textSub },

    // List Row
    listRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: THEME.card,
        borderRadius: 10,
        padding: 12,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: THEME.border,
    },
    listIcon: { width: 48, height: 48, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    listInfo: { flex: 1 },
    listTitle: { fontSize: 14, fontWeight: '600', color: THEME.textMain },
    listMeta: { fontSize: 12, color: THEME.textSub, marginTop: 2 },
    courseMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },

    // Course Thumbnails
    courseThumbBox: { height: GRID_CARD_WIDTH * 0.6, position: 'relative' },
    courseThumbImg: { width: '100%', height: '100%' },
    courseThumbPlaceholder: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
    statusBadgeGreen: { position: 'absolute', top: 8, right: 8, backgroundColor: THEME.green, width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
    statusBadgeGray: { position: 'absolute', top: 8, right: 8, backgroundColor: '#64748B', width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
    courseListThumb: { width: 48, height: 48, borderRadius: 8, overflow: 'hidden', marginRight: 12 },
    courseListThumbImg: { width: '100%', height: '100%' },
    courseListThumbPlaceholder: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
    awardBtn: { marginLeft: 10, padding: 4 },

    // Empty / Loading
    centerWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loadingText: { marginTop: 12, fontSize: 13, color: THEME.textSub },
    emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
    emptyTitle: { fontSize: 18, fontWeight: '600', color: THEME.textMain, marginTop: 16 },
    emptyText: { fontSize: 13, color: THEME.textSub, marginTop: 6, textAlign: 'center' },
});
