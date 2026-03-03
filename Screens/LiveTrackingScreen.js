import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Dimensions,
    ScrollView,
    ActivityIndicator,
    Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import API_URL from '../config';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORE_LOCATIONS = [
    { name: "Chowpatty Seaface", lat: 18.9557, lng: 72.8131, address: "Plot 25B, Fulchand Niwas" },
    { name: "Vile Parle West", lat: 19.1038, lng: 72.8431, address: "Shop 1, Shanti Niketan" },
    { name: "Carter Road", lat: 19.0449, lng: 72.8177, address: "Shop 9/10, Gagangiri Apts" },
    { name: "Kandivali West", lat: 19.2215, lng: 72.8540, address: "Shop 30, Bhoomi Saraswati CHS" },
    { name: "Mumbai Central", lat: 18.9716, lng: 72.8224, address: "Kothari Heights, Lamington Rd" },
    { name: "Dadar West", lat: 19.0208, lng: 72.8407, address: "280, Veer Savarkar Marg" },
    { name: "Juhu", lat: 19.0984, lng: 72.8265, address: "Shop 4, Sagarika Apt" },
    { name: "Kalina", lat: 19.0591, lng: 72.8684, address: "Sumit Artista, Shop 5" },
    { name: "Versova", lat: 19.1293, lng: 72.8157, address: "Fantasy Society" },
    { name: "Malad East", lat: 19.2015, lng: 72.8492, address: "Dhruv Heights, Upper Govind Nagar" },
    { name: "Sion", lat: 19.0297, lng: 72.8540, address: "Basant Court CHS" },
    { name: "Borivali West (Viv)", lat: 19.2318, lng: 72.8573, address: "Mangal Arambh, RM Bhattad Rd" },
    { name: "Borivali West (Sod)", lat: 19.2305, lng: 72.8560, address: "Natraj CHS, Sodawala Ln" },
    { name: "Mazgaon", lat: 18.9812, lng: 72.8314, address: "Shop C-3A, 173 Dr Mascarenhas Rd" }
];

const { width, height } = Dimensions.get('window');

