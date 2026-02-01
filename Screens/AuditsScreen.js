import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Dimensions,
    Alert,
    Modal,
    ActivityIndicator,
    FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import API_URL from '../config';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');

const AuditsScreen = ({ navigation, route }) => {
    const { userProfile } = route.params || {};
    const isSuperAdmin = userProfile?.role === 'Super Admin' || userProfile?.is_superadmin;

    const [selectedCategory, setSelectedCategory] = useState('safety');
    const [checkedItems, setCheckedItems] = useState({});
    const [submitting, setSubmitting] = useState(false);

    // History Modal State (Super Admin only)
    const [historyVisible, setHistoryVisible] = useState(false);
    const [historyData, setHistoryData] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [filters, setFilters] = useState({ stores: [], employees: [], categories: [] });
    const [selectedStore, setSelectedStore] = useState(null);
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [selectedHistoryCategory, setSelectedHistoryCategory] = useState(null);
    const [historyStats, setHistoryStats] = useState({});

    const auditCategories = [
        {
            id: 'safety',
            name: 'Safety Compliance',
            icon: 'shield',
            color: '#10B981',
            bg: '#DCFCE7',
        },
        {
            id: 'cleanliness',
            name: 'Cleanliness',
            icon: 'droplet',
            color: '#3B82F6',
            bg: '#DBEAFE',
        },
        {
            id: 'equipment',
            name: 'Equipment',
            icon: 'tool',
            color: '#8B5CF6',
            bg: '#EDE9FE',
        },
        {
            id: 'service',
            name: 'Customer Service',
            icon: 'smile',
            color: '#F59E0B',
            bg: '#FEF3C7',
        },
    ];

    const auditChecklists = {
        safety: [
            'Fire extinguishers accessible and checked',
            'Emergency exits clearly marked',
            'First aid kit fully stocked',
            'No slip hazards on floor',
            'Electrical cords properly managed',
            'Safety equipment available (gloves, aprons)',
        ],
        cleanliness: [
            'Counters and surfaces sanitized',
            'Floor swept and mopped',
            'Bathroom cleaned and stocked',
            'Trash bins emptied',
            'Equipment cleaned after use',
            'Dining area tables wiped',
        ],
        equipment: [
            'Espresso machine cleaned and descaled',
            'Grinder calibrated properly',
            'Refrigerator temperature checked',
            'Ice machine cleaned',
            'POS system functional',
            'WiFi router working',
        ],
        service: [
            'Staff greeted customers warmly',
            'Orders taken accurately',
            'Wait times acceptable (<5 min)',
            'Customer complaints addressed',
            'Loyalty program explained',
            'Receipts provided',
        ],
    };

    const toggleCheck = (category, index) => {
        const key = `${category}-${index}`;
        setCheckedItems(prev => ({
            ...prev,
            [key]: !prev[key]
        }));
    };

    const getCompletionRate = (category) => {
        const items = auditChecklists[category];
        const checked = items.filter((_, idx) => checkedItems[`${category}-${idx}`]).length;
        return Math.round((checked / items.length) * 100);
    };

    const isComplete = (category) => {
        return getCompletionRate(category) === 100;
    };

    const handleSubmit = async () => {
        const completion = getCompletionRate(selectedCategory);
        if (completion !== 100) {
            Alert.alert(
                'Incomplete Audit',
                `Please complete all items (${completion}% done)`,
                [{ text: 'OK' }]
            );
            return;
        }

        setSubmitting(true);
        try {
            const formData = new FormData();
            formData.append('user_email', userProfile?.email || 'user@example.com');
            formData.append('user_name', userProfile?.name || 'User');
            formData.append('store', userProfile?.store || 'Unknown Store');
            formData.append('category', selectedCategory);
            formData.append('checklist_items', JSON.stringify(auditChecklists[selectedCategory]));
            formData.append('checked_items', JSON.stringify(checkedItems));

            const response = await fetch(`${API_URL}/api/v1/crm/audits/submit`, {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.status === 'success') {
                Alert.alert(
                    'Audit Submitted',
                    `${auditCategories.find(c => c.id === selectedCategory)?.name} audit completed successfully!`,
                    [{
                        text: 'OK',
                        onPress: () => {
                            // Reset checklist for this category
                            const newChecked = { ...checkedItems };
                            auditChecklists[selectedCategory].forEach((_, idx) => {
                                delete newChecked[`${selectedCategory}-${idx}`];
                            });
                            setCheckedItems(newChecked);
                        }
                    }]
                );
            } else {
                Alert.alert('Error', result.detail || 'Failed to submit audit');
            }
        } catch (error) {
            console.error('Audit Submit Error:', error);
            Alert.alert('Error', 'Failed to submit audit. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    // Fetch Filters for History
    const fetchFilters = async () => {
        try {
            const response = await fetch(`${API_URL}/api/v1/crm/audits/checklists`);
            const data = await response.json();
            setFilters(data);
        } catch (error) {
            console.error('Fetch Filters Error:', error);
        }
    };

    // Fetch History with Filters
    const fetchHistory = async () => {
        setHistoryLoading(true);
        try {
            let url = `${API_URL}/api/v1/crm/audits/submissions?limit=100`;
            if (selectedStore) url += `&store=${encodeURIComponent(selectedStore)}`;
            if (selectedEmployee) url += `&user_email=${encodeURIComponent(selectedEmployee)}`;
            if (selectedHistoryCategory) url += `&category=${encodeURIComponent(selectedHistoryCategory)}`;

            const token = await AsyncStorage.getItem('userToken');
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            const data = await response.json();
            setHistoryData(data.audits || []);
            setHistoryStats({
                total: data.total_count,
                avgCompletion: data.avg_completion_rate,
                categoryStats: data.category_stats
            });
        } catch (error) {
            console.error('Fetch History Error:', error);
        } finally {
            setHistoryLoading(false);
        }
    };

    // Open History Modal
    const openHistory = () => {
        setHistoryVisible(true);
        fetchFilters();
        fetchHistory();
    };

    useEffect(() => {
        if (historyVisible) {
            fetchHistory();
        }
    }, [selectedStore, selectedEmployee, selectedHistoryCategory]);

    const currentCategory = auditCategories.find(c => c.id === selectedCategory);
    const currentChecklist = auditChecklists[selectedCategory] || [];
    const completionRate = getCompletionRate(selectedCategory);

    // Render History Item
    const renderHistoryItem = ({ item, index }) => {
        const catInfo = auditCategories.find(c => c.id === item.category) || {};
        const date = new Date(item.submitted_at);

        return (
            <Animated.View entering={FadeInDown.delay(index * 30)} style={styles.historyItem}>
                <View style={[styles.historyItemIcon, { backgroundColor: catInfo.bg || '#F3F4F6' }]}>
                    <Feather name={catInfo.icon || 'check'} size={20} color={catInfo.color || '#6B7280'} />
                </View>
                <View style={styles.historyItemContent}>
                    <View style={styles.historyItemHeader}>
                        <Text style={styles.historyItemCategory}>{item.category_name}</Text>
                        <View style={[
                            styles.historyItemBadge,
                            { backgroundColor: item.completion_rate === 100 ? '#DCFCE7' : '#FEF3C7' }
                        ]}>
                            <Text style={[
                                styles.historyItemBadgeText,
                                { color: item.completion_rate === 100 ? '#16A34A' : '#D97706' }
                            ]}>
                                {item.completion_rate}%
                            </Text>
                        </View>
                    </View>
                    <Text style={styles.historyItemStore}>{item.store}</Text>
                    <View style={styles.historyItemFooter}>
                        <View style={styles.historyItemMeta}>
                            <Feather name="user" size={12} color="#9CA3AF" />
                            <Text style={styles.historyItemMetaText}>{item.user_name}</Text>
                        </View>
                        <View style={styles.historyItemMeta}>
                            <Feather name="clock" size={12} color="#9CA3AF" />
                            <Text style={styles.historyItemMetaText}>
                                {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                        </View>
                    </View>
                </View>
            </Animated.View>
        );
    };

    // History Modal
    const renderHistoryModal = () => (
        <Modal visible={historyVisible} animationType="slide" transparent>
            <View style={styles.historyOverlay}>
                <BlurView intensity={80} style={StyleSheet.absoluteFill} />
                <Animated.View entering={FadeInUp} style={styles.historyContainer}>
                    <LinearGradient colors={['#1F2937', '#111827']} style={styles.historyGradient}>
                        {/* Header */}
                        <View style={styles.historyHeader}>
                            <TouchableOpacity onPress={() => setHistoryVisible(false)} style={styles.historyCloseBtn}>
                                <Feather name="x" size={24} color="#FFF" />
                            </TouchableOpacity>
                            <View style={styles.historyHeaderCenter}>
                                <MaterialCommunityIcons name="history" size={24} color="#10B981" />
                                <Text style={styles.historyTitle}>Audit History</Text>
                            </View>
                            <TouchableOpacity style={styles.historyRefreshBtn} onPress={fetchHistory}>
                                <Feather name="refresh-cw" size={18} color="#FFF" />
                            </TouchableOpacity>
                        </View>

                        {/* Filter Pills */}
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
                            {/* Store Filter */}
                            <TouchableOpacity
                                style={[styles.filterPill, selectedStore && styles.filterPillActive]}
                                onPress={() => setSelectedStore(null)}
                            >
                                <Feather name="home" size={14} color={selectedStore ? '#FFF' : '#9CA3AF'} />
                                <Text style={[styles.filterText, selectedStore && styles.filterTextActive]}>
                                    {selectedStore || 'All Stores'}
                                </Text>
                            </TouchableOpacity>

                            {filters.stores?.map(store => (
                                <TouchableOpacity
                                    key={store}
                                    style={[styles.filterPill, selectedStore === store && styles.filterPillActive]}
                                    onPress={() => setSelectedStore(store === selectedStore ? null : store)}
                                >
                                    <Text style={[styles.filterText, selectedStore === store && styles.filterTextActive]}>
                                        {store}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        {/* Employee Filter */}
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
                            <TouchableOpacity
                                style={[styles.filterPill, !selectedEmployee && styles.filterPillActive]}
                                onPress={() => setSelectedEmployee(null)}
                            >
                                <Feather name="users" size={14} color={!selectedEmployee ? '#FFF' : '#9CA3AF'} />
                                <Text style={[styles.filterText, !selectedEmployee && styles.filterTextActive]}>
                                    All Employees
                                </Text>
                            </TouchableOpacity>

                            {filters.employees?.map(emp => (
                                <TouchableOpacity
                                    key={emp.email}
                                    style={[styles.filterPill, selectedEmployee === emp.email && styles.filterPillActive]}
                                    onPress={() => setSelectedEmployee(emp.email === selectedEmployee ? null : emp.email)}
                                >
                                    <Text style={[styles.filterText, selectedEmployee === emp.email && styles.filterTextActive]}>
                                        {emp.name}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        {/* Stats Row */}
                        <View style={styles.historyStatsRow}>
                            <View style={styles.historyStatCard}>
                                <Text style={styles.historyStatValue}>{historyStats.total || 0}</Text>
                                <Text style={styles.historyStatLabel}>Total Audits</Text>
                            </View>
                            <View style={styles.historyStatCard}>
                                <Text style={[styles.historyStatValue, { color: '#10B981' }]}>
                                    {historyStats.avgCompletion || 0}%
                                </Text>
                                <Text style={styles.historyStatLabel}>Avg Completion</Text>
                            </View>
                            <View style={styles.historyStatCard}>
                                <Text style={[styles.historyStatValue, { color: '#F59E0B' }]}>
                                    {filters.stores?.length || 0}
                                </Text>
                                <Text style={styles.historyStatLabel}>Stores</Text>
                            </View>
                        </View>

                        {/* Audits List */}
                        {historyLoading ? (
                            <ActivityIndicator size="large" color="#10B981" style={{ marginTop: 40 }} />
                        ) : historyData.length === 0 ? (
                            <View style={styles.emptyState}>
                                <MaterialCommunityIcons name="clipboard-text-off" size={48} color="#6B7280" />
                                <Text style={styles.emptyText}>No audit history found</Text>
                                <Text style={styles.emptySubtext}>Audit submissions will appear here</Text>
                            </View>
                        ) : (
                            <FlatList
                                data={historyData}
                                renderItem={renderHistoryItem}
                                keyExtractor={(item) => item.id}
                                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
                                showsVerticalScrollIndicator={false}
                            />
                        )}
                    </LinearGradient>
                </Animated.View>
            </View>
        </Modal>
    );

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
                    <Text style={styles.headerTitle}>Store Audits</Text>
                    <Text style={styles.headerSubtitle}>Quality Control Checklist</Text>
                </View>

                {/* History Button - Super Admin Only */}
                {isSuperAdmin ? (
                    <TouchableOpacity onPress={openHistory} style={styles.historyBtn}>
                        <MaterialCommunityIcons name="history" size={24} color="#7C3AED" />
                    </TouchableOpacity>
                ) : (
                    <View style={styles.headerBadge}>
                        <Text style={styles.headerBadgeText}>{completionRate}%</Text>
                    </View>
                )}
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
                {/* CATEGORY SELECTOR */}
                <View style={styles.categoryContainer}>
                    {auditCategories.map((category, index) => (
                        <Animated.View
                            key={category.id}
                            entering={FadeInDown.delay(index * 50)}
                        >
                            <TouchableOpacity
                                style={[
                                    styles.categoryCard,
                                    selectedCategory === category.id && styles.categoryCardActive,
                                    { shadowColor: category.color }
                                ]}
                                onPress={() => setSelectedCategory(category.id)}
                            >
                                <View style={[styles.categoryIcon, { backgroundColor: category.bg }]}>
                                    <Feather name={category.icon} size={24} color={category.color} />
                                </View>
                                <Text style={[
                                    styles.categoryName,
                                    selectedCategory === category.id && { color: category.color }
                                ]}>
                                    {category.name}
                                </Text>
                                {isComplete(category.id) && (
                                    <View style={styles.completeBadge}>
                                        <Feather name="check-circle" size={20} color="#10B981" />
                                    </View>
                                )}
                            </TouchableOpacity>
                        </Animated.View>
                    ))}
                </View>

                {/* CHECKLIST */}
                <View style={styles.checklistContainer}>
                    <View style={styles.checklistHeader}>
                        <View style={[styles.checklistIcon, { backgroundColor: currentCategory.bg }]}>
                            <Feather name={currentCategory.icon} size={28} color={currentCategory.color} />
                        </View>
                        <View style={styles.checklistInfo}>
                            <Text style={styles.checklistTitle}>{currentCategory.name}</Text>
                            <Text style={styles.checklistSubtitle}>
                                {currentChecklist.filter((_, idx) => checkedItems[`${selectedCategory}-${idx}`]).length} / {currentChecklist.length} completed
                            </Text>
                        </View>
                    </View>

                    {/* PROGRESS BAR */}
                    <View style={styles.progressContainer}>
                        <View style={styles.progressBg}>
                            <View style={[
                                styles.progressFill,
                                {
                                    width: `${completionRate}%`,
                                    backgroundColor: currentCategory.color
                                }
                            ]} />
                        </View>
                        <Text style={[styles.progressText, { color: currentCategory.color }]}>
                            {completionRate}%
                        </Text>
                    </View>

                    {/* CHECKLIST ITEMS */}
                    {currentChecklist.map((item, index) => {
                        const isChecked = checkedItems[`${selectedCategory}-${index}`];
                        return (
                            <Animated.View
                                key={index}
                                entering={FadeInDown.delay(index * 30)}
                            >
                                <TouchableOpacity
                                    style={styles.checklistItem}
                                    onPress={() => toggleCheck(selectedCategory, index)}
                                >
                                    <View style={[
                                        styles.checkbox,
                                        isChecked && { backgroundColor: currentCategory.color, borderColor: currentCategory.color }
                                    ]}>
                                        {isChecked && (
                                            <Feather name="check" size={16} color="#FFF" />
                                        )}
                                    </View>
                                    <Text style={[
                                        styles.checklistItemText,
                                        isChecked && styles.checklistItemTextChecked
                                    ]}>
                                        {item}
                                    </Text>
                                </TouchableOpacity>
                            </Animated.View>
                        );
                    })}

                    {/* SUBMIT BUTTON */}
                    <TouchableOpacity
                        style={[styles.submitBtn, { opacity: completionRate === 100 ? 1 : 0.5 }]}
                        onPress={handleSubmit}
                        disabled={submitting || completionRate !== 100}
                    >
                        <LinearGradient
                            colors={[currentCategory.color, currentCategory.color + 'DD']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.submitGradient}
                        >
                            {submitting ? (
                                <ActivityIndicator color="#FFF" />
                            ) : (
                                <>
                                    <Feather name="send" size={20} color="#FFF" />
                                    <Text style={styles.submitText}>Submit Audit</Text>
                                </>
                            )}
                        </LinearGradient>
                    </TouchableOpacity>
                </View>
            </ScrollView>

            {/* History Modal */}
            {renderHistoryModal()}
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
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
    headerBadge: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#DCFCE7',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerBadgeText: {
        fontSize: 14,
        fontFamily: 'Poppins_700Bold',
        color: '#16A34A',
    },
    historyBtn: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#F3E8FF',
        justifyContent: 'center',
        alignItems: 'center',
    },

    // CATEGORIES
    categoryContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        padding: 20,
        gap: 12,
    },
    categoryCard: {
        width: (width - 52) / 2,
        backgroundColor: '#FFF',
        borderRadius: 16,
        padding: 16,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 3,
    },
    categoryCardActive: {
        shadowOpacity: 0.15,
        elevation: 6,
        borderWidth: 2,
        borderColor: '#16A34A',
    },
    categoryIcon: {
        width: 60,
        height: 60,
        borderRadius: 30,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
    },
    categoryName: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
        color: '#111827',
        textAlign: 'center',
    },
    completeBadge: {
        position: 'absolute',
        top: 8,
        right: 8,
    },

    // CHECKLIST
    checklistContainer: {
        backgroundColor: '#FFF',
        marginHorizontal: 20,
        marginBottom: 40,
        borderRadius: 20,
        padding: 20,
        shadowColor: '#16A34A',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.1,
        shadowRadius: 15,
        elevation: 5,
    },
    checklistHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
    },
    checklistIcon: {
        width: 64,
        height: 64,
        borderRadius: 32,
        justifyContent: 'center',
        alignItems: 'center',
    },
    checklistInfo: {
        flex: 1,
        marginLeft: 16,
    },
    checklistTitle: {
        fontSize: 18,
        fontFamily: 'Poppins_700Bold',
        color: '#111827',
    },
    checklistSubtitle: {
        fontSize: 13,
        fontFamily: 'Poppins_500Medium',
        color: '#6B7280',
        marginTop: 2,
    },

    // PROGRESS
    progressContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 24,
        gap: 12,
    },
    progressBg: {
        flex: 1,
        height: 10,
        backgroundColor: '#F3F4F6',
        borderRadius: 5,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: 5,
    },
    progressText: {
        fontSize: 14,
        fontFamily: 'Poppins_700Bold',
    },

    // CHECKLIST ITEMS
    checklistItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
        gap: 12,
    },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 8,
        borderWidth: 2,
        borderColor: '#D1D5DB',
        justifyContent: 'center',
        alignItems: 'center',
    },
    checklistItemText: {
        flex: 1,
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        color: '#111827',
    },
    checklistItemTextChecked: {
        color: '#9CA3AF',
        textDecorationLine: 'line-through',
    },

    // SUBMIT
    submitBtn: {
        marginTop: 24,
        borderRadius: 16,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
        elevation: 6,
    },
    submitGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        gap: 10,
    },
    submitText: {
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
    },

    // HISTORY MODAL
    historyOverlay: { flex: 1, justifyContent: 'flex-end' },
    historyContainer: { height: height * 0.92, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
    historyGradient: { flex: 1, paddingTop: 16 },
    historyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 12 },
    historyCloseBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
    historyHeaderCenter: { flexDirection: 'row', alignItems: 'center' },
    historyTitle: { fontSize: 20, fontFamily: 'Poppins_700Bold', color: '#FFF', marginLeft: 10 },
    historyRefreshBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },

    // FILTERS
    filterRow: { paddingHorizontal: 16, paddingVertical: 6, maxHeight: 50, flexGrow: 0 },
    filterPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.05)', marginRight: 8, gap: 6 },
    filterPillActive: { backgroundColor: '#10B981' },
    filterText: { fontSize: 12, fontFamily: 'Poppins_500Medium', color: '#9CA3AF' },
    filterTextActive: { color: '#FFF' },

    // STATS
    historyStatsRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 10, marginVertical: 12 },
    historyStatCard: { flex: 1, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 14, alignItems: 'center' },
    historyStatValue: { fontSize: 24, fontFamily: 'Poppins_700Bold', color: '#FFF' },
    historyStatLabel: { fontSize: 10, fontFamily: 'Poppins_400Regular', color: '#6B7280', marginTop: 2 },

    // HISTORY ITEMS
    historyItem: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: 14, marginBottom: 10 },
    historyItemIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    historyItemContent: { flex: 1 },
    historyItemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    historyItemCategory: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: '#FFF' },
    historyItemBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    historyItemBadgeText: { fontSize: 11, fontFamily: 'Poppins_700Bold' },
    historyItemStore: { fontSize: 13, fontFamily: 'Poppins_500Medium', color: '#A5B4FC', marginBottom: 6 },
    historyItemFooter: { flexDirection: 'row', gap: 16 },
    historyItemMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    historyItemMetaText: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: '#9CA3AF' },

    // EMPTY STATE
    emptyState: { alignItems: 'center', paddingVertical: 60 },
    emptyText: { fontSize: 16, fontFamily: 'Poppins_600SemiBold', color: '#9CA3AF', marginTop: 16 },
    emptySubtext: { fontSize: 13, fontFamily: 'Poppins_400Regular', color: '#6B7280', marginTop: 4 },
});

export default AuditsScreen;
