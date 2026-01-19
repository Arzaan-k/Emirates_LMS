import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    ScrollView,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import API_URL from '../config';

// Predefined Hierarchy Levels (in order)
const ORDERED_LEVELS = ['Waffler', 'Silver Waffler', 'Gold Waffler', 'Shift Manager', 'Assistant Store Manager'];

export default function AccessControlModal({ visible, onClose }) {
    const [loading, setLoading] = useState(false);
    const [roles, setRoles] = useState([]);
    const [buckets, setBuckets] = useState([]);
    const [allCourses, setAllCourses] = useState([]);
    const [accessRules, setAccessRules] = useState({});

    // State for local changes before saving
    // Structure: { "Waffler": ["course_id_1", "course_id_2"], "Silver Waffler": [...] }
    const [stagedAssignments, setStagedAssignments] = useState({});

    const [expandedRole, setExpandedRole] = useState(null);
    const [expandedBucket, setExpandedBucket] = useState(null);

    useEffect(() => {
        if (visible) {
            fetchData();
        }
    }, [visible]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Hierarchy Roles (We might use hardcoded ORDERED_LEVELS if backend not consistent, 
            // but let's try to match them with what's on server)
            // Ideally backend should return these roles. For now we assume they exist or we create them?
            // Let's rely on access-rules keys and ORDERED_LEVELS.

            // 2. Fetch Buckets
            const bucketRes = await fetch(`${API_URL}/course-buckets`);
            const bucketData = await bucketRes.json();
            setBuckets(bucketData || []);

            // 3. Fetch All Courses - ONLY Career Progression courses for curriculum assignment
            // Self Learning courses are managed separately and should NOT appear in curriculum hierarchy
            const courseRes = await fetch(`${API_URL}/content`);
            const courseData = await courseRes.json();
            // Filter to only include Career Progression courses (exclude self_learning)
            const careerProgressionCourses = (courseData || []).filter(c =>
                c.learning_path_type !== 'self_learning' && c.isPathNode === true
            );
            setAllCourses(careerProgressionCourses);

            // 4. Fetch Access Rules
            const rulesRes = await fetch(`${API_URL}/admin/access-rules`);
            const rulesData = await rulesRes.json();

            // Initialize staged assignments from existing rules
            const initialStaged = {};
            ORDERED_LEVELS.forEach(level => {
                const roleRules = rulesData[level] || {};
                initialStaged[level] = roleRules.accessible_courses || [];
            });
            setStagedAssignments(initialStaged);
            setAccessRules(rulesData);

        } catch (e) {
            console.error("Error fetching access control data:", e);
            Alert.alert("Error", "Failed to load hierarchy configurations.");
        } finally {
            setLoading(false);
        }
    };

    const toggleCourse = (role, courseId) => {
        setStagedAssignments(prev => {
            const currentCourses = prev[role] || [];
            if (currentCourses.includes(courseId)) {
                return { ...prev, [role]: currentCourses.filter(id => id !== courseId) };
            } else {
                return { ...prev, [role]: [...currentCourses, courseId] };
            }
        });
    };

    const handleSave = async (role) => {
        try {
            const courses = stagedAssignments[role] || [];

            // We preserve existing bucket access or other settings if present, 
            // but primarily we care about updating 'accessible_courses'
            const existingRules = accessRules[role] || {};

            const formData = new FormData();
            formData.append('accessible_courses', JSON.stringify(courses));
            formData.append('accessible_buckets', JSON.stringify(existingRules.accessible_buckets || []));
            formData.append('max_courses_visible', String(existingRules.max_courses_visible || -1));

            const res = await fetch(`${API_URL}/admin/access-rules/${role}`, {
                method: 'POST',
                body: formData
            });

            const result = await res.json();
            if (result.status === 'success') {
                Alert.alert("Success", `${role} curriculum updated!`);

                // Update local accessRules to reflect saved state
                setAccessRules({
                    ...accessRules,
                    [role]: { ...existingRules, accessible_courses: courses }
                });
            } else {
                Alert.alert("Error", "Failed to save changes.");
            }
        } catch (e) {
            console.error(e);
            Alert.alert("Error", "Network error while saving.");
        }
    };

    // Helper to group courses by bucket
    const getCoursesInBucket = (bucketName) => {
        return allCourses.filter(c => (c.bucket || "General") === bucketName);
    };

    const countSelectedCourses = (role) => {
        return (stagedAssignments[role] || []).length;
    };

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                        <Feather name="x" size={24} color="#374151" />
                    </TouchableOpacity>
                    <View>
                        <Text style={styles.headerTitle}>Curriculum Hierarchy</Text>
                        <Text style={styles.headerSubtitle}>Assign courses to each progression level</Text>
                    </View>
                    <View style={{ width: 40 }} />
                </View>

                {loading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#F59E0B" />
                        <Text style={{ marginTop: 10, color: '#6B7280' }}>Loading Hierarchy...</Text>
                    </View>
                ) : (
                    <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 50 }}>
                        {ORDERED_LEVELS.map((level, index) => {
                            const isExpanded = expandedRole === level;
                            const selectedCount = countSelectedCourses(level);
                            const isLast = index === ORDERED_LEVELS.length - 1;

                            return (
                                <View key={level} style={styles.levelContainer}>
                                    {/* Connectivity Line */}
                                    {!isLast && <View style={styles.connectorLine} />}

                                    <TouchableOpacity
                                        style={[styles.levelHeader, isExpanded && styles.levelHeaderActive]}
                                        onPress={() => setExpandedRole(isExpanded ? null : level)}
                                    >
                                        <View style={[styles.levelIcon, { backgroundColor: getLevelColor(level) }]}>
                                            <MaterialCommunityIcons name="medal-outline" size={24} color="#FFF" />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.levelTitle}>{level}</Text>
                                            <Text style={styles.levelSubtitle}>
                                                {selectedCount} courses required
                                            </Text>
                                        </View>
                                        <Feather name={isExpanded ? "chevron-up" : "chevron-down"} size={20} color="#6B7280" />
                                    </TouchableOpacity>

                                    {isExpanded && (
                                        <View style={styles.levelContent}>
                                            <Text style={styles.instructionText}>
                                                Select courses users must complete to pass this level:
                                            </Text>

                                            {/* Buckets List */}
                                            {buckets.map(bucket => {
                                                const bucketCourses = getCoursesInBucket(bucket.name);
                                                if (bucketCourses.length === 0) return null;

                                                const bucketKey = `${level}-${bucket.name}`;
                                                const isBucketExpanded = expandedBucket === bucketKey;

                                                // Count selected in this bucket
                                                const assignedInBucket = bucketCourses.filter(c =>
                                                    (stagedAssignments[level] || []).includes(c.id)
                                                ).length;

                                                return (
                                                    <View key={bucket.id} style={styles.bucketContainer}>
                                                        <TouchableOpacity
                                                            style={styles.bucketHeader}
                                                            onPress={() => setExpandedBucket(isBucketExpanded ? null : bucketKey)}
                                                        >
                                                            <View style={[styles.bucketIcon, { backgroundColor: bucket.color + '20' }]}>
                                                                <MaterialCommunityIcons name={bucket.icon || 'folder'} size={16} color={bucket.color} />
                                                            </View>
                                                            <Text style={styles.bucketName}>{bucket.name}</Text>
                                                            <View style={styles.badge}>
                                                                <Text style={styles.badgeText}>{assignedInBucket}/{bucketCourses.length}</Text>
                                                            </View>
                                                        </TouchableOpacity>

                                                        {isBucketExpanded && (
                                                            <View style={styles.courseList}>
                                                                {bucketCourses.map(course => {
                                                                    const isSelected = (stagedAssignments[level] || []).includes(course.id);

                                                                    // Check if assigned to another level
                                                                    let assignedToOther = null;
                                                                    for (const otherRole of ORDERED_LEVELS) {
                                                                        if (otherRole !== level) {
                                                                            if ((stagedAssignments[otherRole] || []).includes(course.id)) {
                                                                                assignedToOther = otherRole;
                                                                                break;
                                                                            }
                                                                        }
                                                                    }

                                                                    const isDisabled = !!assignedToOther;

                                                                    return (
                                                                        <TouchableOpacity
                                                                            key={course.id}
                                                                            style={[styles.courseItem, isDisabled && { opacity: 0.5 }]}
                                                                            onPress={() => !isDisabled && toggleCourse(level, course.id)}
                                                                            disabled={isDisabled}
                                                                        >
                                                                            <View style={[
                                                                                styles.checkbox,
                                                                                isSelected && styles.checkboxSelected,
                                                                                isDisabled && { borderColor: '#E5E7EB', backgroundColor: '#F3F4F6' }
                                                                            ]}>
                                                                                {isSelected && <Feather name="check" size={12} color="#FFF" />}
                                                                            </View>
                                                                            <View style={{ flex: 1 }}>
                                                                                <Text style={[styles.courseTitle, isDisabled && { color: '#9CA3AF' }]}>
                                                                                    {course.title}
                                                                                </Text>
                                                                                {isDisabled && (
                                                                                    <Text style={{ fontSize: 10, color: '#EF4444' }}>
                                                                                        (Assigned to {assignedToOther})
                                                                                    </Text>
                                                                                )}
                                                                            </View>
                                                                        </TouchableOpacity>
                                                                    );
                                                                })}
                                                            </View>
                                                        )}
                                                    </View>
                                                );
                                            })}

                                            <TouchableOpacity
                                                style={styles.saveBtn}
                                                onPress={() => handleSave(level)}
                                            >
                                                <Text style={styles.saveBtnText}>Save {level} Curriculum</Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}
                                </View>
                            );
                        })}
                    </ScrollView>
                )}
            </View>
        </Modal>
    );
}

