import React, { useEffect } from 'react';
import { StyleSheet, Dimensions, View } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withDelay,
    withTiming,
    withRepeat,
    withSequence,
    Easing,
    cancelAnimation
} from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');
const COLORS = ['#F59E0B', '#EF4444', '#10B981', '#3B82F6', '#8B5CF6', '#F472B6'];

const Particle = ({ delay }) => {
    const x = Math.random() * width;
    const y = useSharedValue(-50);
    const rotation = useSharedValue(0);
    const opacity = useSharedValue(1);

    useEffect(() => {
        y.value = withDelay(delay, withTiming(height + 100, { duration: 2500, easing: Easing.linear }));
        rotation.value = withDelay(delay, withRepeat(withTiming(360, { duration: 1000 }), -1));
        opacity.value = withDelay(delay + 1500, withTiming(0, { duration: 1000 }));
    }, []);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: x },
            { translateY: y.value },
            { rotate: `${rotation.value}deg` }
        ],
        opacity: opacity.value,
    }));

    const size = Math.random() * 8 + 6;
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];

    return (
        <Animated.View
            style={[
                styles.particle,
                { width: size, height: size, backgroundColor: color },
                animatedStyle
            ]}
        />
    );
};

export default function ConfettiSystem({ trigger }) {
    if (!trigger) return null;

    const particles = Array.from({ length: 40 }).map((_, i) => (
        <Particle key={i} delay={Math.random() * 500} />
    ));

    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {particles}
        </View>
    );
}

const styles = StyleSheet.create({
    particle: {
        position: 'absolute',
        borderRadius: 4,
    }
});
