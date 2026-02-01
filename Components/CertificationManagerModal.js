import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Modal,
    Dimensions,
    ActivityIndicator,
    TextInput
} from 'react-native';
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import API_URL from '../config';

const { width, height } = Dimensions.get('window');

// Certification Type Card
const CertTypeCard = ({ cert, onEdit, onDelete }) => (
    <View style={styles.certCard}>
        <View style={[styles.certIcon, { backgroundColor: cert.color + '20' }]}>
            <MaterialCommunityIcons name={cert.icon || 'certificate'} size={24} color={cert.color} />
        </View>
        
        <View style={styles.certInfo}>
            <View style={styles.certHeader}>
                <Text style={styles.certName}>{cert.name}</Text>
                {cert.is_mandatory && (
                    <View style={styles.mandatoryBadge}>
                        <Text style={styles.mandatoryText}>Required</Text>
                    </View>
                )}
            </View>
            <Text style={styles.certType}>
                {cert.type?.charAt(0).toUpperCase() + cert.type?.slice(1)} • Valid {cert.validity_days} days
            </Text>
            
            {/* Stats */}
            <View style={styles.statsRow}>
                <View style={styles.stat}>
                    <View style={[styles.statDot, { backgroundColor: '#10B981' }]} />
                    <Text style={styles.statText}>{cert.stats?.valid || 0} Valid</Text>
                </View>
                <View style={styles.stat}>
                    <View style={[styles.statDot, { backgroundColor: '#F59E0B' }]} />
                    <Text style={styles.statText}>{cert.stats?.expiring || 0} Expiring</Text>
                </View>
                <View style={styles.stat}>
                    <View style={[styles.statDot, { backgroundColor: '#EF4444' }]} />
                    <Text style={styles.statText}>{cert.stats?.expired || 0} Expired</Text>
                </View>
            </View>
        </View>
        
        <TouchableOpacity style={styles.deleteBtn} onPress={() => onDelete(cert)}>
            <Feather name="trash-2" size={16} color="#EF4444" />
        </TouchableOpacity>
    </View>
);

