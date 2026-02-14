import React, { useState, useEffect, useMemo } from 'react';
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
    Alert,
    Platform,
    FlatList,
    KeyboardAvoidingView,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import API_URL from '../config';

// BWC THEME
const THEME = {
    primary: '#F59E0B',    // Amber 500
    primaryDark: '#B45309', // Amber 700
    bg: '#FFFBEB',         // Amber 50 (Cream)
    cardBg: '#FFFFFF',
    textMain: '#451A03',   // Amber 950 (Deep Brown)
    textSub: '#92400E',    // Amber 800
    border: '#FDE68A',     // Amber 200
};

// Shared style constants for privilege segmented controls
const privRowStyle = { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingVertical: 2 };
const privLabelStyle = { fontSize: 12, color: '#1F2937', fontWeight: '500', flex: 1, marginRight: 8 };
const segStyle = { flexDirection: 'row', borderRadius: 8, borderWidth: 1, borderColor: '#FDE68A', overflow: 'hidden' };
const segBtnStyle = { paddingHorizontal: 9, paddingVertical: 6, backgroundColor: '#FFFFFF' };
const segTxtStyle = { fontSize: 10, fontWeight: '500', color: '#9CA3AF' };
const segDivider = { width: 1, backgroundColor: '#FDE68A' };
const segOffActive = { backgroundColor: '#F3F4F6' };
const segViewActive = { backgroundColor: '#EFF6FF' };
const segManageActive = { backgroundColor: '#FEF3C7' };

