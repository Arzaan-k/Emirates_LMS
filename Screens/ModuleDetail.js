import React from "react";
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Dimensions,
} from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";

const { width } = Dimensions.get("window");

const MODULE_CONTENT = {
    "Batter Preparation": {
        title: "Batter Preparation",
        description: "Consistency is key to a perfect Belgian Waffle.",
        color: ["#EC4899", "#DB2777"],
        steps: [
            { id: 1, title: "Ingredient Quality Check", detail: "Ensure milk, eggs, and butter are fresh and at room temperature before mixing." },
            { id: 2, title: "The Dry Mix", detail: "Sift flour, sugar, and baking powder together to avoid lumps in the batter." },
            { id: 3, title: "Whisking Efficiency", detail: "Whisk egg whites until stiff peaks form before folding into the wet-dry mixture." },
            { id: 4, title: "Resting Period", detail: "Let the batter rest for at least 15 minutes to allow the gluten to relax." }
        ],
        tips: ["Never over-mix the batter", "Check expiry dates daily", "Maintain batter temperature at 4°C"]
    },
    "Waffle Baking Standards": {
        title: "Waffle Baking Standards",
        description: "Master the art of the perfect golden-brown crisp.",
        color: ["#F59E0B", "#D97706"],
        steps: [
            { id: 1, title: "Pre-heating", detail: "Irons must reach exactly 210°C before the first pour." },
            { id: 2, title: "Standard Portioning", detail: "Use the 180ml scoop for standard waffles to ensure zero wastage." },
            { id: 3, title: "The Flip", detail: "Flip the iron within 3 seconds of closing to ensure even batter distribution." },
            { id: 4, title: "Golden Standard", detail: "Bake for 3m 45s until the external steam stops completely." }
        ],
        tips: ["Clean irons between every bake", "Use non-stick spray sparingly", "Listen for the timer beep"]
    },
    "Topping Application": {
        title: "Topping Application",
        description: "Aesthetics and portion control framework.",
        color: ["#8B5CF6", "#7C3AED"],
        steps: [
            { id: 1, title: "Base Spreading", detail: "Apply chocolate or Nutella in a zigzag pattern covering 90% of the surface." },
            { id: 2, title: "Fruit Placement", detail: "Add 5 slices of banana or strawberry, evenly spaced across the quadrants." },
            { id: 3, title: "Drizzling Technique", detail: "Hold the sauce bottle 10cm above the waffle for a clean, professional finish." },
            { id: 4, title: "Final Dusting", detail: "A light dusting of icing sugar from the sifter to enhance visual contrast." }
        ],
        tips: ["Always use chilled cream", "Check topping freshness every 2 hours", "Maintain clean garnish stations"]
    },
    "Equipment Maintenance": {
        title: "Equipment Maintenance",
        description: "Keep the machinery running at peak performance.",
        color: ["#3B82F6", "#2563EB"],
        steps: [
            { id: 1, title: "Daily Cleaning", detail: "Remove carbon buildup from iron plates using the specialized wire brush." },
            { id: 2, title: "Weekly Deep Clean", detail: "De-grease the external housing and check electrical cords for wear." },
            { id: 3, title: "Temp Calibration", detail: "Use a digital thermometer to verify iron accuracy every Monday morning." },
            { id: 4, title: "Safe Shutdown", detail: "Follow the 5-step power-down sequence to ensure heating elements longevity." }
        ],
        tips: ["Report any odd noises immediately", "Never use metal scrapers on non-stick surfaces", "Update maintenance log daily"]
    }
};

export default function ModuleDetail({ route, navigation }) {
    const { moduleName } = route.params;
    const content = MODULE_CONTENT[moduleName] || MODULE_CONTENT["Batter Preparation"];
    const insets = useSafeAreaInsets();

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            {/* HEADER */}
            <LinearGradient colors={content.color} style={styles.header}>
                <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                    <Feather name="arrow-left" size={24} color="#FFF" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{content.title}</Text>
                <Text style={styles.headerSub}>{content.description}</Text>
            </LinearGradient>

            <ScrollView contentContainerStyle={{ padding: 20 }}>
                <Text style={styles.sectionTitle}>Process Workflow</Text>
                {content.steps.map((step) => (
                    <View key={step.id} style={styles.stepCard}>
                        <View style={[styles.stepNumber, { backgroundColor: content.color[0] }]}>
                            <Text style={styles.stepNumText}>{step.id}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.stepTitle}>{step.title}</Text>
                            <Text style={styles.stepDetail}>{step.detail}</Text>
                        </View>
                    </View>
                ))}

                <View style={styles.tipsSection}>
                    <Text style={styles.sectionTitle}>Pro Tips</Text>
                    {content.tips.map((tip, idx) => (
                        <View key={idx} style={styles.tipRow}>
                            <MaterialCommunityIcons name="lightbulb-on" size={18} color="#F59E0B" />
                            <Text style={styles.tipText}>{tip}</Text>
                        </View>
                    ))}
                </View>

                <TouchableOpacity style={[styles.completeBtn, { backgroundColor: content.color[1] }]} onPress={() => navigation.back()}>
                    <Text style={styles.completeBtnText}>Mark as Completed</Text>
                </TouchableOpacity>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#F9FAFB",
    },
    header: {
        padding: 24,
        borderBottomLeftRadius: 30,
        borderBottomRightRadius: 30,
        paddingTop: 40,
    },
    backBtn: {
        marginBottom: 20,
    },
    headerTitle: {
        fontSize: 24,
        fontFamily: "Poppins_700Bold",
        color: "#FFF",
        marginBottom: 8,
    },
    headerSub: {
        fontSize: 14,
        fontFamily: "Poppins_400Regular",
        color: "rgba(255,255,255,0.8)",
    },
    sectionTitle: {
        fontSize: 18,
        fontFamily: "Poppins_700Bold",
        color: "#111827",
        marginBottom: 16,
        marginTop: 10,
    },
    stepCard: {
        flexDirection: 'row',
        backgroundColor: '#FFF',
        padding: 16,
        borderRadius: 16,
        marginBottom: 12,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 2,
    },
    stepNumber: {
        width: 28,
        height: 28,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
        marginTop: 2,
    },
    stepNumText: {
        color: '#FFF',
        fontSize: 14,
        fontFamily: 'Poppins_700Bold',
    },
    stepTitle: {
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
        color: '#111827',
        marginBottom: 4,
    },
    stepDetail: {
        fontSize: 13,
        color: '#6B7280',
        fontFamily: 'Poppins_400Regular',
        lineHeight: 18,
    },
    tipsSection: {
        marginTop: 20,
        backgroundColor: '#FFFBEB',
        padding: 16,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#FEF3C7',
    },
    tipRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    tipText: {
        fontSize: 13,
        color: '#92400E',
        fontFamily: 'Poppins_500Medium',
        marginLeft: 10,
        flex: 1,
    },
    completeBtn: {
        marginTop: 30,
        height: 55,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 40,
    },
    completeBtnText: {
        color: '#FFF',
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
    },
});
