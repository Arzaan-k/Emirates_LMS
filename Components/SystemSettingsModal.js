import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Switch, ActivityIndicator, Alert, SafeAreaView } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import API_URL from '../config';

export default function SystemSettingsModal({ visible, onClose }) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [allowScreenshots, setAllowScreenshots] = useState(false);

    useEffect(() => {
        if (visible) {
            fetchSettings();
        }
    }, [visible]);

    const fetchSettings = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/api/v1/system/settings`);
            if (res.ok) {
                const data = await res.json();
                setAllowScreenshots(data?.settings?.allow_screenshots?.value_bool || false);
            }
        } catch (error) {
            console.error("Error fetching system settings:", error);
            Alert.alert("Error", "Failed to load system settings.");
        } finally {
            setLoading(false);
        }
    };

    const toggleScreenshots = async (value) => {
        setAllowScreenshots(value); // Optimistic UI update
        setSaving(true);
        try {
            // Need to pass superadmin token, assume we can get it from AsyncStorage or if backend allows without
            // Or we just send the update. The endpoint requires require_superadmin which needs bearer token.
            const token = await AsyncStorage.getItem('userToken');
            const res = await fetch(`${API_URL}/api/v1/system/settings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    key: "allow_screenshots",
                    value_bool: value
                })
            });

            if (!res.ok) {
                throw new Error("Failed to update");
            }
        } catch (error) {
            console.error(error);
            Alert.alert("Error", "Failed to update setting");
            setAllowScreenshots(!value); // Revert
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                        <Feather name="x" size={24} color="#1F2937" />
                    </TouchableOpacity>
                    <Text style={styles.title}>System Settings</Text>
                    <View style={{ width: 40 }} />
                </View>

                {loading ? (
                    <View style={styles.loader}>
                        <ActivityIndicator size="large" color="#6366F1" />
                    </View>
                ) : (
                    <View style={styles.content}>
                        <View style={styles.settingRow}>
                            <View style={styles.settingInfo}>
                                <View style={styles.settingTitleRow}>
                                    <MaterialCommunityIcons name="monitor-screenshot" size={20} color="#6366F1" />
                                    <Text style={styles.settingTitle}>Allow Screenshots</Text>
                                </View>
                                <Text style={styles.settingDesc}>
                                    Enable or disable screenshot and screen recording functionality across the entire application for all users.
                                </Text>
                            </View>
                            <Switch
                                value={allowScreenshots}
                                onValueChange={toggleScreenshots}
                                trackColor={{ false: "#D1D5DB", true: "#A78BFA" }}
                                thumbColor={allowScreenshots ? "#6366F1" : "#F3F4F6"}
                                disabled={saving}
                            />
                        </View>
                    </View>
                )}
            </SafeAreaView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F9FAFB' },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 16,
        backgroundColor: '#FFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB'
    },
    title: { fontSize: 18, fontFamily: 'Poppins_600SemiBold', color: '#111827' },
    closeBtn: {
        width: 40, height: 40,
        borderRadius: 20,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
        justifyContent: 'center'
    },
    loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    content: { padding: 16 },
    settingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#FFF',
        padding: 16,
        borderRadius: 12,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 2,
    },
    settingInfo: { flex: 1, paddingRight: 16 },
    settingTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
    settingTitle: { fontSize: 16, fontFamily: 'Poppins_500Medium', color: '#1F2937', marginLeft: 8 },
    settingDesc: { fontSize: 13, fontFamily: 'Poppins_400Regular', color: '#6B7280', lineHeight: 18 }
});
