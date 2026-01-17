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

// Content Card
const ContentCard = ({ item, onDuplicate, onDelete }) => (
    <View style={styles.contentCard}>
        <View style={styles.contentMain}>
            <View style={[styles.typeIcon, { backgroundColor: item.video_url ? '#3B82F620' : '#F59E0B20' }]}>
                <MaterialCommunityIcons 
                    name={item.video_url ? 'video' : 'file-document'} 
                    size={20} 
                    color={item.video_url ? '#3B82F6' : '#F59E0B'} 
                />
            </View>
            <View style={styles.contentInfo}>
                <Text style={styles.contentTitle} numberOfLines={1}>{item.title}</Text>
                <View style={styles.contentMeta}>
                    {item.bucket && (
                        <View style={styles.bucketTag}>
                            <Text style={styles.bucketText}>{item.bucket}</Text>
                        </View>
                    )}
                    <Text style={styles.contentDate}>
                        {new Date(item.timestamp).toLocaleDateString()}
                    </Text>
                </View>
            </View>
        </View>
        
        <View style={styles.statsRow}>
            <View style={styles.stat}>
                <MaterialCommunityIcons name="eye" size={14} color="#6B7280" />
                <Text style={styles.statText}>{item.stats?.views || 0}</Text>
            </View>
            <View style={styles.stat}>
                <MaterialCommunityIcons name="check-circle" size={14} color="#10B981" />
                <Text style={styles.statText}>{item.stats?.completions || 0}</Text>
            </View>
        </View>
        
        <View style={styles.actions}>
            <TouchableOpacity style={styles.actionBtn} onPress={() => onDuplicate(item)}>
                <Feather name="copy" size={16} color="#6B7280" />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]} onPress={() => onDelete(item)}>
                <Feather name="trash-2" size={16} color="#EF4444" />
            </TouchableOpacity>
        </View>
    </View>
);

