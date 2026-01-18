import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    Dimensions,
    FlatList,
    Image,
    TextInput
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import API_URL from '../config';

const { width, height } = Dimensions.get('window');

// Mock Data for Phase 2
const MOCK_CONTENT = [
    { id: '1', title: 'Hygiene Standards 2024', type: 'PDF', category: 'Compliance', date: '2024-03-15', size: '2.4 MB' },
    { id: '2', title: 'Customer Service Advanced', type: 'Video', category: 'Training', date: '2024-03-10', duration: '15:20' },
    { id: '3', title: 'Q1 Financial Report', type: 'Excel', category: 'Reports', date: '2024-03-01', size: '1.1 MB' },
];

export default function ContentLibraryModal({ visible, onClose }) {
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState('All');

    // In a real implementation, you would fetch content here
    // useEffect(() => { if(visible) fetchContent(); }, [visible]);

    if (!visible) return null;

    const tabs = ['All', 'Training', 'Compliance', 'Reports', 'Marketing'];

    const renderItem = ({ item }) => {
        let iconName = 'file-document-outline';
        let iconColor = '#6B7280';

        if (item.type === 'PDF') { iconName = 'file-pdf-box'; iconColor = '#EF4444'; }
        else if (item.type === 'Video') { iconName = 'video'; iconColor = '#8B5CF6'; }
        else if (item.type === 'Excel') { iconName = 'file-excel'; iconColor = '#10B981'; }

        return (
            <TouchableOpacity style={styles.contentItem}>
                <View style={[styles.iconBox, { backgroundColor: iconColor + '20' }]}>
                    <MaterialCommunityIcons name={iconName} size={24} color={iconColor} />
                </View>
                <View style={styles.itemInfo}>
                    <Text style={styles.itemTitle}>{item.title}</Text>
                    <View style={styles.itemMetaRow}>
                        <Text style={styles.itemCategory}>{item.category}</Text>
                        <Text style={styles.itemDot}>•</Text>
                        <Text style={styles.itemDate}>{item.date}</Text>
                    </View>
                </View>
                <TouchableOpacity style={styles.downloadBtn}>
                    <Feather name="download" size={18} color="#6B7280" />
                </TouchableOpacity>
            </TouchableOpacity>
        );
    };

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View style={styles.overlay}>
                <BlurView intensity={20} style={StyleSheet.absoluteFill} />
                <View style={styles.container}>
                    {/* Header */}
                    <LinearGradient
                        colors={['#3B82F6', '#2563EB']}
                        style={styles.header}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    >
                        <View style={styles.headerTop}>
                            <View style={styles.headerTitleRow}>
                                <View style={styles.headerIcon}>
                                    <MaterialCommunityIcons name="bookshelf" size={24} color="#FFF" />
                                </View>
                                <Text style={styles.headerTitle}>Content Library</Text>
                            </View>
                            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                                <Feather name="x" size={22} color="#FFF" />
                            </TouchableOpacity>
                        </View>

                        {/* Search Bar */}
                        <View style={styles.searchContainer}>
                            <Feather name="search" size={20} color="#93C5FD" style={{ marginLeft: 12 }} />
                            <TextInput
                                style={styles.searchInput}
                                placeholder="Search documents, videos..."
                                placeholderTextColor="#93C5FD"
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                            />
                        </View>
                    </LinearGradient>

                    {/* Tabs */}
                    <View style={styles.tabsContainer}>
                        <FlatList
                            data={tabs}
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            keyExtractor={item => item}
                            contentContainerStyle={{ paddingHorizontal: 16 }}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={[styles.tab, activeTab === item && styles.activeTab]}
                                    onPress={() => setActiveTab(item)}
                                >
                                    <Text style={[styles.tabText, activeTab === item && styles.activeTabText]}>{item}</Text>
                                </TouchableOpacity>
                            )}
                        />
                    </View>

                    {/* Content List */}
                    <FlatList
                        data={MOCK_CONTENT}
                        keyExtractor={item => item.id}
                        renderItem={renderItem}
                        contentContainerStyle={styles.listContent}
                        showsVerticalScrollIndicator={false}
                    />

                    {/* Upload button wrapper */}
                    <View style={styles.footer}>
                        <TouchableOpacity style={styles.uploadBtn}>
                            <Feather name="upload-cloud" size={20} color="#FFF" />
                            <Text style={styles.uploadBtnText}>Upload New Content</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    container: {
        backgroundColor: '#F9FAFB',
        height: '92%',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        overflow: 'hidden',
    },
    header: {
        padding: 24,
        paddingBottom: 20,
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    headerTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    headerIcon: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    headerTitle: {
        fontSize: 22,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
    },
    closeBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: 14,
        height: 50,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    searchInput: {
        flex: 1,
        height: '100%',
        paddingHorizontal: 12,
        color: '#FFF',
        fontFamily: 'Poppins_400Regular',
    },
    tabsContainer: {
        backgroundColor: '#FFF',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    tab: {
        paddingHorizontal: 20,
        paddingVertical: 8,
        borderRadius: 20,
        marginRight: 8,
        backgroundColor: '#F3F4F6',
    },
    activeTab: {
        backgroundColor: '#EFF6FF',
        borderWidth: 1,
        borderColor: '#3B82F6',
    },
    tabText: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
        color: '#6B7280',
    },
    activeTabText: {
        color: '#3B82F6',
    },
    listContent: {
        padding: 20,
    },
    contentItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        padding: 16,
        borderRadius: 16,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.03,
        shadowRadius: 8,
        elevation: 2,
    },
    iconBox: {
        width: 48,
        height: 48,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    itemInfo: {
        flex: 1,
    },
    itemTitle: {
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
        color: '#111827',
        marginBottom: 4,
    },
    itemMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    itemCategory: {
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
        color: '#6B7280',
    },
    itemDot: {
        fontSize: 12,
        color: '#D1D5DB',
        marginHorizontal: 8,
    },
    itemDate: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#9CA3AF',
    },
    downloadBtn: {
        padding: 10,
    },
    footer: {
        padding: 20,
        backgroundColor: '#FFF',
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
    },
    uploadBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#2563EB',
        paddingVertical: 16,
        borderRadius: 16,
        gap: 10,
    },
    uploadBtnText: {
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
    },
});
