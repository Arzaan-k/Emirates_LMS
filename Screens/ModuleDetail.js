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
    "Flight Prep & Service": {
        title: "Flight Prep & Service",
        description: "Consistency is key to a perfect EMIRATES EXPERIENCE.",
        color: ["#EC4899", "#DB2777"],
        steps: [
            { id: 1, title: "Cabin Readiness", detail: "Ensure all safety equipment is per list and galley is secured." },
            { id: 2, title: "Meal Service Prep", detail: "Sift through special meal requests and verify stock against manifest." },
            { id: 3, title: "Presentation", detail: "Ensure all service trays are set to Emirates premium standards." },
            { id: 4, title: "Final Walkthrough", detail: "Check cabin for any loose items before passenger boarding." }
        ],
        tips: ["Consistency is key", "Attention to detail is paramount", "Smiles are part of the uniform"]
    },
    "Safety Procedure Standards": {
        title: "Safety Procedure Standards",
        description: "Master the art of passenger safety and cabin management.",
        color: ["#D71A21", "#B91C1C"],
        steps: [
            { id: 1, title: "Exit Checking", detail: "Doors must be armed and secondary checks completed before departure." },
            { id: 2, title: "Standard Seating Protocol", detail: "Ensure all passengers are seated and belts fastened before cabin secure signal." },
            { id: 3, title: "Lighting Control", detail: "Dim cabin lights to appropriate level for the phase of flight." },
            { id: 4, title: "Communications", detail: "Ensure intercom is clear for pilot announcements." }
        ],
        tips: ["Safety first, always", "Be observant", "Follow the checklist"]
    },
    "Premium Cabin Aesthetics": {
        title: "Premium Cabin Aesthetics",
        description: "Emirates First Class cabin standards framework.",
        color: ["#8B5CF6", "#7C3AED"],
        steps: [
            { id: 1, title: "Suite Setup", detail: "Check pajamas, slippers, and amenity kits are perfectly aligned in the suite." },
            { id: 2, title: "Sanitization Review", detail: "Ensure the A380 Shower Spa is pristine and towels are rolled correctly." },
            { id: 3, title: "Safety Briefing", detail: "Perform the safety demonstration clearly and ensure all emergency cards are in seat pockets." },
            { id: 4, title: "Ambient Lighting", detail: "Set the mood lighting to 'Starry Night' for long-haul overnight sectors." }
        ],
        tips: ["Excellence in every interaction", "Anticipate passenger needs", "Maintain discretion"]
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
                            <MaterialCommunityIcons name="lightbulb-on" size={18} color="#D71A21" />
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
