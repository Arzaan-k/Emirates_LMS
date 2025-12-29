import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, MaterialIcons } from '@expo/vector-icons';
import { LANGUAGES, useLanguage } from '../context/language.context';

export default function Settings({ navigation }) {
    const insets = useSafeAreaInsets();
    const { language, changeLanguage, t } = useLanguage();

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Feather name="arrow-left" size={24} color="#111827" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{t('settings')}</Text>
                <View style={{ width: 40 }} /> 
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                
                {/* Language Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>{t('language')}</Text>
                    <View style={styles.card}>
                        {Object.entries(LANGUAGES).map(([code, name], index) => (
                            <TouchableOpacity 
                                key={code} 
                                style={[
                                    styles.optionRow, 
                                    index !== Object.keys(LANGUAGES).length - 1 && styles.borderBottom
                                ]}
                                onPress={() => changeLanguage(code)}
                            >
                                <View style={styles.optionLeft}>
                                    <Feather name="globe" size={20} color="#4B5563" />
                                    <Text style={styles.optionText}>{name}</Text>
                                </View>
                                {language === code && (
                                    <Feather name="check" size={20} color="#10B981" />
                                )}
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* Other Settings (Placeholder) */}
                <View style={styles.section}>
                    <View style={styles.card}>
                         <TouchableOpacity style={styles.optionRow}>
                             <View style={styles.optionLeft}>
                                <Feather name="bell" size={20} color="#4B5563" />
                                <Text style={styles.optionText}>Notifications</Text>
                             </View>
                             <Feather name="chevron-right" size={20} color="#9CA3AF" />
                         </TouchableOpacity>
                    </View>
                </View>
                
                 <TouchableOpacity style={styles.logoutBtn}>
                    <Text style={styles.logoutText}>{t('logout')}</Text>
                 </TouchableOpacity>

            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F9FAFB' },
    header: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        paddingHorizontal: 20, 
        paddingBottom: 20,
        backgroundColor: '#FFF'
    },
    backBtn: { padding: 8, borderRadius: 8, backgroundColor: '#F3F4F6' },
    headerTitle: { fontSize: 18, fontFamily: 'Poppins_600SemiBold', color: '#111827' },
    content: { padding: 20 },
    section: { marginBottom: 24 },
    sectionTitle: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: '#6B7280', marginBottom: 8, marginLeft: 4 },
    card: { backgroundColor: '#FFF', borderRadius: 16, overflow: 'hidden', elevation: 2, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 },
    optionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
    borderBottom: { borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    optionLeft: { flexDirection: 'row', alignItems: 'center' },
    optionText: { fontSize: 16, fontFamily: 'Poppins_500Medium', color: '#111827', marginLeft: 12 },
    
    logoutBtn: { backgroundColor: '#FEE2E2', padding: 16, borderRadius: 16, alignItems: 'center', marginTop: 20 },
    logoutText: { color: '#EF4444', fontFamily: 'Poppins_700Bold', fontSize: 16 }
});