const getLevelColor = (level) => {
    switch (level) {
        case 'Waffler': return '#9CA3AF'; // Gray
        case 'Silver Waffler': return '#60A5FA'; // Blueish Silver
        case 'Gold Waffler': return '#F59E0B'; // Gold
        case 'Shift Manager': return '#8B5CF6'; // Purple
        case 'Assistant Store Manager': return '#EF4444'; // Red
        default: return '#6B7280';
    }
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F9FAFB',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        backgroundColor: '#FFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
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
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    content: {
        padding: 16,
    },
    levelContainer: {
        marginBottom: 16,
        position: 'relative',
    },
    connectorLine: {
        position: 'absolute',
        left: 28, // Center of the icon (approx)
        top: 60,
        bottom: -20,
        width: 2,
        backgroundColor: '#E5E7EB',
        zIndex: -1,
    },
    levelHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 2,
    },
    levelHeaderActive: {
        borderColor: '#F59E0B',
        backgroundColor: '#FFFBEB',
    },
    levelIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
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
        backgroundColor: '#FFF',
        marginTop: 8,
        marginLeft: 24, // Indent
        borderRadius: 12,
        padding: 16,
        borderLeftWidth: 2,
        borderLeftColor: '#E5E7EB',
    },
    instructionText: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
        marginBottom: 16,
    },
    bucketContainer: {
        marginBottom: 10,
        borderWidth: 1,
        borderColor: '#F3F4F6',
        borderRadius: 10,
        overflow: 'hidden',
    },
    bucketHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        backgroundColor: '#F9FAFB',
    },
    bucketIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10,
    },
    bucketName: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#374151',
        flex: 1,
    },
    badge: {
        backgroundColor: '#E5E7EB',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
    },
    badgeText: {
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
        color: '#4B5563',
    },
    courseList: {
        padding: 8,
        backgroundColor: '#FFF',
    },
    courseItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 4,
    },
    checkbox: {
        width: 20,
        height: 20,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: '#D1D5DB',
        marginRight: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    checkboxSelected: {
        backgroundColor: '#10B981',
        borderColor: '#10B981',
    },
    courseTitle: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        color: '#374151',
        flex: 1,
    },
    saveBtn: {
        marginTop: 16,
        backgroundColor: '#10B981',
        paddingVertical: 12,
        borderRadius: 10,
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
