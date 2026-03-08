import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    TextInput,
    Alert,
    ActivityIndicator,
    Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import API_URL from '../config';

const { width } = Dimensions.get('window');

const PRIORITY_COLORS = {
    low: '#10B981',
    medium: '#D71A21',
    high: '#EF4444',
    critical: '#7C3AED'
};

const TYPE_ICONS = {
    Query: 'help-circle',
    Request: 'git-pull-request',
    Complaint: 'alert-triangle'
};

export default function CRMTaskScreen({ route, navigation }) {
    const { task, ticket: initialTicket } = route.params || {};
    const [ticket, setTicket] = useState(initialTicket || task?.ticket);
    const [resolution, setResolution] = useState('');
    const [loading, setLoading] = useState(false);
    const [completed, setCompleted] = useState(task?.status === 'completed');

    const handleComplete = async () => {
        if (!resolution.trim()) {
            Alert.alert('Resolution Required', 'Please provide a resolution for this ticket.');
            return;
        }

        if (resolution.trim().length < 20) {
            Alert.alert('More Detail Needed', 'Please provide a more detailed resolution (at least 20 characters).');
            return;
        }

        setLoading(true);
        try {
            const formData = new FormData();
            formData.append('resolution', resolution.trim());

            const response = await fetch(`${API_URL}/api/v1/crm/tasks/${task?.id}/complete`, {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.status === 'success') {
                setCompleted(true);
                Alert.alert(
                    '🎉 Task Completed!',
                    `Great job! You earned ${result.xp_earned} XP for resolving this ticket.`,
                    [{ text: 'OK', onPress: () => navigation.goBack() }]
                );
            } else {
                Alert.alert('Error', result.message || 'Failed to complete task');
            }
        } catch (error) {
            console.error('Complete task error:', error);
            Alert.alert('Error', 'Network error. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (!ticket) {
        return (
            <SafeAreaView style={styles.errorContainer}>
                <MaterialCommunityIcons name="ticket-outline" size={64} color="#6B7280" />
                <Text style={styles.errorText}>Task not found</Text>
                <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                    <Text style={styles.backButtonText}>Go Back</Text>
                </TouchableOpacity>
            </SafeAreaView>
        );
    }

    return (
        <View style={styles.container}>
            <LinearGradient colors={['#0F172A', '#1E293B']} style={StyleSheet.absoluteFill} />

            {/* Header */}
            <SafeAreaView edges={['top']}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                        <Feather name="arrow-left" size={24} color="#FFF" />
                    </TouchableOpacity>
                    <View style={styles.headerInfo}>
                        <Text style={styles.headerTitle}>Live Assessment</Text>
                        <Text style={styles.headerSubtitle}>{ticket.type} Ticket</Text>
                    </View>
                    <View style={[styles.priorityBadge, { backgroundColor: PRIORITY_COLORS[ticket.priority] + '30' }]}>
                        <Text style={[styles.priorityText, { color: PRIORITY_COLORS[ticket.priority] }]}>
                            {ticket.priority?.toUpperCase()}
                        </Text>
                    </View>
                </View>
            </SafeAreaView>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                {/* Ticket Type Banner */}
                <View style={[styles.typeBanner, { borderColor: PRIORITY_COLORS[ticket.priority] }]}>
                    <Feather name={TYPE_ICONS[ticket.type] || 'file'} size={24} color={PRIORITY_COLORS[ticket.priority]} />
                    <View style={styles.typeInfo}>
                        <Text style={styles.typeLabel}>{ticket.type}</Text>
                        <Text style={styles.ticketId}>#{ticket.id}</Text>
                    </View>
                    {completed && (
                        <View style={styles.completedBadge}>
                            <Feather name="check-circle" size={16} color="#10B981" />
                            <Text style={styles.completedText}>Resolved</Text>
                        </View>
                    )}
                </View>

                {/* Subject */}
                <View style={styles.section}>
                    <Text style={styles.sectionLabel}>Subject</Text>
                    <Text style={styles.subject}>{ticket.subject}</Text>
                </View>

                {/* Customer Info */}
                <View style={styles.customerCard}>
                    <View style={styles.customerHeader}>
                        <MaterialCommunityIcons name="account-circle" size={40} color="#6366F1" />
                        <View style={styles.customerInfo}>
                            <Text style={styles.customerName}>{ticket.customer_name}</Text>
                            <Text style={styles.customerContact}>{ticket.customer_email || ticket.customer_phone}</Text>
                        </View>
                    </View>
                    {ticket.customer_phone && (
                        <View style={styles.contactRow}>
                            <Feather name="phone" size={14} color="#94A3B8" />
                            <Text style={styles.contactText}>{ticket.customer_phone}</Text>
                        </View>
                    )}
                </View>

                {/* Issue Description */}
                <View style={styles.section}>
                    <Text style={styles.sectionLabel}>Issue Description</Text>
                    <View style={styles.descriptionCard}>
                        <Text style={styles.description}>{ticket.description}</Text>
                    </View>
                </View>

                {/* Task Instructions */}
                <View style={styles.instructionsCard}>
                    <MaterialCommunityIcons name="lightbulb-on" size={24} color="#D71A21" />
                    <View style={styles.instructionsContent}>
                        <Text style={styles.instructionsTitle}>Your Task</Text>
                        <Text style={styles.instructionsText}>
                            Analyze the customer's concern and provide a professional resolution. Apply what you learned in your training to handle this real-world scenario.
                        </Text>
                    </View>
                </View>

                {/* XP Reward */}
                <View style={styles.xpCard}>
                    <LinearGradient colors={['#6366F1', '#8B5CF6']} style={styles.xpGradient}>
                        <MaterialCommunityIcons name="star-four-points" size={28} color="#FFF" />
                        <Text style={styles.xpText}>50 XP</Text>
                        <Text style={styles.xpLabel}>on completion</Text>
                    </LinearGradient>
                </View>

                {/* Resolution Input */}
                {!completed && (
                    <View style={styles.resolutionSection}>
                        <Text style={styles.sectionLabel}>Your Resolution</Text>
                        <TextInput
                            style={styles.resolutionInput}
                            placeholder="Describe how you would resolve this issue..."
                            placeholderTextColor="#6B7280"
                            multiline
                            numberOfLines={6}
                            value={resolution}
                            onChangeText={setResolution}
                            textAlignVertical="top"
                        />
                        <Text style={styles.charCount}>{resolution.length} characters</Text>
                    </View>
                )}

                {/* Completed Resolution */}
                {completed && task?.resolution && (
                    <View style={styles.section}>
                        <Text style={styles.sectionLabel}>Your Resolution</Text>
                        <View style={styles.completedResolution}>
                            <Text style={styles.resolutionText}>{task.resolution}</Text>
                        </View>
                    </View>
                )}

                <View style={{ height: 120 }} />
            </ScrollView>

            {/* Submit Button */}
            {!completed && (
                <SafeAreaView edges={['bottom']} style={styles.footer}>
                    <BlurView intensity={80} tint="dark" style={styles.footerBlur}>
                        <TouchableOpacity
                            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
                            onPress={handleComplete}
                            disabled={loading}
                        >
                            <LinearGradient
                                colors={loading ? ['#4B5563', '#374151'] : ['#10B981', '#059669']}
                                style={styles.submitGradient}
                            >
                                {loading ? (
                                    <ActivityIndicator color="#FFF" />
                                ) : (
                                    <>
                                        <Feather name="check-circle" size={20} color="#FFF" />
                                        <Text style={styles.submitText}>Submit Resolution</Text>
                                    </>
                                )}
                            </LinearGradient>
                        </TouchableOpacity>
                    </BlurView>
                </SafeAreaView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
    backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
    headerInfo: { flex: 1, marginHorizontal: 16 },
    headerTitle: { fontSize: 18, fontFamily: 'Poppins_600SemiBold', color: '#FFF' },
    headerSubtitle: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: '#A5B4FC' },
    priorityBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
    priorityText: { fontSize: 10, fontFamily: 'Poppins_700Bold', letterSpacing: 1 },
    content: { flex: 1, padding: 16 },

    typeBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E293B', padding: 16, borderRadius: 16, borderLeftWidth: 4, marginBottom: 20 },
    typeInfo: { flex: 1, marginLeft: 12 },
    typeLabel: { fontSize: 16, fontFamily: 'Poppins_600SemiBold', color: '#FFF' },
    ticketId: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: '#94A3B8' },
    completedBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(16, 185, 129, 0.2)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, gap: 4 },
    completedText: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: '#10B981' },

    section: { marginBottom: 20 },
    sectionLabel: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: '#94A3B8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
    subject: { fontSize: 20, fontFamily: 'Poppins_600SemiBold', color: '#FFF', lineHeight: 28 },

    customerCard: { backgroundColor: '#1E293B', borderRadius: 16, padding: 16, marginBottom: 20 },
    customerHeader: { flexDirection: 'row', alignItems: 'center' },
    customerInfo: { flex: 1, marginLeft: 12 },
    customerName: { fontSize: 16, fontFamily: 'Poppins_600SemiBold', color: '#FFF' },
    customerContact: { fontSize: 13, fontFamily: 'Poppins_400Regular', color: '#94A3B8' },
    contactRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 8 },
    contactText: { fontSize: 13, fontFamily: 'Poppins_400Regular', color: '#94A3B8' },

    descriptionCard: { backgroundColor: '#1E293B', borderRadius: 16, padding: 16 },
    description: { fontSize: 15, fontFamily: 'Poppins_400Regular', color: '#E2E8F0', lineHeight: 24 },

    instructionsCard: { flexDirection: 'row', backgroundColor: 'rgba(245, 158, 11, 0.1)', borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.2)' },
    instructionsContent: { flex: 1, marginLeft: 12 },
    instructionsTitle: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: '#D71A21', marginBottom: 4 },
    instructionsText: { fontSize: 13, fontFamily: 'Poppins_400Regular', color: '#FCD34D', lineHeight: 20 },

    xpCard: { marginBottom: 20, borderRadius: 16, overflow: 'hidden' },
    xpGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, gap: 10 },
    xpText: { fontSize: 24, fontFamily: 'Poppins_700Bold', color: '#FFF' },
    xpLabel: { fontSize: 14, fontFamily: 'Poppins_400Regular', color: 'rgba(255,255,255,0.8)' },

    resolutionSection: { marginBottom: 20 },
    resolutionInput: { backgroundColor: '#1E293B', borderRadius: 16, padding: 16, fontSize: 15, fontFamily: 'Poppins_400Regular', color: '#FFF', minHeight: 150, borderWidth: 1, borderColor: '#334155' },
    charCount: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: '#6B7280', textAlign: 'right', marginTop: 8 },

    completedResolution: { backgroundColor: 'rgba(16, 185, 129, 0.1)', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.3)' },
    resolutionText: { fontSize: 15, fontFamily: 'Poppins_400Regular', color: '#10B981', lineHeight: 24 },

    footer: { position: 'absolute', bottom: 0, left: 0, right: 0 },
    footerBlur: { padding: 16 },
    submitBtn: { borderRadius: 16, overflow: 'hidden' },
    submitBtnDisabled: { opacity: 0.7 },
    submitGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 10 },
    submitText: { fontSize: 16, fontFamily: 'Poppins_600SemiBold', color: '#FFF' },

    errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0F172A' },
    errorText: { fontSize: 18, fontFamily: 'Poppins_500Medium', color: '#6B7280', marginTop: 16 },
    backButton: { marginTop: 24, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: '#6366F1', borderRadius: 12 },
    backButtonText: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: '#FFF' },
});