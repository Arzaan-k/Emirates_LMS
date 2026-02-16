import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    ActivityIndicator,
    Platform,
    Dimensions,
    ScrollView,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import API_URL from '../config';

const { width, height } = Dimensions.get('window');

export default function CertificateModal({ visible, onClose, courseId, userEmail }) {
    const [loading, setLoading] = useState(false);
    const [certificate, setCertificate] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (visible && courseId && userEmail) {
            fetchCertificate();
        }
        if (!visible) {
            setCertificate(null);
            setError(null);
        }
    }, [visible, courseId, userEmail]);

    const fetchCertificate = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(
                `${API_URL}/api/v1/self-learning/certificate/${courseId}/${userEmail}`
            );
            const data = await response.json();
            if (data.status === 'success' && data.certificate) {
                setCertificate(data.certificate);
            } else {
                setError(data.detail || 'Failed to generate certificate');
            }
        } catch (err) {
            console.error('Certificate fetch error:', err);
            setError('Unable to generate certificate. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleDownload = async () => {
        if (!certificate) return;

        const certHTML = generateCertificateHTML(certificate);

        try {
            if (Platform.OS === 'web') {
                // For web, open a new window to ensure isolation and trigger print (Save as PDF)
                const printWindow = window.open('', '_blank');
                if (printWindow) {
                    printWindow.document.write(certHTML);
                    printWindow.document.close();
                    printWindow.focus();
                    setTimeout(() => {
                        printWindow.print();
                    }, 500);
                } else {
                    alert('Pop-up blocked. Please allow pop-ups for this site.');
                }
            } else {
                // For native, generate PDF and share/save
                // Use Landscape dimensions (A4 Landscape: ~842pt x 595pt)
                const { uri } = await Print.printToFileAsync({
                    html: certHTML,
                    width: 842,
                    height: 595,
                    base64: false
                });
                await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
            }
        } catch (error) {
            console.error('Download error:', error);
            setError('Failed to download certificate');
        }
    };

    const handlePrint = async () => {
        if (!certificate) return;

        const certHTML = generateCertificateHTML(certificate);

        try {
            if (Platform.OS === 'web') {
                const printWindow = window.open('', '_blank');
                if (printWindow) {
                    printWindow.document.write(certHTML);
                    printWindow.document.close();
                    printWindow.focus();
                    setTimeout(() => printWindow.print(), 500);
                }
            } else {
                // Native Printing (AirPrint / Android Print)
                await Print.printAsync({
                    html: certHTML,
                    orientation: Print.Orientation.landscape
                });
            }
        } catch (error) {
            console.error('Print error:', error);
        }
    };

    const generateCertificateHTML = (cert) => {
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Certificate of Completion - ${cert.course_title}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Inter:wght@300;400;500;600&display=swap');
        
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            background: #f0f0f0;
            font-family: 'Inter', sans-serif;
            -webkit-print-color-adjust: exact;
        }
        
        @page {
            size: landscape;
            margin: 0;
        }

        @media print {
            body { 
                background: white; 
                -webkit-print-color-adjust: exact;
            }
            .certificate { 
                box-shadow: none;
                margin: 0; 
                page-break-after: always;
            }
        }
        
        .certificate {
            width: 900px;
            height: 636px;
            background: #FFFFFF;
            position: relative;
            overflow: hidden;
            box-shadow: 0 20px 60px rgba(0,0,0,0.15);
        }
        
        .border-outer {
            position: absolute;
            inset: 12px;
            border: 3px solid #C9A84C;
            border-radius: 4px;
        }
        
        .border-inner {
            position: absolute;
            inset: 20px;
            border: 1px solid #C9A84C;
            border-radius: 2px;
        }
        
        .content {
            position: relative;
            z-index: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            padding: 60px 80px;
            text-align: center;
        }
        
        .ribbon {
            font-family: 'Inter', sans-serif;
            font-size: 11px;
            font-weight: 600;
            letter-spacing: 4px;
            text-transform: uppercase;
            color: #C9A84C;
            margin-bottom: 8px;
        }
        
        .title {
            font-family: 'Playfair Display', serif;
            font-size: 42px;
            font-weight: 700;
            color: #1a1a2e;
            margin-bottom: 6px;
        }
        
        .subtitle {
            font-size: 13px;
            color: #6B7280;
            margin-bottom: 28px;
            letter-spacing: 1px;
        }
        
        .divider {
            width: 80px;
            height: 2px;
            background: linear-gradient(90deg, transparent, #C9A84C, transparent);
            margin-bottom: 28px;
        }
        
        .presented-to {
            font-size: 12px;
            color: #9CA3AF;
            text-transform: uppercase;
            letter-spacing: 3px;
            margin-bottom: 10px;
        }
        
        .name {
            font-family: 'Playfair Display', serif;
            font-size: 36px;
            font-weight: 700;
            color: #C9A84C;
            margin-bottom: 20px;
        }
        
        .course-label {
            font-size: 12px;
            color: #9CA3AF;
            text-transform: uppercase;
            letter-spacing: 2px;
            margin-bottom: 6px;
        }
        
        .course-name {
            font-size: 18px;
            font-weight: 600;
            color: #374151;
            margin-bottom: 30px;
        }
        
        .footer {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            width: 100%;
            margin-top: auto;
        }
        
        .footer-item {
            text-align: center;
        }
        
        .footer-line {
            width: 140px;
            height: 1px;
            background: #D1D5DB;
            margin-bottom: 6px;
        }
        
        .footer-label {
            font-size: 10px;
            color: #9CA3AF;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        
        .footer-value {
            font-size: 12px;
            color: #374151;
            font-weight: 500;
            margin-top: 2px;
        }
        
        .corner-ornament {
            position: absolute;
            width: 60px;
            height: 60px;
            border-color: #C9A84C;
        }
        
        .corner-tl { top: 30px; left: 30px; border-top: 2px solid; border-left: 2px solid; }
        .corner-tr { top: 30px; right: 30px; border-top: 2px solid; border-right: 2px solid; }
        .corner-bl { bottom: 30px; left: 30px; border-bottom: 2px solid; border-left: 2px solid; }
        .corner-br { bottom: 30px; right: 30px; border-bottom: 2px solid; border-right: 2px solid; }
        
        @media print {
            body { background: white; }
            .certificate { box-shadow: none; }
        }
    </style>
</head>
<body>
    <div class="certificate">
        <div class="border-outer"></div>
        <div class="border-inner"></div>
        <div class="corner-ornament corner-tl"></div>
        <div class="corner-ornament corner-tr"></div>
        <div class="corner-ornament corner-bl"></div>
        <div class="corner-ornament corner-br"></div>
        
        <div class="content">
            <div class="ribbon">Certificate</div>
            <div class="title">Certificate of Completion</div>
            <div class="subtitle">This certificate is proudly presented</div>
            <div class="divider"></div>
            <div class="presented-to">Awarded To</div>
            <div class="name">${cert.user_name}</div>
            <div class="course-label">For successfully completing</div>
            <div class="course-name">${cert.course_title}</div>
            
            <div class="footer">
                <div class="footer-item">
                    <div class="footer-line"></div>
                    <div class="footer-label">Date</div>
                    <div class="footer-value">${cert.completed_date}</div>
                </div>
                <div class="footer-item">
                    <div class="footer-line"></div>
                    <div class="footer-label">Certificate ID</div>
                    <div class="footer-value">${cert.certificate_id}</div>
                </div>
                <div class="footer-item">
                    <div class="footer-line"></div>
                    <div class="footer-label">Score</div>
                    <div class="footer-value">${cert.score || 'N/A'}%</div>
                </div>
            </div>
        </div>
    </div>
</body>
</html>`;
    };

    return (
        <Modal visible={visible} animationType="fade" transparent>
            <View style={styles.overlay}>
                <View style={styles.container}>
                    {/* Header */}
                    <LinearGradient
                        colors={['#C9A84C', '#A67C2E']}
                        style={styles.header}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                    >
                        <View style={styles.headerRow}>
                            <View style={styles.headerLeft}>
                                <MaterialCommunityIcons name="certificate" size={24} color="#FFF" />
                                <Text style={styles.headerTitle}>Certificate</Text>
                            </View>
                            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                                <Feather name="x" size={20} color="#FFF" />
                            </TouchableOpacity>
                        </View>
                    </LinearGradient>

                    {/* Content */}
                    <ScrollView contentContainerStyle={styles.content}>
                        {loading && (
                            <View style={styles.centerState}>
                                <ActivityIndicator size="large" color="#C9A84C" />
                                <Text style={styles.loadingText}>Generating certificate...</Text>
                            </View>
                        )}

                        {error && (
                            <View style={styles.centerState}>
                                <Feather name="alert-circle" size={48} color="#EF4444" />
                                <Text style={styles.errorText}>{error}</Text>
                                <TouchableOpacity onPress={fetchCertificate} style={styles.retryBtn}>
                                    <Feather name="refresh-cw" size={16} color="#FFF" />
                                    <Text style={styles.retryText}>Retry</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        {certificate && !loading && !error && (
                            <View style={styles.certPreview}>
                                {/* Certificate Preview Card */}
                                <View style={styles.certCard}>
                                    <View style={styles.certBorder}>
                                        {/* Corner ornaments */}
                                        <View style={[styles.cornerOrnament, styles.cornerTL]} />
                                        <View style={[styles.cornerOrnament, styles.cornerTR]} />
                                        <View style={[styles.cornerOrnament, styles.cornerBL]} />
                                        <View style={[styles.cornerOrnament, styles.cornerBR]} />

                                        <Text style={styles.certRibbon}>CERTIFICATE</Text>
                                        <Text style={styles.certTitle}>Certificate of Completion</Text>
                                        <View style={styles.certDivider} />
                                        <Text style={styles.certAwardedTo}>AWARDED TO</Text>
                                        <Text style={styles.certName}>{certificate.user_name}</Text>
                                        <Text style={styles.certCourseLabel}>For successfully completing</Text>
                                        <Text style={styles.certCourseName}>{certificate.course_title}</Text>

                                        <View style={styles.certFooter}>
                                            <View style={styles.certFooterItem}>
                                                <View style={styles.certFooterLine} />
                                                <Text style={styles.certFooterLabel}>Date</Text>
                                                <Text style={styles.certFooterValue}>{certificate.completed_date}</Text>
                                            </View>
                                            <View style={styles.certFooterItem}>
                                                <View style={styles.certFooterLine} />
                                                <Text style={styles.certFooterLabel}>ID</Text>
                                                <Text style={styles.certFooterValue}>{certificate.certificate_id}</Text>
                                            </View>
                                        </View>
                                    </View>
                                </View>

                                {/* Action Buttons */}
                                <View style={styles.actionsRow}>
                                    <TouchableOpacity onPress={handleDownload} style={styles.actionBtn}>
                                        <Feather name="download" size={20} color="#FFF" />
                                        <Text style={styles.actionText}>Download PDF</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={handlePrint} style={[styles.actionBtn, styles.printBtn]}>
                                        <Feather name="printer" size={20} color="#C9A84C" />
                                        <Text style={[styles.actionText, { color: '#C9A84C' }]}>Print</Text>
                                    </TouchableOpacity>
                                </View>

                                {/* Certificate Details */}
                                <View style={styles.detailsCard}>
                                    <Text style={styles.detailsTitle}>Certificate Details</Text>
                                    <View style={styles.detailRow}>
                                        <Text style={styles.detailLabel}>Certificate ID</Text>
                                        <Text style={styles.detailValue}>{certificate.certificate_id}</Text>
                                    </View>
                                    <View style={styles.detailRow}>
                                        <Text style={styles.detailLabel}>Recipient</Text>
                                        <Text style={styles.detailValue}>{certificate.user_name}</Text>
                                    </View>
                                    <View style={styles.detailRow}>
                                        <Text style={styles.detailLabel}>Course</Text>
                                        <Text style={styles.detailValue}>{certificate.course_title}</Text>
                                    </View>
                                    <View style={styles.detailRow}>
                                        <Text style={styles.detailLabel}>Completed</Text>
                                        <Text style={styles.detailValue}>{certificate.completed_date}</Text>
                                    </View>
                                    {certificate.score && (
                                        <View style={styles.detailRow}>
                                            <Text style={styles.detailLabel}>Score</Text>
                                            <Text style={styles.detailValue}>{certificate.score}%</Text>
                                        </View>
                                    )}
                                    {certificate.xp_earned > 0 && (
                                        <View style={styles.detailRow}>
                                            <Text style={styles.detailLabel}>XP Earned</Text>
                                            <Text style={[styles.detailValue, { color: '#F59E0B' }]}>{certificate.xp_earned} XP</Text>
                                        </View>
                                    )}
                                </View>
                            </View>
                        )}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    container: {
        width: Math.min(width * 0.92, 520),
        maxHeight: height * 0.85,
        backgroundColor: '#F9FAFB',
        borderRadius: 20,
        overflow: 'hidden',
    },
    header: {
        padding: 20,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    headerTitle: {
        fontSize: 18,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
    },
    closeBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    content: {
        padding: 20,
    },
    centerState: {
        alignItems: 'center',
        paddingVertical: 60,
    },
    loadingText: {
        marginTop: 16,
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        color: '#6B7280',
    },
    errorText: {
        marginTop: 16,
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        color: '#EF4444',
        textAlign: 'center',
    },
    retryBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 16,
        backgroundColor: '#EF4444',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 10,
    },
    retryText: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
    },
    certPreview: {
        alignItems: 'center',
    },
    certCard: {
        width: '100%',
        aspectRatio: 1.414,
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        padding: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 5,
        marginBottom: 20,
    },
    certBorder: {
        flex: 1,
        borderWidth: 2,
        borderColor: '#C9A84C',
        borderRadius: 8,
        padding: 20,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    cornerOrnament: {
        position: 'absolute',
        width: 20,
        height: 20,
        borderColor: '#C9A84C',
    },
    cornerTL: { top: 8, left: 8, borderTopWidth: 2, borderLeftWidth: 2 },
    cornerTR: { top: 8, right: 8, borderTopWidth: 2, borderRightWidth: 2 },
    cornerBL: { bottom: 8, left: 8, borderBottomWidth: 2, borderLeftWidth: 2 },
    cornerBR: { bottom: 8, right: 8, borderBottomWidth: 2, borderRightWidth: 2 },
    certRibbon: {
        fontSize: 9,
        fontFamily: 'Poppins_600SemiBold',
        letterSpacing: 4,
        color: '#C9A84C',
        marginBottom: 4,
    },
    certTitle: {
        fontSize: 18,
        fontFamily: 'Poppins_700Bold',
        color: '#1a1a2e',
        marginBottom: 4,
        textAlign: 'center',
    },
    certDivider: {
        width: 50,
        height: 2,
        backgroundColor: '#C9A84C',
        marginVertical: 10,
        borderRadius: 1,
    },
    certAwardedTo: {
        fontSize: 8,
        fontFamily: 'Poppins_500Medium',
        letterSpacing: 3,
        color: '#9CA3AF',
        marginBottom: 4,
    },
    certName: {
        fontSize: 22,
        fontFamily: 'Poppins_700Bold',
        color: '#C9A84C',
        marginBottom: 10,
        textAlign: 'center',
    },
    certCourseLabel: {
        fontSize: 9,
        fontFamily: 'Poppins_400Regular',
        color: '#9CA3AF',
        letterSpacing: 1,
        marginBottom: 4,
    },
    certCourseName: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
        color: '#374151',
        marginBottom: 16,
        textAlign: 'center',
    },
    certFooter: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        width: '100%',
        marginTop: 'auto',
    },
    certFooterItem: {
        alignItems: 'center',
    },
    certFooterLine: {
        width: 80,
        height: 1,
        backgroundColor: '#D1D5DB',
        marginBottom: 4,
    },
    certFooterLabel: {
        fontSize: 8,
        fontFamily: 'Poppins_500Medium',
        color: '#9CA3AF',
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    certFooterValue: {
        fontSize: 10,
        fontFamily: 'Poppins_600SemiBold',
        color: '#374151',
        marginTop: 2,
    },
    actionsRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 20,
        width: '100%',
    },
    actionBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: '#C9A84C',
        paddingVertical: 14,
        borderRadius: 12,
    },
    printBtn: {
        backgroundColor: '#FFF',
        borderWidth: 2,
        borderColor: '#C9A84C',
    },
    actionText: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
    },
    detailsCard: {
        width: '100%',
        backgroundColor: '#FFF',
        borderRadius: 12,
        padding: 16,
        marginBottom: 10,
    },
    detailsTitle: {
        fontSize: 14,
        fontFamily: 'Poppins_700Bold',
        color: '#374151',
        marginBottom: 12,
    },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    detailLabel: {
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
        color: '#9CA3AF',
    },
    detailValue: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
        color: '#374151',
    },
});
