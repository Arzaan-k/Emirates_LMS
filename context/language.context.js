import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LanguageContext = createContext();

export const LANGUAGES = {
  en: "English",
  hi: "हिन्दी (Hindi)",
  es: "Español (Spanish)",
  fr: "Français (French)",
};

const TRANSLATIONS = {
  en: {
    settings: "Settings",
    language: "Language",
    selectLanguage: "Select Language",
    profile: "Profile",
    learningBreakdown: "Learning Breakdown",
    thisWeek: "This Week",
    completed: "Completed",
    incomplete: "Incomplete",
    extraCredit: "Extra Credit",
    inProgress: "In Progress ⏳",
    seeAll: "See All",
    history: "History",
    achievements: "Achievements",
    joined: "Joined",
    storeManager: "Airport Manager",
    totalXP: "Total XP",
    diamondLeague: "Diamond League",
    rank: "Rank",
    top: "Top",
    due: "Due",
    recommend: "RECOMMENDED",
    optional: "OPTIONAL",
    logout: "Log Out",
    welcome: "Welcome",
    dashboard: "Dashboard",
    // Login
    loginTitle: "Login to continue",
    email: "Email",
    password: "Password",
    forgotPassword: "Forgot password?",
    loginBtn: "Login",
    // Home
    goodMorning: "Good Morning,",
    searchPlaceholder: "Find courses, recipes, SOPs...",
    digitalTwin: "DIGITAL TWIN",
    storeSimulation: "Airport Simulation",
    enterSimulation: "Enter Simulation",
    todaysGoal: "TODAY'S GOAL",
    aiPowerSuite: "AI Power Suite ⚡",
    jumpBackIn: "Jump Back In",
    freshlyBrewed: "Freshly Brewed ☕",
    newTag: "NEW",
    justNow: "JUST NOW",
    actionRequired: "ACTION REQUIRED",
    official: "OFFICIAL",
    // Manager Dashboard
    welcomeBack: "Welcome back,",
    keyPerformanceIndicators: "Key Performance Indicators",
    aiInsight: "AI Insight",
    liveActivity: "Live Activity",
    quickActions: "Quick Actions",
    teamList: "Team List",
    reports: "Reports",
    assignQuiz: "Assign Quiz",
    audits: "Audits",
    uploadTraining: "Upload Training",
    createUser: "Create User",
    proctoredAssessment: "Proctored Assessment",
    assignTraining: "Assign Training",
    orgHierarchy: "Organizational Hierarchy",
    viewOrgHierarchy: "View Organizational Hierarchy",
  },
  hi: {
    settings: "सेटिंग्स",
    language: "भाषा",
    selectLanguage: "भाषा चुनें",
    profile: "प्रोफाइल",
    learningBreakdown: "सीखने का विवरण",
    thisWeek: "इस सप्ताह",
    completed: "पूर्ण",
    incomplete: "अपूर्ण",
    extraCredit: "अतिरिक्त क्रेडिट",
    inProgress: "प्रगति में है ⏳",
    seeAll: "सभी देखें",
    history: "इतिहास",
    achievements: "उपलब्धियां",
    joined: "जुड़े",
    storeManager: "एयरपोर्ट मैनेजर",
    totalXP: "कुल XP",
    diamondLeague: "डायमंड लीग",
    rank: "रैंक",
    top: "शीर्ष",
    due: "देय",
    recommend: "अनुशंसित",
    optional: "वैकल्पिक",
    logout: "लॉग आउट",
    welcome: "स्वागत है",
    dashboard: "डैशबोर्ड",
    // Login
    loginTitle: "लॉगिन करें",
    email: "ईमेल",
    password: "पासवर्ड",
    forgotPassword: "पासवर्ड भूल गए?",
    loginBtn: "लॉगिन",
    // Home
    goodMorning: "शुभ प्रभात,",
    searchPlaceholder: "पाठ्यक्रम, रेसिपी, SOP खोजें...",
    digitalTwin: "डिजिटल ट्विन",
    storeSimulation: "एयरपोर्ट सिमुलेशन",
    enterSimulation: "सिमुलेशन में प्रवेश करें",
    todaysGoal: "आज का लक्ष्य",
    aiPowerSuite: "AI पावर सूट ⚡",
    jumpBackIn: "वापस जाएं",
    freshlyBrewed: "ताज़ा अपडेट ☕",
    newTag: "नया",
    justNow: "अभी अभी",
    actionRequired: "कार्रवाई आवश्यक",
    official: "आधिकारिक",
    // Manager Dashboard
    welcomeBack: "वापसी पर स्वागत है,",
    keyPerformanceIndicators: "मुख्य प्रदर्शन संकेतक",
    aiInsight: "AI अंतर्दृष्टि",
    liveActivity: "लाइव गतिविधि",
    quickActions: "त्वरित कार्रवाई",
    teamList: "टीम सूची",
    reports: "रिपोर्ट",
    assignQuiz: "क्विज़ सौंपें",
    audits: "ऑडिट",
    uploadTraining: "प्रशिक्षण अपलोड करें",
    createUser: "उपयोगकर्ता बनाएं",
    proctoredAssessment: "निगरानी मूल्यांकन",
    assignTraining: "प्रशिक्षण सौंपें",
    orgHierarchy: "संगठनात्मक पदानुक्रम",
    viewOrgHierarchy: "संगठनात्मक पदानुक्रम देखें",
  },
  es: {
    settings: "Ajustes",
    language: "Idioma",
    selectLanguage: "Seleccionar idioma",
    profile: "Perfil",
    learningBreakdown: "Desglose de aprendizaje",
    thisWeek: "Esta semana",
    completed: "Completado",
    incomplete: "Incompleto",
    extraCredit: "Crédito extra",
    inProgress: "En progreso ⏳",
    seeAll: "Ver todo",
    history: "Historial",
    achievements: "Logros",
    joined: "Se unió",
    storeManager: "Gerente de aeropuerto",
    totalXP: "XP Total",
    diamondLeague: "Liga Diamante",
    rank: "Rango",
    top: "Superior",
    due: "Vence",
    recommend: "RECOMENDADO",
    optional: "OPCIONAL",
    logout: "Cerrar sesión",
    welcome: "Bienvenido",
    dashboard: "Panel",
    // Login
    loginTitle: "Iniciar sesión para continuar",
    email: "Correo electrónico",
    password: "Contraseña",
    forgotPassword: "¿Olvidaste tu contraseña?",
    loginBtn: "Iniciar sesión",
    // Home
    goodMorning: "Buenos días,",
    searchPlaceholder: "Buscar cursos, recetas, SOP...",
    digitalTwin: "GEMELO DIGITAL",
    storeSimulation: "Simulación de aeropuerto",
    enterSimulation: "Entrar a la simulación",
    todaysGoal: "META DE HOY",
    aiPowerSuite: "Suite de energía AI ⚡",
    jumpBackIn: "Volver a entrar",
    freshlyBrewed: "Recién hecho ☕",
    newTag: "NUEVO",
    justNow: "AHORA MISMO",
    actionRequired: "ACCIÓN REQUERIDA",
    official: "OFICIAL",
    // Manager Dashboard
    welcomeBack: "Bienvenido de nuevo,",
    keyPerformanceIndicators: "Indicadores clave de rendimiento",
    aiInsight: "Perspectiva de IA",
    liveActivity: "Actividad en vivo",
    quickActions: "Acciones rápidas",
    teamList: "Lista del equipo",
    reports: "Informes",
    assignQuiz: "Asignar cuestionario",
    audits: "Auditorías",
    uploadTraining: "Subir entrenamiento",
    createUser: "Crear usuario",
    proctoredAssessment: "Evaluación supervisada",
    assignTraining: "Asignar entrenamiento",
    orgHierarchy: "Jerarquía Organizacional",
    viewOrgHierarchy: "Ver Jerarquía Organizacional",
  },
  fr: {
    settings: "Paramètres",
    language: "Langue",
    selectLanguage: "Choisir la langue",
    profile: "Profil",
    learningBreakdown: "Détail de l'apprentissage",
    thisWeek: "Cette semaine",
    completed: "Terminé",
    incomplete: "Incomplet",
    extraCredit: "Crédit supplémentaire",
    inProgress: "En cours ⏳",
    seeAll: "Voir tout",
    history: "Historique",
    achievements: "Réalisations",
    joined: "Rejoint",
    storeManager: "Directeur d'aéroport",
    totalXP: "XP Total",
    diamondLeague: "Ligue Diamant",
    rank: "Rang",
    top: "Haut",
    due: "Échéance",
    recommend: "RECOMMANDÉ",
    optional: "OPTIONNEL",
    logout: "Se déconnecter",
    welcome: "Bienvenue",
    dashboard: "Tableau de bord",
    // Login
    loginTitle: "Connectez-vous pour continuer",
    email: "E-mail",
    password: "Mot de passe",
    forgotPassword: "Mot de passe oublié ?",
    loginBtn: "Se connecter",
    // Home
    goodMorning: "Bonjour,",
    searchPlaceholder: "Rechercher des cours, des recettes, des SOP...",
    digitalTwin: "JUMEAU NUMÉRIQUE",
    storeSimulation: "Simulation d'aéroport",
    enterSimulation: "Entrer dans la simulation",
    todaysGoal: "OBJECTIF DU JOUR",
    aiPowerSuite: "Suite d'alimentation IA ⚡",
    jumpBackIn: "Revenir",
    freshlyBrewed: "Fraîchement préparé ☕",
    newTag: "NOUVEAU",
    justNow: "À L'INSTANT",
    actionRequired: "ACTION REQUISE",
    official: "OFFICIEL",
    // Manager Dashboard
    welcomeBack: "Bon retour,",
    keyPerformanceIndicators: "Indicateurs clés de performance",
    aiInsight: "Aperçu IA",
    liveActivity: "Activité en direct",
    quickActions: "Actions rapides",
    teamList: "Liste de l'équipe",
    reports: "Rapports",
    assignQuiz: "Attribuer un quiz",
    audits: "Audits",
    uploadTraining: "Télécharger la formation",
    createUser: "Créer un utilisateur",
    proctoredAssessment: "Évaluation surveillée",
    assignTraining: "Attribuer une formation",
    orgHierarchy: "Hiérarchie Organisationnelle",
    viewOrgHierarchy: "Voir la Hiérarchie Organisationnelle",
  }
};

export const LanguageProvider = ({ children }) => {
  const [language, setLanguage] = useState("en");

  useEffect(() => {
    // Load saved language
    const loadLanguage = async () => {
      try {
        const savedLang = await AsyncStorage.getItem("appLanguage");
        if (savedLang) {
          setLanguage(savedLang);
        }
      } catch (e) {
        console.error("Failed to load language", e);
      }
    };
    loadLanguage();
  }, []);

  const changeLanguage = async (langCode) => {
    setLanguage(langCode);
    try {
      await AsyncStorage.setItem("appLanguage", langCode);
    } catch (e) {
      console.error("Failed to save language", e);
    }
  };

  const t = (key) => {
    return TRANSLATIONS[language][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, changeLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
