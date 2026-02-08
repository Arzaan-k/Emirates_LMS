import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    Dimensions,
    Alert,
    KeyboardAvoidingView,
    Platform,
    Modal,
    ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withSequence,
    withTiming,
    Easing,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import AsyncStorage from '@react-native-async-storage/async-storage';
import API_URL from '../config';

import CustomAlert from '../Components/CustomAlert';

const { width, height } = Dimensions.get('window');

// Floating Waffle Component
const FloatingWaffle = ({ size, top, left, delay }) => {
    const translateY = useSharedValue(0);
    const rotate = useSharedValue(0);
    const scale = useSharedValue(1);

    React.useEffect(() => {
        translateY.value = withRepeat(
            withSequence(
                withTiming(-20, { duration: 2000 + delay, easing: Easing.inOut(Easing.ease) }),
                withTiming(0, { duration: 2000 + delay, easing: Easing.inOut(Easing.ease) })
            ),
            -1,
            false
        );

        rotate.value = withRepeat(
            withSequence(
                withTiming(10, { duration: 3000 + delay }),
                withTiming(-10, { duration: 3000 + delay })
            ),
            -1,
            true
        );

        scale.value = withRepeat(
            withSequence(
                withTiming(1.1, { duration: 1500 + delay }),
                withTiming(1, { duration: 1500 + delay })
            ),
            -1,
            true
        );
    }, []);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [
            { translateY: translateY.value },
            { rotate: `${rotate.value}deg` },
            { scale: scale.value },
        ],
    }));

    return (
        <Animated.View
            style={[
                styles.floatingWaffle,
                {
                    top,
                    left,
                    width: size,
                    height: size,
                },
                animatedStyle,
            ]}
        >
            <Text style={{ fontSize: size * 0.8 }}>🧇</Text>
        </Animated.View>
    );
};

// Sparkle Component
const Sparkle = ({ size, top, left, delay }) => {
    const opacity = useSharedValue(0);
    const scale = useSharedValue(0);

    React.useEffect(() => {
        opacity.value = withRepeat(
            withSequence(
                withTiming(0, { duration: delay }),
                withTiming(1, { duration: 800 }),
                withTiming(0, { duration: 800 })
            ),
            -1,
            false
        );

        scale.value = withRepeat(
            withSequence(
                withTiming(0, { duration: delay }),
                withTiming(1.2, { duration: 800 }),
                withTiming(0, { duration: 800 })
            ),
            -1,
            false
        );
    }, []);

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [{ scale: scale.value }],
    }));

    return (
        <Animated.View style={[styles.sparkle, { top, left, width: size, height: size }, animatedStyle]}>
            <Text style={{ fontSize: size }}>✨</Text>
        </Animated.View>
    );
};

