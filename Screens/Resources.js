import React, { useState, useEffect } from "react";
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    TextInput,
    Dimensions,
    Modal,
} from "react-native";
import { Feather, MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import Animated, {
    FadeInDown,
    FadeIn,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
    withSpring,
} from 'react-native-reanimated';
import API_URL from '../config';

const { width, height } = Dimensions.get("window");

// Floating Waffle Component
const FloatingWaffle = ({ delay, duration, startX, startY }) => {
    const translateY = useSharedValue(startY);
    const translateX = useSharedValue(startX);
    const rotate = useSharedValue(0);

    useEffect(() => {
        translateY.value = withRepeat(
            withTiming(startY - 100, { duration: duration * 1000 }),
            -1,
            true
        );
        translateX.value = withRepeat(
            withTiming(startX + 20, { duration: (duration / 2) * 1000 }),
            -1,
            true
        );
        rotate.value = withRepeat(
            withTiming(360, { duration: duration * 2000 }),
            -1,
            false
        );
    }, []);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [
            { translateY: translateY.value },
            { translateX: translateX.value },
            { rotate: `${rotate.value}deg` },
        ],
    }));

    return (
        <Animated.Text style={[styles.floatingWaffle, animatedStyle]}>
            🧇
        </Animated.Text>
    );
};

// MOCK DATA
const MOCK_CATEGORIES = [
    { id: 1, name: "Safety Protocols", icon: "shield-checkmark", color: "#EF4444" },
    { id: 2, name: "Recipes & SOPs", icon: "restaurant", color: "#F59E0B" },
    { id: 3, name: "Training Videos", icon: "videocam", color: "#8B5CF6" },
    { id: 4, name: "Equipment Guides", icon: "construct", color: "#3B82F6" },
];

const MOCK_RESOURCES = [
    { id: 1, title: "Safety Protocols", type: "PDF", category: "Safety", timestamp: new Date().toISOString() },
    { id: 2, title: "Waffle Recipe Guide", type: "Document", category: "Recipes", timestamp: new Date(Date.now() - 86400000).toISOString() },
    { id: 3, title: "Cleaning Procedures", type: "Document", category: "Operations", timestamp: new Date(Date.now() - 172800000).toISOString() },
    { id: 4, title: "Equipment Training", type: "Video", category: "Training", timestamp: new Date(Date.now() - 259200000).toISOString() },
    { id: 5, title: "Customer Service Standards", type: "PDF", category: "Service", timestamp: new Date(Date.now() - 345600000).toISOString() },
];

const MOCK_CONTENT = {
    "Safety Protocols": `# Safety Protocols\n\n## Fire Safety\n- Fire extinguishers checked monthly\n- Emergency exits never blocked\n- Staff know evacuation routes\n\n## Equipment Safety\n- Wear protective gloves\n- Unplug before cleaning\n- Never leave unattended`,
    "Waffle Recipe Guide": `# Belgian Waffle Recipe\n\n## Ingredients\n- 2 cups flour\n- 2 tbsp sugar\n- 4 tsp baking powder\n- 2 eggs\n- 1.5 cups milk\n- 1/2 cup butter\n\n## Instructions\n1. Preheat waffle iron\n2. Mix dry ingredients\n3. Beat egg whites\n4. Combine and fold\n5. Cook 4-5 minutes`,
    "Cleaning Procedures": `# Daily Cleaning\n\n## Opening (8AM)\n- Wipe all counters\n- Check waffle makers\n- Sanitize prep areas\n- Stock supplies\n\n## Closing (9PM)\n- Deep clean machines\n- Mop floors\n- Take out trash\n- Lock doors`,
    "Equipment Training": `# Equipment Guide\n\n## Waffle Maker\n- Preheat 5 minutes\n- Spray non-stick\n- 1/2 cup batter\n- Cook 4-5 minutes\n\n## Maintenance\n- Daily: Clean surfaces\n- Weekly: Deep clean\n- Monthly: Service check`,
    "Customer Service Standards": `# Service Excellence\n\n## Greeting\n- Smile and eye contact\n- Greet within 30 seconds\n- Friendly tone\n\n## Orders\n- Listen carefully\n- Repeat for confirmation\n- Ready in 5 minutes`,

    // CATEGORY OVERVIEWS
    "Safety Protocols Overview": `# Safety Protocols Category\n\n## Overview\nThis section contains all safety-related guidelines and standard operating procedures (SOPs) for the store.\n\n## Contents\n- Fire Safety Procedures\n- Equipment Handling\n- Food Safety Guidelines\n- Emergency Contact List\n\nTap on individual files below to view full details.`,
    "Recipes & SOPs Overview": `# Recipes & Standard Procedures\n\n## Collection\nAccess our complete library of waffle recipes, topping guides, and preparation standards.\n\n## Featured\n- Classic Belgian Waffle\n- Chocolate Overload\n- Red Velvet Special\n- Batter Preparation Standards`,
    "Training Videos Overview": `# Training Video Library\n\n## Scope\nVideo tutorials covering equipment operation, customer service scenarios, and closing duties.\n\n## Watch List\n- New Hire Orientation\n- POS System Training\n- Espresso Machine Mastery\n- Handling Difficult Customers`,
    "Equipment Guides Overview": `# Equipment & Maintenance\n\n## Manuals\nDetailed operation manuals and maintenance schedules for all store machinery.\n\n## Critical Equipment\n- Waffle Irons (Model X-500)\n- Espresso Machine\n- Grinders\n- HVAC System\n- Refrigeration Units`,
};

