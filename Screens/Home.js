// Screens/Home.js
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TextInput,
  TouchableOpacity,
  Platform,
  Dimensions,
} from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { BlurView } from "expo-blur";
import { Feather, Octicons, Ionicons, MaterialIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Import Screens
import Courses from "./Courses";
import Resources from "./Resources";
import Profile from "./Profile";

const Tab = createBottomTabNavigator();
const { width } = Dimensions.get("window");

// Mock Data
const CATEGORIES = ["All", "Operations", "Hygiene", "Service", "Kitchen"];
const CONTINUE_WATCHING = [
  {
    id: 1,
    title: "The Perfect Waffle Batter",
    progress: 0.7,
    image: "https://images.unsplash.com/photo-1562608420-532c201fac48?q=80&w=2000&auto=format&fit=crop",
    duration: "12 mins left",
  },
  {
    id: 2,
    title: "Customer Service Mastery",
    progress: 0.3,
    image: "https://images.unsplash.com/photo-1556742049-0cfed4f7a07d?q=80&w=2000&auto=format&fit=crop",
    duration: "25 mins left",
  },
];
const RECENT_COURSES = [
  {
    id: 3,
    title: "Food Safety Standards 2024",
    author: "QA Department",
    rating: 4.9,
    image: "https://images.unsplash.com/photo-1606787366850-de6330128bfc?q=80&w=2000&auto=format&fit=crop",
  },
  {
    id: 4,
    title: "Opening & Closing Checklist",
    author: "Operations Team",
    rating: 4.8,
    image: "https://images.unsplash.com/photo-1556910103-1c02745a30bf?q=80&w=2000&auto=format&fit=crop",
  },
  {
    id: 5,
    title: "Inventory Management",
    author: "Supply Chain",
    rating: 4.7,
    image: "https://images.unsplash.com/photo-1580674285054-bed31e145f59?q=80&w=2000&auto=format&fit=crop",
  },
];

// ----------- HOME TAB COMPONENTS -----------

function Header() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.headerContainer, { paddingTop: insets.top + 10 }]}>
      <View>
        <Text style={styles.greetingText}>Hello, Waffle Master! 👋</Text>
        <Text style={styles.subGreetingText}>Ready to learn something new?</Text>
      </View>
      <TouchableOpacity style={styles.profileButton}>
        <Image
          source={{ uri: "https://ui-avatars.com/api/?name=Aditya+User&background=F59E0B&color=fff" }}
          style={styles.profileImage}
        />
        <View style={styles.notificationBadge} />
      </TouchableOpacity>
    </View>
  );
}

function SearchBar() {
  return (
    <View style={styles.searchContainer}>
      <Feather name="search" size={20} color="#9CA3AF" style={styles.searchIcon} />
      <TextInput
        placeholder="Search for courses, guides..."
        placeholderTextColor="#9CA3AF"
        style={styles.searchInput}
      />
      <TouchableOpacity style={styles.filterButton}>
        <Octicons name="sliders" size={18} color="#FFF" />
      </TouchableOpacity>
    </View>
  );
}

function ProgressCard() {
  return (
    <LinearGradient
      colors={["#F59E0B", "#D97706"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.progressCard}
    >
      <View style={styles.progressContent}>
        <View style={{ flex: 1 }}>
          <Text style={styles.progressTitle}>Weekly Target</Text>
          <Text style={styles.progressSubtitle}>3/5 Modules Completed</Text>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: "60%" }]} />
          </View>
        </View>
        <View style={styles.circleProgress}>
          <Text style={styles.circleText}>60%</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

