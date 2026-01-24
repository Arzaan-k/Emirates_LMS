import React, { useState, useEffect, useCallback } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import CreateUser from './CreateUser';
import API_URL from '../config';

const { width } = Dimensions.get('window');
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
};

const TeamListScreen = ({ navigation, route }) => {
    const { userProfile } = route.params || {};
    const isSuperAdmin = userProfile?.is_superadmin || userProfile?.role === 'Super Admin';

    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedFilter, setSelectedFilter] = useState('All');
    const [selectedStore, setSelectedStore] = useState('All');
    const [stores, setStores] = useState([]);
    const [showFilters, setShowFilters] = useState(false);

    // Pagination
    const [page, setPage] = useState(1);
    const [totalUsers, setTotalUsers] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [hasMore, setHasMore] = useState(true);

    // Edit State
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editingUser, setEditingUser] = useState(null);

    // Dynamic role filters (fetched from backend)
    const [roleFilters, setRoleFilters] = useState(['All', 'Waffler', 'Silver Waffler', 'Gold Waffler', 'Shift Manager', 'Store Manager', 'Super Admin']);
    const [levelColorMap, setLevelColorMap] = useState({});  // Maps level name to color

    useEffect(() => {
        fetchStores();
        fetchLevels(); // Fetch dynamic levels for role filters
        fetchUsers(1, true);
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchUsers(1, true);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery, selectedFilter, selectedStore]);

    // Fetch dynamic levels from backend
    const fetchLevels = async () => {
        try {
            const response = await fetch(`${API_URL}/admin/levels`);
            const data = await response.json();
            if (data.levels && Array.isArray(data.levels)) {
                // Sort by order and extract names
                const sortedLevels = data.levels.sort((a, b) => a.order - b.order);
                const levelNames = sortedLevels.map(l => l.name);
                // Add 'All' at start and 'Super Admin' at end (not a progression level)
                setRoleFilters(['All', ...levelNames, 'Super Admin']);

                // Build color map
                const colorMap = {};
                sortedLevels.forEach(l => {
                    colorMap[l.name] = l.color || '#6B7280';
                });
                setLevelColorMap(colorMap);
            }
        } catch (error) {
            console.error('Failed to fetch levels:', error);
            // Keep default roleFilters on error
        }
    };

    const fetchStores = async () => {
        try {
            const response = await fetch(`${API_URL}/stores`);
            const data = await response.json();
            if (Array.isArray(data)) {
                setStores([{ id: 'all', name: 'All' }, ...data]);
            }
        } catch (error) {
            console.error('Failed to fetch stores:', error);
        }
    };

    const fetchUsers = async (pageNum = 1, reset = false) => {
        try {
            if (reset) {
                setLoading(true);
                setPage(1);
            } else {
                setLoadingMore(true);
            }

            const params = new URLSearchParams({
                page: pageNum.toString(),
                limit: ITEMS_PER_PAGE.toString(),
                search: searchQuery,
                store: selectedStore === 'All' ? '' : selectedStore,
                role: selectedFilter === 'All' ? '' : selectedFilter
            });

            const response = await fetch(`${API_URL}/users/list?${params}`);
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
        } catch (error) {
            console.error('Failed to fetch users:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
            setLoadingMore(false);
        }
    };

    const onRefresh = () => {
        setRefreshing(true);
        fetchUsers(1, true);
    };

    const loadMore = () => {
        if (!loadingMore && hasMore) {
            fetchUsers(page + 1, false);
        }
    };

    const handleEditUser = (user) => {
        setEditingUser(user);
        setEditModalVisible(true);
    };

    const handleUpdateUser = async (updatedData) => {
        try {
            const response = await fetch(`${API_URL}/users/update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedData)
            });
            const result = await response.json();

            if (result.status === 'success') {
                setEditModalVisible(false);
                setEditingUser(null);
                fetchUsers(1, true);
                alert('User updated successfully');
            } else {
                alert(result.message || 'Failed to update user');
            }
        } catch (error) {
            console.error('Update error:', error);
            alert('Error updating user');
        }
    };

    const getRoleColor = (role) => {
        // First check dynamic colors from API
        if (levelColorMap[role]) {
            return levelColorMap[role];
        }
        // Fallback defaults
        const colors = {
            'Super Admin': '#7C2D12', // Strong Brown
            'Store Manager': '#B45309', // Deep Amber
            'Shift Manager': '#D97706', // Amber
            'Gold Waffler': '#F59E0B', // Waffle Yellow
            'Silver Waffler': '#9CA3AF',
            'Waffler': '#6B7280',
        };
        return colors[role] || '#F59E0B';
    };

    const getInitials = (name) => {
        if (!name) return '??';
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    };

    const renderUserCard = useCallback(({ item: user, index }) => (
        <Animated.View
            entering={FadeInDown.delay(Math.min(index * 30, 300))}
            style={styles.userCard}
        >
            <View style={[styles.userAvatar, { backgroundColor: getRoleColor(user.role) }]}>
                <Text style={styles.userAvatarText}>
                    {getInitials(user.name)}
                </Text>
            </View>

            <View style={styles.userInfo}>
                <Text style={styles.userName} numberOfLines={1}>{user.name}</Text>
                <Text style={styles.userEmail} numberOfLines={1}>{user.email}</Text>
                <View style={styles.tagsRow}>
                    <View style={[styles.roleBadge, { backgroundColor: '#FFFBEB', borderColor: getRoleColor(user.role), borderWidth: 1 }]}>
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
                <View style={[styles.statusDot, { backgroundColor: user.has_admin_access ? '#10B981' : '#D1D5DB' }]} />
                {isSuperAdmin && (
                    <TouchableOpacity
                        style={styles.editBtn}
                        onPress={() => handleEditUser(user)}
                    >
                        <Feather name="edit-2" size={16} color="#78350F" />
                    </TouchableOpacity>
                )}
            </View>
        </Animated.View>
    ), [isSuperAdmin]);

    const renderHeader = () => (
        <>
            {/* SEARCH BAR */}
            <View style={styles.searchContainer}>
                <Feather name="search" size={20} color="#B45309" />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search team members..."
                    placeholderTextColor="#92400E"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                />
                {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchQuery('')}>
                        <Feather name="x" size={20} color="#92400E" />
                    </TouchableOpacity>
                )}
                <TouchableOpacity
                    style={[styles.filterToggle, showFilters && styles.filterToggleActive]}
                    onPress={() => setShowFilters(!showFilters)}
                >
                    <Feather name="filter" size={18} color={showFilters ? '#FFF' : '#B45309'} />
                </TouchableOpacity>
            </View>

            {/* ADVANCED FILTERS */}
            {showFilters && (
                <View style={styles.advancedFilters}>
                    {/* Store Filter */}
                    <Text style={styles.filterLabel}>Store Location</Text>
                    <View style={styles.filterChipContainer}>
                        {stores.slice(0, 6).map((store) => (
                            <TouchableOpacity
                                key={store.id}
                                style={[
                                    styles.filterChip,
                                    selectedStore === store.name && styles.filterChipActive
                                ]}
                                onPress={() => setSelectedStore(store.name)}
                            >
                                <Text style={[
                                    styles.filterChipText,
                                    selectedStore === store.name && styles.filterChipTextActive
                                ]}>
                                    {store.name}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Role Filter */}
                    <Text style={styles.filterLabel}>Role</Text>
                    <View style={styles.filterChipContainer}>
                        {roleFilters.map((role) => (
                            <TouchableOpacity
                                key={role}
                                style={[
                                    styles.filterChip,
                                    selectedFilter === role && styles.filterChipActive
                                ]}
                                onPress={() => setSelectedFilter(role)}
                            >
                                <Text style={[
                                    styles.filterChipText,
                                    selectedFilter === role && styles.filterChipTextActive
                                ]}>
                                    {role}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Clear Filters */}
                    {(selectedStore !== 'All' || selectedFilter !== 'All') && (
                        <TouchableOpacity
                            style={styles.clearFiltersBtn}
                            onPress={() => {
                                setSelectedStore('All');
                                setSelectedFilter('All');
                            }}
                        >
                            <Feather name="x-circle" size={14} color="#EF4444" />
                            <Text style={styles.clearFiltersText}>Reset Filters</Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}

            {/* STATS BAR */}
            <View style={styles.statsBar}>
                <View style={styles.statItem}>
                    <Text style={styles.statValue}>{totalUsers.toLocaleString()}</Text>
                    <Text style={styles.statLabel}>Total Members</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                    <Text style={styles.statValue}>{users.length}</Text>
                    <Text style={styles.statLabel}>Displaying</Text>
                </View>
            </View>
        </>
    );

    const renderFooter = () => {
        if (!loadingMore) return null;
        return (
            <View style={styles.loadingMore}>
                <ActivityIndicator size="small" color={THEME.primary} />
                <Text style={styles.loadingMoreText}>Fetching more...</Text>
            </View>
        );
    };

    const renderEmpty = () => (
        <View style={styles.emptyState}>
            <View style={styles.emptyIconContainer}>
                <MaterialCommunityIcons name="account-search" size={64} color="#FCD34D" />
            </View>
            <Text style={styles.emptyTitle}>No team members found</Text>
            <Text style={styles.emptyText}>
                {searchQuery ? 'Try adjusting your search criteria' : 'No users match the selected filters'}
            </Text>
        </View>
    );

    if (loading && users.length === 0) {
        return (
            <SafeAreaView style={styles.container} edges={['top']}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={THEME.primary} />
                    <Text style={styles.loadingText}>Loading Team...</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            {/* HEADER */}
            <LinearGradient
                colors={['#F59E0B', '#D97706']}
                style={styles.header}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
            >
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Feather name="arrow-left" size={24} color="#FFF" />
                </TouchableOpacity>

                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle}>Team Directory</Text>
                    <Text style={styles.headerSubtitle}>Manage your waffle family</Text>
                </View>

                <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn}>
                    <Feather name="refresh-cw" size={20} color="#FFF" />
                </TouchableOpacity>
            </LinearGradient>

            <View style={styles.contentContainer}>
                <FlatList
                    data={users}
                    renderItem={renderUserCard}
                    keyExtractor={(item) => item.email}
                    ListHeaderComponent={renderHeader}
                    ListFooterComponent={renderFooter}
                    ListEmptyComponent={renderEmpty}
                    onEndReached={loadMore}
                    onEndReachedThreshold={0.3}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor="#B45309"
                            colors={['#F59E0B']}
                        />
                    }
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    initialNumToRender={15}
                    maxToRenderPerBatch={10}
                    removeClippedSubviews={true}
                />
            </View>

            <CreateUser
                visible={editModalVisible}
                onClose={() => {
                    setEditModalVisible(false);
                    setEditingUser(null);
                }}
                userProfile={userProfile}
                isEditing={true}
                initialData={editingUser}
                onUpdate={handleUpdateUser}
            />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFBEB', // Cream background
    },
    contentContainer: {
        flex: 1,
        backgroundColor: '#FFFBEB',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#FFFBEB',
    },
    loadingText: {
        marginTop: 12,
        fontSize: 14,
        fontWeight: '600',
        color: '#92400E',
    },

    // HEADER
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
        paddingBottom: 24, // Extra padding for curve effect if added later
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
        shadowColor: "#F59E0B",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 5,
        zIndex: 10,
        marginBottom: -10, // Pull stats/search up
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerCenter: {
        flex: 1,
        marginLeft: 16,
    },
    headerTitle: {
        fontSize: 22,
        fontWeight: '800',
        color: '#FFF',
        textShadowColor: 'rgba(0,0,0,0.1)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
    },
    headerSubtitle: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.9)',
        fontWeight: '500',
    },
    refreshBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
    },

    listContent: {
        paddingTop: 24,
        paddingBottom: 40,
    },

    // SEARCH
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        marginHorizontal: 16,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 16,
        gap: 12,
        borderWidth: 1,
        borderColor: '#FEF3C7',
        shadowColor: '#78350F',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 3,
    },
    searchInput: {
        flex: 1,
        fontSize: 15,
        fontWeight: '500',
        color: '#451A03',
    },
    filterToggle: {
        padding: 8,
        borderRadius: 10,
        backgroundColor: '#FFFBEB',
        borderWidth: 1,
        borderColor: '#FDE68A',
    },
    filterToggleActive: {
        backgroundColor: '#F59E0B',
        borderColor: '#F59E0B',
    },

    // ADVANCED FILTERS
    advancedFilters: {
        marginHorizontal: 16,
        marginTop: 12,
        backgroundColor: '#FFFFFF',
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#FEF3C7',
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 3,
        elevation: 2,
    },
    filterLabel: {
        fontSize: 12,
        fontWeight: '700',
        color: '#92400E',
        marginBottom: 8,
        marginTop: 8,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    filterChipContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    filterChip: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
        backgroundColor: '#FFFBEB',
        borderWidth: 1,
        borderColor: '#FDE68A',
    },
    filterChipActive: {
        backgroundColor: '#F59E0B',
        borderColor: '#F59E0B',
    },
    filterChipText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#92400E',
    },
    filterChipTextActive: {
        color: '#FFF',
    },
    clearFiltersBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 16,
        paddingVertical: 8,
        gap: 6,
        borderTopWidth: 1,
        borderTopColor: '#FEF3C7',
    },
    clearFiltersText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#EF4444',
    },

    // STATS BAR
    statsBar: {
        flexDirection: 'row',
        marginHorizontal: 16,
        marginTop: 16,
        marginBottom: 8,
        backgroundColor: '#FFFFFF',
        padding: 12,
        borderRadius: 12,
        justifyContent: 'space-around',
        borderWidth: 1,
        borderColor: '#FEF3C7',
    },
    statItem: {
        alignItems: 'center',
    },
    statValue: {
        fontSize: 18,
        fontWeight: '800',
        color: '#D97706',
    },
    statLabel: {
        fontSize: 11,
        color: '#92400E',
        fontWeight: '500',
    },
    statDivider: {
        width: 1,
        backgroundColor: '#FDE68A',
    },

    // USER CARD
    userCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        marginHorizontal: 16,
        marginTop: 12,
        padding: 16,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: '#FEF3C7',
        shadowColor: '#D97706',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 2,
    },
    userAvatar: {
        width: 52,
        height: 52,
        borderRadius: 26,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
        elevation: 2,
    },
    userAvatarText: {
        fontSize: 18,
        fontWeight: '700',
        color: '#FFF',
    },
    userInfo: {
        flex: 1,
        marginLeft: 14,
    },
    userName: {
        fontSize: 16,
        fontWeight: '700',
        color: '#451A03',
        marginBottom: 2,
    },
    userEmail: {
        fontSize: 12,
        color: '#92400E',
        marginBottom: 6,
    },
    tagsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        flexWrap: 'wrap',
    },
    roleBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
    },
    roleText: {
        fontSize: 10,
        fontWeight: '700',
    },
    storeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FEF3C7',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
        gap: 4,
    },
    storeText: {
        fontSize: 10,
        fontWeight: '600',
        color: '#78350F',
    },
    actionsColumn: {
        alignItems: 'center',
        gap: 12,
        paddingLeft: 8,
    },
    statusDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        borderWidth: 1,
        borderColor: '#FFF',
    },
    editBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#FFFBEB',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#FDE68A',
    },

    // LOADING MORE
    loadingMore: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 20,
        gap: 8,
    },
    loadingMoreText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#92400E',
    },

    // EMPTY STATE
    emptyState: {
        alignItems: 'center',
        paddingVertical: 60,
        paddingHorizontal: 40,
    },
    emptyIconContainer: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: '#FFFBEB',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
        borderWidth: 4,
        borderColor: '#FEF3C7',
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#451A03',
        marginBottom: 8,
    },
    emptyText: {
        fontSize: 14,
        color: '#92400E',
        textAlign: 'center',
        lineHeight: 20,
    },
});

export default TeamListScreen;
