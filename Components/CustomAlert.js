import React, { useEffect } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    runOnJS
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

const CustomAlert = ({ visible, title, message, type = 'error', onClose }) => {
    const scale = useSharedValue(0.8);
    const opacity = useSharedValue(0);

    const isSuccess = type === 'success';
    const isError = type === 'error';

    // Config based on type
    const config = {
        color: isSuccess ? '#10B981' : '#EF4444',
        icon: isSuccess ? 'check-circle' : 'alert-circle',
        gradient: isSuccess ? ['#10B981', '#059669'] : ['#EF4444', '#DC2626'],
        bg: isSuccess ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'
    };

    useEffect(() => {
        if (visible) {
            opacity.value = withTiming(1, { duration: 200 });
            scale.value = withSpring(1, { damping: 15 });
        } else {
            opacity.value = withTiming(0, { duration: 200 });
            scale.value = withTiming(0.8, { duration: 200 });
        }
    }, [visible]);

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [{ scale: scale.value }]
    }));

    // If we return null here, it must be AFTER all hooks (which it is now, but Modal handles visibility better)
    // Actually, Modal visible={false} hides it, so we don't need to return null.
    // However, to ensure unmount when not needed if we wanted to saves resources, we would need to do it conditionally at parent.
    // But for this component, we just remove the early return to fix the "Rendered more hooks" error.

    return (
        <Modal visible={visible} transparent animationType="none">
            <View style={styles.overlay}>
                {/* Backdrop Blur */}
                <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />

                <Animated.View style={[styles.container, animatedStyle]}>
                    <View style={[styles.content, { borderColor: config.color + '40' }]}>

                        {/* Icon Header */}
                        <View style={[styles.iconContainer, { backgroundColor: config.bg }]}>
                            <Feather name={config.icon} size={32} color={config.color} />
                        </View>

                        {/* Text Content */}
                        <View style={styles.textContainer}>
                            <Text style={[styles.title, { color: config.color }]}>{title}</Text>
                            <Text style={styles.message}>{message}</Text>
                        </View>

                        {/* Action Button */}
                        <TouchableOpacity style={styles.button} onPress={onClose} activeOpacity={0.8}>
                            <LinearGradient
                                colors={config.gradient}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.gradient}
                            >
                                <Text style={styles.buttonText}>Okay, Got it</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.3)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    container: {
        width: '100%',
        maxWidth: 340,
    },
    content: {
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 24,
        alignItems: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 20,
        elevation: 10,
        borderWidth: 1,
    },
    iconContainer: {
        width: 64,
        height: 64,
        borderRadius: 32,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    textContainer: {
        alignItems: 'center',
        marginBottom: 24,
    },
    title: {
        fontSize: 20,
        fontFamily: 'Poppins_700Bold',
        marginBottom: 8,
        textAlign: 'center',
    },
    message: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
        textAlign: 'center',
        lineHeight: 22,
    },
    button: {
        width: '100%',
        borderRadius: 16,
        overflow: 'hidden',
    },
    gradient: {
        paddingVertical: 14,
        alignItems: 'center',
    },
    buttonText: {
        color: '#FFF',
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
    }
});

export default CustomAlert;