export default function Login({ navigation }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [showRoleModal, setShowRoleModal] = useState(false);
    const [pendingUserData, setPendingUserData] = useState(null);

    // Forgot Password State
    const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
    const [resetStage, setResetStage] = useState('email'); // 'email', 'reset'
    const [resetEmail, setResetEmail] = useState('');
    const [resetToken, setResetToken] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [resetLoading, setResetLoading] = useState(false);

    // Custom Alert State
    const [alertVisible, setAlertVisible] = useState(false);
    const [alertConfig, setAlertConfig] = useState({
        title: '',
        message: '',
        type: 'error'
    });

    const showAlert = (title, message, type = 'error') => {
        setAlertConfig({ title, message, type });
        setAlertVisible(true);
    };

    const handleLogin = async () => {
        if (!username || !password) {
            showAlert('Missing Fields', 'Please enter both username and password.', 'error');
            return;
        }

        setLoading(true);
        try {
            const response = await fetch(`${API_URL}/api/v1/auth/login-json`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: username, password: password })
            });

            const data = await response.json();

            if (data.status === 'success') {
                const user = data.user;

                // Save user profile to AsyncStorage
                await AsyncStorage.setItem('userProfile', JSON.stringify(user));
                await AsyncStorage.setItem('userEmail', user.email);
                if (data.access_token) {
                    await AsyncStorage.setItem('userToken', data.access_token);
                }
                console.log('[Login] Saved user profile and token to AsyncStorage:', user.email);

                // Check if user has admin privileges
                const hasAdminPrivileges = user.has_admin_access || user.is_superadmin || (user.privileges && user.privileges.length > 0);

                if (hasAdminPrivileges) {
                    // Show role selection modal for privileged users
                    setPendingUserData(user);
                    setShowRoleModal(true);
                    setLoading(false);
                } else {
                    // Regular users - go directly to employee view
                    await AsyncStorage.setItem('userMode', 'user');
                    navigation.replace('Home', { userProfile: user });
                }
            } else {
                // Use specific error message from backend if available
                const errorMsg = data.detail || data.message || 'Invalid credentials';
                showAlert('Login Failed', errorMsg, 'error');
            }
        } catch (error) {
            console.error('Login error:', error);
            showAlert('Connection Error', 'Unable to connect to server. Please try again.', 'error');
        } finally {
            if (!showRoleModal) {
                setLoading(false);
            }
        }
    };

    const handleRoleSelection = async (mode) => {
        if (!pendingUserData) return;

        try {
            // Save selected mode
            await AsyncStorage.setItem('userMode', mode);
            console.log(`[Login] User selected mode: ${mode}`);

            // Navigate based on selected mode
            if (mode === 'admin') {
                navigation.replace('ManagerDashboard', { userProfile: pendingUserData });
            } else {
                navigation.replace('Home', { userProfile: pendingUserData });
            }

            // Reset state
            setShowRoleModal(false);
            setPendingUserData(null);
        } catch (error) {
            console.error('Error saving mode:', error);
            Alert.alert('Error', 'Failed to save login mode');
        }
    };

    const requestResetCode = async () => {
        if (!resetEmail) {
            showAlert('Missing Email', 'Please enter your email address', 'error');
            return;
        }

        setResetLoading(true);
        try {
            const response = await fetch(`${API_URL}/api/v1/auth/forgot-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: resetEmail })
            });

            const data = await response.json();

            if (response.ok) {
                // Email sent successfully
                setResetStage('reset');
                showAlert('Check Your Email', `A reset code has been sent to ${resetEmail}`, 'success');
            } else {
                showAlert('Request Failed', data.detail || 'Failed to send reset code', 'error');
            }
        } catch (error) {
            console.error('Forgot password error:', error);
            showAlert('Connection Error', 'Network error. Please try again.', 'error');
        } finally {
            setResetLoading(false);
        }
    };

    const submitPasswordReset = async () => {
        if (!resetToken || !newPassword || !confirmPassword) {
            showAlert('Missing Fields', 'Please fill in all fields', 'error');
            return;
        }

        if (newPassword !== confirmPassword) {
            showAlert('Password Mismatch', 'Passwords do not match', 'error');
            return;
        }

        // Strong password validation (Matching Backend Logic)
        if (newPassword.length < 8) {
            showAlert('Weak Password', 'Password must be at least 8 characters long.', 'error');
            return;
        }
        if (!/[A-Z]/.test(newPassword)) {
            showAlert('Weak Password', 'Password must contain at least one uppercase letter.', 'error');
            return;
        }
        if (!/[a-z]/.test(newPassword)) {
            showAlert('Weak Password', 'Password must contain at least one lowercase letter.', 'error');
            return;
        }
        if (!/\d/.test(newPassword)) {
            showAlert('Weak Password', 'Password must contain at least one number.', 'error');
            return;
        }
        // Check for special characters (permissive list matching backend)
        if (!/[!@#$%^&*(),.?":{}|<>]/.test(newPassword)) {
            showAlert('Weak Password', 'Password must contain at least one special character (e.g. ! @ # $ %).', 'error');
            return;
        }

        setResetLoading(true);
        try {
            const response = await fetch(`${API_URL}/api/v1/auth/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: resetEmail,
                    token: resetToken,
                    new_password: newPassword
                })
            });

            let data;
            try {
                data = await response.json();
            } catch (e) {
                // Fallback if response is not JSON
                const text = await response.text();
                // If text is empty or html, just say server error
                data = { detail: text || 'Server returned an error' };
            }

            if (response.ok) {
                showAlert('Success!', 'Password reset successfully. You can now login.', 'success');
                setShowForgotPasswordModal(false);
            } else {
                // Try to extract the cleanest message
                let message = data.detail || data.message || 'Failed to reset password';

                // If detail is an array (FastAPI validation error), grab the first msg
                if (Array.isArray(message)) {
                    message = message[0]?.msg || JSON.stringify(message);
                }

                // If it looks like "Validation failed for field 'token': Invalid reset code"
                // we keep it as is, or clean it up if needed.
                console.log('[Login] Reset Failed Message:', message);
                showAlert('Reset Failed', message, 'error');
            }
        } catch (error) {
            console.error('Reset password error:', error);
            showAlert('Connection Error', 'Network error. Please try again.', 'error');
        } finally {
            setResetLoading(false);
        }
    };

    const handleForgotPassword = () => {
        setResetStage('email');
        setResetEmail('');
        setResetToken('');
        setNewPassword('');
        setConfirmPassword('');
        setShowForgotPasswordModal(true);
    };

    return (
        <View style={styles.container}>
            {/* BACKGROUND GRADIENT */}
            <LinearGradient
                colors={['#FFFBEB', '#FFF7ED', '#FFFFFF', '#FEF3C7']}
                style={StyleSheet.absoluteFill}
            />

            {/* FLOATING WAFFLES */}
            <FloatingWaffle size={80} top={100} left={30} delay={0} />
            <FloatingWaffle size={60} top={150} left={width - 80} delay={500} />
            <FloatingWaffle size={70} top={height * 0.3} left={50} delay={1000} />
            <FloatingWaffle size={50} top={height * 0.5} left={width - 70} delay={1500} />
            <FloatingWaffle size={90} top={height * 0.7} left={width / 2 - 45} delay={800} />
            <FloatingWaffle size={55} top={height * 0.8} left={40} delay={1200} />
            <FloatingWaffle size={65} top={height * 0.6} left={width - 90} delay={300} />

            {/* SPARKLES */}
            <Sparkle size={20} top={120} left={100} delay={0} />
            <Sparkle size={16} top={200} left={width - 100} delay={600} />
            <Sparkle size={18} top={height * 0.4} left={80} delay={1200} />
            <Sparkle size={14} top={height * 0.65} left={width - 60} delay={400} />

            {/* LOGIN CARD */}
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.keyboardView}
            >
                <BlurView intensity={20} tint="light" style={styles.card}>
                    {/* HEADER */}
                    <View style={styles.header}>
                        <Text style={styles.welcomeText}>Welcome to</Text>
                        <Text style={styles.brandText}>Belgian Waffle LMS</Text>
                        <Text style={styles.tagline}>Learn • Grow • Excel</Text>
                    </View>

                    {/* USERNAME INPUT */}
                    <View style={styles.inputContainer}>
                        <Feather name="user" size={20} color="#F59E0B" />
                        <TextInput
                            style={styles.input}
                            placeholder="Username"
                            placeholderTextColor="#9CA3AF"
                            value={username}
                            onChangeText={setUsername}
                            autoCapitalize="none"
                        />
                    </View>

                    {/* PASSWORD INPUT */}
                    <View style={styles.inputContainer}>
                        <Feather name="lock" size={20} color="#F59E0B" />
                        <TextInput
                            style={styles.input}
                            placeholder="Password"
                            placeholderTextColor="#9CA3AF"
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry={!showPassword}
                            autoCapitalize="none"
                        />
                        <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                            <Feather name={showPassword ? 'eye' : 'eye-off'} size={20} color="#9CA3AF" />
                        </TouchableOpacity>
                    </View>

                    {/* FORGOT PASSWORD */}
                    <TouchableOpacity onPress={handleForgotPassword} style={styles.forgotBtn}>
                        <Text style={styles.forgotText}>Forgot Password?</Text>
                    </TouchableOpacity>

                    {/* LOGIN BUTTON */}
                    <TouchableOpacity style={styles.loginBtn} onPress={handleLogin} disabled={loading}>
                        <LinearGradient
                            colors={['#F59E0B', '#D97706']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.loginGradient}
                        >
                            <Text style={styles.loginText}>{loading ? "Signing In..." : "Sign In"}</Text>
                            {!loading && <Feather name="arrow-right" size={20} color="#FFF" />}
                        </LinearGradient>
                    </TouchableOpacity>

                    {/* DEMO CREDENTIALS HINT */}
                    {/* DEMO CREDENTIALS HINT - HIDDEN
                    <View style={styles.hintBox}>
                        <Feather name="info" size={14} color="#6B7280" />
                        <Text style={styles.hintText}>
                            Demo: superadmin / superadmin@2025 (Full Access){'\n'}
                            store.manager / bw_store@2025 (Limited){'\n'}
                            user / user@123 (Employee)
                        </Text>
                    </View>
                    */}
                </BlurView>
            </KeyboardAvoidingView>

            {/* ROLE SELECTION MODAL */}
            <Modal visible={showRoleModal} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
                    <View style={styles.roleModalCard}>
                        {/* Header */}
                        <View style={styles.roleModalHeader}>
                            <MaterialCommunityIcons name="shield-account" size={48} color="#F59E0B" />
                            <Text style={styles.roleModalTitle}>Choose Login Mode</Text>
                            <Text style={styles.roleModalSubtitle}>
                                You have admin privileges. How would you like to login?
                            </Text>
                        </View>

                        {/* Admin Mode Button */}
                        <TouchableOpacity
                            style={styles.roleModeButton}
                            onPress={() => handleRoleSelection('admin')}
                            activeOpacity={0.8}
                        >
                            <LinearGradient
                                colors={['#EF4444', '#DC2626']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.roleModeGradient}
                            >
                                <View style={styles.roleModeIconBox}>
                                    <MaterialCommunityIcons name="shield-crown" size={32} color="#FFF" />
                                </View>
                                <View style={styles.roleModeContent}>
                                    <Text style={styles.roleModeTitle}>Admin Mode</Text>
                                    <Text style={styles.roleModeDescription}>
                                        Access admin dashboard, manage users, content, and settings
                                    </Text>
                                </View>
                                <Feather name="chevron-right" size={24} color="#FFF" />
                            </LinearGradient>
                        </TouchableOpacity>

                        {/* User Mode Button */}
                        <TouchableOpacity
                            style={styles.roleModeButton}
                            onPress={() => handleRoleSelection('user')}
                            activeOpacity={0.8}
                        >
                            <LinearGradient
                                colors={['#3B82F6', '#2563EB']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.roleModeGradient}
                            >
                                <View style={styles.roleModeIconBox}>
                                    <MaterialCommunityIcons name="account-circle" size={32} color="#FFF" />
                                </View>
                                <View style={styles.roleModeContent}>
                                    <Text style={styles.roleModeTitle}>Employee Mode</Text>
                                    <Text style={styles.roleModeDescription}>
                                        Access learning content, quizzes, analytics, and profile
                                    </Text>
                                </View>
                                <Feather name="chevron-right" size={24} color="#FFF" />
                            </LinearGradient>
                        </TouchableOpacity>

                        {/* Info Footer */}
                        <View style={styles.roleModalFooter}>
                            <Feather name="info" size={14} color="#6B7280" />
                            <Text style={styles.roleModalFooterText}>
                                You can switch modes anytime from your profile/dashboard
                            </Text>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* FORGOT PASSWORD MODAL */}
            <Modal visible={showForgotPasswordModal} transparent animationType="fade">
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={{ flex: 1 }}
                >
                    <View style={styles.modalOverlay}>
                        <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
                        <Animated.ScrollView
                            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                        >
                            <View style={styles.roleModalCard}>
                                {/* Header */}
                                <View style={styles.roleModalHeader}>
                                    <MaterialCommunityIcons name="lock-reset" size={48} color="#F59E0B" />
                                    <Text style={styles.roleModalTitle}>
                                        {resetStage === 'email' ? 'Forgot Password?' : 'Reset Password'}
                                    </Text>
                                    <Text style={styles.roleModalSubtitle}>
                                        {resetStage === 'email'
                                            ? 'Enter your email to receive a reset code'
                                            : `Enter the code sent to ${resetEmail}`}
                                    </Text>
                                </View>

                                {resetStage === 'email' ? (
                                    <View>
                                        <View style={[styles.inputContainer, { backgroundColor: '#F3F4F6' }]}>
                                            <Feather name="mail" size={20} color="#F59E0B" />
                                            <TextInput
                                                style={styles.input}
                                                placeholder="Enter your email"
                                                placeholderTextColor="#9CA3AF"
                                                value={resetEmail}
                                                onChangeText={setResetEmail}
                                                autoCapitalize="none"
                                                keyboardType="email-address"
                                            />
                                        </View>

                                        <TouchableOpacity
                                            style={styles.loginBtn}
                                            onPress={requestResetCode}
                                            disabled={resetLoading}
                                        >
                                            <LinearGradient
                                                colors={['#F59E0B', '#D97706']}
                                                start={{ x: 0, y: 0 }}
                                                end={{ x: 1, y: 0 }}
                                                style={styles.loginGradient}
                                            >
                                                <Text style={styles.loginText}>
                                                    {resetLoading ? "Sending..." : "Send Reset Code"}
                                                </Text>
                                            </LinearGradient>
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    <View>
                                        <View style={[styles.inputContainer, { backgroundColor: '#F3F4F6' }]}>
                                            <MaterialCommunityIcons name="numeric" size={20} color="#F59E0B" />
                                            <TextInput
                                                style={styles.input}
                                                placeholder="6-digit Code"
                                                placeholderTextColor="#9CA3AF"
                                                value={resetToken}
                                                onChangeText={setResetToken}
                                                keyboardType="numeric"
                                                maxLength={6}
                                            />
                                        </View>

                                        <View style={[styles.inputContainer, { backgroundColor: '#F3F4F6' }]}>
                                            <Feather name="lock" size={20} color="#F59E0B" />
                                            <TextInput
                                                style={styles.input}
                                                placeholder="New Password"
                                                placeholderTextColor="#9CA3AF"
                                                value={newPassword}
                                                onChangeText={setNewPassword}
                                                secureTextEntry
                                            />
                                        </View>

                                        <View style={[styles.inputContainer, { backgroundColor: '#F3F4F6' }]}>
                                            <Feather name="lock" size={20} color="#F59E0B" />
                                            <TextInput
                                                style={styles.input}
                                                placeholder="Confirm Password"
                                                placeholderTextColor="#9CA3AF"
                                                value={confirmPassword}
                                                onChangeText={setConfirmPassword}
                                                secureTextEntry
                                            />
                                        </View>

                                        <TouchableOpacity
                                            style={styles.loginBtn}
                                            onPress={submitPasswordReset}
                                            disabled={resetLoading}
                                        >
                                            <LinearGradient
                                                colors={['#F59E0B', '#D97706']}
                                                start={{ x: 0, y: 0 }}
                                                end={{ x: 1, y: 0 }}
                                                style={styles.loginGradient}
                                            >
                                                <Text style={styles.loginText}>
                                                    {resetLoading ? "Resetting..." : "Reset Password"}
                                                </Text>
                                            </LinearGradient>
                                        </TouchableOpacity>
                                    </View>
                                )}

                                <TouchableOpacity
                                    onPress={() => setShowForgotPasswordModal(false)}
                                    style={{ alignSelf: 'center', marginTop: 10, padding: 10 }}
                                >
                                    <Text style={{ color: '#6B7280', fontSize: 14, fontFamily: 'Poppins_500Medium' }}>Cancel</Text>
                                </TouchableOpacity>
                            </View>
                        </Animated.ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* CUSTOM ALERT COMPONENT */}
            <CustomAlert
                visible={alertVisible}
                title={alertConfig.title}
                message={alertConfig.message}
                type={alertConfig.type}
                onClose={() => setAlertVisible(false)}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    floatingWaffle: {
        position: 'absolute',
        opacity: 0.4,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sparkle: {
        position: 'absolute',
    },
    keyboardView: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    card: {
        width: '100%',
        maxWidth: 400,
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
        borderRadius: 32,
        padding: 28,
        shadowColor: '#F59E0B',
        shadowOffset: { width: 0, height: 20 },
        shadowOpacity: 0.3,
        shadowRadius: 30,
        elevation: 15,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.5)',
    },
    header: {
        alignItems: 'center',
        marginBottom: 32,
    },
    welcomeText: {
        fontSize: 16,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
        marginBottom: 4,
    },
    brandText: {
        fontSize: 28,
        fontFamily: 'Poppins_700Bold',
        color: '#111827',
        marginBottom: 8,
    },
    tagline: {
        fontSize: 13,
        fontFamily: 'Poppins_500Medium',
        color: '#F59E0B',
        letterSpacing: 2,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        borderRadius: 16,
        paddingHorizontal: 16,
        height: 56,
        marginBottom: 16,
        borderWidth: 2,
        borderColor: 'rgba(245, 158, 11, 0.1)',
    },
    input: {
        flex: 1,
        marginLeft: 12,
        fontSize: 15,
        fontFamily: 'Poppins_500Medium',
        color: '#111827',
    },
    forgotBtn: {
        alignSelf: 'flex-end',
        marginBottom: 24,
    },
    forgotText: {
        fontSize: 13,
        fontFamily: 'Poppins_500Medium',
        color: '#F59E0B',
    },
    loginBtn: {
        borderRadius: 16,
        overflow: 'hidden',
        marginBottom: 20,
        shadowColor: '#F59E0B',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
        elevation: 8,
    },
    loginGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 56,
        gap: 8,
    },
    loginText: {
        fontSize: 17,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
    },
    hintBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F3F4F6',
        padding: 12,
        borderRadius: 12,
        gap: 8,
    },
    hintText: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
        flex: 1,
    },
    // Role Selection Modal
    modalOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    roleModalCard: {
        width: '100%',
        maxWidth: 450,
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 20 },
        shadowOpacity: 0.3,
        shadowRadius: 30,
        elevation: 20,
    },
    roleModalHeader: {
        alignItems: 'center',
        marginBottom: 24,
    },
    roleModalTitle: {
        fontSize: 24,
        fontFamily: 'Poppins_700Bold',
        color: '#111827',
        marginTop: 12,
        marginBottom: 8,
    },
    roleModalSubtitle: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
        textAlign: 'center',
        lineHeight: 20,
    },
    roleModeButton: {
        borderRadius: 16,
        overflow: 'hidden',
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
        elevation: 8,
    },
    roleModeGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        gap: 12,
    },
    roleModeIconBox: {
        width: 56,
        height: 56,
        borderRadius: 16,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    roleModeContent: {
        flex: 1,
    },
    roleModeTitle: {
        fontSize: 18,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
        marginBottom: 4,
    },
    roleModeDescription: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: 'rgba(255, 255, 255, 0.9)',
        lineHeight: 18,
    },
    roleModalFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F3F4F6',
        padding: 12,
        borderRadius: 12,
        gap: 8,
        marginTop: 8,
    },
    roleModalFooterText: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
        flex: 1,
        lineHeight: 16,
    },
});
