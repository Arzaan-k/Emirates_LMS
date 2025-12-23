// Screens/QuizScreen.js
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function QuizScreen({ route }) {
    const { quizData } = route.params || {};

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Quiz: {quizData?.title || "No Quiz"}</Text>
            {/* You can later add questions here */}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111827' },
    title: { color: '#FFF', fontSize: 20, fontWeight: 'bold' },
});
