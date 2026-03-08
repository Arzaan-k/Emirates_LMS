import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Modal,
    Dimensions,
    ActivityIndicator
} from 'react-native';
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, { FadeInDown, FadeInUp, FadeInRight } from 'react-native-reanimated';
import API_URL from '../config';

const { width, height } = Dimensions.get('window');

// Rank Badge Component
const RankBadge = ({ rank }) => {
    const colors = {
        1: ['#FFD700', '#FFA500'],
        2: ['#C0C0C0', '#A0A0A0'],
        3: ['#CD7F32', '#8B4513']
    };
    
    if (rank <= 3) {
        return (
            <LinearGradient colors={colors[rank]} style={styles.rankBadge}>
                <Text style={styles.rankBadgeText}>{rank}</Text>
            </LinearGradient>
        );
    }
    
    return (
        <View style={[styles.rankBadge, { backgroundColor: '#374151' }]}>
            <Text style={styles.rankBadgeText}>{rank}</Text>
        </View>
    );
};

// Leaderboard Row
const LeaderboardRow = ({ item, index }) => (
    <Animated.View 
        entering={FadeInRight.delay(index * 50).duration(400)} 
        style={[styles.leaderRow, item.rank === 1 && styles.topRank]}
    >
        <RankBadge rank={item.rank} />
        
        <View style={styles.avatarContainer}>
            <LinearGradient 
                colors={item.rank === 1 ? ['#FFD700', '#FFA500'] : ['#4B5563', '#374151']} 
                style={styles.avatar}
            >
                <Text style={styles.avatarText}>{item.name?.charAt(0) || '?'}</Text>
            </LinearGradient>
        </View>
        
        <View style={styles.leaderInfo}>
            <Text style={styles.leaderName}>{item.name}</Text>
            <Text style={styles.leaderStore}>{item.store || 'Team Member'}</Text>
        </View>
        
        <View style={styles.xpContainer}>
            <MaterialCommunityIcons name="lightning-bolt" size={16} color="#D71A21" />
            <Text style={styles.xpText}>{item.xp?.toLocaleString()}</Text>
        </View>
        
        {item.badges_count > 0 && (
            <View style={styles.badgeCount}>
                <MaterialCommunityIcons name="medal" size={14} color="#8B5CF6" />
                <Text style={styles.badgeCountText}>{item.badges_count}</Text>
            </View>
        )}
    </Animated.View>
);

// Badge Card
const BadgeCard = ({ badge, earned }) => (
    <View style={[styles.badgeCard, !earned && styles.badgeCardLocked]}>
        <View style={[styles.badgeIcon, { backgroundColor: badge.color + '20' }]}>
            <MaterialCommunityIcons 
                name={badge.icon} 
                size={28} 
                color={earned ? badge.color : '#6B7280'} 
            />
        </View>
        <Text style={[styles.badgeName, !earned && styles.badgeNameLocked]}>{badge.name}</Text>
        <Text style={styles.badgeDesc} numberOfLines={2}>{badge.description}</Text>
        <View style={styles.badgeXp}>
            <MaterialCommunityIcons name="lightning-bolt" size={12} color="#D71A21" />
            <Text style={styles.badgeXpText}>+{badge.xp_reward} XP</Text>
        </View>
        {!earned && (
            <View style={styles.lockOverlay}>
                <Feather name="lock" size={20} color="rgba(255,255,255,0.5)" />
            </View>
        )}
    </View>
);

// Challenge Card
const ChallengeCard = ({ challenge, progress }) => {
    const progressPercent = progress ? (progress.progress / challenge.target) * 100 : 0;
    
    return (
        <View style={styles.challengeCard}>
            <View style={styles.challengeHeader}>
                <View style={styles.challengeXpBadge}>
                    <MaterialCommunityIcons name="lightning-bolt" size={14} color="#FFF" />
                    <Text style={styles.challengeXpText}>+{challenge.xp_reward}</Text>
                </View>
                <Text style={styles.challengeDeadline}>
                    Ends {new Date(challenge.ends_at).toLocaleDateString()}
                </Text>
            </View>
            
            <Text style={styles.challengeTitle}>{challenge.title}</Text>
            <Text style={styles.challengeDesc}>{challenge.description}</Text>
            
            <View style={styles.progressContainer}>
                <View style={styles.progressBar}>
                    <Animated.View 
                        style={[
                            styles.progressFill, 
                            { width: `${Math.min(progressPercent, 100)}%` }
                        ]} 
                    />
                </View>
                <Text style={styles.progressText}>
                    {progress?.progress || 0}/{challenge.target}
                </Text>
            </View>
        </View>
    );
};