function Categories() {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoriesList} contentContainerStyle={{ paddingHorizontal: 20 }}>
      {CATEGORIES.map((cat, index) => (
        <TouchableOpacity
          key={index}
          style={[styles.categoryChip, index === 0 && styles.activeCategory]}
        >
          <Text
            style={[
              styles.categoryText,
              index === 0 && styles.activeCategoryText,
            ]}
          >
            {cat}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

function ContinueWatching() {
  return (
    <View style={styles.sectionContainer}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Continue Watching</Text>
        <TouchableOpacity>
          <Text style={styles.seeAllText}>See All</Text>
        </TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20 }}>
        {CONTINUE_WATCHING.map((item) => (
          <TouchableOpacity key={item.id} style={styles.courseCardLarge}>
            <Image source={{ uri: item.image }} style={styles.courseImageLarge} />
            <View style={styles.playOverlay}>
              <View style={styles.playButton}>
                <Ionicons name="play" size={20} color="#FFF" style={{ marginLeft: 2 }} />
              </View>
            </View>
            <View style={styles.courseInfoLarge}>
              <Text style={styles.courseTitle} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.courseDuration}>{item.duration}</Text>
              <View style={styles.miniProgressBar}>
                <View style={[styles.miniProgressBarFill, { width: `${item.progress * 100}%` }]} />
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

function RecentCourses() {
  return (
    <View style={[styles.sectionContainer, { marginBottom: 100 }]}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>New Arrivals</Text>
        <TouchableOpacity>
          <Text style={styles.seeAllText}>See All</Text>
        </TouchableOpacity>
      </View>
      <View style={{ paddingHorizontal: 20 }}>
        {RECENT_COURSES.map((item) => (
          <TouchableOpacity key={item.id} style={styles.courseCardRow}>
            <Image source={{ uri: item.image }} style={styles.courseImageSmall} />
            <View style={styles.courseRowInfo}>
              <View style={styles.badgeRow}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>NEW</Text>
                </View>
                <View style={styles.ratingBadge}>
                  <Ionicons name="star" size={10} color="#F59E0B" />
                  <Text style={styles.ratingText}>{item.rating}</Text>
                </View>
              </View>
              <Text style={styles.rowTitle} numberOfLines={2}>{item.title}</Text>
              <Text style={styles.rowAuthor}>By {item.author}</Text>
            </View>
            <TouchableOpacity style={styles.bookmarkBtn}>
              <Feather name="bookmark" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function HomeContent() {
  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      stickyHeaderIndices={[1]}
    >
      <Header />
      <SearchBar />
      <ProgressCard />
      <Categories />
      <ContinueWatching />
      <RecentCourses />
    </ScrollView>
  );
}

// ----------- MAIN NAVIGATOR -----------

export default function Home() {
  return (
    <Tab.Navigator
      id="HomeTabs"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: false,
        tabBarIcon: ({ color, focused }) => {
          let IconComp;
          let iconName;
          let size = 24;

          if (route.name === "HomeTab") {
            IconComp = Feather;
            iconName = "home";
          } else if (route.name === "CoursesTab") {
            IconComp = Feather;
            iconName = "book-open";
          } else if (route.name === "ResourcesTab") {
            IconComp = Ionicons;
            iconName = "document-text-outline";
          } else if (route.name === "ProfileTab") {
            IconComp = Octicons;
            iconName = "person";
          }

          return (
            <View style={[styles.tabIconContainer, focused && styles.activeTabIcon]}>
              <IconComp name={iconName} size={size} color={focused ? "#F59E0B" : "#9CA3AF"} />
              {focused && <View style={styles.activeDot} />}
            </View>
          );
        },
        tabBarStyle: styles.tabBar,
        tabBarBackground: () => (
          <BlurView intensity={80} tint="light" style={styles.blurBg} />
        ),
      })}
    >
      <Tab.Screen name="HomeTab" component={HomeContent} />
      <Tab.Screen name="CoursesTab" component={Courses} />
      <Tab.Screen name="ResourcesTab" component={Resources} />
      <Tab.Screen name="ProfileTab" component={Profile} />
    </Tab.Navigator>
  );
}

// ----------- STYLES -----------
// (Reusing same styles as before for Home Content)

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  headerContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
  },
  greetingText: {
    fontSize: 20,
    fontFamily: "Poppins_700Bold",
    color: "#111827",
  },
  subGreetingText: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    color: "#6B7280",
    marginTop: 2,
  },
  profileButton: {
    position: "relative",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  profileImage: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
    borderWidth: 2,
    borderColor: "#FFF",
  },
  notificationBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#EF4444",
    borderWidth: 2,
    borderColor: "#F9FAFB",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: "#FFF",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Poppins_400Regular",
    color: "#111827",
  },
  filterButton: {
    backgroundColor: "#111827",
    padding: 8,
    borderRadius: 10,
    marginLeft: 10,
  },
  progressCard: {
    marginHorizontal: 20,
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    flexDirection: "row",
    alignItems: "center",
  },
  progressContent: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    justifyContent: "space-between",
  },
  progressTitle: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 14,
    fontFamily: "Poppins_500Medium",
    marginBottom: 4,
  },
  progressSubtitle: {
    color: "#FFF",
    fontSize: 18,
    fontFamily: "Poppins_700Bold",
    marginBottom: 12,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: "rgba(255,255,255,0.3)",
    borderRadius: 3,
    width: "80%",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#FFF",
    borderRadius: 3,
  },
  circleProgress: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  circleText: {
    color: "#FFF",
    fontSize: 14,
    fontFamily: "Poppins_700Bold",
  },
  categoriesList: {
    marginBottom: 24,
  },
  categoryChip: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 24,
    backgroundColor: "#FFF",
    marginRight: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  activeCategory: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  categoryText: {
    fontSize: 14,
    fontFamily: "Poppins_500Medium",
    color: "#6B7280",
  },
  activeCategoryText: {
    color: "#FFF",
  },
  sectionContainer: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Poppins_700Bold",
    color: "#111827",
  },
  seeAllText: {
    fontSize: 14,
    fontFamily: "Poppins_500Medium",
    color: "#F59E0B",
  },
  courseCardLarge: {
    width: width * 0.65,
    marginRight: 16,
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  courseImageLarge: {
    width: "100%",
    height: 140,
    borderRadius: 16,
    marginBottom: 12,
  },
  playOverlay: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    height: 140,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.1)",
    borderRadius: 16,
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  courseInfoLarge: {
    paddingHorizontal: 4,
  },
  courseTitle: {
    fontSize: 16,
    fontFamily: "Poppins_600SemiBold",
    color: "#111827",
    marginBottom: 4,
  },
  courseDuration: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    color: "#6B7280",
    marginBottom: 12,
  },
  miniProgressBar: {
    height: 4,
    backgroundColor: "#E5E7EB",
    borderRadius: 2,
    overflow: "hidden",
  },
  miniProgressBarFill: {
    height: "100%",
    backgroundColor: "#F59E0B",
    borderRadius: 2,
  },
  courseCardRow: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    padding: 12,
    borderRadius: 16,
    marginBottom: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  courseImageSmall: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
  },
  courseRowInfo: {
    flex: 1,
    marginLeft: 16,
    justifyContent: "center",
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  badge: {
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginRight: 8,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: "Poppins_700Bold",
    color: "#D97706",
  },
  ratingBadge: {
    flexDirection: "row",
    alignItems: "center",
  },
  ratingText: {
    fontSize: 12,
    fontFamily: "Poppins_600SemiBold",
    color: "#374151",
    marginLeft: 4,
  },
  rowTitle: {
    fontSize: 15,
    fontFamily: "Poppins_600SemiBold",
    color: "#111827",
    marginBottom: 4,
    lineHeight: 22,
  },
  rowAuthor: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    color: "#9CA3AF",
  },
  bookmarkBtn: {
    padding: 8,
  },
  tabBar: {
    position: "absolute",
    bottom: 25,
    left: 20,
    right: 20,
    height: 70,
    borderRadius: 35,
    borderTopWidth: 0,
    backgroundColor: "transparent",
    elevation: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
  },
  blurBg: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 35,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  tabIconContainer: {
    alignItems: "center",
    justifyContent: "center",
    top: 5,
  },
  activeTabIcon: {
    transform: [{ scale: 1.1 }],
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#F59E0B",
    marginTop: 4,
  },
});
