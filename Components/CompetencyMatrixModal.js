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
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import API_URL from '../config';

const { width, height } = Dimensions.get('window');

const SKILL_COLORS = {
    1: '#EF4444', // Red - Beginner
    2: '#D71A21', // Orange - Basic
    3: '#FBBF24', // Yellow - Intermediate
    4: '#10B981', // Green - Advanced
    5: '#3B82F6', // Blue - Expert
};

const SKILL_LABELS = {
    1: 'Beginner',
    2: 'Basic',
    3: 'Intermediate',
    4: 'Advanced',
    5: 'Expert'
};

// Skill Level Badge
const SkillLevelBadge = ({ level }) => (
    <View style={[styles.levelBadge, { backgroundColor: SKILL_COLORS[level] + '30', borderColor: SKILL_COLORS[level] }]}>
        <Text style={[styles.levelText, { color: SKILL_COLORS[level] }]}>{level}</Text>
    </View>
);

// Employee Row in Matrix
const EmployeeRow = ({ employee, skills, onSelect }) => {
    const avgLevel = Object.values(employee.skills).reduce((a, b) => a + b, 0) / Object.keys(employee.skills).length;
    
    return (
        <TouchableOpacity style={styles.matrixRow} onPress={() => onSelect(employee)}>
            <View style={styles.employeeInfo}>
                <View style={styles.employeeAvatar}>
                    <Text style={styles.avatarText}>{employee.name?.charAt(0)}</Text>
                </View>
                <View>
                    <Text style={styles.employeeName} numberOfLines={1}>{employee.name}</Text>
                    <Text style={styles.employeeRole}>{employee.role}</Text>
                </View>
            </View>
            
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.skillsScroll}>
                {skills.map(skill => (
                    <View key={skill.id} style={styles.skillCell}>
                        <SkillLevelBadge level={employee.skills[skill.id] || 0} />
                    </View>
                ))}
            </ScrollView>
            
            <View style={[styles.overallBadge, { backgroundColor: avgLevel >= 4 ? '#10B981' : (avgLevel >= 3 ? '#D71A21' : '#EF4444') }]}>
                <Text style={styles.overallText}>{employee.overall_score}%</Text>
            </View>
        </TouchableOpacity>
    );
};

// Skill Gap Card
const SkillGapCard = ({ gap }) => (
    <View style={styles.gapCard}>
        <View style={[styles.gapIcon, { backgroundColor: gap.skill.color || '#EF4444' }]}>
            <MaterialCommunityIcons name={gap.skill.icon || 'alert'} size={20} color="#FFF" />
        </View>
        <View style={styles.gapInfo}>
            <Text style={styles.gapName}>{gap.skill.name}</Text>
            <View style={styles.gapStats}>
                <Text style={styles.gapAvg}>Avg: {gap.average_level}/5</Text>
                <View style={styles.gapDot} />
                <Text style={styles.gapAtRisk}>{gap.employees_below_3} need training</Text>
            </View>
        </View>
        <View style={styles.gapProgress}>
            <View style={[styles.gapProgressFill, { width: `${(gap.average_level / 5) * 100}%` }]} />
        </View>
    </View>
);

