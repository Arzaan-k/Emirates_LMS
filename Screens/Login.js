// LoginScreen.js
import { useNavigation } from '@react-navigation/native';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TextInput,
  Pressable,
  Alert,
  Dimensions,
  Platform,
  KeyboardAvoidingView
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, {
  FadeInUp,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing
} from 'react-native-reanimated';
import { useLanguage } from "../context/language.context";
import { MaterialCommunityIcons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

// --- Waffle Background Element ---
const FloatingWaffle = ({ delay, duration, size, top, left, rotate }) => {
  const translateY = useSharedValue(0);

  useEffect(() => {
    translateY.value = withRepeat(
      withTiming(20, { duration: duration, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { rotate: rotate }]
  }));

  return (
    <Animated.View style={[{ position: 'absolute', top, left }, animatedStyle]}>
      <MaterialCommunityIcons name="grid" size={size} color="rgba(255,255,255,0.15)" />
    </Animated.View>
  );
};

export default function LoginScreen() {
  const navigation = /** @type {any} */ (useNavigation());
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // SIMPLIFIED CREDENTIALS - ONLY 2 ROLES
  const STATIC_USERS = {
    'user': { password: 'user@123', role: 'User', name: 'John Doe' },
    'store.manager': { password: 'bw_store@2025', role: 'Store Manager', name: 'Sarah Store' },
  };

  const handleLogin = () => {
    const user = STATIC_USERS[email.toLowerCase()];

    if (user && user.password === password) {
      if (user.role === 'Store Manager') {
        navigation.navigate('ManagerDashboard', { userProfile: user });
      } else {
        // Default: User role
        navigation.navigate('Home', { userProfile: user });
      }
    } else {
      Alert.alert('Login Failed', 'Invalid username or password');
    }
  };

  return (
    <View style={styles.container}>
      {/* 1. PREMIUM GRADIENT BACKGROUND */}
      <LinearGradient
        colors={['#fbbf24', '#d97706', '#92400e']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* 2. FLOATING WAFFLE ELEMENTS */}
      <FloatingWaffle delay={0} duration={3000} size={120} top={height * 0.1} left={-20} rotate="15deg" />
      <FloatingWaffle delay={500} duration={4000} size={80} top={height * 0.2} left={width - 50} rotate="-10deg" />
      <FloatingWaffle delay={1000} duration={3500} size={150} top={height * 0.6} left={-40} rotate="30deg" />
      <FloatingWaffle delay={200} duration={4500} size={100} top={height * 0.8} left={width - 80} rotate="-20deg" />


      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1, justifyContent: 'center', alignItems: 'center', width: '100%' }}
      >
        {/* 3. GLASSMORPHISM CARD */}
        <Animated.View entering={FadeInUp.duration(1000).springify()}>
          <BlurView intensity={30} tint="light" style={styles.glassCard}>

            {/* LOGO */}
            <Animated.View entering={FadeInDown.delay(200).duration(800)}>
              <Image
                source={require('../assets/BW_Logo.png')}
                style={styles.logo}
                resizeMode="contain"
              />
            </Animated.View>

            <Animated.Text entering={FadeInDown.delay(300).duration(800)} style={styles.title}>
              Belgian Waffle LMS
            </Animated.Text>
            <Animated.Text entering={FadeInDown.delay(400).duration(800)} style={styles.subtitle}>
              {t('loginTitle')}
            </Animated.Text>

            {/* FORM */}
            <View style={styles.form}>
              {/* Email */}
              <Animated.View entering={FadeInDown.delay(500).duration(800)} style={styles.inputContainer}>
                <MaterialCommunityIcons name="email-outline" size={20} color="#FFF" style={styles.inputIcon} />
                <TextInput
                  placeholder="you@example.com"
                  placeholderTextColor="rgba(255,255,255,0.6)"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={styles.input}
                />
              </Animated.View>

              {/* Password */}
              <Animated.View entering={FadeInDown.delay(600).duration(800)} style={styles.inputContainer}>
                <MaterialCommunityIcons name="lock-outline" size={20} color="#FFF" style={styles.inputIcon} />
                <TextInput
                  placeholder="••••••••"
                  placeholderTextColor="rgba(255,255,255,0.6)"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  style={styles.input}
                />
              </Animated.View>

              {/* Forgot password */}
              <Animated.View entering={FadeInDown.delay(700).duration(800)}>
                <Pressable>
                  <Text style={styles.forgot}>{t('forgotPassword')}</Text>
                </Pressable>
              </Animated.View>

              {/* Login Button */}
              <Animated.View entering={FadeInDown.delay(800).duration(800)}>
                <Pressable style={styles.loginBtn} onPress={handleLogin}>
                  <Text style={styles.loginText}>{t('loginBtn')}</Text>
                </Pressable>
              </Animated.View>

            </View>
          </BlurView>
        </Animated.View>

      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glassCard: {
    width: width * 0.9,
    paddingVertical: 40,
    paddingHorizontal: 25,
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)' // Fallback / Base tint
  },
  logo: {
    width: 100,
    height: 100,
    marginBottom: 10,
    shadowColor: "#F59E0B",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
  },
  title: {
    fontSize: 26,
    fontFamily: 'Poppins_700Bold', // UPDATED FONT
    color: '#FFF',
    marginBottom: 5,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular', // UPDATED FONT
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 30,
    textAlign: 'center',
  },
  form: {
    width: '100%',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 15,
    marginBottom: 15,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)'
  },
  inputIcon: {
    marginRight: 10
  },
  input: {
    flex: 1,
    paddingVertical: 15,
    fontSize: 15,
    color: '#FFF',
    fontFamily: 'Poppins_400Regular'
  },
  forgot: {
    fontSize: 13,
    color: '#FCD34D', // Lighter amber
    textAlign: 'right',
    fontFamily: 'Poppins_500Medium',
    marginBottom: 20
  },
  loginBtn: {
    backgroundColor: '#F59E0B',
    paddingVertical: 16,
    borderRadius: 15,
    alignItems: 'center',
    shadowColor: "#F59E0B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  loginText: {
    color: '#FFF',
    fontSize: 16,
    fontFamily: 'Poppins_700Bold',
  },
});
