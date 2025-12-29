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
import { useLanguage } from "../context/language.context";

const { width } = Dimensions.get("window");

const HIERARCHY = [
    { role: "CEO & Founder", name: "Sagar Daryani", icon: "crown", color: "#9333EA", bg: "#F3E8FF" },
    { role: "Chief Operating Officer", name: "COO Name", icon: "briefcase", color: "#2563EB", bg: "#DBEAFE" },
    { role: "Operations Manager", name: "Ops Manager Name", icon: "account-cog", color: "#0891B2", bg: "#CFFAFE" },
    { role: "Regional Manager", name: "Regional Manager", icon: "map-marker-radius", color: "#059669", bg: "#D1FAE5" },
    { role: "Area Manager", name: "Area Manager", icon: "store", color: "#D97706", bg: "#FEF3C7" },
    { role: "Store Manager", name: "Aditya User", icon: "account-star", color: "#E11D48", bg: "#FFE4E6", current: true },
];

export default function Hierarchy({ navigation }) {
    const insets = useSafeAreaInsets();
    const { t } = useLanguage();

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            {/* HEADER */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                    <Feather name="arrow-left" size={24} color="#374151" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{t('orgHierarchy') || 'Organizational Hierarchy'}</Text>
                <Text style={styles.headerSub}>View your reporting structure and leadership</Text>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20 }}>
                <View style={styles.hierarchyContainer}>
                    {HIERARCHY.map((item, index) => (
                        <View key={index} style={styles.hierarchyItemRow}>
                            {/* Line and Connector */}
                            <View style={styles.connectorContainer}>
                                <View style={[styles.hierarchyPoint, { backgroundColor: item.color }]} />
                                {index !== HIERARCHY.length - 1 && (
                                    <View style={[styles.connectorLine, { backgroundColor: item.color + '40' }]} />
                                )}
                            </View>
                            
                            {/* Card */}
                            <View style={[styles.hierarchyCard, item.current && styles.currentRoleCard]}>
                                <View style={[styles.hierarchyIconCircle, { backgroundColor: item.bg }]}>
                                    <MaterialCommunityIcons name={item.icon} size={20} color={item.color} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.hierarchyRole}>{item.role}</Text>
                                    <Text style={styles.hierarchyName}>{item.name}</Text>
                                </View>
                                {item.current && (
                                    <View style={styles.youBadge}>
                                        <Text style={styles.youBadgeText}>YOU</Text>
                                    </View>
                                )}
                            </View>
                        </View>
                    ))}
                </View>

                {/* INFO BOX */}
                <View style={styles.infoBox}>
                    <Feather name="info" size={20} color="#3B82F6" />
                    <Text style={styles.infoText}>
                        This hierarchy represents the official reporting structure for your region. Contact HR for any discrepancies.
                    </Text>
                </View>
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
        padding: 20,
        backgroundColor: "#FFF",
        borderBottomWidth: 1,
        borderBottomColor: "#E5E7EB",
    },
    backBtn: {
        marginBottom: 12,
    },
    headerTitle: {
        fontSize: 22,
        fontFamily: "Poppins_700Bold",
        color: "#111827",
    },
    headerSub: {
        fontSize: 14,
        fontFamily: "Poppins_400Regular",
        color: "#6B7280",
    },
    hierarchyContainer: {
        backgroundColor: "#FFF",
        borderRadius: 24,
        padding: 20,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 2,
    },
    hierarchyItemRow: {
        flexDirection: 'row',
        alignItems: 'flex-start'
    },
    connectorContainer: {
        alignItems: 'center',
        width: 24,
        marginRight: 12
    },
    hierarchyPoint: {
        width: 12,
        height: 12,
        borderRadius: 6,
        zIndex: 1,
        marginTop: 18
    },
    connectorLine: {
        width: 2,
        flex: 1,
        position: 'absolute',
        top: 30,
        bottom: -10
    },
    hierarchyCard: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 16,
        backgroundColor: '#F9FAFB',
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#F3F4F6',
    },
    currentRoleCard: {
        backgroundColor: '#FFF',
        borderWidth: 1,
        borderColor: '#FFE4E6',
        shadowColor: "#E11D48",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 6,
        elevation: 3,
    },
    hierarchyIconCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12
    },
    hierarchyRole: {
        fontSize: 10,
        fontFamily: "Poppins_700Bold",
        color: "#6B7280",
        textTransform: 'uppercase',
        letterSpacing: 0.5
    },
    hierarchyName: {
        fontSize: 14,
        fontFamily: "Poppins_600SemiBold",
        color: "#111827"
    },
    youBadge: {
        backgroundColor: "#FFE4E6",
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 8
    },
    youBadgeText: {
        fontSize: 10,
        fontFamily: "Poppins_700Bold",
        color: "#E11D48"
    },
    infoBox: {
        flexDirection: 'row',
        backgroundColor: '#EFF6FF',
        padding: 16,
        borderRadius: 16,
        marginTop: 20,
        alignItems: 'center',
    },
    infoText: {
        flex: 1,
        marginLeft: 12,
        fontSize: 13,
        color: '#1E40AF',
        fontFamily: 'Poppins_400Regular',
    },
});
