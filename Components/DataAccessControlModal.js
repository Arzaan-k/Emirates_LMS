/**
 * DataAccessControlModal
 *
 * Granular access control management for user data visibility.
 * Allows admins to assign which users can see which employees' data
 * based on organizational hierarchy (Stores, Cities, Regions, States)
 * and user attributes (Departments, Designations, Roles).
 *
 * Features:
 * - Select a user (grantee) to manage their data access
 * - Multi-select items across different tabs (Stores, Cities, etc.)
 * - Auto-cascade for geographic grants
 * - Filter options within each tab
 * - Preview accessible users count
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    ActivityIndicator,
    Dimensions,
    Platform,
    TextInput,
    ScrollView,
    FlatList,
    Switch,
} from 'react-native';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import API_URL from '../config';

const { width, height } = Dimensions.get('window');

// Theme colors
const THEME = {
    primary: '#3B82F6',
    primaryDark: '#1E40AF',
    success: '#10B981',
    warning: '#D71A21',
    danger: '#EF4444',
    purple: '#8B5CF6',
    pink: '#EC4899',
    teal: '#14B8A6',
    orange: '#F97316',
    textMain: '#1F2937',
    textSub: '#6B7280',
    border: '#E5E7EB',
    bg: '#F9FAFB',
    bgDark: '#F3F4F6',
};

// Tab colors for visual distinction
const TAB_COLORS = {
    users: '#3B82F6',
    stores: '#8B5CF6',
    cities: '#EC4899',
    regions: '#D71A21',
    states: '#10B981',
    departments: '#14B8A6',
    designations: '#F97316',
    roles: '#6366F1',
};

// Tab configuration
const TABS = [
    { id: 'stores', label: 'Stores', icon: 'home', color: TAB_COLORS.stores },
    { id: 'cities', label: 'Cities', icon: 'map-pin', color: TAB_COLORS.cities },
    { id: 'regions', label: 'Regions', icon: 'globe', color: TAB_COLORS.regions },
    { id: 'states', label: 'States', icon: 'map', color: TAB_COLORS.states },
    { id: 'departments', label: 'Departments', icon: 'grid', color: TAB_COLORS.departments },
    { id: 'designations', label: 'Designations', icon: 'award', color: TAB_COLORS.designations },
    { id: 'roles', label: 'Roles', icon: 'briefcase', color: TAB_COLORS.roles },
    { id: 'users', label: 'Users', icon: 'user', color: TAB_COLORS.users },
];

export default function DataAccessControlModal({ visible, onClose }) {
    // Loading states
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [loadingGrants, setLoadingGrants] = useState(false);

    // Data states
    const [filterOptions, setFilterOptions] = useState({
        stores: [],
        cities: [],
        regions: [],
        states: [],
        departments: [],
        designations: [],
        roles: [],
        users: [],
    });
    const [allUsers, setAllUsers] = useState([]);
    const [grantsSummary, setGrantsSummary] = useState([]);

    // Selection states
    const [selectedGrantee, setSelectedGrantee] = useState(null);
    const [existingGrants, setExistingGrants] = useState([]);
    const [accessibleCount, setAccessibleCount] = useState(0);

    // UI states
    const [activeTab, setActiveTab] = useState('stores');
    const [searchQuery, setSearchQuery] = useState('');
    const [userSearchQuery, setUserSearchQuery] = useState('');
    const [showGranteePicker, setShowGranteePicker] = useState(false);
    const [autoCascade, setAutoCascade] = useState(true);

    // Multi-select state per tab
    const [selectedItems, setSelectedItems] = useState({
        stores: new Set(),
        cities: new Set(),
        regions: new Set(),
        states: new Set(),
        departments: new Set(),
        designations: new Set(),
        roles: new Set(),
        users: new Set(),
    });

    // Filter state for sub-filtering (e.g., filter stores by city)
    const [tabFilters, setTabFilters] = useState({
        stores: '',  // Filter stores by city
        cities: '',  // Filter cities by state
    });

    // Toast state
    const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });

    // Race condition guard to prevent API fetching from overriding Optimistic UI during rapid taps
    const pendingDeletesRef = useRef(new Set());

    // ===========================================
    // EFFECTS
    // ===========================================

    useEffect(() => {
        if (visible) {
            loadInitialData();
        }
    }, [visible]);

    useEffect(() => {
        if (selectedGrantee) {
            loadGranteeData();
        }
    }, [selectedGrantee]);

    // ===========================================
    // DATA LOADING
    // ===========================================

    const getAuthHeaders = async () => {
        const token = await AsyncStorage.getItem('userToken');
        return {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        };
    };

    const loadInitialData = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const headers = await getAuthHeaders();

            // Load filter options and grants summary in parallel
            // Use timestamp to prevent aggressive GET caching which causes deleted items to reappear
            const t = Date.now();
            const [filterRes, summaryRes, usersRes] = await Promise.all([
                fetch(`${API_URL}/api/v1/access-control/filter-options?t=${t}`, { headers }),
                fetch(`${API_URL}/api/v1/access-control/grants/summary?t=${t}`, { headers }),
                fetch(`${API_URL}/api/v1/users/?limit=1000&t=${t}`, { headers }),
            ]);

            if (filterRes.ok) {
                const data = await filterRes.json();
                console.log('[DataAccessControl] Filter options loaded:', {
                    stores: data.stores?.length || 0,
                    cities: data.cities?.length || 0,
                    states: data.states?.length || 0,
                    users: data.users?.length || 0,
                });
                setFilterOptions(data);
            } else {
                console.error('[DataAccessControl] Filter options failed:', filterRes.status);
            }

            if (summaryRes.ok) {
                const data = await summaryRes.json();
                setGrantsSummary(data.summary || []);
            } else {
                console.error('[DataAccessControl] Summary failed:', summaryRes.status);
            }

            if (usersRes.ok) {
                const data = await usersRes.json();
                console.log('[DataAccessControl] Users loaded:', data.users?.length || 0);
                setAllUsers(data.users || []);
            } else {
                console.error('[DataAccessControl] Users failed:', usersRes.status);
            }
        } catch (error) {
            console.error('[DataAccessControl] Error loading data:', error);
            showToast('Failed to load data', 'error');
        } finally {
            if (!silent) setLoading(false);
        }
    };

    const loadGranteeData = async (silent = false) => {
        if (!selectedGrantee) return;

        if (!silent) setLoadingGrants(true);
        try {
            const headers = await getAuthHeaders();

            // Load grants and accessible users count in parallel
            // Cache-bust the fetch so we always get the exact current database state after deletions
            const t = Date.now();
            const [grantsRes, accessibleRes] = await Promise.all([
                fetch(`${API_URL}/api/v1/access-control/grants/user/${selectedGrantee.email}?t=${t}`, { headers }),
                fetch(`${API_URL}/api/v1/access-control/accessible-users/${selectedGrantee.email}?t=${t}`, { headers }),
            ]);

            if (grantsRes.ok) {
                const data = await grantsRes.json();

                // CRITICAL FIX: Do not clobber optimistic UI with intermediate fetch data if a deletion is actively running
                if (pendingDeletesRef.current.size === 0 || !silent) {
                    setExistingGrants(data.grants || []);

                    // Initialize selected items from existing grants
                    const newSelected = {
                        stores: new Set(),
                        cities: new Set(),
                        regions: new Set(),
                        states: new Set(),
                        departments: new Set(),
                        designations: new Set(),
                        roles: new Set(),
                        users: new Set(),
                    };

                    (data.grants || []).forEach(grant => {
                        const type = grant.grant_type;
                        if (type === 'user') {
                            newSelected.users.add(grant.target_value);
                        } else if (type === 'store') {
                            newSelected.stores.add(grant.target_value);
                        } else if (type === 'city') {
                            newSelected.cities.add(grant.target_value);
                        } else if (type === 'region') {
                            newSelected.regions.add(grant.target_value);
                        } else if (type === 'state') {
                            newSelected.states.add(grant.target_value);
                        } else if (type === 'department') {
                            newSelected.departments.add(grant.target_value);
                        } else if (type === 'designation') {
                            newSelected.designations.add(grant.target_value);
                        } else if (type === 'role') {
                            newSelected.roles.add(grant.target_value);
                        }
                    });

                    setSelectedItems(newSelected);
                }
            }

            if (accessibleRes.ok) {
                const data = await accessibleRes.json();
                setAccessibleCount(data.accessible_count || 0);
            }
        } catch (error) {
            console.error('Error loading grantee data:', error);
        } finally {
            if (!silent) setLoadingGrants(false);
        }
    };

    // ===========================================
    // SELECTION HANDLERS
    // ===========================================

    const toggleItem = (tab, value) => {
        setSelectedItems(prev => {
            const newSet = new Set(prev[tab]);
            if (newSet.has(value)) {
                newSet.delete(value);
            } else {
                newSet.add(value);
            }
            return { ...prev, [tab]: newSet };
        });
    };

    const selectAll = (tab) => {
        const items = getFilteredItems(tab);
        setSelectedItems(prev => {
            const newSet = new Set(prev[tab]);
            items.forEach(item => {
                const value = typeof item === 'object' ? item.email || item.name : item;
                newSet.add(value);
            });
            return { ...prev, [tab]: newSet };
        });
    };

    const deselectAll = (tab) => {
        setSelectedItems(prev => ({
            ...prev,
            [tab]: new Set(),
        }));
    };

    const clearAllSelections = () => {
        setSelectedItems({
            stores: new Set(),
            cities: new Set(),
            regions: new Set(),
            states: new Set(),
            departments: new Set(),
            designations: new Set(),
            roles: new Set(),
            users: new Set(),
        });
    };

    // ===========================================
    // SAVE GRANTS
    // ===========================================

    const saveGrants = async () => {
        if (!selectedGrantee) {
            showToast('Please select a user first', 'error');
            return;
        }

        setSaving(true);
        try {
            const headers = await getAuthHeaders();

            // Build grants array from selected items
            const grants = [];

            // Only include non-cascaded selections (primary grants)
            // Geographic types will auto-cascade on backend
            const geographicTypes = ['state', 'region', 'city', 'store'];

            // Add states first (highest in hierarchy)
            if (selectedItems.states.size > 0) {
                grants.push({ type: 'state', values: Array.from(selectedItems.states) });
            }

            // Add regions (but skip if parent state already selected - will cascade)
            if (selectedItems.regions.size > 0 && !autoCascade) {
                grants.push({ type: 'region', values: Array.from(selectedItems.regions) });
            } else if (selectedItems.regions.size > 0 && selectedItems.states.size === 0) {
                grants.push({ type: 'region', values: Array.from(selectedItems.regions) });
            }

            // Add cities
            if (selectedItems.cities.size > 0 && !autoCascade) {
                grants.push({ type: 'city', values: Array.from(selectedItems.cities) });
            } else if (selectedItems.cities.size > 0 && selectedItems.states.size === 0 && selectedItems.regions.size === 0) {
                grants.push({ type: 'city', values: Array.from(selectedItems.cities) });
            }

            // Add stores (always add if selected)
            if (selectedItems.stores.size > 0) {
                grants.push({ type: 'store', values: Array.from(selectedItems.stores) });
            }

            // Non-geographic types (always add)
            if (selectedItems.departments.size > 0) {
                grants.push({ type: 'department', values: Array.from(selectedItems.departments) });
            }
            if (selectedItems.designations.size > 0) {
                grants.push({ type: 'designation', values: Array.from(selectedItems.designations) });
            }
            if (selectedItems.roles.size > 0) {
                grants.push({ type: 'role', values: Array.from(selectedItems.roles) });
            }
            if (selectedItems.users.size > 0) {
                grants.push({ type: 'user', values: Array.from(selectedItems.users) });
            }

            if (grants.length === 0) {
                showToast('No items selected', 'warning');
                setSaving(false);
                return;
            }

            const response = await fetch(`${API_URL}/api/v1/access-control/grants/bulk`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    grantee_email: selectedGrantee.email,
                    grants,
                    auto_cascade: autoCascade,
                }),
            });

            const result = await response.json();

            if (response.ok) {
                showToast(`Created ${result.total_created} grants (${result.total_cascaded} cascaded)`, 'success');
                // Reload grantee data to refresh counts
                loadGranteeData(true);
                loadInitialData(true);
            } else {
                showToast(result.detail || 'Failed to save grants', 'error');
            }
        } catch (error) {
            console.error('Error saving grants:', error);
            showToast('Failed to save grants', 'error');
        } finally {
            setSaving(false);
        }
    };

    const revokeGrant = async (grantId) => {
        pendingDeletesRef.current.add(grantId);
        // Optimistic UI Update: Remove the grant AND any children that were cascaded from it to prevent ghost UI elements
        const previousGrants = [...existingGrants];
        setExistingGrants(prev => prev.filter(g => g.id !== grantId && g.cascaded_from_id !== grantId));

        try {
            const headers = await getAuthHeaders();

            const response = await fetch(`${API_URL}/api/v1/access-control/grants/${grantId}`, {
                method: 'DELETE',
                headers,
            });

            if (response.ok) {
                pendingDeletesRef.current.delete(grantId);
                // Background fetch to silently update the counts only if no other rapid deletes arrived in the meantime
                if (pendingDeletesRef.current.size === 0) {
                    loadGranteeData(true);
                    loadInitialData(true);
                }
            } else {
                pendingDeletesRef.current.delete(grantId);
                setExistingGrants(previousGrants); // Revert UI if it fails
                showToast('Failed to revoke grant', 'error');
            }
        } catch (error) {
            pendingDeletesRef.current.delete(grantId);
            setExistingGrants(previousGrants); // Revert UI if it fails
            console.error('Error revoking grant:', error);
            showToast('Failed to revoke grant', 'error');
        }
    };

    // ===========================================
    // FILTERING
    // ===========================================

    const getFilteredItems = (tab) => {
        const items = tab === 'users'
            ? filterOptions.users || []
            : filterOptions[tab] || [];

        if (!searchQuery.trim()) {
            return items;
        }

        const query = searchQuery.toLowerCase();

        if (tab === 'users') {
            return items.filter(u =>
                u.name?.toLowerCase().includes(query) ||
                u.email?.toLowerCase().includes(query) ||
                u.store?.toLowerCase().includes(query) ||
                u.role?.toLowerCase().includes(query)
            );
        }

        return items.filter(item =>
            item.toLowerCase().includes(query)
        );
    };

    const filteredItems = useMemo(() => getFilteredItems(activeTab), [activeTab, filterOptions, searchQuery]);

    // ===========================================
    // TOAST
    // ===========================================

    const showToast = (message, type = 'success') => {
        setToast({ visible: true, message, type });
        setTimeout(() => {
            setToast({ visible: false, message: '', type: 'success' });
        }, 3000);
    };

    // ===========================================
    // RENDER HELPERS
    // ===========================================

    const renderGranteePicker = () => {
        const filteredUsers = userSearchQuery.trim()
            ? allUsers.filter(u =>
                u.name?.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
                u.email?.toLowerCase().includes(userSearchQuery.toLowerCase())
            )
            : allUsers;

        return (
            <Modal visible={showGranteePicker} animationType="slide" transparent>
                <View style={styles.pickerOverlay}>
                    <View style={styles.pickerContainer}>
                        <View style={styles.pickerHeader}>
                            <Text style={styles.pickerTitle}>Select User to Manage</Text>
                            <TouchableOpacity onPress={() => setShowGranteePicker(false)}>
                                <Feather name="x" size={24} color="#6B7280" />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.searchRow}>
                            <Feather name="search" size={18} color="#9CA3AF" />
                            <TextInput
                                style={styles.searchInput}
                                placeholder="Search users..."
                                value={userSearchQuery}
                                onChangeText={setUserSearchQuery}
                                placeholderTextColor="#9CA3AF"
                            />
                            {userSearchQuery.length > 0 && (
                                <TouchableOpacity onPress={() => setUserSearchQuery('')}>
                                    <Feather name="x-circle" size={18} color="#9CA3AF" />
                                </TouchableOpacity>
                            )}
                        </View>

                        <FlatList
                            data={filteredUsers}
                            keyExtractor={(item) => item.email || item.id?.toString()}
                            renderItem={({ item }) => {
                                const hasGrants = grantsSummary.some(g => g.email === item.email);
                                return (
                                    <TouchableOpacity
                                        style={styles.userPickerRow}
                                        onPress={() => {
                                            setSelectedGrantee(item);
                                            setShowGranteePicker(false);
                                            setUserSearchQuery('');
                                        }}
                                    >
                                        <View style={styles.userPickerAvatar}>
                                            <Text style={styles.userPickerInitial}>
                                                {item.name?.charAt(0)?.toUpperCase() || 'U'}
                                            </Text>
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.userPickerName}>{item.name}</Text>
                                            <Text style={styles.userPickerEmail}>{item.email}</Text>
                                        </View>
                                        {hasGrants && (
                                            <View style={styles.hasGrantsBadge}>
                                                <Feather name="key" size={12} color="#10B981" />
                                            </View>
                                        )}
                                    </TouchableOpacity>
                                );
                            }}
                            style={{ maxHeight: height * 0.5 }}
                        />
                    </View>
                </View>
            </Modal>
        );
    };

    const renderSelectedGrantee = () => {
        if (!selectedGrantee) {
            return (
                <TouchableOpacity
                    style={styles.selectGranteeBtn}
                    onPress={() => setShowGranteePicker(true)}
                >
                    <Feather name="user-plus" size={20} color={THEME.primary} />
                    <Text style={styles.selectGranteeBtnText}>Select User to Manage Access</Text>
                    <Feather name="chevron-right" size={20} color="#9CA3AF" />
                </TouchableOpacity>
            );
        }

        return (
            <View style={styles.selectedGranteeCard}>
                <View style={styles.granteeAvatar}>
                    <Text style={styles.granteeInitial}>
                        {selectedGrantee.name?.charAt(0)?.toUpperCase() || 'U'}
                    </Text>
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={styles.granteeName}>{selectedGrantee.name}</Text>
                    <Text style={styles.granteeEmail}>{selectedGrantee.email}</Text>
                    <View style={styles.granteeStats}>
                        <View style={styles.statBadge}>
                            <Feather name="key" size={12} color={THEME.primary} />
                            <Text style={styles.statBadgeText}>{existingGrants.length} grants</Text>
                        </View>
                        <View style={[styles.statBadge, { backgroundColor: '#ECFDF5' }]}>
                            <Feather name="users" size={12} color="#10B981" />
                            <Text style={[styles.statBadgeText, { color: '#10B981' }]}>
                                {accessibleCount} accessible
                            </Text>
                        </View>
                    </View>
                </View>
                <TouchableOpacity
                    style={styles.changeGranteeBtn}
                    onPress={() => {
                        setSelectedGrantee(null);
                        clearAllSelections();
                        setExistingGrants([]);
                        setAccessibleCount(0);
                    }}
                >
                    <Feather name="edit-2" size={16} color="#6B7280" />
                </TouchableOpacity>
            </View>
        );
    };

    const renderTabs = () => (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tabsContainer}
            contentContainerStyle={styles.tabsContent}
        >
            {TABS.map(tab => {
                const isActive = activeTab === tab.id;
                const count = selectedItems[tab.id]?.size || 0;

                return (
                    <TouchableOpacity
                        key={tab.id}
                        style={[
                            styles.tab,
                            isActive && { backgroundColor: tab.color + '15', borderColor: tab.color }
                        ]}
                        onPress={() => {
                            setActiveTab(tab.id);
                            setSearchQuery('');
                        }}
                    >
                        <Feather
                            name={tab.icon}
                            size={16}
                            color={isActive ? tab.color : '#6B7280'}
                        />
                        <Text style={[
                            styles.tabLabel,
                            isActive && { color: tab.color }
                        ]}>
                            {tab.label}
                        </Text>
                        {count > 0 && (
                            <View style={[styles.tabBadge, { backgroundColor: tab.color }]}>
                                <Text style={styles.tabBadgeText}>{count}</Text>
                            </View>
                        )}
                    </TouchableOpacity>
                );
            })}
        </ScrollView>
    );

    const renderItemsList = () => {
        const tab = TABS.find(t => t.id === activeTab);
        const items = filteredItems;
        const isUserTab = activeTab === 'users';

        // Debug: Log items count
        console.log(`[DataAccessControl] Tab: ${activeTab}, Items: ${items.length}`);

        return (
            <View style={[styles.itemsContainer, { minHeight: 300, backgroundColor: '#FFF' }]}>
                {/* Search and Actions */}
                <View style={styles.itemsHeader}>
                    <View style={styles.searchRow}>
                        <Feather name="search" size={16} color="#9CA3AF" />
                        <TextInput
                            style={styles.searchInput}
                            placeholder={`Search ${tab.label.toLowerCase()}...`}
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            placeholderTextColor="#9CA3AF"
                        />
                        {searchQuery.length > 0 && (
                            <TouchableOpacity onPress={() => setSearchQuery('')}>
                                <Feather name="x-circle" size={16} color="#9CA3AF" />
                            </TouchableOpacity>
                        )}
                    </View>

                    <View style={styles.itemsActions}>
                        <TouchableOpacity
                            style={styles.actionBtn}
                            onPress={() => selectAll(activeTab)}
                        >
                            <Feather name="check-square" size={14} color={THEME.primary} />
                            <Text style={styles.actionBtnText}>Select All</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.actionBtn}
                            onPress={() => deselectAll(activeTab)}
                        >
                            <Feather name="square" size={14} color="#6B7280" />
                            <Text style={[styles.actionBtnText, { color: '#6B7280' }]}>Clear</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Items List */}
                <FlatList
                    data={items}
                    keyExtractor={(item, index) => isUserTab ? item.email : `${item}-${index}`}
                    renderItem={({ item }) => {
                        const value = isUserTab ? item.email : item;
                        const isSelected = selectedItems[activeTab].has(value);
                        const isExisting = existingGrants.some(
                            g => g.grant_type === (isUserTab ? 'user' : activeTab.slice(0, -1)) &&
                                g.target_value === value
                        );
                        const isCascaded = existingGrants.some(
                            g => g.target_value === value && g.is_cascaded
                        );

                        return (
                            <TouchableOpacity
                                style={[
                                    styles.itemRow,
                                    isSelected && styles.itemRowSelected,
                                    isExisting && styles.itemRowExisting,
                                ]}
                                onPress={() => toggleItem(activeTab, value)}
                            >
                                <View style={[
                                    styles.checkbox,
                                    isSelected && { backgroundColor: tab.color, borderColor: tab.color }
                                ]}>
                                    {isSelected && <Feather name="check" size={14} color="#FFF" />}
                                </View>

                                {isUserTab ? (
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.itemName}>{item.name}</Text>
                                        <Text style={styles.itemSub}>{item.email}</Text>
                                        <View style={styles.itemTags}>
                                            {item.role && (
                                                <Text style={styles.itemTag}>{item.role}</Text>
                                            )}
                                            {item.store && item.store !== 'Unassigned' && (
                                                <Text style={styles.itemTag}>{item.store}</Text>
                                            )}
                                        </View>
                                    </View>
                                ) : (
                                    <Text style={styles.itemName}>{item}</Text>
                                )}

                                {isExisting && (
                                    <View style={[styles.existingBadge, isCascaded && styles.cascadedBadge]}>
                                        <Text style={styles.existingBadgeText}>
                                            {isCascaded ? 'Cascaded' : 'Granted'}
                                        </Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                        );
                    }}
                    style={{ flex: 1 }}
                    ListEmptyComponent={
                        <View style={styles.emptyList}>
                            <Feather name="inbox" size={32} color="#D1D5DB" />
                            <Text style={styles.emptyListText}>No {tab.label.toLowerCase()} found</Text>
                        </View>
                    }
                />
            </View>
        );
    };

    const renderExistingGrants = () => {
        if (!selectedGrantee || existingGrants.length === 0) return null;

        // Group grants by type
        const grantsByType = {};
        existingGrants.forEach(grant => {
            if (!grantsByType[grant.grant_type]) {
                grantsByType[grant.grant_type] = [];
            }
            grantsByType[grant.grant_type].push(grant);
        });

        return (
            <View style={styles.existingGrantsSection}>
                <Text style={styles.sectionTitle}>Current Access Grants</Text>
                {Object.entries(grantsByType).map(([type, grants]) => (
                    <View key={type} style={styles.grantTypeGroup}>
                        <Text style={styles.grantTypeLabel}>
                            {type.charAt(0).toUpperCase() + type.slice(1)}s ({grants.length})
                        </Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            {grants.map(grant => (
                                <View
                                    key={grant.id}
                                    style={[
                                        styles.grantChip,
                                        grant.is_cascaded && styles.grantChipCascaded
                                    ]}
                                >
                                    <Text style={styles.grantChipText}>{grant.target_value}</Text>
                                    <TouchableOpacity
                                        onPress={() => revokeGrant(grant.id)}
                                        style={styles.grantChipRemove}
                                    >
                                        <Feather name="x" size={12} color="#EF4444" />
                                    </TouchableOpacity>
                                </View>
                            ))}
                        </ScrollView>
                    </View>
                ))}
            </View>
        );
    };

    // ===========================================
    // MAIN RENDER
    // ===========================================

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                        <Feather name="x" size={24} color="#6B7280" />
                    </TouchableOpacity>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.headerTitle}>Data Access Control</Text>
                        <Text style={styles.headerSub}>Manage who can view which users' data</Text>
                    </View>
                    {selectedGrantee && (
                        <TouchableOpacity
                            style={[styles.saveBtn, saving && { opacity: 0.7 }]}
                            onPress={saveGrants}
                            disabled={saving}
                        >
                            {saving ? (
                                <ActivityIndicator size="small" color="#FFF" />
                            ) : (
                                <>
                                    <Feather name="save" size={16} color="#FFF" />
                                    <Text style={styles.saveBtnText}>Save</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    )}
                </View>

                {loading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={THEME.primary} />
                        <Text style={styles.loadingText}>Loading...</Text>
                    </View>
                ) : (
                    <View style={{ flex: 1 }}>
                        {/* Grantee Selection */}
                        <View style={styles.section}>
                            {renderSelectedGrantee()}
                        </View>

                        {selectedGrantee && (
                            <View style={{ flex: 1 }}>
                                {/* Auto-Cascade Toggle */}
                                <View style={styles.cascadeRow}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.cascadeLabel}>Auto-Cascade Geographic Grants</Text>
                                        <Text style={styles.cascadeSub}>
                                            State grants automatically include all cities & stores
                                        </Text>
                                    </View>
                                    <Switch
                                        value={autoCascade}
                                        onValueChange={setAutoCascade}
                                        trackColor={{ false: '#E5E7EB', true: THEME.primary + '50' }}
                                        thumbColor={autoCascade ? THEME.primary : '#9CA3AF'}
                                    />
                                </View>

                                {/* Existing Grants Summary */}
                                {renderExistingGrants()}

                                {/* Tabs */}
                                {renderTabs()}

                                {/* Items List */}
                                {loadingGrants ? (
                                    <View style={styles.loadingContainer}>
                                        <ActivityIndicator size="small" color={THEME.primary} />
                                    </View>
                                ) : (
                                    renderItemsList()
                                )}
                            </View>
                        )}
                    </View>
                )}

                {/* Grantee Picker Modal */}
                {renderGranteePicker()}

                {/* Toast */}
                {toast.visible && (
                    <View style={[
                        styles.toast,
                        toast.type === 'error' && styles.toastError,
                        toast.type === 'warning' && styles.toastWarning,
                    ]}>
                        <Feather
                            name={toast.type === 'error' ? 'alert-circle' : toast.type === 'warning' ? 'alert-triangle' : 'check-circle'}
                            size={18}
                            color="#FFF"
                        />
                        <Text style={styles.toastText}>{toast.message}</Text>
                    </View>
                )}
            </View>
        </Modal>
    );
}

