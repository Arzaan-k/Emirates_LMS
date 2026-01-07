import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Dimensions,
    Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';

const { width } = Dimensions.get('window');

const AuditsScreen = ({ navigation }) => {
    const [selectedCategory, setSelectedCategory] = useState('safety');

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

    const [checkedItems, setCheckedItems] = useState({});

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

    const handleSubmit = () => {
        const completion = getCompletionRate(selectedCategory);
        if (completion === 100) {
            Alert.alert(
                'Audit Submitted',
                `${auditCategories.find(c => c.id === selectedCategory)?.name} audit completed!`,
                [
                    {
                        text: 'OK',
                        onPress: () => {
                            // Reset checklist
                            const category = selectedCategory;
                            const newChecked = { ...checkedItems };
                            auditChecklists[category].forEach((_, idx) => {
                                delete newChecked[`${category}-${idx}`];
                            });
                            setCheckedItems(newChecked);
                        }
                    }
                ]
            );
        } else {
            Alert.alert(
                'Incomplete Audit',
                `Please complete all items (${completion}% done)`,
                [{ text: 'OK' }]
            );
        }
    };

    const currentCategory = auditCategories.find(c => c.id === selectedCategory);
    const currentChecklist = auditChecklists[selectedCategory] || [];
    const completionRate = getCompletionRate(selectedCategory);

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

                <View style={styles.headerBadge}>
                    <Text style={styles.headerBadgeText}>{completionRate}%</Text>
                </View>
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
                    >
                        <LinearGradient
                            colors={[currentCategory.color, currentCategory.color + 'DD']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.submitGradient}
                        >
                            <Feather name="send" size={20} color="#FFF" />
                            <Text style={styles.submitText}>Submit Audit</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </View>
            </ScrollView>
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
});

export default AuditsScreen;
