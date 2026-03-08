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

// Floating Airplane Component
const FloatingAirplane = ({ delay, duration, startX, startY }) => {
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
        <Animated.Text style={[styles.FloatingAirplane, animatedStyle]}>
            ✈
        </Animated.Text>
    );
};

// MOCK DATA - Properly formatted categories with valid Ionicons names
const MOCK_CATEGORIES = [
    { id: 1, name: "Standard SOPs", icon: "document-text", color: "#3B82F6", description: "Standard operating procedures" },
    { id: 2, name: "Video Tutorials", icon: "play-circle", color: "#D71A21", description: "Training video library" },
    { id: 3, name: "Machine Manuals", icon: "cog", color: "#8B5CF6", description: "Equipment documentation" },
    { id: 4, name: "Safety Guides", icon: "shield-checkmark", color: "#10B981", description: "Safety protocols & guidelines" },
];

const MOCK_RESOURCES = [
    {
        id: 1,
        title: "Opening Checklist SOP",
        type: "PDF",
        category: "Standard SOPs",
        timestamp: new Date().toISOString(),
        description: "Complete store opening procedure checklist including equipment startup and safety checks"
    },
    {
        id: 2,
        title: "EMIRATES Recipe v2.0",
        type: "Document",
        category: "Recipes",
        timestamp: new Date(Date.now() - 86400000).toISOString(),
        description: "Official EMIRATES recipe with exact measurements, timing, and presentation guidelines"
    },
    {
        id: 3,
        title: "Daily Cleaning Guidelines",
        type: "Document",
        category: "Operations",
        timestamp: new Date(Date.now() - 172800000).toISOString(),
        description: "Step-by-step cleaning procedures for all store areas and equipment"
    },
    {
        id: 4,
        title: "Espresso Machine Training",
        type: "Video",
        category: "Training",
        timestamp: new Date(Date.now() - 259200000).toISOString(),
        description: "Complete training video for espresso machine operation and maintenance"
    },
    {
        id: 5,
        title: "Customer Complaint Handling",
        type: "PDF",
        category: "Service",
        timestamp: new Date(Date.now() - 345600000).toISOString(),
        description: "Guidelines for handling customer complaints professionally and effectively"
    },
    {
        id: 6,
        title: "Food Safety Certification Guide",
        type: "PDF",
        category: "Safety",
        timestamp: new Date(Date.now() - 432000000).toISOString(),
        description: "Complete food safety and hygiene certification training material"
    },
    {
        id: 7,
        title: "POS System Quick Reference",
        type: "Document",
        category: "Operations",
        timestamp: new Date(Date.now() - 518400000).toISOString(),
        description: "Quick reference guide for the point-of-sale system features and common operations"
    },
];

