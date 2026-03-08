import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Dimensions, Image, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather, FontAwesome5, MaterialCommunityIcons } from '@expo/vector-icons';
import { Svg, Circle, Path, Defs, LinearGradient as SvgLinearGradient, Stop, Pattern, Rect } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');

// Waffle Pattern SVG Component
const WafflePattern = () => (
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
            <Pattern id="waffle" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
                <Rect x="2" y="2" width="36" height="36" fill="none" stroke="#FCD34D" strokeWidth="1" strokeOpacity="0.2" rx="4" />
            </Pattern>
            <SvgLinearGradient id="chocoGradient" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#5D4037" stopOpacity="0.9" />
                <Stop offset="1" stopColor="#3E2723" stopOpacity="0.95" />
            </SvgLinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#waffle)" />
    </Svg>
);

const LanguageDisclaimerModal = ({ onDismiss }) => {
    const [visible, setVisible] = useState(true);

    const handleDismiss = () => {
        setVisible(false);
        if (onDismiss) onDismiss();
    };

    if (!visible) return null;

    return (
        <Modal
            animationType="fade"
            transparent={true}
            visible={visible}
            onRequestClose={handleDismiss}
            statusBarTranslucent={true} // Ensure it covers status bar
        >
            <View style={styles.centeredView}>
                <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />

                {/* Floating Airplane/Chocolate Elements */}
                {/* <View style={[styles.decoCircle, { top: 100, left: -20, backgroundColor: '#FCD34D', opacity: 0.1 }]} /> */}
                {/* <View style={[styles.decoCircle, { bottom: 100, right: -20, backgroundColor: '#5D4037', opacity: 0.1 }]} /> */}

                <View style={styles.modalView}>
                    <View style={styles.waffleBg}>
                        <WafflePattern />
                    </View>

                    <View style={styles.iconContainer}>
                        <View style={styles.iconCircle}>
                            <MaterialCommunityIcons name="translate" size={36} color="#FFF" />
                        </View>
                        <View style={styles.smallIconBadge}>
                            <Text style={{ fontSize: 14 }}>🇮🇳</Text>
                        </View>
                    </View>

                    <Text style={styles.modalTitle}>Linguistic Expansion</Text>

                    <Text style={styles.modalText}>
                        Our AI engine is evolving! We are actively integrating support for <Text style={styles.highlight}>11 Indian Languages</Text>.
                        {"\n\n"}
                        <Text style={styles.subText}>
                            Currently, for this development preview, audio analysis is optimized for <Text style={styles.highlight}>English</Text> only.
                        </Text>
                    </Text>

                    {/* Drip Decoration */}
                    {/* <Svg height="20" width="100%" style={{ marginBottom: 20 }}>
              <Path d={`M0,0 Q${width*0.2},20 ${width*0.4},0 T${width*0.8},0 T${width},0 V20 H0 Z`} fill="#5D4037" opacity="0.1"/>
          </Svg> */}

                    <TouchableOpacity
                        style={styles.button}
                        onPress={handleDismiss}
                        activeOpacity={0.8}
                    >
                        <LinearGradient
                            colors={['#5D4037', '#3E2723']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={StyleSheet.absoluteFill}
                        />
                        <Text style={styles.textStyle}>Continue Simulation</Text>
                        <Feather name="arrow-right" size={18} color="#FFF" style={{ marginLeft: 8 }} />
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    centeredView: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.6)', // Fallback if blur fails
    },
    modalView: {
        margin: 20,
        backgroundColor: '#FFF8F0', // Creamy background (Milk/Waffle batter)
        borderRadius: 24,
        padding: 30,
        alignItems: 'center',
        shadowColor: '#3E2723',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 10,
        width: width * 0.85,
        maxWidth: 400,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#FCD34D', // Gold/Waffle hint
    },
    waffleBg: {
        ...StyleSheet.absoluteFillObject,
        opacity: 0.5,
    },
    iconContainer: {
        marginBottom: 20,
        position: 'relative',
    },
    iconCircle: {
        width: 70,
        height: 70,
        borderRadius: 35,
        backgroundColor: '#3E2723', // Dark Chocolate
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#FCD34D',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    smallIconBadge: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        backgroundColor: '#FFF',
        borderRadius: 12,
        width: 24,
        height: 24,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 2,
    },
    modalTitle: {
        marginBottom: 10,
        textAlign: 'center',
        fontSize: 22,
        fontWeight: '800',
        color: '#3E2723', // Chocolate Text
        fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto', // Or custom font if available
    },
    modalText: {
        marginBottom: 25,
        textAlign: 'center',
        color: '#5D4037',
        lineHeight: 24,
        fontSize: 16,
    },
    subText: {
        fontSize: 15,
        opacity: 0.9,
    },
    highlight: {
        fontWeight: 'bold',
        color: '#D84315', // Burnt Orange/Caramel
    },
    button: {
        borderRadius: 16,
        paddingVertical: 16,
        paddingHorizontal: 32,
        elevation: 4,
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        backgroundColor: '#3E2723', // Fallback
    },
    textStyle: {
        color: 'white',
        fontWeight: 'bold',
        textAlign: 'center',
        fontSize: 16,
        letterSpacing: 0.5,
    },
    decoCircle: {
        position: 'absolute',
        width: 100,
        height: 100,
        borderRadius: 50,
    }
});

export default LanguageDisclaimerModal;
