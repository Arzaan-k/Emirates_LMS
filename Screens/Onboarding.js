// Emirates LMS - Onboarding / Splash Screen
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Animated, Image, Platform } from 'react-native';

export default function Onboarding({ navigation }) {
  const loadingWidth = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(loadingWidth, {
      toValue: 1,
      duration: 2000,
      useNativeDriver: false, // native driver false for width
    }).start();

    // navigate to Login after 2 seconds
    const timeout = setTimeout(() => {
      if (Platform.OS === 'web') {
        navigation.replace('Login');
      } else {
        navigation.replace('Intro');
      }
    }, 2000);

    return () => clearTimeout(timeout);
  }, [navigation, loadingWidth]);

  const loadingBarWidth = loadingWidth.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.container}>
      {/* Center content */}
      <View style={styles.centerContent}>
        <Image
          source={require('../assets/Emirates_Logo.png')}
          style={{ width: 200, height: 200, resizeMode: 'contain' }}
        />
        <Text style={styles.brandName}>Emirates LMS</Text>
        <Text style={styles.tagline}>
          Fly Better.{'\n'}Learn Smarter.
        </Text>

        {/* Loading bar */}
        <View style={styles.loadingContainer}>
          <View style={styles.loadingTrack}>
            <Animated.View style={[styles.loadingFill, { width: loadingBarWidth }]} />
          </View>
        </View>
      </View>
    </View>
  );
}

const WHITE = '#FFFFFF';
const DARK = '#1A1F36';
const RED = '#D71A21';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: WHITE,
    paddingHorizontal: 24,
    paddingBottom: 40,
    justifyContent: 'space-between',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandName: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 2,
    color: RED,
    marginTop: 8,
  },
  tagline: {
    marginTop: 16,
    fontSize: 14,
    textAlign: 'center',
    color: DARK,
    opacity: 0.8,
  },
  loadingContainer: {
    width: '60%',
    marginTop: 40,
  },
  loadingTrack: {
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.1)',
    overflow: 'hidden',
  },
  loadingFill: {
    height: 4,
    borderRadius: 999,
    backgroundColor: RED,
  },
});
