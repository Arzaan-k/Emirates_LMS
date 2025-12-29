import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Dimensions,
    Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LineChart, BarChart, PieChart } from 'react-native-chart-kit';
import * as FileSystem from 'expo-file-system/legacy';
import * as XLSX from 'xlsx';
import * as Sharing from 'expo-sharing';

const { width } = Dimensions.get('window');

const Analytics = ({ navigation }) => {

    /* ---------------- MOCK DATA ---------------- */

    const courseEngagementData = {
        labels: ["Espresso", "Safety", "Cleanliness", "Service", "Soft Skills"],
        datasets: [{ data: [450, 320, 210, 480, 150] }]
    };

    const assessmentPassRate = [
        { name: "Passed", population: 85, color: "#10B981", legendFontColor: "#374151", legendFontSize: 12 },
        { name: "Failed", population: 15, color: "#EF4444", legendFontColor: "#374151", legendFontSize: 12 },
    ];

    const monthlyActivity = {
        labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
        datasets: [{
            data: [20, 45, 28, 80, 99, 43],
            color: (opacity = 1) => `rgba(79, 70, 229, ${opacity})`,
        }]
    };

    const learnerData = [
        { Name: "Aditya Joshi", Role: "Store Manager", Course: "Advanced Espresso", Status: "Passed", Score: "95%", Date: "2023-12-01" },
        { Name: "Rahul Verma", Role: "User", Course: "Safety Drill", Status: "Passed", Score: "88%", Date: "2023-12-05" },
        { Name: "Sneha Kapur", Role: "User", Course: "Cleanliness", Status: "Failed", Score: "45%", Date: "2023-12-10" },
        { Name: "Vikram Singh", Role: "User", Course: "Customer Service", Status: "Passed", Score: "92%", Date: "2023-12-15" },
        { Name: "Priya Das", Role: "User", Course: "Espresso Calibration", Status: "Passed", Score: "98%", Date: "2023-12-20" },
    ];

    /* ---------------- EXPORT TO EXCEL ---------------- */

    const exportToExcel = async () => {
        try {
            const ws = XLSX.utils.json_to_sheet(learnerData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Learner Report");

            const wbout = XLSX.write(wb, {
                type: 'base64',
                bookType: 'xlsx'
            });

            const uri = FileSystem.cacheDirectory + 'LMS_Analytics_Report.xlsx';

            await FileSystem.writeAsStringAsync(uri, wbout, {
                encoding: FileSystem.EncodingType.Base64,
            });

            await Sharing.shareAsync(uri, {
                mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                dialogTitle: 'LMS Analytics Report',
                UTI: 'com.microsoft.excel.xlsx',
            });

        } catch (error) {
            console.error(error);
            Alert.alert("Export Error", "Failed to generate Excel report.");
        }
    };

    /* ---------------- CHART CONFIG ---------------- */

    const chartConfig = {
        backgroundGradientFrom: "#FFF",
        backgroundGradientTo: "#FFF",
        color: (opacity = 1) => `rgba(79, 70, 229, ${opacity})`,
        labelColor: (opacity = 1) => `rgba(55, 65, 81, ${opacity})`,
        decimalPlaces: 0,
        strokeWidth: 2,
        barPercentage: 0.6,
        propsForLabels: { fontSize: 10 },
    };

    /* ---------------- UI ---------------- */

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Feather name="arrow-left" size={24} color="#111827" />
                </TouchableOpacity>

                <Text style={styles.headerTitle}>Analytics Dashboard</Text>

                <TouchableOpacity onPress={exportToExcel} style={styles.exportBtn}>
                    <Feather name="download" size={20} color="#4F46E5" />
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

                {/* SUMMARY */}
                <View style={styles.summaryGrid}>
                    <View style={styles.summaryCard}>
                        <Text style={styles.summaryValue}>1,280</Text>
                        <Text style={styles.summaryLabel}>Total Views</Text>
                    </View>

                    <View style={styles.summaryCard}>
                        <Text style={[styles.summaryValue, { color: '#10B981' }]}>85%</Text>
                        <Text style={styles.summaryLabel}>Pass Rate</Text>
                    </View>
                </View>

                {/* BAR CHART */}
                <View style={styles.chartSection}>
                    <Text style={styles.sectionTitle}>Course Engagement</Text>
                    <BarChart
                        data={courseEngagementData}
                        width={width - 80}
                        height={220}
                        chartConfig={chartConfig}
                        fromZero
                        style={styles.chart}
                    />
                </View>

                {/* LINE CHART */}
                <View style={styles.chartSection}>
                    <Text style={styles.sectionTitle}>Monthly Activity</Text>
                    <LineChart
                        data={monthlyActivity}
                        width={width - 80}
                        height={220}
                        chartConfig={chartConfig}
                        bezier
                        style={styles.chart}
                    />
                </View>

                {/* PIE CHART */}
                <View style={styles.chartSection}>
                    <Text style={styles.sectionTitle}>Assessment Success</Text>
                    <PieChart
                        data={assessmentPassRate}
                        width={width - 40}
                        height={200}
                        chartConfig={chartConfig}
                        accessor="population"
                        backgroundColor="transparent"
                        absolute
                    />
                </View>

                {/* TABLE */}
                <View style={styles.tableSection}>
                    <Text style={styles.sectionTitle}>Recent Learners</Text>

                    {learnerData.slice(0, 3).map((item, index) => (
                        <View key={index} style={styles.tableRow}>
                            <View>
                                <Text style={styles.rowName}>{item.Name}</Text>
                                <Text style={styles.rowCourse}>{item.Course}</Text>
                            </View>
                            <View style={[
                                styles.statusBadge,
                                { backgroundColor: item.Status === 'Passed' ? '#DCFCE7' : '#FEE2E2' }
                            ]}>
                                <Text style={[
                                    styles.statusText,
                                    { color: item.Status === 'Passed' ? '#16A34A' : '#EF4444' }
                                ]}>
                                    {item.Status}
                                </Text>
                            </View>
                        </View>
                    ))}

                    <TouchableOpacity style={styles.viewMoreBtn} onPress={exportToExcel}>
                        <Text style={styles.viewMoreText}>Download Full Excel Report</Text>
                    </TouchableOpacity>
                </View>

            </ScrollView>
        </SafeAreaView>
    );
};