export default function ContentLibraryModal({ visible, onClose }) {
    const [content, setContent] = useState([]);
    const [buckets, setBuckets] = useState([]);
    const [search, setSearch] = useState('');
    const [selectedBucket, setSelectedBucket] = useState(null);
    const [loading, setLoading] = useState(false);
    
    useEffect(() => {
        if (visible) fetchContent();
    }, [visible, selectedBucket]);
    
    const fetchContent = async () => {
        setLoading(true);
        try {
            let url = `${API_URL}/content/library`;
            if (selectedBucket) url += `?bucket=${encodeURIComponent(selectedBucket)}`;
            
            const res = await fetch(url);
            const data = await res.json();
            setContent(data.content || []);
            setBuckets(data.buckets || []);
        } catch (err) {
            console.log('Content fetch error:', err);
        }
        setLoading(false);
    };
    
    const handleDuplicate = async (item) => {
        try {
            await fetch(`${API_URL}/content/${item.id}/duplicate`, { method: 'POST' });
            fetchContent();
        } catch (err) {
            console.log('Duplicate error:', err);
        }
    };
    
    const handleDelete = async (item) => {
        try {
            await fetch(`${API_URL}/content/${item.id}`, { method: 'DELETE' });
            fetchContent();
        } catch (err) {
            console.log('Delete error:', err);
        }
    };
    
    const filteredContent = content.filter(c => 
        search ? c.title?.toLowerCase().includes(search.toLowerCase()) : true
    );
    
    if (!visible) return null;
    
    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View style={styles.overlay}>
                <BlurView intensity={80} style={StyleSheet.absoluteFill} />
                <Animated.View entering={FadeInUp} style={styles.container}>
                    <LinearGradient colors={['#1F2937', '#111827']} style={styles.gradient}>
                        {/* Header */}
                        <View style={styles.header}>
                            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                                <Feather name="x" size={24} color="#FFF" />
                            </TouchableOpacity>
                            <View style={styles.headerCenter}>
                                <MaterialCommunityIcons name="folder-multiple" size={24} color="#3B82F6" />
                                <Text style={styles.headerTitle}>Content Library</Text>
                            </View>
                            <View style={{ width: 40 }} />
                        </View>
                        
                        {/* Search */}
                        <View style={styles.searchContainer}>
                            <Feather name="search" size={18} color="#6B7280" />
                            <TextInput
                                style={styles.searchInput}
                                placeholder="Search content..."
                                placeholderTextColor="#6B7280"
                                value={search}
                                onChangeText={setSearch}
                            />
                        </View>
                        
                        {/* Bucket Filters */}
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
                            <TouchableOpacity 
                                style={[styles.filterPill, !selectedBucket && styles.filterPillActive]}
                                onPress={() => setSelectedBucket(null)}
                            >
                                <Text style={[styles.filterText, !selectedBucket && styles.filterTextActive]}>All</Text>
                            </TouchableOpacity>
                            {buckets.map(bucket => (
                                <TouchableOpacity 
                                    key={bucket}
                                    style={[styles.filterPill, selectedBucket === bucket && styles.filterPillActive]}
                                    onPress={() => setSelectedBucket(bucket)}
                                >
                                    <Text style={[styles.filterText, selectedBucket === bucket && styles.filterTextActive]}>
                                        {bucket}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                        
                        {/* Stats Summary */}
                        <View style={styles.summary}>
                            <Text style={styles.summaryText}>
                                <Text style={styles.summaryCount}>{filteredContent.length}</Text> items
                            </Text>
                        </View>
                        
                        {/* Content List */}
                        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                            {loading ? (
                                <ActivityIndicator size="large" color="#3B82F6" style={{ marginTop: 40 }} />
                            ) : filteredContent.length === 0 ? (
                                <View style={styles.emptyState}>
                                    <MaterialCommunityIcons name="folder-open" size={48} color="#6B7280" />
                                    <Text style={styles.emptyText}>No content found</Text>
                                </View>
                            ) : (
                                filteredContent.map((item, idx) => (
                                    <Animated.View key={item.id || idx} entering={FadeInDown.delay(idx * 30)}>
                                        <ContentCard 
                                            item={item} 
                                            onDuplicate={handleDuplicate}
                                            onDelete={handleDelete}
                                        />
                                    </Animated.View>
                                ))
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
    container: { height: height * 0.92, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
    gradient: { flex: 1, paddingTop: 16 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 12 },
    closeBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
    headerCenter: { flexDirection: 'row', alignItems: 'center' },
    headerTitle: { fontSize: 20, fontFamily: 'Poppins_700Bold', color: '#FFF', marginLeft: 10 },
    // Search
    searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', marginHorizontal: 20, borderRadius: 12, paddingHorizontal: 14, marginBottom: 10 },
    searchInput: { flex: 1, paddingVertical: 12, paddingLeft: 10, fontSize: 14, fontFamily: 'Poppins_400Regular', color: '#FFF' },
    // Filters
    filterRow: { paddingHorizontal: 16, paddingVertical: 6, maxHeight: 50 },
    filterPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.05)', marginRight: 8 },
    filterPillActive: { backgroundColor: '#3B82F6' },
    filterText: { fontSize: 12, fontFamily: 'Poppins_500Medium', color: '#9CA3AF' },
    filterTextActive: { color: '#FFF' },
    // Summary
    summary: { paddingHorizontal: 20, paddingVertical: 8 },
    summaryText: { fontSize: 13, fontFamily: 'Poppins_400Regular', color: '#6B7280' },
    summaryCount: { fontFamily: 'Poppins_700Bold', color: '#FFF' },
    content: { flex: 1, paddingHorizontal: 20 },
    // Content Card
    contentCard: { backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: 14, marginBottom: 10 },
    contentMain: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    typeIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    contentInfo: { flex: 1 },
    contentTitle: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: '#FFF' },
    contentMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    bucketTag: { backgroundColor: 'rgba(99, 102, 241, 0.2)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginRight: 8 },
    bucketText: { fontSize: 10, fontFamily: 'Poppins_500Medium', color: '#A5B4FC' },
    contentDate: { fontSize: 10, fontFamily: 'Poppins_400Regular', color: '#6B7280' },
    statsRow: { flexDirection: 'row', gap: 16, marginBottom: 10 },
    stat: { flexDirection: 'row', alignItems: 'center' },
    statText: { fontSize: 12, fontFamily: 'Poppins_500Medium', color: '#9CA3AF', marginLeft: 4 },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
    actionBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)', justifyContent: 'center', alignItems: 'center' },
    deleteBtn: { backgroundColor: 'rgba(239, 68, 68, 0.1)' },
    // Empty
    emptyState: { alignItems: 'center', paddingVertical: 60 },
    emptyText: { fontSize: 14, fontFamily: 'Poppins_500Medium', color: '#6B7280', marginTop: 12 },
});
