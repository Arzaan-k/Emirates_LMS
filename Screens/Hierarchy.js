import React, { useState, useEffect } from "react";
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Dimensions,
    ActivityIndicator,
} from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useLanguage } from "../context/language.context";
import API_URL from '../config';

const { width } = Dimensions.get("window");

// Fallback static hierarchy (used if API fails)
const FALLBACK_HIERARCHY = [
    { role: "Ops Manager", name: "Operations Manager", icon: "account-cog", color: "#9333EA", bg: "#F3E8FF" },
    { role: "City Manager", name: "City Manager", icon: "city", color: "#2563EB", bg: "#DBEAFE" },
    { role: "Area Manager", name: "Area Manager", icon: "map-marker-radius", color: "#059669", bg: "#D1FAE5" },
    { role: "Store Manager", name: "Store Manager", icon: "store", color: "#D97706", bg: "#FEF3C7" },
    { role: "Gold Waffler", name: "Gold Waffler", icon: "medal", color: "#F59E0B", bg: "#FEF3C7" },
    { role: "Silver Waffler", name: "Silver Waffler", icon: "medal-outline", color: "#9CA3AF", bg: "#F3F4F6" },
    { role: "Waffler", name: "Waffler", icon: "account", color: "#6B7280", bg: "#F9FAFB" },
];

export default function Hierarchy({ navigation, route }) {
    const insets = useSafeAreaInsets();
    const { t } = useLanguage();
    const userProfile = route?.params?.userProfile || { role: 'Waffler' };

    const [hierarchy, setHierarchy] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchHierarchy();
    }, []);

    const fetchHierarchy = async () => {
        try {
            const res = await fetch(`${API_URL}/api/v1/levels/hierarchy`);
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
                // Add bg color based on color if not present
                const processedData = data.map(item => ({
                    ...item,
                    bg: item.bg || `${item.color}20`, // Use color with 20% opacity as bg
                    current: item.role === userProfile.role
                }));
                setHierarchy(processedData);
            } else {
                // Use fallback with current user marked
                setHierarchy(FALLBACK_HIERARCHY.map(item => ({
                    ...item,
                    current: item.role === userProfile.role
                })));
            }
        } catch (e) {
            console.error('Error fetching hierarchy:', e);
            // Use fallback
            setHierarchy(FALLBACK_HIERARCHY.map(item => ({
                ...item,
                current: item.role === userProfile.role
            })));
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <View style={[styles.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color="#F59E0B" />
                <Text style={{ marginTop: 12, fontFamily: 'Poppins_500Medium', color: '#6B7280' }}>Loading hierarchy...</Text>
            </View>
        );
    }

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
                    {hierarchy.map((item, index) => (
                        <View key={item.id || index} style={styles.hierarchyItemRow}>
                            {/* Line and Connector */}
                            <View style={styles.connectorContainer}>
                                <View style={[styles.hierarchyPoint, { backgroundColor: item.color }]} />
                                {index !== hierarchy.length - 1 && (
                                    <View style={[styles.connectorLine, { backgroundColor: item.color + '40' }]} />
                                )}
                            </View>

                            {/* Card */}
                            <View style={[styles.hierarchyCard, item.current && styles.currentRoleCard]}>
                                <View style={[styles.hierarchyIconCircle, { backgroundColor: item.bg }]}>
                                    <MaterialCommunityIcons name={item.icon || "account"} size={20} color={item.color} />
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

                {/* LEVEL PROGRESSION INFO */}
                <View style={styles.levelInfoCard}>
                    <LinearGradient
                        colors={["#F59E0B", "#D97706"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.levelInfoGradient}
                    >
                        <MaterialCommunityIcons name="trending-up" size={24} color="#FFF" />
                        <View style={{ marginLeft: 12, flex: 1 }}>
                            <Text style={styles.levelInfoTitle}>Level Progression</Text>
                            <Text style={styles.levelInfoSub}>
                                Complete courses to advance from Waffler → Silver → Gold
                            </Text>
                        </View>
                    </LinearGradient>
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
        borderWidth: 2,
        borderColor: '#F59E0B',
        shadowColor: "#F59E0B",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
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
        backgroundColor: "#FEF3C7",
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 8
    },
    youBadgeText: {
        fontSize: 10,
        fontFamily: "Poppins_700Bold",
        color: "#D97706"
    },
    levelInfoCard: {
        marginTop: 20,
        borderRadius: 16,
        overflow: 'hidden',
    },
    levelInfoGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
    },
    levelInfoTitle: {
        fontSize: 14,
        fontFamily: "Poppins_700Bold",
        color: "#FFF",
    },
    levelInfoSub: {
        fontSize: 12,
        fontFamily: "Poppins_400Regular",
        color: "rgba(255,255,255,0.9)",
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
