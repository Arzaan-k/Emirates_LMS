import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    ScrollView,
    TextInput,
    Alert,
    ActivityIndicator,
    Dimensions,
    Platform,
} from 'react-native';
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import API_URL from '../config';

const { width, height } = Dimensions.get('window');

// ===========================================================================
// LEVEL MANAGEMENT MODAL
// ===========================================================================
// Allows admins to:
// - View all levels in the hierarchy
// - Drag and drop to reorder levels
// - Add, edit, delete levels
// - Assign courses to levels with drag-and-drop reordering

export default function LevelManagementModal({ visible, onClose }) {
    const [levels, setLevels] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editingLevel, setEditingLevel] = useState(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showCourseModal, setShowCourseModal] = useState(null);
    const [allCourses, setAllCourses] = useState([]);
    const [hasChanges, setHasChanges] = useState(false);

    // Web drag-and-drop state
    const [draggedIndex, setDraggedIndex] = useState(null);
    const [dragOverIndex, setDragOverIndex] = useState(null);

    // Quiz management state
    const [showQuizModal, setShowQuizModal] = useState(null); // level object when open
    const [quizQuestions, setQuizQuestions] = useState([]);
    const [quizLoading, setQuizLoading] = useState(false);
    const [quizSaving, setQuizSaving] = useState(false);
    const [quizSource, setQuizSource] = useState(null);
    const [editingQuestion, setEditingQuestion] = useState(null); // index of question being edited
    const [editForm, setEditForm] = useState({ question: '', options: ['', '', '', ''], correctIndex: 0 });

    // New level form state
    const [newLevel, setNewLevel] = useState({
        name: '',
        description: '',
        icon: 'account',
        color: '#6B7280',
        min_nodes: 0,
        accessible_buckets: [],
    });

    // Available icons for levels
    const LEVEL_ICONS = [
        'account', 'account-star', 'medal-outline', 'medal', 'trophy',
        'star', 'star-outline', 'crown', 'shield-star', 'certificate',
        'school', 'book-open-variant', 'clock-outline', 'store-outline',
        'store', 'map-marker-radius', 'city', 'earth', 'rocket',
    ];

    // Available colors for levels
    const LEVEL_COLORS = [
        '#6B7280', '#9CA3AF', '#D71A21', '#EF4444', '#10B981',
        '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#14B8A6',
        '#B91C1C', '#059669', '#7C3AED', '#DC2626', '#0891B2',
    ];

    // Fetch levels on mount
    useEffect(() => {
        if (visible) {
            fetchLevels();
            fetchAllCourses();
        }
    }, [visible]);

    const getAuthHeaders = async () => {
        const token = await AsyncStorage.getItem('userToken');
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        };
    };

    const fetchLevels = async () => {
        setLoading(true);
        try {
            const headers = await getAuthHeaders();
            const response = await fetch(`${API_URL}/api/v1/levels/`, { headers });
            const data = await response.json();
            setLevels(data.levels || []);
        } catch (error) {
            console.error('Failed to fetch levels:', error);
            Alert.alert('Error', 'Failed to load levels');
        } finally {
            setLoading(false);
        }
    };

    const fetchAllCourses = async () => {
        try {
            const headers = await getAuthHeaders();
            const response = await fetch(`${API_URL}/api/v1/content`, { headers });
            const data = await response.json();
            setAllCourses(data || []);
        } catch (error) {
            console.error('Failed to fetch courses:', error);
        }
    };

    // ===========================================================================
    // QUIZ MANAGEMENT FUNCTIONS
    // ===========================================================================
    const fetchQuizQuestions = async (levelName) => {
        setQuizLoading(true);
        try {
            const headers = await getAuthHeaders();
            const response = await fetch(`${API_URL}/api/v1/levels/exam-questions/${encodeURIComponent(levelName)}`, { headers });
            const data = await response.json();
            if (data.status === 'success' && data.data) {
                setQuizQuestions(data.data.questions || []);
                setQuizSource(data.data.source || null);
            } else {
                setQuizQuestions([]);
                setQuizSource(null);
            }
        } catch (error) {
            console.error('Failed to fetch quiz questions:', error);
            setQuizQuestions([]);
        } finally {
            setQuizLoading(false);
        }
    };

    const saveQuizQuestions = async () => {
        if (!showQuizModal) return;
        setQuizSaving(true);
        try {
            const headers = await getAuthHeaders();
            const response = await fetch(`${API_URL}/api/v1/levels/exam-questions/${encodeURIComponent(showQuizModal.name)}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify({ questions: quizQuestions, updated_by: 'admin' }),
            });
            const data = await response.json();
            if (data.status === 'success') {
                Alert.alert('Success', 'Quiz questions saved!');
                setQuizSource(data.data?.source || 'manual');
            } else {
                Alert.alert('Error', data.message || 'Failed to save questions');
            }
        } catch (error) {
            console.error('Failed to save quiz questions:', error);
            Alert.alert('Error', 'Failed to save quiz questions');
        } finally {
            setQuizSaving(false);
        }
    };

    const regenerateQuizQuestions = async () => {
        if (!showQuizModal) return;
        Alert.alert(
            'Regenerate Questions',
            'This will overwrite all existing questions with AI-generated ones. Continue?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Regenerate', style: 'destructive', onPress: async () => {
                        setQuizLoading(true);
                        try {
                            const headers = await getAuthHeaders();
                            const response = await fetch(`${API_URL}/api/v1/levels/exam-questions/${encodeURIComponent(showQuizModal.name)}/regenerate`, {
                                method: 'POST',
                                headers,
                            });
                            const data = await response.json();
                            if (data.status === 'success' && data.data) {
                                setQuizQuestions(data.data.questions || []);
                                setQuizSource('ai_generated');
                                Alert.alert('Success', `Generated ${data.data.question_count} questions!`);
                            } else {
                                Alert.alert('Error', data.message || 'Failed to regenerate');
                            }
                        } catch (error) {
                            console.error('Failed to regenerate quiz:', error);
                            Alert.alert('Error', 'Failed to regenerate questions');
                        } finally {
                            setQuizLoading(false);
                        }
                    }
                }
            ]
        );
    };

    const openQuizModal = (level) => {
        setShowQuizModal(level);
        setEditingQuestion(null);
        fetchQuizQuestions(level.name);
    };

    const startEditQuestion = (index) => {
        const q = quizQuestions[index];
        setEditForm({
            question: q.question || '',
            options: [...(q.options || ['', '', '', ''])],
            correctIndex: q.correctIndex || 0,
        });
        setEditingQuestion(index);
    };

    const saveEditQuestion = () => {
        if (!editForm.question.trim()) {
            Alert.alert('Error', 'Question text is required');
            return;
        }
        const validOptions = editForm.options.filter(o => o.trim());
        if (validOptions.length < 2) {
            Alert.alert('Error', 'At least 2 options are required');
            return;
        }
        const updated = [...quizQuestions];
        updated[editingQuestion] = {
            ...updated[editingQuestion],
            question: editForm.question,
            options: editForm.options,
            correctIndex: editForm.correctIndex,
        };
        setQuizQuestions(updated);
        setEditingQuestion(null);
    };

    const addNewQuestion = () => {
        setQuizQuestions([...quizQuestions, {
            question: 'New Question',
            options: ['Option A', 'Option B', 'Option C', 'Option D'],
            correctIndex: 0,
        }]);
        // Auto-open edit for the new question
        const newIdx = quizQuestions.length;
        setEditForm({
            question: 'New Question',
            options: ['Option A', 'Option B', 'Option C', 'Option D'],
            correctIndex: 0,
        });
        setEditingQuestion(newIdx);
    };

    const deleteQuestion = (index) => {
        Alert.alert('Delete Question', `Delete question ${index + 1}?`, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete', style: 'destructive', onPress: () => {
                    const updated = quizQuestions.filter((_, i) => i !== index);
                    setQuizQuestions(updated);
                    if (editingQuestion === index) setEditingQuestion(null);
                }
            }
        ]);
    };

    // Handle drag-end for levels reordering
    const handleLevelDragEnd = useCallback(({ data }) => {
        setLevels(data);
        setHasChanges(true);
    }, []);

    // Save reordered levels to backend
    const saveReorder = async () => {
        setSaving(true);
        try {
            const headers = await getAuthHeaders();
            const levelOrder = levels.map(l => l.id);

            const response = await fetch(`${API_URL}/api/v1/levels/reorder`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ level_order: levelOrder }),
            });

            if (!response.ok) throw new Error('Failed to save');

            const data = await response.json();
            setLevels(data.levels);
            setHasChanges(false);
            Alert.alert('Success', 'Level order saved!');
        } catch (error) {
            console.error('Failed to save reorder:', error);
            Alert.alert('Error', 'Failed to save level order');
        } finally {
            setSaving(false);
        }
    };

    // Create new level
    const handleCreateLevel = async () => {
        if (!newLevel.name.trim()) {
            Alert.alert('Error', 'Level name is required');
            return;
        }

        setSaving(true);
        try {
            const headers = await getAuthHeaders();
            const response = await fetch(`${API_URL}/api/v1/levels/`, {
                method: 'POST',
                headers,
                body: JSON.stringify(newLevel),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to create level');
            }

            await fetchLevels();
            setShowAddModal(false);
            setNewLevel({
                name: '',
                description: '',
                icon: 'account',
                color: '#6B7280',
                min_nodes: 0,
                accessible_buckets: [],
            });
            Alert.alert('Success', 'Level created!');
        } catch (error) {
            Alert.alert('Error', error.message);
        } finally {
            setSaving(false);
        }
    };

    // Update existing level
    const handleUpdateLevel = async () => {
        if (!editingLevel) return;

        setSaving(true);
        try {
            const headers = await getAuthHeaders();
            const response = await fetch(`${API_URL}/api/v1/levels/${editingLevel.id}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify(editingLevel),
            });

            if (!response.ok) throw new Error('Failed to update');

            await fetchLevels();
            setEditingLevel(null);
            Alert.alert('Success', 'Level updated!');
        } catch (error) {
            console.error('Failed to update level:', error);
            Alert.alert('Error', 'Failed to update level');
        } finally {
            setSaving(false);
        }
    };

    // Web-specific drag handlers using HTML5 Drag and Drop API
    const handleWebDragStart = (e, index) => {
        if (Platform.OS !== 'web') return;
        setDraggedIndex(index);
        e.dataTransfer.effectAllowed = 'move';
        // Store index in dataTransfer for compatibility
        e.dataTransfer.setData('text/plain', index.toString());
    };

    const handleWebDragOver = (e, index) => {
        if (Platform.OS !== 'web') return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverIndex(index);
    };

    const handleWebDragLeave = (e) => {
        if (Platform.OS !== 'web') return;
        setDragOverIndex(null);
    };

    const handleWebDrop = (e, dropIndex) => {
        if (Platform.OS !== 'web' || draggedIndex === null) return;
        e.preventDefault();

        const dragIndex = draggedIndex;
        if (dragIndex === dropIndex) {
            setDraggedIndex(null);
            setDragOverIndex(null);
            return;
        }

        // Reorder the array
        const newLevels = [...levels];
        const [draggedItem] = newLevels.splice(dragIndex, 1);
        newLevels.splice(dropIndex, 0, draggedItem);

        // Update order property for each level
        const reorderedLevels = newLevels.map((level, idx) => ({
            ...level,
            order: idx + 1
        }));

        setLevels(reorderedLevels);
        setHasChanges(true);
        setDraggedIndex(null);
        setDragOverIndex(null);
    };

    const handleWebDragEnd = () => {
        if (Platform.OS !== 'web') return;
        setDraggedIndex(null);
        setDragOverIndex(null);
    };

    // Delete level
    const handleDeleteLevel = (level) => {
        Alert.alert(
            'Delete Level',
            `Are you sure you want to delete "${level.name}"? This action cannot be undone.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const headers = await getAuthHeaders();
                            await fetch(`${API_URL}/api/v1/levels/${level.id}`, {
                                method: 'DELETE',
                                headers,
                            });
                            await fetchLevels();
                            Alert.alert('Success', 'Level deleted');
                        } catch (error) {
                            Alert.alert('Error', 'Failed to delete level');
                        }
                    },
                },
            ]
        );
    };

    // Render individual level item (draggable)
    const renderLevelItem = useCallback(({ item, drag, isActive }) => {
        return (
            <ScaleDecorator>
                <TouchableOpacity
                    onLongPress={drag}
                    disabled={isActive}
                    style={[
                        styles.levelCard,
                        isActive && styles.levelCardActive,
                        { borderLeftColor: item.color, borderLeftWidth: 4 }
                    ]}
                >
                    {/* Drag Handle */}
                    <View style={styles.dragHandle}>
                        <MaterialCommunityIcons name="drag" size={24} color="#9CA3AF" />
                    </View>

                    {/* Level Info */}
                    <View style={styles.levelInfo}>
                        <View style={styles.levelHeader}>
                            <View style={[styles.levelIconContainer, { backgroundColor: `${item.color}20` }]}>
                                <MaterialCommunityIcons name={item.icon} size={24} color={item.color} />
                            </View>
                            <View style={styles.levelTitleContainer}>
                                <Text style={styles.levelName}>{item.name}</Text>
                                <Text style={styles.levelDescription}>
                                    {item.description || 'No description'}
                                </Text>
                            </View>
                        </View>

                        {/* Level Stats */}
                        <View style={styles.levelStats}>
                            <View style={styles.statBadge}>
                                <MaterialCommunityIcons name="sort-numeric-ascending" size={12} color="#6B7280" />
                                <Text style={styles.statText}>Order: {item.order}</Text>
                            </View>
                            <View style={styles.statBadge}>
                                <MaterialCommunityIcons name="book-multiple" size={12} color="#6B7280" />
                                <Text style={styles.statText}>
                                    {(item.courses || []).length} courses
                                </Text>
                            </View>
                            <View style={styles.statBadge}>
                                <MaterialCommunityIcons name="target" size={12} color="#6B7280" />
                                <Text style={styles.statText}>{item.min_nodes} nodes</Text>
                            </View>
                        </View>
                    </View>

                    {/* Actions */}
                    <View style={styles.levelActions}>
                        <TouchableOpacity
                            style={styles.actionBtn}
                            onPress={() => openQuizModal(item)}
                        >
                            <MaterialCommunityIcons name="help-circle-outline" size={20} color="#6366F1" />
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.actionBtn}
                            onPress={() => setShowCourseModal(item)}
                        >
                            <MaterialCommunityIcons name="playlist-edit" size={20} color="#3B82F6" />
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.actionBtn}
                            onPress={() => setEditingLevel({ ...item })}
                        >
                            <Feather name="edit-2" size={18} color="#D71A21" />
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.actionBtn}
                            onPress={() => handleDeleteLevel(item)}
                        >
                            <Feather name="trash-2" size={18} color="#EF4444" />
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </ScaleDecorator>
        );
    }, []);

    // ===========================================================================
    // COURSE ASSIGNMENT MODAL
    // ===========================================================================
    const renderCourseModal = () => {
        if (!showCourseModal) return null;

        const levelCourses = (showCourseModal.courses || [])
            .map(id => allCourses.find(c => c.id === id))
            .filter(Boolean);

        const availableCourses = allCourses.filter(
            c => !showCourseModal.courses?.includes(c.id)
        );

        const handleCourseDragEnd = async ({ data }) => {
            const newOrder = data.map(c => c.id);
            try {
                const headers = await getAuthHeaders();
                await fetch(`${API_URL}/api/v1/levels/${showCourseModal.id}/courses/reorder`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ course_order: newOrder }),
                });
                setShowCourseModal({ ...showCourseModal, courses: newOrder });
                fetchLevels();
            } catch (error) {
                Alert.alert('Error', 'Failed to reorder courses');
            }
        };

        const assignCourse = async (courseId) => {
            try {
                const headers = await getAuthHeaders();
                await fetch(`${API_URL}/api/v1/levels/${showCourseModal.id}/courses`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ course_id: courseId }),
                });
                setShowCourseModal({
                    ...showCourseModal,
                    courses: [...(showCourseModal.courses || []), courseId],
                });
                fetchLevels();
            } catch (error) {
                Alert.alert('Error', 'Failed to assign course');
            }
        };

        const removeCourse = async (courseId) => {
            try {
                const headers = await getAuthHeaders();
                await fetch(`${API_URL}/api/v1/levels/${showCourseModal.id}/courses/${courseId}`, {
                    method: 'DELETE',
                    headers,
                });
                setShowCourseModal({
                    ...showCourseModal,
                    courses: (showCourseModal.courses || []).filter(id => id !== courseId),
                });
                fetchLevels();
            } catch (error) {
                Alert.alert('Error', 'Failed to remove course');
            }
        };

        return (
            <Modal visible={true} animationType="slide" presentationStyle="pageSheet">
                <GestureHandlerRootView style={{ flex: 1 }}>
                    <View style={styles.modalContainer}>
                        {/* Header */}
                        <View style={styles.modalHeader}>
                            <View>
                                <Text style={styles.modalTitle}>
                                    Courses for {showCourseModal.name}
                                </Text>
                                <Text style={styles.modalSubtitle}>
                                    Drag to reorder • Tap + to add
                                </Text>
                            </View>
                            <TouchableOpacity onPress={() => setShowCourseModal(null)}>
                                <Feather name="x" size={24} color="#6B7280" />
                            </TouchableOpacity>
                        </View>

                        {/* Assigned Courses (Draggable) */}
                        <Text style={styles.sectionTitle}>
                            Assigned Courses ({levelCourses.length})
                        </Text>

                        {levelCourses.length > 0 ? (
                            <DraggableFlatList
                                data={levelCourses}
                                onDragEnd={handleCourseDragEnd}
                                keyExtractor={(item) => item.id}
                                renderItem={({ item, drag, isActive }) => (
                                    <ScaleDecorator>
                                        <TouchableOpacity
                                            onLongPress={drag}
                                            disabled={isActive}
                                            style={[
                                                styles.courseCard,
                                                isActive && styles.courseCardActive,
                                            ]}
                                        >
                                            <MaterialCommunityIcons name="drag" size={20} color="#9CA3AF" />
                                            <View style={styles.courseInfo}>
                                                <Text style={styles.courseName} numberOfLines={1}>
                                                    {item.title}
                                                </Text>
                                                <Text style={styles.courseBucket}>
                                                    {item.bucket || 'No bucket'}
                                                </Text>
                                            </View>
                                            <TouchableOpacity
                                                onPress={() => removeCourse(item.id)}
                                                style={styles.removeCourseBtn}
                                            >
                                                <Feather name="x" size={18} color="#EF4444" />
                                            </TouchableOpacity>
                                        </TouchableOpacity>
                                    </ScaleDecorator>
                                )}
                                style={{ maxHeight: height * 0.35 }}
                            />
                        ) : (
                            <View style={styles.emptyState}>
                                <MaterialCommunityIcons name="book-off-outline" size={40} color="#D1D5DB" />
                                <Text style={styles.emptyText}>No courses assigned</Text>
                            </View>
                        )}

                        {/* Available Courses */}
                        <Text style={[styles.sectionTitle, { marginTop: 20 }]}>
                            Available Courses ({availableCourses.length})
                        </Text>

                        <ScrollView style={{ maxHeight: height * 0.3 }}>
                            {availableCourses.map(course => (
                                <TouchableOpacity
                                    key={course.id}
                                    style={styles.availableCourseCard}
                                    onPress={() => assignCourse(course.id)}
                                >
                                    <View style={styles.courseInfo}>
                                        <Text style={styles.courseName} numberOfLines={1}>
                                            {course.title}
                                        </Text>
                                        <Text style={styles.courseBucket}>
                                            {course.bucket || 'No bucket'}
                                        </Text>
                                    </View>
                                    <MaterialCommunityIcons name="plus-circle" size={24} color="#10B981" />
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </GestureHandlerRootView>
            </Modal>
        );
    };

    // ===========================================================================
    // EDIT LEVEL MODAL
    // ===========================================================================
    const renderEditModal = () => {
        if (!editingLevel) return null;

        return (
            <Modal visible={true} animationType="slide" presentationStyle="pageSheet">
                <View style={styles.modalContainer}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Edit Level</Text>
                        <TouchableOpacity onPress={() => setEditingLevel(null)}>
                            <Feather name="x" size={24} color="#6B7280" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={styles.formContainer}>
                        {/* Name */}
                        <Text style={styles.inputLabel}>Level Name *</Text>
                        <TextInput
                            style={styles.input}
                            value={editingLevel.name}
                            onChangeText={(text) => setEditingLevel({ ...editingLevel, name: text })}
                            placeholder="e.g., Gold Crew"
                        />

                        {/* Description */}
                        <Text style={styles.inputLabel}>Description</Text>
                        <TextInput
                            style={[styles.input, styles.textArea]}
                            value={editingLevel.description}
                            onChangeText={(text) => setEditingLevel({ ...editingLevel, description: text })}
                            placeholder="Brief description of this level"
                            multiline
                        />

                        {/* Min Nodes */}
                        <Text style={styles.inputLabel}>Minimum Nodes Required</Text>
                        <TextInput
                            style={styles.input}
                            value={String(editingLevel.min_nodes || 0)}
                            onChangeText={(text) => setEditingLevel({ ...editingLevel, min_nodes: parseInt(text) || 0 })}
                            keyboardType="numeric"
                        />

                        {/* Icon Selection */}
                        <Text style={styles.inputLabel}>Icon</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.iconPicker}>
                            {LEVEL_ICONS.map(icon => (
                                <TouchableOpacity
                                    key={icon}
                                    style={[
                                        styles.iconOption,
                                        editingLevel.icon === icon && styles.iconOptionSelected,
                                    ]}
                                    onPress={() => setEditingLevel({ ...editingLevel, icon })}
                                >
                                    <MaterialCommunityIcons
                                        name={icon}
                                        size={24}
                                        color={editingLevel.icon === icon ? '#FFF' : '#6B7280'}
                                    />
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        {/* Color Selection */}
                        <Text style={styles.inputLabel}>Color</Text>
                        <View style={styles.colorPicker}>
                            {LEVEL_COLORS.map(color => (
                                <TouchableOpacity
                                    key={color}
                                    style={[
                                        styles.colorOption,
                                        { backgroundColor: color },
                                        editingLevel.color === color && styles.colorOptionSelected,
                                    ]}
                                    onPress={() => setEditingLevel({ ...editingLevel, color })}
                                >
                                    {editingLevel.color === color && (
                                        <Feather name="check" size={16} color="#FFF" />
                                    )}
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* Save Button */}
                        <TouchableOpacity
                            style={styles.saveBtn}
                            onPress={handleUpdateLevel}
                            disabled={saving}
                        >
                            {saving ? (
                                <ActivityIndicator color="#FFF" />
                            ) : (
                                <>
                                    <Feather name="check" size={20} color="#FFF" />
                                    <Text style={styles.saveBtnText}>Save Changes</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </ScrollView>
                </View>
            </Modal>
        );
    };

    // ===========================================================================
    // ADD LEVEL MODAL
    // ===========================================================================
    const renderAddModal = () => {
        if (!showAddModal) return null;

        return (
            <Modal visible={true} animationType="slide" presentationStyle="pageSheet">
                <View style={styles.modalContainer}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Add New Level</Text>
                        <TouchableOpacity onPress={() => setShowAddModal(false)}>
                            <Feather name="x" size={24} color="#6B7280" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={styles.formContainer}>
                        {/* Name */}
                        <Text style={styles.inputLabel}>Level Name *</Text>
                        <TextInput
                            style={styles.input}
                            value={newLevel.name}
                            onChangeText={(text) => setNewLevel({ ...newLevel, name: text })}
                            placeholder="e.g., Diamond Crew Member"
                        />

                        {/* Description */}
                        <Text style={styles.inputLabel}>Description</Text>
                        <TextInput
                            style={[styles.input, styles.textArea]}
                            value={newLevel.description}
                            onChangeText={(text) => setNewLevel({ ...newLevel, description: text })}
                            placeholder="Brief description of this level"
                            multiline
                        />

                        {/* Min Nodes */}
                        <Text style={styles.inputLabel}>Minimum Nodes Required</Text>
                        <TextInput
                            style={styles.input}
                            value={String(newLevel.min_nodes)}
                            onChangeText={(text) => setNewLevel({ ...newLevel, min_nodes: parseInt(text) || 0 })}
                            keyboardType="numeric"
                        />

                        {/* Icon Selection */}
                        <Text style={styles.inputLabel}>Icon</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.iconPicker}>
                            {LEVEL_ICONS.map(icon => (
                                <TouchableOpacity
                                    key={icon}
                                    style={[
                                        styles.iconOption,
                                        newLevel.icon === icon && styles.iconOptionSelected,
                                    ]}
                                    onPress={() => setNewLevel({ ...newLevel, icon })}
                                >
                                    <MaterialCommunityIcons
                                        name={icon}
                                        size={24}
                                        color={newLevel.icon === icon ? '#FFF' : '#6B7280'}
                                    />
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        {/* Color Selection */}
                        <Text style={styles.inputLabel}>Color</Text>
                        <View style={styles.colorPicker}>
                            {LEVEL_COLORS.map(color => (
                                <TouchableOpacity
                                    key={color}
                                    style={[
                                        styles.colorOption,
                                        { backgroundColor: color },
                                        newLevel.color === color && styles.colorOptionSelected,
                                    ]}
                                    onPress={() => setNewLevel({ ...newLevel, color })}
                                >
                                    {newLevel.color === color && (
                                        <Feather name="check" size={16} color="#FFF" />
                                    )}
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* Create Button */}
                        <TouchableOpacity
                            style={[styles.saveBtn, { backgroundColor: '#10B981' }]}
                            onPress={handleCreateLevel}
                            disabled={saving}
                        >
                            {saving ? (
                                <ActivityIndicator color="#FFF" />
                            ) : (
                                <>
                                    <Feather name="plus" size={20} color="#FFF" />
                                    <Text style={styles.saveBtnText}>Create Level</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </ScrollView>
                </View>
            </Modal>
        );
    };

    // ===========================================================================
    // QUIZ MANAGEMENT MODAL
    // ===========================================================================
    const renderQuizModal = () => {
        if (!showQuizModal) return null;

        return (
            <Modal visible={true} animationType="slide" presentationStyle="pageSheet">
                <View style={styles.modalContainer}>
                    {/* Header */}
                    <View style={styles.modalHeader}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.modalTitle}>Level Exam Questions</Text>
                            <Text style={styles.modalSubtitle}>
                                {showQuizModal.name} • {quizQuestions.length} questions
                                {quizSource ? ` • ${quizSource === 'ai_generated' ? 'AI Generated' : quizSource === 'manual' ? 'Manually Edited' : 'Mixed'}` : ''}
                            </Text>
                        </View>
                        <TouchableOpacity onPress={() => { setShowQuizModal(null); setEditingQuestion(null); }}>
                            <Feather name="x" size={24} color="#6B7280" />
                        </TouchableOpacity>
                    </View>

                    {/* Action Bar */}
                    <View style={quizStyles.actionBar}>
                        <TouchableOpacity style={quizStyles.addBtn} onPress={addNewQuestion}>
                            <Feather name="plus" size={16} color="#FFF" />
                            <Text style={quizStyles.addBtnText}>Add Question</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={quizStyles.regenerateBtn} onPress={regenerateQuizQuestions} disabled={quizLoading}>
                            <MaterialCommunityIcons name="robot" size={16} color="#6366F1" />
                            <Text style={quizStyles.regenerateBtnText}>AI Regenerate</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[quizStyles.saveAllBtn, quizSaving && { opacity: 0.6 }]}
                            onPress={saveQuizQuestions}
                            disabled={quizSaving}
                        >
                            {quizSaving ? (
                                <ActivityIndicator size="small" color="#FFF" />
                            ) : (
                                <>
                                    <Feather name="save" size={16} color="#FFF" />
                                    <Text style={quizStyles.saveAllBtnText}>Save All</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>

                    {/* Questions List */}
                    {quizLoading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color="#D71A21" />
                            <Text style={styles.loadingText}>Loading questions...</Text>
                        </View>
                    ) : (
                        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
                            {quizQuestions.length === 0 ? (
                                <View style={styles.emptyState}>
                                    <MaterialCommunityIcons name="help-circle-outline" size={48} color="#D1D5DB" />
                                    <Text style={styles.emptyText}>No questions yet</Text>
                                    <Text style={{ color: '#9CA3AF', fontSize: 12, marginTop: 4, textAlign: 'center' }}>
                                        Add questions manually or use AI to generate them from course content
                                    </Text>
                                </View>
                            ) : (
                                quizQuestions.map((q, idx) => (
                                    <View key={idx} style={quizStyles.questionCard}>
                                        {editingQuestion === idx ? (
                                            /* EDIT MODE */
                                            <View>
                                                <Text style={quizStyles.editLabel}>Question {idx + 1}</Text>
                                                <TextInput
                                                    style={[styles.input, { marginBottom: 10 }]}
                                                    value={editForm.question}
                                                    onChangeText={(t) => setEditForm({ ...editForm, question: t })}
                                                    placeholder="Enter question text"
                                                    multiline
                                                />
                                                {editForm.options.map((opt, oIdx) => (
                                                    <View key={oIdx} style={quizStyles.optionEditRow}>
                                                        <TouchableOpacity
                                                            style={[
                                                                quizStyles.correctToggle,
                                                                editForm.correctIndex === oIdx && quizStyles.correctToggleActive
                                                            ]}
                                                            onPress={() => setEditForm({ ...editForm, correctIndex: oIdx })}
                                                        >
                                                            <Feather
                                                                name={editForm.correctIndex === oIdx ? "check-circle" : "circle"}
                                                                size={18}
                                                                color={editForm.correctIndex === oIdx ? "#10B981" : "#9CA3AF"}
                                                            />
                                                        </TouchableOpacity>
                                                        <TextInput
                                                            style={[styles.input, { flex: 1, marginBottom: 0 }]}
                                                            value={opt}
                                                            onChangeText={(t) => {
                                                                const newOpts = [...editForm.options];
                                                                newOpts[oIdx] = t;
                                                                setEditForm({ ...editForm, options: newOpts });
                                                            }}
                                                            placeholder={`Option ${oIdx + 1}`}
                                                        />
                                                    </View>
                                                ))}
                                                <View style={quizStyles.editActions}>
                                                    <TouchableOpacity style={quizStyles.cancelEditBtn} onPress={() => setEditingQuestion(null)}>
                                                        <Text style={{ color: '#6B7280', fontFamily: 'Poppins_500Medium' }}>Cancel</Text>
                                                    </TouchableOpacity>
                                                    <TouchableOpacity style={quizStyles.saveEditBtn} onPress={saveEditQuestion}>
                                                        <Feather name="check" size={16} color="#FFF" />
                                                        <Text style={{ color: '#FFF', fontFamily: 'Poppins_600SemiBold', marginLeft: 4 }}>Save</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            </View>
                                        ) : (
                                            /* VIEW MODE */
                                            <View>
                                                <View style={quizStyles.questionHeader}>
                                                    <Text style={quizStyles.questionNumber}>Q{idx + 1}</Text>
                                                    <View style={quizStyles.questionActions}>
                                                        <TouchableOpacity onPress={() => startEditQuestion(idx)} style={{ padding: 4 }}>
                                                            <Feather name="edit-2" size={16} color="#D71A21" />
                                                        </TouchableOpacity>
                                                        <TouchableOpacity onPress={() => deleteQuestion(idx)} style={{ padding: 4 }}>
                                                            <Feather name="trash-2" size={16} color="#EF4444" />
                                                        </TouchableOpacity>
                                                    </View>
                                                </View>
                                                <Text style={quizStyles.questionText}>{q.question}</Text>
                                                {(q.options || []).map((opt, oIdx) => (
                                                    <View key={oIdx} style={[
                                                        quizStyles.optionRow,
                                                        oIdx === q.correctIndex && quizStyles.correctOption
                                                    ]}>
                                                        <Text style={[
                                                            quizStyles.optionText,
                                                            oIdx === q.correctIndex && { color: '#059669', fontFamily: 'Poppins_600SemiBold' }
                                                        ]}>
                                                            {String.fromCharCode(65 + oIdx)}. {opt}
                                                        </Text>
                                                        {oIdx === q.correctIndex && (
                                                            <Feather name="check-circle" size={14} color="#10B981" />
                                                        )}
                                                    </View>
                                                ))}
                                            </View>
                                        )}
                                    </View>
                                ))
                            )}
                        </ScrollView>
                    )}
                </View>
            </Modal>
        );
    };

    // ===========================================================================
    // MAIN RENDER
    // ===========================================================================
    return (
        <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
            <GestureHandlerRootView style={{ flex: 1 }}>
                <View style={styles.container}>
                    {/* Header */}
                    <View style={styles.header}>
                        <View>
                            <Text style={styles.title}>Level Hierarchy</Text>
                            <Text style={styles.subtitle}>
                                Drag to reorder • Long press to move
                            </Text>
                        </View>
                        <View style={styles.headerActions}>
                            {hasChanges && (
                                <TouchableOpacity
                                    style={styles.saveOrderBtn}
                                    onPress={saveReorder}
                                    disabled={saving}
                                >
                                    {saving ? (
                                        <ActivityIndicator size="small" color="#FFF" />
                                    ) : (
                                        <>
                                            <Feather name="save" size={16} color="#FFF" />
                                            <Text style={styles.saveOrderBtnText}>Save</Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                                <Feather name="x" size={24} color="#6B7280" />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Add Level Button */}
                    <TouchableOpacity
                        style={styles.addLevelBtn}
                        onPress={() => setShowAddModal(true)}
                    >
                        <MaterialCommunityIcons name="plus-circle" size={24} color="#10B981" />
                        <Text style={styles.addLevelBtnText}>Add New Level</Text>
                    </TouchableOpacity>

                    {/* Levels List */}
                    {loading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color="#D71A21" />
                            <Text style={styles.loadingText}>Loading levels...</Text>
                        </View>
                    ) : Platform.OS === 'web' ? (
                        /* WEB: Simplified UI with Buttons for Reordering */
                        <ScrollView
                            style={styles.webScrollContainer}
                            contentContainerStyle={styles.listContainer}
                            showsVerticalScrollIndicator={true}
                            nestedScrollEnabled={true}
                        >
                            {levels.map((item, index) => {
                                return (
                                    <View
                                        key={item.id}
                                        style={[
                                            styles.levelCard,
                                            {
                                                borderLeftColor: item.color,
                                                borderLeftWidth: 4,
                                            }
                                        ]}
                                    >
                                        {/* Move Up/Down Buttons */}
                                        <View style={styles.moveButtonsContainer}>
                                            <TouchableOpacity
                                                onPress={() => {
                                                    if (index > 0) {
                                                        const newLevels = [...levels];
                                                        [newLevels[index - 1], newLevels[index]] = [newLevels[index], newLevels[index - 1]];
                                                        const reordered = newLevels.map((l, i) => ({ ...l, order: i + 1 }));
                                                        setLevels(reordered);
                                                        setHasChanges(true);
                                                    }
                                                }}
                                                disabled={index === 0}
                                                style={[styles.moveButton, index === 0 && styles.moveButtonDisabled]}
                                            >
                                                <MaterialCommunityIcons name="chevron-up" size={18} color={index === 0 ? "#D1D5DB" : "#6B7280"} />
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                onPress={() => {
                                                    if (index < levels.length - 1) {
                                                        const newLevels = [...levels];
                                                        [newLevels[index], newLevels[index + 1]] = [newLevels[index + 1], newLevels[index]];
                                                        const reordered = newLevels.map((l, i) => ({ ...l, order: i + 1 }));
                                                        setLevels(reordered);
                                                        setHasChanges(true);
                                                    }
                                                }}
                                                disabled={index === levels.length - 1}
                                                style={[styles.moveButton, index === levels.length - 1 && styles.moveButtonDisabled]}
                                            >
                                                <MaterialCommunityIcons name="chevron-down" size={18} color={index === levels.length - 1 ? "#D1D5DB" : "#6B7280"} />
                                            </TouchableOpacity>
                                        </View>

                                        {/* Level Info */}
                                        <View style={styles.levelInfo}>
                                            <View style={styles.levelHeader}>
                                                <View style={[styles.levelIconContainer, { backgroundColor: `${item.color}20` }]}>
                                                    <MaterialCommunityIcons name={item.icon} size={24} color={item.color} />
                                                </View>
                                                <View style={styles.levelTitleContainer}>
                                                    <Text style={styles.levelName}>{item.name}</Text>
                                                    <Text style={styles.levelDescription}>
                                                        {item.description || 'No description'}
                                                    </Text>
                                                </View>
                                            </View>

                                            {/* Level Stats */}
                                            <View style={styles.levelStats}>
                                                <View style={styles.statBadge}>
                                                    <MaterialCommunityIcons name="sort-numeric-ascending" size={12} color="#6B7280" />
                                                    <Text style={styles.statText}>Order: {index + 1}</Text>
                                                </View>
                                                <View style={styles.statBadge}>
                                                    <MaterialCommunityIcons name="book-multiple" size={12} color="#6B7280" />
                                                    <Text style={styles.statText}>
                                                        {(item.courses || []).length} courses
                                                    </Text>
                                                </View>
                                                <View style={styles.statBadge}>
                                                    <MaterialCommunityIcons name="target" size={12} color="#6B7280" />
                                                    <Text style={styles.statText}>{item.min_nodes} nodes</Text>
                                                </View>
                                            </View>
                                        </View>

                                        {/* Actions */}
                                        <View style={styles.levelActions}>
                                            <TouchableOpacity
                                                style={styles.actionBtn}
                                                onPress={() => openQuizModal(item)}
                                            >
                                                <MaterialCommunityIcons name="help-circle-outline" size={20} color="#6366F1" />
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={styles.actionBtn}
                                                onPress={() => setShowCourseModal(item)}
                                            >
                                                <MaterialCommunityIcons name="playlist-edit" size={20} color="#3B82F6" />
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={styles.actionBtn}
                                                onPress={() => setEditingLevel({ ...item })}
                                            >
                                                <Feather name="edit-2" size={18} color="#D71A21" />
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={styles.actionBtn}
                                                onPress={() => handleDeleteLevel(item)}
                                            >
                                                <Feather name="trash-2" size={18} color="#EF4444" />
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                );
                            })}
                        </ScrollView>
                    ) : (
                        <DraggableFlatList
                            data={levels}
                            onDragEnd={handleLevelDragEnd}
                            keyExtractor={(item) => item.id}
                            renderItem={renderLevelItem}
                            contentContainerStyle={styles.listContainer}
                        />
                    )}

                    {/* Info Banner */}
                    <View style={styles.infoBanner}>
                        <MaterialCommunityIcons name="information-outline" size={20} color="#6366F1" />
                        <Text style={styles.infoText}>
                            Users can access courses from their level and all lower levels
                        </Text>
                    </View>
                </View>

                {/* Sub-modals */}
                {renderEditModal()}
                {renderAddModal()}
                {renderCourseModal()}
                {renderQuizModal()}
            </GestureHandlerRootView>
        </Modal>
    );
}

// ===========================================================================
// STYLES
// ===========================================================================
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F9FAFB',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        paddingTop: Platform.OS === 'ios' ? 60 : 20,
        backgroundColor: '#FFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    title: {
        fontSize: 24,
        fontFamily: 'Poppins_700Bold',
        color: '#111827',
    },
    subtitle: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    closeBtn: {
        padding: 8,
    },
    saveOrderBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#10B981',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        gap: 6,
    },
    saveOrderBtnText: {
        color: '#FFF',
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 14,
    },
    addLevelBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#ECFDF5',
        margin: 16,
        padding: 16,
        borderRadius: 12,
        borderWidth: 2,
        borderStyle: 'dashed',
        borderColor: '#10B981',
        gap: 8,
    },
    addLevelBtnText: {
        color: '#10B981',
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 16,
    },
    listContainer: {
        padding: 16,
        paddingBottom: 100,
    },
    webScrollContainer: {
        flex: 1,
        maxHeight: '70vh', // Ensure scrollable on web
        minHeight: 400,
    },
    moveButtonsContainer: {
        flexDirection: 'column',
        marginRight: 12,
        gap: 4,
    },
    moveButton: {
        width: 32,
        height: 32,
        borderRadius: 8,
        backgroundColor: '#F3F4F6',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    moveButtonDisabled: {
        backgroundColor: '#FAFAFA',
        opacity: 0.5,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 12,
        color: '#6B7280',
        fontFamily: 'Poppins_500Medium',
    },

    // Level Card
    levelCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        borderRadius: 12,
        padding: 12,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    levelCardActive: {
        backgroundColor: '#FEF3C7',
        shadowOpacity: 0.15,
        elevation: 5,
    },
    dragHandle: {
        padding: 8,
        marginRight: 8,
    },
    levelInfo: {
        flex: 1,
    },
    levelHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    levelIconContainer: {
        width: 44,
        height: 44,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    levelTitleContainer: {
        flex: 1,
    },
    levelName: {
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
        color: '#111827',
    },
    levelDescription: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
    },
    levelStats: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    statBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F3F4F6',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        gap: 4,
    },
    statText: {
        fontSize: 11,
        fontFamily: 'Poppins_500Medium',
        color: '#6B7280',
    },
    levelActions: {
        flexDirection: 'row',
        gap: 4,
    },
    actionBtn: {
        padding: 8,
    },
    dragHandle: {
        marginRight: 8,
        padding: 4,
        cursor: 'grab',
    },
    dropIndicator: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderWidth: 2,
        borderColor: '#3B82F6',
        borderRadius: 12,
        borderStyle: 'dashed',
        justifyContent: 'center',
        alignItems: 'center',
        pointerEvents: 'none',
    },
    dropIndicatorText: {
        color: '#3B82F6',
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        backgroundColor: '#FFF',
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 8,
    },

    // Info Banner
    infoBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#EEF2FF',
        margin: 16,
        padding: 12,
        borderRadius: 10,
        gap: 10,
    },
    infoText: {
        flex: 1,
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#4F46E5',
    },

    // Modal
    modalContainer: {
        flex: 1,
        backgroundColor: '#FFF',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        paddingTop: Platform.OS === 'ios' ? 60 : 20,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    modalTitle: {
        fontSize: 20,
        fontFamily: 'Poppins_700Bold',
        color: '#111827',
    },
    modalSubtitle: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
    },
    formContainer: {
        padding: 20,
    },
    inputLabel: {
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        color: '#374151',
        marginBottom: 6,
        marginTop: 16,
    },
    input: {
        backgroundColor: '#F9FAFB',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 10,
        padding: 14,
        fontSize: 16,
        fontFamily: 'Poppins_400Regular',
    },
    textArea: {
        minHeight: 80,
        textAlignVertical: 'top',
    },
    iconPicker: {
        flexDirection: 'row',
        marginBottom: 10,
    },
    iconOption: {
        width: 48,
        height: 48,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#F3F4F6',
        marginRight: 10,
    },
    iconOptionSelected: {
        backgroundColor: '#D71A21',
    },
    colorPicker: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        marginBottom: 20,
    },
    colorOption: {
        width: 40,
        height: 40,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    colorOptionSelected: {
        borderWidth: 3,
        borderColor: '#FFF',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 4,
    },
    saveBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#D71A21',
        padding: 16,
        borderRadius: 12,
        marginTop: 20,
        gap: 8,
    },
    saveBtnText: {
        color: '#FFF',
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
    },

    // Section Title
    sectionTitle: {
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
        color: '#374151',
        paddingHorizontal: 20,
        marginTop: 10,
        marginBottom: 10,
    },

    // Course Card
    courseCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        marginHorizontal: 16,
        marginBottom: 8,
        padding: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        gap: 10,
    },
    courseCardActive: {
        backgroundColor: '#FEF3C7',
        borderColor: '#D71A21',
    },
    courseInfo: {
        flex: 1,
    },
    courseName: {
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        color: '#111827',
    },
    courseBucket: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
    },
    removeCourseBtn: {
        padding: 6,
    },
    availableCourseCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F9FAFB',
        marginHorizontal: 16,
        marginBottom: 8,
        padding: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    emptyState: {
        alignItems: 'center',
        padding: 30,
    },
    emptyText: {
        marginTop: 10,
        color: '#9CA3AF',
        fontFamily: 'Poppins_500Medium',
    },
});

// ===========================================================================
// QUIZ MANAGEMENT STYLES
// ===========================================================================
const quizStyles = StyleSheet.create({
    actionBar: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        paddingHorizontal: 16,
        backgroundColor: '#F9FAFB',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
        gap: 8,
        flexWrap: 'wrap',
    },
    addBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#10B981',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        gap: 4,
    },
    addBtnText: {
        color: '#FFF',
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
    },
    regenerateBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#EEF2FF',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#C7D2FE',
        gap: 4,
    },
    regenerateBtnText: {
        color: '#6366F1',
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
    },
    saveAllBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#D71A21',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 8,
        gap: 4,
        marginLeft: 'auto',
    },
    saveAllBtnText: {
        color: '#FFF',
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
    },
    questionCard: {
        backgroundColor: '#FFF',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
        elevation: 1,
    },
    questionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    questionNumber: {
        fontSize: 12,
        fontFamily: 'Poppins_700Bold',
        color: '#D71A21',
        backgroundColor: '#FEF3C7',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
        overflow: 'hidden',
    },
    questionActions: {
        flexDirection: 'row',
        gap: 8,
    },
    questionText: {
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        color: '#111827',
        marginBottom: 10,
        lineHeight: 20,
    },
    optionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 8,
        marginBottom: 4,
        backgroundColor: '#F9FAFB',
    },
    correctOption: {
        backgroundColor: '#ECFDF5',
        borderWidth: 1,
        borderColor: '#A7F3D0',
    },
    optionText: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        color: '#374151',
        flex: 1,
    },
    editLabel: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#D71A21',
        marginBottom: 8,
    },
    optionEditRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
    },
    correctToggle: {
        width: 32,
        height: 32,
        justifyContent: 'center',
        alignItems: 'center',
    },
    correctToggleActive: {
        backgroundColor: '#ECFDF5',
        borderRadius: 16,
    },
    editActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 10,
        marginTop: 12,
    },
    cancelEditBtn: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
        backgroundColor: '#F3F4F6',
    },
    saveEditBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
        backgroundColor: '#10B981',
    },
});