const MOCK_CONTENT = {
    // Individual Resource Content
    "Opening Checklist SOP": `# Opening Checklist SOP\n\n## Pre-Opening (7:30 AM)\n- Unlock store and disarm security\n- Turn on all lights and HVAC\n- Check refrigerator temperatures (must be below 40°F)\n- Inspect service equipment for cleanliness\n\n## Equipment Startup (7:45 AM)\n- Power on POS systems\n- Start service equipment preheating\n- Prepare espresso machine\n- Stock batter dispensers\n\n## Final Checks (8:00 AM)\n- Verify cash drawer amounts\n- Check menu board displays\n- Ensure utensils are stocked\n- Open doors for business`,

    "EMIRATES Recipe v2.0": `# EMIRATES Recipe v2.0\n\n## Ingredients (12 servings)\n- 2 cups all-purpose flour\n- 2 tablespoons sugar\n- 4 teaspoons baking powder\n- 2 large eggs (separated)\n- 1.5 cups whole milk\n- 1/2 cup melted butter\n- 1 teaspoon vanilla extract\n\n## Preparation\n1. Preheat service equipment to 375°F\n2. Mix dry ingredients in large bowl\n3. Beat egg whites until stiff peaks form\n4. Combine wet ingredients with yolks\n5. Fold in egg whites gently\n6. Cook 4-5 minutes until golden brown\n\n## Presentation Standards\n- Serve within 2 minutes of cooking\n- Add toppings in specified order\n- Use branded serving plate`,

    "Daily Cleaning Guidelines": `# Daily Cleaning Guidelines\n\n## Morning Shift\n- Sanitize all prep surfaces\n- Clean coffee equipment\n- Wipe down dining tables\n- Stock cleaning supplies\n\n## Afternoon Shift\n- Mid-day floor sweep\n- Restroom check and restock\n- Counter and display cleaning\n- Empty waste bins if 75% full\n\n## Closing Shift (9:00 PM)\n- Deep clean service equipment\n- Drain and clean coffee machines\n- Mop all floor areas\n- Sanitize all door handles\n- Take out trash and recycling`,

    "Espresso Machine Training": `# Espresso Machine Training\n\n## Machine Components\n- Portafilter and basket\n- Steam wand for milk frothing\n- Drip tray and water reservoir\n- Pressure gauge (9-10 bar optimal)\n\n## Making Espresso\n1. Grind fresh beans (18g dose)\n2. Distribute and tamp evenly (30lbs pressure)\n3. Lock portafilter and start extraction\n4. Target 25-30 second extraction time\n5. Yield: 36-40ml double shot\n\n## Milk Steaming\n- Use cold milk, 34-38°F\n- Steam to 140-150°F\n- Create microfoam for lattes\n- Swirl to integrate foam`,

    "Customer Complaint Handling": `# Customer Complaint Handling\n\n## LEARN Method\n- Listen actively without interrupting\n- Empathize with their situation\n- Apologize sincerely (not blame)\n- React with a solution\n- Notify manager if escalation needed\n\n## Common Resolutions\n- Remake order at no charge\n- Offer complimentary item\n- Provide discount on next visit\n- Gift card for major issues\n\n## Documentation\n- Log all complaints in system\n- Note resolution provided\n- Follow up if contact given`,

    "Food Safety Certification Guide": `# Food Safety Certification\n\n## Temperature Guidelines\n- Cold foods: Below 40°F (4°C)\n- Hot foods: Above 140°F (60°C)\n- Danger zone: 40-140°F\n\n## Hand Washing Protocol\n- Wet hands with warm water\n- Apply soap, scrub 20 seconds\n- Rinse thoroughly\n- Dry with single-use towel\n- Required: Before food handling, after breaks, after touching face/hair\n\n## Allergen Awareness\n- Common allergens: Gluten, Dairy, Eggs, Nuts\n- Always ask about allergies\n- Use separate equipment when possible\n- Never guess—verify with kitchen`,

    "POS System Quick Reference": `# POS System Quick Reference\n\n## Basic Operations\n- Login with badge scan\n- Select items from menu screen\n- Apply discounts with manager PIN\n- Process payments (card/cash/mobile)\n\n## Common Tasks\n- Split check: Order > Split\n- Void item: Hold item > Void\n- Refund: Manager > Refunds\n- Print receipt: Complete > Print\n\n## Troubleshooting\n- Frozen screen: Hold power 10 sec\n- Printer jam: Open lid, clear paper\n- Card reader error: Restart terminal\n- Call IT for persistent issues`,

    // CATEGORY OVERVIEWS
    "Standard SOPs Overview": `# Standard SOPs Category\n\n## Overview\nAccess all standard operating procedures for daily store operations, from opening to closing.\n\n## Contents\n- Opening & Closing Checklists\n- Cash Handling Procedures\n- Inventory Management\n- Shift Changeover Protocol\n\n## Compliance\nAll team members must review SOPs quarterly. Updates are highlighted in yellow.`,

    "Video Tutorials Overview": `# Video Tutorials Library\n\n## Training Modules\nComprehensive video guides for skill development and certification.\n\n## Available Videos\n- New Hire Orientation (45 min)\n- Espresso Mastery Course (30 min)\n- Customer Service Excellence (25 min)\n- Safety and Hygiene (20 min)\n\n## Completion Tracking\nYour progress is tracked automatically. Certificates issued upon completion.`,

    "Machine Manuals Overview": `# Machine Manuals\n\n## Equipment Documentation\nTechnical manuals and maintenance guides for all store equipment.\n\n## Covered Equipment\n- service equipment (Model X-500)\n- Espresso Machine (Breville Pro)\n- Commercial Refrigerators\n- Ice Machines\n- HVAC Control Systems\n\n## Maintenance Schedules\nFollow weekly, monthly, and quarterly maintenance checklists.`,

    "Safety Guides Overview": `# Safety Guides\n\n## Overview\nEssential safety protocols and emergency procedures for all staff members.\n\n## Key Topics\n- Fire Safety & Evacuation\n- First Aid Basics\n- Food Allergen Handling\n- Slip & Fall Prevention\n- Equipment Safety\n\n## Emergency Contacts\n- Fire: 911\n- Manager On-Call: See schedule\n- Corporate Safety: 1-800-555-SAFE`,
};