/* ---------------- STYLES ---------------- */

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F9FAFB' },

    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 15,
        backgroundColor: '#FFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },

    backBtn: { padding: 8 },
    headerTitle: { fontSize: 18, fontFamily: 'Poppins_600SemiBold', color: '#111827' },
    exportBtn: { padding: 8, backgroundColor: '#EEF2FF', borderRadius: 10 },

    scrollContent: { padding: 20, paddingBottom: 40 },

    summaryGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },

    summaryCard: {
        backgroundColor: '#FFF',
        width: (width - 60) / 2,
        padding: 20,
        borderRadius: 16,
        alignItems: 'center',
        elevation: 2,
    },

    summaryValue: { fontSize: 24, fontFamily: 'Poppins_700Bold', color: '#4F46E5' },
    summaryLabel: { fontSize: 12, color: '#6B7280', marginTop: 4 },

    chartSection: {
        backgroundColor: '#FFF',
        padding: 20,
        borderRadius: 20,
        marginBottom: 20,
        elevation: 2,
    },

    sectionTitle: { fontSize: 16, fontFamily: 'Poppins_600SemiBold', marginBottom: 15 },
    chart: { borderRadius: 16 },

    tableSection: {
        backgroundColor: '#FFF',
        padding: 20,
        borderRadius: 20,
        elevation: 2,
    },

    tableRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },

    rowName: { fontSize: 14, fontFamily: 'Poppins_600SemiBold' },
    rowCourse: { fontSize: 12, color: '#6B7280' },

    statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    statusText: { fontSize: 10, fontFamily: 'Poppins_700Bold' },

    viewMoreBtn: {
        marginTop: 15,
        alignItems: 'center',
        paddingVertical: 10,
        backgroundColor: '#F3F4FF',
        borderRadius: 12,
    },

    viewMoreText: {
        color: '#4F46E5',
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 14,
    },
});

export default Analytics;