// Employee Detail Modal
const EmployeeDetailView = ({ employee, skills, onClose }) => {
    if (!employee) return null;
    
    const strengths = skills.filter(s => (employee.skills[s.id] || 0) >= 4);
    const gaps = skills.filter(s => (employee.skills[s.id] || 0) < 3);
    
    return (
        <View style={styles.detailContainer}>
            <View style={styles.detailHeader}>
                <TouchableOpacity onPress={onClose} style={styles.detailBack}>
                    <Feather name="arrow-left" size={20} color="#FFF" />
                </TouchableOpacity>
                <Text style={styles.detailTitle}>{employee.name}</Text>
            </View>
            
            {/* Overall Score */}
            <View style={styles.scoreCard}>
                <View style={styles.scoreBig}>
                    <Text style={styles.scoreValue}>{employee.overall_score}%</Text>
                    <Text style={styles.scoreLabel}>Overall Competency</Text>
                </View>
                <View style={styles.scoreStats}>
                    <View style={styles.scoreStat}>
                        <MaterialCommunityIcons name="check-circle" size={20} color="#10B981" />
                        <Text style={styles.scoreStatValue}>{strengths.length}</Text>
                        <Text style={styles.scoreStatLabel}>Strengths</Text>
                    </View>
                    <View style={styles.scoreStat}>
                        <MaterialCommunityIcons name="alert-circle" size={20} color="#EF4444" />
                        <Text style={styles.scoreStatValue}>{gaps.length}</Text>
                        <Text style={styles.scoreStatLabel}>Gaps</Text>
                    </View>
                </View>
            </View>
            
            {/* All Skills */}
            <Text style={styles.sectionTitle}>Skill Breakdown</Text>
            {skills.map((skill, idx) => {
                const level = employee.skills[skill.id] || 0;
                return (
                    <Animated.View key={skill.id} entering={FadeInDown.delay(idx * 50)} style={styles.skillRow}>
                        <View style={[styles.skillIcon, { backgroundColor: SKILL_COLORS[level] + '20' }]}>
                            <MaterialCommunityIcons 
                                name={skill.icon || 'star'} 
                                size={18} 
                                color={SKILL_COLORS[level]} 
                            />
                        </View>
                        <View style={styles.skillInfo}>
                            <Text style={styles.skillName}>{skill.name}</Text>
                            <View style={styles.skillBar}>
                                <Animated.View 
                                    style={[
                                        styles.skillBarFill, 
                                        { width: `${(level / 5) * 100}%`, backgroundColor: SKILL_COLORS[level] }
                                    ]} 
                                />
                            </View>
                        </View>
                        <View style={[styles.skillLevelTag, { backgroundColor: SKILL_COLORS[level] }]}>
                            <Text style={styles.skillLevelTagText}>{SKILL_LABELS[level] || 'N/A'}</Text>
                        </View>
                    </Animated.View>
                );
            })}
        </View>
    );
};

