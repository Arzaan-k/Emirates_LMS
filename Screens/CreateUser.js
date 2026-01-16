import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    Modal,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    ScrollView,
    Pressable,
    ActivityIndicator,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import API_URL from '../config';

const CreateUser = ({
    visible = false,
    onClose = () => { },
    onCreate = () => { },
    userProfile = {},  // Current logged-in user profile
    isEditing = false,
    initialData = null,
    onUpdate = () => { }
}) => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState('Employee');
    const [category, setCategory] = useState('Employee');
    const [selectedPrivileges, setSelectedPrivileges] = useState([]);
    const [categories, setCategories] = useState([]);
    const [privileges, setPrivileges] = useState([]);
    const [loading, setLoading] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [showNewCategory, setShowNewCategory] = useState(false);

    // Check if current user is superadmin
    const isSuperAdmin = userProfile?.is_superadmin || userProfile?.role === 'Super Admin';

    // Fetch categories and privileges on mount and handle edit mode
    useEffect(() => {
        if (visible) {
            fetchCategories();
            fetchPrivileges();

            if (isEditing && initialData) {
                setName(initialData.name || '');
                setEmail(initialData.email || '');
                setRole(initialData.role || 'Employee');
                setCategory(initialData.category || 'Employee');
                setSelectedPrivileges(initialData.privileges || []);
                setPassword(''); // Don't pre-fill password
            } else {
                // Reset for create mode
                setName('');
                setEmail('');
                setPassword('');
                setRole('Employee');
                setCategory('Employee');
                setSelectedPrivileges([]);
            }
        }
    }, [visible, isEditing, initialData]);

    const fetchCategories = async () => {
        try {
            const response = await fetch(`${API_URL}/users/categories`);
            const data = await response.json();
            if (Array.isArray(data)) {
                setCategories(data);
            }
        } catch (error) {
            console.error('Error fetching categories:', error);
            // Use default categories
            setCategories([
                { id: '1', name: 'Super Admin', description: 'Full access', color: '#9333EA' },
                { id: '2', name: 'Manager', description: 'Admin access', color: '#2563EB' },
                { id: '3', name: 'Supervisor', description: 'Limited admin', color: '#10B981' },
                { id: '4', name: 'Employee', description: 'Regular access', color: '#F59E0B' },
            ]);
        }
    };

    const fetchPrivileges = async () => {
        try {
            const response = await fetch(`${API_URL}/users/privileges`);
            const data = await response.json();
            if (Array.isArray(data)) {
                setPrivileges(data);
            } else {
                throw new Error('Invalid response');
            }
        } catch (error) {
            console.error('Error fetching privileges:', error);
            // Use default privileges - all 19 privileges
            setPrivileges([
                { id: 'team_list', name: 'Team List', description: 'View team members', icon: 'users' },
                { id: 'reports', name: 'Reports', description: 'View reports', icon: 'bar-chart-2' },
                { id: 'assign_quiz', name: 'Assign Quiz', description: 'Assign quizzes', icon: 'clipboard' },
                { id: 'audits', name: 'Audits', description: 'Audit functionality', icon: 'check-square' },
                { id: 'upload_training', name: 'Upload Training', description: 'Upload content', icon: 'upload-cloud' },
                { id: 'bulk_upload', name: 'Bulk Upload', description: 'Bulk upload content', icon: 'layers' },
                { id: 'post_news', name: 'Post News', description: 'Post updates', icon: 'file-text' },
                { id: 'post_quiz', name: 'Post Quiz', description: 'Create quizzes', icon: 'help-circle' },
                { id: 'create_user', name: 'Create User', description: 'Create users', icon: 'user-plus' },
                { id: 'live_tracking', name: 'Live Tracking', description: 'Location tracking', icon: 'map-pin' },
                { id: 'proctored_assessment', name: 'Proctored Assessment', description: 'Assessments', icon: 'shield' },
                { id: 'view_analytics', name: 'Analytics', description: 'View analytics', icon: 'trending-up' },
                { id: 'send_notification', name: 'Notifications', description: 'Send notifications', icon: 'bell' },
                { id: 'access_control', name: 'Access Control', description: 'User access controls', icon: 'lock' },
                { id: 'manage_buckets', name: 'Manage Buckets', description: 'Course buckets', icon: 'folder' },
                { id: 'schedule_meeting', name: 'Meetings', description: 'Schedule meetings', icon: 'video' },
                { id: 'crm_tickets', name: 'CRM Tickets', description: 'Ticket management', icon: 'tag' },
                { id: 'manage_simulations', name: 'Simulations', description: 'Manage simulations', icon: 'play-circle' },
                { id: 'manage_learning_path', name: 'Learning Path', description: 'Manage learning path', icon: 'book-open' },
            ]);
        }
    };

    const togglePrivilege = (privilegeId) => {
        setSelectedPrivileges(prev => {
            if (prev.includes(privilegeId)) {
                return prev.filter(p => p !== privilegeId);
            } else {
                return [...prev, privilegeId];
            }
        });
    };

    const selectAllPrivileges = () => {
        setSelectedPrivileges(privileges.map(p => p.id));
    };

    const clearAllPrivileges = () => {
        setSelectedPrivileges([]);
    };

    const handleCategoryChange = (newCategory) => {
        setCategory(newCategory);
        // Auto-set role based on category
        if (newCategory === 'Super Admin') {
            setRole('Super Admin');
            selectAllPrivileges();
        } else if (newCategory === 'Manager') {
            setRole('Manager');
        } else if (newCategory === 'Supervisor') {
            setRole('Supervisor');
        } else {
            setRole('Employee');
            clearAllPrivileges();
        }
    };

    const handleCreateCategory = async () => {
        if (!newCategoryName.trim()) return;

        try {
            const response = await fetch(`${API_URL}/users/categories`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newCategoryName, description: '', color: '#6B7280' })
            });
            const result = await response.json();
            if (result.status === 'success') {
                fetchCategories();
                setCategory(newCategoryName);
                setNewCategoryName('');
                setShowNewCategory(false);
            }
        } catch (error) {
            console.error('Error creating category:', error);
        }
    };

    const handleSubmit = async () => {
        if (!name || !email) return;
        if (!isEditing && !password) return; // Password required for create

        setLoading(true);
        const payload = {
            name,
            email,
            role,
            category,
            privileges: selectedPrivileges
        };

        if (password) {
            payload.password = password;
        }

        try {
            if (isEditing) {
                await onUpdate(payload);
            } else {
                await onCreate(payload);
            }

            // Reset form if creating (optional, since we usually close modal)
            if (!isEditing) {
                setName('');
                setEmail('');
                setPassword('');
                setRole('Employee');
                setCategory('Employee');
                setSelectedPrivileges([]);
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent
            onRequestClose={onClose}
        >
            <Pressable style={styles.overlay} onPress={onClose}>
                <Pressable style={styles.card} onPress={() => { }}>
                    {/* Header with Gradient */}
                    <LinearGradient
                        colors={isSuperAdmin ? ['#9333EA', '#7C3AED'] : ['#4F46E5', '#6366F1']}
                        style={styles.headerGradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                    >
                        <View style={styles.header}>
                            <View>
                                <Text style={styles.title}>{isEditing ? 'Update User' : 'Create User'}</Text>
                                <Text style={styles.subtitle}>
                                    {isEditing ? 'Modify user details and privileges' : (isSuperAdmin ? 'Full access to assign privileges' : 'Add a new team member')}
                                </Text>
                            </View>
                            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                                <Feather name="x" size={24} color="#FFF" />
                            </TouchableOpacity>
                        </View>
                    </LinearGradient>

                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        style={styles.scrollView}
                        contentContainerStyle={styles.contentContainer}
                    >
                        {/* Basic Info Section */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>
                                <Feather name="user" size={16} color={isSuperAdmin ? "#9333EA" : "#4F46E5"} /> Basic Information
                            </Text>

                            {/* Name */}
                            <Text style={styles.label}>Full Name</Text>
                            <View style={styles.inputBox}>
                                <Feather name="user" size={18} color="#64748B" />
                                <TextInput
                                    placeholder="John Doe"
                                    style={styles.input}
                                    value={name}
                                    onChangeText={setName}
                                />
                            </View>

                            {/* Email */}
                            <Text style={styles.label}>Email / Username {isEditing && '(Read-only)'}</Text>
                            <View style={[styles.inputBox, isEditing && { backgroundColor: '#F1F5F9', opacity: 0.7 }]}>
                                <Feather name="mail" size={18} color="#64748B" />
                                <TextInput
                                    placeholder="john@email.com"
                                    style={styles.input}
                                    keyboardType="email-address"
                                    autoCapitalize="none"
                                    value={email}
                                    onChangeText={setEmail}
                                    editable={!isEditing}
                                />
                            </View>

                            {/* Password */}
                            <Text style={styles.label}>Password</Text>
                            <View style={styles.inputBox}>
                                <Feather name="lock" size={18} color="#64748B" />
                                <TextInput
                                    placeholder="••••••••"
                                    style={styles.input}
                                    secureTextEntry
                                    value={password}
                                    onChangeText={setPassword}
                                />
                            </View>
                        </View>

                        {/* Category Section - Only for SuperAdmin */}
                        {isSuperAdmin && (
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>
                                    <MaterialCommunityIcons name="tag-multiple" size={16} color="#9333EA" /> User Category
                                </Text>
                                <Text style={styles.sectionDesc}>Select existing or create new category</Text>

                                {!showNewCategory ? (
                                    <ScrollView
                                        horizontal
                                        showsHorizontalScrollIndicator={false}
                                        style={styles.categoryScroll}
                                    >
                                        {categories.map((cat) => (
                                            <TouchableOpacity
                                                key={cat.id}
                                                style={[
                                                    styles.categoryChip,
                                                    category === cat.name && {
                                                        backgroundColor: cat.color,
                                                        borderColor: cat.color
                                                    }
                                                ]}
                                                onPress={() => handleCategoryChange(cat.name)}
                                            >
                                                <Text style={[
                                                    styles.categoryText,
                                                    category === cat.name && { color: '#FFF' }
                                                ]}>
                                                    {cat.name}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                        <TouchableOpacity
                                            style={[styles.addCategoryBtn, { borderColor: '#9333EA' }]}
                                            onPress={() => setShowNewCategory(true)}
                                        >
                                            <Feather name="plus" size={16} color="#9333EA" />
                                            <Text style={[styles.addCategoryText, { color: '#9333EA' }]}>New</Text>
                                        </TouchableOpacity>
                                    </ScrollView>
                                ) : (
                                    <View style={styles.newCategoryRow}>
                                        <TextInput
                                            style={styles.newCategoryInput}
                                            placeholder="New Category Name"
                                            value={newCategoryName}
                                            onChangeText={setNewCategoryName}
                                        />
                                        <TouchableOpacity
                                            style={[styles.newCatBtn, { backgroundColor: '#9333EA' }]}
                                            onPress={handleCreateCategory}
                                        >
                                            <Feather name="check" size={18} color="#FFF" />
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.newCatBtn, { backgroundColor: '#9CA3AF' }]}
                                            onPress={() => setShowNewCategory(false)}
                                        >
                                            <Feather name="x" size={18} color="#FFF" />
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>
                        )}

                        {/* Role Selection */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>
                                <Feather name="briefcase" size={16} color={isSuperAdmin ? "#9333EA" : "#4F46E5"} /> Display Role
                            </Text>
                            <View style={styles.roleRow}>
                                {['Admin', 'Manager', 'Supervisor', 'Employee'].map(r => (
                                    <TouchableOpacity
                                        key={r}
                                        style={[
                                            styles.roleBtn,
                                            role === r && (isSuperAdmin ? styles.roleActiveSuper : styles.roleActive),
                                        ]}
                                        onPress={() => setRole(r)}
                                    >
                                        <Text
                                            style={[
                                                styles.roleText,
                                                role === r && (isSuperAdmin ? styles.roleTextActiveSuper : styles.roleTextActive),
                                            ]}
                                        >
                                            {r}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {/* Privileges Section - Only for SuperAdmin */}
                        {isSuperAdmin && (
                            <View style={styles.section}>
                                <View style={styles.privilegeHeader}>
                                    <Text style={styles.sectionTitle}>
                                        <MaterialCommunityIcons name="shield-lock" size={16} color="#9333EA" /> Admin Privileges
                                    </Text>
                                    <View style={styles.privilegeActions}>
                                        <TouchableOpacity onPress={selectAllPrivileges} style={[styles.selectAllBtn, { backgroundColor: '#F3E8FF' }]}>
                                            <Text style={[styles.selectAllText, { color: '#9333EA' }]}>All</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={clearAllPrivileges} style={styles.clearBtn}>
                                            <Text style={styles.clearText}>Clear</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                                <Text style={styles.sectionDesc}>
                                    Selected: {selectedPrivileges.length} / {privileges.length}
                                </Text>

                                <View style={styles.privilegeGrid}>
                                    {privileges.map((priv) => (
                                        <TouchableOpacity
                                            key={priv.id}
                                            style={[
                                                styles.privilegeItem,
                                                selectedPrivileges.includes(priv.id) && styles.privilegeItemActiveSuper
                                            ]}
                                            onPress={() => togglePrivilege(priv.id)}
                                        >
                                            <View style={[
                                                styles.privilegeCheck,
                                                selectedPrivileges.includes(priv.id) && styles.privilegeCheckActiveSuper
                                            ]}>
                                                {selectedPrivileges.includes(priv.id) && (
                                                    <Feather name="check" size={10} color="#FFF" />
                                                )}
                                            </View>
                                            <View style={styles.privilegeInfo}>
                                                <Feather
                                                    name={priv.icon || 'box'}
                                                    size={12}
                                                    color={selectedPrivileges.includes(priv.id) ? '#9333EA' : '#9CA3AF'}
                                                />
                                                <Text
                                                    style={[
                                                        styles.privilegeName,
                                                        selectedPrivileges.includes(priv.id) && styles.privilegeNameActiveSuper
                                                    ]}
                                                    numberOfLines={1}
                                                >
                                                    {priv.name}
                                                </Text>
                                            </View>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        )}

                        {/* Submit Button */}
                        <TouchableOpacity
                            style={[
                                styles.createBtn,
                                isSuperAdmin && { backgroundColor: '#9333EA' },
                                (!name || !email || (!isEditing && !password)) && styles.createBtnDisabled,
                            ]}
                            onPress={handleSubmit}
                            disabled={!name || !email || (!isEditing && !password) || loading}
                        >
                            {loading ? (
                                <ActivityIndicator color="#FFF" />
                            ) : (
                                <>
                                    <Feather name={isEditing ? "save" : "user-plus"} size={18} color="#FFF" />
                                    <Text style={styles.createText}>
                                        {isEditing ? 'Update User' : 'Create User'} {selectedPrivileges.length > 0 ? `(+${selectedPrivileges.length} privileges)` : ''}
                                    </Text>
                                </>
                            )}
                        </TouchableOpacity>

                        {/* Info Box */}
                        {isSuperAdmin && selectedPrivileges.length > 0 && (
                            <View style={[styles.infoBox, { backgroundColor: '#F3E8FF' }]}>
                                <Feather name="info" size={14} color="#9333EA" />
                                <Text style={[styles.infoText, { color: '#7C3AED' }]}>
                                    This user will have access to {selectedPrivileges.length} admin features.
                                    They'll see these options in the Manager Dashboard.
                                </Text>
                            </View>
                        )}
                    </ScrollView>
                </Pressable>
            </Pressable>
        </Modal>
    );
};

export default CreateUser;

/* ================= STYLES ================= */

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(15,23,42,0.6)',
        justifyContent: 'center',
        padding: 16,
    },
    card: {
        backgroundColor: '#fff',
        borderRadius: 24,
        maxHeight: '85%',
        overflow: 'hidden',
    },
    headerGradient: {
        paddingHorizontal: 20,
        paddingVertical: 16,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    title: {
        fontSize: 22,
        fontWeight: '800',
        color: '#FFF',
    },
    subtitle: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.8)',
        marginTop: 2,
    },
    closeBtn: {
        backgroundColor: 'rgba(255,255,255,0.2)',
        padding: 8,
        borderRadius: 12,
    },
    content: {
        // Deprecated, split into contentContainer and scrollView
    },
    scrollView: {
        // flex: 1 removed to allow content to dictate height up to maxHeight
    },
    contentContainer: {
        padding: 16,
        paddingBottom: 60, // Ensure ample space for the button
    },
    section: {
        marginBottom: 20,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#1F2937',
        marginBottom: 4,
    },
    sectionDesc: {
        fontSize: 12,
        color: '#6B7280',
        marginBottom: 12,
    },
    label: {
        fontSize: 13,
        fontWeight: '600',
        color: '#475569',
        marginBottom: 6,
        marginTop: 12,
    },
    inputBox: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderRadius: 14,
        paddingHorizontal: 12,
        height: 50,
        backgroundColor: '#F8FAFC',
    },
    input: {
        flex: 1,
        marginLeft: 10,
        fontSize: 15,
        color: '#0F172A',
    },
    categoryScroll: {
        flexDirection: 'row',
        marginBottom: 8,
    },
    categoryChip: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        marginRight: 8,
        backgroundColor: '#F8FAFC',
    },
    categoryText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#475569',
    },
    addCategoryBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#4F46E5',
        borderStyle: 'dashed',
        gap: 4,
    },
    addCategoryText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#4F46E5',
    },
    newCategoryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    newCategoryInput: {
        flex: 1,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderRadius: 12,
        paddingHorizontal: 14,
        height: 44,
        fontSize: 14,
    },
    newCatBtn: {
        backgroundColor: '#4F46E5',
        padding: 12,
        borderRadius: 12,
    },
    roleRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 8,
    },
    roleBtn: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        backgroundColor: '#F8FAFC',
    },
    roleActive: {
        backgroundColor: '#EEF2FF',
        borderColor: '#6366F1',
    },
    roleText: {
        fontSize: 13,
        color: '#475569',
        fontWeight: '600',
    },
    roleTextActive: {
        color: '#4F46E5',
    },
    roleActiveSuper: {
        backgroundColor: '#F3E8FF',
        borderColor: '#9333EA',
    },
    roleTextActiveSuper: {
        color: '#9333EA',
    },
    privilegeHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    privilegeActions: {
        flexDirection: 'row',
        gap: 8,
    },
    selectAllBtn: {
        backgroundColor: '#EEF2FF',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },
    selectAllText: {
        fontSize: 11,
        fontWeight: '600',
        color: '#4F46E5',
    },
    clearBtn: {
        backgroundColor: '#FEE2E2',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },
    clearText: {
        fontSize: 11,
        fontWeight: '600',
        color: '#EF4444',
    },
    privilegeGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
    },
    privilegeItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        backgroundColor: '#F8FAFC',
        width: '48%',
        minHeight: 40,
    },
    privilegeItemActive: {
        backgroundColor: '#EEF2FF',
        borderColor: '#6366F1',
    },
    privilegeCheck: {
        width: 18,
        height: 18,
        borderRadius: 5,
        borderWidth: 2,
        borderColor: '#D1D5DB',
        marginRight: 6,
        justifyContent: 'center',
        alignItems: 'center',
    },
    privilegeCheckActive: {
        backgroundColor: '#4F46E5',
        borderColor: '#4F46E5',
    },
    privilegeInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        flex: 1,
    },
    privilegeName: {
        fontSize: 11,
        color: '#6B7280',
        fontWeight: '500',
        flex: 1,
    },
    privilegeNameActive: {
        color: '#4F46E5',
        fontWeight: '600',
    },
    privilegeItemActiveSuper: {
        backgroundColor: '#F3E8FF',
        borderColor: '#9333EA',
    },
    privilegeCheckActiveSuper: {
        backgroundColor: '#9333EA',
        borderColor: '#9333EA',
    },
    privilegeNameActiveSuper: {
        color: '#9333EA',
        fontWeight: '600',
    },
    createBtn: {
        flexDirection: 'row',
        backgroundColor: '#4F46E5',
        borderRadius: 16,
        paddingVertical: 15,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
        marginTop: 8,
    },
    createBtnDisabled: {
        opacity: 0.6,
    },
    createText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '700',
    },
    infoBox: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: '#EEF2FF',
        padding: 14,
        borderRadius: 12,
        marginTop: 16,
        gap: 10,
    },
    infoText: {
        fontSize: 12,
        color: '#4F46E5',
        flex: 1,
        lineHeight: 18,
    },
});
