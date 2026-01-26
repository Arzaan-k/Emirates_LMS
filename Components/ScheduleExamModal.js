import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    TextInput,
    ScrollView,
    Dimensions,
    ActivityIndicator,
    Alert,
    FlatList
} from 'react-native';
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import API_URL from '../config';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import * as XLSX from 'xlsx';

const { width, height } = Dimensions.get('window');

export default function ScheduleExamModal({ visible, onClose, userProfile }) {
    // Form State
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    // Date & Time State
    const [date, setDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [location, setLocation] = useState('');
    const [shift, setShift] = useState('Morning');
    const [supervisorEmail, setSupervisorEmail] = useState('');
    const [supervisorName, setSupervisorName] = useState('');
    const [timeLimit, setTimeLimit] = useState('30');
    const [passingScore, setPassingScore] = useState('70');

    // Users & Questions
    const [allUsers, setAllUsers] = useState([]);
    const [selectedUsers, setSelectedUsers] = useState([]);
    const [questions, setQuestions] = useState([]);
    const [loadingUsers, setLoadingUsers] = useState(false);

    // AI Generation
    const [aiTopic, setAiTopic] = useState('');
    const [aiNumQuestions, setAiNumQuestions] = useState('10');
    const [aiDifficulty, setAiDifficulty] = useState('Medium');
    const [generatingQuestions, setGeneratingQuestions] = useState(false);
    const [importingQuestions, setImportingQuestions] = useState(false);

    // UI State
    const [activeStep, setActiveStep] = useState(1); // 1: Details, 2: Users, 3: Questions, 4: Review
    const [searchQuery, setSearchQuery] = useState(''); // NEW
    const [filterRole, setFilterRole] = useState('All'); // NEW
    const [filterStore, setFilterStore] = useState('All'); // NEW
    const [allStores, setAllStores] = useState([]); // NEW
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (visible) {
            fetchUsers();
            fetchStores();
            // Default supervisor to self only if empty
            if (userProfile && !supervisorEmail) {
                setSupervisorEmail(userProfile.email || '');
                setSupervisorName(userProfile.name || '');
            }
        }
    }, [visible]);

    // NEW: Filter Logic
    const getFilteredUsers = () => {
        if (!allUsers) return [];
        return allUsers.filter(u => {
            const matchesSearch = !searchQuery ||
                (u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    u.email?.toLowerCase().includes(searchQuery.toLowerCase()));
            const matchesRole = filterRole === 'All' || u.role === filterRole || u.category === filterRole;
            const matchesStore = filterStore === 'All' || u.store_name === filterStore || u.store === filterStore;
            return matchesSearch && matchesRole && matchesStore;
        });
    };

    const fetchStores = async () => {
        try {
            const res = await fetch(`${API_URL}/stores`);
            const data = await res.json();
            if (Array.isArray(data)) setAllStores(data);
        } catch (e) {
            console.error("Error fetching stores:", e);
        }
    };

    const fetchUsers = async () => {
        setLoadingUsers(true);
        try {
            console.log("Fetching users for exam scheduling...");
            const res = await fetch(`${API_URL}/api/v1/users/list?limit=1000`);
            const data = await res.json();

            if (data && data.users) {
                console.log(`Fetched ${data.users.length} users`);
                setAllUsers(data.users);
            } else if (Array.isArray(data)) {
                setAllUsers(data);
            } else {
                console.error('Invalid user data:', data);
            }
        } catch (e) {
            console.error('Error fetching users:', e);
            Alert.alert('Error', 'Failed to fetch user list');
        }
        setLoadingUsers(false);
    };

    const toggleUserSelection = (email) => {
        if (selectedUsers.includes(email)) {
            setSelectedUsers(selectedUsers.filter(e => e !== email));
        } else {
            setSelectedUsers([...selectedUsers, email]);
        }
    };

    const generateQuestionsAI = async () => {
        if (!aiTopic.trim()) {
            Alert.alert('Error', 'Please enter a topic for question generation');
            return;
        }

        setGeneratingQuestions(true);
        try {
            const formData = new FormData();
            formData.append('topic', aiTopic);
            formData.append('num_questions', aiNumQuestions);
            formData.append('difficulty', aiDifficulty);

            const res = await fetch(`${API_URL}/scheduled-exams/temp/generate-questions`, {
                method: 'POST',
                body: formData
            });

            // Fallback to direct generation endpoint
            const directRes = await fetch(`${API_URL}/generate-quiz-from-topic`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    topic: aiTopic,
                    num_questions: parseInt(aiNumQuestions),
                    difficulty: aiDifficulty
                })
            });

            if (directRes.ok) {
                const data = await directRes.json();
                if (data.questions) {
                    setQuestions(data.questions);
                    Alert.alert('Success', `Generated ${data.questions.length} questions!`);
                }
            } else {
                // Manual fallback
                Alert.alert('Note', 'AI generation not available. Please add questions manually.');
            }
        } catch (e) {
            console.error('Error generating questions:', e);
            Alert.alert('Error', 'Failed to generate questions. Please add manually.');
        }
        setGeneratingQuestions(false);
    };

    const addManualQuestion = () => {
        setQuestions([...questions, {
            question: '',
            options: ['', '', '', ''],
            correctIndex: 0
        }]);
    };

    const updateQuestion = (index, field, value) => {
        const updated = [...questions];
        if (field === 'question') {
            updated[index].question = value;
        } else if (field.startsWith('option_')) {
            const optIndex = parseInt(field.split('_')[1]);
            updated[index].options[optIndex] = value;
        } else if (field === 'correctIndex') {
            updated[index].correctIndex = value;
        }
        setQuestions(updated);
    };

    const removeQuestion = (index) => {
        setQuestions(questions.filter((_, i) => i !== index));
    };

    const handleSubmit = async () => {
        // Validation
        if (!title.trim()) {
            Alert.alert('Error', 'Please enter an exam title');
            return;
        }
        if (!location.trim()) {
            Alert.alert('Error', 'Please enter exam location');
            return;
        }
        if (selectedUsers.length === 0) {
            Alert.alert('Error', 'Please select at least one user');
            return;
        }
        if (questions.length === 0) {
            Alert.alert('Error', 'Please add at least one question');
            return;
        }

        setSubmitting(true);
        try {
            const formData = new FormData();
            formData.append('title', title);
            formData.append('description', description);
            formData.append('exam_date', getFormattedDate());
            formData.append('exam_time', getFormattedTime());
            formData.append('location', location);
            formData.append('shift', shift);
            formData.append('supervisor_email', supervisorEmail);
            formData.append('supervisor_name', supervisorName);
            formData.append('assigned_users', JSON.stringify(selectedUsers));
            formData.append('questions', JSON.stringify(questions));
            formData.append('time_limit_minutes', timeLimit);
            formData.append('passing_score', passingScore);
            formData.append('created_by', userProfile?.email || 'admin');

            const res = await fetch(`${API_URL}/scheduled-exams`, {
                method: 'POST',
                body: formData
            });

            const data = await res.json();

            if (data.status === 'success') {
                Alert.alert('Success', `Exam "${title}" scheduled successfully! Notifications sent to ${selectedUsers.length} users.`);
                resetForm();
                onClose();
            } else {
                Alert.alert('Error', data.detail || 'Failed to schedule exam');
            }
        } catch (e) {
            console.error('Error scheduling exam:', e);
            Alert.alert('Error', 'Network error. Please try again.');
        }
        setSubmitting(false);
    };

    const resetForm = () => {
        setTitle('');
        setDescription('');
        setDate(new Date());
        setLocation('');
        setShift('Morning');
        setSelectedUsers([]);
        setQuestions([]);
        setActiveStep(1);
    };

    const onDateChange = (event, selectedDate) => {
        if (event.type === 'dismissed') {
            setShowDatePicker(false);
            setShowTimePicker(false);
            return;
        }

        const currentDate = selectedDate || date;
        if (showDatePicker) setShowDatePicker(false);
        if (showTimePicker) setShowTimePicker(false);
        setDate(currentDate);
    };

    const getFormattedDate = () => {
        // Use local time, not UTC (toISOString)
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const getFormattedTime = () => {
        const d = new Date(date);
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    };

    const loadSampleQuestions = () => {
        const samples = [
            { question: "What is the primary goal of workplace safety?", options: ["Efficiency", "Speed", "Zero Harm", "Profit"], correctIndex: 2 },
            { question: "Which fire extinguisher is used for electrical fires?", options: ["Water", "CO2", "Foam", "Wet Chemical"], correctIndex: 1 },
            { question: "What does PPE stand for?", options: ["Personal Protective Equipment", "Public Property Enforcement", "Private Profit Estimation", "None"], correctIndex: 0 },
            { question: "How often should you take a break when working at a computer?", options: ["Every hour", "Every 4 hours", "Once a day", "Never"], correctIndex: 0 },
            { question: "Who is responsible for safety?", options: ["Manager only", "Safety Officer", "Everyone", "CEO"], correctIndex: 2 }
        ];
        setQuestions([...questions, ...samples]);
        Alert.alert('Success', 'Loaded 5 sample questions.');
    };

    const importExcel = async () => {
        try {
            setImportingQuestions(true);
            const result = await DocumentPicker.getDocumentAsync({
                type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv'],
                copyToCacheDirectory: true
            });

            if (result.canceled) {
                setImportingQuestions(false);
                return;
            }

            const asset = result.assets[0];
            const response = await fetch(asset.uri);
            const blob = await response.blob();
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheetName = workbook.SheetNames[0];
                    const sheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(sheet);

                    // Parse questions
                    const newQuestions = jsonData.map(row => ({
                        question: row.Question || row.question || "Untitled Question",
                        options: [
                            row.Option1 || row.option1 || "",
                            row.Option2 || row.option2 || "",
                            row.Option3 || row.option3 || "",
                            row.Option4 || row.option4 || ""
                        ],
                        correctIndex: (row.CorrectAnswer || row.correct_index || 1) - 1 // Assume 1-based index in Excel
                    }));

                    if (newQuestions.length > 0) {
                        setQuestions([...questions, ...newQuestions]);
                        Alert.alert('Success', `Imported ${newQuestions.length} questions from Excel.`);
                    } else {
                        Alert.alert('Error', 'No valid questions found in Excel. Columns should be: Question, Option1, Option2, Option3, Option4, CorrectAnswer');
                    }
                } catch (parseError) {
                    console.error('Parse Error', parseError);
                    Alert.alert('Error', 'Failed to parse Excel file.');
                }
                setImportingQuestions(false);
            };

            reader.readAsArrayBuffer(blob);

        } catch (e) {
            console.error('Import Error', e);
            Alert.alert('Error', 'Failed to import file.');
            setImportingQuestions(false);
        }
    };

    if (!visible) return null;

    const renderStep1 = () => (
        <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.stepTitle}>Exam Details</Text>

            <Text style={styles.inputLabel}>Title *</Text>
            <TextInput
                style={styles.input}
                placeholder="e.g. Q1 Performance Assessment"
                value={title}
                onChangeText={setTitle}
            />

            <Text style={styles.inputLabel}>Description</Text>
            <TextInput
                style={[styles.input, { height: 80 }]}
                placeholder="Brief description of the exam..."
                value={description}
                onChangeText={setDescription}
                multiline
            />

            <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={styles.inputLabel}>Date *</Text>
                    <TouchableOpacity
                        style={styles.pickerBtn}
                        onPress={() => setShowDatePicker(true)}
                    >
                        <Feather name="calendar" size={18} color="#6366F1" />
                        <Text style={styles.pickerBtnText}>{getFormattedDate()}</Text>
                    </TouchableOpacity>
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Time *</Text>
                    <TouchableOpacity
                        style={styles.pickerBtn}
                        onPress={() => setShowTimePicker(true)}
                    >
                        <Feather name="clock" size={18} color="#6366F1" />
                        <Text style={styles.pickerBtnText}>{getFormattedTime()}</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {(showDatePicker || showTimePicker) && (
                <DateTimePicker
                    value={date}
                    mode={showDatePicker ? 'date' : 'time'}
                    display="default"
                    onChange={onDateChange}
                    minimumDate={new Date()}
                />
            )}

            <Text style={styles.inputLabel}>Location *</Text>
            <TextInput
                style={styles.input}
                placeholder="e.g. Training Room, Mumbai HQ"
                value={location}
                onChangeText={setLocation}
            />

            {/* Supervisor Selection */}
            <Text style={styles.inputLabel}>Assign Supervisor *</Text>
            <View style={styles.pickerContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.supervisorList}>
                    {allUsers
                        .filter(u => ['Manager', 'Supervisor', 'Super Admin'].includes(u.category) || u.role === 'Supervisor' || u.is_superadmin)
                        .map(u => (
                            <TouchableOpacity
                                key={u.email}
                                style={[styles.supervisorChip, supervisorEmail === u.email && styles.supervisorChipActive]}
                                onPress={() => {
                                    setSupervisorEmail(u.email);
                                    setSupervisorName(u.name);
                                }}
                            >
                                <View style={[styles.avatarSmall, { backgroundColor: u.category === 'Manager' ? '#EF4444' : '#10B981' }]}>
                                    <Text style={styles.avatarTextSmall}>{u.name?.charAt(0)}</Text>
                                </View>
                                <Text style={[styles.supervisorName, supervisorEmail === u.email && styles.supervisorNameActive]}>
                                    {u.name}
                                </Text>
                            </TouchableOpacity>
                        ))}
                </ScrollView>
                {(!supervisorEmail) && <Text style={styles.helperText}>Select a supervisor to proctor this exam.</Text>}
            </View>

            <Text style={styles.inputLabel}>Shift</Text>
            <View style={styles.shiftRow}>
                {['Morning', 'Afternoon', 'Evening'].map(s => (
                    <TouchableOpacity
                        key={s}
                        style={[styles.shiftBtn, shift === s && styles.shiftBtnActive]}
                        onPress={() => setShift(s)}
                    >
                        <Text style={[styles.shiftText, shift === s && styles.shiftTextActive]}>{s}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={styles.inputLabel}>Time Limit (min)</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="30"
                        value={timeLimit}
                        onChangeText={setTimeLimit}
                        keyboardType="numeric"
                    />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Passing Score (%)</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="70"
                        value={passingScore}
                        onChangeText={setPassingScore}
                        keyboardType="numeric"
                    />
                </View>
            </View>
        </ScrollView>
    );

    const renderStep2 = () => (
        <View style={{ flex: 1 }}>
            <Text style={styles.stepTitle}>Select Participants</Text>

            {/* [NEW] SEARCH & FILTERS */}
            <View style={styles.filterContainer}>
                <View style={styles.searchBox}>
                    <Feather name="search" size={18} color="#9CA3AF" />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search users..."
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
                    <Text style={styles.filterLabel}>Role:</Text>
                    {['All', 'Employee', 'Supervisor', 'Manager'].map(role => (
                        <TouchableOpacity
                            key={role}
                            style={[styles.filterChip, filterRole === role && styles.filterChipActive]}
                            onPress={() => setFilterRole(role)}
                        >
                            <Text style={[styles.filterText, filterRole === role && styles.filterTextActive]}>{role}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                {allStores.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                        <Text style={styles.filterLabel}>Store:</Text>
                        {['All', ...allStores.map(s => s.name)].map(store => (
                            <TouchableOpacity
                                key={store}
                                style={[styles.filterChip, filterStore === store && styles.filterChipActive]}
                                onPress={() => setFilterStore(store)}
                            >
                                <Text style={[styles.filterText, filterStore === store && styles.filterTextActive]}>{store}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                )}
            </View>

            <Text style={styles.stepSubtitle}>{selectedUsers.length} users selected</Text>

            {loadingUsers ? (
                <ActivityIndicator size="large" color="#6366F1" style={{ marginTop: 40 }} />
            ) : (
                <FlatList
                    data={getFilteredUsers()}
                    keyExtractor={item => item.email}
                    showsVerticalScrollIndicator={false}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            style={[styles.userItem, selectedUsers.includes(item.email) && styles.userItemSelected]}
                            onPress={() => toggleUserSelection(item.email)}
                        >
                            <View style={styles.userAvatar}>
                                <Text style={styles.userAvatarText}>{item.name?.charAt(0) || '?'}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.userName}>{item.name}</Text>
                                <Text style={styles.userEmail}>{item.email}</Text>
                            </View>
                            <View style={[styles.checkbox, selectedUsers.includes(item.email) && styles.checkboxChecked]}>
                                {selectedUsers.includes(item.email) && (
                                    <Feather name="check" size={14} color="#FFF" />
                                )}
                            </View>
                        </TouchableOpacity>
                    )}
                    ListEmptyComponent={
                        <Text style={styles.emptyText}>No users found</Text>
                    }
                />
            )}

            <TouchableOpacity
                style={styles.selectAllBtn}
                onPress={() => {
                    const filtered = getFilteredUsers();
                    if (filtered.length > 0 && filtered.every(u => selectedUsers.includes(u.email))) {
                        // Deselect all visible
                        setSelectedUsers(selectedUsers.filter(email => !filtered.find(u => u.email === email)));
                    } else {
                        // Select all visible
                        const newSelected = new Set([...selectedUsers, ...filtered.map(u => u.email)]);
                        setSelectedUsers(Array.from(newSelected));
                    }
                }}
            >
                <Feather name="check-square" size={18} color="#6366F1" />
                <Text style={styles.selectAllText}>
                    Select All Visible
                </Text>
            </TouchableOpacity>
        </View>
    );

    const renderStep3 = () => (
        <View style={{ flex: 1 }}>
            <Text style={styles.stepTitle}>Questions ({questions.length})</Text>

            {/* AI Generation */}
            <View style={styles.aiBox}>
                <View style={styles.aiHeader}>
                    <MaterialCommunityIcons name="robot" size={20} color="#8B5CF6" />
                    <Text style={styles.aiTitle}>Generate with AI</Text>
                </View>
                <TextInput
                    style={styles.input}
                    placeholder="Topic (e.g. Food Safety Standards)"
                    value={aiTopic}
                    onChangeText={setAiTopic}
                />
                <View style={styles.row}>
                    <TextInput
                        style={[styles.input, { flex: 1, marginRight: 10 }]}
                        placeholder="# Questions"
                        value={aiNumQuestions}
                        onChangeText={setAiNumQuestions}
                        keyboardType="numeric"
                    />
                    <TouchableOpacity
                        style={styles.generateBtn}
                        onPress={generateQuestionsAI}
                        disabled={generatingQuestions}
                    >
                        {generatingQuestions ? (
                            <ActivityIndicator color="#FFF" size="small" />
                        ) : (
                            <>
                                <MaterialCommunityIcons name="auto-fix" size={18} color="#FFF" />
                                <Text style={styles.generateBtnText}>Generate</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            </View>

            {/* Import Options */}
            <View style={[styles.row, { marginBottom: 16, flexWrap: 'wrap' }]}>
                <TouchableOpacity
                    style={[styles.actionBtn, { flex: 1, minWidth: '30%', marginRight: 4, backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}
                    onPress={loadSampleQuestions}
                >
                    <MaterialCommunityIcons name="playlist-plus" size={18} color="#059669" />
                    <Text style={[styles.actionBtnText, { color: '#059669', fontSize: 12 }]}>Load Sample</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.actionBtn, { flex: 1, minWidth: '30%', marginHorizontal: 4, backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}
                    onPress={() => {
                        Alert.alert(
                            "Excel Format Guide",
                            "Your Excel file should have no headers and follow this column order:\n\n" +
                            "Col 1: Question Text\n" +
                            "Col 2: Option 1\n" +
                            "Col 3: Option 2\n" +
                            "Col 4: Option 3\n" +
                            "Col 5: Option 4\n" +
                            "Col 6: Correct Option Index (0-3)\n\n" +
                            "Example:\n" +
                            "What is 2+2? | 3 | 4 | 5 | 6 | 1",
                            [{ text: "Got it" }]
                        );
                    }}
                >
                    <MaterialCommunityIcons name="information-outline" size={18} color="#2563EB" />
                    <Text style={[styles.actionBtnText, { color: '#2563EB', fontSize: 12 }]}>View Format</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.actionBtn, { flex: 1, minWidth: '30%', marginLeft: 4, backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}
                    onPress={importExcel}
                    disabled={importingQuestions}
                >
                    {importingQuestions ? (
                        <ActivityIndicator color="#D97706" size="small" />
                    ) : (
                        <>
                            <MaterialCommunityIcons name="file-excel-box" size={18} color="#D97706" />
                            <Text style={[styles.actionBtnText, { color: '#D97706', fontSize: 12 }]}>Import Excel</Text>
                        </>
                    )}
                </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                {questions.map((q, idx) => (
                    <View key={idx} style={styles.questionCard}>
                        <View style={styles.questionHeader}>
                            <Text style={styles.questionNum}>Q{idx + 1}</Text>
                            <TouchableOpacity onPress={() => removeQuestion(idx)}>
                                <Feather name="trash-2" size={18} color="#EF4444" />
                            </TouchableOpacity>
                        </View>
                        <TextInput
                            style={[styles.input, { marginBottom: 8 }]}
                            placeholder="Question text..."
                            value={q.question}
                            onChangeText={(v) => updateQuestion(idx, 'question', v)}
                        />
                        {q.options.map((opt, oi) => (
                            <View key={oi} style={styles.optionRow}>
                                <TouchableOpacity
                                    style={[styles.optionRadio, q.correctIndex === oi && styles.optionRadioSelected]}
                                    onPress={() => updateQuestion(idx, 'correctIndex', oi)}
                                >
                                    {q.correctIndex === oi && <View style={styles.optionRadioInner} />}
                                </TouchableOpacity>
                                <TextInput
                                    style={[styles.input, { flex: 1, marginBottom: 0 }]}
                                    placeholder={`Option ${oi + 1}`}
                                    value={opt}
                                    onChangeText={(v) => updateQuestion(idx, `option_${oi}`, v)}
                                />
                            </View>
                        ))}
                    </View>
                ))}

                <TouchableOpacity style={styles.addQuestionBtn} onPress={addManualQuestion}>
                    <Feather name="plus" size={20} color="#6366F1" />
                    <Text style={styles.addQuestionText}>Add Question Manually</Text>
                </TouchableOpacity>

                <View style={{ height: 100 }} />
            </ScrollView>
        </View>
    );

    const renderStep4 = () => (
        <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.stepTitle}>Review & Schedule</Text>

            <View style={styles.reviewCard}>
                <View style={styles.reviewRow}>
                    <Feather name="file-text" size={18} color="#6B7280" />
                    <Text style={styles.reviewLabel}>Title:</Text>
                    <Text style={styles.reviewValue}>{title || 'Not set'}</Text>
                </View>
                <View style={styles.reviewRow}>
                    <Feather name="calendar" size={18} color="#6B7280" />
                    <Text style={styles.reviewLabel}>Date:</Text>
                    <Text style={styles.reviewValue}>{getFormattedDate()} at {getFormattedTime()}</Text>
                </View>
                <View style={styles.reviewRow}>
                    <Feather name="map-pin" size={18} color="#6B7280" />
                    <Text style={styles.reviewLabel}>Location:</Text>
                    <Text style={styles.reviewValue}>{location}</Text>
                </View>
                <View style={styles.reviewRow}>
                    <Feather name="clock" size={18} color="#6B7280" />
                    <Text style={styles.reviewLabel}>Shift:</Text>
                    <Text style={styles.reviewValue}>{shift}</Text>
                </View>
                <View style={styles.reviewRow}>
                    <Feather name="users" size={18} color="#6B7280" />
                    <Text style={styles.reviewLabel}>Participants:</Text>
                    <Text style={styles.reviewValue}>{selectedUsers.length} users</Text>
                </View>
                <View style={styles.reviewRow}>
                    <Feather name="help-circle" size={18} color="#6B7280" />
                    <Text style={styles.reviewLabel}>Questions:</Text>
                    <Text style={styles.reviewValue}>{questions.length}</Text>
                </View>
                <View style={styles.reviewRow}>
                    <Feather name="clock" size={18} color="#6B7280" />
                    <Text style={styles.reviewLabel}>Time Limit:</Text>
                    <Text style={styles.reviewValue}>{timeLimit} minutes</Text>
                </View>
                <View style={styles.reviewRow}>
                    <Feather name="percent" size={18} color="#6B7280" />
                    <Text style={styles.reviewLabel}>Pass Score:</Text>
                    <Text style={styles.reviewValue}>{passingScore}%</Text>
                </View>
            </View>

            <Text style={styles.noteText}>
                📢 Notifications will be sent to all selected participants with exam details.
            </Text>
        </ScrollView>
    );

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View style={styles.overlay}>
                <BlurView intensity={20} style={StyleSheet.absoluteFill} />
                <View style={styles.container}>
                    {/* Header */}
                    <LinearGradient
                        colors={['#6366F1', '#4F46E5']}
                        style={styles.header}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    >
                        <View style={styles.headerTop}>
                            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                                <Feather name="x" size={22} color="#FFF" />
                            </TouchableOpacity>
                            <View style={styles.headerTitleRow}>
                                <MaterialCommunityIcons name="calendar-clock" size={24} color="#FFF" />
                                <Text style={styles.headerTitle}>Schedule Exam</Text>
                            </View>
                            <View style={{ width: 40 }} />
                        </View>

                        {/* Steps Indicator */}
                        <View style={styles.stepsRow}>
                            {['Details', 'Users', 'Questions', 'Review'].map((step, idx) => (
                                <TouchableOpacity
                                    key={idx}
                                    style={[styles.stepIndicator, activeStep === idx + 1 && styles.stepIndicatorActive]}
                                    onPress={() => setActiveStep(idx + 1)}
                                >
                                    <Text style={[styles.stepNum, activeStep === idx + 1 && styles.stepNumActive]}>
                                        {idx + 1}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </LinearGradient>

                    {/* Content */}
                    <View style={styles.content}>
                        {activeStep === 1 && renderStep1()}
                        {activeStep === 2 && renderStep2()}
                        {activeStep === 3 && renderStep3()}
                        {activeStep === 4 && renderStep4()}
                    </View>

                    {/* Footer */}
                    <View style={styles.footer}>
                        {activeStep > 1 && (
                            <TouchableOpacity
                                style={styles.backBtn}
                                onPress={() => setActiveStep(activeStep - 1)}
                            >
                                <Feather name="arrow-left" size={20} color="#6366F1" />
                                <Text style={styles.backBtnText}>Back</Text>
                            </TouchableOpacity>
                        )}

                        {activeStep < 4 ? (
                            <TouchableOpacity
                                style={styles.nextBtn}
                                onPress={() => setActiveStep(activeStep + 1)}
                            >
                                <Text style={styles.nextBtnText}>Next</Text>
                                <Feather name="arrow-right" size={20} color="#FFF" />
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity
                                style={[styles.nextBtn, { backgroundColor: '#10B981' }]}
                                onPress={handleSubmit}
                                disabled={submitting}
                            >
                                {submitting ? (
                                    <ActivityIndicator color="#FFF" />
                                ) : (
                                    <>
                                        <MaterialCommunityIcons name="calendar-check" size={20} color="#FFF" />
                                        <Text style={styles.nextBtnText}>Schedule Exam</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    container: { height: height * 0.92, backgroundColor: '#F9FAFB', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
    header: { paddingTop: 20, paddingBottom: 16, paddingHorizontal: 20 },
    headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
    closeBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
    headerTitleRow: { flexDirection: 'row', alignItems: 'center' },
    headerTitle: { fontSize: 18, fontFamily: 'Poppins_700Bold', color: '#FFF', marginLeft: 10 },
    stepsRow: { flexDirection: 'row', justifyContent: 'center', gap: 12 },
    stepIndicator: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
    stepIndicatorActive: { backgroundColor: '#FFF' },
    stepNum: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: 'rgba(255,255,255,0.7)' },
    stepNumActive: { color: '#6366F1' },
    content: { flex: 1, padding: 20 },
    stepTitle: { fontSize: 18, fontFamily: 'Poppins_700Bold', color: '#111827', marginBottom: 4 },
    stepSubtitle: { fontSize: 13, fontFamily: 'Poppins_400Regular', color: '#6B7280', marginBottom: 16 },
    inputLabel: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: '#374151', marginBottom: 6, marginTop: 12 },
    input: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 14, fontSize: 14, fontFamily: 'Poppins_400Regular', color: '#111827' },
    row: { flexDirection: 'row' },
    shiftRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
    shiftBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#F3F4F6', alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB' },
    shiftBtnActive: { backgroundColor: '#EEF2FF', borderColor: '#6366F1' },
    shiftText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: '#6B7280' },
    shiftTextActive: { color: '#6366F1' },
    // Users
    userItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 14, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#E5E7EB' },
    userItemSelected: { borderColor: '#6366F1', backgroundColor: '#EEF2FF' },
    userAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    userAvatarText: { fontSize: 16, fontFamily: 'Poppins_700Bold', color: '#6B7280' },
    userName: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: '#111827' },
    userEmail: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: '#6B7280' },
    checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#D1D5DB', justifyContent: 'center', alignItems: 'center' },
    checkboxChecked: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
    selectAllBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, marginTop: 8 },
    selectAllText: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: '#6366F1', marginLeft: 8 },
    emptyText: { textAlign: 'center', color: '#6B7280', marginTop: 40, fontFamily: 'Poppins_400Regular' },
    // AI Box
    aiBox: { backgroundColor: '#F5F3FF', borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#DDD6FE' },
    aiHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    aiTitle: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: '#7C3AED', marginLeft: 8 },
    generateBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#8B5CF6', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, gap: 6 },
    generateBtnText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: '#FFF' },
    // Questions
    questionCard: { backgroundColor: '#FFF', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#E5E7EB' },
    questionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    questionNum: { fontSize: 13, fontFamily: 'Poppins_700Bold', color: '#6366F1' },
    optionRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 10 },
    optionRadio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#D1D5DB', justifyContent: 'center', alignItems: 'center' },
    optionRadioSelected: { borderColor: '#10B981' },
    optionRadioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#10B981' },
    addQuestionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, backgroundColor: '#EEF2FF', borderRadius: 12, borderWidth: 1, borderColor: '#C7D2FE', borderStyle: 'dashed', marginTop: 8 },
    addQuestionText: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: '#6366F1', marginLeft: 8 },
    // Review
    reviewCard: { backgroundColor: '#FFF', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#E5E7EB' },
    reviewRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    reviewLabel: { fontSize: 13, fontFamily: 'Poppins_500Medium', color: '#6B7280', marginLeft: 10, width: 100 },
    reviewValue: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: '#111827', flex: 1 },
    noteText: { fontSize: 13, fontFamily: 'Poppins_400Regular', color: '#6B7280', marginTop: 16, textAlign: 'center', lineHeight: 20 },
    // Footer
    footer: { flexDirection: 'row', padding: 20, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#E5E7EB', gap: 12 },
    backBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 12, backgroundColor: '#EEF2FF', gap: 6 },
    backBtnText: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: '#6366F1' },
    nextBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 12, backgroundColor: '#6366F1', gap: 6 },
    nextBtnText: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: '#FFF' },
    // Pickers
    pickerBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 14, gap: 10 },
    pickerBtnText: { fontSize: 14, fontFamily: 'Poppins_500Medium', color: '#111827' },
    // Actions
    actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 10, borderWidth: 1, gap: 6 },
    actionBtnText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },

    // [NEW] Filters & Search
    filterContainer: { marginBottom: 16 },
    searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 12, height: 46 },
    searchInput: { flex: 1, marginLeft: 10, fontSize: 14, fontFamily: 'Poppins_400Regular', color: '#111827' },
    filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E5E7EB', marginRight: 8 },
    filterChipActive: { backgroundColor: '#EEF2FF', borderColor: '#6366F1' },
    filterText: { fontSize: 13, fontFamily: 'Poppins_500Medium', color: '#6B7280' },
    filterTextActive: { color: '#6366F1' },

    // [NEW] Supervisor Picker
    pickerContainer: { marginTop: 6, marginBottom: 16 },
    supervisorList: { flexDirection: 'row', paddingVertical: 4 },
    supervisorChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 8, paddingRight: 16, borderRadius: 30, borderWidth: 1, borderColor: '#E5E7EB', marginRight: 10 },
    supervisorChipActive: { backgroundColor: '#ECFDF5', borderColor: '#10B981' },
    avatarSmall: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
    avatarTextSmall: { fontSize: 13, fontFamily: 'Poppins_700Bold', color: '#FFF' },
    supervisorName: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: '#374151' },
    supervisorNameActive: { color: '#059669' },
    helperText: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: '#9CA3AF', marginTop: 4, fontStyle: 'italic' },
    filterLabel: { fontSize: 12, fontFamily: 'Poppins_500Medium', color: '#6B7280', alignSelf: 'center', marginRight: 8 },
});
