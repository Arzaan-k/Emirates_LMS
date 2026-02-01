import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    TextInput,
    ScrollView,
    Alert,
    ActivityIndicator,
    Platform,
    Switch
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker from '@react-native-community/datetimepicker';
import API_URL from '../config';

const DURATION_OPTIONS = [
    { label: '15 min', value: 15 },
    { label: '30 min', value: 30 },
    { label: '45 min', value: 45 },
    { label: '1 hour', value: 60 },
    { label: '1.5 hours', value: 90 },
    { label: '2 hours', value: 120 },
];

export default function MeetingSchedulerModal({ visible, onClose, hostName, hostEmail }) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [scheduledDate, setScheduledDate] = useState(new Date());
    const [duration, setDuration] = useState(30);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [loading, setLoading] = useState(false);

    // User invite states
    const [users, setUsers] = useState([]);
    const [selectedUsers, setSelectedUsers] = useState([]);
    const [userSearchQuery, setUserSearchQuery] = useState('');
    const [inviteAll, setInviteAll] = useState(true);
    const [loadingUsers, setLoadingUsers] = useState(false);

    // Fetch users when modal opens
    useEffect(() => {
        if (visible && !inviteAll) {
            fetchUsers();
        }
    }, [visible, inviteAll]);

    const fetchUsers = async () => {
        setLoadingUsers(true);
        try {
            const response = await fetch(`${API_URL}/api/v1/users/list?limit=100`);
            const data = await response.json();
            setUsers(data.users || []);
        } catch (error) {
            console.error('Error fetching users:', error);
        } finally {
            setLoadingUsers(false);
        }
    };

    const toggleUserSelection = (user) => {
        setSelectedUsers(prev => {
            const exists = prev.find(u => u.email === user.email);
            if (exists) {
                return prev.filter(u => u.email !== user.email);
            } else {
                return [...prev, user];
            }
        });
    };

    const filteredUsers = users.filter(user => {
        const query = userSearchQuery.toLowerCase();
        return user.name?.toLowerCase().includes(query) ||
            user.email?.toLowerCase().includes(query) ||
            user.role?.toLowerCase().includes(query);
    });

    const handleScheduleMeeting = async () => {
        if (!title.trim()) {
            Alert.alert('Missing Title', 'Please enter a meeting title.');
            return;
        }

        if (scheduledDate <= new Date()) {
            Alert.alert('Invalid Time', 'Please select a future date and time.');
            return;
        }

        setLoading(true);
        try {
            const formData = new FormData();
            formData.append('title', title.trim());
            formData.append('description', description.trim());
            formData.append('scheduled_at', scheduledDate.toISOString());
            formData.append('duration_minutes', String(duration));
            formData.append('host_name', hostName || 'Manager');
            formData.append('host_email', hostEmail || 'manager@company.com');

            // Add invited users - empty array means invite all
            const invitedEmails = inviteAll ? [] : selectedUsers.map(u => u.email);
            formData.append('invited_users', JSON.stringify(invitedEmails));

            const response = await fetch(`${API_URL}/api/v1/meetings`, {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.status === 'success') {
                const inviteMsg = inviteAll
                    ? 'All users will be notified.'
                    : `${selectedUsers.length} user(s) will be notified.`;
                Alert.alert(
                    '✅ Meeting Scheduled!',
                    `"${title}" is scheduled for ${scheduledDate.toLocaleString()}.\n\n${inviteMsg}`,
                    [{
                        text: 'OK', onPress: () => {
                            resetForm();
                            onClose();
                        }
                    }]
                );
            } else {
                Alert.alert('Error', result.detail || 'Failed to schedule meeting.');
            }
        } catch (error) {
            console.error('Schedule meeting error:', error);
            Alert.alert('Error', 'Network error. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setTitle('');
        setDescription('');
        setScheduledDate(new Date());
        setDuration(30);
        setSelectedUsers([]);
        setUserSearchQuery('');
        setInviteAll(true);
    };

    const handleDateChange = (event, selectedDate) => {
        setShowDatePicker(false);
        if (selectedDate) {
            const newDate = new Date(scheduledDate);
            newDate.setFullYear(selectedDate.getFullYear());
            newDate.setMonth(selectedDate.getMonth());
            newDate.setDate(selectedDate.getDate());
            setScheduledDate(newDate);
        }
    };

    const handleTimeChange = (event, selectedTime) => {
        setShowTimePicker(false);
        if (selectedTime) {
            const newDate = new Date(scheduledDate);
            newDate.setHours(selectedTime.getHours());
            newDate.setMinutes(selectedTime.getMinutes());
            setScheduledDate(newDate);
        }
    };

    if (!visible) return null;

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View style={styles.overlay}>
                <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
                <View style={styles.container}>
                    {/* Header */}
                    <View style={styles.header}>
                        <View style={styles.headerIcon}>
                            <MaterialCommunityIcons name="video-plus" size={28} color="#FFF" />
                        </View>
                        <Text style={styles.headerTitle}>Schedule Meeting</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <Feather name="x" size={24} color="#6B7280" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={styles.form} showsVerticalScrollIndicator={false}>
                        {/* Title */}
                        <Text style={styles.label}>Meeting Title *</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="e.g., Weekly Team Sync"
                            placeholderTextColor="#9CA3AF"
                            value={title}
                            onChangeText={setTitle}
                        />

                        {/* Description */}
                        <Text style={styles.label}>Description (Optional)</Text>
                        <TextInput
                            style={[styles.input, styles.textArea]}
                            placeholder="What will be discussed?"
                            placeholderTextColor="#9CA3AF"
                            value={description}
                            onChangeText={setDescription}
                            multiline
                            numberOfLines={3}
                        />

                        {/* Date & Time Pickers */}
                        <Text style={styles.label}>Date & Time *</Text>
                        <View style={styles.dateTimeRow}>
                            <TouchableOpacity
                                style={styles.dateTimeBtn}
                                onPress={() => setShowDatePicker(true)}
                            >
                                <Feather name="calendar" size={18} color="#6366F1" />
                                <Text style={styles.dateTimeText}>
                                    {scheduledDate.toLocaleDateString()}
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.dateTimeBtn}
                                onPress={() => setShowTimePicker(true)}
                            >
                                <Feather name="clock" size={18} color="#6366F1" />
                                <Text style={styles.dateTimeText}>
                                    {scheduledDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </Text>
                            </TouchableOpacity>
                        </View>

                        {/* Date Picker Modal */}
                        {showDatePicker && (
                            <DateTimePicker
                                value={scheduledDate}
                                mode="date"
                                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                onChange={handleDateChange}
                                minimumDate={new Date()}
                            />
                        )}

                        {/* Time Picker Modal */}
                        {showTimePicker && (
                            <DateTimePicker
                                value={scheduledDate}
                                mode="time"
                                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                onChange={handleTimeChange}
                            />
                        )}

                        {/* Duration */}
                        <Text style={styles.label}>Duration</Text>
                        <View style={styles.durationGrid}>
                            {DURATION_OPTIONS.map((opt) => (
                                <TouchableOpacity
                                    key={opt.value}
                                    style={[
                                        styles.durationChip,
                                        duration === opt.value && styles.durationChipActive
                                    ]}
                                    onPress={() => setDuration(opt.value)}
                                >
                                    <Text style={[
                                        styles.durationText,
                                        duration === opt.value && styles.durationTextActive
                                    ]}>
                                        {opt.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* Invite Participants Section */}
                        <Text style={styles.label}>Invite Participants</Text>

                        {/* Invite All Toggle */}
                        <View style={styles.inviteToggleRow}>
                            <View style={styles.inviteToggleLeft}>
                                <MaterialCommunityIcons name="account-group" size={22} color="#6366F1" />
                                <Text style={styles.inviteToggleText}>Invite All Users</Text>
                            </View>
                            <Switch
                                value={inviteAll}
                                onValueChange={(value) => {
                                    setInviteAll(value);
                                    if (value) {
                                        setSelectedUsers([]);
                                    }
                                }}
                                trackColor={{ false: '#E5E7EB', true: '#C7D2FE' }}
                                thumbColor={inviteAll ? '#6366F1' : '#9CA3AF'}
                            />
                        </View>

                        {/* User Selection (when Invite All is OFF) */}
                        {!inviteAll && (
                            <View style={styles.userSelectionContainer}>
                                {/* Search Input */}
                                <View style={styles.userSearchContainer}>
                                    <Feather name="search" size={18} color="#9CA3AF" />
                                    <TextInput
                                        style={styles.userSearchInput}
                                        placeholder="Search users by name, email, or role..."
                                        placeholderTextColor="#9CA3AF"
                                        value={userSearchQuery}
                                        onChangeText={setUserSearchQuery}
                                    />
                                    {userSearchQuery.length > 0 && (
                                        <TouchableOpacity onPress={() => setUserSearchQuery('')}>
                                            <Feather name="x" size={18} color="#9CA3AF" />
                                        </TouchableOpacity>
                                    )}
                                </View>

                                {/* Selected Count */}
                                {selectedUsers.length > 0 && (
                                    <View style={styles.selectedCountRow}>
                                        <Text style={styles.selectedCountText}>
                                            {selectedUsers.length} user(s) selected
                                        </Text>
                                        <TouchableOpacity onPress={() => setSelectedUsers([])}>
                                            <Text style={styles.clearAllText}>Clear All</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}

                                {/* User List */}
                                {loadingUsers ? (
                                    <View style={styles.loadingUsersContainer}>
                                        <ActivityIndicator size="small" color="#6366F1" />
                                        <Text style={styles.loadingUsersText}>Loading users...</Text>
                                    </View>
                                ) : (
                                    <ScrollView
                                        style={styles.userList}
                                        nestedScrollEnabled={true}
                                        showsVerticalScrollIndicator={true}
                                    >
                                        {filteredUsers.length === 0 ? (
                                            <Text style={styles.noUsersText}>
                                                {userSearchQuery ? 'No users found' : 'No users available'}
                                            </Text>
                                        ) : (
                                            filteredUsers.map((user) => {
                                                const isSelected = selectedUsers.some(u => u.email === user.email);
                                                return (
                                                    <TouchableOpacity
                                                        key={user.email}
                                                        style={[
                                                            styles.userItem,
                                                            isSelected && styles.userItemSelected
                                                        ]}
                                                        onPress={() => toggleUserSelection(user)}
                                                    >
                                                        <View style={[
                                                            styles.userCheckbox,
                                                            isSelected && styles.userCheckboxSelected
                                                        ]}>
                                                            {isSelected && (
                                                                <Feather name="check" size={14} color="#FFF" />
                                                            )}
                                                        </View>
                                                        <View style={styles.userInfo}>
                                                            <Text style={styles.userName}>{user.name}</Text>
                                                            <Text style={styles.userEmail}>{user.email}</Text>
                                                        </View>
                                                        <View style={styles.userRoleBadge}>
                                                            <Text style={styles.userRoleText}>{user.role}</Text>
                                                        </View>
                                                    </TouchableOpacity>
                                                );
                                            })
                                        )}
                                    </ScrollView>
                                )}
                            </View>
                        )}

                        {/* Host Info */}
                        <View style={styles.hostInfo}>
                            <MaterialCommunityIcons name="account-tie" size={20} color="#6B7280" />
                            <Text style={styles.hostText}>
                                Hosting as: {hostName || 'Manager'}
                            </Text>
                        </View>
                    </ScrollView>

                    {/* Submit Button */}
                    <TouchableOpacity
                        style={styles.submitBtn}
                        onPress={handleScheduleMeeting}
                        disabled={loading}
                    >
                        <LinearGradient
                            colors={['#6366F1', '#4F46E5']}
                            style={styles.submitGradient}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                        >
                            {loading ? (
                                <ActivityIndicator color="#FFF" />
                            ) : (
                                <>
                                    <MaterialCommunityIcons name="calendar-check" size={20} color="#FFF" />
                                    <Text style={styles.submitText}>Schedule Meeting</Text>
                                </>
                            )}
                        </LinearGradient>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    container: {
        backgroundColor: '#FFF',
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        maxHeight: '90%',
        paddingBottom: 30,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    headerIcon: {
        width: 48,
        height: 48,
        borderRadius: 16,
        backgroundColor: '#6366F1',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    headerTitle: {
        flex: 1,
        fontSize: 20,
        fontFamily: 'Poppins_700Bold',
        color: '#111827',
    },
    closeBtn: {
        padding: 8,
    },
    form: {
        padding: 20,
    },
    label: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#374151',
        marginBottom: 8,
        marginTop: 16,
    },
    input: {
        backgroundColor: '#F9FAFB',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 12,
        padding: 14,
        fontSize: 15,
        fontFamily: 'Poppins_400Regular',
        color: '#111827',
    },
    textArea: {
        minHeight: 80,
        textAlignVertical: 'top',
    },
    dateTimeRow: {
        flexDirection: 'row',
        gap: 12,
    },
    dateTimeBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#EEF2FF',
        borderWidth: 1,
        borderColor: '#C7D2FE',
        borderRadius: 12,
        padding: 14,
        gap: 10,
    },
    dateTimeText: {
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
        color: '#1E293B',
    },
    durationGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    durationChip: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        backgroundColor: '#F3F4F6',
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    durationChipActive: {
        backgroundColor: '#6366F1',
        borderColor: '#6366F1',
    },
    durationText: {
        fontSize: 13,
        fontFamily: 'Poppins_500Medium',
        color: '#6B7280',
    },
    durationTextActive: {
        color: '#FFF',
    },
    hostInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 24,
        padding: 14,
        backgroundColor: '#F9FAFB',
        borderRadius: 12,
        gap: 10,
    },
    hostText: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
    },
    submitBtn: {
        marginHorizontal: 20,
        marginTop: 10,
        borderRadius: 16,
        overflow: 'hidden',
        shadowColor: '#6366F1',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 8,
    },
    submitGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        gap: 10,
    },
    submitText: {
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
    },
    // User Invite Styles
    inviteToggleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#EEF2FF',
        borderWidth: 1,
        borderColor: '#C7D2FE',
        borderRadius: 12,
        padding: 14,
    },
    inviteToggleLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    inviteToggleText: {
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
        color: '#1E293B',
    },
    userSelectionContainer: {
        marginTop: 12,
        backgroundColor: '#F9FAFB',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        overflow: 'hidden',
    },
    userSearchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
        paddingHorizontal: 12,
        paddingVertical: 10,
        gap: 10,
    },
    userSearchInput: {
        flex: 1,
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        color: '#111827',
        paddingVertical: 4,
    },
    selectedCountRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: '#EEF2FF',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    selectedCountText: {
        fontSize: 13,
        fontFamily: 'Poppins_500Medium',
        color: '#6366F1',
    },
    clearAllText: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
        color: '#EF4444',
    },
    loadingUsersContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        gap: 10,
    },
    loadingUsersText: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
    },
    userList: {
        maxHeight: 200,
    },
    noUsersText: {
        textAlign: 'center',
        padding: 20,
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        color: '#9CA3AF',
    },
    userItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
        gap: 12,
    },
    userItemSelected: {
        backgroundColor: '#EEF2FF',
    },
    userCheckbox: {
        width: 22,
        height: 22,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: '#D1D5DB',
        backgroundColor: '#FFF',
        justifyContent: 'center',
        alignItems: 'center',
    },
    userCheckboxSelected: {
        backgroundColor: '#6366F1',
        borderColor: '#6366F1',
    },
    userInfo: {
        flex: 1,
    },
    userName: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#111827',
    },
    userEmail: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
    },
    userRoleBadge: {
        backgroundColor: '#E5E7EB',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    userRoleText: {
        fontSize: 11,
        fontFamily: 'Poppins_500Medium',
        color: '#4B5563',
    },
});