const MANDATORY_MODULES = [
    { id: 1, name: "Batter Preparation", icon: "beaker-outline", count: 4, color: "#F59E0B" },
    { id: 2, name: "Waffle Baking", icon: "cube-outline", count: 6, color: "#F59E0B" },
    { id: 3, name: "Topping Application", icon: "water-outline", count: 5, color: "#F59E0B" },
    { id: 4, name: "Equipment Care", icon: "construct-outline", count: 8, color: "#F59E0B" },
];

// Content Preview Modal
const ContentPreviewModal = ({ visible, onClose, resource }) => {
    if (!resource) return null;

    const content = MOCK_CONTENT[resource.title] || `# ${resource.title}\n\nContent preview coming soon...`;

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={styles.modalContainer}>
                <Animated.View entering={FadeIn} style={styles.modalContent}>
                    <View style={styles.modalHeader}>
                        <View style={styles.modalHeaderLeft}>
                            <View style={[styles.modalIcon, {
                                backgroundColor: resource.type === 'Video' ? '#FEF2F2' :
                                    resource.type === 'PDF' ? '#EFF6FF' : '#F0FDF4'
                            }]}>
                                <MaterialCommunityIcons
                                    name={resource.type === 'Video' ? "file-video-outline" :
                                        resource.type === 'PDF' ? "file-pdf-box" : "file-document-outline"}
                                    size={24}
                                    color={resource.type === 'Video' ? "#EF4444" :
                                        resource.type === 'PDF' ? "#3B82F6" : "#10B981"}
                                />
                            </View>
                            <View>
                                <Text style={styles.modalTitle}>{resource.title}</Text>
                                <Text style={styles.modalSubtitle}>{resource.type} • {resource.category}</Text>
                            </View>
                        </View>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <Feather name="x" size={24} color="#111827" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                        <View style={styles.contentPreview}>
                            {content.split('\n').map((line, index) => {
                                if (line.startsWith('# ')) {
                                    return <Text key={index} style={styles.h1}>{line.replace('# ', '')}</Text>;
                                } else if (line.startsWith('## ')) {
                                    return <Text key={index} style={styles.h2}>{line.replace('## ', '')}</Text>;
                                } else if (line.startsWith('- ')) {
                                    return (
                                        <View key={index} style={styles.listItem}>
                                            <Text style={styles.bullet}>•</Text>
                                            <Text style={styles.listText}>{line.replace('- ', '')}</Text>
                                        </View>
                                    );
                                } else if (line.trim() === '') {
                                    return <View key={index} style={{ height: 12 }} />;
                                } else {
                                    return <Text key={index} style={styles.paragraph}>{line}</Text>;
                                }
                            })}
                        </View>
                    </ScrollView>

                    <View style={styles.modalFooter}>
                        <TouchableOpacity style={styles.footerBtn}>
                            <Feather name="download" size={20} color="#F59E0B" />
                            <Text style={styles.footerBtnText}>Download</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.footerBtn}>
                            <Feather name="share-2" size={20} color="#F59E0B" />
                            <Text style={styles.footerBtnText}>Share</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.footerBtn, styles.footerBtnPrimary]}>
                            <Feather name="bookmark" size={20} color="#FFF" />
                            <Text style={[styles.footerBtnText, { color: '#FFF' }]}>Save</Text>
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );
};

