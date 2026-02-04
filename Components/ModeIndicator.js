import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * ModeIndicator Component
 *
 * Displays a badge showing the current active mode (Admin or Employee)
 *
 * Props:
 * - mode: 'admin' or 'user' - current active mode
 * - style: Optional custom style for container
 * - compact: Boolean - if true, shows smaller version
 */
export default function ModeIndicator({ mode, style, compact = false }) {
    const isAdmin = mode === 'admin';

    const config = isAdmin
        ? {
            colors: ['#EF4444', '#DC2626'],
            icon: 'shield-crown',
            label: 'Admin Mode',
            shortLabel: 'Admin',
        }
        : {
            colors: ['#3B82F6', '#2563EB'],
            icon: 'account-circle',
            label: 'Employee Mode',
            shortLabel: 'Employee',
        };

    if (compact) {
        return (
            <View style={[styles.compactContainer, style]}>
                <LinearGradient
                    colors={config.colors}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.compactGradient}
                >
                    <MaterialCommunityIcons name={config.icon} size={14} color="#FFF" />
                    <Text style={styles.compactText}>{config.shortLabel}</Text>
                </LinearGradient>
            </View>
        );
    }

    return (
        <View style={[styles.container, style]}>
            <LinearGradient
                colors={config.colors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.gradient}
            >
                <View style={styles.iconBox}>
                    <MaterialCommunityIcons name={config.icon} size={18} color="#FFF" />
                </View>
                <Text style={styles.text}>{config.label}</Text>
            </LinearGradient>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        borderRadius: 12,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
        elevation: 3,
    },
    gradient: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        gap: 8,
    },
    iconBox: {
        width: 28,
        height: 28,
        borderRadius: 8,
        backgroundColor: 'rgba(255, 255, 255, 0.25)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    text: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
    },
    compactContainer: {
        borderRadius: 8,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    compactGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4,
        gap: 4,
    },
    compactText: {
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
    },
});
