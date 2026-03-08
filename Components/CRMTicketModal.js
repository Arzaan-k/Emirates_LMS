import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    Modal,
    ScrollView,
    Alert,
    ActivityIndicator,
    FlatList,
    Dimensions
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import API_URL from '../config';

const { width } = Dimensions.get('window');

const TICKET_TYPES = [
    { id: 'Query', label: 'Query', icon: 'help-circle', color: '#3B82F6' },
    { id: 'Request', label: 'Request', icon: 'git-pull-request', color: '#10B981' },
    { id: 'Complaint', label: 'Complaint', icon: 'alert-triangle', color: '#EF4444' },
];

const PRIORITY_LEVELS = [
    { id: 'low', label: 'Low', color: '#10B981' },
    { id: 'medium', label: 'Medium', color: '#D71A21' },
    { id: 'high', label: 'High', color: '#EF4444' },
    { id: 'critical', label: 'Critical', color: '#7C3AED' },
];

export default function CRMTicketModal({ visible, onClose, onTicketCreated }) {
    const [activeTab, setActiveTab] = useState('create'); // 'create' | 'list'
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Form state
    const [ticketType, setTicketType] = useState('Query');
    const [priority, setPriority] = useState('medium');
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [customerEmail, setCustomerEmail] = useState('');
    const [subject, setSubject] = useState('');
    const [description, setDescription] = useState('');

    useEffect(() => {
        if (visible && activeTab === 'list') {
            fetchTickets();
        }
    }, [visible, activeTab]);

    const fetchTickets = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${API_URL}/api/v1/crm/tickets`);
            const data = await response.json();
            if (Array.isArray(data)) {
                setTickets(data);
            }
        } catch (error) {
            console.error('Error fetching tickets:', error);
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setTicketType('Query');
        setPriority('medium');
        setCustomerName('');
        setCustomerPhone('');
        setCustomerEmail('');
        setSubject('');
        setDescription('');
    };

    const handleSubmit = async () => {
        if (!customerName.trim() || !subject.trim() || !description.trim()) {
            Alert.alert('Missing Fields', 'Please fill in customer name, subject, and description.');
            return;
        }

        setSubmitting(true);
        try {
            const formData = new FormData();
            formData.append('type', ticketType);
            formData.append('category_id', '1'); // Default category
            formData.append('customer_name', customerName.trim());
            formData.append('customer_email', customerEmail.trim());
            formData.append('customer_phone', customerPhone.trim());
            formData.append('subject', subject.trim());
            formData.append('description', description.trim());
            formData.append('priority', priority);

            const response = await fetch(`${API_URL}/api/v1/crm/tickets`, {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.status === 'success') {
                Alert.alert('✅ Ticket Created', `Ticket #${result.ticket.id} has been created successfully.`);
                resetForm();
                if (onTicketCreated) onTicketCreated(result.ticket);
                setActiveTab('list');
                fetchTickets();
            } else {
                Alert.alert('Error', result.message || 'Failed to create ticket');
            }
        } catch (error) {
            console.error('Create ticket error:', error);
            Alert.alert('Error', 'Network error. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteTicket = async (ticketId) => {
        Alert.alert(
            'Delete Ticket',
            'Are you sure you want to delete this ticket?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await fetch(`${API_URL}/api/v1/crm/tickets/${ticketId}`, { method: 'DELETE' });
                            fetchTickets();
                        } catch (error) {
                            console.error('Delete error:', error);
                        }
                    }
                }
            ]
        );
    };

    const renderTicketItem = ({ item }) => (
        <View style={styles.ticketItem}>
            <View style={[styles.ticketTypeBadge, { backgroundColor: TICKET_TYPES.find(t => t.id === item.type)?.color + '30' }]}>
                <Feather name={TICKET_TYPES.find(t => t.id === item.type)?.icon || 'file'} size={14} color={TICKET_TYPES.find(t => t.id === item.type)?.color} />
                <Text style={[styles.ticketTypeText, { color: TICKET_TYPES.find(t => t.id === item.type)?.color }]}>{item.type}</Text>
            </View>
            <Text style={styles.ticketSubject} numberOfLines={1}>{item.subject}</Text>
            <Text style={styles.ticketCustomer}>{item.customer_name}</Text>
            <View style={styles.ticketFooter}>
                <View style={[styles.priorityDot, { backgroundColor: PRIORITY_LEVELS.find(p => p.id === item.priority)?.color }]} />
                <Text style={styles.ticketStatus}>{item.status}</Text>
                <TouchableOpacity onPress={() => handleDeleteTicket(item.id)} style={styles.deleteBtn}>
                    <Feather name="trash-2" size={16} color="#EF4444" />
                </TouchableOpacity>
            </View>
        </View>
    );

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View style={styles.overlay}>
                <View style={styles.container}>
                    <LinearGradient colors={['#1E293B', '#0F172A']} style={StyleSheet.absoluteFill} />

                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.headerTitle}>📋 CRM Tickets</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <Feather name="x" size={24} color="#FFF" />
                        </TouchableOpacity>
                    </View>

                    {/* Tabs */}
                    <View style={styles.tabs}>
                        <TouchableOpacity
                            style={[styles.tab, activeTab === 'create' && styles.tabActive]}
                            onPress={() => setActiveTab('create')}
                        >
                            <Feather name="plus-circle" size={16} color={activeTab === 'create' ? '#FFF' : '#94A3B8'} />
                            <Text style={[styles.tabText, activeTab === 'create' && styles.tabTextActive]}>Create</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.tab, activeTab === 'list' && styles.tabActive]}
                            onPress={() => { setActiveTab('list'); fetchTickets(); }}
                        >
                            <Feather name="list" size={16} color={activeTab === 'list' ? '#FFF' : '#94A3B8'} />
                            <Text style={[styles.tabText, activeTab === 'list' && styles.tabTextActive]}>All Tickets</Text>
                        </TouchableOpacity>
                    </View>

                    {activeTab === 'create' ? (
                        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                            {/* Ticket Type */}
                            <Text style={styles.label}>Ticket Type *</Text>
                            <View style={styles.typeRow}>
                                {TICKET_TYPES.map((type) => (
                                    <TouchableOpacity
                                        key={type.id}
                                        style={[styles.typeBtn, ticketType === type.id && { backgroundColor: type.color + '30', borderColor: type.color }]}
                                        onPress={() => setTicketType(type.id)}
                                    >
                                        <Feather name={type.icon} size={18} color={ticketType === type.id ? type.color : '#94A3B8'} />
                                        <Text style={[styles.typeBtnText, ticketType === type.id && { color: type.color }]}>{type.label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {/* Priority */}
                            <Text style={styles.label}>Priority</Text>
                            <View style={styles.priorityRow}>
                                {PRIORITY_LEVELS.map((p) => (
                                    <TouchableOpacity
                                        key={p.id}
                                        style={[styles.priorityBtn, priority === p.id && { backgroundColor: p.color, borderColor: p.color }]}
                                        onPress={() => setPriority(p.id)}
                                    >
                                        <Text style={[styles.priorityBtnText, priority === p.id && { color: '#FFF' }]}>{p.label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {/* Customer Info */}
                            <Text style={styles.label}>Customer Name *</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="Enter customer name"
                                placeholderTextColor="#6B7280"
                                value={customerName}
                                onChangeText={setCustomerName}
                            />

                            <Text style={styles.label}>Phone Number</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="+91 98765 43210"
                                placeholderTextColor="#6B7280"
                                value={customerPhone}
                                onChangeText={setCustomerPhone}
                                keyboardType="phone-pad"
                            />

                            <Text style={styles.label}>Email (Optional)</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="customer@email.com"
                                placeholderTextColor="#6B7280"
                                value={customerEmail}
                                onChangeText={setCustomerEmail}
                                keyboardType="email-address"
                            />

                            {/* Issue Details */}
                            <Text style={styles.label}>Subject *</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="Brief description of the issue"
                                placeholderTextColor="#6B7280"
                                value={subject}
                                onChangeText={setSubject}
                            />

                            <Text style={styles.label}>Detailed Description *</Text>
                            <TextInput
                                style={[styles.input, styles.textArea]}
                                placeholder="Describe the customer's issue in detail..."
                                placeholderTextColor="#6B7280"
                                value={description}
                                onChangeText={setDescription}
                                multiline
                                numberOfLines={4}
                                textAlignVertical="top"
                            />

                            {/* Submit Button */}
                            <TouchableOpacity
                                style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
                                onPress={handleSubmit}
                                disabled={submitting}
                            >
                                <LinearGradient colors={['#6366F1', '#8B5CF6']} style={styles.submitGradient}>
                                    {submitting ? (
                                        <ActivityIndicator color="#FFF" />
                                    ) : (
                                        <>
                                            <Feather name="plus" size={18} color="#FFF" />
                                            <Text style={styles.submitText}>Create Ticket</Text>
                                        </>
                                    )}
                                </LinearGradient>
                            </TouchableOpacity>

                            <View style={{ height: 40 }} />
                        </ScrollView>
                    ) : (
                        <View style={styles.listContainer}>
                            {loading ? (
                                <ActivityIndicator size="large" color="#6366F1" style={{ marginTop: 40 }} />
                            ) : tickets.length === 0 ? (
                                <View style={styles.emptyState}>
                                    <MaterialCommunityIcons name="ticket-outline" size={64} color="#4B5563" />
                                    <Text style={styles.emptyText}>No tickets yet</Text>
                                    <Text style={styles.emptySubtext}>Create a ticket to get started</Text>
                                </View>
                            ) : (
                                <FlatList
                                    data={tickets}
                                    renderItem={renderTicketItem}
                                    keyExtractor={(item) => item.id}
                                    contentContainerStyle={{ padding: 16 }}
                                />
                            )}
                        </View>
                    )}
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
    container: { height: '90%', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#334155' },
    headerTitle: { fontSize: 20, fontFamily: 'Poppins_600SemiBold', color: '#FFF' },
    closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },

    tabs: { flexDirection: 'row', padding: 16, gap: 12 },
    tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: '#1E293B', gap: 8 },
    tabActive: { backgroundColor: '#6366F1' },
    tabText: { fontSize: 14, fontFamily: 'Poppins_500Medium', color: '#94A3B8' },
    tabTextActive: { color: '#FFF' },

    content: { flex: 1, padding: 16 },
    label: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: '#94A3B8', marginBottom: 8, marginTop: 16, textTransform: 'uppercase', letterSpacing: 1 },

    typeRow: { flexDirection: 'row', gap: 10 },
    typeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155', gap: 6 },
    typeBtnText: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: '#94A3B8' },

    priorityRow: { flexDirection: 'row', gap: 8 },
    priorityBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155' },
    priorityBtnText: { fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: '#94A3B8' },

    input: { backgroundColor: '#1E293B', borderRadius: 12, padding: 14, fontSize: 14, fontFamily: 'Poppins_400Regular', color: '#FFF', borderWidth: 1, borderColor: '#334155' },
    textArea: { minHeight: 100, paddingTop: 14 },

    submitBtn: { marginTop: 24, borderRadius: 14, overflow: 'hidden' },
    submitBtnDisabled: { opacity: 0.6 },
    submitGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8 },
    submitText: { fontSize: 16, fontFamily: 'Poppins_600SemiBold', color: '#FFF' },

    listContainer: { flex: 1 },
    ticketItem: { backgroundColor: '#1E293B', borderRadius: 14, padding: 14, marginBottom: 12 },
    ticketTypeBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, gap: 4, marginBottom: 8 },
    ticketTypeText: { fontSize: 11, fontFamily: 'Poppins_600SemiBold' },
    ticketSubject: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: '#FFF', marginBottom: 4 },
    ticketCustomer: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: '#94A3B8', marginBottom: 8 },
    ticketFooter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    priorityDot: { width: 8, height: 8, borderRadius: 4 },
    ticketStatus: { flex: 1, fontSize: 11, fontFamily: 'Poppins_500Medium', color: '#6B7280', textTransform: 'capitalize' },
    deleteBtn: { padding: 6 },

    emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    emptyText: { fontSize: 18, fontFamily: 'Poppins_600SemiBold', color: '#6B7280', marginTop: 16 },
    emptySubtext: { fontSize: 13, fontFamily: 'Poppins_400Regular', color: '#4B5563', marginTop: 4 },
});