export default function Resources() {
    const insets = useSafeAreaInsets();
    const [search, setSearch] = useState("");
    const navigation = useNavigation();
    const [categories, setCategories] = useState(MOCK_CATEGORIES);
    const [resources, setResources] = useState(MOCK_RESOURCES);
    const [previewVisible, setPreviewVisible] = useState(false);
    const [selectedResource, setSelectedResource] = useState(null);

    const handleResourcePress = (resource) => {
        setSelectedResource(resource);
        setPreviewVisible(true);
    };

    const handleCategoryPress = (category) => {
        handleResourcePress({
            title: category.name + " Overview",
            type: "Category Guide",
            category: category.name,
            timestamp: new Date().toISOString(),
        });
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            {/* FLOATING WAFFLES */}
            <FloatingWaffle delay={0} duration={8} startX={50} startY={100} />
            <FloatingWaffle delay={2} duration={10} startX={width - 80} startY={200} />
            <FloatingWaffle delay={4} duration={7} startX={30} startY={height - 300} />
            <FloatingWaffle delay={1} duration={9} startX={width - 100} startY={height - 400} />

            <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
                {/* HEADER */}
                <View style={styles.header}>
                    <Text style={styles.pageTitle}>Knowledge Base</Text>
                    <View style={styles.aiBadge}>
                        <MaterialCommunityIcons name="star-four-points" size={12} color="#F59E0B" />
                        <Text style={styles.aiBadgeText}>AI Powered</Text>
                    </View>
                </View>

                {/* SEARCH */}
                <View style={styles.searchSection}>
                    <View style={styles.searchBox}>
                        <MaterialCommunityIcons name="robot" size={24} color="#F59E0B" />
                        <TextInput
                            placeholder="Ask AI about SOPs, recipes..."
                            style={styles.input}
                            placeholderTextColor="#9CA3AF"
                            value={search}
                            onChangeText={setSearch}
                        />
                        {search ? (
                            <TouchableOpacity onPress={() => setSearch('')}>
                                <Feather name="x-circle" size={20} color="#9CA3AF" />
                            </TouchableOpacity>
                        ) : null}
                    </View>
                </View>

                {/* CATEGORIES */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Resource Categories</Text>
                    {categories.map((cat, index) => (
                        <Animated.View key={cat.id} entering={FadeInDown.delay(index * 50)}>
                            <TouchableOpacity
                                style={styles.categoryCard}
                                onPress={() => handleCategoryPress(cat)}
                            >
                                <View style={[styles.categoryIcon, { backgroundColor: cat.color + '15' }]}>
                                    <Ionicons name={cat.icon} size={28} color={cat.color} />
                                </View>
                                <Text style={styles.categoryName}>{cat.name}</Text>
                                <Feather name="chevron-right" size={20} color="#9CA3AF" />
                            </TouchableOpacity>
                        </Animated.View>
                    ))}
                </View>

                {/* LEARNING BREAKDOWN */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Learning Breakdown</Text>
                    <Text style={styles.sectionSubtitle}>Process & Framework for Waffle Manufacturing</Text>
                    <View style={styles.modulesGrid}>
                        {MANDATORY_MODULES.map((mod, index) => (
                            <Animated.View key={mod.id} entering={FadeInDown.delay(index * 50)} style={styles.moduleCardWrapper}>
                                <TouchableOpacity
                                    style={styles.moduleCard}
                                    onPress={() => navigation.navigate("ModuleDetail", { moduleName: mod.name })}
                                >
                                    <LinearGradient
                                        colors={[mod.color, mod.color + 'DD']}
                                        style={styles.moduleGradient}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 1 }}
                                    >
                                        <Ionicons name={mod.icon} size={32} color="#FFF" />
                                    </LinearGradient>
                                    <Text style={styles.moduleName}>{mod.name}</Text>
                                    <Text style={styles.moduleCount}>{mod.count} modules</Text>
                                </TouchableOpacity>
                            </Animated.View>
                        ))}
                    </View>
                </View>

                {/* RECENT RESOURCES */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Recently Added</Text>
                    {resources.map((item, index) => (
                        <Animated.View key={item.id} entering={FadeInDown.delay(index * 30)}>
                            <TouchableOpacity
                                style={styles.resourceCard}
                                onPress={() => handleResourcePress(item)}
                            >
                                <View style={[styles.resourceIcon, {
                                    backgroundColor: item.type === 'Video' ? '#FEF2F2' :
                                        item.type === 'PDF' ? '#EFF6FF' : '#F0FDF4'
                                }]}>
                                    <MaterialCommunityIcons
                                        name={item.type === 'Video' ? "file-video-outline" :
                                            item.type === 'PDF' ? "file-pdf-box" : "file-document-outline"}
                                        size={24}
                                        color={item.type === 'Video' ? "#EF4444" :
                                            item.type === 'PDF' ? "#3B82F6" : "#10B981"}
                                    />
                                </View>
                                <View style={styles.resourceInfo}>
                                    <Text style={styles.resourceTitle}>{item.title}</Text>
                                    <Text style={styles.resourceMeta}>
                                        {item.type} • {item.category} • {new Date(item.timestamp).toLocaleDateString()}
                                    </Text>
                                </View>
                                <Feather name="chevron-right" size={20} color="#9CA3AF" />
                            </TouchableOpacity>
                        </Animated.View>
                    ))}
                </View>
            </ScrollView>

            <ContentPreviewModal
                visible={previewVisible}
                onClose={() => setPreviewVisible(false)}
                resource={selectedResource}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#FFFFFF",
    },
    floatingWaffle: {
        position: 'absolute',
        fontSize: 32,
        opacity: 0.15,
        zIndex: 0,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 20,
        zIndex: 1,
    },
    pageTitle: {
        fontSize: 28,
        fontFamily: "Poppins_700Bold",
        color: "#111827",
    },
    aiBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: "#FEF3C7",
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
        gap: 4,
    },
    aiBadgeText: {
        fontSize: 11,
        fontFamily: "Poppins_700Bold",
        color: "#F59E0B",
    },
    searchSection: {
        paddingHorizontal: 20,
        marginBottom: 24,
        zIndex: 1,
    },
    searchBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderRadius: 16,
        gap: 12,
        shadowColor: "#F59E0B",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 4,
        borderWidth: 1,
        borderColor: '#FEF3C7',
    },
    input: {
        flex: 1,
        fontSize: 15,
        fontFamily: "Poppins_500Medium",
        color: "#111827",
    },
    section: {
        paddingHorizontal: 20,
        marginBottom: 32,
        zIndex: 1,
    },
    sectionTitle: {
        fontSize: 20,
        fontFamily: "Poppins_700Bold",
        color: "#111827",
        marginBottom: 16,
    },
    sectionSubtitle: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
        marginTop: -10,
        marginBottom: 16,
    },

    // CATEGORIES
    categoryCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: "#FFF",
        padding: 18,
        borderRadius: 16,
        marginBottom: 12,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 3,
    },
    categoryIcon: {
        width: 56,
        height: 56,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    categoryName: {
        flex: 1,
        fontSize: 16,
        fontFamily: "Poppins_600SemiBold",
        color: "#111827",
    },

    // MODULES
    modulesGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginHorizontal: -6,
    },
    moduleCardWrapper: {
        width: '50%',
        paddingHorizontal: 6,
        marginBottom: 12,
    },
    moduleCard: {
        backgroundColor: "#FFF",
        borderRadius: 18,
        padding: 16,
        shadowColor: "#F59E0B",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 10,
        elevation: 4,
    },
    moduleGradient: {
        height: 80,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
    },
    moduleName: {
        fontSize: 14,
        fontFamily: "Poppins_600SemiBold",
        color: "#111827",
        marginBottom: 4,
    },
    moduleCount: {
        fontSize: 11,
        fontFamily: "Poppins_500Medium",
        color: "#F59E0B",
    },

    // RESOURCES
    resourceCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: "#FFF",
        padding: 16,
        borderRadius: 16,
        marginBottom: 12,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
        elevation: 2,
    },
    resourceIcon: {
        width: 48,
        height: 48,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 14,
    },
    resourceInfo: {
        flex: 1,
    },
    resourceTitle: {
        fontSize: 15,
        fontFamily: "Poppins_600SemiBold",
        color: "#111827",
        marginBottom: 3,
    },
    resourceMeta: {
        fontSize: 12,
        fontFamily: "Poppins_400Regular",
        color: "#9CA3AF",
    },

    // MODAL
    modalContainer: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#FFF',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        height: '90%',
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    modalHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        gap: 12,
    },
    modalIcon: {
        width: 48,
        height: 48,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalTitle: {
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
        color: '#111827',
    },
    modalSubtitle: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
    },
    closeBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#F3F4F6',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalBody: {
        flex: 1,
        padding: 20,
    },
    contentPreview: {
        paddingBottom: 20,
    },
    h1: {
        fontSize: 24,
        fontFamily: 'Poppins_700Bold',
        color: '#111827',
        marginBottom: 16,
    },
    h2: {
        fontSize: 20,
        fontFamily: 'Poppins_600SemiBold',
        color: '#111827',
        marginTop: 20,
        marginBottom: 12,
    },
    paragraph: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        color: '#4B5563',
        lineHeight: 22,
        marginBottom: 8,
    },
    listItem: {
        flexDirection: 'row',
        marginBottom: 6,
        paddingLeft: 8,
    },
    bullet: {
        fontSize: 14,
        color: '#F59E0B',
        marginRight: 8,
        fontFamily: 'Poppins_700Bold',
    },
    listText: {
        flex: 1,
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        color: '#4B5563',
        lineHeight: 20,
    },
    modalFooter: {
        flexDirection: 'row',
        padding: 20,
        borderTopWidth: 1,
        borderTopColor: '#F3F4F6',
        gap: 12,
    },
    footerBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        borderRadius: 12,
        backgroundColor: '#FEF3C7',
        gap: 6,
    },
    footerBtnPrimary: {
        backgroundColor: '#F59E0B',
    },
    footerBtnText: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#F59E0B',
    },
});
