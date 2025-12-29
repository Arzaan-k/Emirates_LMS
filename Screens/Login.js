// LoginScreen.js
import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TextInput,
  Pressable,
  Alert,
} from 'react-native';
import { useLanguage } from "../context/language.context";

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

      {/* LOGO – bas path change kar dena */}
      <Image
        source={require('../assets/BW_Logo.png')} // <-- logo path
        style={styles.logo}
        resizeMode="contain"
      />

      <Text style={styles.title}>Belgian Waffle LMS</Text>
      <Text style={styles.subtitle}>{t('loginTitle')}</Text>

      {/* FORM */}
      <View style={styles.form}>

        {/* Email */}
        <Text style={styles.label}>{t('email')}</Text>
        <TextInput
          placeholder="you@example.com"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          style={styles.input}
        />

        {/* Password */}
        <Text style={styles.label}>{t('password')}</Text>
        <TextInput
          placeholder="••••••••"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          style={styles.input}
        />

        {/* Forgot password */}
        <Pressable>
          <Text style={styles.forgot}>{t('forgotPassword')}</Text>
        </Pressable>

        {/* Login Button */}
        <Pressable style={styles.loginBtn} onPress={handleLogin}>
          <Text style={styles.loginText}>{t('loginBtn')}</Text>
        </Pressable>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },

  logo: {
    width: 110,
    height: 110,
    marginBottom: 16,
  },

  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },

  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 32,
  },

  form: {
    width: '100%',
  },

  label: {
    fontSize: 13,
    color: '#444',
    marginBottom: 6,
    marginTop: 14,
  },

  input: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },

  forgot: {
    marginTop: 10,
    fontSize: 13,
    color: '#F59E0B',
    textAlign: 'right',
  },

  loginBtn: {
    marginTop: 28,
    backgroundColor: '#F59E0B',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },

  loginText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