export default function CertificationManagerModal({ visible, onClose }) {
    const [view, setView] = useState('list'); // list, create
    const [certifications, setCertifications] = useState([]);
    const [loading, setLoading] = useState(false);
    
    // Create form
    const [name, setName] = useState('');
    const [certType, setCertType] = useState('certification');
    const [validityDays, setValidityDays] = useState('365');
    const [isMandatory, setIsMandatory] = useState(false);
    
    useEffect(() => {
        if (visible) fetchCertifications();
    }, [visible]);
    
    const fetchCertifications = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/certifications/types`);
            const data = await res.json();
            setCertifications(data.certifications || []);
        } catch (err) {
            console.log('Certifications fetch error:', err);
        }
        setLoading(false);
    };
    
    const handleCreate = async () => {
        if (!name) return;
        
        try {
            const formData = new FormData();
            formData.append('name', name);
            formData.append('cert_type', certType);
            formData.append('validity_days', validityDays);
            formData.append('is_mandatory', isMandatory ? 'true' : 'false');
            
            await fetch(`${API_URL}/certifications`, {
                method: 'POST',
                body: formData
            });
            
            // Reset and refresh
            setName('');
            setView('list');
            fetchCertifications();
        } catch (err) {
            console.log('Create cert error:', err);
        }
    };
    
    const handleDelete = async (cert) => {
        try {
            await fetch(`${API_URL}/certifications/${cert.id}`, { method: 'DELETE' });
            fetchCertifications();
        } catch (err) {
            console.log('Delete error:', err);
        }
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
                            <TouchableOpacity 
                                onPress={view === 'list' ? onClose : () => setView('list')} 
                                style={styles.closeBtn}
                            >
                                <Feather name={view === 'list' ? 'x' : 'arrow-left'} size={24} color="#FFF" />
                            </TouchableOpacity>
                            <View style={styles.headerCenter}>
                                <MaterialCommunityIcons name="certificate" size={24} color="#10B981" />
                                <Text style={styles.headerTitle}>
                                    {view === 'create' ? 'New Certification' : 'Certifications'}
                                </Text>
                            </View>
                            {view === 'list' && (
                                <TouchableOpacity style={styles.addBtn} onPress={() => setView('create')}>
                                    <Feather name="plus" size={20} color="#FFF" />
                                </TouchableOpacity>
                            )}
                        </View>
                        
                        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                            {loading ? (
                                <ActivityIndicator size="large" color="#10B981" style={{ marginTop: 40 }} />
                            ) : view === 'create' ? (
                                /* Create Form */
                                <View style={styles.form}>
                                    <Text style={styles.label}>Certification Name</Text>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="e.g., FSSAI Food Safety"
                                        placeholderTextColor="#6B7280"
                                        value={name}
                                        onChangeText={setName}
                                    />
                                    
                                    <Text style={styles.label}>Type</Text>
                                    <View style={styles.typeRow}>
                                        <TouchableOpacity 
                                            style={[styles.typeBtn, certType === 'certification' && styles.typeBtnActive]}
                                            onPress={() => setCertType('certification')}
                                        >
                                            <MaterialCommunityIcons name="certificate" size={18} color={certType === 'certification' ? '#FFF' : '#6B7280'} />
                                            <Text style={[styles.typeText, certType === 'certification' && styles.typeTextActive]}>Certification</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity 
                                            style={[styles.typeBtn, certType === 'training' && styles.typeBtnActive]}
                                            onPress={() => setCertType('training')}
                                        >
                                            <MaterialCommunityIcons name="school" size={18} color={certType === 'training' ? '#FFF' : '#6B7280'} />
                                            <Text style={[styles.typeText, certType === 'training' && styles.typeTextActive]}>Training</Text>
                                        </TouchableOpacity>
                                    </View>
                                    
                                    <Text style={styles.label}>Validity (Days)</Text>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="365"
                                        placeholderTextColor="#6B7280"
                                        value={validityDays}
                                        onChangeText={setValidityDays}
                                        keyboardType="numeric"
                                    />
                                    
                                    <TouchableOpacity 
                                        style={styles.checkboxRow}
                                        onPress={() => setIsMandatory(!isMandatory)}
                                    >
                                        <View style={[styles.checkbox, isMandatory && styles.checkboxActive]}>
                                            {isMandatory && <Feather name="check" size={14} color="#FFF" />}
                                        </View>
                                        <Text style={styles.checkboxLabel}>Mark as mandatory for all employees</Text>
                                    </TouchableOpacity>
                                    
                                    <TouchableOpacity style={styles.createBtn} onPress={handleCreate}>
                                        <MaterialCommunityIcons name="plus-circle" size={20} color="#FFF" />
                                        <Text style={styles.createBtnText}>Create Certification</Text>
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                /* List View */
                                <>
                                    <Text style={styles.sectionTitle}>All Certification Types</Text>
                                    {certifications.map((cert, idx) => (
                                        <Animated.View key={cert.id} entering={FadeInDown.delay(idx * 50)}>
                                            <CertTypeCard 
                                                cert={cert} 
                                                onDelete={handleDelete}
                                            />
                                        </Animated.View>
                                    ))}
                                </>
                            )}
                            
                            <View style={{ height: 40 }} />
                        </ScrollView>
                    </LinearGradient>
                </Animated.View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end' },
    container: { height: height * 0.9, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
    gradient: { flex: 1, paddingTop: 16 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16 },
    closeBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
    headerCenter: { flexDirection: 'row', alignItems: 'center' },
    headerTitle: { fontSize: 20, fontFamily: 'Poppins_700Bold', color: '#FFF', marginLeft: 10 },
    addBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center' },
    content: { flex: 1, paddingHorizontal: 20 },
    sectionTitle: { fontSize: 16, fontFamily: 'Poppins_700Bold', color: '#FFF', marginTop: 16, marginBottom: 12 },
    // Cert Card
    certCard: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: 14, marginBottom: 10 },
    certIcon: { width: 50, height: 50, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    certInfo: { flex: 1 },
    certHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
    certName: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: '#FFF' },
    mandatoryBadge: { backgroundColor: 'rgba(239, 68, 68, 0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginLeft: 8 },
    mandatoryText: { fontSize: 9, fontFamily: 'Poppins_600SemiBold', color: '#EF4444' },
    certType: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: '#6B7280', marginBottom: 8 },
    statsRow: { flexDirection: 'row', gap: 12 },
    stat: { flexDirection: 'row', alignItems: 'center' },
    statDot: { width: 6, height: 6, borderRadius: 3, marginRight: 4 },
    statText: { fontSize: 10, fontFamily: 'Poppins_500Medium', color: '#9CA3AF' },
    deleteBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(239, 68, 68, 0.1)', justifyContent: 'center', alignItems: 'center' },
    // Form
    form: { paddingTop: 10 },
    label: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: '#FFF', marginBottom: 6, marginTop: 12 },
    input: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 14, fontSize: 14, fontFamily: 'Poppins_400Regular', color: '#FFF', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    typeRow: { flexDirection: 'row', gap: 10 },
    typeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)', gap: 8 },
    typeBtnActive: { backgroundColor: '#10B981' },
    typeText: { fontSize: 13, fontFamily: 'Poppins_500Medium', color: '#6B7280' },
    typeTextActive: { color: '#FFF' },
    checkboxRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
    checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#6B7280', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
    checkboxActive: { backgroundColor: '#10B981', borderColor: '#10B981' },
    checkboxLabel: { fontSize: 13, fontFamily: 'Poppins_400Regular', color: '#9CA3AF' },
    createBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#10B981', paddingVertical: 16, borderRadius: 14, marginTop: 24 },
    createBtnText: { fontSize: 16, fontFamily: 'Poppins_600SemiBold', color: '#FFF', marginLeft: 8 },
});
