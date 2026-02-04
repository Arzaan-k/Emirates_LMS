import React, { useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Modal,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * ModeSwitcher Component
 *
 * Allows privileged users to switch between Admin Mode and Employee Mode
 *
 * Props:
 * - navigation: Navigation object for routing
 * - currentMode: 'admin' or 'user' - current active mode
 * - userProfile: User object with privilege information
 * - buttonStyle: Optional custom style for the switch button
 */
export default function ModeSwitcher({ navigation, currentMode, userProfile, buttonStyle }) {
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [switching, setSwitching] = useState(false);

    // Check if user has admin privileges
    const hasAdminPrivileges =
        userProfile?.has_admin_access ||
        userProfile?.is_superadmin ||
        (userProfile?.privileges && userProfile.privileges.length > 0);

    // Don't render if user doesn't have admin privileges
    if (!hasAdminPrivileges) {
        return null;
    }

    const handleSwitchMode = () => {
        setShowConfirmModal(true);
    };

    const confirmSwitch = async () => {
        try {
            setSwitching(true);
            const newMode = currentMode === 'admin' ? 'user' : 'admin';

            // Save new mode to AsyncStorage
            await AsyncStorage.setItem('userMode', newMode);
            console.log(`[ModeSwitcher] Switching from ${currentMode} to ${newMode}`);

            // Close modal
            setShowConfirmModal(false);

            // Navigate to appropriate screen
            if (newMode === 'admin') {
                navigation.replace('ManagerDashboard', { userProfile });
            } else {
                navigation.replace('Home', { userProfile });
            }
        } catch (error) {
            console.error('Error switching mode:', error);
            Alert.alert('Error', 'Failed to switch mode. Please try again.');
        } finally {
            setSwitching(false);
        }
    };

    const cancelSwitch = () => {
        setShowConfirmModal(false);
    };

    const targetMode = currentMode === 'admin' ? 'Employee' : 'Admin';
    const targetModeColor = currentMode === 'admin' ? '#3B82F6' : '#EF4444';
    const targetModeIcon = currentMode === 'admin' ? 'account-circle' : 'shield-crown';

    return (
        <>
            {/* Switch Mode Button */}
            <TouchableOpacity
                onPress={handleSwitchMode}
                style={[styles.switchButton, buttonStyle]}
                activeOpacity={0.8}
            >
                <MaterialCommunityIcons name="swap-horizontal" size={20} color={targetModeColor} />
                <Text style={[styles.switchButtonText, { color: targetModeColor }]}>
                    Switch to {targetMode}
                </Text>
            </TouchableOpacity>

            {/* Confirmation Modal */}
            <Modal visible={showConfirmModal} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
                    <View style={styles.confirmModal}>
                        {/* Icon */}
                        <View style={[styles.iconContainer, { backgroundColor: targetModeColor + '20' }]}>
                            <MaterialCommunityIcons name={targetModeIcon} size={48} color={targetModeColor} />
                        </View>

                        {/* Title */}
                        <Text style={styles.confirmTitle}>
                            Switch to {targetMode} Mode?
                        </Text>

                        {/* Description */}
                        <Text style={styles.confirmDescription}>
                            {currentMode === 'admin'
                                ? 'You will be redirected to the employee dashboard with learning content, quizzes, and analytics.'
                                : 'You will be redirected to the admin dashboard to manage users, content, and settings.'
                            }
                        </Text>

                        {/* Info Box */}
                        <View style={styles.infoBox}>
                            <Feather name="info" size={16} color="#6B7280" />
                            <Text style={styles.infoText}>
                                You can switch back anytime from your {currentMode === 'admin' ? 'profile' : 'dashboard'} settings
                            </Text>
                        </View>

                        {/* Buttons */}
                        <View style={styles.buttonRow}>
                            <TouchableOpacity
                                onPress={cancelSwitch}
                                style={[styles.button, styles.cancelButton]}
                                disabled={switching}
                            >
                                <Text style={styles.cancelButtonText}>Cancel</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={confirmSwitch}
                                style={[styles.button, styles.confirmButton]}
                                disabled={switching}
                            >
                                <LinearGradient
                                    colors={[targetModeColor, targetModeColor + 'DD']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={styles.confirmButtonGradient}
                                >
                                    {switching ? (
                                        <ActivityIndicator size="small" color="#FFF" />
                                    ) : (
                                        <>
                                            <MaterialCommunityIcons name="check" size={20} color="#FFF" />
                                            <Text style={styles.confirmButtonText}>Switch Mode</Text>
                                        </>
                                    )}
                                </LinearGradient>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    switchButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 12,
        gap: 8,
        borderWidth: 2,
        borderColor: '#E5E7EB',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    switchButtonText: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
    },
    modalOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    confirmModal: {
        width: '100%',
        maxWidth: 400,
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 20 },
        shadowOpacity: 0.3,
        shadowRadius: 30,
        elevation: 20,
    },
    iconContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
        alignSelf: 'center',
        marginBottom: 20,
    },
    confirmTitle: {
        fontSize: 22,
        fontFamily: 'Poppins_700Bold',
        color: '#111827',
        textAlign: 'center',
        marginBottom: 12,
    },
    confirmDescription: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 20,
    },
    infoBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F3F4F6',
        padding: 12,
        borderRadius: 12,
        gap: 8,
        marginBottom: 24,
    },
    infoText: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
        flex: 1,
        lineHeight: 18,
    },
    buttonRow: {
        flexDirection: 'row',
        gap: 12,
    },
    button: {
        flex: 1,
        borderRadius: 12,
        overflow: 'hidden',
    },
    cancelButton: {
        backgroundColor: '#F3F4F6',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 14,
    },
    cancelButtonText: {
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
        color: '#6B7280',
    },
    confirmButton: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 5,
    },
    confirmButtonGradient: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 14,
        gap: 8,
    },
    confirmButtonText: {
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
    },
});