// ===========================================
// STYLES
// ===========================================

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: THEME.bg,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: '#FFF',
        borderBottomWidth: 1,
        borderBottomColor: THEME.border,
    },
    closeBtn: {
        padding: 4,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: THEME.textMain,
    },
    headerSub: {
        fontSize: 13,
        color: THEME.textSub,
        marginTop: 2,
    },
    saveBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: THEME.primary,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 8,
        gap: 6,
    },
    saveBtnText: {
        color: '#FFF',
        fontWeight: '600',
        fontSize: 14,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 40,
    },
    loadingText: {
        marginTop: 12,
        color: THEME.textSub,
        fontSize: 14,
    },
    section: {
        padding: 16,
    },
    selectGranteeBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        padding: 16,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: THEME.border,
        borderStyle: 'dashed',
        gap: 12,
    },
    selectGranteeBtnText: {
        flex: 1,
        fontSize: 15,
        color: THEME.primary,
        fontWeight: '500',
    },
    selectedGranteeCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: THEME.border,
    },
    granteeAvatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: THEME.primary + '20',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    granteeInitial: {
        fontSize: 20,
        fontWeight: '700',
        color: THEME.primary,
    },
    granteeName: {
        fontSize: 16,
        fontWeight: '600',
        color: THEME.textMain,
    },
    granteeEmail: {
        fontSize: 13,
        color: THEME.textSub,
        marginTop: 2,
    },
    granteeStats: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 8,
    },
    statBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: THEME.primary + '15',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        gap: 4,
    },
    statBadgeText: {
        fontSize: 12,
        fontWeight: '500',
        color: THEME.primary,
    },
    changeGranteeBtn: {
        padding: 8,
    },
    cascadeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        marginHorizontal: 16,
        padding: 16,
        borderRadius: 12,
        marginBottom: 16,
    },
    cascadeLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: THEME.textMain,
    },
    cascadeSub: {
        fontSize: 12,
        color: THEME.textSub,
        marginTop: 2,
    },
    tabsContainer: {
        backgroundColor: '#FFF',
        borderBottomWidth: 1,
        borderBottomColor: THEME.border,
        flexGrow: 0,
        height: 60,
        minHeight: 60,
    },
    tabsContent: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        gap: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
    },
    tab: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: THEME.border,
        backgroundColor: '#FFF',
        marginRight: 8,
        gap: 6,
    },
    tabLabel: {
        fontSize: 13,
        fontWeight: '500',
        color: '#6B7280',
    },
    tabBadge: {
        minWidth: 18,
        height: 18,
        borderRadius: 9,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 5,
    },
    tabBadgeText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#FFF',
    },
    itemsContainer: {
        flex: 1,
        minHeight: 400,
        backgroundColor: '#FFF',
    },
    itemsHeader: {
        padding: 12,
        backgroundColor: '#FFF',
    },
    searchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: THEME.bgDark,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        gap: 8,
    },
    searchInput: {
        flex: 1,
        fontSize: 14,
        color: THEME.textMain,
        paddingVertical: 0,
    },
    itemsActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 12,
        marginTop: 8,
    },
    actionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    actionBtnText: {
        fontSize: 13,
        fontWeight: '500',
        color: THEME.primary,
    },
    itemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        backgroundColor: '#FFF',
        borderBottomWidth: 1,
        borderBottomColor: THEME.border,
        gap: 12,
    },
    itemRowSelected: {
        backgroundColor: THEME.primary + '08',
    },
    itemRowExisting: {
        backgroundColor: '#ECFDF5',
    },
    checkbox: {
        width: 22,
        height: 22,
        borderRadius: 4,
        borderWidth: 2,
        borderColor: THEME.border,
        justifyContent: 'center',
        alignItems: 'center',
    },
    itemName: {
        fontSize: 14,
        fontWeight: '500',
        color: THEME.textMain,
    },
    itemSub: {
        fontSize: 12,
        color: THEME.textSub,
        marginTop: 2,
    },
    itemTags: {
        flexDirection: 'row',
        gap: 6,
        marginTop: 4,
    },
    itemTag: {
        fontSize: 11,
        color: '#6B7280',
        backgroundColor: THEME.bgDark,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    existingBadge: {
        backgroundColor: '#10B981',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    cascadedBadge: {
        backgroundColor: '#6B7280',
    },
    existingBadgeText: {
        fontSize: 10,
        fontWeight: '600',
        color: '#FFF',
    },
    emptyList: {
        alignItems: 'center',
        paddingVertical: 40,
    },
    emptyListText: {
        fontSize: 14,
        color: THEME.textSub,
        marginTop: 8,
    },
    existingGrantsSection: {
        padding: 16,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: THEME.textMain,
        marginBottom: 12,
    },
    grantTypeGroup: {
        marginBottom: 12,
    },
    grantTypeLabel: {
        fontSize: 12,
        fontWeight: '500',
        color: THEME.textSub,
        marginBottom: 6,
    },
    grantChip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        borderWidth: 1,
        borderColor: THEME.border,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 16,
        marginRight: 8,
        gap: 6,
    },
    grantChipCascaded: {
        backgroundColor: THEME.bgDark,
        borderStyle: 'dashed',
    },
    grantChipText: {
        fontSize: 13,
        color: THEME.textMain,
    },
    grantChipRemove: {
        padding: 2,
    },
    pickerOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    pickerContainer: {
        backgroundColor: '#FFF',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        maxHeight: height * 0.8,
    },
    pickerHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: THEME.border,
    },
    pickerTitle: {
        fontSize: 17,
        fontWeight: '600',
        color: THEME.textMain,
    },
    userPickerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderBottomWidth: 1,
        borderBottomColor: THEME.border,
    },
    userPickerAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: THEME.primary + '20',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    userPickerInitial: {
        fontSize: 16,
        fontWeight: '600',
        color: THEME.primary,
    },
    userPickerName: {
        fontSize: 15,
        fontWeight: '500',
        color: THEME.textMain,
    },
    userPickerEmail: {
        fontSize: 13,
        color: THEME.textSub,
    },
    hasGrantsBadge: {
        padding: 6,
        backgroundColor: '#ECFDF5',
        borderRadius: 12,
    },
    toast: {
        position: 'absolute',
        bottom: 40,
        left: 20,
        right: 20,
        backgroundColor: '#10B981',
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        borderRadius: 12,
        gap: 10,
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.15,
                shadowRadius: 8,
            },
            android: {
                elevation: 6,
            },
        }),
    },
    toastError: {
        backgroundColor: '#EF4444',
    },
    toastWarning: {
        backgroundColor: '#D71A21',
    },
    toastText: {
        flex: 1,
        color: '#FFF',
        fontSize: 14,
        fontWeight: '500',
    },
});
