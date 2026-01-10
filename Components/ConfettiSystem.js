import React, { useEffect, useMemo } from 'react';
import { StyleSheet, Dimensions, View } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withDelay,
    withTiming,
    withRepeat,
    withSequence,
    withSpring,
    Easing,
    interpolate,
    runOnJS,
} from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');

// ULTRA CELEBRATION PALETTE
const COLORS = [
    '#FFD700', // Gold
    '#FF3366', // Vibrant Pink
    '#00FF99', // Bright Mint
    '#00CCFF', // Cyan
    '#FF6600', // Neon Orange
    '#9933FF', // Electric Purple
    '#FFFF00', // Bright Yellow
    '#FF0000', // Red
    '#33CC33', // Green
];

// Particle shapes
const SHAPES = ['square', 'circle', 'ribbon', 'star'];

// Individual Confetti Particle with EXPLOSIVE Physics
const ConfettiParticle = ({
    delay,
    startX,
    startY,
    shape,
    color,
    size,
    initialVx, // Radial velocity X
    initialVy, // Radial velocity Y
    fallSpeed,
    rotationSpeed
}) => {
    const translateX = useSharedValue(startX);
    const translateY = useSharedValue(startY);
    const rotation = useSharedValue(0);
    const rotationX = useSharedValue(0); // 3D Flip
    const opacity = useSharedValue(0);
    const scale = useSharedValue(0);

    useEffect(() => {
        // 1. POP IN
        opacity.value = withDelay(delay, withTiming(1, { duration: 50 }));
        scale.value = withDelay(delay, withSpring(1));

        // 2. EXPLOSIVE MOVEMENT (Projectile Motion)
        // Move OUTWARD first (Blast)
        translateX.value = withDelay(
            delay,
            withSequence(
                // EXPLODE OUT
                withTiming(startX + initialVx * 100, { duration: 600, easing: Easing.out(Easing.quad) }),
                // Then drift
                withTiming(startX + initialVx * 150 + (Math.random() - 0.5) * 50, { duration: 2000 })
            )
        );

        // UP THEN DOWN (Gravity)
        translateY.value = withDelay(
            delay,
            withSequence(
                // BLAST UP
                withTiming(startY + initialVy * 100, { duration: 400, easing: Easing.out(Easing.quad) }),
                // GRAVITY TAKES OVER
                withTiming(height + 150, { duration: fallSpeed, easing: Easing.in(Easing.quad) })
            )
        );

        // 3. 3D TUMBLING
        rotation.value = withDelay(delay, withRepeat(withTiming(360 * (Math.random() > 0.5 ? 1 : -1), { duration: rotationSpeed }), -1));
        rotationX.value = withDelay(delay, withRepeat(withTiming(360, { duration: rotationSpeed * 0.8 }), -1));

        // 4. FADE OUT
        opacity.value = withDelay(delay + fallSpeed * 0.8, withTiming(0, { duration: 300 }));
    }, []);

    const animatedStyle = useAnimatedStyle(() => {
        return {
            transform: [
                { translateX: translateX.value },
                { translateY: translateY.value },
                { rotate: `${rotation.value}deg` },
                { rotateX: `${rotationX.value}deg` }, // Real 3D flip
                { scale: scale.value }
            ],
            opacity: opacity.value,
        };
    });

    const renderShape = () => {
        const style = { backgroundColor: color };
        switch (shape) {
            case 'circle': return <View style={[styles.shapeCommon, style, { width: size, height: size, borderRadius: size / 2 }]} />;
            case 'ribbon': return <View style={[styles.shapeCommon, style, { width: size * 0.4, height: size * 1.8 }]} />;
            case 'star':
                return (
                    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
                        <View style={[styles.shapeCommon, style, { width: size * 0.3, height: size, position: 'absolute', borderRadius: 2 }]} />
                        <View style={[styles.shapeCommon, style, { width: size, height: size * 0.3, position: 'absolute', borderRadius: 2 }]} />
                    </View>
                );
            default: return <View style={[styles.shapeCommon, style, { width: size, height: size, borderRadius: 2 }]} />;
        }
    };

    return (
        <Animated.View style={[styles.particleContainer, animatedStyle]}>
            {renderShape()}
        </Animated.View>
    );
};

