import React, { useState } from 'react';
import {
    View,
    Text,
    Modal,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    ScrollView,
    Pressable,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

const CreateUser = ({
    visible = false,
    onClose = () => { },   // ✅ SAFE DEFAULT
    onCreate = () => { },  // ✅ SAFE DEFAULT
}) => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState('Employee');

    const handleCreate = () => {
        if (!name || !email || !password) return;

        const payload = { name, email, password, role };
        onCreate(payload);

        // reset
        setName('');
        setEmail('');
        setPassword('');
        setRole('Employee');
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent
            onRequestClose={onClose} // Android back button
        >
            {/* Overlay */}
            <Pressable style={styles.overlay} onPress={onClose}>
                <Pressable style={styles.card} onPress={() => { }}>
                    {/* Header */}
                    <View style={styles.header}>
                        <View>
                            <Text style={styles.title}>Create User</Text>
                            <Text style={styles.subtitle}>
                                Add a new team member
                            </Text>
                        </View>
                        <TouchableOpacity onPress={onClose}>
                            <Feather name="x" size={24} color="#475569" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false}>
                        {/* Name */}
                        <Text style={styles.label}>Full Name</Text>
                        <View style={styles.inputBox}>
                            <Feather name="user" size={18} color="#64748B" />
                            <TextInput
                                placeholder="John Doe"
                                style={styles.input}
                                value={name}
                                onChangeText={setName}
                            />
                        </View>

                        {/* Email */}
                        <Text style={styles.label}>Email</Text>
                        <View style={styles.inputBox}>
                            <Feather name="mail" size={18} color="#64748B" />
                            <TextInput
                                placeholder="john@email.com"
                                style={styles.input}
                                keyboardType="email-address"
                                autoCapitalize="none"
                                value={email}
                                onChangeText={setEmail}
                            />
                        </View>

                        {/* Password */}
                        <Text style={styles.label}>Password</Text>
                        <View style={styles.inputBox}>
                            <Feather name="lock" size={18} color="#64748B" />
                            <TextInput
                                placeholder="••••••••"
                                style={styles.input}
                                secureTextEntry
                                value={password}
                                onChangeText={setPassword}
                            />
                        </View>

                        {/* Role */}
                        <Text style={styles.label}>User Role</Text>
                        <View style={styles.roleRow}>
                            {['Admin', 'Employee', 'User'].map(r => (
                                <TouchableOpacity
                                    key={r}
                                    style={[
                                        styles.roleBtn,
                                        role === r && styles.roleActive,
                                    ]}
                                    onPress={() => setRole(r)}
                                >
                                    <Text
                                        style={[
                                            styles.roleText,
                                            role === r && styles.roleTextActive,
                                        ]}
                                    >
                                        {r}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* Create Button */}
                        <TouchableOpacity
                            style={[
                                styles.createBtn,
                                (!name || !email || !password) && {
                                    opacity: 0.6,
                                },
                            ]}
                            onPress={handleCreate}
                            disabled={!name || !email || !password}
                        >
                            <Feather name="user-plus" size={18} color="#fff" />
                            <Text style={styles.createText}>Create User</Text>
                        </TouchableOpacity>
                    </ScrollView>
                </Pressable>
            </Pressable>
        </Modal>
    );
};

export default CreateUser;

/* ================= STYLES ================= */

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(15,23,42,0.5)',
        justifyContent: 'center',
        padding: 20,
    },
    card: {
        backgroundColor: '#fff',
        borderRadius: 22,
        padding: 20,
        maxHeight: '90%',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 18,
    },
    title: {
        fontSize: 22,
        fontWeight: '800',
        color: '#0F172A',
    },
    subtitle: {
        fontSize: 13,
        color: '#64748B',
        marginTop: 2,
    },
    label: {
        fontSize: 13,
        fontWeight: '600',
        color: '#475569',
        marginBottom: 6,
        marginTop: 14,
    },
    inputBox: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderRadius: 14,
        paddingHorizontal: 12,
        height: 50,
        backgroundColor: '#F8FAFC',
    },
    input: {
        flex: 1,
        marginLeft: 10,
        fontSize: 15,
        color: '#0F172A',
    },
    roleRow: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 8,
    },
    roleBtn: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
    },
    roleActive: {
        backgroundColor: '#EEF2FF',
        borderColor: '#6366F1',
    },
    roleText: {
        fontSize: 14,
        color: '#475569',
        fontWeight: '600',
    },
    roleTextActive: {
        color: '#4F46E5',
    },
    createBtn: {
        flexDirection: 'row',
        backgroundColor: '#4F46E5',
        borderRadius: 16,
        paddingVertical: 15,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
        marginTop: 26,
    },
    createText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
});
