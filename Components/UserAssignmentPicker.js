import React, { useState, useEffect, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    FlatList,
    TextInput,
    ActivityIndicator,
    Dimensions,
    ScrollView,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import API_URL from '../config';

const { width, height } = Dimensions.get('window');

const THEME = {
    primary: '#F59E0B',
    primaryDark: '#78350F',
    green: '#10B981',
    blue: '#3B82F6',
    red: '#EF4444',
    purple: '#8B5CF6',
    textMain: '#1F2937',
    textSub: '#6B7280',
    border: '#E5E7EB',
    bg: '#F9FAFB',
};

const FILTER_COLORS = {
    roles: '#3B82F6',
    stores: '#8B5CF6',
    categories: '#10B981',
    regions: '#F59E0B',
    cities: '#EC4899',
    states: '#6366F1',
    designations: '#0EA5E9',
    departments: '#14B8A6',
};

export default function UserAssignmentPicker({ visible, onClose, currentAssignment, onSave }) {
    const [loading, setLoading] = useState(false);
    const [allUsers, setAllUsers] = useState([]);
    const [filters, setFilters] = useState({ roles: [], stores: [], categories: [], regions: [], cities: [], states: [], designations: [], departments: [] });
    const [searchQuery, setSearchQuery] = useState('');

    // Selected users (by email)
    const [selectedEmails, setSelectedEmails] = useState(new Set());

    // Active group filters
    const [activeRoles, setActiveRoles] = useState(new Set());
    const [activeStores, setActiveStores] = useState(new Set());
    const [activeCategories, setActiveCategories] = useState(new Set());
    const [activeRegions, setActiveRegions] = useState(new Set());
    const [activeCities, setActiveCities] = useState(new Set());
    const [activeStates, setActiveStates] = useState(new Set());
    const [activeDesignations, setActiveDesignations] = useState(new Set());
    const [activeDepartments, setActiveDepartments] = useState(new Set());

    // Which filter group is expanded
    const [expandedFilter, setExpandedFilter] = useState(null);

    useEffect(() => {
        if (visible) {
            fetchUsers();
            // Initialize selected from currentAssignment
            const emails = new Set();
            if (currentAssignment) {
                if (Array.isArray(currentAssignment.emails)) {
                    currentAssignment.emails.forEach(e => emails.add(e));
                }
            }
            setSelectedEmails(emails);

            // Initialize active filters from currentAssignment
            const roles = new Set();
            const stores = new Set();
            const categories = new Set();
            const regions = new Set();
            const cities = new Set();
            const states = new Set();
            const designations = new Set();
            const departments = new Set();
            if (currentAssignment) {
                if (Array.isArray(currentAssignment.roles)) currentAssignment.roles.forEach(r => roles.add(r));
                if (Array.isArray(currentAssignment.stores)) currentAssignment.stores.forEach(s => stores.add(s));
                if (Array.isArray(currentAssignment.categories)) currentAssignment.categories.forEach(c => categories.add(c));
                if (Array.isArray(currentAssignment.regions)) currentAssignment.regions.forEach(r => regions.add(r));
                if (Array.isArray(currentAssignment.cities)) currentAssignment.cities.forEach(c => cities.add(c));
                if (Array.isArray(currentAssignment.states)) currentAssignment.states.forEach(s => states.add(s));
                if (Array.isArray(currentAssignment.designations)) currentAssignment.designations.forEach(d => designations.add(d));
                if (Array.isArray(currentAssignment.departments)) currentAssignment.departments.forEach(d => departments.add(d));
            }
            setActiveRoles(roles);
            setActiveStores(stores);
            setActiveCategories(categories);
            setActiveRegions(regions);
            setActiveCities(cities);
            setActiveStates(states);
            setActiveDesignations(designations);
            setActiveDepartments(departments);
            setSearchQuery('');
            setExpandedFilter(null);
        }
    }, [visible]);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const token = await AsyncStorage.getItem('userToken');
            const res = await fetch(`${API_URL}/api/v1/self-learning/admin/users-for-assignment`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            const data = await res.json();
            setAllUsers(data.users || []);
            setFilters(data.filters || { roles: [], stores: [], categories: [], regions: [], cities: [], states: [], designations: [], departments: [] });
        } catch (e) {
            console.error('Fetch users error:', e);
        } finally {
            setLoading(false);
        }
    };

    const hasAnyFilter = activeRoles.size > 0 || activeStores.size > 0 || activeCategories.size > 0 ||
        activeRegions.size > 0 || activeCities.size > 0 || activeStates.size > 0 ||
        activeDesignations.size > 0 || activeDepartments.size > 0;

    // Compute which users match the active group filters
    const groupMatchedEmails = useMemo(() => {
        if (!hasAnyFilter) return new Set();
        const matched = new Set();
        allUsers.forEach(u => {
            const matchRole = activeRoles.size === 0 || activeRoles.has(u.role);
            const matchStore = activeStores.size === 0 || activeStores.has(u.store);
            const matchCat = activeCategories.size === 0 || activeCategories.has(u.category);
            const matchRegion = activeRegions.size === 0 || activeRegions.has(u.region);
            const matchCity = activeCities.size === 0 || activeCities.has(u.city);
            const matchState = activeStates.size === 0 || activeStates.has(u.state);
            const matchDesig = activeDesignations.size === 0 || activeDesignations.has(u.designation);
            const matchDept = activeDepartments.size === 0 || activeDepartments.has(u.department);
            if (matchRole && matchStore && matchCat && matchRegion && matchCity && matchState && matchDesig && matchDept) {
                matched.add(u.email);
            }
        });
        return matched;
    }, [allUsers, activeRoles, activeStores, activeCategories, activeRegions, activeCities, activeStates, activeDesignations, activeDepartments, hasAnyFilter]);

    // Effective selected = individually selected + group matched
    const effectiveSelected = useMemo(() => {
        const combined = new Set(selectedEmails);
        groupMatchedEmails.forEach(e => combined.add(e));
        return combined;
    }, [selectedEmails, groupMatchedEmails]);

    // Filtered users for display (search)
    const displayUsers = useMemo(() => {
        let list = allUsers;
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter(u =>
                u.name.toLowerCase().includes(q) ||
                u.email.toLowerCase().includes(q) ||
                u.role.toLowerCase().includes(q) ||
                u.store.toLowerCase().includes(q) ||
                u.category.toLowerCase().includes(q) ||
                (u.region || '').toLowerCase().includes(q) ||
                (u.city || '').toLowerCase().includes(q) ||
                (u.state || '').toLowerCase().includes(q) ||
                (u.designation || '').toLowerCase().includes(q) ||
                (u.department || '').toLowerCase().includes(q)
            );
        }
        return list;
    }, [allUsers, searchQuery]);

    const toggleUser = (email) => {
        setSelectedEmails(prev => {
            const next = new Set(prev);
            if (next.has(email)) next.delete(email);
            else next.add(email);
            return next;
        });
    };

    const toggleFilterValue = (type, value) => {
        const setterMap = {
            roles: setActiveRoles, stores: setActiveStores, categories: setActiveCategories,
            regions: setActiveRegions, cities: setActiveCities, states: setActiveStates,
            designations: setActiveDesignations, departments: setActiveDepartments,
        };
        const setter = setterMap[type] || setActiveCategories;
        setter(prev => {
            const next = new Set(prev);
            if (next.has(value)) next.delete(value);
            else next.add(value);
            return next;
        });
    };

    const selectAllVisible = () => {
        setSelectedEmails(prev => {
            const next = new Set(prev);
            displayUsers.forEach(u => next.add(u.email));
            return next;
        });
    };

    const deselectAll = () => {
        setSelectedEmails(new Set());
        setActiveRoles(new Set());
        setActiveStores(new Set());
        setActiveCategories(new Set());
        setActiveRegions(new Set());
        setActiveCities(new Set());
        setActiveStates(new Set());
        setActiveDesignations(new Set());
        setActiveDepartments(new Set());
    };

    const handleSave = () => {
        onSave({
            emails: Array.from(selectedEmails),
            roles: Array.from(activeRoles),
            stores: Array.from(activeStores),
            categories: Array.from(activeCategories),
            regions: Array.from(activeRegions),
            cities: Array.from(activeCities),
            states: Array.from(activeStates),
            designations: Array.from(activeDesignations),
            departments: Array.from(activeDepartments),
        });
        onClose();
    };

    const renderFilterGroup = (type, label, icon, values, activeSet) => {
        const isExpanded = expandedFilter === type;
        const color = FILTER_COLORS[type];
        const activeCount = activeSet.size;

        return (
            <View style={styles.filterGroup} key={type}>
                <TouchableOpacity
                    style={styles.filterGroupHeader}
                    onPress={() => setExpandedFilter(isExpanded ? null : type)}
                >
                    <View style={[styles.filterIcon, { backgroundColor: color + '15' }]}>
                        <Feather name={icon} size={14} color={color} />
                    </View>
                    <Text style={styles.filterGroupLabel}>{label}</Text>
                    {activeCount > 0 && (
                        <View style={[styles.filterBadge, { backgroundColor: color }]}>
                            <Text style={styles.filterBadgeText}>{activeCount}</Text>
                        </View>
                    )}
                    <Feather name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color="#9CA3AF" />
                </TouchableOpacity>

                {isExpanded && (
                    <View style={styles.filterChips}>
                        {values.map(val => {
                            const isActive = activeSet.has(val);
                            return (
                                <TouchableOpacity
                                    key={val}
                                    style={[styles.filterChip, isActive && { backgroundColor: color, borderColor: color }]}
                                    onPress={() => toggleFilterValue(type, val)}
                                >
                                    {isActive && <Feather name="check" size={12} color="#FFF" style={{ marginRight: 4 }} />}
                                    <Text style={[styles.filterChipText, isActive && { color: '#FFF' }]}>{val}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                )}
            </View>
        );
    };

    const renderUserItem = ({ item: user }) => {
        const isSelected = effectiveSelected.has(user.email);
        const isGroupSelected = groupMatchedEmails.has(user.email) && !selectedEmails.has(user.email);

        return (
            <TouchableOpacity
                style={[styles.userRow, isSelected && styles.userRowSelected]}
                onPress={() => toggleUser(user.email)}
                activeOpacity={0.7}
            >
                <View style={[styles.userCheckbox, isSelected && styles.userCheckboxSelected]}>
                    {isSelected && <Feather name="check" size={14} color="#FFF" />}
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={styles.userName}>{user.name}</Text>
                    <Text style={styles.userEmail}>{user.email}</Text>
                </View>
                <View style={styles.userTags}>
                    <View style={[styles.userTag, { backgroundColor: '#EFF6FF' }]}>
                        <Text style={[styles.userTagText, { color: '#3B82F6' }]}>{user.role}</Text>
                    </View>
                    {user.store && user.store !== 'Unassigned' && (
                        <View style={[styles.userTag, { backgroundColor: '#F5F3FF' }]}>
                            <Text style={[styles.userTagText, { color: '#8B5CF6' }]}>{user.store}</Text>
                        </View>
                    )}
                    {user.region ? (
                        <View style={[styles.userTag, { backgroundColor: '#FFFBEB' }]}>
                            <Text style={[styles.userTagText, { color: '#F59E0B' }]}>{user.region}</Text>
                        </View>
                    ) : null}
                    {user.city ? (
                        <View style={[styles.userTag, { backgroundColor: '#FDF2F8' }]}>
                            <Text style={[styles.userTagText, { color: '#EC4899' }]}>{user.city}</Text>
                        </View>
                    ) : null}
                </View>
                {isGroupSelected && (
                    <View style={styles.groupBadge}>
                        <Feather name="users" size={10} color="#6B7280" />
                    </View>
                )}
            </TouchableOpacity>
        );
    };

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                        <Feather name="x" size={20} color="#6B7280" />
                    </TouchableOpacity>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.headerTitle}>Assign Users</Text>
                        <Text style={styles.headerSub}>
                            {effectiveSelected.size} user{effectiveSelected.size !== 1 ? 's' : ''} selected
                            {effectiveSelected.size === 0 && ' (all users can access)'}
                        </Text>
                    </View>
                    <TouchableOpacity onPress={handleSave} style={styles.saveHeaderBtn}>
                        <Feather name="check" size={18} color="#FFF" />
                        <Text style={styles.saveHeaderText}>Save</Text>
                    </TouchableOpacity>
                </View>

                {/* Search */}
                <View style={styles.searchRow}>
                    <Feather name="search" size={16} color="#9CA3AF" />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search by name, email, role, store..."
                        placeholderTextColor="#9CA3AF"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setSearchQuery('')}>
                            <Feather name="x-circle" size={16} color="#9CA3AF" />
                        </TouchableOpacity>
                    )}
                </View>

                {/* Filter Groups */}
                <View style={styles.filtersSection}>
                    <View style={styles.filtersSectionHeader}>
                        <Text style={styles.filtersSectionTitle}>Filter by Group</Text>
                        {hasAnyFilter && (
                            <TouchableOpacity onPress={deselectAll}>
                                <Text style={styles.clearFiltersText}>Clear All</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                    <ScrollView style={{ maxHeight: expandedFilter ? 220 : 140 }} nestedScrollEnabled>
                        {renderFilterGroup('roles', 'Roles', 'briefcase', filters.roles, activeRoles)}
                        {renderFilterGroup('stores', 'Stores', 'home', filters.stores, activeStores)}
                        {renderFilterGroup('categories', 'Categories', 'tag', filters.categories, activeCategories)}
                        {filters.regions?.length > 0 && renderFilterGroup('regions', 'Regions', 'globe', filters.regions, activeRegions)}
                        {filters.cities?.length > 0 && renderFilterGroup('cities', 'Cities', 'map-pin', filters.cities, activeCities)}
                        {filters.states?.length > 0 && renderFilterGroup('states', 'States', 'map', filters.states, activeStates)}
                        {filters.designations?.length > 0 && renderFilterGroup('designations', 'Designations', 'award', filters.designations, activeDesignations)}
                        {filters.departments?.length > 0 && renderFilterGroup('departments', 'Departments', 'grid', filters.departments, activeDepartments)}
                    </ScrollView>
                </View>

                {/* Active filter summary chips */}
                {hasAnyFilter && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.activeFiltersRow} contentContainerStyle={{ paddingHorizontal: 16, gap: 6 }}>
                        {[['roles', activeRoles], ['stores', activeStores], ['categories', activeCategories],
                          ['regions', activeRegions], ['cities', activeCities], ['states', activeStates],
                          ['designations', activeDesignations], ['departments', activeDepartments]].map(([type, set]) =>
                            Array.from(set).map(val => (
                                <TouchableOpacity key={`${type}-${val}`} style={[styles.activeChip, { backgroundColor: FILTER_COLORS[type] }]} onPress={() => toggleFilterValue(type, val)}>
                                    <Text style={styles.activeChipText}>{val}</Text>
                                    <Feather name="x" size={12} color="#FFF" />
                                </TouchableOpacity>
                            ))
                        )}
                    </ScrollView>
                )}

                {/* Bulk actions */}
                <View style={styles.bulkRow}>
                    <TouchableOpacity onPress={selectAllVisible} style={styles.bulkBtn}>
                        <Feather name="check-square" size={14} color={THEME.blue} />
                        <Text style={[styles.bulkBtnText, { color: THEME.blue }]}>Select All Visible</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={deselectAll} style={styles.bulkBtn}>
                        <Feather name="x-square" size={14} color={THEME.red} />
                        <Text style={[styles.bulkBtnText, { color: THEME.red }]}>Deselect All</Text>
                    </TouchableOpacity>
                    <Text style={styles.countText}>{displayUsers.length} shown</Text>
                </View>

                {/* User List */}
                {loading ? (
                    <View style={styles.loadingWrap}>
                        <ActivityIndicator size="large" color={THEME.primary} />
                        <Text style={styles.loadingText}>Loading users...</Text>
                    </View>
                ) : (
                    <FlatList
                        data={displayUsers}
                        keyExtractor={(item) => item.email}
                        renderItem={renderUserItem}
                        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
                        showsVerticalScrollIndicator={false}
                        ListEmptyComponent={
                            <View style={styles.emptyWrap}>
                                <Feather name="users" size={40} color="#D1D5DB" />
                                <Text style={styles.emptyText}>No users found</Text>
                            </View>
                        }
                    />
                )}
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: THEME.bg },
    header: {
        flexDirection: 'row', alignItems: 'center', padding: 16,
        borderBottomWidth: 1, borderBottomColor: THEME.border, backgroundColor: '#FFF',
    },
    closeBtn: { padding: 6, backgroundColor: '#F3F4F6', borderRadius: 10 },
    headerTitle: { fontSize: 17, fontWeight: '700', color: THEME.primaryDark },
    headerSub: { fontSize: 12, color: THEME.textSub, marginTop: 2 },
    saveHeaderBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: THEME.green, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12,
    },
    saveHeaderText: { fontSize: 14, fontWeight: '700', color: '#FFF' },

    searchRow: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        marginHorizontal: 16, marginTop: 12, marginBottom: 8,
        backgroundColor: '#FFF', borderRadius: 12, paddingHorizontal: 14, height: 44,
        borderWidth: 1, borderColor: THEME.border,
    },
    searchInput: { flex: 1, fontSize: 14, color: THEME.textMain },

    filtersSection: {
        marginHorizontal: 16, marginBottom: 8,
        backgroundColor: '#FFF', borderRadius: 12, padding: 12,
        borderWidth: 1, borderColor: THEME.border,
    },
    filtersSectionHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8,
    },
    filtersSectionTitle: { fontSize: 13, fontWeight: '700', color: THEME.textMain },
    clearFiltersText: { fontSize: 12, fontWeight: '600', color: THEME.red },

    filterGroup: { marginBottom: 6 },
    filterGroupHeader: {
        flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8,
    },
    filterIcon: {
        width: 28, height: 28, borderRadius: 8, justifyContent: 'center', alignItems: 'center',
    },
    filterGroupLabel: { flex: 1, fontSize: 13, fontWeight: '600', color: THEME.textMain },
    filterBadge: {
        minWidth: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6,
    },
    filterBadgeText: { fontSize: 10, fontWeight: '700', color: '#FFF' },
    filterChips: {
        flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingLeft: 36, paddingBottom: 8,
    },
    filterChip: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
        backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: THEME.border,
    },
    filterChipText: { fontSize: 12, fontWeight: '500', color: THEME.textMain },

    activeFiltersRow: { maxHeight: 40, marginBottom: 6 },
    activeChip: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14,
    },
    activeChipText: { fontSize: 11, fontWeight: '600', color: '#FFF' },

    bulkRow: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 16, paddingVertical: 8,
        borderBottomWidth: 1, borderBottomColor: THEME.border,
    },
    bulkBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    bulkBtnText: { fontSize: 12, fontWeight: '600' },
    countText: { marginLeft: 'auto', fontSize: 11, color: THEME.textSub },

    userRow: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingVertical: 12, paddingHorizontal: 4,
        borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
    },
    userRowSelected: { backgroundColor: '#FFFBEB' },
    userCheckbox: {
        width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#D1D5DB',
        justifyContent: 'center', alignItems: 'center',
    },
    userCheckboxSelected: { backgroundColor: THEME.green, borderColor: THEME.green },
    userName: { fontSize: 14, fontWeight: '600', color: THEME.textMain },
    userEmail: { fontSize: 11, color: THEME.textSub, marginTop: 1 },
    userTags: { flexDirection: 'row', gap: 4, flexWrap: 'wrap', maxWidth: 140 },
    userTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    userTagText: { fontSize: 10, fontWeight: '600' },
    groupBadge: {
        width: 20, height: 20, borderRadius: 10, backgroundColor: '#F3F4F6',
        justifyContent: 'center', alignItems: 'center', marginLeft: 4,
    },

    loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loadingText: { marginTop: 12, fontSize: 13, color: THEME.textSub },
    emptyWrap: { alignItems: 'center', paddingVertical: 60 },
    emptyText: { marginTop: 12, fontSize: 14, color: THEME.textSub },
});
