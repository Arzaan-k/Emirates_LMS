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
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
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

const CreateUser = ({
    visible = false,
    onClose = () => { },
    onCreate = () => { },
    userProfile = {},
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
    const [displayRoles, setDisplayRoles] = useState(['Waffler', 'Silver Waffler', 'Gold Waffler', 'Shift Manager', 'Store Manager']);
    const [showNewRole, setShowNewRole] = useState(false);
    const [newRoleName, setNewRoleName] = useState('');
    const [creatingRole, setCreatingRole] = useState(false);

    const isSuperAdmin = userProfile?.is_superadmin || userProfile?.role === 'Super Admin';

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
            fetchDisplayRoles(); // Fetch dynamic progression levels
            setBulkResult(null);
            setStoreSearch('');

            if (isEditing && initialData) {
                setName(initialData.name || '');
                setEmail(initialData.email || '');
                setRole(initialData.role || 'Employee');
                setCategory(initialData.category || 'Employee');
                setSelectedPrivileges(initialData.privileges || []);
                setSelectedStore(initialData.store || '');
                setPassword('');
            } else {
                setName('');
                setEmail('');
                setPassword('');
                setRole('Employee');
                setCategory('Employee');
                setSelectedPrivileges([]);
                setSelectedStore('');
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
            setCategories([
                { id: '1', name: 'Super Admin', description: 'Full access', color: '#B45309' },
                { id: '2', name: 'Manager', description: 'Admin access', color: '#D97706' },
                { id: '3', name: 'Supervisor', description: 'Limited admin', color: '#F59E0B' },
                { id: '4', name: 'Employee', description: 'Regular access', color: '#FCD34D' },
            ]);
        }
    };

    // Fetch dynamic progression levels for Display Role
    const fetchDisplayRoles = async () => {
        try {
            const response = await fetch(`${API_URL}/admin/levels`);
            const data = await response.json();
            if (data.levels && Array.isArray(data.levels)) {
                // Sort by order and extract names
                const sortedLevels = data.levels.sort((a, b) => a.order - b.order);
                const levelNames = sortedLevels.map(l => l.name);
                setDisplayRoles(levelNames);
            }
        } catch (error) {
            console.error('Error fetching display roles:', error);
            // Keep default displayRoles on error
        }
    };

    // Create a new progression level (role)
    const handleCreateRole = async () => {
        if (!newRoleName.trim()) return;

        setCreatingRole(true);
        try {
            // Get current max order
            const maxOrder = displayRoles.length;

            const response = await fetch(`${API_URL}/admin/levels`, {
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
            const response = await fetch(`${API_URL}/users/privileges`);
            const data = await response.json();
            if (Array.isArray(data)) {
                setPrivileges(data);
            }
        } catch (error) {
            console.error('Error fetching privileges:', error);
        }
    };

    const fetchStores = async () => {
        try {
            const response = await fetch(`${API_URL}/stores`);
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
            setRole(displayRoles[displayRoles.length - 1] || 'Store Manager'); // Highest progression level
        } else if (newCategory === 'Supervisor') {
            setRole(displayRoles[Math.floor(displayRoles.length / 2)] || 'Gold Waffler'); // Middle level
        } else {
            setRole(displayRoles[0] || 'Waffler'); // Entry level (first progression role)
            clearAllPrivileges();
        }
    };

    const handleCreateCategory = async () => {
        if (!newCategoryName.trim()) return;
        try {
            const response = await fetch(`${API_URL}/users/categories`, {
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
            store: selectedStore
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
            formData.append('file', {
                uri: file.uri,
                name: file.name,
                type: file.mimeType || 'application/octet-stream'
            });

            const response = await fetch(`${API_URL}/users/bulk-upload`, {
                method: 'POST',
                body: formData,
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });

            const data = await response.json();
            setBulkResult(data);

            if (data.status === 'success') {
                Alert.alert(
                    'Upload Complete',
                    `Successfully created ${data.created} users.\n${data.skipped} were skipped.`,
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
            const csvContent = "Name,Email,Password,Role,Category,Store\nJohn Doe,john.doe@company.com,Welcome@123,Waffler,Employee,Mumbai Central\nJane Smith,jane.smith@company.com,Welcome@123,Silver Waffler,Employee,Delhi CP\nMike Wilson,mike.wilson@company.com,Welcome@123,Store Manager,Manager,Bangalore Indiranagar";

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
            await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: FileSystem.EncodingType.UTF8 });

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
            // Fallback: show the content in an alert so user can copy it
            Alert.alert(
                'Template Content',
                'Copy this format:\n\nName,Email,Password,Role,Category,Store\nJohn Doe,john@email.com,Pass123,Waffler,Employee,Mumbai Central',
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
                                        Upload an Excel or CSV file to create multiple employees at once
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
                                                <Text style={styles.resultText}>Created: {bulkResult.created} users</Text>
                                                <Text style={styles.resultText}>Skipped: {bulkResult.skipped} users</Text>
                                            </>
                                        )}
                                    </View>
                                )}

                                {/* Format Info */}
                                <View style={styles.formatInfo}>
                                    <Text style={styles.formatTitle}>Required Columns:</Text>
                                    <View style={styles.formatRow}>
                                        <View style={styles.formatItem}><Text style={styles.formatLabel}>Name</Text></View>
                                        <View style={styles.formatItem}><Text style={styles.formatLabel}>Email</Text></View>
                                        <View style={styles.formatItem}><Text style={styles.formatLabel}>Password</Text></View>
                                    </View>
                                    <View style={styles.formatRow}>
                                        <View style={styles.formatItem}><Text style={styles.formatLabel}>Role</Text></View>
                                        <View style={styles.formatItem}><Text style={styles.formatLabel}>Category</Text></View>
                                        <View style={styles.formatItem}><Text style={styles.formatLabel}>Store</Text></View>
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

                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.storeScroll}>
                                        {filteredStores.map((store) => (
                                            <TouchableOpacity
                                                key={store.id}
                                                style={[
                                                    styles.storeChip,
                                                    selectedStore === store.name && styles.storeChipActive
                                                ]}
                                                onPress={() => setSelectedStore(store.name)}
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
                                            </TouchableOpacity>
                                        ))}
                                    </ScrollView>
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
                                                    key={r}
                                                    style={[styles.roleBtn, role === r && styles.roleActive]}
                                                    onPress={() => setRole(r)}
                                                >
                                                    <Text style={[styles.roleText, role === r && styles.roleTextActive]}>
                                                        {r}
                                                    </Text>
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

                                {/* Privileges Section */}
                                {isSuperAdmin && (
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

                                        <View style={styles.privilegeGrid}>
                                            {privileges.map((priv) => (
                                                <TouchableOpacity
                                                    key={priv.id}
                                                    style={[
                                                        styles.privilegeItem,
                                                        selectedPrivileges.includes(priv.id) && styles.privilegeItemActive
                                                    ]}
                                                    onPress={() => togglePrivilege(priv.id)}
                                                >
                                                    <View style={[
                                                        styles.privilegeCheck,
                                                        selectedPrivileges.includes(priv.id) && styles.privilegeCheckActive
                                                    ]}>
                                                        {selectedPrivileges.includes(priv.id) && (
                                                            <Feather name="check" size={10} color="#FFF" />
                                                        )}
                                                    </View>
                                                    <View style={styles.privilegeInfo}>
                                                        <Feather
                                                            name={priv.icon || 'box'}
                                                            size={12}
                                                            color={selectedPrivileges.includes(priv.id) ? THEME.textMain : THEME.textSub}
                                                        />
                                                        <Text
                                                            style={[
                                                                styles.privilegeName,
                                                                selectedPrivileges.includes(priv.id) && styles.privilegeNameActive
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
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#FDE68A',
        marginRight: 8,
        backgroundColor: '#FFFFFF',
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