// Sparkle effect (Changed to Gold/Yellow to avoid looking like white glitches)
const Sparkle = ({ delay, x, y }) => {
    const scale = useSharedValue(0);
    const opacity = useSharedValue(0);

    useEffect(() => {
        opacity.value = withDelay(delay, withSequence(
            withTiming(1, { duration: 150 }),
            withTiming(0, { duration: 500 })
        ));
        scale.value = withDelay(delay, withSequence(
            withSpring(1.2),
            withTiming(0, { duration: 400 })
        ));
    }, []);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
        opacity: opacity.value,
    }));

    return (
        <Animated.View style={[styles.sparkle, { left: x, top: y }, animatedStyle]}>
            {/* Gold core with outer glow */}
            <View style={styles.sparkleCore} />
            <View style={styles.sparkleGlow} />
        </Animated.View>
    );
};

export default function ConfettiSystem({ trigger }) {
    // Generate particles
    const particles = useMemo(() => {
        if (!trigger) return [];
        const result = [];
        const count = 150; // MASSIVE COUNT FOR CELEBRATION

        for (let i = 0; i < count; i++) {
            // physics for explosion
            const angle = Math.random() * Math.PI * 2;
            const velocity = 0.5 + Math.random();

            result.push({
                id: i,
                delay: Math.random() * 400, // Fast burst
                startX: width / 2, // Start from center
                startY: height / 3, // Start from upper middle area
                initialVx: Math.cos(angle) * velocity * (Math.random() * 2), // Spread X
                initialVy: Math.sin(angle) * velocity - 1, // Bias UPWARDS (-1) to pop up then fall

                shape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
                color: COLORS[Math.floor(Math.random() * COLORS.length)],
                size: 8 + Math.random() * 10,
                fallSpeed: 2500 + Math.random() * 1000,
                rotationSpeed: 400 + Math.random() * 600,
            });
        }
        return result;
    }, [trigger]);

    // Generate denser sparkles
    const sparkles = useMemo(() => {
        if (!trigger) return [];
        // More sparkles!
        return Array.from({ length: 30 }).map((_, i) => ({
            id: i,
            delay: Math.random() * 1000,
            x: Math.random() * width,
            y: Math.random() * (height * 0.8)
        }));
    }, [trigger]);

    if (!trigger) return null;

    return (
        <View style={[StyleSheet.absoluteFill, { zIndex: 9999, elevation: 100 }]} pointerEvents="none">
            {/* Sparkles layer */}
            {sparkles.map((sparkle) => (
                <Sparkle
                    key={`sparkle-${sparkle.id}`}
                    delay={sparkle.delay}
                    x={sparkle.x}
                    y={sparkle.y}
                />
            ))}

            {/* Confetti particles */}
            {particles.map((particle) => (
                <ConfettiParticle
                    key={`particle-${particle.id}`}
                    delay={particle.delay}
                    startX={particle.startX}
                    startY={particle.startY}
                    initialVx={particle.initialVx}
                    initialVy={particle.initialVy}
                    shape={particle.shape}
                    color={particle.color}
                    size={particle.size}
                    fallSpeed={particle.fallSpeed}
                    rotationSpeed={particle.rotationSpeed}
                />
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    particleContainer: {
        position: 'absolute',
        zIndex: 10,
    },
    shapeCommon: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 2,
        elevation: 2,
    },
    sparkle: {
        position: 'absolute',
        width: 20,
        height: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    sparkleCore: {
        width: 6,
        height: 6,
        backgroundColor: '#FFF', // White core
        borderRadius: 3,
        zIndex: 2,
    },
    sparkleGlow: {
        position: 'absolute',
        width: 14,
        height: 14,
        backgroundColor: '#FFD700', // Gold glow
        borderRadius: 7,
        opacity: 0.6,
        zIndex: 1,
    }
});
