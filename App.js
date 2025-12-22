import React, { useEffect, useState } from "react";
import { LogBox, Platform, View, ActivityIndicator } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Intro from "./Screens/Intro";
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
import OpsDashboard from "./Screens/OpsDashboard";
import CityDashboard from "./Screens/CityDashboard";
import AreaDashboard from "./Screens/AreaDashboard";
import StoreDashboard from "./Screens/StoreDashboard";

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
  const [fontsLoaded] = useFonts({
    Poppins_600SemiBold,
    Poppins_300Light,
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_700Bold,
  });

  if (!fontsLoaded) return null;

  return (
    <ThemeProvider>
      {/* <NotificationProvider> */}
      <NavigationContainer>
        <Stack.Navigator id="RootStack" screenOptions={{ headerShown: false }}>
          <Stack.Screen name="AuthGate" component={AuthGate} />
          <Stack.Screen name="Onboarding" component={Onboarding} />
          <Stack.Screen name="Intro" component={Intro} />
          <Stack.Screen name="Login" component={Login} />
          <Stack.Screen name="Home" component={Home} />
          <Stack.Screen name="ManagerDashboard" component={ManagerDashboard} />
          <Stack.Screen name="OpsDashboard" component={OpsDashboard} />
          <Stack.Screen name="CityDashboard" component={CityDashboard} />
          <Stack.Screen name="AreaDashboard" component={AreaDashboard} />
          <Stack.Screen name="StoreDashboard" component={StoreDashboard} />
        </Stack.Navigator>
      </NavigationContainer>
      {/* </NotificationProvider> */}
    </ThemeProvider>
  );
}

// export default withIAPContext(App);
export default App;
