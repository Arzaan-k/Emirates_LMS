import React, { useState } from 'react';
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
    Platform
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

            const response = await fetch(`${API_URL}/meetings`, {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.status === 'success') {
                Alert.alert(
                    '✅ Meeting Scheduled!',
                    `"${title}" is scheduled for ${scheduledDate.toLocaleString()}.\n\nAll users will be notified.`,
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
});