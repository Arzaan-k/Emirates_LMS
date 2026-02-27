import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    Dimensions,
    ActivityIndicator,
    RefreshControl,
    FlatList,
    Platform,
    Alert,
    Modal,
    ScrollView,
    Image,
    Pressable,
    Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import CreateUser from './CreateUser';
import API_URL from '../config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';

const { width, height } = Dimensions.get('window');
const ITEMS_PER_PAGE = 30;

// BELGIAN WAFFLE THEME COLORS
const THEME = {
    primary: '#F59E0B',    // Waffle Yellow/Orange
    secondary: '#D97706',  // Darker Amber
    chocolate: '#451A03',  // Dark Brown Text
    cream: '#FFFBEB',      // Light Cream Background
    white: '#FFFFFF',
    text: '#1F2937',
    subtext: '#6B7280',
    border: '#FDE68A',     // Light Yellow Border
    success: '#10B981',
    error: '#EF4444',
    surface: '#FFFFFF',
    surfaceHighlight: '#FEF3C7',
};

const TeamListScreen = ({ navigation, route }) => {
    const { userProfile } = route.params || {};
    const isSuperAdmin = userProfile?.is_superadmin || userProfile?.role === 'Super Admin';
    const canEditUsers = isSuperAdmin || userProfile?.has_admin_access || (userProfile?.privileges || []).some(p => ['create_user', 'team_list'].includes(p));

    const [users, setUsers] = useState([]);
    const [initialLoading, setInitialLoading] = useState(true);
    const [listLoading, setListLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Pagination
    const [page, setPage] = useState(1);
    const [totalUsers, setTotalUsers] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [hasMore, setHasMore] = useState(true);

    // Filter State
    const [filterModalVisible, setFilterModalVisible] = useState(false);
    const [filterOptions, setFilterOptions] = useState({});
    const [activeFilters, setActiveFilters] = useState({});
    const [tempFilters, setTempFilters] = useState({}); // For modal state before apply
    const [expandedFilterSection, setExpandedFilterSection] = useState(null);

    // Edit State
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editingUser, setEditingUser] = useState(null);

    // Profile View State
    const [profileModalVisible, setProfileModalVisible] = useState(false);
    const [viewingUser, setViewingUser] = useState(null);

    // Bulk Selection State
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedUsers, setSelectedUsers] = useState([]);

    // Delete Confirmation State
    const [deleteModalVisible, setDeleteModalVisible] = useState(false);
    const [deleteInput, setDeleteInput] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);

    // Role Colors
    const [levelColorMap, setLevelColorMap] = useState({});

    const [isExporting, setIsExporting] = useState(false);
    const [accessInfo, setAccessInfo] = useState(null);

    useEffect(() => {
        fetchLevels();
        fetchFilterOptions();
        fetchUsers(1, true, true);
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchUsers(1, true, false);
        }, 800);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Apply filters when they change (after modal apply)
    useEffect(() => {
        fetchUsers(1, true, false);
    }, [activeFilters]);

    // Exit selection mode if user navigates away or list changes significantly
    useEffect(() => {
        if (!selectionMode) {
            setSelectedUsers([]);
        }
    }, [selectionMode]);

    const fetchLevels = async () => {
        try {
            const token = await AsyncStorage.getItem('userToken');
            const response = await fetch(`${API_URL}/api/v1/levels/`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (data.levels && Array.isArray(data.levels)) {
                const sortedLevels = data.levels.sort((a, b) => a.order - b.order);
                const colorMap = {};
                sortedLevels.forEach(l => {
                    colorMap[l.name] = l.color || '#6B7280';
                });
                setLevelColorMap(colorMap);
            }
        } catch (error) {
            console.error('Failed to fetch levels:', error);
        }
    };

    const fetchFilterOptions = async () => {
        try {
            const token = await AsyncStorage.getItem('userToken');
            const response = await fetch(`${API_URL}/api/v1/users/filters`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            setFilterOptions(data);
        } catch (error) {
            console.error('Failed to fetch filter options:', error);
        }
    };

    const fetchUsers = async (pageNum = 1, reset = false, isInitial = false) => {
        try {
            if (reset) {
                if (isInitial) setInitialLoading(true);
                else setListLoading(true);
                setPage(1);
            } else {
                setLoadingMore(true);
            }

            const params = new URLSearchParams({
                page: pageNum.toString(),
                limit: ITEMS_PER_PAGE.toString(),
                search: searchQuery,
            });

            // Append active filters
            Object.keys(activeFilters).forEach(key => {
                const val = activeFilters[key];
                if (Array.isArray(val) && val.length > 0) {
                    val.forEach(v => params.append(key, v));
                } else if (val && !Array.isArray(val)) {
                    params.append(key, val);
                }
            });

            const token = await AsyncStorage.getItem('userToken');
            const response = await fetch(`${API_URL}/api/v1/users/list?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();

            if (data.users) {
                if (reset) {
                    setUsers(data.users);
                } else {
                    setUsers(prev => [...prev, ...data.users]);
                }
                setTotalUsers(data.total);
                setTotalPages(data.total_pages);
                setHasMore(pageNum < data.total_pages);
                setPage(pageNum);
            }
            // Capture access control info for diagnostic display
            if (data.access_info) {
                setAccessInfo(data.access_info);
            }
        } catch (error) {
            console.error('Failed to fetch users:', error);
        } finally {
            setInitialLoading(false);
            setListLoading(false);
            setRefreshing(false);
            setLoadingMore(false);
        }
    };

    const buildUsersListParams = (pageNum, limit) => {
        const params = new URLSearchParams({
            page: pageNum.toString(),
            limit: limit.toString(),
            search: searchQuery,
        });

        // Append active filters
        Object.keys(activeFilters).forEach(key => {
            const val = activeFilters[key];
            if (Array.isArray(val) && val.length > 0) {
                val.forEach(v => params.append(key, v));
            } else if (val && !Array.isArray(val)) {
                params.append(key, val);
            }
        });

        return params;
    };

    const safeCell = (val) => {
        if (val === null || val === undefined) return '';
        if (typeof val === 'object') {
            try {
                return JSON.stringify(val);
            } catch (_) {
                return String(val);
            }
        }
        return String(val);
    };

    const toYesNo = (val) => {
        if (val === true) return 'Yes';
        if (val === false) return 'No';
        const s = String(val || '').trim().toLowerCase();
        if (!s) return '';
        if (['yes', 'y', 'true', '1'].includes(s)) return 'Yes';
        if (['no', 'n', 'false', '0'].includes(s)) return 'No';
        return safeCell(val);
    };

    const exportUsersToExcel = async () => {
        if (isExporting) return;
        setIsExporting(true);

        try {
            const limit = 500;
            let pageNum = 1;
            let totalPagesLocal = 1;
            let allUsers = [];
            const token = await AsyncStorage.getItem('userToken');

            while (pageNum <= totalPagesLocal) {
                const params = buildUsersListParams(pageNum, limit);
                const response = await fetch(`${API_URL}/api/v1/users/list?${params.toString()}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data?.detail || data?.message || 'Failed to export users');
                }

                const batch = Array.isArray(data?.users) ? data.users : [];
                allUsers = allUsers.concat(batch);
                totalPagesLocal = Number(data?.total_pages || 1);
                pageNum += 1;

                if (batch.length === 0) break;
                if (allUsers.length >= 50000) break;
            }

            const headers = [
                'Employee Code',
                'Full Name',
                'Temporary Employee Code',
                'User Name',
                'Date of Birth',
                'Gender',
                'Email',
                'Contact Number',
                'Address',
                'Proof Type',
                'Proof ID',
                'Qualification',
                'Specialization',
                'Qualification Status',
                'Previous Experience Designation',
                'Previous Experience',
                'Marital Status',
                'Shirt Size',
                'Denim Size',
                'Blood Group',
                'Account Verified',
                'Account Approved',
                'Approved By',
                'Joining Date',
                'Date of Resign',
                'Date of Leaving',
                'Reason for Leaving',
                'Franchise',
                'Store Name',
                'Store Code',
                'Region',
                'City',
                'State',
                'Designation',
                'User Status',
                'Grade',
                'Concept',
                'Department',
                'Sub Department',
                'Function',
                'Sub Function',
                'Job Role',
                'Career Job Roles',
                'User Created On',
            ];

            const rows = [headers];

            allUsers.forEach(u => {
                const pd = u?.profile_data || {};
                rows.push([
                    safeCell(pd['Employee Code']),
                    safeCell(u?.name),
                    safeCell(pd['Temporary Employee Code']),
                    safeCell(pd['User Name']),
                    safeCell(pd['Date of Birth']),
                    safeCell(pd['Gender']),
                    safeCell(u?.email),
                    safeCell(pd['Contact Number']),
                    safeCell(pd['Address']),
                    safeCell(pd['Proof Type']),
                    safeCell(pd['Proof ID']),
                    safeCell(pd['Qualification']),
                    safeCell(pd['Specialization']),
                    safeCell(pd['Qualification Status']),
                    safeCell(pd['Previous Experience Designation']),
                    safeCell(pd['Previous Experience']),
                    safeCell(pd['Marital Status']),
                    safeCell(pd['Shirt Size']),
                    safeCell(pd['Denim Size']),
                    safeCell(pd['Blood Group']),
                    toYesNo(pd['Account Verified']),
                    toYesNo(pd['Account Approved']),
                    safeCell(pd['Approved By']),
                    safeCell(pd['Joining Date']),
                    safeCell(pd['Date of Resign']),
                    safeCell(pd['Date of Leaving']),
                    safeCell(pd['Reason for Leaving']),
                    safeCell(pd['Franchise']),
                    safeCell(pd['Store Name'] || u?.store),
                    safeCell(pd['Store Code']),
                    safeCell(pd['Region']),
                    safeCell(pd['City']),
                    safeCell(pd['State']),
                    safeCell(pd['Designation'] || u?.role),
                    safeCell(pd['User Status']),
                    safeCell(pd['Grade']),
                    safeCell(pd['Concept']),
                    safeCell(pd['Department']),
                    safeCell(pd['Sub Department']),
                    safeCell(pd['Function']),
                    safeCell(pd['Sub Function']),
                    safeCell(pd['Job Role']),
                    safeCell(pd['Career Job Roles']),
                    safeCell(u?.created_at),
                ]);
            });

            const ws = XLSX.utils.aoa_to_sheet(rows);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Employees');

            const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
            const filename = `employees-export-${timestamp}.xlsx`;

            if (Platform.OS === 'web') {
                XLSX.writeFile(wb, filename);
            } else {
                const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
                const fileUri = `${FileSystem.documentDirectory}${filename}`;
                await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: 'base64' });

                if (await Sharing.isAvailableAsync()) {
                    await Sharing.shareAsync(fileUri, {
                        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                        dialogTitle: 'Export Employees',
                        UTI: 'com.microsoft.excel.xlsx',
                    });
                } else {
                    Alert.alert('Export Saved', `File saved to: ${fileUri}`);
                }
            }
        } catch (error) {
            console.error('Export error:', error);
            Alert.alert('Export Failed', error?.message || 'Failed to export employees');
        } finally {
            setIsExporting(false);
        }
    };

    const onRefresh = () => {
        setRefreshing(true);
        fetchFilterOptions(); // Refresh options too
        fetchUsers(1, true, false);
    };

    const loadMore = () => {
        if (!loadingMore && hasMore) {
            fetchUsers(page + 1, false);
        }
    };

    // Filter Logic
    const toggleFilter = (category, value) => {
        setTempFilters(prev => {
            const current = prev[category] || [];
            if (current.includes(value)) {
                return { ...prev, [category]: current.filter(item => item !== value) };
            } else {
                return { ...prev, [category]: [...current, value] };
            }
        });
    };

    const applyFilters = () => {
        setActiveFilters(tempFilters);
        setFilterModalVisible(false);
    };

    const clearFilters = () => {
        setTempFilters({});
        setActiveFilters({});
        setFilterModalVisible(false);
    };

    const getActiveFilterCount = () => {
        let count = 0;
        Object.values(activeFilters).forEach(val => {
            if (Array.isArray(val)) count += val.length;
            else if (val) count++;
        });
        return count;
    };

    const handleEditUser = (user) => {
        setEditingUser(user);
        setEditModalVisible(true);
    };

    const handleViewProfile = (user) => {
        setViewingUser(user);
        setProfileModalVisible(true);
    };

    // Bulk Delete Functions
    const toggleSelection = (email) => {
        if (selectedUsers.includes(email)) {
            const newSelection = selectedUsers.filter(id => id !== email);
            setSelectedUsers(newSelection);
            if (newSelection.length === 0) setSelectionMode(false);
        } else {
            setSelectedUsers([...selectedUsers, email]);
        }
    };

    const handleLongPress = (email) => {
        if (!isSuperAdmin) return;
        setSelectionMode(true);
        toggleSelection(email);
    };

    const handleSelectAll = () => {
        if (selectedUsers.length === users.length) {
            setSelectedUsers([]);
            setSelectionMode(false);
        } else {
            const allEmails = users.map(u => u.email);
            setSelectedUsers(allEmails);
        }
    };

    const handleBulkDelete = () => {
        if (selectedUsers.length === 0) return;
        setDeleteModalVisible(true);
    };

    const handleConfirmDelete = async () => {
        if (deleteInput !== 'DELETE') {
            Alert.alert('Confirmation Failed', 'Please type DELETE to confirm.');
            return;
        }

        setIsDeleting(true);
        const previousUsers = [...users];
        const previousTotal = totalUsers;
        const usersToDelete = [...selectedUsers];

        // Optimistic update
        setUsers(prevUsers => prevUsers.filter(u => !usersToDelete.includes(u.email)));
        setTotalUsers(prevTotal => Math.max(0, prevTotal - usersToDelete.length));
        setSelectionMode(false);
        setSelectedUsers([]);
        setDeleteModalVisible(false);
        setDeleteInput('');

        try {
            const token = await AsyncStorage.getItem('userToken');
            const response = await fetch(`${API_URL}/api/v1/users/bulk-delete`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ emails: usersToDelete })
            });

            if (!response.ok) {
                const result = await response.json();
                throw new Error(result.detail || 'Failed to delete users');
            }
            Alert.alert("Success", "Users deleted successfully");
        } catch (error) {
            console.error('Bulk delete error:', error);
            Alert.alert("Deletion Failed", "Could not delete users. Restoring list.");
            setUsers(previousUsers);
            setTotalUsers(previousTotal);
        } finally {
            setIsDeleting(false);
        }
    };

    const handleToggleExternal = async (user) => {
        const newExternal = !user.is_external;
        // Optimistic update
        setUsers(prev => prev.map(u =>
            u.email === user.email
                ? { ...u, is_external: newExternal, joined_at_level: newExternal ? u.role : null }
                : u
        ));

        try {
            const token = await AsyncStorage.getItem('userToken');
            await fetch(`${API_URL}/api/v1/users/toggle-external`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    email: user.email,
                    is_external: newExternal,
                    joined_at_level: newExternal ? user.role : null,
                })
            });
        } catch (error) {
            console.error('Toggle external error:', error);
            setUsers(prev => prev.map(u =>
                u.email === user.email ? { ...u, is_external: user.is_external, joined_at_level: user.joined_at_level } : u
            ));
        }
    };

    const handleCreateUser = async (userData) => {
        try {
            const token = await AsyncStorage.getItem('userToken');
            const response = await fetch(`${API_URL}/api/v1/users/create`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(userData)
            });
            const result = await response.json();
            if (response.ok) {
                setEditModalVisible(false);
                fetchUsers(1, true, false);
                fetchFilterOptions(); // Refresh filters with new data
                Alert.alert("Success", "User created successfully");
            } else {
                Alert.alert("Error", result.detail || "Failed to create user");
            }
        } catch (error) {
            console.error(error);
            Alert.alert("Error", "Failed to create user");
        }
    };

    const processUserUpdate = async (userData) => {
        try {
            const token = await AsyncStorage.getItem('userToken');
            const response = await fetch(`${API_URL}/api/v1/users/update`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(userData)
            });
            const result = await response.json();

            console.log('=== USER UPDATE RESPONSE ===');
            console.log('Response status:', result.status);
            console.log('User data from server:', result.user);

            // Check for success status as per alias endpoint definition
            if (result.status === 'success' || response.ok) {
                setEditModalVisible(false);

                // Use the updated user data from the server response if available
                // This ensures we have the complete, authoritative data from the database
                const updatedUserData = result.user || userData;

                console.log('Updating local state with user:', updatedUserData.name, updatedUserData.email);

                // Update local state with server data
                setUsers(prev => prev.map(u =>
                    u.email === userData.email ? { ...u, ...updatedUserData } : u
                ));
                fetchFilterOptions(); // Refresh filters with new data

                Alert.alert("Success", "User updated successfully");
            } else {
                Alert.alert("Error", result.detail || result.message || "Failed to update user");
            }
        } catch (error) {
            console.error(error);
            Alert.alert("Error", "Failed to update user");
        }
    };

    const getRoleColor = (role) => {
        if (levelColorMap[role]) return levelColorMap[role];
        const colors = {
            'Super Admin': '#7C2D12',
            'Store Manager': '#B45309',
            'Shift Manager': '#D97706',
            'Gold Waffler': '#F59E0B',
            'Silver Waffler': '#9CA3AF',
            'Waffler': '#6B7280',
        };
        return colors[role] || '#F59E0B';
    };

    const getInitials = (name) => {
        if (!name) return '??';
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    };

    const renderUserCard = useCallback(({ item: user, index }) => {
        const isSelected = selectedUsers.includes(user.email);

        return (
            <TouchableOpacity
                activeOpacity={0.9}
                onLongPress={() => handleLongPress(user.email)}
                onPress={() => {
                    if (selectionMode) {
                        toggleSelection(user.email);
                    } else {
                        handleViewProfile(user);
                    }
                }}
            >
                <Animated.View
                    entering={FadeInDown.delay(Math.min(index * 30, 300))}
                    style={[
                        styles.userCard,
                        isSelected && styles.userCardSelected,
                        selectionMode && { transform: [{ scale: 0.98 }] }
                    ]}
                >
                    {selectionMode && (
                        <View style={[styles.selectionCheckbox, isSelected && styles.selectionCheckboxActive]}>
                            {isSelected && <Feather name="check" size={14} color="#FFF" />}
                        </View>
                    )}

                    {user.profile_data?.profile_pic ? (
                        <Image
                            source={{ uri: user.profile_data.profile_pic }}
                            style={styles.userAvatar}
                            resizeMode="cover"
                        />
                    ) : (
                        <View style={[styles.userAvatar, { backgroundColor: getRoleColor(user.role) }]}>
                            <Text style={styles.userAvatarText}>
                                {getInitials(user.name)}
                            </Text>
                        </View>
                    )}

                    <View style={styles.userInfo}>
                        <Text style={styles.userName} numberOfLines={1}>{user.name}</Text>
                        <Text style={styles.userEmail} numberOfLines={1}>{user.email}</Text>
                        <View style={styles.tagsRow}>
                            <View style={[styles.roleBadge, { borderColor: getRoleColor(user.role) }]}>
                                <Text style={[styles.roleText, { color: getRoleColor(user.role) }]}>
                                    {user.role}
                                </Text>
                            </View>
                            {user.store && user.store !== 'Unassigned' && (
                                <View style={styles.storeBadge}>
                                    <MaterialCommunityIcons name="store" size={12} color="#78350F" />
                                    <Text style={styles.storeText}>{user.store}</Text>
                                </View>
                            )}
                        </View>
                    </View>

                    <View style={styles.actionsColumn}>
                        <View style={[styles.statusDot, {
                            backgroundColor: (user.profile_data?.['User Status'] || '').toLowerCase().trim() === 'active'
                                ? '#10B981'   // green = ACTIVE
                                : (user.profile_data?.['User Status'] || '').trim() !== ''
                                    ? '#EF4444'   // red = INACTIVE / OTHER STATUS
                                    : '#D1D5DB'   // grey = unset
                        }]} />
                    </View>
                </Animated.View>
            </TouchableOpacity>
        );
    }, [isSuperAdmin, selectionMode, selectedUsers]);

    const renderFilterModal = () => {
        // Maps: filterOptions key → query param key sent to backend
        const FILTER_DEFS = [
            { id: 'statuses', paramKey: 'user_status', label: 'Status', icon: 'activity' },
            { id: 'roles', paramKey: 'role', label: 'LMS Role', icon: 'shield' },
            { id: 'designations', paramKey: 'designation', label: 'Designation', icon: 'award' },
            { id: 'departments', paramKey: 'department', label: 'Department', icon: 'briefcase' },
            { id: 'sub_departments', paramKey: 'sub_department', label: 'Sub Department', icon: 'layers' },
            { id: 'functions', paramKey: 'function', label: 'Function', icon: 'git-branch' },
            { id: 'sub_functions', paramKey: 'sub_function', label: 'Sub Function', icon: 'git-merge' },
            { id: 'job_roles', paramKey: 'job_role', label: 'Job Role', icon: 'user-check' },
            { id: 'stores', paramKey: 'store', label: 'Store', icon: 'shopping-bag' },
            { id: 'regions', paramKey: 'region', label: 'Region', icon: 'map' },
            { id: 'cities', paramKey: 'city', label: 'City', icon: 'map-pin' },
            { id: 'states', paramKey: 'state', label: 'State', icon: 'flag' },
            { id: 'franchises', paramKey: 'franchise', label: 'Franchise', icon: 'home' },
            { id: 'concepts', paramKey: 'concept', label: 'Concept', icon: 'tag' },
            { id: 'grades', paramKey: 'grade', label: 'Grade', icon: 'star' },
            { id: 'qualifications', paramKey: 'qualification', label: 'Qualification', icon: 'book' },
            { id: 'genders', paramKey: 'gender', label: 'Gender', icon: 'users' },
            { id: 'blood_groups', paramKey: 'blood_group', label: 'Blood Group', icon: 'heart' },
            { id: 'marital_statuses', paramKey: 'marital_status', label: 'Marital Status', icon: 'user' },
        ];

        const availableDefs = FILTER_DEFS.filter(d => filterOptions[d.id]?.length > 0);
        const totalActive = getActiveFilterCount();

        return (
            <Modal
                visible={filterModalVisible}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setFilterModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.filterModalContainer}>
                        <View style={styles.filterHeader}>
                            <View>
                                <Text style={styles.filterTitle}>Filter Team</Text>
                                {totalActive > 0 && (
                                    <Text style={{ fontSize: 12, color: '#F59E0B', fontWeight: '600' }}>
                                        {totalActive} filter{totalActive > 1 ? 's' : ''} active
                                    </Text>
                                )}
                            </View>
                            <TouchableOpacity onPress={() => setFilterModalVisible(false)}>
                                <Feather name="x" size={24} color="#1F2937" />
                            </TouchableOpacity>
                        </View>

                        <ScrollView style={styles.filterContent}>
                            {/* Dynamic filter sections from backend */}
                            {availableDefs.map((def) => {
                                const isExpanded = expandedFilterSection === def.id;
                                const currentSelections = tempFilters[def.paramKey] || [];

                                return (
                                    <View key={def.id} style={styles.filterSection}>
                                        <TouchableOpacity
                                            style={styles.filterSectionHeader}
                                            onPress={() => setExpandedFilterSection(isExpanded ? null : def.id)}
                                        >
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                                <Feather name={def.icon} size={16} color={THEME.chocolate} />
                                                <Text style={styles.filterSectionTitle}>{def.label}</Text>
                                                {currentSelections.length > 0 && (
                                                    <View style={styles.filterCountBadge}>
                                                        <Text style={styles.filterCountText}>{currentSelections.length}</Text>
                                                    </View>
                                                )}
                                            </View>
                                            <Feather name={isExpanded ? "chevron-up" : "chevron-down"} size={20} color="#6B7280" />
                                        </TouchableOpacity>

                                        {isExpanded && (
                                            <View style={styles.filterOptionsContainer}>
                                                {filterOptions[def.id].map(option => (
                                                    <TouchableOpacity
                                                        key={option}
                                                        style={[
                                                            styles.filterOptionChip,
                                                            currentSelections.includes(option) && styles.filterOptionChipSelected
                                                        ]}
                                                        onPress={() => toggleFilter(def.paramKey, option)}
                                                    >
                                                        <Text style={[
                                                            styles.filterOptionText,
                                                            currentSelections.includes(option) && styles.filterOptionTextSelected
                                                        ]}>
                                                            {option}
                                                        </Text>
                                                        {currentSelections.includes(option) && (
                                                            <Feather name="check" size={14} color="#FFF" />
                                                        )}
                                                    </TouchableOpacity>
                                                ))}
                                            </View>
                                        )}
                                    </View>
                                );
                            })}

                            {/* External account toggle */}
                            <View style={styles.filterSection}>
                                <View style={[styles.filterSectionHeader, { paddingVertical: 14 }]}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                        <Feather name="external-link" size={16} color={THEME.chocolate} />
                                        <Text style={styles.filterSectionTitle}>External Users Only</Text>
                                    </View>
                                    <Switch
                                        value={tempFilters['is_external'] === true}
                                        onValueChange={(val) => setTempFilters(prev => ({
                                            ...prev,
                                            is_external: val ? true : undefined
                                        }))}
                                        trackColor={{ false: '#D1D5DB', true: '#FCD34D' }}
                                        thumbColor={tempFilters['is_external'] ? '#F59E0B' : '#F4F4F5'}
                                    />
                                </View>
                            </View>

                            {availableDefs.length === 0 && (
                                <View style={{ padding: 32, alignItems: 'center' }}>
                                    <Feather name="inbox" size={40} color="#D1D5DB" />
                                    <Text style={{ color: '#9CA3AF', marginTop: 12, fontSize: 14 }}>
                                        No filter data available yet.{'\n'}Upload users to populate filters.
                                    </Text>
                                </View>
                            )}
                        </ScrollView>

                        <View style={styles.filterFooter}>
                            <TouchableOpacity style={styles.resetFilterBtn} onPress={clearFilters}>
                                <Text style={styles.resetFilterText}>Reset All</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.applyFilterBtn} onPress={applyFilters}>
                                <Text style={styles.applyFilterText}>Apply Filters</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        );
    };

    const renderDeleteModal = () => (
        <Modal
            visible={deleteModalVisible}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setDeleteModalVisible(false)}
        >
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                <View style={{ backgroundColor: '#FFF', borderRadius: 20, padding: 24, width: '100%', maxWidth: 400, alignItems: 'center' }}>
                    <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: '#FEE2E2', justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
                        <Feather name="alert-triangle" size={32} color="#EF4444" />
                    </View>

                    <Text style={{ fontSize: 20, fontWeight: '700', color: '#1F2937', marginBottom: 8, textAlign: 'center' }}>
                        Delete {selectedUsers.length} Users?
                    </Text>

                    <Text style={{ fontSize: 14, color: '#4B5563', textAlign: 'center', marginBottom: 24, lineHeight: 20 }}>
                        You are about to delete all data permanently for these users. This action cannot be undone.{"\n"}
                        Please type <Text style={{ fontWeight: '700', color: '#EF4444' }}>DELETE</Text> to confirm.
                    </Text>

                    <TextInput
                        value={deleteInput}
                        onChangeText={setDeleteInput}
                        placeholder="Type DELETE"
                        placeholderTextColor="#9CA3AF"
                        style={{
                            width: '100%',
                            height: 50,
                            borderWidth: 1,
                            borderColor: deleteInput === 'DELETE' ? '#EF4444' : '#E5E7EB',
                            borderRadius: 12,
                            paddingHorizontal: 16,
                            fontSize: 16,
                            color: '#1F2937',
                            marginBottom: 24,
                            backgroundColor: '#F9FAFB'
                        }}
                        autoCapitalize="characters"
                    />

                    <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
                        <TouchableOpacity
                            onPress={() => {
                                setDeleteModalVisible(false);
                                setDeleteInput('');
                            }}
                            style={{ flex: 1, height: 48, borderRadius: 12, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' }}
                        >
                            <Text style={{ fontSize: 16, fontWeight: '600', color: '#4B5563' }}>Cancel</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={handleConfirmDelete}
                            disabled={deleteInput !== 'DELETE' || isDeleting}
                            style={{
                                flex: 1,
                                height: 48,
                                borderRadius: 12,
                                backgroundColor: deleteInput === 'DELETE' ? '#EF4444' : '#FECACA',
                                justifyContent: 'center',
                                alignItems: 'center',
                                opacity: isDeleting ? 0.7 : 1
                            }}
                        >
                            {isDeleting ? (
                                <ActivityIndicator color="#FFF" />
                            ) : (
                                <Text style={{ fontSize: 16, fontWeight: '600', color: '#FFF' }}>Delete</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
    const renderProfileModal = () => {
        if (!viewingUser) return null;

        // Use profile_data if available, ensuring fallbacks
        const profile = viewingUser.profile_data || {};

        // Sections configuration
        const sections = [
            {
                title: "Personal Information",
                icon: "user",
                data: [
                    { label: "Full Name", value: viewingUser.name },
                    { label: "Date of Birth", value: profile['Date of Birth'] },
                    { label: "Gender", value: profile['Gender'] },
                    { label: "Marital Status", value: profile['Marital Status'] },
                    { label: "Blood Group", value: profile['Blood Group'] },
                    { label: "Contact Number", value: profile['Contact Number'] },
                    { label: "Email", value: viewingUser.email },
                    { label: "Address", value: profile['Address'] },
                ]
            },
            {
                title: "Identity Proof",
                icon: "credit-card",
                data: [
                    { label: "Proof Type", value: profile['Proof Type'] },
                    { label: "Proof ID", value: profile['Proof ID'] },
                ]
            },
            {
                title: "Qualification & Experience",
                icon: "book",
                data: [
                    { label: "Qualification", value: profile['Qualification'] },
                    { label: "Specialization", value: profile['Specialization'] },
                    { label: "Qualification Status", value: profile['Qualification Status'] },
                    { label: "Previous Experience", value: profile['Previous Experience'] },
                    { label: "Prev. Designation", value: profile['Previous Experience Designation'] },
                ]
            },
            {
                title: "Employment Details",
                icon: "briefcase",
                data: [
                    { label: "Employee Code", value: profile['Employee Code'] },
                    { label: "Temp Code", value: profile['Temporary Employee Code'] },
                    { label: "Joining Date", value: profile['Joining Date'] },
                    { label: "Confirmation Date", value: profile['Date of Confirmation'] }, // Adjusted key guess
                    { label: "Account Verified", value: profile['Account Verified'] },
                    { label: "User Status", value: profile['User Status'] },
                ]
            },
            {
                title: "Organization",
                icon: "layers",
                data: [
                    { label: "Designation", value: profile['Designation'] || viewingUser.role },
                    { label: "Department", value: profile['Department'] },
                    { label: "Sub Department", value: profile['Sub Department'] },
                    { label: "Function", value: profile['Function'] },
                    { label: "Job Role", value: profile['Job Role'] },
                    { label: "Grade", value: profile['Grade'] },
                ]
            },
            {
                title: "Location",
                icon: "map-pin",
                data: [
                    { label: "Store Name", value: viewingUser.store },
                    { label: "Store Code", value: profile['Store Code'] },
                    { label: "Region", value: profile['Region'] },
                    { label: "City", value: profile['City'] },
                    { label: "State", value: profile['State'] },
                ]
            }
        ];

        return (
            <Modal
                visible={profileModalVisible}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setProfileModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.filterModalContainer}>
                        <View style={styles.filterHeader}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <View style={[styles.userAvatar, { backgroundColor: getRoleColor(viewingUser.role), width: 40, height: 40 }]}>
                                    <Text style={[styles.userAvatarText, { fontSize: 16 }]}>
                                        {getInitials(viewingUser.name)}
                                    </Text>
                                </View>
                                <View>
                                    <Text style={styles.filterTitle}>{viewingUser.name}</Text>
                                    <Text style={{ color: '#6B7280', fontSize: 12 }}>{viewingUser.role} • {viewingUser.store}</Text>
                                </View>
                            </View>
                            <TouchableOpacity onPress={() => setProfileModalVisible(false)}>
                                <Feather name="x" size={24} color="#1F2937" />
                            </TouchableOpacity>
                        </View>

                        <ScrollView style={styles.filterContent} contentContainerStyle={{ padding: 20 }}>
                            {sections.map((section, idx) => (
                                <View key={idx} style={{ marginBottom: 24 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 }}>
                                        <Feather name={section.icon} size={18} color={THEME.primary} />
                                        <Text style={{ fontSize: 16, fontWeight: '700', color: THEME.primaryDark }}>
                                            {section.title}
                                        </Text>
                                    </View>
                                    <View style={{ backgroundColor: '#F9FAFB', borderRadius: 12, padding: 12, gap: 12 }}>
                                        {section.data.map((item, i) => (
                                            item.value ? (
                                                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                    <Text style={{ color: '#6B7280', fontSize: 13, flex: 1 }}>{item.label}</Text>
                                                    <Text style={{ color: '#1F2937', fontSize: 13, fontWeight: '500', flex: 1, textAlign: 'right' }}>
                                                        {item.value}
                                                    </Text>
                                                </View>
                                            ) : null
                                        ))}
                                        {section.data.every(i => !i.value) && (
                                            <Text style={{ color: '#9CA3AF', fontSize: 12, fontStyle: 'italic' }}>No info available</Text>
                                        )}
                                    </View>
                                </View>
                            ))}
                        </ScrollView>

                        {canEditUsers && (
                            <View style={styles.filterFooter}>
                                <TouchableOpacity
                                    style={[styles.applyFilterBtn, { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#D1D5DB' }]}
                                    onPress={() => {
                                        setProfileModalVisible(false);
                                        handleEditUser(viewingUser);
                                    }}
                                >
                                    <Text style={[styles.applyFilterText, { color: '#374151' }]}>Edit Profile</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                </View>
            </Modal>
        );
    };

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Feather name="arrow-left" size={24} color="#FFF" />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={styles.headerTitle}>Team Directory</Text>
                    <Text style={styles.headerSubtitle}>Manage your waffle family</Text>
                </View>
                <TouchableOpacity onPress={onRefresh} style={styles.headerActionBtn}>
                    <Feather name="refresh-cw" size={20} color="#FFF" />
                </TouchableOpacity>
            </View>

            {/* Access Control Info Banner */}
            {accessInfo && (
                <View style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                    paddingVertical: 4, paddingHorizontal: 12,
                    backgroundColor: accessInfo.is_superadmin ? '#DBEAFE' : '#D1FAE5',
                }}>
                    <Feather
                        name={accessInfo.is_superadmin ? 'unlock' : 'shield'}
                        size={12}
                        color={accessInfo.is_superadmin ? '#2563EB' : '#059669'}
                        style={{ marginRight: 6 }}
                    />
                    <Text style={{
                        fontSize: 11, fontWeight: '600',
                        color: accessInfo.is_superadmin ? '#2563EB' : '#059669',
                    }}>
                        {accessInfo.is_superadmin
                            ? `Full access (${accessInfo.viewer_email}) — Showing all ${totalUsers} members`
                            : `Filtered view (${accessInfo.viewer_email}) — Showing ${totalUsers} accessible members`
                        }
                    </Text>
                </View>
            )}

            {/* Search & Filter Bar */}
            <View style={styles.searchContainer}>
                <View style={styles.searchBar}>
                    <Feather name="search" size={20} color="#92400E" />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search team..."
                        placeholderTextColor="#92400E"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setSearchQuery('')}>
                            <Feather name="x" size={18} color="#92400E" />
                        </TouchableOpacity>
                    )}
                </View>
                <TouchableOpacity
                    style={[styles.filterBtn, getActiveFilterCount() > 0 && styles.filterBtnActive]}
                    onPress={() => {
                        setTempFilters({ ...activeFilters }); // Load current filters into temp
                        setFilterModalVisible(true);
                    }}
                >
                    <Feather name="filter" size={20} color={getActiveFilterCount() > 0 ? "#FFF" : "#B45309"} />
                    {getActiveFilterCount() > 0 && (
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>{getActiveFilterCount()}</Text>
                        </View>
                    )}
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.filterBtn, isExporting && { opacity: 0.7 }]}
                    onPress={exportUsersToExcel}
                    disabled={isExporting}
                >
                    {isExporting ? (
                        <ActivityIndicator size="small" color="#B45309" />
                    ) : (
                        <Feather name="download" size={20} color="#B45309" />
                    )}
                </TouchableOpacity>

                {canEditUsers && (
                    <TouchableOpacity
                        style={[styles.filterBtn, selectionMode && styles.filterBtnActive]}
                        onPress={() => {
                            if (selectionMode) {
                                setSelectionMode(false);
                                setSelectedUsers([]);
                            } else {
                                setSelectionMode(true);
                            }
                        }}
                    >
                        <Feather name="check-square" size={20} color={selectionMode ? "#FFF" : "#B45309"} />
                    </TouchableOpacity>
                )}
            </View>

            {/* Selection Toolbar */}
            {selectionMode && (
                <View style={styles.selectionBar}>
                    <Text style={styles.selectionText}>{selectedUsers.length} Selected</Text>
                    <View style={styles.selectionActions}>
                        <TouchableOpacity onPress={handleSelectAll} style={styles.textActionBtn}>
                            <Text style={styles.textActionLabel}>Select All</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={handleBulkDelete} style={[styles.iconActionBtn, { backgroundColor: '#EF4444' }]}>
                            <Feather name="trash-2" size={18} color="#FFF" />
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            {/* List */}
            <FlatList
                data={users}
                renderItem={renderUserCard}
                keyExtractor={(item) => item.email}
                contentContainerStyle={styles.listContent}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[THEME.primary]} />
                }
                onEndReached={loadMore}
                onEndReachedThreshold={0.3}
                ListFooterComponent={() => loadingMore && <ActivityIndicator size="small" color={THEME.primary} style={{ marginVertical: 20 }} />}
                ListEmptyComponent={() => !initialLoading && (
                    <View style={styles.emptyState}>
                        <MaterialCommunityIcons name="account-search-outline" size={64} color="#FCD34D" />
                        <Text style={styles.emptyText}>No team members found</Text>
                        <Text style={styles.emptySubtext}>Try adjusting filters or search</Text>
                    </View>
                )}
            />

            {/* Drawers/Modals */}
            {renderFilterModal()}
            {renderProfileModal()}
            {renderDeleteModal()}

            <CreateUser
                visible={editModalVisible}
                onClose={() => setEditModalVisible(false)}
                isEditing={!!editingUser}
                initialData={editingUser}
                userProfile={userProfile}
                onCreate={handleCreateUser}
                onUpdate={processUserUpdate}
                filterOptions={filterOptions}
                onBulkUploadStart={(taskId) => {
                    setEditModalVisible(false);
                    // Can show a toast or alert here
                    Alert.alert("Upload Queued", `Task ID: ${taskId}`);
                }}
            />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFBEB',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 15,
        backgroundColor: '#F59E0B',
    },
    backBtn: {
        padding: 8,
        marginRight: 12,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#FFF',
    },
    headerSubtitle: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.9)',
    },
    headerActionBtn: {
        padding: 8,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 8,
    },
    searchContainer: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 10,
    },
    searchBar: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        borderRadius: 12,
        paddingHorizontal: 12,
        height: 48,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    searchInput: {
        flex: 1,
        marginLeft: 10,
        fontSize: 15,
        color: '#1F2937',
    },
    filterBtn: {
        width: 48,
        height: 48,
        borderRadius: 12,
        backgroundColor: '#FEF3C7',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#FDE68A',
        position: 'relative',
    },
    filterBtnActive: {
        backgroundColor: '#F59E0B',
        borderColor: '#B45309',
    },
    badge: {
        position: 'absolute',
        top: -5,
        right: -5,
        backgroundColor: '#EF4444',
        borderRadius: 10,
        width: 20,
        height: 20,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: '#FFF',
    },
    badgeText: {
        color: '#FFF',
        fontSize: 10,
        fontWeight: '700',
    },
    selectionBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#FEF3C7',
        paddingHorizontal: 16,
        paddingVertical: 10,
        marginHorizontal: 16,
        marginBottom: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#F59E0B',
    },
    selectionText: {
        fontWeight: '600',
        color: '#92400E',
    },
    selectionActions: {
        flexDirection: 'row',
        gap: 10,
        alignItems: 'center',
    },
    textActionBtn: {
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    textActionLabel: {
        color: '#B45309',
        fontWeight: '600',
    },
    iconActionBtn: {
        width: 36,
        height: 36,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    listContent: {
        paddingHorizontal: 16,
        paddingBottom: 40,
    },
    userCard: {
        backgroundColor: '#FFF',
        borderRadius: 16,
        padding: 12,
        marginBottom: 12,
        flexDirection: 'row',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    userCardSelected: {
        borderColor: '#F59E0B',
        backgroundColor: '#FFFBEB',
    },
    selectionCheckbox: {
        width: 20,
        height: 20,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: '#D1D5DB',
        marginRight: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    selectionCheckboxActive: {
        backgroundColor: '#F59E0B',
        borderColor: '#F59E0B',
    },
    userAvatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    userAvatarText: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: '700',
    },
    userInfo: {
        flex: 1,
    },
    userName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#1F2937',
        marginBottom: 2,
    },
    userEmail: {
        fontSize: 13,
        color: '#6B7280',
        marginBottom: 6,
    },
    tagsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
    },
    roleBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
        borderWidth: 1,
        backgroundColor: '#FFF',
    },
    roleText: {
        fontSize: 11,
        fontWeight: '600',
    },
    storeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
        backgroundColor: '#FEF3C7',
    },
    storeText: {
        fontSize: 11,
        color: '#92400E',
        fontWeight: '500',
    },
    actionsColumn: {
        alignItems: 'flex-end',
        justifyContent: 'center',
        paddingLeft: 8,
    },
    statusDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 60,
    },
    emptyText: {
        fontSize: 18,
        fontWeight: '700',
        color: '#4B5563',
        marginTop: 16,
    },
    emptySubtext: {
        fontSize: 14,
        color: '#9CA3AF',
        marginTop: 4,
    },

    // MODAL STYLES
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    filterModalContainer: {
        backgroundColor: '#FFF',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        height: height * 0.8,
        paddingBottom: 20,
    },
    filterHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    filterTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#111827',
    },
    filterContent: {
        flex: 1,
    },
    filterSection: {
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    filterSectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        backgroundColor: '#FFF',
    },
    filterSectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#374151',
    },
    filterCountBadge: {
        backgroundColor: '#F59E0B',
        borderRadius: 12,
        paddingHorizontal: 6,
        paddingVertical: 1,
    },
    filterCountText: {
        color: '#FFF',
        fontSize: 10,
        fontWeight: '700',
    },
    filterOptionsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        padding: 16,
        paddingTop: 0,
        gap: 8,
        backgroundColor: '#F9FAFB',
    },
    filterOptionChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#FFF',
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    filterOptionChipSelected: {
        backgroundColor: '#F59E0B',
        borderColor: '#B45309',
    },
    filterOptionText: {
        fontSize: 13,
        color: '#4B5563',
    },
    filterOptionTextSelected: {
        color: '#FFF',
        fontWeight: '600',
    },
    filterFooter: {
        flexDirection: 'row',
        padding: 20,
        gap: 12,
        borderTopWidth: 1,
        borderTopColor: '#F3F4F6',
    },
    resetFilterBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#D1D5DB',
        alignItems: 'center',
    },
    resetFilterText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#6B7280',
    },
    applyFilterBtn: {
        flex: 2,
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: '#F59E0B',
        alignItems: 'center',
        shadowColor: '#F59E0B',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
    },
    applyFilterText: {
        fontSize: 15,
        fontWeight: '700',
        color: '#FFF',
    },
    switchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingBottom: 16,
    },
    switchLabel: {
        fontSize: 14,
        color: '#6B7280',
    },

    // Profile Modal specific styles
    profileOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    profileCard: {
        backgroundColor: '#FFF',
        height: '90%',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        overflow: 'hidden',
    },
    profileHeaderGradient: {
        padding: 20,
        paddingTop: 20,
    },
    profileHeaderContent: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    profileAvatarLarge: {
        width: 64,
        height: 64,
        borderRadius: 32,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 3,
        borderColor: 'rgba(255,255,255,0.3)',
    },
    profileAvatarTextLarge: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#FFF',
    },
    profileHeaderName: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#FFF',
        marginBottom: 2,
    },
    profileHeaderEmail: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.9)',
    },
    profileHeaderBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        borderWidth: 1,
        gap: 4,
    },
    profileHeaderBadgeText: {
        color: '#FFF',
        fontSize: 10,
        fontWeight: '600',
    },
    profileCloseBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    profileEditBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        alignSelf: 'flex-start',
        marginTop: 16,
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
        gap: 6,
    },
    profileEditBtnText: {
        color: '#451A03',
        fontWeight: '600',
        fontSize: 13,
    },
    profileSection: {
        marginBottom: 24,
    },
    profileSectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
    },
    profileSectionTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#B45309',
    },
    profileInfoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    profileInfoLabel: {
        color: '#6B7280',
        fontSize: 14,
        flex: 1,
    },
    profileInfoValue: {
        color: '#1F2937',
        fontSize: 14,
        fontWeight: '500',
        flex: 1,
        textAlign: 'right',
    },
});

export default TeamListScreen;
