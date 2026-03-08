import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    TextInput,
    Modal,
    Dimensions,
    Alert,
    ActivityIndicator
} from 'react-native';
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import API_URL from '../config';

const { width, height } = Dimensions.get('window');

const PRIORITY_COLORS = {
    low: '#10B981',
    medium: '#D71A21',
    high: '#EF4444',
    critical: '#7C3AED'
};

const STATUS_COLORS = {
    open: '#3B82F6',
    in_progress: '#D71A21',
    resolved: '#10B981',
    closed: '#6B7280'
};

// Individual Ticket Card
const TicketCard = ({ ticket, onPress }) => (
    <TouchableOpacity 
        style={styles.ticketCard} 
        onPress={() => onPress(ticket)}
        activeOpacity={0.8}
    >
        <View style={styles.ticketHeader}>
            <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[ticket.status] + '20' }]}>
                <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[ticket.status] }]} />
                <Text style={[styles.statusText, { color: STATUS_COLORS[ticket.status] }]}>
                    {ticket.status.replace('_', ' ').toUpperCase()}
                </Text>
            </View>
            <Text style={styles.ticketDate}>
                {new Date(ticket.created_at).toLocaleDateString()}
            </Text>
        </View>
        
        <Text style={styles.ticketSubject} numberOfLines={1}>{ticket.subject}</Text>
        <Text style={styles.ticketMessage} numberOfLines={2}>{ticket.message}</Text>
        
        <View style={styles.ticketFooter}>
            <View style={[styles.priorityBadge, { backgroundColor: PRIORITY_COLORS[ticket.priority] + '20' }]}>
                <Text style={[styles.priorityText, { color: PRIORITY_COLORS[ticket.priority] }]}>
                    {ticket.priority.toUpperCase()}
                </Text>
            </View>
            {ticket.responses?.length > 0 && (
                <View style={styles.responseBadge}>
                    <Feather name="message-circle" size={14} color="#3B82F6" />
                    <Text style={styles.responseCount}>{ticket.responses.length}</Text>
                </View>
            )}
        </View>
    </TouchableOpacity>
);

// Ticket Detail Modal
const TicketDetailModal = ({ visible, ticket, onClose }) => {
    if (!ticket) return null;
    
    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View style={styles.detailOverlay}>
                <BlurView intensity={80} style={StyleSheet.absoluteFill} />
                <Animated.View entering={FadeInUp} style={styles.detailContainer}>
                    <LinearGradient colors={['#1F2937', '#111827']} style={styles.detailGradient}>
                        {/* Header */}
                        <View style={styles.detailHeader}>
                            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                                <Feather name="x" size={24} color="#FFF" />
                            </TouchableOpacity>
                            <Text style={styles.detailTitle}>Ticket Details</Text>
                            <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[ticket.status] + '20' }]}>
                                <Text style={[styles.statusText, { color: STATUS_COLORS[ticket.status] }]}>
                                    {ticket.status.replace('_', ' ').toUpperCase()}
                                </Text>
                            </View>
                        </View>
                        
                        <ScrollView style={styles.detailScroll} showsVerticalScrollIndicator={false}>
                            {/* Subject & Message */}
                            <Text style={styles.detailSubject}>{ticket.subject}</Text>
                            <Text style={styles.detailMessage}>{ticket.message}</Text>
                            
                            {/* Meta Info */}
                            <View style={styles.metaRow}>
                                <View style={styles.metaItem}>
                                    <Text style={styles.metaLabel}>Category</Text>
                                    <Text style={styles.metaValue}>{ticket.category}</Text>
                                </View>
                                <View style={styles.metaItem}>
                                    <Text style={styles.metaLabel}>Priority</Text>
                                    <Text style={[styles.metaValue, { color: PRIORITY_COLORS[ticket.priority] }]}>
                                        {ticket.priority.toUpperCase()}
                                    </Text>
                                </View>
                            </View>
                            
                            {/* Responses */}
                            {ticket.responses?.length > 0 && (
                                <View style={styles.responsesSection}>
                                    <Text style={styles.responsesTitle}>Responses</Text>
                                    {ticket.responses.map((resp, idx) => (
                                        <View key={idx} style={styles.responseCard}>
                                            <View style={styles.responseHeader}>
                                                <Text style={styles.responderName}>{resp.responder_name}</Text>
                                                <Text style={styles.responseDate}>
                                                    {new Date(resp.timestamp).toLocaleString()}
                                                </Text>
                                            </View>
                                            <Text style={styles.responseMessage}>{resp.message}</Text>
                                        </View>
                                    ))}
                                </View>
                            )}
                        </ScrollView>
                    </LinearGradient>
                </Animated.View>
            </View>
        </Modal>
    );
};