const MANDATORY_MODULES = [
    { id: 1, name: "Batter Preparation", icon: "flask-outline", count: 4, color: "#D71A21" },
    { id: 2, name: "Flight Safety", icon: "grid-outline", count: 6, color: "#8B5CF6" },
    { id: 3, name: "Topping Application", icon: "color-palette-outline", count: 5, color: "#EF4444" },
    { id: 4, name: "Equipment Care", icon: "build-outline", count: 8, color: "#10B981" },
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
                            <Feather name="download" size={20} color="#D71A21" />
                            <Text style={styles.footerBtnText}>Download</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.footerBtn}>
                            <Feather name="share-2" size={20} color="#D71A21" />
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
    const [loading, setLoading] = useState(true);

    // Fetch real resources from backend
    useEffect(() => {
        fetchResources();
    }, []);

    const fetchResources = async () => {
        try {
            setLoading(true);
            const res = await fetch(`${API_URL}/api/v1/content/resources/all`);
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
                // Transform backend data to match our UI structure
                const transformedResources = data.map(item => ({
                    id: item.id,
                    title: item.title,
                    type: item.type || (item.file_url?.includes('.mp4') ? 'Video' :
                        item.file_url?.includes('.pdf') ? 'PDF' : 'Document'),
                    category: item.category || 'General',
                    timestamp: item.timestamp || new Date().toISOString(),
                    description: item.description || '',
                    file_url: item.file_url,
                }));
                setResources(transformedResources);
            }

            // Also fetch categories
            const catRes = await fetch(`${API_URL}/api/v1/content/resources/categories`);
            const catData = await catRes.json();
            if (Array.isArray(catData) && catData.length > 0) {
                setCategories(catData.map(cat => ({
                    id: cat.id,
                    name: cat.name,
                    icon: cat.icon || "folder",
                    color: Array.isArray(cat.color) ? cat.color[0] : (cat.color || "#D71A21"),
                })));
            }
        } catch (err) {
            console.log("Using mock data:", err.message);
            // Keep mock data on error
        } finally {
            setLoading(false);
        }
    };

    // Filter resources and categories based on search
    const filteredCategories = React.useMemo(() => {
        if (!search.trim()) return categories;
        const searchLower = search.toLowerCase().trim();
        return categories.filter(cat =>
            cat.name.toLowerCase().includes(searchLower)
        );
    }, [categories, search]);

    const filteredResources = React.useMemo(() => {
        if (!search.trim()) return resources;
        const searchLower = search.toLowerCase().trim();
        return resources.filter(res =>
            res.title.toLowerCase().includes(searchLower) ||
            res.category?.toLowerCase().includes(searchLower) ||
            res.type?.toLowerCase().includes(searchLower) ||
            res.description?.toLowerCase().includes(searchLower)
        );
    }, [resources, search]);

    const filteredModules = React.useMemo(() => {
        if (!search.trim()) return MANDATORY_MODULES;
        const searchLower = search.toLowerCase().trim();
        return MANDATORY_MODULES.filter(mod =>
            mod.name.toLowerCase().includes(searchLower)
        );
    }, [search]);

    const hasResults = filteredCategories.length > 0 || filteredResources.length > 0 || filteredModules.length > 0;

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
            {/* Floating AirplaneS */}
            <FloatingAirplane delay={0} duration={8} startX={50} startY={100} />
            <FloatingAirplane delay={2} duration={10} startX={width - 80} startY={200} />
            <FloatingAirplane delay={4} duration={7} startX={30} startY={height - 300} />
            <FloatingAirplane delay={1} duration={9} startX={width - 100} startY={height - 400} />

            <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
                {/* HEADER */}
                <View style={styles.header}>
                    <Text style={styles.pageTitle}>Knowledge Base</Text>
                    <View style={styles.aiBadge}>
                        <MaterialCommunityIcons name="star-four-points" size={12} color="#D71A21" />
                        <Text style={styles.aiBadgeText}>AI Powered</Text>
                    </View>
                </View>

                {/* SEARCH */}
                <View style={styles.searchSection}>
                    <View style={[styles.searchBox, search.length > 0 && { borderColor: '#D71A21', borderWidth: 2 }]}>
                        <MaterialCommunityIcons name="magnify" size={24} color="#D71A21" />
                        <TextInput
                            placeholder="Search SOPs, recipes, guides..."
                            style={styles.input}
                            placeholderTextColor="#9CA3AF"
                            value={search}
                            onChangeText={setSearch}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                        {search ? (
                            <TouchableOpacity onPress={() => setSearch('')}>
                                <Feather name="x-circle" size={20} color="#9CA3AF" />
                            </TouchableOpacity>
                        ) : null}
                    </View>
                    {search.length > 0 && (
                        <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 8, marginLeft: 4 }}>
                            {filteredResources.length + filteredCategories.length + filteredModules.length} results for "{search}"
                        </Text>
                    )}
                </View>

                {/* NO RESULTS */}
                {search.length > 0 && !hasResults && (
                    <Animated.View entering={FadeInDown} style={styles.noResultsContainer}>
                        <MaterialCommunityIcons name="file-search-outline" size={64} color="#D1D5DB" />
                        <Text style={styles.noResultsTitle}>No results found</Text>
                        <Text style={styles.noResultsText}>
                            Try searching with different keywords or check the spelling
                        </Text>
                        <TouchableOpacity
                            style={styles.clearSearchBtn}
                            onPress={() => setSearch('')}
                        >
                            <Feather name="x" size={16} color="#D71A21" />
                            <Text style={styles.clearSearchText}>Clear Search</Text>
                        </TouchableOpacity>
                    </Animated.View>
                )}

                {/* CATEGORIES */}
                {filteredCategories.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Resource Categories</Text>
                        {filteredCategories.map((cat, index) => (
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
                )}

                {/* LEARNING BREAKDOWN - only show when not searching or has matches */}
                {filteredModules.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Learning Breakdown</Text>
                        <Text style={styles.sectionSubtitle}>Aviation Safety & Flight Operations Framework</Text>
                        <View style={styles.modulesGrid}>
                            {filteredModules.map((mod, index) => (
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
                )}

                {/* RECENT RESOURCES */}
                {filteredResources.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>
                            {search.length > 0 ? 'Matching Resources' : 'Recently Added'}
                        </Text>
                        {filteredResources.map((item, index) => (
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
                )}
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
    FloatingAirplane: {
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
        color: "#D71A21",
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
        shadowColor: "#D71A21",
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
        shadowColor: "#D71A21",
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
        color: "#D71A21",
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
        color: '#D71A21',
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
        backgroundColor: '#D71A21',
    },
    footerBtnText: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#D71A21',
    },
    // No Results Styles
    noResultsContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
        marginTop: 20,
    },
    noResultsTitle: {
        fontSize: 18,
        fontFamily: 'Poppins_600SemiBold',
        color: '#374151',
        marginTop: 16,
        marginBottom: 8,
    },
    noResultsText: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        color: '#9CA3AF',
        textAlign: 'center',
        marginBottom: 20,
    },
    clearSearchBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FEF3C7',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 12,
        gap: 6,
    },
    clearSearchText: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#D71A21',
    },
});