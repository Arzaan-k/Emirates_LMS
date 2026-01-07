import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    TextInput,
    Dimensions,
    ActivityIndicator,
    RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import API_URL from '../config';

const { width } = Dimensions.get('window');

const TeamListScreen = ({ navigation }) => {
    const [users, setUsers] = useState([]);
    const [filteredUsers, setFilteredUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedFilter, setSelectedFilter] = useState('All');

    useEffect(() => {
        fetchUsers();
    }, []);

    useEffect(() => {
        filterUsers();
    }, [searchQuery, selectedFilter, users]);

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const response = await fetch(`${API_URL}/users/list`);
            const data = await response.json();
            setUsers(data);
        } catch (error) {
            console.error('Failed to fetch users:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const filterUsers = () => {
        let filtered = users;

        // Filter by role
        if (selectedFilter !== 'All') {
            filtered = filtered.filter(u => u.role === selectedFilter);
        }

        // Filter by search
        if (searchQuery) {
            filtered = filtered.filter(u =>
                u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                u.email.toLowerCase().includes(searchQuery.toLowerCase())
            );
        }

        setFilteredUsers(filtered);
    };

    const onRefresh = () => {
        setRefreshing(true);
        fetchUsers();
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.container} edges={['top']}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#0284C7" />
                    <Text style={styles.loadingText}>Loading team...</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            {/* GRADIENT BACKGROUND */}
            <LinearGradient
                colors={['#FFFBEB', '#FFF7ED', '#FFFFFF']}
                style={StyleSheet.absoluteFill}
            />

            {/* HEADER */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Feather name="arrow-left" size={24} color="#111827" />
                </TouchableOpacity>

                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle}>Team Directory</Text>
                    <Text style={styles.headerSubtitle}>{filteredUsers.length} members</Text>
                </View>

                <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn}>
                    <Feather name="refresh-cw" size={20} color="#0284C7" />
                </TouchableOpacity>
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0284C7" />}
            >
                {/* SEARCH BAR */}
                <View style={styles.searchContainer}>
                    <Feather name="search" size={20} color="#9CA3AF" />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search by name or email..."
                        placeholderTextColor="#9CA3AF"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setSearchQuery('')}>
                            <Feather name="x" size={20} color="#9CA3AF" />
                        </TouchableOpacity>
                    )}
                </View>

                {/* FILTER TABS */}
                <View style={styles.filterContainer}>
                    {['All', 'User', 'Store Manager'].map((filter) => (
                        <TouchableOpacity
                            key={filter}
                            style={[
                                styles.filterTab,
                                selectedFilter === filter && styles.filterTabActive
                            ]}
                            onPress={() => setSelectedFilter(filter)}
                        >
                            <Text style={[
                                styles.filterText,
                                selectedFilter === filter && styles.filterTextActive
                            ]}>
                                {filter}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* USER CARDS */}
                <View style={styles.userList}>
                    {filteredUsers.map((user, index) => (
                        <Animated.View
                            key={user.email}
                            entering={FadeInDown.delay(index * 50)}
                        >
                            <View style={styles.userCard}>
                                <View style={styles.userAvatar}>
                                    <Text style={styles.userAvatarText}>
                                        {user.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                                    </Text>
                                </View>

                                <View style={styles.userInfo}>
                                    <Text style={styles.userName}>{user.name}</Text>
                                    <Text style={styles.userEmail}>{user.email}</Text>
                                    <View style={[
                                        styles.roleBadge,
                                        { backgroundColor: user.role === 'Store Manager' ? '#FEF3C7' : '#E0F2FE' }
                                    ]}>
                                        <Text style={[
                                            styles.roleText,
                                            { color: user.role === 'Store Manager' ? '#F59E0B' : '#0284C7' }
                                        ]}>
                                            {user.role}
                                        </Text>
                                    </View>
                                </View>

                                <View style={styles.statusIndicator}>
                                    <View style={[
                                        styles.statusDot,
                                        { backgroundColor: '#9CA3AF' }
                                    ]} />
                                </View>
                            </View>
                        </Animated.View>
                    ))}

                    {filteredUsers.length === 0 && (
                        <View style={styles.emptyState}>
                            <Feather name="users" size={64} color="#D1D5DB" />
                            <Text style={styles.emptyTitle}>No team members found</Text>
                            <Text style={styles.emptyText}>
                                {searchQuery ? 'Try a different search term' : 'No users match the selected filter'}
                            </Text>
                        </View>
                    )}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
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

    // HEADER
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 5,
    },
    backBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#F3F4F6',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerCenter: {
        flex: 1,
        marginLeft: 16,
    },
    headerTitle: {
        fontSize: 18,
        fontFamily: 'Poppins_700Bold',
        color: '#111827',
    },
    headerSubtitle: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
    },
    refreshBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#E0F2FE',
        justifyContent: 'center',
        alignItems: 'center',
    },

    // SEARCH
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        marginHorizontal: 20,
        marginTop: 20,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
        gap: 12,
    },
    searchInput: {
        flex: 1,
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        color: '#111827',
    },

    // FILTERS
    filterContainer: {
        flexDirection: 'row',
        marginHorizontal: 20,
        marginTop: 16,
        backgroundColor: '#FFF',
        borderRadius: 16,
        padding: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    filterTab: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 12,
        alignItems: 'center',
    },
    filterTabActive: {
        backgroundColor: '#E0F2FE',
    },
    filterText: {
        fontSize: 13,
        fontFamily: 'Poppins_500Medium',
        color: '#6B7280',
    },
    filterTextActive: {
        color: '#0284C7',
        fontFamily: 'Poppins_600SemiBold',
    },

    // USER LIST
    userList: {
        padding: 20,
        gap: 16,
    },
    userCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        padding: 16,
        borderRadius: 16,
        shadowColor: '#0284C7',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 3,
    },
    userAvatar: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#0284C7',
        justifyContent: 'center',
        alignItems: 'center',
    },
    userAvatarText: {
        fontSize: 18,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
    },
    userInfo: {
        flex: 1,
        marginLeft: 16,
    },
    userName: {
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
        color: '#111827',
    },
    userEmail: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
        marginTop: 2,
    },
    roleBadge: {
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
        marginTop: 6,
    },
    roleText: {
        fontSize: 10,
        fontFamily: 'Poppins_700Bold',
    },
    statusIndicator: {
        marginLeft: 12,
    },
    statusDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
    },

    // EMPTY STATE
    emptyState: {
        alignItems: 'center',
        paddingVertical: 60,
    },
    emptyTitle: {
        fontSize: 18,
        fontFamily: 'Poppins_600SemiBold',
        color: '#111827',
        marginTop: 16,
    },
    emptyText: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
        marginTop: 8,
        textAlign: 'center',
    },
});

export default TeamListScreen;
