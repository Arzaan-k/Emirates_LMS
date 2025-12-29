import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Modal,
  FlatList
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';

const { width, height } = Dimensions.get('window');

const HIRING_RESOURCES = [
  {
    id: 'general',
    title: 'Behavioral & Culture Fit',
    desc: 'Core questions to assess detailed soft skills and company fit.',
    icon: 'account-group',
    color: ['#3B82F6', '#2563EB'],
    questions: [
      "Tell me about a time you had to deal with a difficult customer.",
      "How do you prioritize tasks during a busy shift?",
      "Why do you want to work at Belgian Waffle?",
      "Describe a situation where you had to work as part of a team.",
      "What is your greatest weakness and how are you working on it?"
    ]
  },
  {
    id: 'barista',
    title: 'Barista / Front Staff',
    desc: 'Technical questions for food handling and customer service.',
    icon: 'coffee',
    color: ['#F59E0B', '#D97706'],
    questions: [
      "Walk me through the steps of making a standard Cappuccino.",
      "How do you handle a wrong order complaint?",
      "What are the hygiene standards you follow before starting a shift?",
      "How would you upsell a waffle to a customer purchasing a coffee?"
    ]
  },
  {
    id: 'manager',
    title: 'Store Manager',
    desc: 'Leadership, inventory, and conflict resolution scenarios.',
    icon: 'tie',
    color: ['#10B981', '#059669'],
    questions: [
      "How do you handle an employee who is consistently late?",
      "Describe your experience with inventory management.",
      "What strategies would you use to increase store sales?",
      "How do you motivate your team during low-traffic periods?"
    ]
  },
  {
    id: 'safety',
    title: 'Safety & Compliance',
    desc: 'Essential checks for food safety and emergency protocols.',
    icon: 'shield-check',
    color: ['#8B5CF6', '#7C3AED'],
    questions: [
      "What is the first thing you do in case of a fire alarm?",
      "Explain the 'First In, First Out' (FIFO) method in inventory.",
      "How often should the espresso machine be deep cleaned?",
      "What are the critical temperatures for food storage?"
    ]
  },
];

export default function InterviewModules() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [selectedModule, setSelectedModule] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  const openModule = (module) => {
    setSelectedModule(module);
    setModalVisible(true);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <Feather name="arrow-left" size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Hiring Toolkit</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: 20 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.subtitle}>
          Guides and question banks for conducting interviews.
        </Text>

        {HIRING_RESOURCES.map((module) => (
          <TouchableOpacity
            key={module.id}
            style={styles.card}
            onPress={() => openModule(module)}
          >
            <LinearGradient
              colors={module.color}
              style={styles.cardIcon}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <MaterialCommunityIcons name={module.icon} size={28} color="#FFF" />
            </LinearGradient>

            <View style={styles.cardContent}>
              <Text style={styles.cardTitle}>{module.title}</Text>
              <Text style={styles.cardDesc}>{module.desc}</Text>
              <Text style={styles.questionCount}>{module.questions.length} Questions</Text>
            </View>

            <Feather name="chevron-right" size={20} color="#9CA3AF" />
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* QUESTIONS MODAL */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedModule?.title}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Feather name="x" size={24} color="#374151" />
              </TouchableOpacity>
            </View>

            <FlatList
              data={selectedModule?.questions}
              keyExtractor={(item, index) => index.toString()}
              renderItem={({ item, index }) => (
                <View style={styles.questionRow}>
                  <Text style={styles.qNum}>Q{index + 1}.</Text>
                  <Text style={styles.qText}>{item}</Text>
                </View>
              )}
              contentContainerStyle={{ paddingBottom: 20 }}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  backBtn: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'Poppins_700Bold',
    color: '#111827',
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    fontFamily: 'Poppins_400Regular',
    marginBottom: 24,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  cardIcon: {
    width: 60,
    height: 60,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
    color: '#111827',
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 12,
    color: '#6B7280',
    fontFamily: 'Poppins_400Regular',
    marginBottom: 8,
  },
  questionCount: {
    fontSize: 11,
    color: '#F59E0B',
    fontFamily: 'Poppins_600SemiBold',
  },
  // MODAL styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    height: height * 0.7, // 70% height
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: 'Poppins_700Bold',
    color: '#111827',
  },
  questionRow: {
    flexDirection: 'row',
    marginBottom: 16,
    backgroundColor: '#F3F4F6',
    padding: 16,
    borderRadius: 12,
  },
  qNum: {
    fontSize: 14,
    fontFamily: 'Poppins_700Bold',
    color: '#6B7280',
    marginRight: 12,
    width: 30,
  },
  qText: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    color: '#1F2937',
    flex: 1,
    lineHeight: 22,
  },
});
