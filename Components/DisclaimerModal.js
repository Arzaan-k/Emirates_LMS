import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

const DisclaimerModal = () => {
    const [visible, setVisible] = useState(true);

    if (!visible) return null;

    return (
        <Modal
            animationType="fade"
            transparent={true}
            visible={visible}
            onRequestClose={() => setVisible(false)}
        >
            <View style={styles.centeredView}>
                <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                <View style={styles.modalView}>
                    <View style={styles.iconContainer}>
                        <Feather name="alert-triangle" size={32} color="#D71A21" />
                    </View>

                    <Text style={styles.modalTitle}>Development Notice</Text>

                    <Text style={styles.modalText}>
                        This is a production version under active development.
                        {"\n\n"}
                        3D functionality is currently under maintenance, and only English audio input is supported at this time.
                        {"\n\n"}
                        Developers frequently make changes, so some functionalities might be slower or temporarily unavailable.
                        {"\n\n"}
                        Thank you for your patience!
                    </Text>

                    <TouchableOpacity
                        style={styles.button}
                        onPress={() => setVisible(false)}
                    >
                        <Text style={styles.textStyle}>I Understand</Text>
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
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    modalView: {
        margin: 20,
        backgroundColor: 'white',
        borderRadius: 20,
        padding: 35,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 5,
        width: width * 0.85,
        maxWidth: 400,
    },
    iconContainer: {
        backgroundColor: '#FEF3C7',
        padding: 15,
        borderRadius: 50,
        marginBottom: 15,
    },
    modalTitle: {
        marginBottom: 15,
        textAlign: 'center',
        fontSize: 20,
        fontWeight: 'bold',
        color: '#1F2937',
    },
    modalText: {
        marginBottom: 25,
        textAlign: 'center',
        color: '#4B5563',
        lineHeight: 22,
        fontSize: 15,
    },
    button: {
        borderRadius: 12,
        padding: 15,
        elevation: 2,
        backgroundColor: '#000',
        width: '100%',
    },
    textStyle: {
        color: 'white',
        fontWeight: 'bold',
        textAlign: 'center',
        fontSize: 16,
    },
});

export default DisclaimerModal;
