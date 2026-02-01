import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    Dimensions,
    Platform,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import API_URL from '../config';
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

const { width } = Dimensions.get('window');

// Fallback levels in case API fails
const DEFAULT_LEVELS = ['Waffler', 'Silver Waffler', 'Gold Waffler', 'Shift Manager', 'Assistant Store Manager'];

export default function AccessControlModal({ visible, onClose }) {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [buckets, setBuckets] = useState([]);
    const [allCourses, setAllCourses] = useState([]);
    const [accessRules, setAccessRules] = useState({});
    const [levelData, setLevelData] = useState([]); // Full level objects from API
    const [hasLevelChanges, setHasLevelChanges] = useState(false);

    // State for course assignments per level
    // Structure: { "level_0": ["course_id_1", "course_id_2"], "level_1": [...] }
    const [stagedAssignments, setStagedAssignments] = useState({});

    const [expandedRole, setExpandedRole] = useState(null);

    useEffect(() => {
        if (visible) {
            fetchData();
        }
    }, [visible]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Dynamic Levels from backend
            const levelsRes = await fetch(`${API_URL}/api/v1/levels/`);
            const levelsData = await levelsRes.json();
            const levels = levelsData.levels || [];

            // Sort by order
            const sortedLevels = levels.sort((a, b) => a.order - b.order);
            setLevelData(sortedLevels);

            // 2. Fetch Buckets
            const bucketRes = await fetch(`${API_URL}/api/v1/content/buckets/all`);
            const bucketData = await bucketRes.json();
            setBuckets(bucketData || []);

            // 3. Fetch All Courses - Career Progression courses for curriculum assignment
            const courseRes = await fetch(`${API_URL}/api/v1/content/`);
            const courseData = await courseRes.json();
            const careerProgressionCourses = (courseData || []).filter(c => {
                const pathType = c.learning_path_type || 'career_progression';
                const isPath = c.isPathNode === true || c.isPathNode === 'true';
                return pathType !== 'self_learning' && isPath;
            });
            setAllCourses(careerProgressionCourses);

            // 4. Fetch Access Rules
            const rulesRes = await fetch(`${API_URL}/api/v1/levels/access-rules`);
            const rulesData = await rulesRes.json();

            // Initialize staged assignments from existing rules (by level name)
            const initialStaged = {};
            sortedLevels.forEach(level => {
                const roleRules = rulesData[level.name] || {};
                initialStaged[level.id] = roleRules.accessible_courses || [];
            });
            setStagedAssignments(initialStaged);
            setAccessRules(rulesData);
            setHasLevelChanges(false);

        } catch (e) {
            console.error("Error fetching access control data:", e);
            Alert.alert("Error", "Failed to load hierarchy configurations.");
        } finally {
            setLoading(false);
        }
    };

    // =========================================================================
    // DRAG-AND-DROP: REORDER LEVELS
    // =========================================================================
    const handleLevelDragEnd = useCallback(({ data }) => {
        setLevelData(data);
        setHasLevelChanges(true);
    }, []);

    const saveLevelOrder = async () => {
        setSaving(true);
        try {
            const levelOrder = levelData.map(l => l.id);
            const response = await fetch(`${API_URL}/api/v1/levels/reorder`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ level_order: levelOrder }),
            });

            if (!response.ok) throw new Error('Failed to save level order');

            const data = await response.json();
            setLevelData(data.levels);
            setHasLevelChanges(false);
            Alert.alert('Success', 'Level order saved!');
        } catch (error) {
            console.error('Failed to save level order:', error);
            Alert.alert('Error', 'Failed to save level order');
        } finally {
            setSaving(false);
        }
    };

    // =========================================================================
    // COURSE MANAGEMENT WITHIN LEVELS
    // =========================================================================
    const toggleCourse = (levelId, courseId) => {
        setStagedAssignments(prev => {
            const currentCourses = prev[levelId] || [];
            if (currentCourses.includes(courseId)) {
                return { ...prev, [levelId]: currentCourses.filter(id => id !== courseId) };
            } else {
                return { ...prev, [levelId]: [...currentCourses, courseId] };
            }
        });
    };

    const handleSaveCourses = async (level) => {
        try {
            const courses = stagedAssignments[level.id] || [];
            const existingRules = accessRules[level.name] || {};

            const formData = new FormData();
            formData.append('accessible_courses', JSON.stringify(courses));
            formData.append('accessible_buckets', JSON.stringify(existingRules.accessible_buckets || []));
            formData.append('max_courses_visible', String(existingRules.max_courses_visible || -1));

            const res = await fetch(`${API_URL}/api/v1/levels/access-rules/${level.name}`, {
                method: 'PUT',
                body: formData
            });

            const result = await res.json();
            if (result.status === 'success') {
                Alert.alert("Success", `${level.name} curriculum updated!`);
                setAccessRules({
                    ...accessRules,
                    [level.name]: { ...existingRules, accessible_courses: courses }
                });
            } else {
                Alert.alert("Error", "Failed to save changes.");
            }
        } catch (e) {
            console.error(e);
            Alert.alert("Error", "Network error while saving.");
        }
    };

    // Handle course reorder within a level via drag-and-drop
    const handleCourseDragEnd = useCallback((levelId, newCourseOrder) => {
        setStagedAssignments(prev => ({
            ...prev,
            [levelId]: newCourseOrder
        }));
    }, []);

    // Get courses assigned to a level
    const getAssignedCourses = (levelId) => {
        const courseIds = stagedAssignments[levelId] || [];
        return courseIds.map(id => allCourses.find(c => c.id === id)).filter(Boolean);
    };

    // Get available courses not yet assigned to any level
    const getAvailableCourses = (currentLevelId) => {
        const allAssigned = new Set();
        Object.entries(stagedAssignments).forEach(([levelId, courseIds]) => {
            if (levelId !== currentLevelId) {
                courseIds.forEach(id => allAssigned.add(id));
            }
        });
        return allCourses.filter(c => !allAssigned.has(c.id));
    };

    const countSelectedCourses = (levelId) => {
        return (stagedAssignments[levelId] || []).length;
    };

    // =========================================================================
    // RENDER LEVEL ITEM (DRAGGABLE)
    // =========================================================================
    const renderLevelItem = useCallback(({ item: level, drag, isActive }) => {
        const isExpanded = expandedRole === level.id;
        const selectedCount = countSelectedCourses(level.id);
        const assignedCourses = getAssignedCourses(level.id);
        const availableCourses = getAvailableCourses(level.id);

        return (
            <ScaleDecorator>
                <View style={[styles.levelContainer, isActive && styles.levelContainerActive]}>
                    {/* Level Header - Draggable */}
                    <TouchableOpacity
                        style={[styles.levelHeader, isExpanded && styles.levelHeaderActive]}
                        onPress={() => setExpandedRole(isExpanded ? null : level.id)}
                        onLongPress={drag}
                        delayLongPress={150}
                    >
                        {/* Drag Handle */}
                        <View style={styles.dragHandle}>
                            <MaterialCommunityIcons name="drag" size={20} color="#9CA3AF" />
                        </View>

                        <View style={[styles.levelIcon, { backgroundColor: level.color || '#6B7280' }]}>
                            <MaterialCommunityIcons
                                name={level.icon || 'medal-outline'}
                                size={24}
                                color="#FFF"
                            />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.levelTitle}>{level.name}</Text>
                            <Text style={styles.levelSubtitle}>
                                {selectedCount} courses • Order: {level.order}
                            </Text>
                        </View>
                        <Feather name={isExpanded ? "chevron-up" : "chevron-down"} size={20} color="#6B7280" />
                    </TouchableOpacity>

                    {/* Expanded Content - Course Assignment */}
                    {isExpanded && (
                        <View style={styles.levelContent}>
                            <Text style={styles.instructionText}>
                                📌 Long press level header to drag & reorder levels
                            </Text>
                            <Text style={styles.instructionText}>
                                ✅ Select courses for this level • Long press course to reorder
                            </Text>

                            {/* Assigned Courses (Draggable) */}
                            {assignedCourses.length > 0 && (
                                <View style={styles.sectionContainer}>
                                    <Text style={styles.sectionTitle}>
                                        Assigned Courses ({assignedCourses.length})
                                    </Text>
                                    <DraggableFlatList
                                        data={assignedCourses}
                                        onDragEnd={({ data }) => {
                                            handleCourseDragEnd(level.id, data.map(c => c.id));
                                        }}
                                        keyExtractor={(item) => item.id}
                                        renderItem={({ item: course, drag: courseDrag, isActive: courseActive }) => (
                                            <ScaleDecorator>
                                                <TouchableOpacity
                                                    style={[
                                                        styles.courseItem,
                                                        styles.assignedCourse,
                                                        courseActive && { backgroundColor: '#FEF3C7' }
                                                    ]}
                                                    onLongPress={courseDrag}
                                                    delayLongPress={100}
                                                    onPress={() => toggleCourse(level.id, course.id)}
                                                >
                                                    <MaterialCommunityIcons name="drag-vertical" size={18} color="#9CA3AF" />
                                                    <View style={[styles.checkbox, styles.checkboxSelected]}>
                                                        <Feather name="check" size={12} color="#FFF" />
                                                    </View>
                                                    <Text style={styles.courseTitle} numberOfLines={1}>
                                                        {course.title}
                                                    </Text>
                                                </TouchableOpacity>
                                            </ScaleDecorator>
                                        )}
                                        scrollEnabled={false}
                                    />
                                </View>
                            )}

                            {/* Available Courses */}
                            <View style={styles.sectionContainer}>
                                <Text style={styles.sectionTitle}>
                                    Available Courses ({availableCourses.length - assignedCourses.length})
                                </Text>
                                {availableCourses
                                    .filter(c => !(stagedAssignments[level.id] || []).includes(c.id))
                                    .slice(0, 10) // Show max 10 at a time for performance
                                    .map(course => (
                                        <TouchableOpacity
                                            key={course.id}
                                            style={styles.courseItem}
                                            onPress={() => toggleCourse(level.id, course.id)}
                                        >
                                            <View style={styles.checkbox} />
                                            <Text style={styles.courseTitle} numberOfLines={1}>
                                                {course.title}
                                            </Text>
                                            <Text style={styles.courseBucket}>
                                                {course.bucket || 'General'}
                                            </Text>
                                        </TouchableOpacity>
                                    ))
                                }
                            </View>

                            {/* Save Button */}
                            <TouchableOpacity
                                style={styles.saveBtn}
                                onPress={() => handleSaveCourses(level)}
                            >
                                <Text style={styles.saveBtnText}>Save {level.name} Curriculum</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            </ScaleDecorator>
        );
    }, [expandedRole, stagedAssignments, allCourses]);

    // =========================================================================
    // MAIN RENDER
    // =========================================================================
    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
            <GestureHandlerRootView style={{ flex: 1 }}>
                <View style={styles.container}>
                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <Feather name="x" size={24} color="#374151" />
                        </TouchableOpacity>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.headerTitle}>Curriculum Hierarchy</Text>
                            <Text style={styles.headerSubtitle}>
                                Drag to reorder levels & courses
                            </Text>
                        </View>
                        {hasLevelChanges && (
                            <TouchableOpacity
                                style={styles.saveLevelOrderBtn}
                                onPress={saveLevelOrder}
                                disabled={saving}
                            >
                                {saving ? (
                                    <ActivityIndicator size="small" color="#FFF" />
                                ) : (
                                    <>
                                        <Feather name="save" size={16} color="#FFF" />
                                        <Text style={styles.saveLevelOrderBtnText}>Save Order</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* Info Banner */}
                    <View style={styles.infoBanner}>
                        <MaterialCommunityIcons name="gesture-swipe" size={20} color="#6366F1" />
                        <Text style={styles.infoText}>
                            Long press to drag • Levels at top = lower rank (Waffler first)
                        </Text>
                    </View>

                    {loading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color="#F59E0B" />
                            <Text style={{ marginTop: 10, color: '#6B7280' }}>Loading Hierarchy...</Text>
                        </View>
                    ) : (
                        <DraggableFlatList
                            data={levelData}
                            onDragEnd={handleLevelDragEnd}
                            keyExtractor={(item) => item.id}
                            renderItem={renderLevelItem}
                            contentContainerStyle={styles.listContainer}
                        />
                    )}
                </View>
            </GestureHandlerRootView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F9FAFB',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        paddingTop: Platform.OS === 'ios' ? 50 : 16,
        backgroundColor: '#FFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
        gap: 12,
    },
    closeBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#F3F4F6',
        justifyContent: 'center',
        alignItems: 'center',
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
    saveLevelOrderBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#10B981',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        gap: 6,
    },
    saveLevelOrderBtnText: {
        color: '#FFF',
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
    },
    infoBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#EEF2FF',
        marginHorizontal: 16,
        marginVertical: 10,
        padding: 12,
        borderRadius: 10,
        gap: 10,
    },
    infoText: {
        flex: 1,
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
        color: '#4F46E5',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    listContainer: {
        padding: 16,
        paddingBottom: 150, // Increased for better scrolling
    },

    // Level Card
    levelContainer: {
        marginBottom: 12,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: '#FFF',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    levelContainerActive: {
        shadowOpacity: 0.2,
        elevation: 8,
        transform: [{ scale: 1.02 }],
    },
    levelHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 16,
        backgroundColor: '#FFF',
    },
    levelHeaderActive: {
        borderColor: '#F59E0B',
        backgroundColor: '#FFFBEB',
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
    },
    dragHandle: {
        marginRight: 8,
    },
    levelIcon: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    levelTitle: {
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
        color: '#111827',
    },
    levelSubtitle: {
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
        color: '#6B7280',
    },
    levelContent: {
        padding: 16,
        borderWidth: 1,
        borderTopWidth: 0,
        borderColor: '#F59E0B',
        borderBottomLeftRadius: 16,
        borderBottomRightRadius: 16,
        backgroundColor: '#FFFBEB',
    },
    instructionText: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#92400E',
        marginBottom: 8,
    },

    // Section
    sectionContainer: {
        marginTop: 12,
        padding: 12,
        backgroundColor: '#FFF',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    sectionTitle: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
        color: '#374151',
        marginBottom: 8,
    },

    // Course Items
    courseItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
        gap: 10,
    },
    assignedCourse: {
        backgroundColor: '#F0FDF4',
        borderRadius: 8,
        marginBottom: 6,
        borderBottomWidth: 0,
    },
    checkbox: {
        width: 22,
        height: 22,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: '#D1D5DB',
        justifyContent: 'center',
        alignItems: 'center',
    },
    checkboxSelected: {
        backgroundColor: '#10B981',
        borderColor: '#10B981',
    },
    courseTitle: {
        flex: 1,
        fontSize: 13,
        fontFamily: 'Poppins_500Medium',
        color: '#374151',
    },
    courseBucket: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        color: '#9CA3AF',
        backgroundColor: '#F3F4F6',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
    },

    // Save Button
    saveBtn: {
        marginTop: 16,
        backgroundColor: '#10B981',
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        shadowColor: '#10B981',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    saveBtnText: {
        color: '#FFF',
        fontSize: 14,
        fontFamily: 'Poppins_700Bold',
    },
});
