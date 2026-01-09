import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { MaterialCommunityIcons, Feather, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { SlideInDown } from 'react-native-reanimated';

const SECTIONS = [
    { id: 'waffle_station', label: 'Waffle Station', icon: 'grid' },
    { id: 'coffee_bar', label: 'Coffee Bar', icon: 'coffee' },
    { id: 'fridge_interior', label: 'Fridge Interior', icon: 'snowflake' },
    { id: 'sink_area', label: 'Sink Area', icon: 'water' },
    { id: 'floor_dining', label: 'Dining Floor', icon: 'floor-plan' },
    { id: 'other', label: 'Other', icon: 'image-plus' },
];

import API_URL from '../config';
// const API_URL = "http://192.168.0.136:8000:8000";

export default function AIScanner({ onClose }) {
    const [step, setStep] = useState(1); // 1: Select, 2: Camera, 3: Analysis
    const [selectedSection, setSelectedSection] = useState(null);
    const [capturedImage, setCapturedImage] = useState(null);
    const [analysisResult, setAnalysisResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState("Analyzing Hygiene...");

    // Camera
    const [permission, requestPermission] = useCameraPermissions();
    const cameraRef = useRef(null);
    const [facing, setFacing] = useState('back');

    useEffect(() => {
        // Reset state on mount
        setStep(1);
        setSelectedSection(null);
        setCapturedImage(null);
        setAnalysisResult(null);
        setLoading(false);
    }, []);

    const handleSectionSelect = (section) => {
        setSelectedSection(section);
        if (!permission || !permission.granted) {
            requestPermission();
        }
        setStep(2);
    };

    const takePicture = async () => {
        if (cameraRef.current) {
            try {
                const photo = await cameraRef.current.takePictureAsync({
                    quality: 0.7,
                    base64: true,
                });
                setCapturedImage(photo);
                analyzeImage(photo, selectedSection);
            } catch (error) {
                Alert.alert("Camera Error", "Could not take picture.");
            }
        }
    };

    const analyzeImage = async (photo, section) => {
        setStep(3);
        setLoading(true);
        setStatusMessage("Uploading Image...");
        console.log("SCO: Starting Analysis for", section.label);

        try {
            const formData = new FormData();
            formData.append('section', section.label);
            formData.append('file', {
                uri: photo.uri,
                name: 'hygiene.jpg',
                type: 'image/jpeg'
            });

            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                controller.abort();
                console.log("SCO: Request Timed Out (15s)");
            }, 15000);

            console.log("SCO: Sending Fetch Request...");
            setStatusMessage("Waiting for AI...");

            const response = await fetch(`${API_URL}/hygiene/analyze`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
                body: formData,
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            console.log("SCO: Response Status:", response.status);
            setStatusMessage("Processing Result...");

            const result = await response.json();
            console.log("SCO: Result Payload:", result);

            if (result.status === 'success') {
                setAnalysisResult(result);
            } else {
                Alert.alert("Analysis Failed", result.message || "Unknown Error");
                setStep(2);
            }

        } catch (error) {
            console.error("SCO: Error -", error);
            if (error.name === 'AbortError') {
                Alert.alert("Timeout", "Server took too long to respond.");
            } else {
                Alert.alert("Network Error", "Could not connect to server.");
            }
            setStep(2);
        } finally {
            setLoading(false);
        }
    };

    const getScoreColor = (score) => {
        if (score >= 90) return ['#10B981', '#34D399']; // Green
        if (score >= 70) return ['#F59E0B', '#FCD34D']; // Yellow
        return ['#EF4444', '#F87171']; // Red
    };

    return (
        <View style={styles.container}>
            <View style={styles.content}>
                {/* HEADER */}
                <View style={styles.header}>
                    <Text style={styles.title}>
                        {step === 1 ? "Select Section" : step === 2 ? "Capture Photo" : "Hygiene Report"}
                    </Text>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                        <Feather name="x" size={24} color="#374151" />
                    </TouchableOpacity>
                </View>

                {/* STEPS */}
                {step === 1 && (
                    <ScrollView contentContainerStyle={styles.grid}>
                        {SECTIONS.map((item, index) => (
                            <Animated.View
                                key={item.id}
                                entering={SlideInDown.delay(index * 50)}
                                style={styles.gridItemWrapper}
                            >
                                <TouchableOpacity
                                    style={styles.gridItem}
                                    onPress={() => handleSectionSelect(item)}
                                >
                                    <View style={[styles.iconBg, { backgroundColor: '#EEF2FF' }]}>
                                        <MaterialCommunityIcons name={item.icon} size={32} color="#4F46E5" />
                                    </View>
                                    <Text style={styles.gridLabel}>{item.label}</Text>
                                </TouchableOpacity>
                            </Animated.View>
                        ))}
                    </ScrollView>
                )}

                {step === 2 && (
                    <View style={styles.cameraContainer}>
                        {permission && permission.granted ? (
                            <CameraView
                                style={styles.camera}
                                facing={facing}
                                ref={cameraRef}
                            >
                                <View style={styles.cameraControls}>
                                    <TouchableOpacity
                                        style={styles.captureBtn}
                                        onPress={takePicture}
                                    >
                                        <View style={styles.captureInner} />
                                    </TouchableOpacity>
                                </View>
                            </CameraView>
                        ) : (
                            <View style={styles.permissionView}>
                                <Text>Camera permission needed</Text>
                                <TouchableOpacity onPress={requestPermission} style={styles.permBtn}>
                                    <Text style={{ color: '#FFF' }}>Grant Permission</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                        <TouchableOpacity style={styles.backBtn} onPress={() => setStep(1)}>
                            <Text style={styles.backText}>Change Section</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {step === 3 && (
                    <View style={styles.resultContainer}>
                        {loading ? (
                            <View style={styles.loadingView}>
                                <ActivityIndicator size="large" color="#4F46E5" />
                                <Text style={styles.loadingText}>{statusMessage}</Text>
                                <Text style={styles.loadingSub}>Checking surfaces, organization, and cleanliness.</Text>
                            </View>
                        ) : (
                            <ScrollView showsVerticalScrollIndicator={false}>
                                {/* SCORE CARD */}
                                <View style={styles.scoreCard}>
                                    <LinearGradient
                                        colors={getScoreColor(analysisResult?.score || 0)}
                                        style={styles.scoreCircle}
                                    >
                                        <Text style={styles.scoreValue}>{analysisResult?.score}</Text>
                                        <Text style={styles.scoreLabel}>/100</Text>
                                    </LinearGradient>
                                    <Text style={styles.sectionName}>{selectedSection?.label}</Text>
                                    <Text style={styles.verdict}>
                                        {analysisResult?.score >= 90 ? "Excellent" : analysisResult?.score >= 70 ? "Good" : "Needs Attention"}
                                    </Text>
                                </View>

                                {/* TIPS */}
                                <Text style={styles.tipsHeader}>AI Improvement Tips</Text>
                                {analysisResult?.tips?.map((tip, idx) => (
                                    <View key={idx} style={styles.tipItem}>
                                        <Feather
                                            name={analysisResult.score >= 90 ? "check-circle" : "alert-circle"}
                                            size={18}
                                            color={analysisResult.score >= 90 ? "#10B981" : "#F59E0B"}
                                            style={{ marginRight: 10, marginTop: 2 }}
                                        />
                                        <Text style={styles.tipText}>{tip}</Text>
                                    </View>
                                ))}

                                <TouchableOpacity style={styles.retryBtn} onPress={() => setStep(1)}>
                                    <Text style={styles.retryText}>New Inspection</Text>
                                </TouchableOpacity>
                            </ScrollView>
                        )}
                    </View>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    content: {
        backgroundColor: '#F9FAFB',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        height: '90%',
        padding: 20,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
        paddingHorizontal: 10
    },
    title: {
        fontSize: 20,
        fontFamily: 'Poppins_700Bold',
        color: '#111827',
    },
    closeBtn: {
        padding: 8,
        backgroundColor: '#E5E7EB',
        borderRadius: 20,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        paddingHorizontal: 10
    },
    gridItemWrapper: {
        width: '48%',
        marginBottom: 15,
    },
    gridItem: {
        backgroundColor: '#FFF',
        padding: 20,
        borderRadius: 16,
        alignItems: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 2,
    },
    iconBg: {
        width: 60,
        height: 60,
        borderRadius: 30,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
    },
    gridLabel: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#374151',
        textAlign: 'center'
    },
    cameraContainer: {
        flex: 1,
        borderRadius: 20,
        overflow: 'hidden',
        backgroundColor: '#000',
    },
    camera: {
        flex: 1,
        justifyContent: 'flex-end',
        alignItems: 'center',
    },
    cameraControls: {
        paddingBottom: 40,
        width: '100%',
        alignItems: 'center',
    },
    captureBtn: {
        width: 70,
        height: 70,
        borderRadius: 35,
        backgroundColor: 'rgba(255,255,255,0.3)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    captureInner: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: '#FFF',
    },
    backBtn: {
        position: 'absolute',
        top: 20,
        left: 20,
        backgroundColor: 'rgba(0,0,0,0.5)',
        padding: 10,
        borderRadius: 8
    },
    backText: {
        color: '#FFF',
        fontFamily: 'Poppins_500Medium'
    },
    permissionView: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center'
    },
    permBtn: {
        marginTop: 20,
        backgroundColor: '#4F46E5',
        padding: 12,
        borderRadius: 8
    },
    resultContainer: {
        flex: 1,
        paddingHorizontal: 10
    },
    loadingView: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center'
    },
    loadingText: {
        marginTop: 20,
        fontSize: 18,
        fontFamily: 'Poppins_600SemiBold',
        color: '#111827'
    },
    loadingSub: {
        marginTop: 8,
        color: '#6B7280',
        fontFamily: 'Poppins_400Regular'
    },
    scoreCard: {
        alignItems: 'center',
        backgroundColor: '#FFF',
        padding: 24,
        borderRadius: 20,
        marginBottom: 20,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 5,
    },
    scoreCircle: {
        width: 100,
        height: 100,
        borderRadius: 50,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16
    },
    scoreValue: {
        fontSize: 36,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF'
    },
    scoreLabel: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.8)',
        marginTop: -5
    },
    sectionName: {
        fontSize: 20,
        fontFamily: 'Poppins_700Bold',
        color: '#111827',
        marginBottom: 4
    },
    verdict: {
        fontSize: 16,
        fontFamily: 'Poppins_500Medium',
        color: '#6B7280'
    },
    tipsHeader: {
        fontSize: 18,
        fontFamily: 'Poppins_600SemiBold',
        color: '#111827',
        marginBottom: 12,
        marginTop: 10
    },
    tipItem: {
        flexDirection: 'row',
        backgroundColor: '#FFF',
        padding: 16,
        borderRadius: 12,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: '#E5E7EB'
    },
    tipText: {
        flex: 1,
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        color: '#374151',
        lineHeight: 20
    },
    retryBtn: {
        backgroundColor: '#1F2937',
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
        marginTop: 20,
        marginBottom: 40
    },
    retryText: {
        color: '#FFF',
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 16
    }
});