const CreateUser = ({
    visible = false,
    onClose = () => { },
    onCreate = () => { },
    userProfile = {},
    isEditing = false,
    initialData = null,
    onUpdate = () => { },
    onBulkUploadStart = null, // New prop for background upload
    filterOptions = {}, // Options for dropdowns
}) => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState('Employee');
    const [category, setCategory] = useState('Employee');
    const [selectedPrivileges, setSelectedPrivileges] = useState([]);
    const [selectedStore, setSelectedStore] = useState('');
    const [storeSearch, setStoreSearch] = useState('');
    const [categories, setCategories] = useState([]);
    const [privileges, setPrivileges] = useState([]);
    const [stores, setStores] = useState([]);
    const [loading, setLoading] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [showNewCategory, setShowNewCategory] = useState(false);
    const [activeTab, setActiveTab] = useState('single');
    const [bulkUploading, setBulkUploading] = useState(false);
    const [bulkResult, setBulkResult] = useState(null);

    // Dynamic display roles (fetched from backend - progression levels)
    const [displayRoles, setDisplayRoles] = useState([]);
    const [showNewRole, setShowNewRole] = useState(false);
    const [newRoleName, setNewRoleName] = useState('');
    const [creatingRole, setCreatingRole] = useState(false);
    const [showAllColumns, setShowAllColumns] = useState(false);

    // External user state
    const [isExternal, setIsExternal] = useState(false);
    const [joinedAtLevel, setJoinedAtLevel] = useState('');

    // Profile data state (all extended fields from bulk upload)
    const [profileData, setProfileData] = useState({});
    const [showProfileSection, setShowProfileSection] = useState(false);

    // Grouped privileges for UI
    const [privilegeGroups, setPrivilegeGroups] = useState([]);

    // Store management state
    const [showNewStore, setShowNewStore] = useState(false);
    const [newStoreName, setNewStoreName] = useState('');
    const [newStoreCity, setNewStoreCity] = useState('');

    // Selection Modal State
    const [selectModalVisible, setSelectModalVisible] = useState(false);
    const [selectTitle, setSelectTitle] = useState('');
    const [selectData, setSelectData] = useState([]);
    const [selectSearch, setSelectSearch] = useState('');
    const [targetFieldKey, setTargetFieldKey] = useState(null);

    // Field Mapping for Dropdowns
    const FIELD_MAP = useMemo(() => ({
        'Designation': { key: 'designations', icon: 'award' },
        'Department': { key: 'departments', icon: 'briefcase' },
        'Sub Department': { key: 'sub_departments', icon: 'layers' },
        'Function': { key: 'functions', icon: 'git-branch' },
        'Sub Function': { key: 'sub_functions', icon: 'git-merge' },
        'Job Role': { key: 'job_roles', icon: 'user-check' },
        'Concept': { key: 'concepts', icon: 'tag' },
        'Franchise': { key: 'franchises', icon: 'home' },
        'Region': { key: 'regions', icon: 'map' },
        'City': { key: 'cities', icon: 'map-pin' },
        'State': { key: 'states', icon: 'flag' },
        'Grade': { key: 'grades', icon: 'star' },
        'Qualification': { key: 'qualifications', icon: 'book' },
        'Gender': { options: ['Male', 'Female', 'Other'], icon: 'users' },
        'Blood Group': { options: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'], icon: 'heart' },
        'Marital Status': { options: ['Single', 'Married', 'Divorced', 'Widowed'], icon: 'user' },
        'User Status': { options: ['Active', 'Inactive', 'On Leave', 'Resigned', 'Terminated'], icon: 'activity' },
        // Static Options
        'Proof Type': { options: ['Aadhar', 'PAN', 'Passport', 'Driving License', 'Voter ID'], icon: 'credit-card' },
        'Qualification Status': { options: ['Completed', 'Pursuing', 'Dropped'], icon: 'book-open' },
        'Shirt Size': { options: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'], icon: 'maximize' },
        'Denim Size': { options: ['28', '30', '32', '34', '36', '38', '40', '42'], icon: 'maximize-2' },
        'Account Verified': { options: ['Yes', 'No'], icon: 'check-circle' },
        'Account Approved': { options: ['Yes', 'No'], icon: 'check-square' },
    }), []);

    // Comprehensive list of supported columns from EXPORT_USERS format
    const allColumns = [
        "Employee Code", "Full Name", "Temporary Employee Code", "User Name", "Date of Birth",
        "Gender", "Email", "Contact Number", "Address", "Proof Type", "Proof ID",
        "Qualification", "Specialization", "Qualification Status", "Previous Experience Designation",
        "Previous Experience", "Marital Status", "Shirt Size", "Denim Size", "Blood Group",
        "Account Verified", "Account Approved", "Approved By", "Joining Date", "Date of Resign",
        "Date of Leaving", "Reason for Leaving", "Franchise", "Store Name", "Store Code",
        "Region", "City", "State", "Designation", "User Status", "Grade", "Concept",
        "Department", "Sub Department", "Function", "Sub Function", "Job Role",
        "Career Job Roles", "User Created On", "Is External", "Joined At Level"
    ];

    const isSuperAdmin = userProfile?.is_superadmin || userProfile?.role === 'Super Admin';
    const canManagePrivileges = isSuperAdmin || (userProfile?.privileges && userProfile.privileges.includes('create_user'));

    // Filter stores based on search
    const filteredStores = useMemo(() => {
        if (!storeSearch) return stores;
        const search = storeSearch.toLowerCase();
        return stores.filter(s =>
            s.name?.toLowerCase().includes(search) ||
            s.city?.toLowerCase().includes(search)
        );
    }, [stores, storeSearch]);

    useEffect(() => {
        if (visible) {
            fetchCategories();
            fetchPrivileges();
            fetchStores();
            fetchDisplayRoles();
            setBulkResult(null);
            setStoreSearch('');
            setShowProfileSection(false);

            if (isEditing && initialData) {
                setName(initialData.name || '');
                setEmail(initialData.email || '');
                setRole(initialData.role || 'Employee');
                setCategory(initialData.category || 'Employee');
                setSelectedPrivileges(initialData.privileges || []);
                setSelectedStore(initialData.store || '');
                setIsExternal(initialData.is_external || false);
                setJoinedAtLevel(initialData.joined_at_level || '');
                // Normalize profile_data keys: trim whitespace to handle Excel column header inconsistencies
                const rawPD = initialData.profile_data || {};
                const normalizedPD = {};
                Object.entries(rawPD).forEach(([k, v]) => {
                    normalizedPD[k.trim()] = v;
                });
                setProfileData(normalizedPD);
                setPassword('');
            } else {
                setName('');
                setEmail('');
                setPassword('');
                setRole('Employee');
                setCategory('Employee');
                setSelectedPrivileges([]);
                setSelectedStore('');
                setIsExternal(false);
                setJoinedAtLevel('');
                setProfileData({});
            }
        }
    }, [visible, isEditing, initialData]);

    const fetchCategories = async () => {
        try {
            const response = await fetch(`${API_URL}/api/v1/users/categories`);
            const data = await response.json();
            if (Array.isArray(data)) {
                setCategories(data);
            }
        } catch (error) {
            console.error('Error fetching categories:', error);
            setCategories([
                { id: '1', name: 'Super Admin', description: 'Full access', color: '#B45309' },
                { id: '2', name: 'Manager', description: 'Admin access', color: '#D97706' },
                { id: '3', name: 'Supervisor', description: 'Limited admin', color: '#F59E0B' },
                { id: '4', name: 'Employee', description: 'Regular access', color: '#FCD34D' },
            ]);
        }
    };

    // Helper for cross-platform alerts (Web compatibility)
    const showAlert = (title, message, buttons) => {
        if (Platform.OS === 'web') {
            const confirm = window.confirm(`${title}\n\n${message}`);
            if (confirm) {
                const deleteBtn = buttons.find(b => b.style === 'destructive');
                if (deleteBtn && deleteBtn.onPress) deleteBtn.onPress();
            }
        } else {
            Alert.alert(title, message, buttons);
        }
    };

    // Fetch dynamic progression levels for Display Role
    const fetchDisplayRoles = async () => {
        try {
            const response = await fetch(`${API_URL}/api/v1/levels/`);
            const data = await response.json();
            if (data.levels && Array.isArray(data.levels)) {
                // Sort by order and keep full objects
                const sortedLevels = data.levels.sort((a, b) => a.order - b.order);
                setDisplayRoles(sortedLevels.map(l => ({ id: l.id, name: l.name })));
            }
        } catch (error) {
            console.error('Error fetching display roles:', error);
        }
    };

    // Create a new progression level (role)
    const handleCreateRole = async () => {
        if (!newRoleName.trim()) return;

        setCreatingRole(true);
        try {
            // Get current max order
            const maxOrder = displayRoles.length;

            const response = await fetch(`${API_URL}/api/v1/levels/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newRoleName.trim(),
                    order: maxOrder,
                    icon: 'medal-outline',
                    color: '#F59E0B',
                    description: `${newRoleName.trim()} progression level`
                })
            });

            const result = await response.json();
            if (result.status === 'success' || result.level) {
                // Refresh display roles
                await fetchDisplayRoles();
                setRole(newRoleName.trim());
                setNewRoleName('');
                setShowNewRole(false);
                Alert.alert('Success', `"${newRoleName.trim()}" progression level created!`);
            } else {
                Alert.alert('Error', result.detail || 'Failed to create role');
            }
        } catch (error) {
            console.error('Error creating role:', error);
            Alert.alert('Error', 'Failed to create progression level');
        } finally {
            setCreatingRole(false);
        }
    };

    const fetchPrivileges = async () => {
        try {
            const response = await fetch(`${API_URL}/api/v1/users/privileges`);
            const data = await response.json();
            if (Array.isArray(data)) {
                setPrivileges(data);
                // Build grouped structure from flat list
                const groups = {};
                data.forEach(p => {
                    const g = p.group || 'Other';
                    if (!groups[g]) groups[g] = { label: g, icon: p.group_icon || 'check', items: [] };
                    groups[g].items.push(p);
                });
                setPrivilegeGroups(Object.values(groups));
            }
        } catch (error) {
            console.error('Error fetching privileges:', error);
        }
    };

    const fetchStores = async () => {
        try {
            const response = await fetch(`${API_URL}/api/v1/users/stores/all`);
            const data = await response.json();
            if (Array.isArray(data)) {
                setStores(data);
            }
        } catch (error) {
            console.error('Error fetching stores:', error);
            setStores([
                { id: '1', name: 'HQ', city: 'Mumbai' },
                { id: '2', name: 'Mumbai Central', city: 'Mumbai' },
                { id: '3', name: 'Delhi CP', city: 'Delhi' },
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
        if (newCategory === 'Super Admin') {
            setRole('Super Admin');
            selectAllPrivileges();
        } else if (newCategory === 'Manager') {
            setRole(displayRoles[displayRoles.length - 1]?.name || 'Store Manager'); // Highest progression level
        } else if (newCategory === 'Supervisor') {
            // Find middle level
            const midIndex = Math.floor(displayRoles.length / 2);
            setRole(displayRoles[midIndex]?.name || 'Gold Waffler');
        } else {
            setRole(displayRoles[0]?.name || 'Waffler'); // Entry level (first progression role)
            clearAllPrivileges();
        }
    };

    const handleCreateCategory = async () => {
        if (!newCategoryName.trim()) return;
        try {
            const response = await fetch(`${API_URL}/api/v1/users/categories`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newCategoryName, description: '', color: '#F59E0B' })
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

    const handleCreateStore = async () => {
        if (!newStoreName.trim()) return;
        try {
            const response = await fetch(`${API_URL}/api/v1/users/stores`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newStoreName.trim(),
                    city: newStoreCity.trim() || 'Mumbai', // Default to Mumbai if empty
                    region: 'West'
                })
            });
            const result = await response.json();
            if (result.status === 'success') {
                fetchStores();
                setSelectedStore(newStoreName.trim());
                setNewStoreName('');
                setNewStoreCity('');
                setShowNewStore(false);
            } else {
                Alert.alert('Error', 'Failed to create store');
            }
        } catch (error) {
            console.error('Error creating store:', error);
            Alert.alert('Error', 'Failed to create store');
        }
    };

    const handleDeleteStore = (store) => {
        if (store.id === '1') {
            Alert.alert('Cannot Delete', 'HQ Store cannot be deleted.');
            return;
        }

        showAlert(
            'Delete Store',
            `Are you sure you want to delete "${store.name}"?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const response = await fetch(`${API_URL}/api/v1/users/stores/${store.id}`, {
                                method: 'DELETE'
                            });
                            const result = await response.json();
                            if (result.status === 'success') {
                                if (selectedStore === store.name) {
                                    setSelectedStore('');
                                }
                                fetchStores();
                            } else {
                                Alert.alert('Error', result.detail || 'Failed to delete store');
                            }
                        } catch (error) {
                            console.error('Delete store error:', error);
                            Alert.alert('Error', 'Failed to delete store');
                        }
                    }
                }
            ]
        );
    };

    const handleDeleteCategory = (cat) => {
        // Prevent deleting Super Admin (1) and Employee (4) as they are critical
        if (['1', '4'].includes(cat.id)) {
            Alert.alert('Cannot Delete', 'System default categories (Super Admin, Employee) cannot be deleted.');
            return;
        }

        showAlert(
            'Delete Category',
            `Are you sure you want to delete "${cat.name}"?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const response = await fetch(`${API_URL}/api/v1/users/categories/${cat.id}`, {
                                method: 'DELETE'
                            });
                            const result = await response.json();
                            if (result.status === 'success') {
                                // If current category deleted, reset to Employee
                                if (category === cat.name) {
                                    setCategory('Employee');
                                }
                                fetchCategories();
                            } else {
                                Alert.alert('Error', result.detail || 'Failed to delete category');
                            }
                        } catch (error) {
                            console.error('Delete category error:', error);
                            Alert.alert('Error', 'Failed to delete category');
                        }
                    }
                }
            ]
        );
    };

    const handleDeleteRole = (roleObj) => {
        showAlert(
            'Delete Role',
            `Are you sure you want to delete "${roleObj.name}"?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const response = await fetch(`${API_URL}/api/v1/levels/${roleObj.id}`, {
                                method: 'DELETE'
                            });
                            if (response.ok) {
                                // If current role deleted, reset to default
                                if (role === roleObj.name) {
                                    setRole('Waffler');
                                }
                                fetchDisplayRoles();
                            } else {
                                Alert.alert('Error', 'Failed to delete role');
                            }
                        } catch (error) {
                            console.error('Delete role error:', error);
                            Alert.alert('Error', 'Failed to delete role');
                        }
                    }
                }
            ]
        );
    };

    const handleSubmit = async () => {
        if (!name || !email) return;
        if (!isEditing && !password) return;

        setLoading(true);
        const payload = {
            name,
            email,
            role,
            category,
            privileges: selectedPrivileges,
            store: selectedStore,
            is_external: isExternal,
            joined_at_level: isExternal ? (joinedAtLevel || role) : null,
            profile_data: profileData,
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

            if (!isEditing) {
                setName('');
                setEmail('');
                setPassword('');
                setRole('Employee');
                setCategory('Employee');
                setSelectedPrivileges([]);
                setSelectedStore('');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleBulkUpload = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'],
                copyToCacheDirectory: true
            });

            if (result.canceled || !result.assets || result.assets.length === 0) {
                return;
            }

            const file = result.assets[0];
            setBulkUploading(true);
            setBulkResult(null);

            const formData = new FormData();
            if (Platform.OS === 'web') {
                const response = await fetch(file.uri);
                const blob = await response.blob();
                const webFile = new File([blob], file.name, { type: file.mimeType || 'application/vnd.ms-excel' });
                formData.append('file', webFile);
            } else {
                formData.append('file', {
                    uri: file.uri,
                    name: file.name,
                    type: file.mimeType || 'application/octet-stream'
                });
            }

            // Get auth token
            const token = await AsyncStorage.getItem('userToken');
            const headers = {};
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const response = await fetch(`${API_URL}/api/v1/users/bulk-upload`, {
                method: 'POST',
                body: formData,
                headers,
            });
            const data = await response.json();

            // Handle Background Task Response
            if (data.status === 'processing' && data.task_id) {
                if (onBulkUploadStart) {
                    onBulkUploadStart(data.task_id);
                } else {
                    // Fallback if no parent handler (though dashboard should have it)
                    Alert.alert('Upload Started', 'Upload is processing in background.');
                    onClose();
                }
                return;
            }

            setBulkResult(data);

            if (data.status === 'success') {
                const updatedMsg = data.updated > 0 ? `\n${data.updated} existing users updated.` : '';
                const skippedMsg = data.skipped > 0 ? `\n${data.skipped} rows skipped (invalid/missing email).` : '';
                Alert.alert(
                    'Upload Complete',
                    `Successfully created ${data.created} new users.${updatedMsg}${skippedMsg}`,
                    [{ text: 'OK' }]
                );
            } else {
                Alert.alert('Upload Failed', data.detail || 'Failed to process file');
            }
        } catch (error) {
            console.error('Bulk upload error:', error);
            Alert.alert('Error', 'Failed to upload file. Please try again.');
        } finally {
            setBulkUploading(false);
        }
    };

    const downloadTemplate = async () => {
        try {
            // New Template based on EXPORT_USERS format
            const header = allColumns.join(',');
            // Sample row with matching 44 columns
            const sampleRow1 = "BWCO-001,John Doe,johndoe,john.doe@company.com,Male,9876543210,123 Main St,Aadhar,123456789012,Graduate,Management,Completed,Manager,5 Years,Single,M,32,O+,Yes,Yes,Admin,01-01-2023,,,,,Mumbai Central,MUM-01,West,Mumbai,Maharashtra,Store Manager,Active,A,Retail,Store Operations,Operations,Store Mgmt,Operations,Store Manager,Store Manager,2023-01-01";
            // Note: Adjust the sample row to match the exact order of allColumns if needed. 
            // For safety, let's explicitely map them similar to the backend template example to ensure alignment.

            // Re-constructing sample row to be perfectly aligned with allColumns:
            const sampleData = [
                "BWCO-001", "John Doe", "TEMP-001", "johndoe", "1990-01-01",
                "Male", "john.doe@company.com", "9876543210", "123 Main St", "Aadhar", "123456789012",
                "Graduate", "Management", "Completed", "Store Manager",
                "5 Years", "Single", "M", "32", "O+",
                "Yes", "Yes", "Admin", "01-01-2023", "",
                "", "", "BWC Franchise", "Mumbai Central", "MUM-001",
                "West", "Mumbai", "Maharashtra", "Store Manager", "Active", "A", "Concept A",
                "Store Operations", "Operations", "Store Management", "Operations", "Store Manager",
                "Store Manager", "01-01-2023"
            ];
            const sampleRow = sampleData.map(val => val.includes(',') ? `"${val}"` : val).join(',');

            const csvContent = `${header}\n${sampleRow}`;

            if (Platform.OS === 'web') {
                const blob = new Blob([csvContent], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'employee_upload_template.csv';
                a.click();
                Alert.alert('Success', 'Template downloaded successfully!');
                return;
            }

            const fileUri = FileSystem.documentDirectory + 'employee_upload_template.csv';
            await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: 'utf8' });

            const isAvailable = await Sharing.isAvailableAsync();
            if (isAvailable) {
                await Sharing.shareAsync(fileUri, {
                    mimeType: 'text/csv',
                    dialogTitle: 'Save Employee Template',
                    UTI: 'public.comma-separated-values-text'
                });
            } else {
                Alert.alert('Template Ready', 'Template file created. Check your app documents folder.');
            }
        } catch (error) {
            console.error('Download template error:', error);
            Alert.alert(
                'Template Content',
                'Header: Employee Code, Full Name, Email, Designation, Department, Store Name...',
                [{ text: 'OK' }]
            );
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
                    {/* Header */}
                    <LinearGradient
                        colors={[THEME.primary, THEME.primaryDark]}
                        style={styles.headerGradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                    >
                        <View style={styles.header}>
                            <View>
                                <Text style={styles.title}>{isEditing ? 'Update Profile' : 'New Team Member'}</Text>
                                <Text style={styles.subtitle}>
                                    {isEditing ? 'Modify user details' : 'Add single or multiple users'}
                                </Text>
                            </View>
                            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                                <Feather name="x" size={24} color="#FFF" />
                            </TouchableOpacity>
                        </View>
                    </LinearGradient>

                    {/* Tab Selector */}
                    {!isEditing && (
                        <View style={styles.tabContainer}>
                            <TouchableOpacity
                                style={[styles.tab, activeTab === 'single' && styles.tabActive]}
                                onPress={() => setActiveTab('single')}
                            >
                                <Feather name="user-plus" size={16} color={activeTab === 'single' ? THEME.textMain : THEME.textSub} />
                                <Text style={[styles.tabText, activeTab === 'single' && styles.tabTextActive]}>Single User</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.tab, activeTab === 'bulk' && styles.tabActive]}
                                onPress={() => setActiveTab('bulk')}
                            >
                                <Feather name="upload-cloud" size={16} color={activeTab === 'bulk' ? THEME.textMain : THEME.textSub} />
                                <Text style={[styles.tabText, activeTab === 'bulk' && styles.tabTextActive]}>Bulk Upload</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        style={styles.scrollView}
                        contentContainerStyle={styles.contentContainer}
                    >
                        {activeTab === 'bulk' && !isEditing ? (
                            /* BULK UPLOAD TAB */
                            <View style={styles.bulkUploadContainer}>
                                <View style={styles.bulkHeader}>
                                    <MaterialCommunityIcons name="file-upload-outline" size={48} color={THEME.primary} />
                                    <Text style={styles.bulkTitle}>Bulk Upload</Text>
                                    <Text style={styles.bulkDesc}>
                                        Upload the standard employee export csv file
                                    </Text>
                                </View>

                                {/* Download Template Button */}
                                <TouchableOpacity style={styles.templateBtn} onPress={downloadTemplate}>
                                    <Feather name="download" size={18} color={THEME.primaryDark} />
                                    <Text style={styles.templateText}>Download Template (.csv)</Text>
                                </TouchableOpacity>

                                {/* Upload Button */}
                                <TouchableOpacity
                                    style={[styles.uploadBtn, bulkUploading && styles.uploadingBtn]}
                                    onPress={handleBulkUpload}
                                    disabled={bulkUploading}
                                >
                                    {bulkUploading ? (
                                        <>
                                            <ActivityIndicator color="#FFF" size="small" />
                                            <Text style={styles.uploadBtnText}>Processing...</Text>
                                        </>
                                    ) : (
                                        <>
                                            <Feather name="upload" size={20} color="#FFF" />
                                            <Text style={styles.uploadBtnText}>Select File to Upload</Text>
                                        </>
                                    )}
                                </TouchableOpacity>

                                {/* Upload Result */}
                                {bulkResult && (
                                    <View style={[styles.resultBox, bulkResult.status === 'success' ? styles.resultSuccess : styles.resultError]}>
                                        <Text style={styles.resultTitle}>
                                            {bulkResult.status === 'success' ? '✓ Upload Complete' : '✗ Upload Failed'}
                                        </Text>
                                        {bulkResult.status === 'success' && (
                                            <>
                                                <Text style={styles.resultText}>Created: {bulkResult.created} new users</Text>
                                                {bulkResult.updated > 0 && (
                                                    <Text style={styles.resultText}>Updated: {bulkResult.updated} existing users</Text>
                                                )}
                                                {bulkResult.skipped > 0 && (
                                                    <Text style={styles.resultText}>Skipped: {bulkResult.skipped} rows (invalid/missing email)</Text>
                                                )}
                                            </>
                                        )}
                                    </View>
                                )}

                                {/* Format Info */}
                                <View style={styles.formatInfo}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                        <Text style={styles.formatTitle}>Supported Columns ({allColumns.length})</Text>
                                        <TouchableOpacity onPress={() => setShowAllColumns(!showAllColumns)}>
                                            <Text style={{ color: THEME.primaryDark, fontWeight: '600' }}>
                                                {showAllColumns ? 'Show Less' : 'Show All'}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>

                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                        {(showAllColumns ? allColumns : allColumns.slice(0, 9)).map((col, index) => (
                                            <View key={index} style={{
                                                backgroundColor: '#FEF3C7',
                                                paddingHorizontal: 12,
                                                paddingVertical: 6,
                                                borderRadius: 20,
                                                borderWidth: 1,
                                                borderColor: '#FDE68A',
                                                marginBottom: 4
                                            }}>
                                                <Text style={{
                                                    fontSize: 12,
                                                    color: '#92400E',
                                                    fontWeight: '500'
                                                }}>{col}</Text>
                                            </View>
                                        ))}
                                        {!showAllColumns && (
                                            <TouchableOpacity
                                                onPress={() => setShowAllColumns(true)}
                                                style={{
                                                    backgroundColor: '#FFFBEB',
                                                    paddingHorizontal: 12,
                                                    paddingVertical: 6,
                                                    borderRadius: 20,
                                                    borderWidth: 1,
                                                    borderColor: THEME.primary,
                                                    borderStyle: 'dashed'
                                                }}>
                                                <Text style={{ fontSize: 12, color: THEME.primaryDark }}>+ {allColumns.length - 9} more...</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                </View>
                            </View>
                        ) : (
                            /* SINGLE USER FORM */
                            <>
                                {/* Basic Info Section */}
                                <View style={styles.section}>
                                    <Text style={styles.sectionTitle}>
                                        <Feather name="user" size={16} color={THEME.primaryDark} /> Basic Information
                                    </Text>

                                    <Text style={styles.label}>Full Name</Text>
                                    <View style={styles.inputBox}>
                                        <Feather name="user" size={18} color={THEME.primaryDark} />
                                        <TextInput
                                            placeholder="John Doe"
                                            placeholderTextColor="#92400E"
                                            style={styles.input}
                                            value={name}
                                            onChangeText={setName}
                                        />
                                    </View>

                                    <Text style={styles.label}>Email / Username {isEditing && '(Read-only)'}</Text>
                                    <View style={[styles.inputBox, isEditing && styles.inputDisabled]}>
                                        <Feather name="mail" size={18} color={THEME.primaryDark} />
                                        <TextInput
                                            placeholder="john@email.com"
                                            placeholderTextColor="#92400E"
                                            style={styles.input}
                                            keyboardType="email-address"
                                            autoCapitalize="none"
                                            value={email}
                                            onChangeText={setEmail}
                                            editable={!isEditing}
                                        />
                                    </View>

                                    <Text style={styles.label}>Password {isEditing && '(Leave blank to keep current)'}</Text>
                                    <View style={styles.inputBox}>
                                        <Feather name="lock" size={18} color={THEME.primaryDark} />
                                        <TextInput
                                            placeholder="••••••••"
                                            placeholderTextColor="#92400E"
                                            style={styles.input}
                                            secureTextEntry
                                            value={password}
                                            onChangeText={setPassword}
                                        />
                                    </View>
                                </View>

                                {/* Store Assignment Section with Search */}
                                <View style={styles.section}>
                                    <Text style={styles.sectionTitle}>
                                        <MaterialCommunityIcons name="store" size={16} color={THEME.primaryDark} /> Store Assignment
                                    </Text>
                                    <Text style={styles.sectionDesc}>Assign employee to a store for tracking</Text>

                                    {/* Store Search */}
                                    <View style={styles.storeSearchBox}>
                                        <Feather name="search" size={16} color={THEME.primaryDark} />
                                        <TextInput
                                            placeholder="Search stores..."
                                            placeholderTextColor="#92400E"
                                            style={styles.storeSearchInput}
                                            value={storeSearch}
                                            onChangeText={setStoreSearch}
                                        />
                                        {storeSearch.length > 0 && (
                                            <TouchableOpacity onPress={() => setStoreSearch('')}>
                                                <Feather name="x" size={16} color={THEME.primaryDark} />
                                            </TouchableOpacity>
                                        )}
                                    </View>

                                    {/* Selected Store Display */}
                                    {selectedStore ? (
                                        <View style={styles.selectedStoreBox}>
                                            <MaterialCommunityIcons name="store-check" size={18} color="#10B981" />
                                            <Text style={styles.selectedStoreText}>{selectedStore}</Text>
                                            <TouchableOpacity onPress={() => setSelectedStore('')}>
                                                <Feather name="x-circle" size={18} color="#EF4444" />
                                            </TouchableOpacity>
                                        </View>
                                    ) : null}

                                    {!showNewStore ? (
                                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.storeScroll}>
                                            {filteredStores.map((store) => (
                                                <TouchableOpacity
                                                    key={store.id}
                                                    style={[
                                                        styles.storeChip,
                                                        selectedStore === store.name && styles.storeChipActive
                                                    ]}
                                                    onPress={() => setSelectedStore(store.name)}
                                                    onLongPress={() => handleDeleteStore(store)}
                                                    delayLongPress={500}
                                                >
                                                    <MaterialCommunityIcons
                                                        name="store"
                                                        size={14}
                                                        color={selectedStore === store.name ? '#451A03' : '#92400E'}
                                                    />
                                                    <Text style={[
                                                        styles.storeText,
                                                        selectedStore === store.name && styles.storeTextActive
                                                    ]}>
                                                        {store.name}
                                                    </Text>
                                                    <Text style={[
                                                        styles.storeCityText,
                                                        selectedStore === store.name && styles.storeCityTextActive
                                                    ]}>
                                                        {store.city}
                                                    </Text>

                                                    {/* Delete Button (Web friendly) */}
                                                    {store.id !== '1' && (
                                                        <TouchableOpacity
                                                            style={{ marginLeft: 6, opacity: 0.6 }}
                                                            onPress={() => handleDeleteStore(store)}
                                                        >
                                                            <Feather name="x" size={12} color={selectedStore === store.name ? '#451A03' : '#EF4444'} />
                                                        </TouchableOpacity>
                                                    )}
                                                </TouchableOpacity>
                                            ))}

                                            {/* New Store Button */}
                                            <TouchableOpacity
                                                style={styles.addCategoryBtn}
                                                onPress={() => setShowNewStore(true)}
                                            >
                                                <Feather name="plus" size={16} color={THEME.primaryDark} />
                                                <Text style={styles.addCategoryText}>New</Text>
                                            </TouchableOpacity>
                                        </ScrollView>
                                    ) : (
                                        <View style={styles.newCategoryRow}>
                                            <View style={{ flex: 1, gap: 8 }}>
                                                <TextInput
                                                    style={styles.newCategoryInput}
                                                    placeholder="Store Name"
                                                    placeholderTextColor="#92400E"
                                                    value={newStoreName}
                                                    onChangeText={setNewStoreName}
                                                />
                                                <TextInput
                                                    style={styles.newCategoryInput}
                                                    placeholder="City (e.g. Mumbai)"
                                                    placeholderTextColor="#92400E"
                                                    value={newStoreCity}
                                                    onChangeText={setNewStoreCity}
                                                />
                                            </View>
                                            <View style={{ flexDirection: 'column', gap: 4 }}>
                                                <TouchableOpacity style={styles.newCatBtnSave} onPress={handleCreateStore}>
                                                    <Feather name="check" size={18} color="#FFF" />
                                                </TouchableOpacity>
                                                <TouchableOpacity style={styles.newCatBtnCancel} onPress={() => setShowNewStore(false)}>
                                                    <Feather name="x" size={18} color="#FFF" />
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    )}
                                </View>

                                {/* Category Section */}
                                {isSuperAdmin && (
                                    <View style={styles.section}>
                                        <Text style={styles.sectionTitle}>
                                            <MaterialCommunityIcons name="tag-multiple" size={16} color={THEME.primaryDark} /> User Category
                                        </Text>

                                        {!showNewCategory ? (
                                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
                                                {categories.map((cat) => (
                                                    <TouchableOpacity
                                                        key={cat.id}
                                                        style={[
                                                            styles.categoryChip,
                                                            category === cat.name && {
                                                                backgroundColor: cat.color || THEME.primary,
                                                                borderColor: cat.color || THEME.primary
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

                                                        {/* Delete Button (Allow blocking only 1 and 4) */}
                                                        {!['1', '4'].includes(cat.id) && (
                                                            <TouchableOpacity
                                                                style={{ marginLeft: 6, opacity: 0.7 }}
                                                                onPress={() => handleDeleteCategory(cat)}
                                                            >
                                                                <Feather name="x" size={14} color={category === cat.name ? '#FFF' : '#EF4444'} />
                                                            </TouchableOpacity>
                                                        )}
                                                    </TouchableOpacity>
                                                ))}
                                                <TouchableOpacity
                                                    style={styles.addCategoryBtn}
                                                    onPress={() => setShowNewCategory(true)}
                                                >
                                                    <Feather name="plus" size={16} color={THEME.primaryDark} />
                                                    <Text style={styles.addCategoryText}>New</Text>
                                                </TouchableOpacity>
                                            </ScrollView>
                                        ) : (
                                            <View style={styles.newCategoryRow}>
                                                <TextInput
                                                    style={styles.newCategoryInput}
                                                    placeholder="New Category Name"
                                                    placeholderTextColor="#92400E"
                                                    value={newCategoryName}
                                                    onChangeText={setNewCategoryName}
                                                />
                                                <TouchableOpacity style={styles.newCatBtnSave} onPress={handleCreateCategory}>
                                                    <Feather name="check" size={18} color="#FFF" />
                                                </TouchableOpacity>
                                                <TouchableOpacity style={styles.newCatBtnCancel} onPress={() => setShowNewCategory(false)}>
                                                    <Feather name="x" size={18} color="#FFF" />
                                                </TouchableOpacity>
                                            </View>
                                        )}
                                    </View>
                                )}

                                {/* Role Selection - Uses dynamic progression levels */}
                                <View style={styles.section}>
                                    <Text style={styles.sectionTitle}>
                                        <Feather name="briefcase" size={16} color={THEME.primaryDark} /> Display Role (Progression Level)
                                    </Text>
                                    <Text style={styles.sectionDesc}>Select the employee's progression level</Text>

                                    {!showNewRole ? (
                                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.roleScroll}>
                                            {displayRoles.map(r => (
                                                <TouchableOpacity
                                                    key={r.id}
                                                    style={[styles.roleBtn, role === r.name && styles.roleActive]}
                                                    onPress={() => setRole(r.name)}
                                                    onLongPress={() => handleDeleteRole(r)}
                                                    delayLongPress={500}
                                                >
                                                    <Text style={[styles.roleText, role === r.name && styles.roleTextActive]}>
                                                        {r.name}
                                                    </Text>

                                                    {/* Delete Button (Web friendly) */}
                                                    <TouchableOpacity
                                                        style={{ marginLeft: 6, opacity: 0.6 }}
                                                        onPress={() => handleDeleteRole(r)}
                                                    >
                                                        <Feather name="x" size={12} color={role === r.name ? '#FFF' : '#EF4444'} />
                                                    </TouchableOpacity>
                                                </TouchableOpacity>
                                            ))}
                                            {/* Add New Role Button */}
                                            {isSuperAdmin && (
                                                <TouchableOpacity
                                                    style={styles.addRoleBtn}
                                                    onPress={() => setShowNewRole(true)}
                                                >
                                                    <Feather name="plus" size={16} color={THEME.primaryDark} />
                                                    <Text style={styles.addRoleText}>New</Text>
                                                </TouchableOpacity>
                                            )}
                                        </ScrollView>
                                    ) : (
                                        <View style={styles.newRoleRow}>
                                            <TextInput
                                                style={styles.newRoleInput}
                                                placeholder="New Role Name (e.g., Team Lead)"
                                                placeholderTextColor="#92400E"
                                                value={newRoleName}
                                                onChangeText={setNewRoleName}
                                                autoFocus
                                            />
                                            <TouchableOpacity
                                                style={[styles.newRoleBtnSave, creatingRole && { opacity: 0.6 }]}
                                                onPress={handleCreateRole}
                                                disabled={creatingRole}
                                            >
                                                {creatingRole ? (
                                                    <ActivityIndicator size="small" color="#FFF" />
                                                ) : (
                                                    <Feather name="check" size={18} color="#FFF" />
                                                )}
                                            </TouchableOpacity>
                                            <TouchableOpacity style={styles.newRoleBtnCancel} onPress={() => {
                                                setShowNewRole(false);
                                                setNewRoleName('');
                                            }}>
                                                <Feather name="x" size={18} color="#FFF" />
                                            </TouchableOpacity>
                                        </View>
                                    )}
                                </View>

                                {/* External User Section */}
                                <View style={styles.section}>
                                    <Text style={styles.sectionTitle}>
                                        <MaterialCommunityIcons name="account-arrow-right" size={16} color={THEME.primaryDark} /> External User (New Joiner)
                                    </Text>
                                    <Text style={styles.sectionDesc}>
                                        Mark if this user joined the organization at a higher level. They will see all prior levels merged into one learning path.
                                    </Text>

                                    <TouchableOpacity
                                        style={{
                                            flexDirection: 'row', alignItems: 'center', gap: 10,
                                            backgroundColor: isExternal ? '#FEF3C7' : '#F9FAFB',
                                            padding: 12, borderRadius: 12,
                                            borderWidth: 1, borderColor: isExternal ? '#F59E0B' : '#E5E7EB',
                                        }}
                                        onPress={() => {
                                            const next = !isExternal;
                                            setIsExternal(next);
                                            if (next && !joinedAtLevel) setJoinedAtLevel(role);
                                        }}
                                    >
                                        <View style={{
                                            width: 22, height: 22, borderRadius: 6,
                                            backgroundColor: isExternal ? '#F59E0B' : '#E5E7EB',
                                            justifyContent: 'center', alignItems: 'center',
                                        }}>
                                            {isExternal && <Feather name="check" size={14} color="#FFF" />}
                                        </View>
                                        <Text style={{ fontSize: 14, fontWeight: '600', color: '#451A03' }}>
                                            External User
                                        </Text>
                                        {isExternal && (
                                            <View style={{ backgroundColor: '#F59E0B', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginLeft: 'auto' }}>
                                                <Text style={{ fontSize: 11, color: '#FFF', fontWeight: '700' }}>EXTERNAL</Text>
                                            </View>
                                        )}
                                    </TouchableOpacity>

                                    {isExternal && (
                                        <View style={{ marginTop: 12 }}>
                                            <Text style={styles.label}>Joined At Level</Text>
                                            <Text style={{ fontSize: 11, color: '#92400E', marginBottom: 8 }}>
                                                All levels from the start up to this level will be merged into one unified learning path.
                                            </Text>
                                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.roleScroll}>
                                                {displayRoles.map(r => (
                                                    <TouchableOpacity
                                                        key={r.id}
                                                        style={[styles.roleBtn, (joinedAtLevel || role) === r.name && styles.roleActive]}
                                                        onPress={() => setJoinedAtLevel(r.name)}
                                                    >
                                                        <Text style={[styles.roleText, (joinedAtLevel || role) === r.name && styles.roleTextActive]}>
                                                            {r.name}
                                                        </Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </ScrollView>
                                        </View>
                                    )}
                                </View>

                                {/* Privileges Section — grouped view/manage */}
                                {canManagePrivileges && (
                                    <View style={styles.section}>
                                        <View style={styles.privilegeHeader}>
                                            <Text style={styles.sectionTitle}>
                                                <MaterialCommunityIcons name="shield-lock" size={16} color={THEME.primaryDark} /> Admin Privileges
                                            </Text>
                                            <View style={styles.privilegeActions}>
                                                <TouchableOpacity onPress={selectAllPrivileges} style={styles.selectAllBtn}>
                                                    <Text style={styles.selectAllText}>All</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity onPress={clearAllPrivileges} style={styles.clearBtn}>
                                                    <Text style={styles.clearText}>Clear</Text>
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                        <Text style={styles.sectionDesc}>
                                            Selected: {selectedPrivileges.length} / {privileges.length}
                                        </Text>

                                        {privilegeGroups.length > 0 ? (() => {
                                            // Helper: select/deselect specific IDs
                                            const grantIds = (ids) => setSelectedPrivileges(prev => {
                                                const s = new Set(prev);
                                                ids.forEach(id => s.add(id));
                                                return Array.from(s);
                                            });
                                            const revokeIds = (ids) => setSelectedPrivileges(prev =>
                                                prev.filter(p => !ids.includes(p))
                                            );

                                            return privilegeGroups.map((group) => {
                                                // Separate paired (feature-keyed) from standalone items
                                                const featureMap = {};
                                                const standalone = [];
                                                group.items.forEach(item => {
                                                    if (item.feature) {
                                                        if (!featureMap[item.feature]) featureMap[item.feature] = { label: item.label };
                                                        featureMap[item.feature][item.access] = item;
                                                    } else {
                                                        standalone.push(item);
                                                    }
                                                });

                                                const rows = [
                                                    ...Object.entries(featureMap).map(([feat, pair]) => ({ type: 'paired', key: feat, ...pair })),
                                                    ...standalone.map(item => ({ type: 'standalone', key: item.id, item })),
                                                ];

                                                return (
                                                    <View key={group.label} style={{ marginBottom: 14 }}>
                                                        {/* Group header */}
                                                        <View style={{
                                                            flexDirection: 'row', alignItems: 'center', gap: 6,
                                                            marginBottom: 8, paddingBottom: 5,
                                                            borderBottomWidth: 1, borderBottomColor: THEME.border,
                                                        }}>
                                                            <Feather name={group.icon || 'box'} size={13} color={THEME.primaryDark} />
                                                            <Text style={{ fontSize: 12, fontWeight: '700', color: THEME.textMain }}>
                                                                {group.label}
                                                            </Text>
                                                        </View>

                                                        {rows.map(row => {
                                                            if (row.type === 'paired') {
                                                                // 3-state: OFF | VIEW | MANAGE
                                                                const viewId = row.view?.id;
                                                                const manageId = row.manage?.id;
                                                                const hasManage = manageId && selectedPrivileges.includes(manageId);
                                                                const hasView = viewId && selectedPrivileges.includes(viewId);
                                                                const level = hasManage ? 'manage' : hasView ? 'view' : 'none';

                                                                const allIds = [viewId, manageId].filter(Boolean);
                                                                const setLevel = (newLevel) => {
                                                                    revokeIds(allIds);
                                                                    if (newLevel === 'view' && viewId) grantIds([viewId]);
                                                                    if (newLevel === 'manage') grantIds(allIds);
                                                                };

                                                                return (
                                                                    <View key={row.key} style={privRowStyle}>
                                                                        <Text style={privLabelStyle} numberOfLines={1}>{row.label}</Text>
                                                                        <View style={segStyle}>
                                                                            <TouchableOpacity onPress={() => setLevel('none')} style={[segBtnStyle, level === 'none' && segOffActive]}>
                                                                                <Text style={[segTxtStyle, level === 'none' && { color: '#374151', fontWeight: '700' }]}>OFF</Text>
                                                                            </TouchableOpacity>
                                                                            <View style={segDivider} />
                                                                            {viewId && (<>
                                                                                <TouchableOpacity onPress={() => setLevel('view')} style={[segBtnStyle, level === 'view' && segViewActive]}>
                                                                                    <Text style={[segTxtStyle, level === 'view' && { color: '#1D4ED8', fontWeight: '700' }]}>VIEW</Text>
                                                                                </TouchableOpacity>
                                                                                <View style={segDivider} />
                                                                            </>)}
                                                                            {manageId && (
                                                                                <TouchableOpacity onPress={() => setLevel('manage')} style={[segBtnStyle, level === 'manage' && segManageActive]}>
                                                                                    <Text style={[segTxtStyle, level === 'manage' && { color: '#92400E', fontWeight: '700' }]}>MANAGE</Text>
                                                                                </TouchableOpacity>
                                                                            )}
                                                                        </View>
                                                                    </View>
                                                                );
                                                            } else {
                                                                // Standalone: OFF | VIEW or OFF | MANAGE
                                                                const priv = row.item;
                                                                const active = selectedPrivileges.includes(priv.id);
                                                                const isView = priv.access === 'view';
                                                                return (
                                                                    <View key={row.key} style={privRowStyle}>
                                                                        <Text style={privLabelStyle} numberOfLines={1}>{priv.label}</Text>
                                                                        <View style={segStyle}>
                                                                            <TouchableOpacity
                                                                                onPress={() => active && revokeIds([priv.id])}
                                                                                style={[segBtnStyle, !active && segOffActive]}
                                                                            >
                                                                                <Text style={[segTxtStyle, !active && { color: '#374151', fontWeight: '700' }]}>OFF</Text>
                                                                            </TouchableOpacity>
                                                                            <View style={segDivider} />
                                                                            <TouchableOpacity
                                                                                onPress={() => !active && grantIds([priv.id])}
                                                                                style={[segBtnStyle, active && (isView ? segViewActive : segManageActive)]}
                                                                            >
                                                                                <Text style={[segTxtStyle, active && { color: isView ? '#1D4ED8' : '#92400E', fontWeight: '700' }]}>
                                                                                    {isView ? 'VIEW' : 'MANAGE'}
                                                                                </Text>
                                                                            </TouchableOpacity>
                                                                        </View>
                                                                    </View>
                                                                );
                                                            }
                                                        })}
                                                    </View>
                                                );
                                            });
                                        })() : (
                                            <View style={styles.privilegeGrid}>
                                                {privileges.map((priv) => (
                                                    <TouchableOpacity
                                                        key={priv.id}
                                                        style={[styles.privilegeItem, selectedPrivileges.includes(priv.id) && styles.privilegeItemActive]}
                                                        onPress={() => togglePrivilege(priv.id)}
                                                    >
                                                        <View style={[styles.privilegeCheck, selectedPrivileges.includes(priv.id) && styles.privilegeCheckActive]}>
                                                            {selectedPrivileges.includes(priv.id) && <Feather name="check" size={10} color="#FFF" />}
                                                        </View>
                                                        <View style={styles.privilegeInfo}>
                                                            <Feather name={priv.icon || 'box'} size={12} color={selectedPrivileges.includes(priv.id) ? THEME.textMain : THEME.textSub} />
                                                            <Text style={[styles.privilegeName, selectedPrivileges.includes(priv.id) && styles.privilegeNameActive]} numberOfLines={1}>
                                                                {priv.name}
                                                            </Text>
                                                        </View>
                                                    </TouchableOpacity>
                                                ))}
                                            </View>
                                        )}
                                    </View>
                                )}

                                {/* Full Profile Data Section (Available for Create & Edit) */}
                                <View style={styles.section}>
                                    <TouchableOpacity
                                        style={{
                                            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                                            paddingVertical: 12,
                                            backgroundColor: '#FFF',
                                            paddingHorizontal: 12,
                                            borderRadius: 12,
                                            borderWidth: 1,
                                            borderColor: '#FDE68A'
                                        }}
                                        onPress={() => setShowProfileSection(!showProfileSection)}
                                    >
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                            <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' }}>
                                                <Feather name="file-text" size={16} color={THEME.primaryDark} />
                                            </View>
                                            <View>
                                                <Text style={{ fontSize: 14, fontWeight: '700', color: '#451A03' }}>Detailed Profile Information</Text>
                                                <Text style={{ fontSize: 11, color: '#92400E' }}>
                                                    {isEditing ? 'Edit all employee record fields' : 'Fill extended details (optional)'}
                                                </Text>
                                            </View>
                                        </View>
                                        <Feather name={showProfileSection ? 'chevron-up' : 'chevron-down'} size={20} color={THEME.primaryDark} />
                                    </TouchableOpacity>

                                    {showProfileSection && (() => {
                                        const profileFields = [
                                            {
                                                section: 'Personal', fields: [
                                                    { key: 'Employee Code', label: 'Employee Code' },
                                                    { key: 'Temporary Employee Code', label: 'Temp Employee Code' },
                                                    { key: 'User Name', label: 'Username' },
                                                    { key: 'Date of Birth', label: 'Date of Birth (DD-MM-YYYY)' },
                                                    { key: 'Gender', label: 'Gender' },
                                                    { key: 'Contact Number', label: 'Contact Number' },
                                                    { key: 'Address', label: 'Address' },
                                                    { key: 'Marital Status', label: 'Marital Status' },
                                                    { key: 'Blood Group', label: 'Blood Group' },
                                                    { key: 'Shirt Size', label: 'Shirt Size' },
                                                    { key: 'Denim Size', label: 'Denim Size' },
                                                ]
                                            },
                                            {
                                                section: 'Identity', fields: [
                                                    { key: 'Proof Type', label: 'Proof Type' },
                                                    { key: 'Proof ID', label: 'Proof ID' },
                                                ]
                                            },
                                            {
                                                section: 'Qualification', fields: [
                                                    { key: 'Qualification', label: 'Qualification' },
                                                    { key: 'Specialization', label: 'Specialization' },
                                                    { key: 'Qualification Status', label: 'Qualification Status' },
                                                    { key: 'Previous Experience Designation', label: 'Prev. Designation' },
                                                    { key: 'Previous Experience', label: 'Previous Experience' },
                                                ]
                                            },
                                            {
                                                section: 'Employment', fields: [
                                                    { key: 'Joining Date', label: 'Joining Date' },
                                                    { key: 'Date of Resign', label: 'Date of Resign' },
                                                    { key: 'Date of Leaving', label: 'Date of Leaving' },
                                                    { key: 'Reason for Leaving', label: 'Reason for Leaving' },
                                                    { key: 'User Status', label: 'User Status (ACTIVE/In-Active)' },
                                                    { key: 'Account Verified', label: 'Account Verified (YES/NO)' },
                                                    { key: 'Account Approved', label: 'Account Approved (YES/NO)' },
                                                    { key: 'Approved By', label: 'Approved By' },
                                                    { key: 'Grade', label: 'Grade' },
                                                    { key: 'User Created On', label: 'User Created On' },
                                                ]
                                            },
                                            {
                                                section: 'Organisation', fields: [
                                                    { key: 'Designation', label: 'Designation' },
                                                    { key: 'Department', label: 'Department' },
                                                    { key: 'Sub Department', label: 'Sub Department' },
                                                    { key: 'Function', label: 'Function' },
                                                    { key: 'Sub Function', label: 'Sub Function' },
                                                    { key: 'Job Role', label: 'Job Role' },
                                                    { key: 'Career Job Roles', label: 'Career Job Roles' },
                                                    { key: 'Concept', label: 'Concept' },
                                                    { key: 'Franchise', label: 'Franchise' },
                                                ]
                                            },
                                            {
                                                section: 'Location', fields: [
                                                    { key: 'Store Name', label: 'Store Name' },
                                                    { key: 'Store Code', label: 'Store Code' },
                                                    { key: 'Region', label: 'Region' },
                                                    { key: 'City', label: 'City' },
                                                    { key: 'State', label: 'State' },
                                                ]
                                            },
                                        ];

                                        const handleOpenSelect = (key, label) => {
                                            const mapEntry = FIELD_MAP[key];
                                            let options = [];
                                            if (mapEntry.options) {
                                                options = mapEntry.options;
                                            } else if (mapEntry.key && filterOptions[mapEntry.key]) {
                                                options = filterOptions[mapEntry.key];
                                            }

                                            setSelectTitle(label);
                                            setTargetFieldKey(key);
                                            setSelectData(options);
                                            setSelectSearch('');
                                            setSelectModalVisible(true);
                                        };

                                        return (
                                            <View style={{ marginTop: 20 }}>
                                                {profileFields.map(({ section, fields }) => (
                                                    <View key={section} style={{ marginBottom: 24 }}>
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                                                            <View style={{ height: 1, flex: 1, backgroundColor: '#FDE68A' }} />
                                                            <Text style={{
                                                                fontSize: 12, fontWeight: '700', color: THEME.primaryDark,
                                                                textTransform: 'uppercase', letterSpacing: 0.5,
                                                                marginHorizontal: 12
                                                            }}>{section}</Text>
                                                            <View style={{ height: 1, flex: 1, backgroundColor: '#FDE68A' }} />
                                                        </View>

                                                        {fields.map(({ key, label }) => {
                                                            const hasOptions = !!FIELD_MAP[key];
                                                            const currentValue = profileData[key] != null ? String(profileData[key]) : '';

                                                            return (
                                                                <View key={key} style={{ marginBottom: 16 }}>
                                                                    <Text style={styles.label}>{label}</Text>
                                                                    {hasOptions ? (
                                                                        <TouchableOpacity
                                                                            style={[styles.inputBox, { justifyContent: 'space-between' }]}
                                                                            onPress={() => handleOpenSelect(key, label)}
                                                                        >
                                                                            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                                                                <Feather name={FIELD_MAP[key].icon || 'edit-2'} size={16} color={THEME.primaryDark} style={{ marginRight: 10 }} />
                                                                                <Text style={[styles.input, { marginLeft: 0, color: currentValue ? '#451A03' : '#9CA3AF' }]}>
                                                                                    {currentValue || `Select ${label}`}
                                                                                </Text>
                                                                            </View>
                                                                            <Feather name="chevron-down" size={18} color="#92400E" />
                                                                        </TouchableOpacity>
                                                                    ) : (
                                                                        <View style={styles.inputBox}>
                                                                            <TextInput
                                                                                placeholder={label}
                                                                                placeholderTextColor="#92400E"
                                                                                style={styles.input}
                                                                                value={currentValue}
                                                                                onChangeText={(val) => setProfileData(prev => ({ ...prev, [key]: val }))}
                                                                            />
                                                                        </View>
                                                                    )}
                                                                </View>
                                                            );
                                                        })}
                                                    </View>
                                                ))}
                                            </View>
                                        );
                                    })()}
                                </View>

                                {/* Submit Button */}
                                <TouchableOpacity
                                    style={[
                                        styles.createBtn,
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
                                                {isEditing ? 'Update Profile' : 'Create Member'}
                                            </Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                            </>
                        )}
                    </ScrollView>
                </Pressable>
            </Pressable>

            {/* SELECTION MODAL */}
            <Modal
                visible={selectModalVisible}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setSelectModalVisible(false)}
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === "ios" ? "padding" : "height"}
                    style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}
                >
                    <View style={{
                        backgroundColor: '#FFF',
                        borderTopLeftRadius: 24,
                        borderTopRightRadius: 24,
                        maxHeight: '80%',
                        paddingTop: 16,
                        shadowColor: "#000",
                        shadowOffset: { width: 0, height: -2 },
                        shadowOpacity: 0.1,
                        shadowRadius: 10,
                        elevation: 5
                    }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 16 }}>
                            <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827' }}>Select {selectTitle}</Text>
                            <TouchableOpacity onPress={() => setSelectModalVisible(false)} style={{ padding: 4 }}>
                                <Feather name="x" size={24} color="#6B7280" />
                            </TouchableOpacity>
                        </View>

                        <View style={{ paddingHorizontal: 20, marginBottom: 10 }}>
                            <View style={{
                                flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6',
                                borderRadius: 12, paddingHorizontal: 12, height: 46
                            }}>
                                <Feather name="search" size={18} color="#9CA3AF" />
                                <TextInput
                                    placeholder={`Search or type new ${selectTitle}...`}
                                    style={{ flex: 1, marginLeft: 10, fontSize: 15, color: '#1F2937' }}
                                    value={selectSearch}
                                    onChangeText={setSelectSearch}
                                    autoFocus
                                />
                                {selectSearch.length > 0 && (
                                    <TouchableOpacity onPress={() => setSelectSearch('')}>
                                        <Feather name="x-circle" size={16} color="#9CA3AF" />
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>

                        <FlatList
                            data={selectData}
                            keyExtractor={(item, index) => String(item) + index}
                            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
                            keyboardShouldPersistTaps="always"
                            renderItem={({ item }) => {
                                const match = item.toLowerCase().includes(selectSearch.toLowerCase());
                                if (!match && selectSearch) return null; // Simple client-side filter
                                return (
                                    <TouchableOpacity
                                        style={{
                                            paddingVertical: 14,
                                            borderBottomWidth: 1,
                                            borderBottomColor: '#F3F4F6',
                                            flexDirection: 'row',
                                            alignItems: 'center'
                                        }}
                                        onPress={() => {
                                            setProfileData(prev => ({ ...prev, [targetFieldKey]: item }));
                                            setSelectModalVisible(false);
                                        }}
                                    >
                                        <Feather name="arrow-right" size={16} color="#D1D5DB" style={{ marginRight: 12 }} />
                                        <Text style={{ fontSize: 16, color: '#374151' }}>{item}</Text>
                                    </TouchableOpacity>
                                );
                            }}
                            ListFooterComponent={() => (
                                selectSearch.length > 0 && !selectData.some(d => d.toLowerCase() === selectSearch.toLowerCase()) ? (
                                    <TouchableOpacity
                                        style={{
                                            marginTop: 10,
                                            paddingVertical: 14,
                                            backgroundColor: '#FFFBEB',
                                            borderRadius: 12,
                                            flexDirection: 'row',
                                            justifyContent: 'center',
                                            alignItems: 'center',
                                            borderWidth: 1,
                                            borderColor: '#FDE68A'
                                        }}
                                        onPress={() => {
                                            setProfileData(prev => ({ ...prev, [targetFieldKey]: selectSearch }));
                                            setSelectModalVisible(false);
                                        }}
                                    >
                                        <Feather name="plus-circle" size={18} color="#D97706" style={{ marginRight: 8 }} />
                                        <Text style={{ color: '#D97706', fontWeight: '600', fontSize: 15 }}>
                                            Use "{selectSearch}"
                                        </Text>
                                    </TouchableOpacity>
                                ) : null
                            )}
                            ListEmptyComponent={() => (
                                !selectSearch && (
                                    <View style={{ padding: 20, alignItems: 'center' }}>
                                        <Text style={{ color: '#9CA3AF' }}>No options available.</Text>
                                        <Text style={{ color: '#9CA3AF', fontSize: 12 }}>Type to add a new one.</Text>
                                    </View>
                                )
                            )}
                        />
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </Modal>
    );
};

export default CreateUser;

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(69, 26, 3, 0.6)', // Dark brown overlay
        justifyContent: 'center',
        padding: 16,
    },
    card: {
        backgroundColor: '#FFFBEB', // Cream bg
        borderRadius: 24,
        maxHeight: '90%',
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#FDE68A',
        elevation: 5,
        shadowColor: '#F59E0B',
        shadowOpacity: 0.2,
        shadowRadius: 10,
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
        color: 'rgba(255,255,255,0.9)',
        marginTop: 2,
    },
    closeBtn: {
        backgroundColor: 'rgba(255,255,255,0.2)',
        padding: 8,
        borderRadius: 12,
    },
    tabContainer: {
        flexDirection: 'row',
        padding: 8,
        backgroundColor: '#FEF3C7',
        gap: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#FDE68A',
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: '#FFFBEB',
        gap: 6,
        borderWidth: 1,
        borderColor: '#FDE68A',
    },
    tabActive: {
        backgroundColor: '#F59E0B',
        borderColor: '#F59E0B',
    },
    tabText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#92400E',
    },
    tabTextActive: {
        color: '#FFF',
    },
    scrollView: {},
    contentContainer: {
        padding: 16,
        paddingBottom: 60,
    },
    section: {
        marginBottom: 20,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#451A03',
        marginBottom: 4,
    },
    sectionDesc: {
        fontSize: 12,
        color: '#92400E',
        marginBottom: 12,
    },
    label: {
        fontSize: 13,
        fontWeight: '600',
        color: '#451A03',
        marginBottom: 6,
        marginTop: 12,
    },
    inputBox: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#FDE68A',
        borderRadius: 14,
        paddingHorizontal: 12,
        height: 50,
        backgroundColor: '#FFFFFF',
    },
    inputDisabled: {
        backgroundColor: '#F1F5F9',
        opacity: 0.7,
    },
    input: {
        flex: 1,
        marginLeft: 10,
        fontSize: 15,
        color: '#451A03',
    },
    // Store Search
    storeSearchBox: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#FDE68A',
        borderRadius: 10,
        paddingHorizontal: 10,
        height: 40,
        backgroundColor: '#FFFFFF',
        marginBottom: 10,
        gap: 8,
    },
    storeSearchInput: {
        flex: 1,
        fontSize: 14,
        color: '#451A03',
    },
    selectedStoreBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#DCFCE7',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 10,
        marginBottom: 10,
        gap: 8,
        borderWidth: 1,
        borderColor: '#86EFAC',
    },
    selectedStoreText: {
        flex: 1,
        fontSize: 14,
        fontWeight: '600',
        color: '#166534',
    },
    storeScroll: {
        flexDirection: 'row',
    },
    storeChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#FDE68A',
        marginRight: 8,
        backgroundColor: '#FFFFFF',
        gap: 6,
    },
    storeChipActive: {
        backgroundColor: '#F59E0B',
        borderColor: '#F59E0B',
    },
    storeText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#92400E',
    },
    storeTextActive: {
        color: '#FFF',
    },
    storeCityText: {
        fontSize: 11,
        color: '#D97706',
    },
    storeCityTextActive: {
        color: 'rgba(255,255,255,0.8)',
    },
    categoryScroll: {
        flexDirection: 'row',
        marginBottom: 8,
    },
    categoryChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#FDE68A',
        marginRight: 8,
        backgroundColor: '#FFFFFF',
        gap: 6,
    },
    categoryText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#92400E',
    },
    addCategoryBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#D97706',
        borderStyle: 'dashed',
        gap: 4,
    },
    addCategoryText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#D97706',
    },
    newCategoryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    newCategoryInput: {
        flex: 1,
        borderWidth: 1,
        borderColor: '#FDE68A',
        borderRadius: 12,
        paddingHorizontal: 14,
        height: 44,
        fontSize: 14,
        backgroundColor: '#FFFFFF',
        color: '#451A03',
    },
    newCatBtnSave: {
        backgroundColor: '#10B981',
        padding: 12,
        borderRadius: 12,
    },
    newCatBtnCancel: {
        backgroundColor: '#9CA3AF',
        padding: 12,
        borderRadius: 12,
    },
    roleRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 8,
    },
    roleScroll: {
        marginTop: 8,
    },
    roleBtn: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#FDE68A',
        backgroundColor: '#FFFFFF',
        marginRight: 10,
    },
    roleActive: {
        backgroundColor: '#F59E0B',
        borderColor: '#F59E0B',
    },
    roleText: {
        fontSize: 13,
        color: '#92400E',
        fontWeight: '600',
    },
    roleTextActive: {
        color: '#FFF',
    },
    // Add New Role styles
    addRoleBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#D97706',
        borderStyle: 'dashed',
        backgroundColor: '#FFFBEB',
        gap: 4,
    },
    addRoleText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#D97706',
    },
    newRoleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 8,
    },
    newRoleInput: {
        flex: 1,
        borderWidth: 1,
        borderColor: '#FDE68A',
        borderRadius: 12,
        paddingHorizontal: 14,
        height: 44,
        fontSize: 14,
        backgroundColor: '#FFFFFF',
        color: '#451A03',
    },
    newRoleBtnSave: {
        backgroundColor: '#10B981',
        padding: 12,
        borderRadius: 12,
    },
    newRoleBtnCancel: {
        backgroundColor: '#9CA3AF',
        padding: 12,
        borderRadius: 12,
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
        backgroundColor: '#FEF3C7',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },
    selectAllText: {
        fontSize: 11,
        fontWeight: '600',
        color: '#B45309',
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
        borderColor: '#FDE68A',
        backgroundColor: '#FFFFFF',
        width: '48%',
        minHeight: 40,
    },
    privilegeItemActive: {
        backgroundColor: '#FEF3C7',
        borderColor: '#F59E0B',
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
        backgroundColor: '#F59E0B',
        borderColor: '#F59E0B',
    },
    privilegeInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        flex: 1,
    },
    privilegeName: {
        fontSize: 11,
        color: '#92400E',
        fontWeight: '500',
        flex: 1,
    },
    privilegeNameActive: {
        color: '#451A03',
        fontWeight: '700',
    },
    createBtn: {
        flexDirection: 'row',
        backgroundColor: '#F59E0B',
        borderRadius: 16,
        paddingVertical: 15,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
        marginTop: 8,
        shadowColor: '#F59E0B',
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 3,
    },
    createBtnDisabled: {
        opacity: 0.6,
        backgroundColor: '#D1D5DB',
    },
    createText: {
        color: '#451A03',
        fontSize: 15,
        fontWeight: '700',
    },
    // Bulk Upload
    bulkUploadContainer: {
        paddingVertical: 20,
    },
    bulkHeader: {
        alignItems: 'center',
        marginBottom: 24,
    },
    bulkTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#451A03',
        marginTop: 12,
    },
    bulkDesc: {
        fontSize: 13,
        color: '#92400E',
        textAlign: 'center',
        marginTop: 6,
        paddingHorizontal: 20,
    },
    templateBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FFFFFF',
        paddingVertical: 14,
        borderRadius: 14,
        gap: 8,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#FDE68A',
    },
    templateText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#B45309',
    },
    uploadBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F59E0B',
        paddingVertical: 16,
        borderRadius: 14,
        gap: 8,
    },
    uploadingBtn: {
        backgroundColor: '#D97706',
    },
    uploadBtnText: {
        fontSize: 15,
        fontWeight: '700',
        color: '#FFF',
    },
    resultBox: {
        marginTop: 16,
        padding: 16,
        borderRadius: 14,
    },
    resultSuccess: {
        backgroundColor: '#DCFCE7',
    },
    resultError: {
        backgroundColor: '#FEE2E2',
    },
    resultTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#1F2937',
        marginBottom: 8,
    },
    resultText: {
        fontSize: 13,
        color: '#374151',
        marginBottom: 4,
    },
    formatInfo: {
        marginTop: 20,
        backgroundColor: '#FFFFFF',
        padding: 16,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#FDE68A',
    },
    formatTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: '#451A03',
        marginBottom: 10,
    },
    formatRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 8,
    },
    formatItem: {
        flex: 1,
        backgroundColor: '#FFFBEB',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#FDE68A',
    },
    formatLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: '#92400E',
        textAlign: 'center',
    },
});
