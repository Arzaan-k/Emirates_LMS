import React, { useState, useEffect, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    FlatList,
    TextInput,
    Dimensions,
    ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

const THEME = {
    primary: '#D71A21',
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
    regions: '#D71A21',
    cities: '#EC4899',
    states: '#6366F1',
    designations: '#0EA5E9',
    departments: '#14B8A6',
};

export default function ImpactUserPickerModal({ visible, onClose, completedUsers = [], inProgressUsers = [], preSelectedEmails = new Set(), onSave }) {
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
            // Combine completed and in-progress users, mark their status
            const combined = [
                ...(completedUsers || []).map(u => ({ ...u, _status: 'completed', progress_percent: u.progress_percent || 100 })),
                ...(inProgressUsers || []).map(u => ({ ...u, _status: 'in_progress', progress_percent: u.progress_percent || 0 })),
            ];
            setAllUsers(combined);

            // Build filters dynamically from ALL users
            const roleSet = new Set();
            const storeSet = new Set();
            const categorySet = new Set();
            const regionSet = new Set();
            const citySet = new Set();
            const stateSet = new Set();
            const designationSet = new Set();
            const departmentSet = new Set();

            combined.forEach(u => {
                if(u.role) roleSet.add(u.role);
                if(u.store) storeSet.add(u.store);
                if(u.category) categorySet.add(u.category);
                if(u.region) regionSet.add(u.region);
                if(u.city) citySet.add(u.city);
                if(u.state) stateSet.add(u.state);
                if(u.designation) designationSet.add(u.designation);
                if(u.department) departmentSet.add(u.department);
            });

            setFilters({
                roles: Array.from(roleSet).sort(),
                stores: Array.from(storeSet).sort(),
                categories: Array.from(categorySet).sort(),
                regions: Array.from(regionSet).sort(),
                cities: Array.from(citySet).sort(),
                states: Array.from(stateSet).sort(),
                designations: Array.from(designationSet).sort(),
                departments: Array.from(departmentSet).sort(),
            });

            setSelectedEmails(new Set(Array.from(preSelectedEmails)));

            setActiveRoles(new Set());
            setActiveStores(new Set());
            setActiveCategories(new Set());
            setActiveRegions(new Set());
            setActiveCities(new Set());
            setActiveStates(new Set());
            setActiveDesignations(new Set());
            setActiveDepartments(new Set());
            setSearchQuery('');
            setExpandedFilter(null);
        }
    }, [visible, completedUsers, inProgressUsers, preSelectedEmails]);

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
                (u.name && u.name.toLowerCase().includes(q)) ||
                (u.email && u.email.toLowerCase().includes(q)) ||
                (u.role && u.role.toLowerCase().includes(q)) ||
                (u.store && u.store.toLowerCase().includes(q)) ||
                (u.category && u.category.toLowerCase().includes(q)) ||
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
        onSave(effectiveSelected); // We just need the final exact set of selected emails
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
        const isCompleted = user._status === 'completed';
        const progressPercent = user.progress_percent || 0;

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
                    <Text style={styles.userName}>{user.name || user.email}</Text>
                    <Text style={styles.userEmail}>{user.email}</Text>
                    <View style={styles.userTagsRow}>
                        {user.role ? (
                            <View style={[styles.userTag, { backgroundColor: '#EFF6FF' }]}>
                                <Text style={[styles.userTagText, { color: '#3B82F6' }]}>{user.role}</Text>
                            </View>
                        ) : null}
                        {user.store && user.store !== 'Unassigned' && (
                            <View style={[styles.userTag, { backgroundColor: '#F5F3FF' }]}>
                                <Text style={[styles.userTagText, { color: '#8B5CF6' }]}>{user.store}</Text>
                            </View>
                        )}
                        {user.region ? (
                            <View style={[styles.userTag, { backgroundColor: '#FFFBEB' }]}>
                                <Text style={[styles.userTagText, { color: '#D71A21' }]}>{user.region}</Text>
                            </View>
                        ) : null}
                    </View>
                </View>
                <View style={styles.userRightSection}>
                    {/* Progress Badge */}
                    <View style={[
                        styles.progressBadge,
                        { backgroundColor: isCompleted ? '#D1FAE5' : '#FEF3C7' }
                    ]}>
                        <Text style={[
                            styles.progressBadgeText,
                            { color: isCompleted ? '#10B981' : '#B91C1C' }
                        ]}>
                            {progressPercent}%
                        </Text>
                    </View>
                    {/* Status Badge */}
                    <View style={[
                        styles.statusBadge,
                        { backgroundColor: isCompleted ? '#ECFDF5' : '#FEF3C7' }
                    ]}>
                        <Text style={[
                            styles.statusBadgeText,
                            { color: isCompleted ? '#059669' : '#B45309' }
                        ]}>
                            {isCompleted ? 'Completed' : 'In Progress'}
                        </Text>
                    </View>
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
                        <Text style={styles.headerTitle}>Select Users to Impact</Text>
                        <Text style={styles.headerSub}>
                            {effectiveSelected.size} selected • {allUsers.filter(u => u._status === 'completed').length} completed, {allUsers.filter(u => u._status === 'in_progress').length} in progress
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
                        underlineColorAndroid="transparent"
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
                    <ScrollView
                        style={{ maxHeight: expandedFilter ? 220 : 140 }}
                        nestedScrollEnabled
                        showsVerticalScrollIndicator={false}
                    >
                        {filters.roles?.length > 0 && renderFilterGroup('roles', 'Roles', 'briefcase', filters.roles, activeRoles)}
                        {filters.stores?.length > 0 && renderFilterGroup('stores', 'Stores', 'home', filters.stores, activeStores)}
                        {filters.categories?.length > 0 && renderFilterGroup('categories', 'Categories', 'tag', filters.categories, activeCategories)}
                        {filters.regions?.length > 0 && renderFilterGroup('regions', 'Regions', 'globe', filters.regions, activeRegions)}
                        {filters.cities?.length > 0 && renderFilterGroup('cities', 'Cities', 'map-pin', filters.cities, activeCities)}
                        {filters.states?.length > 0 && renderFilterGroup('states', 'States', 'map', filters.states, activeStates)}
                        {filters.designations?.length > 0 && renderFilterGroup('designations', 'Designations', 'award', filters.designations, activeDesignations)}
                        {filters.departments?.length > 0 && renderFilterGroup('departments', 'Departments', 'grid', filters.departments, activeDepartments)}
                    </ScrollView>
                </View>

                {/* Active filter summary chips */}
                {hasAnyFilter && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.activeFiltersRow} contentContainerStyle={{ paddingHorizontal: 16, gap: 6, paddingVertical: 4 }}>
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
                        <Feather name="check-square" size={14} color={THEME.green} />
                        <Text style={[styles.bulkBtnText, { color: THEME.green }]}>Select All Visible</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={deselectAll} style={styles.bulkBtn}>
                        <Feather name="x-square" size={14} color={THEME.red} />
                        <Text style={[styles.bulkBtnText, { color: THEME.red }]}>Deselect All</Text>
                    </TouchableOpacity>
                    <Text style={styles.countText}>{displayUsers.length} shown</Text>
                </View>

                {/* User List */}
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
        backgroundColor: 'transparent', borderRadius: 12, paddingHorizontal: 14, height: 44,
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

    activeFiltersRow: { marginBottom: 12, minHeight: 40 },
    activeChip: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14,
    },
    activeChipText: { fontSize: 11, fontWeight: '600', color: '#FFF' },

    bulkRow: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 16, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: THEME.border,
        borderTopWidth: 0,
        backgroundColor: '#FFF'
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
    userTagsRow: { flexDirection: 'row', gap: 4, flexWrap: 'wrap', marginTop: 6 },
    userTags: { flexDirection: 'row', gap: 4, flexWrap: 'wrap', maxWidth: 140 },
    userTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    userTagText: { fontSize: 10, fontWeight: '600' },
    userRightSection: { alignItems: 'flex-end', gap: 4 },
    progressBadge: {
        paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
    },
    progressBadgeText: { fontSize: 12, fontWeight: '700' },
    statusBadge: {
        paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8,
    },
    statusBadgeText: { fontSize: 10, fontWeight: '600' },
    groupBadge: {
        width: 20, height: 20, borderRadius: 10, backgroundColor: '#F3F4F6',
        justifyContent: 'center', alignItems: 'center', marginLeft: 4,
    },

    emptyWrap: { alignItems: 'center', paddingVertical: 60 },
    emptyText: { marginTop: 12, fontSize: 14, color: THEME.textSub },
});

