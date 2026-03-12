import { Platform } from 'react-native';

// Central Configuration

// Define available environments
const ENV = {
    // Local Development URLs
    dev: {
        web: "http://192.168.1.23:8000",
        ios: "http://192.168.1.23:8000",
        android: "http://192.168.1.23:8000", // Special alias for Android Emulator to access host localhost
    },
    // Production URL (Render.com)
    prod: "https://newlms-backend-ocjt.onrender.com"
};

const getApiUrl = () => {
    // Check if we are in development mode
    if (__DEV__) {
        if (Platform.OS === 'web') return ENV.dev.web;
        if (Platform.OS === 'android') return ENV.dev.android;
        return ENV.dev.ios;
    }

    // Default to production for builds
    return ENV.prod;
};

const API_URL = getApiUrl();

export default API_URL;
