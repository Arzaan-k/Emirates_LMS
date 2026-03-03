import React, { useEffect, useState } from "react";
import { LogBox, Platform, View, ActivityIndicator } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ScreenCapture from "expo-screen-capture";
import Intro from "./Screens/Intro";
import API_URL from "./config";
import {
  useFonts,
  Poppins_600SemiBold,
  Poppins_300Light,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";

import { ThemeProvider } from "./context/theme.context";
// import { NotificationProvider } from "./context/notification.provider";
// import { withIAPContext } from "react-native-iap";

import Onboarding from "./Screens/Onboarding";
import Login from "./Screens/Login";
import Home from "./Screens/Home";
import ManagerDashboard from "./Screens/ManagerDashboard";
import CreateUser from "./Screens/CreateUser";
import ProctoredAssessment from "./Screens/ProctoredAssessment";

import Settings from "./Screens/Settings";
import InterviewModules from "./Screens/InterviewModules";
import ModuleDetail from "./Screens/ModuleDetail";
import Hierarchy from "./Screens/Hierarchy";
import { LanguageProvider } from "./context/language.context";
import Analytics from "./Screens/AdvancedAnalytics"; // NEW: Comprehensive Analytics Module
import LiveTrackingScreen from './Screens/LiveTrackingScreen';
import TeamListScreen from './Screens/TeamListScreen';
import AuditsScreen from './Screens/AuditsScreen';
import Recommendations from './Screens/Recommendations';
import MeetingRoom from './Screens/MeetingRoom';
import CRMTaskScreen from './Screens/CRMTaskScreen';
import AdminReports from './Screens/AdminReports'; // NEW: Comprehensive Reports Module
import DisclaimerModal from './Components/DisclaimerModal'; // Global disclaimer

LogBox.ignoreAllLogs();

const Stack = createNativeStackNavigator();

function AuthGate({ navigation }) {
  const [loading, setLoading] = useState(false);
  const [userLoggedIn, setUserLoggedIn] = useState(false);
  useEffect(() => {
    const checkAuth = async () => {
      let token;
      try {
        if (Platform.OS === "web") {
          token = await AsyncStorage.getItem("accessToken");
        } else {
          token = await SecureStore.getItemAsync("accessToken");
        }
      } catch (error) {
        console.log("Error fetching token:", error);
      }
      // } finally {
      //   setLoading(true);
      //   if (token) {
      //     navigation.replace("Home");
      //   } else {
      //     navigation.replace("Onboarding");
      //   }
      // }
    };

    checkAuth();
  }, [navigation]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  else {
    if (!userLoggedIn) {
      navigation.replace("Onboarding");
    } else {
      navigation.replace("Home");
    }
  }

  return null;
}

function App() {
  // Fetch system settings to determine screenshot allowance
  useEffect(() => {
    const fetchScreenshotSetting = async () => {
      if (Platform.OS === 'web') return; // Not supported on web

      try {
        const response = await fetch(`${API_URL}/api/v1/system/settings`);
        if (response.ok) {
          const data = await response.json();
          const allowScreenshot = data?.settings?.allow_screenshots?.value_bool;

          if (allowScreenshot) {
            await ScreenCapture.allowScreenCaptureAsync();
          } else {
            await ScreenCapture.preventScreenCaptureAsync();
          }
        }
      } catch (error) {
        console.log("Failed to fetch screenshot setting:", error);
        // Default to secure if fetch fails
        await ScreenCapture.preventScreenCaptureAsync();
      }
    };

    fetchScreenshotSetting();
    // Re-check periodically or simply on mount
    const interval = setInterval(fetchScreenshotSetting, 60000);
    return () => clearInterval(interval);
  }, []);

  const [fontsLoaded] = useFonts({
    Poppins_600SemiBold,
    Poppins_300Light,
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_700Bold,
  });

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <LanguageProvider>
          {/* <NotificationProvider> */}
          <NavigationContainer>
            <Stack.Navigator id="RootStack" screenOptions={{ headerShown: false }}>
              <Stack.Screen name="AuthGate" component={AuthGate} />
              <Stack.Screen name="Onboarding" component={Onboarding} />
              <Stack.Screen name="Intro" component={Intro} />
              <Stack.Screen name="Login" component={Login} />
              <Stack.Screen name="Home" component={Home} />
              <Stack.Screen name="ManagerDashboard" component={ManagerDashboard} />
              <Stack.Screen name="CreateUser" component={CreateUser} />
              <Stack.Screen name="ProctoredAssessment" component={ProctoredAssessment} />
              <Stack.Screen name="Settings" component={Settings} />
              <Stack.Screen name="InterviewModules" component={InterviewModules} />
              <Stack.Screen name="ModuleDetail" component={ModuleDetail} />
              <Stack.Screen name="Hierarchy" component={Hierarchy} />
              <Stack.Screen name="Analytics" component={Analytics} />
              <Stack.Screen name="LiveTracking" component={LiveTrackingScreen} />
              <Stack.Screen name="TeamList" component={TeamListScreen} />
              <Stack.Screen name="Audits" component={AuditsScreen} />
              <Stack.Screen name="Recommendations" component={Recommendations} />
              <Stack.Screen name="MeetingRoom" component={MeetingRoom} />
              <Stack.Screen name="CRMTask" component={CRMTaskScreen} />
              <Stack.Screen name="AdminReports" component={AdminReports} />
            </Stack.Navigator>
          </NavigationContainer>
          {/* </NotificationProvider> */}
        </LanguageProvider>
      </ThemeProvider >
      <DisclaimerModal />
    </SafeAreaProvider >
  );
}

// export default withIAPContext(App);
export default App;