export default function LiveTrackingScreen({ navigation }) {
    const insets = useSafeAreaInsets();
    const webViewRef = useRef(null);
    const [locations, setLocations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [mapReady, setMapReady] = useState(false);
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [region, setRegion] = useState({
        latitude: 19.0760, // Mumbai default
        longitude: 72.8777,
        zoom: 12,
    });

    useEffect(() => {
        fetchLocations(); // Initial fetch

        const interval = setInterval(fetchLocations, 10000); // Poll every 10s
        return () => clearInterval(interval);
    }, []);

    // [NEW] Web Support: Listen for map messages
    useEffect(() => {
        if (Platform.OS === 'web') {
            const handleWebMessage = (event) => {
                try {
                    const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                    if (data?.type === 'mapReady') {
                        console.log('[React Web] Map ready signal received from iframe');
                        setMapReady(true);
                    }
                } catch (e) {
                    console.error("Web message error:", e);
                }
            };
            window.addEventListener('message', handleWebMessage);
            return () => window.removeEventListener('message', handleWebMessage);
        }
    }, []);

    // Add markers whenever map becomes ready AND we have locations
    useEffect(() => {
        if (mapReady && locations.length > 0 && webViewRef.current) {
            console.log('[React] Map is ready and we have', locations.length, 'locations - updating markers');
            updateMarkersInWebView(locations);
        }
    }, [mapReady, locations]);

    const fetchLocations = async () => {
        try {
            const token = await AsyncStorage.getItem('userToken');
            const res = await fetch(`${API_URL}/api/v1/tracking/location/all`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            const data = await res.json();

            console.log('=== TRACKING DATA FROM BACKEND ===');
            console.log('Total locations:', data.length);
            data.forEach((loc, idx) => {
                console.log(`\n[${idx}] ${loc.user_name || loc.user_email}:`);
                console.log(`  - Active: ${loc.active}`);
                console.log(`  - Has GPS: ${loc.latitude ? 'YES' : 'NO'} (lat: ${loc.latitude}, lng: ${loc.longitude})`);
                console.log(`  - Last seen: ${loc.last_seen_minutes} min ago`);
                console.log(`  - Timestamp: ${loc.timestamp}`);
            });
            console.log('===================================\n');

            // FIX: Map backend `user_name` to frontend `name` and provide fallback
            // This prevents "Cannot read property 'split' of undefined"
            const safeData = data.map(loc => ({
                ...loc,
                name: loc.user_name || loc.user_email || 'Unknown User'
            }));

            setLocations(safeData);

            // Center map on first active location
            if (safeData.length > 0 && safeData[0].latitude) {
                setRegion({
                    latitude: safeData[0].latitude,
                    longitude: safeData[0].longitude,
                    zoom: 13,
                });
            }

            // ALWAYS update markers if map is ready, regardless of whether we're centering
            if (mapReady && webViewRef.current) {
                console.log('Updating markers in WebView, count:', safeData.length);
                updateMarkersInWebView(safeData);
            } else {
                console.warn('Cannot update markers - Map ready:', mapReady, 'WebView ref:', !!webViewRef.current);
            }
        } catch (err) {
            console.error('Failed to fetch locations:', err);
        } finally {
            setLoading(false);
        }
    };

    const updateMarkersInWebView = (data) => {
        console.log('updateMarkersInWebView called with', data.length, 'locations');
        console.log('Platform:', Platform.OS);

        if (Platform.OS === 'web') {
            console.log('Sending updateMarkers message to iframe...');
            try {
                webViewRef.current?.contentWindow?.postMessage(
                    JSON.stringify({ type: 'updateMarkers', data }),
                    '*'
                );
                console.log('Message sent to iframe');
            } catch (e) {
                console.error('Error sending message to iframe:', e);
            }
        } else {
            const markersJS = `
                console.log('Received updateMarkers call from React Native');
                updateMarkers(${JSON.stringify(data)});
                true;
            `;
            console.log('Injecting JavaScript into WebView...');
            webViewRef.current?.injectJavaScript(markersJS);
        }
    };

    const centerOnEmployee = (loc) => {
        setSelectedEmployee(loc);
        if (webViewRef.current) {
            if (Platform.OS === 'web') {
                webViewRef.current.contentWindow?.postMessage(JSON.stringify({
                    type: 'centerMap',
                    lat: loc.latitude,
                    lng: loc.longitude,
                    zoom: 16,
                    highlightId: loc.user_email
                }), '*');
            } else {
                const script = `
                    centerMap(${loc.latitude}, ${loc.longitude}, 16);
                    highlightMarker('${loc.user_email}');
                    true;
                `;
                webViewRef.current.injectJavaScript(script);
            }
        }
    };

    const activeCount = locations.filter(l => l.active).length;

    // OpenStreetMap HTML with Leaflet
    const mapHtml = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <title>Live Tracking Map</title>
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            html, body { height: 100%; width: 100%; overflow: hidden; }
            #map { height: 100%; width: 100%; }
            .custom-marker {
                width: 36px;
                height: 36px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-weight: bold;
                font-size: 14px;
                border: 3px solid white;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            }
            .marker-active { background-color: #10B981; }
            .marker-inactive { background-color: #9CA3AF; }
            .marker-store { 
                background-color: #F59E0B; 
                border-radius: 8px; /* Square with rounded corners */
                width: 32px;
                height: 32px;
            }
            .marker-selected { 
                transform: scale(1.3); 
                border-color: #F59E0B !important;
                z-index: 1000 !important;
            }
            .leaflet-popup-content-wrapper {
                border-radius: 12px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            }
            .leaflet-popup-content {
                margin: 12px 16px;
            }
            .popup-name {
                font-weight: 600;
                font-size: 14px;
                color: #1F2937;
                margin-bottom: 4px;
            }
            .popup-status {
                font-size: 12px;
                color: #6B7280;
            }
            .popup-time {
                font-size: 11px;
                color: #9CA3AF;
                margin-top: 4px;
            }
        </style>
    </head>
    <body>
        <div id="map"></div>
        <script>
            // Initialize map
            var map = L.map('map', {
                zoomControl: true,
                attributionControl: false
            }).setView([${region.latitude}, ${region.longitude}], ${region.zoom});
            
            // Use OpenStreetMap tiles
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
            }).addTo(map);

            // Store markers
            var markers = {};
            var currentHighlight = null;
            
            // HARDCODED STORES DATA
            var STORES = ${JSON.stringify(STORE_LOCATIONS)};

            // Function to add stores
            function addStoreMarkers() {
                STORES.forEach(function(store) {
                   var icon = L.divIcon({
                        className: 'custom-marker-wrapper',
                        html: '<div class="custom-marker marker-store"><span style="color:#FFF; font-size:16px;">🏠</span></div>',
                        iconSize: [32, 32],
                        iconAnchor: [16, 16],
                        popupAnchor: [0, -16]
                   });
                   L.marker([store.lat, store.lng], { icon: icon })
                    .bindPopup('<div class="popup-name">' + store.name + '</div><div class="popup-status">' + store.address + '</div>')
                    .addTo(map);
                });
            }
            // Add stores immediately
            addStoreMarkers();

            // Custom icon creation for employees
            function createIcon(initials, isActive) {
                return L.divIcon({
                    className: 'custom-marker-wrapper',
                    html: '<div class="custom-marker ' + (isActive ? 'marker-active' : 'marker-inactive') + '" id="marker-icon-' + initials + '">' + initials + '</div>',
                    iconSize: [36, 36],
                    iconAnchor: [18, 18],
                    popupAnchor: [0, -20]
                });
            }

            // Get initials from name
            function getInitials(name) {
                return (name || 'U').charAt(0).toUpperCase();
            }

            // Update all markers (Employees)
            function updateMarkers(locations) {
                console.log('[MAP] updateMarkers called with', locations.length, 'locations');

                // Clear existing employee markers
                var removedCount = Object.values(markers).length;
                Object.values(markers).forEach(m => map.removeLayer(m));
                markers = {};
                console.log('[MAP] Removed', removedCount, 'existing employee markers');

                // Add new markers
                var addedCount = 0;
                var skippedCount = 0;

                locations.forEach(function(loc, idx) {
                    console.log('[MAP] Processing location', idx, ':', loc.name, '- Active:', loc.active, '- GPS:', loc.latitude, loc.longitude);

                    if (loc.latitude && loc.longitude) {
                        var initials = getInitials(loc.name);
                        var icon = createIcon(initials, loc.active);

                        var popup = '<div class="popup-name">' + loc.name + '</div>' +
                                   '<div class="popup-status" style="color: ' + (loc.active ? '#10B981' : '#9CA3AF') + '">' +
                                   (loc.active ? '● Tracking Active' : '○ Offline') + '</div>' +
                                   '<div class="popup-time">Last updated: ' + new Date(loc.timestamp).toLocaleTimeString() + '</div>';

                        var marker = L.marker([loc.latitude, loc.longitude], { icon: icon })
                            .bindPopup(popup)
                            .addTo(map);

                        markers[loc.user_email] = marker;
                        addedCount++;
                        console.log('[MAP] ✓ Added marker for', loc.name, 'at', loc.latitude, loc.longitude);
                    } else {
                        skippedCount++;
                        console.warn('[MAP] ✗ Skipped', loc.name, '- No GPS coordinates (lat:', loc.latitude, 'lng:', loc.longitude + ')');
                    }
                });

                console.log('[MAP] Markers update complete: Added', addedCount, 'Skipped', skippedCount);
                console.log('[MAP] Total employee markers now:', Object.keys(markers).length);
            }

            // Center map on coordinates
            function centerMap(lat, lng, zoom) {
                map.setView([lat, lng], zoom, { animate: true });
            }

            // Highlight a specific marker
            function highlightMarker(userId) {
                // Remove previous highlight
                if (currentHighlight) {
                    var prevEl = document.querySelector('.marker-selected');
                    if (prevEl) prevEl.classList.remove('marker-selected');
                }
                
                // Add highlight to new marker
                if (markers[userId]) {
                    markers[userId].openPopup();
                    currentHighlight = userId;
                    
                    // Add visual highlight after short delay (for DOM update)
                    setTimeout(function() {
                        var markerDiv = markers[userId].getElement()?.querySelector('.custom-marker');
                        if (markerDiv) markerDiv.classList.add('marker-selected');
                    }, 100);
                }
            }

            // Notify React Native that map is ready
            // Reduced timeout to 500ms for faster marker display
            setTimeout(function() {
                console.log('[MAP] Sending mapReady signal to parent');
                if (window.ReactNativeWebView) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'mapReady' }));
                } else {
                    window.parent.postMessage(JSON.stringify({ type: 'mapReady' }), '*');
                }
                console.log('[MAP] Map ready signal sent!');
            }, 500);

            // [NEW] Listen for messages from Parent (Web & Native)
            window.addEventListener('message', function(event) {
                var msg = event.data;
                try {
                    if (typeof msg === 'string') msg = JSON.parse(msg);
                } catch(e) {}
                
                if (msg.type === 'updateMarkers') {
                    updateMarkers(msg.data);
                } else if (msg.type === 'centerMap') {
                    centerMap(msg.lat, msg.lng, msg.zoom);
                    if (msg.highlightId) highlightMarker(msg.highlightId);
                }
            });
        </script>
    </body>
    </html>
    `;

    const handleWebViewMessage = (event) => {
        try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === 'mapReady') {
                console.log('[React] Map is now ready! Updating markers...');
                setMapReady(true);
                // Important: Add markers as soon as map is ready
                if (locations.length > 0) {
                    console.log('[React] Map just became ready, adding', locations.length, 'markers now');
                    updateMarkersInWebView(locations);
                }
            }
        } catch (e) {
            console.error('WebView message error:', e);
        }
    };

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
                        <Text style={styles.activeText}>
                            {activeCount} tracking · {locations.length} total
                        </Text>
                    </View>
                </View>

                <TouchableOpacity style={styles.refreshBtn} onPress={fetchLocations}>
                    <Feather name="refresh-cw" size={20} color="#F59E0B" />
                </TouchableOpacity>
            </Animated.View>

            {/* MAP - ALWAYS VISIBLE FOR STORE VIEW */}
            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#F59E0B" />
                    <Text style={styles.loadingText}>Loading locations...</Text>
                </View>
            ) : (
                <View style={styles.mapContainer}>
                    {Platform.OS === 'web' ? (
                        <iframe
                            ref={webViewRef}
                            srcDoc={mapHtml}
                            style={{ width: '100%', height: '100%', border: 'none' }}
                            title="Live Tracking Map"
                        />
                    ) : (
                        <WebView
                            ref={webViewRef}
                            source={{ html: mapHtml }}
                            style={styles.map}
                            onMessage={handleWebViewMessage}
                            javaScriptEnabled={true}
                            domStorageEnabled={true}
                            startInLoadingState={true}
                            renderLoading={() => (
                                <View style={styles.mapLoading}>
                                    <ActivityIndicator size="large" color="#F59E0B" />
                                    <Text style={styles.mapLoadingText}>Loading map...</Text>
                                </View>
                            )}
                            onError={(syntheticEvent) => {
                                const { nativeEvent } = syntheticEvent;
                                console.error('WebView error:', nativeEvent);
                            }}
                        />
                    )}

                    {/* FLOATING LEGEND */}
                    <View style={styles.legend}>
                        <View style={styles.legendItem}>
                            <View style={[styles.legendDot, { backgroundColor: '#F59E0B' }]} />
                            <Text style={styles.legendText}>Stores</Text>
                        </View>
                        <View style={styles.legendItem}>
                            <View style={[styles.legendDot, { backgroundColor: '#10B981' }]} />
                            <Text style={styles.legendText}>Emp. Active</Text>
                        </View>
                    </View>

                    {/* SELECTED EMPLOYEE INFO */}
                    {selectedEmployee && (
                        <Animated.View entering={FadeInDown} style={styles.selectedCard}>
                            <View style={[
                                styles.selectedAvatar,
                                { backgroundColor: selectedEmployee.active ? '#10B981' : '#9CA3AF' }
                            ]}>
                                <Text style={styles.selectedAvatarText}>
                                    {(selectedEmployee.name || 'U').charAt(0).toUpperCase()}
                                </Text>
                            </View>
                            <View style={styles.selectedInfo}>
                                <Text style={styles.selectedName}>{selectedEmployee.name}</Text>
                                <Text style={[
                                    styles.selectedStatus,
                                    { color: selectedEmployee.active ? '#10B981' : '#9CA3AF' }
                                ]}>
                                    {selectedEmployee.active ? '● Tracking Active' : '○ Offline'}
                                </Text>
                            </View>
                            <TouchableOpacity
                                style={styles.closeSelectedBtn}
                                onPress={() => setSelectedEmployee(null)}
                            >
                                <Feather name="x" size={18} color="#6B7280" />
                            </TouchableOpacity>
                        </Animated.View>
                    )}
                </View>
            )}

            {/* EMPLOYEE LIST */}
            {locations.length > 0 && (
                <View style={styles.listContainer}>
                    <Text style={styles.listTitle}>
                        Team Locations · <Text style={{ color: '#10B981' }}>{activeCount}</Text> tracking
                    </Text>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.listScroll}
                    >
                        {locations.map((loc, index) => (
                            <TouchableOpacity
                                key={loc.id || loc.user_email}
                                onPress={() => loc.active && centerOnEmployee(loc)}
                                activeOpacity={loc.active ? 0.8 : 1}
                            >
                                <View
                                    style={[
                                        styles.employeeCard,
                                        !loc.active && styles.employeeCardInactive,
                                        selectedEmployee?.user_email === loc.user_email && styles.employeeCardSelected
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
                                                {(loc.name || 'U').charAt(0).toUpperCase()}
                                            </Text>
                                        </View>
                                    </View>
                                    <View style={styles.cardBody}>
                                        <Text style={styles.employeeName} numberOfLines={1}>
                                            {loc.name}
                                        </Text>
                                        <View style={styles.statusRow}>
                                            <Feather
                                                name={loc.active ? "radio" : "wifi-off"}
                                                size={10}
                                                color={loc.active ? "#10B981" : "#EF4444"}
                                            />
                                            <Text style={[
                                                styles.statusText,
                                                { color: loc.active ? "#10B981" : "#EF4444" }
                                            ]}>
                                                {loc.active ? 'Tracking' : 'Not Tracking'}
                                            </Text>
                                        </View>
                                        <Text style={[
                                            styles.timestamp,
                                            !loc.active && { color: '#9CA3AF' }
                                        ]}>
                                            {loc.active
                                                ? new Date(loc.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                                : loc.last_seen_minutes === null || loc.last_seen_minutes === undefined
                                                    ? 'Never tracked'
                                                    : loc.last_seen_minutes < 60
                                                        ? `${loc.last_seen_minutes}m ago`
                                                        : loc.last_seen_minutes < 1440
                                                            ? `${Math.floor(loc.last_seen_minutes / 60)}h ago`
                                                            : `${Math.floor(loc.last_seen_minutes / 1440)}d ago`
                                            }
                                        </Text>
                                    </View>
                                </View>
                            </TouchableOpacity>
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
    mapLoading: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#FFFBEB',
    },
    mapLoadingText: {
        marginTop: 12,
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        color: '#92400E',
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

    // SELECTED EMPLOYEE CARD
    selectedCard: {
        position: 'absolute',
        bottom: 20,
        left: 20,
        right: 100,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.98)',
        borderRadius: 16,
        padding: 12,
        shadowColor: "#F59E0B",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
        elevation: 6,
    },
    selectedAvatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
    },
    selectedAvatarText: {
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
    },
    selectedInfo: {
        flex: 1,
        marginLeft: 12,
    },
    selectedName: {
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
        color: '#111827',
    },
    selectedStatus: {
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
    },
    closeSelectedBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#F3F4F6',
        justifyContent: 'center',
        alignItems: 'center',
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
    emptyHint: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#9CA3AF',
        textAlign: 'center',
        marginTop: 16,
        paddingHorizontal: 20,
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
        minHeight: 140,
        borderWidth: 2, // [FIX] layout stability
        borderColor: 'transparent',
    },
    employeeCardInactive: {
        shadowColor: "#9CA3AF",
        shadowColor: "#9CA3AF",
        // opacity: 0.7, // [FIX] Removed opacity as it may cause blank rendering on Android
    },
    employeeCardSelected: {
        // borderWidth: 2, // inherited from base
        borderColor: '#F59E0B',
        shadowColor: "#F59E0B",
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
