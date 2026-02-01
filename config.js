// Central Configuration
// Change this IP to your machine's local IP address or production URL

// ============================================
// DEPLOYMENT MODE - UNCOMMENT ONE OPTION BELOW
// ============================================

// OPTION 1: Local Development (Physical Device on same network)
// const API_URL = "http://192.168.29.119:8000";

// OPTION 2: Render.com Production (ACTIVE FOR APK BUILD)
const API_URL = "https://newlms-backend.onrender.com";

// OPTION 3: Ngrok (for testing with physical device)
// const API_URL = "https://your-ngrok-url.ngrok-free.app";

// OPTION 4: Emulator (Android Studio / iOS Simulator)
// const API_URL = "http://localhost:8000";

export default API_URL;
