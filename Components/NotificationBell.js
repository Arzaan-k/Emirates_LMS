import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    FlatList,
    Dimensions,
    Platform,
    RefreshControl,
    Image,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import API_URL from '../config';

const { width, height } = Dimensions.get('window');

const NOTIF_ICONS = {
    info: { name: 'info', color: '#3B82F6', bg: '#EFF6FF' },
    success: { name: 'check-circle', color: '#10B981', bg: '#D1FAE5' },
    warning: { name: 'alert-triangle', color: '#D71A21', bg: '#FEF3C7' },
    urgent: { name: 'alert-circle', color: '#EF4444', bg: '#FEE2E2' },
    error: { name: 'x-circle', color: '#EF4444', bg: '#FEE2E2' },
    course: { name: 'book-open', color: '#8B5CF6', bg: '#EDE9FE' },
    quiz: { name: 'brain', color: '#6366F1', bg: '#EEF2FF' },
};

export default function NotificationBell({ userEmail, onDailyQuizPress }) {
    const [visible, setVisible] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    const fetchNotifications = useCallback(async () => {
        if (!userEmail) return;
        try {
            const response = await fetch(`${API_URL}/api/v1/self-learning/notifications?user_email=${userEmail}&limit=50`);
            const data = await response.json();
            setNotifications(data.notifications || []);
            setUnreadCount(data.unread_count || 0);
        } catch (error) {
            console.error('Error fetching notifications:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [userEmail]);

    useEffect(() => {
        fetchNotifications();
        // Poll every 60 seconds
        const interval = setInterval(fetchNotifications, 60000);
        return () => clearInterval(interval);
    }, [fetchNotifications]);

    const markAsRead = async (notifId) => {
        try {
            await fetch(`${API_URL}/api/v1/self-learning/notifications/${notifId}/read`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_email: userEmail }),
            });
            setNotifications(prev =>
                prev.map(n => n.id === notifId ? { ...n, is_read: true } : n)
            );
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch (error) {
            console.error('Error marking notification read:', error);
        }
    };

    const markAllRead = async () => {
        try {
            await fetch(`${API_URL}/api/v1/self-learning/notifications/mark-all-read`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_email: userEmail }),
            });
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
            setUnreadCount(0);
        } catch (error) {
            console.error('Error marking all read:', error);
        }
    };

    const timeAgo = (dateStr) => {
        if (!dateStr) return '';
        const diff = Date.now() - new Date(dateStr).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Just now';
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        const days = Math.floor(hrs / 24);
        if (days < 7) return `${days}d ago`;
        return new Date(dateStr).toLocaleDateString();
    };

    const renderNotification = ({ item, index }) => {
        const iconConfig = NOTIF_ICONS[item.notification_type] || NOTIF_ICONS.info;

        return (
            <Animated.View entering={FadeInDown.delay(index * 40).springify()}>
                <TouchableOpacity
                    style={[styles.notifItem, !item.is_read && styles.notifUnread]}
                    activeOpacity={0.8}
                                onPress={() => {
                        if (!item.is_read) markAsRead(item.id);
                        // Deep-link: if it's a daily quiz notification, navigate to daily quiz
                        if (item.action_type === 'daily_quiz' && onDailyQuizPress) {
                            setVisible(false);
                            onDailyQuizPress();
                        }
                    }}
                >
                    <View style={[styles.notifIcon, { backgroundColor: iconConfig.bg }]}>
                        <Feather name={iconConfig.name} size={18} color={iconConfig.color} />
                    </View>
                    <View style={styles.notifContent}>
                        <View style={styles.notifTitleRow}>
                            <Text style={styles.notifTitle} numberOfLines={1}>{item.title}</Text>
                            {!item.is_read && <View style={styles.unreadDot} />}
                        </View>

                        {item.media_url && (
                            <Image
                                source={{ uri: item.media_url }}
                                style={{ width: '100%', height: 120, borderRadius: 8, marginVertical: 8 }}
                                resizeMode="cover"
                            />
                        )}

                        <Text style={styles.notifMessage} numberOfLines={2}>{item.message}</Text>
                        <View style={styles.notifMeta}>
                            <Text style={styles.notifTime}>{timeAgo(item.created_at)}</Text>
                            {item.is_crucial && (
                                <View style={styles.crucialBadge}>
                                    <Text style={styles.crucialText}>Important</Text>
                                </View>
                            )}
                        </View>
                    </View>
                </TouchableOpacity>
            </Animated.View>
        );
    };

    return (
        <>
            {/* Bell Icon */}
            <TouchableOpacity
                style={styles.bellBtn}
                onPress={() => { setVisible(true); fetchNotifications(); }}
            >
                <Feather name="bell" size={22} color="#78350F" />
                {unreadCount > 0 && (
                    <View style={styles.badge}>
                        <Text style={styles.badgeText}>
                            {unreadCount > 99 ? '99+' : unreadCount}
                        </Text>
                    </View>
                )}
            </TouchableOpacity>

            {/* Notification Panel Modal */}
            <Modal visible={visible} animationType="slide" transparent>
                <View style={styles.overlay}>
                    <TouchableOpacity style={styles.overlayBg} onPress={() => setVisible(false)} />
                    <View style={styles.panel}>
                        {/* Header */}
                        <View style={styles.panelHeader}>
                            <View>
                                <Text style={styles.panelTitle}>Notifications</Text>
                                <Text style={styles.panelSub}>{unreadCount} unread</Text>
                            </View>
                            <View style={{ flexDirection: 'row', gap: 12 }}>
                                {unreadCount > 0 && (
                                    <TouchableOpacity onPress={markAllRead} style={styles.markAllBtn}>
                                        <Feather name="check-circle" size={14} color="#10B981" />
                                        <Text style={styles.markAllText}>Read all</Text>
                                    </TouchableOpacity>
                                )}
                                <TouchableOpacity onPress={() => setVisible(false)} style={styles.closeBtn}>
                                    <Feather name="x" size={22} color="#6B7280" />
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* List */}
                        <FlatList
                            data={notifications}
                            keyExtractor={(item) => item.id}
                            renderItem={renderNotification}
                            contentContainerStyle={{ paddingBottom: 40 }}
                            showsVerticalScrollIndicator={false}
                            refreshControl={
                                <RefreshControl
                                    refreshing={refreshing}
                                    onRefresh={() => { setRefreshing(true); fetchNotifications(); }}
                                    tintColor="#D71A21"
                                />
                            }
                            ListEmptyComponent={
                                <View style={styles.emptyWrap}>
                                    <MaterialCommunityIcons name="bell-off-outline" size={50} color="#E5E7EB" />
                                    <Text style={styles.emptyText}>No notifications yet</Text>
                                </View>
                            }
                        />
                    </View>
                </View>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    bellBtn: {
        position: 'relative',
        padding: 6,
    },
    badge: {
        position: 'absolute',
        top: 0,
        right: 0,
        backgroundColor: '#EF4444',
        minWidth: 18,
        height: 18,
        borderRadius: 9,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 4,
    },
    badgeText: {
        fontSize: 10,
        fontWeight: '800',
        color: '#FFF',
    },

    // Modal
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    overlayBg: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
    panel: {
        backgroundColor: '#FFF',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: height * 0.75,
        paddingTop: 8,
        ...Platform.select({
            ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 12 },
            android: { elevation: 10 },
            web: { boxShadow: '0 -4px 12px rgba(0,0,0,0.1)' },
        }),
    },
    panelHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    panelTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1F2937',
    },
    panelSub: {
        fontSize: 12,
        color: '#6B7280',
        marginTop: 2,
    },
    markAllBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12,
        backgroundColor: '#D1FAE5',
    },
    markAllText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#059669',
    },
    closeBtn: {
        padding: 4,
    },

    // Notification Item
    notifItem: {
        flexDirection: 'row',
        padding: 14,
        paddingHorizontal: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#F9FAFB',
        gap: 12,
    },
    notifUnread: {
        backgroundColor: '#FFFBEB',
    },
    notifIcon: {
        width: 40,
        height: 40,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    notifContent: {
        flex: 1,
    },
    notifTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    notifTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#1F2937',
        flex: 1,
    },
    unreadDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#D71A21',
    },
    notifMessage: {
        fontSize: 12,
        color: '#6B7280',
        marginTop: 3,
        lineHeight: 17,
    },
    notifMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 6,
    },
    notifTime: {
        fontSize: 11,
        color: '#9CA3AF',
    },
    crucialBadge: {
        backgroundColor: '#FEE2E2',
        paddingHorizontal: 6,
        paddingVertical: 1,
        borderRadius: 6,
    },
    crucialText: {
        fontSize: 9,
        fontWeight: '700',
        color: '#EF4444',
    },

    // Empty
    emptyWrap: {
        alignItems: 'center',
        paddingTop: 60,
    },
    emptyText: {
        fontSize: 14,
        color: '#9CA3AF',
        marginTop: 12,
    },
});
