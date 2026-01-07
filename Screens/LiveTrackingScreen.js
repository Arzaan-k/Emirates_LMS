import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Dimensions,
    ScrollView,
    ActivityIndicator,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import API_URL from '../config';

const { width, height } = Dimensions.get('window');

export default function LiveTrackingScreen({ navigation }) {
    const insets = useSafeAreaInsets();
    const [locations, setLocations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [region, setRegion] = useState({
        latitude: 19.0760, // Mumbai default
        longitude: 72.8777,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
    });

    useEffect(() => {
        fetchLocations(); // Initial fetch

        const interval = setInterval(fetchLocations, 10000); // Poll every 10s
        return () => clearInterval(interval);
    }, []);

    const fetchLocations = async () => {
        try {
            const res = await fetch(`${API_URL}/location/all`);
            const data = await res.json();
            setLocations(data);

            // Center map on first active location
            if (data.length > 0 && data[0].latitude) {
                setRegion({
                    latitude: data[0].latitude,
                    longitude: data[0].longitude,
                    latitudeDelta: 0.05,
                    longitudeDelta: 0.05,
                });
            }
        } catch (err) {
            console.error('Failed to fetch locations:', err);
        } finally {
            setLoading(false);
        }
    };

    const activeCount = locations.filter(l => l.active).length;

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            {/* PREMIUM WHITE GRADIENT BACKGROUND */}
            <LinearGradient
                colors={['#FFFFFF', '#FFFBEB', '#FEF3C7']}
                style={StyleSheet.absoluteFill}
            />

            {/* HEADER */}
            <Animated.View entering={FadeInDown} style={styles.header}>
                <TouchableOpacity
                    style={styles.backBtn}
                    onPress={() => navigation.goBack()}
                >
                    <Feather name="arrow-left" size={24} color="#111827" />
                </TouchableOpacity>

                <View style={styles.headerInfo}>
                    <Text style={styles.title}>Live Employee Tracking</Text>
                    <View style={styles.activeIndicator}>
                        <View style={styles.pulseDot} />
                        <Text style={styles.activeText}>{activeCount} active</Text>
                    </View>
                </View>

                <TouchableOpacity style={styles.refreshBtn} onPress={fetchLocations}>
                    <Feather name="refresh-cw" size={20} color="#F59E0B" />
                </TouchableOpacity>
            </Animated.View>

            {/* MAP */}
            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#F59E0B" />
                    <Text style={styles.loadingText}>Loading locations...</Text>
                </View>
            ) : locations.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <View style={styles.emptyIcon}>
                        <MaterialCommunityIcons name="map-marker-off" size={64} color="#D1D5DB" />
                    </View>
                    <Text style={styles.emptyTitle}>No Active Tracking</Text>
                    <Text style={styles.emptyText}>
                        No employees have enabled location sharing yet.
                    </Text>
                </View>
            ) : (
                <View style={styles.mapContainer}>
                    <MapView
                        style={styles.map}
                        region={region}
                        onRegionChangeComplete={setRegion}
                    >
                        {locations.map((loc) => (
                            <Marker
                                key={loc.user_id}
                                coordinate={{
                                    latitude: loc.latitude,
                                    longitude: loc.longitude,
                                }}
                                title={loc.name}
                                description={`Last updated: ${new Date(loc.timestamp).toLocaleTimeString()}`}
                                pinColor={loc.active ? "#10B981" : "#9CA3AF"}
                            >
                                <View style={[
                                    styles.customMarker,
                                    { backgroundColor: loc.active ? '#10B981' : '#9CA3AF' }
                                ]}>
                                    <Feather name="user" size={16} color="#FFF" />
                                </View>
                            </Marker>
                        ))}
                    </MapView>

                    {/* FLOATING LEGEND */}
                    <View style={styles.legend}>
                        <View style={styles.legendItem}>
                            <View style={[styles.legendDot, { backgroundColor: '#10B981' }]} />
                            <Text style={styles.legendText}>Active Tracking</Text>
                        </View>
                        <View style={styles.legendItem}>
                            <View style={[styles.legendDot, { backgroundColor: '#9CA3AF' }]} />
                            <Text style={styles.legendText}>Inactive</Text>
                        </View>
                    </View>
                </View>
            )}

            {/* EMPLOYEE LIST */}
            {locations.length > 0 && (
                <View style={styles.listContainer}>
                    <Text style={styles.listTitle}>Team Locations</Text>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.listScroll}
                    >
                        {locations.map((loc, index) => (
                            <Animated.View
                                key={loc.user_id}
                                entering={FadeInDown.delay(index * 100)}
                                style={[
                                    styles.employeeCard,
                                    !loc.active && styles.employeeCardInactive
                                ]}
                            >
                                <View style={[
                                    styles.cardHeader,
                                    { backgroundColor: loc.active ? '#DCFCE7' : '#F3F4F6' }
                                ]}>
                                    <View style={[
                                        styles.avatar,
                                        { backgroundColor: loc.active ? '#10B981' : '#9CA3AF' }
                                    ]}>
                                        <Text style={styles.avatarText}>
                                            {loc.name.split(' ').map(n => n[0]).join('')}
                                        </Text>
                                    </View>
                                </View>
                                <View style={styles.cardBody}>
                                    <Text style={styles.employeeName}>{loc.name}</Text>
                                    <View style={styles.statusRow}>
                                        <Feather
                                            name={loc.active ? "radio" : "circle"}
                                            size={10}
                                            color={loc.active ? "#10B981" : "#9CA3AF"}
                                        />
                                        <Text style={[
                                            styles.statusText,
                                            { color: loc.active ? "#10B981" : "#9CA3AF" }
                                        ]}>
                                            {loc.active ? 'Tracking' : 'Offline'}
                                        </Text>
                                    </View>
                                    <Text style={styles.timestamp}>
                                        {new Date(loc.timestamp).toLocaleTimeString()}
                                    </Text>
                                </View>
                            </Animated.View>
                        ))}
                    </ScrollView>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 5,
        zIndex: 10,
    },
    backBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#F3F4F6',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerInfo: {
        flex: 1,
        marginLeft: 16,
    },
    title: {
        fontSize: 18,
        fontFamily: 'Poppins_700Bold',
        color: '#111827',
    },
    activeIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 2,
    },
    pulseDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#10B981',
        marginRight: 6,
    },
    activeText: {
        fontSize: 13,
        fontFamily: 'Poppins_500Medium',
        color: '#10B981',
    },
    refreshBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#FEF3C7',
        justifyContent: 'center',
        alignItems: 'center',
    },

    // MAP
    mapContainer: {
        flex: 1,
        margin: 20,
        borderRadius: 24,
        overflow: 'hidden',
        backgroundColor: '#FFF',
        shadowColor: "#F59E0B",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 20,
        elevation: 8,
    },
    map: {
        flex: 1,
    },
    customMarker: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 3,
        borderColor: '#FFF',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 5,
    },
    legend: {
        position: 'absolute',
        bottom: 20,
        right: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderRadius: 16,
        padding: 12,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 4,
    },
    legendDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        marginRight: 8,
    },
    legendText: {
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
        color: '#4B5563',
    },

    // LOADING
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

    // EMPTY STATE
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 40,
    },
    emptyIcon: {
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: '#F9FAFB',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    emptyTitle: {
        fontSize: 20,
        fontFamily: 'Poppins_700Bold',
        color: '#111827',
        marginBottom: 8,
    },
    emptyText: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
        textAlign: 'center',
        lineHeight: 20,
    },

    // EMPLOYEE LIST
    listContainer: {
        paddingVertical: 16,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 10,
    },
    listTitle: {
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
        color: '#111827',
        paddingHorizontal: 20,
        marginBottom: 12,
    },
    listScroll: {
        paddingLeft: 20,
        paddingRight: 20,
        gap: 12,
    },
    employeeCard: {
        width: 160,
        borderRadius: 20,
        backgroundColor: '#FFF',
        overflow: 'hidden',
        shadowColor: "#10B981",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 4,
        marginRight: 12,
    },
    employeeCardInactive: {
        shadowColor: "#9CA3AF",
        opacity: 0.7,
    },
    cardHeader: {
        padding: 16,
        alignItems: 'center',
    },
    avatar: {
        width: 50,
        height: 50,
        borderRadius: 25,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#FFF',
    },
    avatarText: {
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
    },
    cardBody: {
        padding: 12,
        paddingTop: 8,
    },
    employeeName: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#111827',
        marginBottom: 4,
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginBottom: 4,
    },
    statusText: {
        fontSize: 11,
        fontFamily: 'Poppins_500Medium',
    },
    timestamp: {
        fontSize: 10,
        fontFamily: 'Poppins_400Regular',
        color: '#9CA3AF',
    },
});