// Main Support Modal Component
export default function SupportTicketModal({ 
    visible, 
    onClose, 
    userEmail, 
    userName = "User",
    userRole = "user"  // user, manager, superadmin
}) {
    const [view, setView] = useState('list'); // list, create
    const [categories, setCategories] = useState([]);
    const [myTickets, setMyTickets] = useState([]);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    
    // Form state
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('help');
    const [selectedPriority, setSelectedPriority] = useState('medium');
    
    // Detail view
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [showDetail, setShowDetail] = useState(false);
    
    useEffect(() => {
        if (visible) {
            fetchCategories();
            fetchMyTickets();
        }
    }, [visible]);
    
    const fetchCategories = async () => {
        try {
            const response = await fetch(`${API_URL}/support/categories`);
            const data = await response.json();
            if (data.categories) {
                setCategories(data.categories);
            }
        } catch (err) {
            console.log("Error fetching categories:", err);
        }
    };
    
    const fetchMyTickets = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${API_URL}/support/my-tickets/${userEmail}`);
            const data = await response.json();
            if (data.tickets) {
                setMyTickets(data.tickets);
            }
        } catch (err) {
            console.log("Error fetching tickets:", err);
        }
        setLoading(false);
    };
    
    const handleSubmit = async () => {
        if (!subject.trim() || !message.trim()) {
            Alert.alert("Required Fields", "Please fill in both subject and message.");
            return;
        }
        
        setSubmitting(true);
        try {
            const formData = new FormData();
            formData.append("user_email", userEmail);
            formData.append("user_name", userName);
            formData.append("user_role", userRole);
            formData.append("subject", subject);
            formData.append("message", message);
            formData.append("category", selectedCategory);
            formData.append("priority", selectedPriority);
            
            const response = await fetch(`${API_URL}/support/create-ticket`, {
                method: "POST",
                body: formData
            });
            const data = await response.json();
            
            if (data.status === "success") {
                Alert.alert("Success! 🎉", data.message);
                setSubject('');
                setMessage('');
                setSelectedCategory('help');
                setSelectedPriority('medium');
                setView('list');
                fetchMyTickets();
            } else {
                Alert.alert("Error", "Failed to submit ticket. Please try again.");
            }
        } catch (err) {
            Alert.alert("Error", "Network error. Please check your connection.");
            console.log("Submit error:", err);
        }
        setSubmitting(false);
    };
    
    const openTicketDetail = (ticket) => {
        setSelectedTicket(ticket);
        setShowDetail(true);
    };
    
    if (!visible) return null;
    
    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View style={styles.overlay}>
                <BlurView intensity={80} style={StyleSheet.absoluteFill} />
                <Animated.View entering={FadeInUp} style={styles.container}>
                    <LinearGradient colors={['#1F2937', '#111827']} style={styles.gradient}>
                        {/* Header */}
                        <View style={styles.header}>
                            <TouchableOpacity onPress={onClose} style={styles.backBtn}>
                                <Feather name="x" size={24} color="#FFF" />
                            </TouchableOpacity>
                            <View style={styles.headerCenter}>
                                <MaterialCommunityIcons name="headset" size={24} color="#D71A21" />
                                <Text style={styles.headerTitle}>Support Center</Text>
                            </View>
                            <TouchableOpacity 
                                onPress={() => setView(view === 'list' ? 'create' : 'list')}
                                style={styles.toggleBtn}
                            >
                                <Feather name={view === 'list' ? 'plus' : 'list'} size={20} color="#FFF" />
                            </TouchableOpacity>
                        </View>
                        
                        {/* Tab Buttons */}
                        <View style={styles.tabContainer}>
                            <TouchableOpacity 
                                style={[styles.tab, view === 'list' && styles.tabActive]}
                                onPress={() => setView('list')}
                            >
                                <Text style={[styles.tabText, view === 'list' && styles.tabTextActive]}>
                                    My Tickets
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                style={[styles.tab, view === 'create' && styles.tabActive]}
                                onPress={() => setView('create')}
                            >
                                <Text style={[styles.tabText, view === 'create' && styles.tabTextActive]}>
                                    New Ticket
                                </Text>
                            </TouchableOpacity>
                        </View>
                        
                        {/* Content */}
                        {view === 'list' ? (
                            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                                {loading ? (
                                    <ActivityIndicator size="large" color="#D71A21" style={{ marginTop: 40 }} />
                                ) : myTickets.length === 0 ? (
                                    <View style={styles.emptyState}>
                                        <MaterialCommunityIcons name="ticket-outline" size={64} color="#4B5563" />
                                        <Text style={styles.emptyTitle}>No Tickets Yet</Text>
                                        <Text style={styles.emptySubtitle}>
                                            Create a support ticket to get help from our team
                                        </Text>
                                        <TouchableOpacity 
                                            style={styles.createFirstBtn}
                                            onPress={() => setView('create')}
                                        >
                                            <Text style={styles.createFirstBtnText}>Create Ticket</Text>
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    myTickets.map((ticket, idx) => (
                                        <Animated.View key={ticket.id} entering={FadeInDown.delay(idx * 100)}>
                                            <TicketCard ticket={ticket} onPress={openTicketDetail} />
                                        </Animated.View>
                                    ))
                                )}
                            </ScrollView>
                        ) : (
                            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                                {/* Category Selection */}
                                <Text style={styles.sectionTitle}>Category</Text>
                                <View style={styles.categoryGrid}>
                                    {categories.map(cat => (
                                        <TouchableOpacity
                                            key={cat.id}
                                            style={[
                                                styles.categoryBtn,
                                                selectedCategory === cat.id && { 
                                                    borderColor: cat.color,
                                                    backgroundColor: cat.color + '20'
                                                }
                                            ]}
                                            onPress={() => setSelectedCategory(cat.id)}
                                        >
                                            <MaterialCommunityIcons 
                                                name={cat.icon} 
                                                size={20} 
                                                color={selectedCategory === cat.id ? cat.color : '#9CA3AF'} 
                                            />
                                            <Text style={[
                                                styles.categoryText,
                                                selectedCategory === cat.id && { color: cat.color }
                                            ]}>
                                                {cat.name}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                                
                                {/* Priority Selection */}
                                <Text style={styles.sectionTitle}>Priority</Text>
                                <View style={styles.priorityRow}>
                                    {['low', 'medium', 'high', 'critical'].map(p => (
                                        <TouchableOpacity
                                            key={p}
                                            style={[
                                                styles.priorityBtn,
                                                selectedPriority === p && {
                                                    borderColor: PRIORITY_COLORS[p],
                                                    backgroundColor: PRIORITY_COLORS[p] + '20'
                                                }
                                            ]}
                                            onPress={() => setSelectedPriority(p)}
                                        >
                                            <Text style={[
                                                styles.priorityBtnText,
                                                selectedPriority === p && { color: PRIORITY_COLORS[p] }
                                            ]}>
                                                {p.charAt(0).toUpperCase() + p.slice(1)}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                                
                                {/* Subject Input */}
                                <Text style={styles.sectionTitle}>Subject</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="Brief description of your issue..."
                                    placeholderTextColor="#6B7280"
                                    value={subject}
                                    onChangeText={setSubject}
                                />
                                
                                {/* Message Input */}
                                <Text style={styles.sectionTitle}>Message</Text>
                                <TextInput
                                    style={[styles.input, styles.messageInput]}
                                    placeholder="Describe your issue in detail..."
                                    placeholderTextColor="#6B7280"
                                    value={message}
                                    onChangeText={setMessage}
                                    multiline
                                    numberOfLines={6}
                                    textAlignVertical="top"
                                />
                                
                                {/* Submit Button */}
                                <TouchableOpacity 
                                    style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
                                    onPress={handleSubmit}
                                    disabled={submitting}
                                >
                                    {submitting ? (
                                        <ActivityIndicator color="#111827" />
                                    ) : (
                                        <>
                                            <Text style={styles.submitBtnText}>Submit Ticket</Text>
                                            <Feather name="send" size={18} color="#111827" style={{ marginLeft: 8 }} />
                                        </>
                                    )}
                                </TouchableOpacity>
                            </ScrollView>
                        )}
                    </LinearGradient>
                </Animated.View>
            </View>
            
            {/* Ticket Detail Modal */}
            <TicketDetailModal 
                visible={showDetail} 
                ticket={selectedTicket} 
                onClose={() => setShowDetail(false)} 
            />
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    container: {
        height: height * 0.9,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        overflow: 'hidden',
    },
    gradient: {
        flex: 1,
        paddingTop: 16,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerCenter: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 20,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
        marginLeft: 10,
    },
    toggleBtn: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: '#D71A21',
        justifyContent: 'center',
        alignItems: 'center',
    },
    tabContainer: {
        flexDirection: 'row',
        paddingHorizontal: 20,
        paddingVertical: 12,
        gap: 12,
    },
    tab: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.05)',
        alignItems: 'center',
    },
    tabActive: {
        backgroundColor: '#D71A21',
    },
    tabText: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#9CA3AF',
    },
    tabTextActive: {
        color: '#111827',
    },
    content: {
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 16,
    },
    // Ticket Card Styles
    ticketCard: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    ticketHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 20,
    },
    statusDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        marginRight: 6,
    },
    statusText: {
        fontSize: 10,
        fontFamily: 'Poppins_700Bold',
        letterSpacing: 0.5,
    },
    ticketDate: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
    },
    ticketSubject: {
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
        marginBottom: 6,
    },
    ticketMessage: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        color: '#9CA3AF',
        marginBottom: 12,
    },
    ticketFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    priorityBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    priorityText: {
        fontSize: 10,
        fontFamily: 'Poppins_700Bold',
    },
    responseBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    responseCount: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
        color: '#3B82F6',
    },
    // Empty State
    emptyState: {
        alignItems: 'center',
        paddingTop: 60,
    },
    emptyTitle: {
        fontSize: 20,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
        marginTop: 16,
    },
    emptySubtitle: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
        textAlign: 'center',
        marginTop: 8,
        paddingHorizontal: 40,
    },
    createFirstBtn: {
        marginTop: 24,
        backgroundColor: '#D71A21',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 12,
    },
    createFirstBtnText: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#111827',
    },
    // Form Styles
    sectionTitle: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
        marginBottom: 10,
        marginTop: 16,
    },
    categoryGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    categoryBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        backgroundColor: 'rgba(255,255,255,0.05)',
        gap: 8,
    },
    categoryText: {
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
        color: '#9CA3AF',
    },
    priorityRow: {
        flexDirection: 'row',
        gap: 10,
    },
    priorityBtn: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    priorityBtnText: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
        color: '#9CA3AF',
    },
    input: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        color: '#FFF',
    },
    messageInput: {
        height: 140,
        textAlignVertical: 'top',
    },
    submitBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#D71A21',
        paddingVertical: 16,
        borderRadius: 14,
        marginTop: 24,
        marginBottom: 40,
    },
    submitBtnDisabled: {
        opacity: 0.7,
    },
    submitBtnText: {
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
        color: '#111827',
    },
    // Detail Modal Styles
    detailOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    detailContainer: {
        height: height * 0.85,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        overflow: 'hidden',
    },
    detailGradient: {
        flex: 1,
        paddingTop: 16,
    },
    detailHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    closeBtn: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    detailTitle: {
        fontSize: 18,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
    },
    detailScroll: {
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 20,
    },
    detailSubject: {
        fontSize: 20,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
        marginBottom: 12,
    },
    detailMessage: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        color: '#D1D5DB',
        lineHeight: 22,
        marginBottom: 20,
    },
    metaRow: {
        flexDirection: 'row',
        gap: 20,
        marginBottom: 24,
    },
    metaItem: {
        flex: 1,
    },
    metaLabel: {
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
        color: '#6B7280',
        marginBottom: 4,
    },
    metaValue: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
    },
    responsesSection: {
        marginTop: 8,
    },
    responsesTitle: {
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
        marginBottom: 12,
    },
    responseCard: {
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderRadius: 12,
        padding: 14,
        marginBottom: 10,
        borderLeftWidth: 3,
        borderLeftColor: '#3B82F6',
    },
    responseHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    responderName: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
        color: '#3B82F6',
    },
    responseDate: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
    },
    responseMessage: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        color: '#D1D5DB',
        lineHeight: 20,
    },
});