export default function CompetencyMatrixModal({ visible, onClose }) {
    const [view, setView] = useState('matrix'); // matrix, gaps, detail
    const [matrix, setMatrix] = useState([]);
    const [skills, setSkills] = useState([]);
    const [gaps, setGaps] = useState([]);
    const [avgScore, setAvgScore] = useState(0);
    const [loading, setLoading] = useState(false);
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    
    useEffect(() => {
        if (visible) {
            fetchData();
        }
    }, [visible]);
    
    const fetchData = async () => {
        setLoading(true);
        try {
            // Fetch matrix
            const matrixRes = await fetch(`${API_URL}/competency/matrix`);
            const matrixData = await matrixRes.json();
            setMatrix(matrixData.matrix || []);
            setSkills(matrixData.skills || []);
            setAvgScore(matrixData.avg_score || 0);
            
            // Fetch gaps
            const gapsRes = await fetch(`${API_URL}/competency/gaps`);
            const gapsData = await gapsRes.json();
            setGaps(gapsData.top_gaps || []);
            
        } catch (err) {
            console.log('Competency fetch error:', err);
        }
        setLoading(false);
    };
    
    const handleSelectEmployee = (emp) => {
        setSelectedEmployee(emp);
        setView('detail');
    };
    
    if (!visible) return null;
    
    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View style={styles.overlay}>
                <BlurView intensity={80} style={StyleSheet.absoluteFill} />
                <Animated.View entering={FadeInUp} style={styles.container}>
                    <LinearGradient colors={['#1F2937', '#111827']} style={styles.gradient}>
                        {view === 'detail' && selectedEmployee ? (
                            <ScrollView showsVerticalScrollIndicator={false}>
                                <EmployeeDetailView 
                                    employee={selectedEmployee} 
                                    skills={skills}
                                    onClose={() => { setSelectedEmployee(null); setView('matrix'); }}
                                />
                            </ScrollView>
                        ) : (
                            <>
                                {/* Header */}
                                <View style={styles.header}>
                                    <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                                        <Feather name="x" size={24} color="#FFF" />
                                    </TouchableOpacity>
                                    <View style={styles.headerCenter}>
                                        <MaterialCommunityIcons name="view-grid" size={24} color="#3B82F6" />
                                        <Text style={styles.headerTitle}>Competency Matrix</Text>
                                    </View>
                                    <View style={{ width: 40 }} />
                                </View>
                                
                                {/* Summary Cards */}
                                <View style={styles.summaryRow}>
                                    <View style={styles.summaryCard}>
                                        <Text style={styles.summaryValue}>{matrix.length}</Text>
                                        <Text style={styles.summaryLabel}>Employees</Text>
                                    </View>
                                    <View style={[styles.summaryCard, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
                                        <Text style={[styles.summaryValue, { color: '#10B981' }]}>{avgScore}%</Text>
                                        <Text style={styles.summaryLabel}>Avg Score</Text>
                                    </View>
                                    <View style={[styles.summaryCard, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
                                        <Text style={[styles.summaryValue, { color: '#EF4444' }]}>{gaps.length}</Text>
                                        <Text style={styles.summaryLabel}>Skill Gaps</Text>
                                    </View>
                                </View>
                                
                                {/* View Toggle */}
                                <View style={styles.toggleRow}>
                                    <TouchableOpacity 
                                        style={[styles.toggleBtn, view === 'matrix' && styles.toggleBtnActive]}
                                        onPress={() => setView('matrix')}
                                    >
                                        <MaterialCommunityIcons name="view-grid" size={18} color={view === 'matrix' ? '#111827' : '#9CA3AF'} />
                                        <Text style={[styles.toggleText, view === 'matrix' && styles.toggleTextActive]}>Matrix</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity 
                                        style={[styles.toggleBtn, view === 'gaps' && styles.toggleBtnActive]}
                                        onPress={() => setView('gaps')}
                                    >
                                        <MaterialCommunityIcons name="alert-circle" size={18} color={view === 'gaps' ? '#111827' : '#9CA3AF'} />
                                        <Text style={[styles.toggleText, view === 'gaps' && styles.toggleTextActive]}>Skill Gaps</Text>
                                    </TouchableOpacity>
                                </View>
                                
                                {/* Skill Headers */}
                                {view === 'matrix' && (
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.skillHeaders}>
                                        <View style={{ width: 140 }} />
                                        {skills.map(skill => (
                                            <View key={skill.id} style={styles.skillHeader}>
                                                <MaterialCommunityIcons name={skill.icon || 'star'} size={16} color="#9CA3AF" />
                                                <Text style={styles.skillHeaderText} numberOfLines={1}>{skill.name}</Text>
                                            </View>
                                        ))}
                                        <View style={{ width: 60 }} />
                                    </ScrollView>
                                )}
                                
                                {/* Content */}
                                <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                                    {loading ? (
                                        <ActivityIndicator size="large" color="#3B82F6" style={{ marginTop: 40 }} />
                                    ) : view === 'matrix' ? (
                                        <>
                                            {matrix.map((employee, idx) => (
                                                <Animated.View key={employee.email} entering={FadeInDown.delay(idx * 50)}>
                                                    <EmployeeRow 
                                                        employee={employee} 
                                                        skills={skills}
                                                        onSelect={handleSelectEmployee}
                                                    />
                                                </Animated.View>
                                            ))}
                                        </>
                                    ) : (
                                        <>
                                            <Text style={styles.sectionTitle}>Top Skill Gaps</Text>
                                            <Text style={styles.sectionSubtitle}>Skills that need attention across the team</Text>
                                            {gaps.map((gap, idx) => (
                                                <Animated.View key={gap.skill.id} entering={FadeInDown.delay(idx * 100)}>
                                                    <SkillGapCard gap={gap} />
                                                </Animated.View>
                                            ))}
                                            
                                            {/* Legend */}
                                            <View style={styles.legend}>
                                                <Text style={styles.legendTitle}>Skill Level Guide</Text>
                                                <View style={styles.legendRow}>
                                                    {Object.entries(SKILL_LABELS).map(([level, label]) => (
                                                        <View key={level} style={styles.legendItem}>
                                                            <View style={[styles.legendDot, { backgroundColor: SKILL_COLORS[level] }]} />
                                                            <Text style={styles.legendText}>{label}</Text>
                                                        </View>
                                                    ))}
                                                </View>
                                            </View>
                                        </>
                                    )}
                                    
                                    <View style={{ height: 40 }} />
                                </ScrollView>
                            </>
                        )}
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
        height: height * 0.92,
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
    summaryRow: {
        flexDirection: 'row',
        paddingHorizontal: 20,
        gap: 10,
        marginBottom: 16,
    },
    summaryCard: {
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 12,
        padding: 12,
        alignItems: 'center',
    },
    summaryValue: {
        fontSize: 22,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
    },
    summaryLabel: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        color: '#9CA3AF',
    },
    toggleRow: {
        flexDirection: 'row',
        paddingHorizontal: 20,
        gap: 10,
        marginBottom: 12,
    },
    toggleBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.05)',
        gap: 6,
    },
    toggleBtnActive: {
        backgroundColor: '#3B82F6',
    },
    toggleText: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
        color: '#9CA3AF',
    },
    toggleTextActive: {
        color: '#111827',
    },
    skillHeaders: {
        flexDirection: 'row',
        paddingHorizontal: 20,
        marginBottom: 8,
    },
    skillHeader: {
        width: 50,
        alignItems: 'center',
        paddingHorizontal: 4,
    },
    skillHeaderText: {
        fontSize: 8,
        fontFamily: 'Poppins_500Medium',
        color: '#6B7280',
        marginTop: 2,
        textAlign: 'center',
    },
    content: {
        flex: 1,
        paddingHorizontal: 20,
    },
    sectionTitle: {
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
        marginTop: 16,
        marginBottom: 4,
    },
    sectionSubtitle: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
        marginBottom: 16,
    },
    // Matrix Row
    matrixRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 12,
        padding: 10,
        marginBottom: 8,
    },
    employeeInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        width: 130,
    },
    employeeAvatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#374151',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 8,
    },
    avatarText: {
        fontSize: 14,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
    },
    employeeName: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
        width: 80,
    },
    employeeRole: {
        fontSize: 10,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
    },
    skillsScroll: {
        flex: 1,
    },
    skillCell: {
        width: 50,
        alignItems: 'center',
    },
    levelBadge: {
        width: 28,
        height: 28,
        borderRadius: 6,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
    },
    levelText: {
        fontSize: 12,
        fontFamily: 'Poppins_700Bold',
    },
    overallBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
        marginLeft: 8,
    },
    overallText: {
        fontSize: 11,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
    },
    // Gap Card
    gapCard: {
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderRadius: 14,
        padding: 14,
        marginBottom: 10,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.2)',
    },
    gapIcon: {
        width: 44,
        height: 44,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    gapInfo: {
        flex: 1,
    },
    gapName: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
    },
    gapStats: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
    },
    gapAvg: {
        fontSize: 11,
        fontFamily: 'Poppins_500Medium',
        color: '#D71A21',
    },
    gapDot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#6B7280',
        marginHorizontal: 6,
    },
    gapAtRisk: {
        fontSize: 11,
        fontFamily: 'Poppins_500Medium',
        color: '#EF4444',
    },
    gapProgress: {
        width: 60,
        height: 6,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 3,
        overflow: 'hidden',
    },
    gapProgressFill: {
        height: '100%',
        backgroundColor: '#EF4444',
        borderRadius: 3,
    },
    // Legend
    legend: {
        marginTop: 24,
        padding: 16,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 14,
    },
    legendTitle: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
        marginBottom: 10,
    },
    legendRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    legendDot: {
        width: 10,
        height: 10,
        borderRadius: 3,
        marginRight: 4,
    },
    legendText: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        color: '#9CA3AF',
    },
    // Detail View
    detailContainer: {
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 16,
    },
    detailHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
    },
    detailBack: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    detailTitle: {
        fontSize: 20,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
    },
    scoreCard: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 16,
        padding: 20,
        marginBottom: 20,
    },
    scoreBig: {
        alignItems: 'center',
        marginBottom: 16,
    },
    scoreValue: {
        fontSize: 48,
        fontFamily: 'Poppins_700Bold',
        color: '#10B981',
    },
    scoreLabel: {
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        color: '#9CA3AF',
    },
    scoreStats: {
        flexDirection: 'row',
        justifyContent: 'space-around',
    },
    scoreStat: {
        alignItems: 'center',
    },
    scoreStatValue: {
        fontSize: 20,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
        marginTop: 4,
    },
    scoreStatLabel: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
    },
    skillRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 12,
        padding: 12,
        marginBottom: 8,
    },
    skillIcon: {
        width: 36,
        height: 36,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    skillInfo: {
        flex: 1,
    },
    skillName: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
        marginBottom: 4,
    },
    skillBar: {
        height: 6,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 3,
        overflow: 'hidden',
    },
    skillBarFill: {
        height: '100%',
        borderRadius: 3,
    },
    skillLevelTag: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 10,
        marginLeft: 8,
    },
    skillLevelTagText: {
        fontSize: 10,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
    },
});
