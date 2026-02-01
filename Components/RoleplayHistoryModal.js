import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    Modal,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    ActivityIndicator,
    Dimensions,
    FlatList
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import API_URL from '../config';

const { width, height } = Dimensions.get('window');

export default function RoleplayHistoryModal({ visible, onClose }) {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (visible) {
            fetchHistory();
        }
    }, [visible]);

    const fetchHistory = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/api/v1/roleplay/history`);
            const data = await res.json();
            if (Array.isArray(data)) {
                setHistory(data);
            }
        } catch (e) {
            console.error('Error fetching roleplay history:', e);
        }
        setLoading(false);
    };

    if (!visible) return null;

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>🎭 Roleplay History</Text>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                        <Feather name="x" size={24} color="#FFF" />
                    </TouchableOpacity>
                </View>

                {/* Content */}
                <View style={styles.content}>
                    {loading ? (
                        <ActivityIndicator color="#6366F1" style={{ marginTop: 40 }} />
                    ) : history.length === 0 ? (
                        <View style={styles.emptyState}>
                            <MaterialCommunityIcons name="drama-masks" size={48} color="#9CA3AF" />
                            <Text style={styles.emptyText}>No roleplay history found</Text>
                        </View>
                    ) : (
                        <FlatList
                            data={history}
                            keyExtractor={(item, index) => index.toString()}
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={{ paddingBottom: 40 }}
                            renderItem={({ item, index }) => (
                                <Animated.View entering={FadeInDown.delay(index * 50)} style={styles.historyItem}>
                                    <View style={styles.historyHeader}>
                                        <Text style={styles.dateText}>
                                            {item.timestamp ? new Date(item.timestamp).toLocaleString() : 'Recent'}
                                        </Text>
                                        <View style={[styles.scoreBadge, {
                                            backgroundColor: item.score >= 80 ? '#10B981' : item.score >= 50 ? '#F59E0B' : '#EF4444'
                                        }]}>
                                            <Text style={styles.scoreText}>{item.score || 0}/100</Text>
                                        </View>
                                    </View>

                                    <Text style={styles.userText} numberOfLines={2}>
                                        <Text style={{ fontWeight: 'bold' }}>You:</Text> "{item.user_text || 'No text'}"
                                    </Text>

                                    {item.tip && (
                                        <View style={styles.tipBox}>
                                            <Feather name="zap" size={14} color="#FBBF24" />
                                            <Text style={styles.tipText}>{item.tip}</Text>
                                        </View>
                                    )}
                                </Animated.View>
                            )}
                        />
                    )}
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        marginTop: 50,
        backgroundColor: '#0F172A',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    headerTitle: {
        fontSize: 20,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
    },
    closeBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    content: {
        flex: 1,
        padding: 16,
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
    },
    emptyText: {
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        color: '#64748B',
        marginTop: 12,
    },
    historyItem: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderLeftWidth: 4,
        borderLeftColor: '#FBBF24',
    },
    historyHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
        alignItems: 'center',
    },
    dateText: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
    },
    scoreBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 8,
    },
    scoreText: {
        color: '#FFF',
        fontFamily: 'Poppins_700Bold',
        fontSize: 12,
    },
    userText: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 14,
        marginBottom: 10,
        fontStyle: 'italic',
        fontFamily: 'Poppins_400Regular',
    },
    tipBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(251, 191, 36, 0.1)',
        padding: 8,
        borderRadius: 8,
    },
    tipText: {
        color: '#FBBF24',
        fontSize: 12,
        marginLeft: 8,
        flex: 1,
        fontFamily: 'Poppins_500Medium',
    },
});
