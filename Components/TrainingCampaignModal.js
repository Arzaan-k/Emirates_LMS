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

// Campaign Card
const CampaignCard = ({ campaign, onSelect }) => {
    const isActive = new Date(campaign.end_date) > new Date();
    const daysLeft = Math.ceil((new Date(campaign.end_date) - new Date()) / (1000 * 60 * 60 * 24));
    
    return (
        <TouchableOpacity style={styles.campaignCard} onPress={() => onSelect(campaign)}>
            <LinearGradient 
                colors={isActive ? ['#4F46E5', '#7C3AED'] : ['#374151', '#4B5563']}
                style={styles.campaignGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
            >
                <View style={styles.campaignHeader}>
                    <View style={[styles.statusBadge, { backgroundColor: isActive ? '#10B981' : '#6B7280' }]}>
                        <Text style={styles.statusText}>{isActive ? 'Active' : 'Ended'}</Text>
                    </View>
                    <View style={styles.xpBadge}>
                        <MaterialCommunityIcons name="lightning-bolt" size={14} color="#F59E0B" />
                        <Text style={styles.xpText}>+{campaign.xp_reward} XP</Text>
                    </View>
                </View>
                
                <Text style={styles.campaignTitle}>{campaign.title}</Text>
                <Text style={styles.campaignDesc} numberOfLines={2}>{campaign.description}</Text>
                
                <View style={styles.campaignFooter}>
                    <View style={styles.targetBadge}>
                        <MaterialCommunityIcons name="account-group" size={14} color="#A5B4FC" />
                        <Text style={styles.targetText}>
                            {campaign.target_audience?.roles?.includes('all') ? 'All Staff' : campaign.target_audience?.roles?.join(', ')}
                        </Text>
                    </View>
                    {isActive && (
                        <Text style={styles.daysLeft}>{daysLeft}d left</Text>
                    )}
                </View>
            </LinearGradient>
        </TouchableOpacity>
    );
};

export default function TrainingCampaignModal({ visible, onClose }) {
    const [view, setView] = useState('list'); // list, create, detail
    const [campaigns, setCampaigns] = useState([]);
    const [selectedCampaign, setSelectedCampaign] = useState(null);
    const [loading, setLoading] = useState(false);
    
    // Create form
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [xpReward, setXpReward] = useState('100');
    
    useEffect(() => {
        if (visible) fetchCampaigns();
    }, [visible]);
    
    const fetchCampaigns = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/campaigns`);
            const data = await res.json();
            setCampaigns([...data.active, ...data.past]);
        } catch (err) {
            console.log('Campaigns fetch error:', err);
        }
        setLoading(false);
    };
    
    const handleCreate = async () => {
        if (!title || !description || !startDate || !endDate) return;
        
        try {
            const formData = new FormData();
            formData.append('title', title);
            formData.append('description', description);
            formData.append('start_date', startDate);
            formData.append('end_date', endDate);
            formData.append('xp_reward', xpReward);
            
            await fetch(`${API_URL}/campaigns`, {
                method: 'POST',
                body: formData
            });
            
            // Reset and refresh
            setTitle('');
            setDescription('');
            setView('list');
            fetchCampaigns();
        } catch (err) {
            console.log('Create campaign error:', err);
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
                                <MaterialCommunityIcons name="bullhorn" size={24} color="#8B5CF6" />
                                <Text style={styles.headerTitle}>
                                    {view === 'create' ? 'New Campaign' : 'Training Campaigns'}
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
                                <ActivityIndicator size="large" color="#8B5CF6" style={{ marginTop: 40 }} />
                            ) : view === 'create' ? (
                                /* Create Form */
                                <View style={styles.form}>
                                    <Text style={styles.label}>Campaign Title</Text>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="e.g., Summer Menu Launch"
                                        placeholderTextColor="#6B7280"
                                        value={title}
                                        onChangeText={setTitle}
                                    />
                                    
                                    <Text style={styles.label}>Description</Text>
                                    <TextInput
                                        style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
                                        placeholder="Describe the campaign objective..."
                                        placeholderTextColor="#6B7280"
                                        value={description}
                                        onChangeText={setDescription}
                                        multiline
                                    />
                                    
                                    <View style={styles.row}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.label}>Start Date</Text>
                                            <TextInput
                                                style={styles.input}
                                                placeholder="YYYY-MM-DD"
                                                placeholderTextColor="#6B7280"
                                                value={startDate}
                                                onChangeText={setStartDate}
                                            />
                                        </View>
                                        <View style={{ width: 12 }} />
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.label}>End Date</Text>
                                            <TextInput
                                                style={styles.input}
                                                placeholder="YYYY-MM-DD"
                                                placeholderTextColor="#6B7280"
                                                value={endDate}
                                                onChangeText={setEndDate}
                                            />
                                        </View>
                                    </View>
                                    
                                    <Text style={styles.label}>XP Reward</Text>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="100"
                                        placeholderTextColor="#6B7280"
                                        value={xpReward}
                                        onChangeText={setXpReward}
                                        keyboardType="numeric"
                                    />
                                    
                                    <TouchableOpacity style={styles.createBtn} onPress={handleCreate}>
                                        <MaterialCommunityIcons name="rocket-launch" size={20} color="#FFF" />
                                        <Text style={styles.createBtnText}>Launch Campaign</Text>
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                /* Campaign List */
                                <>
                                    <Text style={styles.sectionTitle}>Active Campaigns</Text>
                                    {campaigns.filter(c => new Date(c.end_date) > new Date()).map((camp, idx) => (
                                        <Animated.View key={camp.id} entering={FadeInDown.delay(idx * 100)}>
                                            <CampaignCard campaign={camp} onSelect={setSelectedCampaign} />
                                        </Animated.View>
                                    ))}
                                    
                                    <Text style={styles.sectionTitle}>Past Campaigns</Text>
                                    {campaigns.filter(c => new Date(c.end_date) <= new Date()).map((camp, idx) => (
                                        <Animated.View key={camp.id} entering={FadeInDown.delay(idx * 100)}>
                                            <CampaignCard campaign={camp} onSelect={setSelectedCampaign} />
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
    addBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#8B5CF6', justifyContent: 'center', alignItems: 'center' },
    content: { flex: 1, paddingHorizontal: 20 },
    sectionTitle: { fontSize: 16, fontFamily: 'Poppins_700Bold', color: '#FFF', marginTop: 16, marginBottom: 12 },
    // Campaign Card
    campaignCard: { marginBottom: 14, borderRadius: 16, overflow: 'hidden' },
    campaignGradient: { padding: 16 },
    campaignHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
    statusText: { fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: '#FFF' },
    xpBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
    xpText: { fontSize: 11, fontFamily: 'Poppins_700Bold', color: '#F59E0B', marginLeft: 2 },
    campaignTitle: { fontSize: 18, fontFamily: 'Poppins_700Bold', color: '#FFF', marginBottom: 4 },
    campaignDesc: { fontSize: 13, fontFamily: 'Poppins_400Regular', color: 'rgba(255,255,255,0.7)', marginBottom: 12 },
    campaignFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    targetBadge: { flexDirection: 'row', alignItems: 'center' },
    targetText: { fontSize: 11, fontFamily: 'Poppins_500Medium', color: '#A5B4FC', marginLeft: 4 },
    daysLeft: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: '#FFF' },
    // Form
    form: { paddingTop: 10 },
    label: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: '#FFF', marginBottom: 6, marginTop: 12 },
    input: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 14, fontSize: 14, fontFamily: 'Poppins_400Regular', color: '#FFF', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    row: { flexDirection: 'row' },
    createBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#8B5CF6', paddingVertical: 16, borderRadius: 14, marginTop: 24 },
    createBtnText: { fontSize: 16, fontFamily: 'Poppins_600SemiBold', color: '#FFF', marginLeft: 8 },
});
