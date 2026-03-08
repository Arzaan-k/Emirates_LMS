import React, { useState, useEffect, useMemo } from 'react';
import {
    View,
    Text,
    Modal,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    Dimensions,
    ActivityIndicator,
    TextInput
} from 'react-native';
import { Feather, MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import API_URL from '../config';

const { width } = Dimensions.get('window');

// Comprehensive list of world languages for quiz translation (100+ languages)
const QUIZ_LANGUAGES = {
    // Major World Languages
    en: "English",
    zh: "中文 (Chinese - Mandarin)",
    hi: "हिन्दी (Hindi)",
    es: "Español (Spanish)",
    fr: "Français (French)",
    ar: "العربية (Arabic)",
    bn: "বাংলা (Bengali)",
    pt: "Português (Portuguese)",
    ru: "Русский (Russian)",
    ja: "日本語 (Japanese)",
    de: "Deutsch (German)",
    ko: "한국어 (Korean)",
    it: "Italiano (Italian)",
    tr: "Türkçe (Turkish)",
    vi: "Tiếng Việt (Vietnamese)",
    pl: "Polski (Polish)",
    uk: "Українська (Ukrainian)",
    fa: "فارسی (Persian/Farsi)",
    ro: "Română (Romanian)",
    nl: "Nederlands (Dutch)",

    // South Asian Languages
    ur: "اردو (Urdu)",
    pa: "ਪੰਜਾਬੀ (Punjabi)",
    ta: "தமிழ் (Tamil)",
    te: "తెలుగు (Telugu)",
    mr: "मराठी (Marathi)",
    gu: "ગુજરાતી (Gujarati)",
    kn: "ಕನ್ನಡ (Kannada)",
    ml: "മലയാളം (Malayalam)",
    si: "සිංහල (Sinhala)",
    ne: "नेपाली (Nepali)",

    // Southeast Asian Languages
    th: "ไทย (Thai)",
    my: "မြန်မာ (Burmese)",
    km: "ខ្មែរ (Khmer)",
    lo: "ລາວ (Lao)",
    id: "Bahasa Indonesia (Indonesian)",
    ms: "Bahasa Melayu (Malay)",
    tl: "Tagalog (Filipino)",

    // European Languages
    el: "Ελληνικά (Greek)",
    sv: "Svenska (Swedish)",
    no: "Norsk (Norwegian)",
    da: "Dansk (Danish)",
    fi: "Suomi (Finnish)",
    cs: "Čeština (Czech)",
    hu: "Magyar (Hungarian)",
    bg: "Български (Bulgarian)",
    hr: "Hrvatski (Croatian)",
    sr: "Српски (Serbian)",
    sk: "Slovenčina (Slovak)",
    sl: "Slovenščina (Slovenian)",
    lt: "Lietuvių (Lithuanian)",
    lv: "Latviešu (Latvian)",
    et: "Eesti (Estonian)",

    // Middle Eastern Languages
    he: "עברית (Hebrew)",
    am: "አማርኛ (Amharic)",
    ti: "ትግርኛ (Tigrinya)",
    ku: "Kurdî (Kurdish)",

    // African Languages
    sw: "Kiswahili (Swahili)",
    zu: "isiZulu (Zulu)",
    xh: "isiXhosa (Xhosa)",
    af: "Afrikaans",
    yo: "Yorùbá (Yoruba)",
    ig: "Igbo",
    ha: "Hausa",

    // East Asian Languages
    yue: "粵語 (Cantonese)",

    // Latin American Languages
    "es-mx": "Español Mexicano (Mexican Spanish)",
    "pt-br": "Português Brasileiro (Brazilian Portuguese)",

    // Other Languages
    ca: "Català (Catalan)",
    eu: "Euskara (Basque)",
    gl: "Galego (Galician)",
    cy: "Cymraeg (Welsh)",
    ga: "Gaeilge (Irish)",
    is: "Íslenska (Icelandic)",
    mt: "Malti (Maltese)",
    sq: "Shqip (Albanian)",
    mk: "Македонски (Macedonian)",
    ka: "ქართული (Georgian)",
    hy: "Հայերեն (Armenian)",
    az: "Azərbaycan (Azerbaijani)",
    kk: "Қазақ (Kazakh)",
    uz: "O'zbek (Uzbek)",
    mn: "Монгол (Mongolian)",
};

// Language name mapping for API (code to full name)
const LANGUAGE_NAME_MAP = {
    en: "English", zh: "Chinese", hi: "Hindi", es: "Spanish", fr: "French",
    ar: "Arabic", bn: "Bengali", pt: "Portuguese", ru: "Russian", ja: "Japanese",
    de: "German", ko: "Korean", it: "Italian", tr: "Turkish", vi: "Vietnamese",
    pl: "Polish", uk: "Ukrainian", fa: "Persian", ro: "Romanian", nl: "Dutch",
    ur: "Urdu", pa: "Punjabi", ta: "Tamil", te: "Telugu", mr: "Marathi",
    gu: "Gujarati", kn: "Kannada", ml: "Malayalam", si: "Sinhala", ne: "Nepali",
    th: "Thai", my: "Burmese", km: "Khmer", lo: "Lao", id: "Indonesian",
    ms: "Malay", tl: "Tagalog", el: "Greek", sv: "Swedish", no: "Norwegian",
    da: "Danish", fi: "Finnish", cs: "Czech", hu: "Hungarian", bg: "Bulgarian",
    hr: "Croatian", sr: "Serbian", sk: "Slovak", sl: "Slovenian", lt: "Lithuanian",
    lv: "Latvian", et: "Estonian", he: "Hebrew", am: "Amharic", ti: "Tigrinya",
    ku: "Kurdish", sw: "Swahili", zu: "Zulu", xh: "Xhosa", af: "Afrikaans",
    yo: "Yoruba", ig: "Igbo", ha: "Hausa", yue: "Cantonese",
    "es-mx": "Mexican Spanish", "pt-br": "Brazilian Portuguese",
    ca: "Catalan", eu: "Basque", gl: "Galician", cy: "Welsh", ga: "Irish",
    is: "Icelandic", mt: "Maltese", sq: "Albanian", mk: "Macedonian",
    ka: "Georgian", hy: "Armenian", az: "Azerbaijani", kk: "Kazakh",
    uz: "Uzbek", mn: "Mongolian",
};

export default function QuizTakingModal({ visible, quiz, onClose, userName = "User", userEmail }) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [answers, setAnswers] = useState([]);
    const [showResult, setShowResult] = useState(false);
    const [score, setScore] = useState(null);
    const [selectedLanguage, setSelectedLanguage] = useState('en');
    const [translatedQuiz, setTranslatedQuiz] = useState(null);
    const [isTranslating, setIsTranslating] = useState(false);
    const [showLanguageMenu, setShowLanguageMenu] = useState(false);
    const [languageSearch, setLanguageSearch] = useState('');

    // Reset states when modal opens/closes or quiz changes
    useEffect(() => {
        if (visible && quiz) {
            setCurrentIndex(0);
            setAnswers([]);
            setShowResult(false);
            setScore(null);
            setSelectedLanguage('en');
            setTranslatedQuiz(null);
            setIsTranslating(false);
        }
    }, [visible, quiz?.id]);

    // Fetch translated quiz when language changes
    useEffect(() => {
        const fetchTranslatedQuiz = async (language) => {
            if (language === 'en') {
                setTranslatedQuiz(null);
                return;
            }

            setIsTranslating(true);
            try {
                const targetLanguage = LANGUAGE_NAME_MAP[language] || 'Hindi';
                console.log(`Fetching translation for ${quiz.id} in ${targetLanguage}...`);

                const response = await fetch(
                    `${API_URL}/api/v1/quizzes/${quiz.id}?language=${targetLanguage}`
                );

                console.log('Translation response status:', response.status);

                if (response.ok) {
                    const translated = await response.json();
                    console.log('Translation successful:', translated);
                    setTranslatedQuiz(translated);
                } else {
                    const errorText = await response.text();
                    console.error('Translation failed:', response.status, errorText);
                    setTranslatedQuiz(null);
                }
            } catch (error) {
                console.error('Error fetching translated quiz:', error);
                setTranslatedQuiz(null);
            } finally {
                setIsTranslating(false);
            }
        };

        if (visible && quiz && selectedLanguage !== 'en') {
            fetchTranslatedQuiz(selectedLanguage);
        } else if (selectedLanguage === 'en') {
            setTranslatedQuiz(null);
        }
    }, [selectedLanguage, quiz?.id, visible]);

    // Filter languages based on search query
    const filteredLanguages = useMemo(() => {
        if (!languageSearch.trim()) {
            return Object.entries(QUIZ_LANGUAGES);
        }

        const search = languageSearch.toLowerCase();
        return Object.entries(QUIZ_LANGUAGES).filter(([code, name]) =>
            name.toLowerCase().includes(search) || code.toLowerCase().includes(search)
        );
    }, [languageSearch]);

    if (!visible || !quiz) return null;

    // Use translated quiz if available, otherwise use original
    const displayQuiz = translatedQuiz || quiz;

    const handleAnswer = (optionIndex) => {
        const newAnswers = [...answers];
        newAnswers[currentIndex] = optionIndex;
        setAnswers(newAnswers);

        if (currentIndex < displayQuiz.questions.length - 1) {
            setCurrentIndex(currentIndex + 1);
        }
    };

    const handleLanguageChange = (langCode) => {
        console.log('Language changed to:', langCode, QUIZ_LANGUAGES[langCode]);
        console.log('Mapped language name:', LANGUAGE_NAME_MAP[langCode]);
        setSelectedLanguage(langCode);
        setShowLanguageMenu(false);
        setLanguageSearch(''); // Reset search when selecting a language
    };

    const submitQuiz = async () => {
        try {
            // Always submit with original quiz ID (answers are in original indices)
            const formData = new FormData();
            formData.append('quiz_id', quiz.id || quiz.quiz_id || '');
            formData.append('user_name', userName);
            if (userEmail) formData.append('user_email', userEmail);
            formData.append('answers', JSON.stringify(answers));

            const response = await fetch(`${API_URL}/api/v1/quizzes/submit`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                // If endpoint fails (quiz not found, etc), calculate locally
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();
            setScore(result);
            setShowResult(true);
        } catch (error) {
            console.error("Error submitting quiz:", error);

            // Fallback: Calculate score locally if backend fails
            // Always use original quiz for scoring
            const questions = quiz.questions || [];
            let correctCount = 0;

            questions.forEach((q, idx) => {
                const userAnswerIdx = answers[idx];
                if (userAnswerIdx !== undefined) {
                    const options = q.options || [];
                    const selectedOption = options[userAnswerIdx];

                    // Check if option is correct (handle both formats)
                    if (typeof selectedOption === 'object' && selectedOption.correct) {
                        correctCount++;
                    } else if (q.correct_answer === userAnswerIdx || q.correctAnswer === userAnswerIdx) {
                        correctCount++;
                    }
                }
            });

            const total = questions.length;
            const percentage = total > 0 ? Math.round((correctCount / total) * 100) : 0;

            setScore({
                score: correctCount,
                total: total,
                percentage: percentage
            });
            setShowResult(true);
        }
    };

    const resetQuiz = () => {
        setCurrentIndex(0);
        setAnswers([]);
        setShowResult(false);
        setScore(null);
        setSelectedLanguage('en');
        setTranslatedQuiz(null);
        onClose();
    };

    if (showResult && score) {
        // Support both backend API format and local fallback format
        const displayScore = score.correct_count !== undefined ? score.correct_count : score.score;
        const displayTotal = score.total_questions !== undefined ? score.total_questions : score.total;
        const displayPercent = score.percentage !== undefined ? score.percentage : (score.score_percent !== undefined ? score.score_percent : score.score);

        return (
            <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
                <LinearGradient colors={['#1E293B', '#0F172A']} style={styles.container}>
                    <Text style={styles.resultTitle}>Quiz Complete!</Text>
                    <View style={styles.scoreCircle}>
                        <Text style={styles.scoreNumber}>{displayScore}/{displayTotal}</Text>
                        <Text style={styles.scorePercent}>{displayPercent}%</Text>
                    </View>
                    <TouchableOpacity style={styles.doneBtn} onPress={resetQuiz}>
                        <Text style={styles.doneBtnText}>Done</Text>
                    </TouchableOpacity>
                </LinearGradient>
            </Modal>
        );
    }

    const currentQuestion = displayQuiz.questions ? displayQuiz.questions[currentIndex] : null;
    if (!currentQuestion) return null;

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
            <LinearGradient colors={['#1E293B', '#0F172A']} style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={onClose}>
                        <Feather name="x" size={24} color="#FFF" />
                    </TouchableOpacity>
                    <Text style={styles.quizTitle}>{displayQuiz.title}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={styles.questionCounter}>
                            {currentIndex + 1}/{displayQuiz.questions.length}
                        </Text>
                        {/* Language Selector */}
                        <TouchableOpacity
                            style={styles.languageBtn}
                            onPress={() => setShowLanguageMenu(!showLanguageMenu)}
                        >
                            <MaterialIcons name="translate" size={20} color="#D71A21" />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Language Menu Dropdown with Search */}
                {showLanguageMenu && (
                    <View style={styles.languageMenu}>
                        {/* Search Bar */}
                        <View style={styles.searchContainer}>
                            <Feather name="search" size={16} color="#94A3B8" style={styles.searchIcon} />
                            <TextInput
                                style={styles.searchInput}
                                placeholder="Search languages..."
                                placeholderTextColor="#64748B"
                                value={languageSearch}
                                onChangeText={setLanguageSearch}
                                autoFocus={false}
                            />
                            {languageSearch.length > 0 && (
                                <TouchableOpacity onPress={() => setLanguageSearch('')}>
                                    <Feather name="x" size={16} color="#94A3B8" />
                                </TouchableOpacity>
                            )}
                        </View>

                        {/* Language List */}
                        <ScrollView style={styles.languageList} nestedScrollEnabled={true}>
                            {filteredLanguages.length > 0 ? (
                                filteredLanguages.map(([code, name]) => (
                                    <TouchableOpacity
                                        key={code}
                                        style={[
                                            styles.languageOption,
                                            selectedLanguage === code && styles.languageOptionSelected
                                        ]}
                                        onPress={() => handleLanguageChange(code)}
                                    >
                                        <Text style={[
                                            styles.languageOptionText,
                                            selectedLanguage === code && styles.languageOptionTextSelected
                                        ]}>
                                            {name}
                                        </Text>
                                        {selectedLanguage === code && (
                                            <Feather name="check" size={18} color="#D71A21" />
                                        )}
                                    </TouchableOpacity>
                                ))
                            ) : (
                                <View style={styles.noResultsContainer}>
                                    <Text style={styles.noResultsText}>No languages found</Text>
                                </View>
                            )}
                        </ScrollView>
                    </View>
                )}

                {/* Translation Loading Indicator */}
                {isTranslating && (
                    <View style={styles.translatingIndicator}>
                        <ActivityIndicator size="small" color="#D71A21" />
                        <Text style={styles.translatingText}>Translating quiz to {QUIZ_LANGUAGES[selectedLanguage]}...</Text>
                    </View>
                )}

                {/* Debug Info - Remove after testing */}
                {__DEV__ && (
                    <View style={{ padding: 10, backgroundColor: '#0F172A', marginHorizontal: 20, marginBottom: 10, borderRadius: 8 }}>
                        <Text style={{ color: '#94A3B8', fontSize: 10, fontFamily: 'Poppins_400Regular' }}>
                            Selected: {selectedLanguage} | Has Translation: {translatedQuiz ? 'Yes' : 'No'} | Translating: {isTranslating ? 'Yes' : 'No'}
                        </Text>
                        {translatedQuiz && (
                            <Text style={{ color: '#10B981', fontSize: 10, fontFamily: 'Poppins_400Regular' }}>
                                Translated to: {translatedQuiz.translated_to}
                            </Text>
                        )}
                    </View>
                )}

                {/* Progress Bar */}
                <View style={styles.progressBar}>
                    <View style={[styles.progressFill, { width: `${((currentIndex + 1) / displayQuiz.questions.length) * 100}%` }]} />
                </View>

                <ScrollView contentContainerStyle={styles.scrollContent}>
                    {/* Question */}
                    <Text style={styles.question}>{currentQuestion.question}</Text>

                    {/* Options */}
                    {currentQuestion.options.map((option, index) => {
                        // Handle both string options and object options {id, text}
                        const optionText = typeof option === 'object' ? option.text : option;

                        return (
                            <TouchableOpacity
                                key={index}
                                style={[
                                    styles.option,
                                    answers[currentIndex] === index && styles.optionSelected
                                ]}
                                onPress={() => handleAnswer(index)}
                                disabled={isTranslating}
                            >
                                <View style={styles.optionCircle}>
                                    {answers[currentIndex] === index && <View style={styles.optionDot} />}
                                </View>
                                <Text style={styles.optionText}>{optionText}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>

                {/* Footer Buttons */}
                <View style={styles.footer}>
                    {currentIndex > 0 && (
                        <TouchableOpacity
                            style={styles.backBtn}
                            onPress={() => setCurrentIndex(currentIndex - 1)}
                            disabled={isTranslating}
                        >
                            <Text style={styles.backBtnText}>Back</Text>
                        </TouchableOpacity>
                    )}
                    {currentIndex === displayQuiz.questions.length - 1 ? (
                        <TouchableOpacity
                            style={[styles.submitBtn, (answers.length !== displayQuiz.questions.length || isTranslating) && styles.submitBtnDisabled]}
                            onPress={submitQuiz}
                            disabled={answers.length !== displayQuiz.questions.length || isTranslating}
                        >
                            <Text style={styles.submitBtnText}>Submit Quiz</Text>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity
                            style={[styles.nextBtn, (answers[currentIndex] === undefined || isTranslating) && styles.nextBtnDisabled]}
                            onPress={() => setCurrentIndex(currentIndex + 1)}
                            disabled={answers[currentIndex] === undefined || isTranslating}
                        >
                            <Text style={styles.nextBtnText}>Next</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </LinearGradient>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingTop: 50
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16
    },
    quizTitle: {
        fontSize: 18,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
        flex: 1,
        textAlign: 'center',
        marginHorizontal: 16
    },
    questionCounter: {
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        color: '#94A3B8'
    },
    progressBar: {
        height: 4,
        backgroundColor: '#334155',
        marginHorizontal: 20,
        borderRadius: 2,
        overflow: 'hidden'
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#D71A21'
    },
    scrollContent: {
        padding: 20,
        paddingBottom: 100
    },
    question: {
        fontSize: 20,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
        marginBottom: 24,
        lineHeight: 28
    },
    option: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1E293B',
        borderWidth: 2,
        borderColor: '#334155',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12
    },
    optionSelected: {
        borderColor: '#D71A21',
        backgroundColor: 'rgba(245, 158, 11, 0.1)'
    },
    optionCircle: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: '#94A3B8',
        marginRight: 12,
        justifyContent: 'center',
        alignItems: 'center'
    },
    optionDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#D71A21'
    },
    optionText: {
        flex: 1,
        fontSize: 15,
        fontFamily: 'Poppins_400Regular',
        color: '#FFF'
    },
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        padding: 20,
        backgroundColor: '#0F172A'
    },
    backBtn: {
        flex: 1,
        paddingVertical: 16,
        borderRadius: 12,
        backgroundColor: '#334155',
        alignItems: 'center',
        marginRight: 10
    },
    backBtnText: {
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF'
    },
    nextBtn: {
        flex: 1,
        paddingVertical: 16,
        borderRadius: 12,
        backgroundColor: '#D71A21',
        alignItems: 'center'
    },
    nextBtnDisabled: {
        backgroundColor: '#64748B'
    },
    nextBtnText: {
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF'
    },
    submitBtn: {
        flex: 1,
        paddingVertical: 16,
        borderRadius: 12,
        backgroundColor: '#10B981',
        alignItems: 'center'
    },
    submitBtnDisabled: {
        backgroundColor: '#64748B'
    },
    submitBtnText: {
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF'
    },
    // Result Styles
    resultTitle: {
        fontSize: 28,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF',
        textAlign: 'center',
        marginTop: 40,
        marginBottom: 40
    },
    scoreCircle: {
        width: 200,
        height: 200,
        borderRadius: 100,
        backgroundColor: 'rgba(245, 158, 11, 0.2)',
        borderWidth: 8,
        borderColor: '#D71A21',
        justifyContent: 'center',
        alignItems: 'center',
        alignSelf: 'center',
        marginBottom: 40
    },
    scoreNumber: {
        fontSize: 48,
        fontFamily: 'Poppins_700Bold',
        color: '#FFF'
    },
    scorePercent: {
        fontSize: 20,
        fontFamily: 'Poppins_500Medium',
        color: '#94A3B8'
    },
    doneBtn: {
        marginHorizontal: 20,
        paddingVertical: 16,
        borderRadius: 12,
        backgroundColor: '#D71A21',
        alignItems: 'center'
    },
    doneBtnText: {
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF'
    },
    // Language Selector Styles
    languageBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(245, 158, 11, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(245, 158, 11, 0.3)'
    },
    languageMenu: {
        position: 'absolute',
        top: 90,
        right: 20,
        backgroundColor: '#1E293B',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#334155',
        minWidth: 280,
        maxWidth: 320,
        maxHeight: 400,
        zIndex: 1000,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#0F172A',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        margin: 12,
        borderWidth: 1,
        borderColor: '#334155'
    },
    searchIcon: {
        marginRight: 8
    },
    searchInput: {
        flex: 1,
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        color: '#E2E8F0',
        padding: 0
    },
    languageList: {
        maxHeight: 300
    },
    languageOption: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#1E293B'
    },
    languageOptionSelected: {
        backgroundColor: 'rgba(245, 158, 11, 0.1)'
    },
    languageOptionText: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        color: '#E2E8F0',
        flex: 1
    },
    languageOptionTextSelected: {
        fontFamily: 'Poppins_600SemiBold',
        color: '#D71A21'
    },
    noResultsContainer: {
        padding: 20,
        alignItems: 'center'
    },
    noResultsText: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        color: '#64748B'
    },
    translatingIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        paddingHorizontal: 16,
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        borderRadius: 8,
        marginHorizontal: 20,
        marginBottom: 8,
        gap: 8
    },
    translatingText: {
        fontSize: 13,
        fontFamily: 'Poppins_500Medium',
        color: '#D71A21'
    }
});
