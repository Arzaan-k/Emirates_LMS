import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert,
    Platform, Modal, TextInput, Image, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, MaterialIcons } from '@expo/vector-icons';
import { LANGUAGES, useLanguage } from '../context/language.context';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CommonActions } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import SupportTicketModal from '../Components/SupportTicketModal';
import API_URL from '../config';

const getToken = async () => {
    try {
        // Token is stored as 'userToken' by Login.js
        if (Platform.OS === 'web') return await AsyncStorage.getItem('userToken');
        return await SecureStore.getItemAsync('userToken');
    } catch { return null; }
};

const getUserProfile = async () => {
    try {
        const raw = await AsyncStorage.getItem('userProfile');
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
};

const saveUserProfile = async (profile) => {
    try {
        await AsyncStorage.setItem('userProfile', JSON.stringify(profile));
    } catch { }
};

export default function Settings({ navigation, route }) {
    const insets = useSafeAreaInsets();
    const { language, changeLanguage, t } = useLanguage();
    const [showSupport, setShowSupport] = useState(false);

    // User profile state
    const [userProfile, setUserProfile] = useState(route?.params?.userProfile || null);

    // Update Profile modal
    const [profileModalVisible, setProfileModalVisible] = useState(false);
    const [editName, setEditName] = useState('');
    const [editContact, setEditContact] = useState('');
    const [profilePicUri, setProfilePicUri] = useState(null); // local uri for display
    const [profilePicBase64, setProfilePicBase64] = useState(null);
    const [savingProfile, setSavingProfile] = useState(false);

    // Change Email flow
    const [emailModalVisible, setEmailModalVisible] = useState(false);
    const [newEmail, setNewEmail] = useState('');
    const [emailOtp, setEmailOtp] = useState('');
    const [emailStep, setEmailStep] = useState('input'); // 'input' | 'otp'
    const [emailLoading, setEmailLoading] = useState(false);

    // Change Password flow
    const [passwordModalVisible, setPasswordModalVisible] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordLoading, setPasswordLoading] = useState(false);
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);

    useEffect(() => {
        // Load user profile from storage if not passed via params
        if (!userProfile) {
            getUserProfile().then(p => {
                if (p) setUserProfile(p);
            });
        }
    }, []);

    useEffect(() => {
        if (userProfile) {
            setEditName(userProfile.name || '');
            setEditContact(userProfile.profile_data?.['Contact Number'] || '');
            const pic = userProfile.profile_data?.['profile_pic'];
            if (pic) setProfilePicUri(pic);
        }
    }, [userProfile]);

    const handleLogout = async () => {
        Alert.alert("Logout", "Are you sure you want to logout?", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Logout", style: "destructive",
                onPress: async () => {
                    try {
                        if (Platform.OS === 'web') {
                            await AsyncStorage.removeItem('userToken');
                            await AsyncStorage.removeItem('userRole');
                        } else {
                            await SecureStore.deleteItemAsync('userToken');
                            await SecureStore.deleteItemAsync('userRole');
                        }
                        await AsyncStorage.removeItem('userProfile');
                        navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Login' }] }));
                    } catch (e) {
                        Alert.alert("Error", "Failed to logout. Please try again.");
                    }
                }
            }
        ]);
    };

    // ── Profile Picture ──
    const pickProfilePicture = async () => {
        try {
            if (Platform.OS !== 'web') {
                const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                if (status !== 'granted') {
                    Alert.alert('Permission needed', 'Please allow access to your photo library.');
                    return;
                }
            }
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.5,
                base64: true,
            });
            if (!result.canceled && result.assets?.[0]) {
                const asset = result.assets[0];
                const dataUrl = `data:image/jpeg;base64,${asset.base64}`;
                setProfilePicUri(asset.uri);
                setProfilePicBase64(dataUrl);
            }
        } catch (err) {
            Alert.alert('Error', 'Could not pick image.');
        }
    };

    // ── Save Profile ──
    const handleSaveProfile = async () => {
        if (!userProfile?.email) return;
        setSavingProfile(true);
        try {
            const token = await getToken();
            const payload = { name: editName, 'Contact Number': editContact };
            if (profilePicBase64) payload['profile_pic'] = profilePicBase64;

            const res = await fetch(`${API_URL}/api/v1/users/me/profile`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (res.ok && data.user) {
                const updated = data.user;
                setUserProfile(updated);
                await saveUserProfile(updated);
                setProfilePicBase64(null);
                setProfileModalVisible(false);
                Alert.alert('Success', 'Profile updated successfully!');
            } else if (res.status === 401) {
                // Token expired or invalid
                Alert.alert(
                    'Session Expired',
                    'Your session has expired. Please log in again.',
                    [
                        {
                            text: 'OK',
                            onPress: () => {
                                // Clear storage and redirect to login
                                handleLogout();
                            }
                        }
                    ]
                );
            } else {
                Alert.alert('Error', data.detail || 'Failed to update profile');
            }
        } catch (err) {
            console.error('Profile update error:', err);
            Alert.alert('Error', 'Network error. Please try again.');
        } finally {
            setSavingProfile(false);
        }
    };

    // ── Change Email ──
    const handleRequestEmailChange = async () => {
        if (!newEmail.includes('@')) {
            Alert.alert('Invalid email', 'Please enter a valid email address.');
            return;
        }
        setEmailLoading(true);
        try {
            const token = await getToken();
            const res = await fetch(`${API_URL}/api/v1/users/me/change-email/request`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ new_email: newEmail }),
            });
            const data = await res.json();
            if (res.ok) {
                setEmailStep('otp');
                // In dev/testing: show OTP from response. Remove in production.
                if (data.otp) Alert.alert('OTP (Testing)', `Your OTP is: ${data.otp}`);
            } else {
                Alert.alert('Error', data.detail || 'Failed to send OTP');
            }
        } catch {
            Alert.alert('Error', 'Network error');
        } finally {
            setEmailLoading(false);
        }
    };

    const handleVerifyEmailChange = async () => {
        if (emailOtp.length !== 6) {
            Alert.alert('Invalid OTP', 'Please enter the 6-digit OTP.');
            return;
        }
        setEmailLoading(true);
        try {
            const token = await getToken();
            const res = await fetch(`${API_URL}/api/v1/users/me/change-email/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ otp: emailOtp }),
            });
            const data = await res.json();
            if (res.ok && data.user) {
                setUserProfile(data.user);
                await saveUserProfile(data.user);
                setEmailModalVisible(false);
                setEmailStep('input');
                setNewEmail('');
                setEmailOtp('');
                Alert.alert('Success', 'Email updated! Please log in again with your new email.');
            } else {
                Alert.alert('Error', data.detail || 'Invalid or expired OTP');
            }
        } catch {
            Alert.alert('Error', 'Network error');
        } finally {
            setEmailLoading(false);
        }
    };

    // ── Change Password ──
    const handleChangePassword = async () => {
        if (!currentPassword || !newPassword) {
            Alert.alert('Required', 'Please fill in all password fields.');
            return;
        }
        if (newPassword !== confirmPassword) {
            Alert.alert('Mismatch', 'New passwords do not match.');
            return;
        }
        if (newPassword.length < 6) {
            Alert.alert('Too short', 'Password must be at least 6 characters.');
            return;
        }
        setPasswordLoading(true);
        try {
            const token = await getToken();
            const res = await fetch(`${API_URL}/api/v1/users/me/change-password`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
            });
            const data = await res.json();
            if (res.ok) {
                setPasswordModalVisible(false);
                setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
                Alert.alert('Success', 'Password changed successfully!');
            } else {
                Alert.alert('Error', data.detail || 'Failed to change password');
            }
        } catch {
            Alert.alert('Error', 'Network error');
        } finally {
            setPasswordLoading(false);
        }
    };

    const displayPic = profilePicUri || userProfile?.profile_data?.['profile_pic'] || null;

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Feather name="arrow-left" size={24} color="#111827" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{t('settings') || 'Settings'}</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={styles.content}>

                {/* Profile Preview Card */}
                {userProfile && (
                    <TouchableOpacity style={styles.profileCard} onPress={() => setProfileModalVisible(true)}>
                        <View style={styles.avatarWrap}>
                            {displayPic ? (
                                <Image source={{ uri: displayPic }} style={styles.avatarImg} />
                            ) : (
                                <View style={styles.avatarPlaceholder}>
                                    <Text style={styles.avatarInitial}>
                                        {(userProfile.name || 'U')[0].toUpperCase()}
                                    </Text>
                                </View>
                            )}
                            <View style={styles.avatarEditBadge}>
                                <Feather name="camera" size={10} color="#FFF" />
                            </View>
                        </View>
                        <View style={{ flex: 1, marginLeft: 14 }}>
                            <Text style={styles.profileName}>{userProfile.name}</Text>
                            <Text style={styles.profileEmail}>{userProfile.email}</Text>
                            <Text style={styles.profileRole}>{userProfile.role}</Text>
                        </View>
                        <Feather name="edit-2" size={16} color="#9CA3AF" />
                    </TouchableOpacity>
                )}

                {/* My Account section */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>My Account</Text>
                    <View style={styles.card}>
                        <TouchableOpacity style={styles.optionRow} onPress={() => setProfileModalVisible(true)}>
                            <View style={styles.optionLeft}>
                                <Feather name="user" size={20} color="#4B5563" />
                                <Text style={styles.optionText}>Update Profile</Text>
                            </View>
                            <Feather name="chevron-right" size={20} color="#9CA3AF" />
                        </TouchableOpacity>
                        <View style={styles.divider} />
                        <TouchableOpacity style={styles.optionRow} onPress={() => { setEmailStep('input'); setEmailModalVisible(true); }}>
                            <View style={styles.optionLeft}>
                                <Feather name="mail" size={20} color="#4B5563" />
                                <Text style={styles.optionText}>Change Email</Text>
                            </View>
                            <Feather name="chevron-right" size={20} color="#9CA3AF" />
                        </TouchableOpacity>
                        <View style={styles.divider} />
                        <TouchableOpacity style={styles.optionRow} onPress={() => setPasswordModalVisible(true)}>
                            <View style={styles.optionLeft}>
                                <Feather name="lock" size={20} color="#4B5563" />
                                <Text style={styles.optionText}>Change Password</Text>
                            </View>
                            <Feather name="chevron-right" size={20} color="#9CA3AF" />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Language Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>{t('language') || 'Language'}</Text>
                    <View style={styles.card}>
                        {Object.entries(LANGUAGES).map(([code, name], index) => (
                            <TouchableOpacity
                                key={code}
                                style={[styles.optionRow, index !== Object.keys(LANGUAGES).length - 1 && styles.divider]}
                                onPress={() => changeLanguage(code)}
                            >
                                <View style={styles.optionLeft}>
                                    <Feather name="globe" size={20} color="#4B5563" />
                                    <Text style={styles.optionText}>{name}</Text>
                                </View>
                                {language === code && <Feather name="check" size={20} color="#10B981" />}
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* Support */}
                <View style={styles.section}>
                    <View style={styles.card}>
                        <TouchableOpacity style={styles.optionRow} onPress={() => setShowSupport(true)}>
                            <View style={styles.optionLeft}>
                                <Feather name="help-circle" size={20} color="#4B5563" />
                                <Text style={styles.optionText}>{t('support') || 'Support'}</Text>
                            </View>
                            <Feather name="chevron-right" size={20} color="#9CA3AF" />
                        </TouchableOpacity>
                    </View>
                </View>

                <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
                    <Feather name="log-out" size={20} color="#EF4444" style={{ marginRight: 8 }} />
                    <Text style={styles.logoutText}>{t('logout') || 'Logout'}</Text>
                </TouchableOpacity>

            </ScrollView>

            {/* Support Modal */}
            <SupportTicketModal
                visible={showSupport}
                onClose={() => setShowSupport(false)}
                userEmail={userProfile?.email || ''}
                userName={userProfile?.name || ''}
            />

            {/* ── Update Profile Modal ── */}
            <Modal visible={profileModalVisible} animationType="slide" transparent onRequestClose={() => setProfileModalVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Update Profile</Text>
                            <TouchableOpacity onPress={() => setProfileModalVisible(false)}>
                                <Feather name="x" size={22} color="#374151" />
                            </TouchableOpacity>
                        </View>

                        <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator={false}>
                            {/* Profile Picture */}
                            <View style={styles.picSection}>
                                <TouchableOpacity onPress={pickProfilePicture} style={styles.picWrap}>
                                    {(profilePicUri || displayPic) ? (
                                        <Image source={{ uri: profilePicUri || displayPic }} style={styles.picImg} />
                                    ) : (
                                        <View style={styles.picPlaceholder}>
                                            <Feather name="user" size={36} color="#9CA3AF" />
                                        </View>
                                    )}
                                    <View style={styles.picOverlay}>
                                        <Feather name="camera" size={18} color="#FFF" />
                                        <Text style={styles.picOverlayTxt}>Change Photo</Text>
                                    </View>
                                </TouchableOpacity>
                            </View>

                            <View style={styles.fieldWrap}>
                                <Text style={styles.fieldLabel}>Full Name</Text>
                                <TextInput
                                    style={styles.fieldInput}
                                    value={editName}
                                    onChangeText={setEditName}
                                    placeholder="Your full name"
                                    placeholderTextColor="#9CA3AF"
                                />
                            </View>

                            <View style={styles.fieldWrap}>
                                <Text style={styles.fieldLabel}>Contact Number</Text>
                                <TextInput
                                    style={styles.fieldInput}
                                    value={editContact}
                                    onChangeText={setEditContact}
                                    placeholder="Your phone number"
                                    placeholderTextColor="#9CA3AF"
                                    keyboardType="phone-pad"
                                />
                            </View>

                            <View style={styles.fieldWrap}>
                                <Text style={styles.fieldLabel}>Email</Text>
                                <Text style={styles.fieldReadOnly}>{userProfile?.email}</Text>
                                <Text style={styles.fieldHint}>To change email, use "Change Email" option in Settings.</Text>
                            </View>
                        </ScrollView>

                        <TouchableOpacity
                            style={[styles.saveBtn, savingProfile && { opacity: 0.6 }]}
                            onPress={handleSaveProfile}
                            disabled={savingProfile}
                        >
                            {savingProfile ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.saveBtnTxt}>Save Changes</Text>}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* ── Change Email Modal ── */}
            <Modal visible={emailModalVisible} animationType="slide" transparent onRequestClose={() => { setEmailModalVisible(false); setEmailStep('input'); }}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>{emailStep === 'input' ? 'Change Email' : 'Verify OTP'}</Text>
                            <TouchableOpacity onPress={() => { setEmailModalVisible(false); setEmailStep('input'); setNewEmail(''); setEmailOtp(''); }}>
                                <Feather name="x" size={22} color="#374151" />
                            </TouchableOpacity>
                        </View>

                        {emailStep === 'input' ? (
                            <>
                                <Text style={styles.modalDesc}>Enter your new email address. An OTP will be sent to verify it.</Text>
                                <View style={styles.fieldWrap}>
                                    <Text style={styles.fieldLabel}>New Email Address</Text>
                                    <TextInput
                                        style={styles.fieldInput}
                                        value={newEmail}
                                        onChangeText={setNewEmail}
                                        placeholder="new@email.com"
                                        placeholderTextColor="#9CA3AF"
                                        keyboardType="email-address"
                                        autoCapitalize="none"
                                    />
                                </View>
                                <TouchableOpacity style={[styles.saveBtn, emailLoading && { opacity: 0.6 }]} onPress={handleRequestEmailChange} disabled={emailLoading}>
                                    {emailLoading ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.saveBtnTxt}>Send OTP</Text>}
                                </TouchableOpacity>
                            </>
                        ) : (
                            <>
                                <Text style={styles.modalDesc}>Enter the 6-digit OTP sent to <Text style={{ fontWeight: '700' }}>{newEmail}</Text></Text>
                                <View style={styles.fieldWrap}>
                                    <Text style={styles.fieldLabel}>OTP Code</Text>
                                    <TextInput
                                        style={[styles.fieldInput, { letterSpacing: 6, fontSize: 20, textAlign: 'center' }]}
                                        value={emailOtp}
                                        onChangeText={setEmailOtp}
                                        placeholder="000000"
                                        placeholderTextColor="#9CA3AF"
                                        keyboardType="number-pad"
                                        maxLength={6}
                                    />
                                </View>
                                <TouchableOpacity style={[styles.saveBtn, emailLoading && { opacity: 0.6 }]} onPress={handleVerifyEmailChange} disabled={emailLoading}>
                                    {emailLoading ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.saveBtnTxt}>Verify & Update Email</Text>}
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.resendBtn} onPress={() => { setEmailStep('input'); setEmailOtp(''); }}>
                                    <Text style={styles.resendTxt}>← Back / Resend OTP</Text>
                                </TouchableOpacity>
                            </>
                        )}
                    </View>
                </View>
            </Modal>

            {/* ── Change Password Modal ── */}
            <Modal visible={passwordModalVisible} animationType="slide" transparent onRequestClose={() => setPasswordModalVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Change Password</Text>
                            <TouchableOpacity onPress={() => { setPasswordModalVisible(false); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); }}>
                                <Feather name="x" size={22} color="#374151" />
                            </TouchableOpacity>
                        </View>

                        {[
                            { label: 'Current Password', value: currentPassword, setter: setCurrentPassword, show: showCurrent, toggleShow: () => setShowCurrent(v => !v) },
                            { label: 'New Password', value: newPassword, setter: setNewPassword, show: showNew, toggleShow: () => setShowNew(v => !v) },
                            { label: 'Confirm New Password', value: confirmPassword, setter: setConfirmPassword, show: showNew, toggleShow: () => setShowNew(v => !v) },
                        ].map(({ label, value, setter, show, toggleShow }) => (
                            <View key={label} style={styles.fieldWrap}>
                                <Text style={styles.fieldLabel}>{label}</Text>
                                <View style={styles.pwdRow}>
                                    <TextInput
                                        style={[styles.fieldInput, { flex: 1, marginBottom: 0 }]}
                                        value={value}
                                        onChangeText={setter}
                                        placeholder={label}
                                        placeholderTextColor="#9CA3AF"
                                        secureTextEntry={!show}
                                    />
                                    <TouchableOpacity onPress={toggleShow} style={styles.eyeBtn}>
                                        <Feather name={show ? 'eye-off' : 'eye'} size={18} color="#6B7280" />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ))}

                        <TouchableOpacity style={[styles.saveBtn, passwordLoading && { opacity: 0.6 }]} onPress={handleChangePassword} disabled={passwordLoading}>
                            {passwordLoading ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.saveBtnTxt}>Update Password</Text>}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F9FAFB' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 20, backgroundColor: '#FFF' },
    backBtn: { padding: 8, borderRadius: 8, backgroundColor: '#F3F4F6' },
    headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
    content: { padding: 20, paddingBottom: 100 },
    section: { marginBottom: 20 },
    sectionTitle: { fontSize: 13, fontWeight: '600', color: '#6B7280', marginBottom: 8, marginLeft: 4 },
    card: { backgroundColor: '#FFF', borderRadius: 16, overflow: 'hidden', elevation: 2, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 },
    optionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
    divider: { height: 1, backgroundColor: '#F3F4F6', marginHorizontal: 16 },
    optionLeft: { flexDirection: 'row', alignItems: 'center' },
    optionText: { fontSize: 15, fontWeight: '500', color: '#111827', marginLeft: 12 },
    logoutBtn: { flexDirection: 'row', backgroundColor: '#FEE2E2', padding: 16, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
    logoutText: { color: '#EF4444', fontWeight: '700', fontSize: 16 },

    // Profile card
    profileCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 20, elevation: 2, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 3 },
    avatarWrap: { position: 'relative' },
    avatarImg: { width: 52, height: 52, borderRadius: 26 },
    avatarPlaceholder: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#FEF3C7', justifyContent: 'center', alignItems: 'center' },
    avatarInitial: { fontSize: 22, fontWeight: '700', color: '#B45309' },
    avatarEditBadge: { position: 'absolute', bottom: 0, right: 0, width: 18, height: 18, borderRadius: 9, backgroundColor: '#F59E0B', justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#FFF' },
    profileName: { fontSize: 15, fontWeight: '700', color: '#111827' },
    profileEmail: { fontSize: 12, color: '#6B7280', marginTop: 1 },
    profileRole: { fontSize: 11, color: '#F59E0B', fontWeight: '600', marginTop: 2 },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalCard: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
    modalTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
    modalDesc: { fontSize: 14, color: '#6B7280', marginBottom: 16, lineHeight: 20 },

    // Profile pic
    picSection: { alignItems: 'center', marginBottom: 20 },
    picWrap: { position: 'relative' },
    picImg: { width: 90, height: 90, borderRadius: 45 },
    picPlaceholder: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
    picOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 32, borderBottomLeftRadius: 45, borderBottomRightRadius: 45, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4 },
    picOverlayTxt: { color: '#FFF', fontSize: 10, fontWeight: '600' },

    // Fields
    fieldWrap: { marginBottom: 14 },
    fieldLabel: { fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6 },
    fieldInput: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#111827', backgroundColor: '#FAFAFA' },
    fieldReadOnly: { fontSize: 14, color: '#6B7280', paddingVertical: 10, paddingHorizontal: 14, backgroundColor: '#F3F4F6', borderRadius: 10 },
    fieldHint: { fontSize: 11, color: '#9CA3AF', marginTop: 4 },

    // Password
    pwdRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, backgroundColor: '#FAFAFA', overflow: 'hidden' },
    eyeBtn: { paddingHorizontal: 12, paddingVertical: 10 },

    saveBtn: { backgroundColor: '#F59E0B', borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 8 },
    saveBtnTxt: { color: '#FFF', fontWeight: '700', fontSize: 15 },
    resendBtn: { alignItems: 'center', paddingVertical: 12 },
    resendTxt: { color: '#6B7280', fontSize: 13 },
});
