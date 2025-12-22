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

export default function LoginScreen() {
  const navigation = /** @type {any} */ (useNavigation());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // STATIC CREDENTIALS FOR HIERARCHY
  const STATIC_USERS = {
    // LOWER LEVEL (Existing)
    'user': { password: 'user@123', role: 'Team Member', name: 'John Doe' },

    // UPPER LEVEL HIERARCHY
    'store.manager': { password: 'bw_store@2025', role: 'Store Manager', name: 'Sarah Store' },
    'area.manager': { password: 'bw_area@2025', role: 'Area Manager', name: 'Alex Area' },
    'deputy.area': { password: 'bw_darea@2025', role: 'Deputy Area Manager', name: 'Danny Deputy' },
    'deputy.city': { password: 'bw_dcity@2025', role: 'Deputy City Manager', name: 'Cindy City' },
    'city.manager': { password: 'bw_city@2025', role: 'City Manager', name: 'Chris City' },
    'ops.manager': { password: 'bw_ops@2025', role: 'Ops Manager', name: 'Oliver Ops' },
  };

  const handleLogin = () => {
    const user = STATIC_USERS[email.toLowerCase()];

    if (user && user.password === password) {
      if (user.role === 'Team Member') {
        navigation.navigate('Home', { userProfile: user });
      } else if (user.role === 'Store Manager') {
        navigation.navigate('StoreDashboard', { userProfile: user });
      } else if (user.role === 'Area Manager' || user.role === 'Deputy Area Manager') {
        navigation.navigate('AreaDashboard', { userProfile: user });
      } else if (user.role === 'City Manager' || user.role === 'Deputy City Manager') {
        navigation.navigate('CityDashboard', { userProfile: user });
      } else if (user.role === 'Ops Manager') {
        navigation.navigate('OpsDashboard', { userProfile: user });
      } else {
        navigation.navigate('ManagerDashboard', { userProfile: user });
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
      <Text style={styles.subtitle}>Login to continue</Text>

      {/* FORM */}
      <View style={styles.form}>

        {/* Email */}
        <Text style={styles.label}>Email</Text>
        <TextInput
          placeholder="you@example.com"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          style={styles.input}
        />

        {/* Password */}
        <Text style={styles.label}>Password</Text>
        <TextInput
          placeholder="••••••••"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          style={styles.input}
        />

        {/* Forgot password */}
        <Pressable>
          <Text style={styles.forgot}>Forgot password?</Text>
        </Pressable>

        {/* Login Button */}
        <Pressable style={styles.loginBtn} onPress={handleLogin}>
          <Text style={styles.loginText}>Login</Text>
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