export default function LeaderboardModal({ visible, onClose }) {
    const [activeTab, setActiveTab] = useState('leaderboard');
    const [leaderboard, setLeaderboard] = useState([]);
    const [badges, setBadges] = useState([]);
    const [userBadges, setUserBadges] = useState([]);
    const [challenges, setChallenges] = useState([]);
    const [loading, setLoading] = useState(false);
    
    useEffect(() => {
        if (visible) {
            fetchData();
        }
    }, [visible]);
    
    const fetchData = async () => {
        setLoading(true);
        try {
            // Fetch leaderboard
            const lbRes = await fetch(`${API_URL}/leaderboard/global?limit=20`);
            const lbData = await lbRes.json();
            setLeaderboard(lbData.leaderboard || []);
            
            // Fetch badges
            const badgeRes = await fetch(`${API_URL}/badges`);
            const badgeData = await badgeRes.json();
            setBadges(badgeData.badges || []);
            
            // Fetch challenges
            const chRes = await fetch(`${API_URL}/challenges`);
            const chData = await chRes.json();
            setChallenges(chData.challenges || []);
            
        } catch (err) {
            console.log('Leaderboard fetch error:', err);
        }
        setLoading(false);
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
                            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                                <Feather name="x" size={24} color="#FFF" />
                            </TouchableOpacity>
                            <View style={styles.headerCenter}>
                                <MaterialCommunityIcons name="trophy" size={24} color="#D71A21" />
                                <Text style={styles.headerTitle}>Leaderboard</Text>
                            </View>
                            <View style={{ width: 40 }} />
                        </View>
                        
                        {/* Tabs */}
                        <View style={styles.tabContainer}>
                            {['leaderboard', 'badges', 'challenges'].map(tab => (
                                <TouchableOpacity
                                    key={tab}
                                    style={[styles.tab, activeTab === tab && styles.tabActive]}
                                    onPress={() => setActiveTab(tab)}
                                >
                                    <MaterialCommunityIcons 
                                        name={tab === 'leaderboard' ? 'podium' : (tab === 'badges' ? 'medal' : 'target')}
                                        size={18}
                                        color={activeTab === tab ? '#111827' : '#9CA3AF'}
                                    />
                                    <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        
                        {/* Content */}
                        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                            {loading ? (
                                <ActivityIndicator size="large" color="#D71A21" style={{ marginTop: 40 }} />
                            ) : activeTab === 'leaderboard' ? (
                                <>
                                    {/* Top 3 Podium */}
                                    {leaderboard.length >= 3 && (
                                        <View style={styles.podium}>
                                            {/* 2nd Place */}
                                            <View style={styles.podiumItem}>
                                                <LinearGradient colors={['#C0C0C0', '#A0A0A0']} style={styles.podiumAvatar}>
                                                    <Text style={styles.podiumAvatarText}>
                                                        {leaderboard[1]?.name?.charAt(0)}
                                                    </Text>
                                                </LinearGradient>
                                                <Text style={styles.podiumName} numberOfLines={1}>
                                                    {leaderboard[1]?.name}
                                                </Text>
                                                <Text style={styles.podiumXp}>{leaderboard[1]?.xp} XP</Text>
                                                <View style={[styles.podiumStand, styles.podiumStand2]}>
                                                    <Text style={styles.podiumRank}>2</Text>
                                                </View>
                                            </View>
                                            
                                            {/* 1st Place */}
                                            <View style={[styles.podiumItem, styles.podiumItemFirst]}>
                                                <MaterialCommunityIcons name="crown" size={24} color="#FFD700" style={{ marginBottom: 4 }} />
                                                <LinearGradient colors={['#FFD700', '#FFA500']} style={[styles.podiumAvatar, styles.podiumAvatarFirst]}>
                                                    <Text style={[styles.podiumAvatarText, { fontSize: 24 }]}>
                                                        {leaderboard[0]?.name?.charAt(0)}
                                                    </Text>
                                                </LinearGradient>
                                                <Text style={[styles.podiumName, { color: '#FFD700' }]} numberOfLines={1}>
                                                    {leaderboard[0]?.name}
                                                </Text>
                                                <Text style={[styles.podiumXp, { color: '#FFD700' }]}>{leaderboard[0]?.xp} XP</Text>
                                                <View style={[styles.podiumStand, styles.podiumStand1]}>
                                                    <Text style={styles.podiumRank}>1</Text>
                                                </View>
                                            </View>
                                            
                                            {/* 3rd Place */}
                                            <View style={styles.podiumItem}>
                                                <LinearGradient colors={['#CD7F32', '#8B4513']} style={styles.podiumAvatar}>
                                                    <Text style={styles.podiumAvatarText}>
                                                        {leaderboard[2]?.name?.charAt(0)}
                                                    </Text>
                                                </LinearGradient>
                                                <Text style={styles.podiumName} numberOfLines={1}>
                                                    {leaderboard[2]?.name}
                                                </Text>
                                                <Text style={styles.podiumXp}>{leaderboard[2]?.xp} XP</Text>
                                                <View style={[styles.podiumStand, styles.podiumStand3]}>
                                                    <Text style={styles.podiumRank}>3</Text>
                                                </View>
                                            </View>
                                        </View>
                                    )}
                                    
                                    {/* Rest of Leaderboard */}
                                    <Text style={styles.sectionTitle}>Full Rankings</Text>
                                    {leaderboard.slice(3).map((item, idx) => (
                                        <LeaderboardRow key={item.email} item={item} index={idx} />
                                    ))}
                                </>
                            ) : activeTab === 'badges' ? (
                                <>
                                    <Text style={styles.sectionTitle}>Available Badges</Text>
                                    <View style={styles.badgeGrid}>
                                        {badges.map((badge, idx) => (
                                            <Animated.View 
                                                key={badge.id} 
                                                entering={FadeInDown.delay(idx * 50)}
                                                style={{ width: '48%' }}
                                            >
                                                <BadgeCard 
                                                    badge={badge} 
                                                    earned={userBadges.some(ub => ub.badge_id === badge.id)} 
                                                />
                                            </Animated.View>
                                        ))}
                                    </View>
                                </>
                            ) : (
                                <>
                                    <Text style={styles.sectionTitle}>Active Challenges</Text>
                                    {challenges.map((challenge, idx) => (
                                        <Animated.View key={challenge.id} entering={FadeInDown.delay(idx * 100)}>
                                            <ChallengeCard challenge={challenge} progress={null} />
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
    closeBtn: {
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
    tabContainer: {
        flexDirection: 'row',
        paddingHorizontal: 20,
        paddingVertical: 12,
        gap: 10,
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.05)',
        gap: 6,
    },
    tabActive: {
        backgroundColor: '#D71A21',
    },
    tabText: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
        color: '#9CA3AF',
    },
    tabTextActive: {
        color: '#111827',
    },
    content: {
        flex: 1,
        paddingHorizontal: 20,
    },
    sectionTitle: {
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
        marginTop: 20,
        marginBottom: 12,
    },
    // Podium Styles
    podium: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'flex-end',
        paddingTop: 20,
        marginBottom: 20,
    },
    podiumItem: {
        alignItems: 'center',
        width: width * 0.26,
    },
    podiumItemFirst: {
        marginBottom: 20,
    },
    podiumAvatar: {
        width: 50,
        height: 50,
        borderRadius: 25,
        justifyContent: 'center',
        alignItems: 'center',
    },
    podiumAvatarFirst: {
        width: 64,
        height: 64,
        borderRadius: 32,
    },
    podiumAvatarText: {
        fontSize: 20,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
    },
    podiumName: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
        marginTop: 6,
        textAlign: 'center',
    },
    podiumXp: {
        fontSize: 11,
        fontFamily: 'Poppins_500Medium',
        color: '#9CA3AF',
    },
    podiumStand: {
        width: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 8,
        borderTopLeftRadius: 8,
        borderTopRightRadius: 8,
    },
    podiumStand1: {
        height: 60,
        backgroundColor: '#D71A21',
    },
    podiumStand2: {
        height: 45,
        backgroundColor: '#6B7280',
    },
    podiumStand3: {
        height: 30,
        backgroundColor: '#92400E',
    },
    podiumRank: {
        fontSize: 18,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
    },
    // Leaderboard Row
    leaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 14,
        padding: 12,
        marginBottom: 8,
    },
    topRank: {
        borderWidth: 1,
        borderColor: 'rgba(245, 158, 11, 0.3)',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
    },
    rankBadge: {
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    rankBadgeText: {
        fontSize: 14,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
    },
    avatarContainer: {
        marginLeft: 10,
    },
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
    },
    leaderInfo: {
        flex: 1,
        marginLeft: 12,
    },
    leaderName: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
    },
    leaderStore: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
    },
    xpContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    xpText: {
        fontSize: 12,
        fontFamily: 'Poppins_700Bold',
        color: '#D71A21',
        marginLeft: 4,
    },
    badgeCount: {
        flexDirection: 'row',
        alignItems: 'center',
        marginLeft: 8,
    },
    badgeCountText: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
        color: '#8B5CF6',
        marginLeft: 2,
    },
    // Badge Grid
    badgeGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        gap: 10,
    },
    badgeCard: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 16,
        padding: 14,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        marginBottom: 10,
    },
    badgeCardLocked: {
        opacity: 0.5,
    },
    badgeIcon: {
        width: 56,
        height: 56,
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 10,
    },
    badgeName: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
        textAlign: 'center',
    },
    badgeNameLocked: {
        color: '#6B7280',
    },
    badgeDesc: {
        fontSize: 10,
        fontFamily: 'Poppins_400Regular',
        color: '#9CA3AF',
        textAlign: 'center',
        marginTop: 4,
    },
    badgeXp: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 8,
    },
    badgeXpText: {
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
        color: '#D71A21',
        marginLeft: 2,
    },
    lockOverlay: {
        position: 'absolute',
        top: 10,
        right: 10,
    },
    // Challenge Card
    challengeCard: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    challengeHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    challengeXpBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#D71A21',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    challengeXpText: {
        fontSize: 12,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
        marginLeft: 2,
    },
    challengeDeadline: {
        fontSize: 11,
        fontFamily: 'Poppins_500Medium',
        color: '#6B7280',
    },
    challengeTitle: {
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
        marginBottom: 4,
    },
    challengeDesc: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#9CA3AF',
        marginBottom: 12,
    },
    progressContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    progressBar: {
        flex: 1,
        height: 8,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 4,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#10B981',
        borderRadius: 4,
    },
    progressText: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
    },
});
