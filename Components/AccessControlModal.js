import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    ScrollView,
    TextInput,
    ActivityIndicator,
    Alert,
    Switch,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import API_URL from '../config';

// Tab options for the modal
const TABS = [
    { id: 'hierarchy', label: 'Hierarchy', icon: 'sitemap' },
    { id: 'levels', label: 'Levels', icon: 'medal-outline' },
    { id: 'access', label: 'Access Control', icon: 'lock-outline' },
];

export default function AccessControlModal({ visible, onClose }) {
    const [activeTab, setActiveTab] = useState('hierarchy');
    const [loading, setLoading] = useState(false);

    // Hierarchy state
    const [hierarchy, setHierarchy] = useState([]);
    const [newRoleName, setNewRoleName] = useState('');
    const [newRoleDisplayName, setNewRoleDisplayName] = useState('');

    // Level config state
    const [levelConfig, setLevelConfig] = useState({});
    const [editingLevel, setEditingLevel] = useState(null);
    const [levelMinNodes, setLevelMinNodes] = useState('');

    // Access control state
    const [accessRules, setAccessRules] = useState({});
    const [courseBuckets, setCourseBuckets] = useState([]);
    const [selectedRole, setSelectedRole] = useState(null);
    const [selectedBuckets, setSelectedBuckets] = useState([]);
    const [maxCoursesVisible, setMaxCoursesVisible] = useState(-1);

    useEffect(() => {
        if (visible) {
            fetchAllData();
        }
    }, [visible]);

    const fetchAllData = async () => {
        setLoading(true);
        try {
            // Fetch hierarchy
            const hierRes = await fetch(`${API_URL}/admin/hierarchy`);
            const hierData = await hierRes.json();
            setHierarchy(hierData || []);

            // Fetch level config
            const levelRes = await fetch(`${API_URL}/admin/level-config`);
            const levelData = await levelRes.json();
            setLevelConfig(levelData || {});

            // Fetch access rules
            const accessRes = await fetch(`${API_URL}/admin/access-rules`);
            const accessData = await accessRes.json();
            setAccessRules(accessData || {});

            // Fetch course buckets
            const bucketRes = await fetch(`${API_URL}/course-buckets`);
            const bucketData = await bucketRes.json();
            setCourseBuckets(bucketData || []);
        } catch (e) {
            console.error('Error fetching data:', e);
            Alert.alert('Error', 'Failed to load configuration data');
        } finally {
            setLoading(false);
        }
    };

    // ========== HIERARCHY FUNCTIONS ==========
    const handleAddRole = async () => {
        if (!newRoleName.trim()) {
            Alert.alert('Error', 'Please enter a role name');
            return;
        }

        try {
            const formData = new FormData();
            formData.append('role', newRoleName);
            formData.append('name', newRoleDisplayName || newRoleName);
            formData.append('icon', 'account');
            formData.append('color', '#6B7280');

            const res = await fetch(`${API_URL}/admin/hierarchy/role`, {
                method: 'POST',
                body: formData
            });

            const result = await res.json();
            if (result.status === 'success') {
                setNewRoleName('');
                setNewRoleDisplayName('');
                fetchAllData();
                Alert.alert('Success', 'Role added to hierarchy');
            }
        } catch (e) {
            Alert.alert('Error', 'Failed to add role');
        }
    };

    const handleDeleteRole = async (roleId) => {
        Alert.alert(
            'Delete Role',
            'Are you sure you want to delete this role from the hierarchy?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const res = await fetch(`${API_URL}/admin/hierarchy/role/${roleId}`, {
                                method: 'DELETE'
                            });
                            if (res.ok) {
                                fetchAllData();
                                Alert.alert('Success', 'Role deleted');
                            }
                        } catch (e) {
                            Alert.alert('Error', 'Failed to delete role');
                        }
                    }
                }
            ]
        );
    };

    // ========== LEVEL CONFIG FUNCTIONS ==========
    const handleUpdateLevel = async () => {
        if (!editingLevel || !levelMinNodes) return;

        try {
            const formData = new FormData();
            formData.append('min_nodes', String(parseInt(levelMinNodes)));

            const res = await fetch(`${API_URL}/admin/level-config/${editingLevel}`, {
                method: 'POST',
                body: formData
            });

            const result = await res.json();
            if (result.status === 'success') {
                setEditingLevel(null);
                setLevelMinNodes('');
                fetchAllData();
                Alert.alert('Success', `Level requirements updated for ${editingLevel}`);
            }
        } catch (e) {
            Alert.alert('Error', 'Failed to update level config');
        }
    };

    // ========== ACCESS CONTROL FUNCTIONS ==========
    const handleSelectRole = (roleName) => {
        setSelectedRole(roleName);
        const rules = accessRules[roleName] || {};
        setSelectedBuckets(rules.accessible_buckets || []);
        setMaxCoursesVisible(rules.max_courses_visible || -1);
    };

    const toggleBucket = (bucketId) => {
        if (selectedBuckets.includes(bucketId)) {
            setSelectedBuckets(selectedBuckets.filter(id => id !== bucketId));
        } else {
            setSelectedBuckets([...selectedBuckets, bucketId]);
        }
    };

    const handleSaveAccessRules = async () => {
        if (!selectedRole) return;

        try {
            const formData = new FormData();
            formData.append('accessible_courses', JSON.stringify([]));
            formData.append('accessible_buckets', JSON.stringify(selectedBuckets));
            formData.append('max_courses_visible', String(maxCoursesVisible));

            const res = await fetch(`${API_URL}/admin/access-rules/${selectedRole}`, {
                method: 'POST',
                body: formData
            });

            const result = await res.json();
            if (result.status === 'success') {
                fetchAllData();
                Alert.alert('Success', `Access rules updated for ${selectedRole}`);
            }
        } catch (e) {
            Alert.alert('Error', 'Failed to save access rules');
        }
    };

    // ========== RENDER FUNCTIONS ==========
    const renderHierarchyTab = () => (
        <ScrollView style={styles.tabContent}>
            <Text style={styles.sectionTitle}>Current Hierarchy</Text>
            <Text style={styles.sectionSubtitle}>Roles are displayed from highest to lowest</Text>

            {hierarchy.map((role, index) => (
                <View key={role.id} style={styles.hierarchyItem}>
                    <View style={styles.hierarchyOrder}>
                        <Text style={styles.orderText}>{index + 1}</Text>
                    </View>
                    <View style={[styles.roleIconCircle, { backgroundColor: role.color + '20' }]}>
                        <MaterialCommunityIcons name={role.icon || 'account'} size={18} color={role.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.roleName}>{role.role}</Text>
                        <Text style={styles.roleDisplayName}>{role.name}</Text>
                    </View>
                    <TouchableOpacity onPress={() => handleDeleteRole(role.id)} style={styles.deleteBtn}>
                        <Feather name="trash-2" size={16} color="#EF4444" />
                    </TouchableOpacity>
                </View>
            ))}

            <View style={styles.addRoleSection}>
                <Text style={styles.sectionTitle}>Add New Role</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Role ID (e.g., 'team_lead')"
                    value={newRoleName}
                    onChangeText={setNewRoleName}
                />
                <TextInput
                    style={styles.input}
                    placeholder="Display Name (e.g., 'Team Lead')"
                    value={newRoleDisplayName}
                    onChangeText={setNewRoleDisplayName}
                />
                <TouchableOpacity style={styles.addBtn} onPress={handleAddRole}>
                    <Feather name="plus" size={18} color="#FFF" />
                    <Text style={styles.addBtnText}>Add Role</Text>
                </TouchableOpacity>
            </View>
        </ScrollView>
    );

    const renderLevelsTab = () => (
        <ScrollView style={styles.tabContent}>
            <Text style={styles.sectionTitle}>Level Requirements</Text>
            <Text style={styles.sectionSubtitle}>Set the number of courses needed to reach each level</Text>

            {Object.entries(levelConfig).map(([levelName, config]) => (
                <View key={levelName} style={styles.levelItem}>
                    <View style={[styles.levelIcon, { backgroundColor: config.color + '20' }]}>
                        <MaterialCommunityIcons name={config.icon || 'medal-outline'} size={20} color={config.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.levelName}>{levelName}</Text>
                        <Text style={styles.levelDesc}>{config.description}</Text>
                        <Text style={styles.levelNodes}>Required: {config.min_nodes} courses</Text>
                    </View>
                    <TouchableOpacity
                        style={styles.editBtn}
                        onPress={() => {
                            setEditingLevel(levelName);
                            setLevelMinNodes(String(config.min_nodes));
                        }}
                    >
                        <Feather name="edit-2" size={16} color="#3B82F6" />
                    </TouchableOpacity>
                </View>
            ))}

            {editingLevel && (
                <View style={styles.editLevelSection}>
                    <Text style={styles.editTitle}>Edit: {editingLevel}</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Minimum courses required"
                        value={levelMinNodes}
                        onChangeText={setLevelMinNodes}
                        keyboardType="numeric"
                    />
                    <View style={styles.editActions}>
                        <TouchableOpacity
                            style={[styles.actionBtn, styles.cancelBtn]}
                            onPress={() => {
                                setEditingLevel(null);
                                setLevelMinNodes('');
                            }}
                        >
                            <Text style={styles.cancelBtnText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.actionBtn, styles.saveBtn]} onPress={handleUpdateLevel}>
                            <Text style={styles.saveBtnText}>Save</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}
        </ScrollView>
    );

    const renderAccessTab = () => (
        <ScrollView style={styles.tabContent}>
            <Text style={styles.sectionTitle}>Course Access Control</Text>
            <Text style={styles.sectionSubtitle}>Select which buckets each role can access</Text>

            {/* Role Selection */}
            <Text style={styles.labelText}>Select Role:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.roleSelector}>
                {hierarchy.filter(r => ['Waffler', 'Silver Waffler', 'Gold Waffler', 'Shift Manager'].includes(r.role)).map(role => (
                    <TouchableOpacity
                        key={role.id}
                        style={[styles.roleChip, selectedRole === role.role && styles.roleChipActive]}
                        onPress={() => handleSelectRole(role.role)}
                    >
                        <Text style={[styles.roleChipText, selectedRole === role.role && styles.roleChipTextActive]}>
                            {role.role}
                        </Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            {selectedRole && (
                <>
                    {/* Bucket Selection */}
                    <Text style={[styles.labelText, { marginTop: 20 }]}>Accessible Buckets:</Text>
                    {courseBuckets.map(bucket => (
                        <TouchableOpacity
                            key={bucket.id}
                            style={styles.bucketItem}
                            onPress={() => toggleBucket(bucket.id)}
                        >
                            <View style={[styles.bucketIcon, { backgroundColor: bucket.color + '20' }]}>
                                <MaterialCommunityIcons name={bucket.icon || 'folder'} size={18} color={bucket.color} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.bucketName}>{bucket.name}</Text>
                                <Text style={styles.bucketDesc}>{bucket.description}</Text>
                            </View>
                            <Switch
                                value={selectedBuckets.includes(bucket.id)}
                                onValueChange={() => toggleBucket(bucket.id)}
                                trackColor={{ false: '#E5E7EB', true: '#DCFCE7' }}
                                thumbColor={selectedBuckets.includes(bucket.id) ? '#10B981' : '#9CA3AF'}
                            />
                        </TouchableOpacity>
                    ))}

                    {/* Max Courses */}
                    <Text style={[styles.labelText, { marginTop: 20 }]}>Max Courses Visible:</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="-1 for unlimited"
                        value={String(maxCoursesVisible)}
                        onChangeText={(val) => setMaxCoursesVisible(parseInt(val) || -1)}
                        keyboardType="numeric"
                    />
                    <Text style={styles.helperText}>Set -1 for unlimited access to all courses in selected buckets</Text>

                    {/* Save Button */}
                    <TouchableOpacity style={styles.saveAccessBtn} onPress={handleSaveAccessRules}>
                        <Feather name="save" size={18} color="#FFF" />
                        <Text style={styles.saveAccessBtnText}>Save Access Rules</Text>
                    </TouchableOpacity>
                </>
            )}
        </ScrollView>
    );

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                        <Feather name="x" size={24} color="#374151" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Access & Hierarchy Control</Text>
                    <View style={{ width: 40 }} />
                </View>

                {/* Tab Selector */}
                <View style={styles.tabSelector}>
                    {TABS.map(tab => (
                        <TouchableOpacity
                            key={tab.id}
                            style={[styles.tab, activeTab === tab.id && styles.tabActive]}
                            onPress={() => setActiveTab(tab.id)}
                        >
                            <MaterialCommunityIcons
                                name={tab.icon}
                                size={18}
                                color={activeTab === tab.id ? '#F59E0B' : '#6B7280'}
                            />
                            <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>
                                {tab.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Content */}
                {loading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#F59E0B" />
                        <Text style={styles.loadingText}>Loading configuration...</Text>
                    </View>
                ) : (
                    <>
                        {activeTab === 'hierarchy' && renderHierarchyTab()}
                        {activeTab === 'levels' && renderLevelsTab()}
                        {activeTab === 'access' && renderAccessTab()}
                    </>
                )}
            </View>
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
    tabSelector: {
        flexDirection: 'row',
        backgroundColor: '#FFF',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        borderRadius: 12,
    },
    tabActive: {
        backgroundColor: '#FEF3C7',
    },
    tabText: {
        marginLeft: 6,
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
        color: '#6B7280',
    },
    tabTextActive: {
        color: '#D97706',
    },
    tabContent: {
        flex: 1,
        padding: 20,
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
    sectionTitle: {
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
        color: '#111827',
        marginBottom: 4,
    },
    sectionSubtitle: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
        marginBottom: 16,
    },
    hierarchyItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        padding: 12,
        borderRadius: 12,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: '#F3F4F6',
    },
    hierarchyOrder: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#F3F4F6',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10,
    },
    orderText: {
        fontSize: 12,
        fontFamily: 'Poppins_700Bold',
        color: '#6B7280',
    },
    roleIconCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    roleName: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#111827',
    },
    roleDisplayName: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
    },
    deleteBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#FEE2E2',
        justifyContent: 'center',
        alignItems: 'center',
    },
    addRoleSection: {
        marginTop: 24,
        backgroundColor: '#FFF',
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    input: {
        backgroundColor: '#F9FAFB',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 12,
        padding: 12,
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        marginBottom: 12,
    },
    addBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#10B981',
        paddingVertical: 12,
        borderRadius: 12,
    },
    addBtnText: {
        marginLeft: 8,
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
    },
    levelItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        padding: 16,
        borderRadius: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#F3F4F6',
    },
    levelIcon: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    levelName: {
        fontSize: 15,
        fontFamily: 'Poppins_700Bold',
        color: '#111827',
    },
    levelDesc: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
    },
    levelNodes: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
        color: '#F59E0B',
        marginTop: 4,
    },
    editBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#DBEAFE',
        justifyContent: 'center',
        alignItems: 'center',
    },
    editLevelSection: {
        backgroundColor: '#FFF',
        padding: 16,
        borderRadius: 16,
        marginTop: 16,
        borderWidth: 2,
        borderColor: '#3B82F6',
    },
    editTitle: {
        fontSize: 14,
        fontFamily: 'Poppins_700Bold',
        color: '#3B82F6',
        marginBottom: 12,
    },
    editActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
    },
    actionBtn: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 10,
        marginLeft: 10,
    },
    cancelBtn: {
        backgroundColor: '#F3F4F6',
    },
    cancelBtnText: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#6B7280',
    },
    saveBtn: {
        backgroundColor: '#3B82F6',
    },
    saveBtnText: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
    },
    labelText: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#374151',
        marginBottom: 8,
    },
    roleSelector: {
        flexDirection: 'row',
        marginBottom: 12,
    },
    roleChip: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        backgroundColor: '#F3F4F6',
        marginRight: 8,
    },
    roleChipActive: {
        backgroundColor: '#FEF3C7',
    },
    roleChipText: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
        color: '#6B7280',
    },
    roleChipTextActive: {
        color: '#D97706',
    },
    bucketItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        padding: 14,
        borderRadius: 12,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: '#F3F4F6',
    },
    bucketIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    bucketName: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#111827',
    },
    bucketDesc: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
    },
    helperText: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#9CA3AF',
        marginTop: -8,
        marginBottom: 16,
    },
    saveAccessBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F59E0B',
        paddingVertical: 14,
        borderRadius: 12,
        marginTop: 12,
    },
    saveAccessBtnText: {
        marginLeft: 8,
        fontSize: 15,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
    },
});
