import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Dimensions } from 'react-native';
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');

export default function AIScanner({ onClose }) {
    const scanLineY = useSharedValue(0);

    useEffect(() => {
        scanLineY.value = withRepeat(
            withTiming(height * 0.4, { duration: 2000, easing: Easing.linear }),
            -1,
            true
        );
    }, []);

    const animatedScanStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: scanLineY.value }],
    }));

    return (
        <View style={styles.container}>
            {/* CAMERA FEED SIMULATION */}
            <Image
                source={{ uri: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?q=80&w=1000&auto=format&fit=crop" }}
                style={styles.cameraFeed}
            />

            {/* OVERLAY */}
            <View style={styles.overlay}>
                <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                    <Feather name="x" size={24} color="#FFF" />
                </TouchableOpacity>

                <View style={styles.scanFrame}>
                    <View style={[styles.corner, styles.tl]} />
                    <View style={[styles.corner, styles.tr]} />
                    <View style={[styles.corner, styles.bl]} />
                    <View style={[styles.corner, styles.br]} />

                    {/* SCAN LINE */}
                    <Animated.View style={[styles.scanLine, animatedScanStyle]} />

                    {/* DETECTED ISSUE BOX */}
                    <View style={styles.detectedBox}>
                        <View style={styles.issuebadge}>
                            <MaterialCommunityIcons name="alert-circle" size={16} color="#FFF" />
                            <Text style={styles.issueText}>Unlabeled Milk Pitcher</Text>
                        </View>
                    </View>
                </View>

                {/* BOTTOM CONTROLS */}
                <View style={styles.controls}>
                    <Text style={styles.statusText}>Analyzing Hygiene Compliance...</Text>
                    <TouchableOpacity style={styles.captureBtn}>
                        <View style={styles.captureInner} />
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    cameraFeed: {
        width: '100%',
        height: '100%',
        position: 'absolute',
        opacity: 0.8,
    },
    overlay: {
        flex: 1,
        paddingTop: 50,
        paddingBottom: 40,
        paddingHorizontal: 20,
        justifyContent: 'space-between',
    },
    closeBtn: {
        alignSelf: 'flex-start',
        padding: 10,
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderRadius: 20,
    },
    scanFrame: {
        width: width - 40,
        height: width - 40,
        alignSelf: 'center',
        position: 'relative',
    },
    corner: {
        position: 'absolute',
        width: 40,
        height: 40,
        borderColor: '#10B981',
        borderWidth: 4,
    },
    tl: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 20 },
    tr: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 20 },
    bl: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 20 },
    br: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 20 },

    scanLine: {
        width: '100%',
        height: 2,
        backgroundColor: '#10B981',
        shadowColor: "#10B981",
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 10,
    },
    detectedBox: {
        position: 'absolute',
        top: '40%',
        left: '20%',
    },
    issuebadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#EF4444',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },
    issueText: {
        color: '#FFF',
        fontSize: 12,
        fontWeight: 'bold',
        marginLeft: 6,
    },

    controls: {
        alignItems: 'center',
    },
    statusText: {
        color: '#FFF',
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        marginBottom: 20,
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowRadius: 4,
    },
    captureBtn: {
        width: 80,
        height: 80,
        borderRadius: 40,
        borderWidth: 4,
        borderColor: '#FFF',
        justifyContent: 'center',
        alignItems: 'center',
    },
    captureInner: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#FFF',
    },
});
