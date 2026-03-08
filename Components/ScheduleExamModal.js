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
    FlatList,
    Platform
} from 'react-native';
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import API_URL from '../config';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import * as XLSX from 'xlsx';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');

export default function ScheduleExamModal({ visible, onClose, userProfile, editingExam = null }) {
    // Edit Mode Detection
    const isEditMode = !!editingExam;

    // Form State
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    // Date & Time State
    const [date, setDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [location, setLocation] = useState('');
    const [supervisorEmail, setSupervisorEmail] = useState('');

    // Batch System State
    const [numberOfBatches, setNumberOfBatches] = useState(1);
    const [batchAssignments, setBatchAssignments] = useState([]);
    const [showBatchDropdown, setShowBatchDropdown] = useState(false);
    const [usersPerBatch, setUsersPerBatch] = useState(''); // Empty = auto-calculate
    const [editingBatchIndex, setEditingBatchIndex] = useState(null);
    const [showBatchEditModal, setShowBatchEditModal] = useState(false);
    const [supervisorName, setSupervisorName] = useState('');
    const [timeLimit, setTimeLimit] = useState('30');
    const [passingScore, setPassingScore] = useState('70');

    // Users & Questions
    const [allUsers, setAllUsers] = useState([]);
    const [selectedUsers, setSelectedUsers] = useState([]);
    const [questions, setQuestions] = useState([]);
    const [loadingUsers, setLoadingUsers] = useState(false);

    // Smart Categories
    const [smartCategories, setSmartCategories] = useState([]);
    const [selectedCategories, setSelectedCategories] = useState([]);
    const [loadingCategories, setLoadingCategories] = useState(false);

    // Bulk Upload
    const [uploadedFileName, setUploadedFileName] = useState('');
    const [uploadedUsersCount, setUploadedUsersCount] = useState(0);
    const [processingUpload, setProcessingUpload] = useState(false);

    // AI Generation
    const [aiTopic, setAiTopic] = useState('');
    const [aiNumQuestions, setAiNumQuestions] = useState('10');
    const [aiDifficulty, setAiDifficulty] = useState('Medium');
    const [generatingQuestions, setGeneratingQuestions] = useState(false);
    const [importingQuestions, setImportingQuestions] = useState(false);

    // Enhanced Features State (NEW)
    const [examStatus, setExamStatus] = useState('published'); // 'draft' or 'published'
    const [scheduledPublishAt, setScheduledPublishAt] = useState(null);
    const [showScheduledPublishPicker, setShowScheduledPublishPicker] = useState(false);
    const [randomizeQuestions, setRandomizeQuestions] = useState(false);
    const [randomizeOptions, setRandomizeOptions] = useState(false);
    const [allowDifferentQuestions, setAllowDifferentQuestions] = useState(false);

    // Geofencing State
    const [geofencingEnabled, setGeofencingEnabled] = useState(false);
    const [geofencingRadius, setGeofencingRadius] = useState('100'); // meters

    // PIN Check-in State
    const [pinEnabled, setPinEnabled] = useState(false);
    const [pinGenerationMinutes, setPinGenerationMinutes] = useState('5'); // minutes before exam
    const [pinValidityMinutes, setPinValidityMinutes] = useState('30'); // PIN valid for X minutes

    // UI State
    const [activeStep, setActiveStep] = useState(1); // 1: Details, 2: Users, 3: Questions, 4: Review
    const [searchQuery, setSearchQuery] = useState(''); // NEW
    const [filterRole, setFilterRole] = useState('All'); // NEW
    const [filterStore, setFilterStore] = useState('All'); // NEW
    const [allStores, setAllStores] = useState([]); // NEW
    const [submitting, setSubmitting] = useState(false);

    const normalizeUserEmail = (value) => {
        if (!value) return '';
        if (typeof value === 'string') return value.trim();
        if (typeof value === 'object') {
            return String(value.email || value.user_email || value.userEmail || '').trim();
        }
        return '';
    };

    useEffect(() => {
        if (visible) {
            fetchUsers();
            fetchStores();
            fetchSmartCategories();

            // Edit Mode: Populate form with existing data
            if (isEditMode && editingExam) {
                console.log('[ScheduleExamModal] Loading exam for edit:', editingExam);

                // Basic Info
                setTitle(editingExam.title || '');
                setDescription(editingExam.description || '');
                setLocation(editingExam.location || '');
                setTimeLimit(String(editingExam.time_limit_minutes || 30));
                setPassingScore(String(editingExam.passing_score || 70));

                // Supervisor
                setSupervisorEmail(editingExam.supervisor_email || '');
                setSupervisorName(editingExam.supervisor_name || '');

                // Date & Time
                try {
                    const examDateTime = new Date(`${editingExam.exam_date} ${editingExam.exam_time}`);
                    if (!isNaN(examDateTime.getTime())) {
                        setDate(examDateTime);
                    }
                } catch (e) {
                    console.error('[ScheduleExamModal] Error parsing date:', e);
                }

                // Questions
                if (editingExam.questions && Array.isArray(editingExam.questions)) {
                    setQuestions(editingExam.questions);
                }

                // Users
                if (editingExam.assigned_users && Array.isArray(editingExam.assigned_users)) {
                    const normalizedUsers = editingExam.assigned_users
                        .map(normalizeUserEmail)
                        .filter(Boolean);
                    setSelectedUsers([...new Set(normalizedUsers)]);
                }

                // Randomization
                setRandomizeQuestions(editingExam.randomize_question_order || editingExam.randomizeQuestionOrder || false);
                setRandomizeOptions(editingExam.randomize_option_order || editingExam.randomizeOptionOrder || false);
                setAllowDifferentQuestions(
                    editingExam.allow_different_questions_per_batch ||
                    editingExam.allowDifferentQuestionsPerBatch ||
                    false
                );

                // Status
                setExamStatus(editingExam.exam_status || editingExam.examStatus || 'published');
                const publishAt = editingExam.scheduled_publish_at || editingExam.scheduledPublishAt;
                if (publishAt) {
                    setScheduledPublishAt(new Date(publishAt));
                }

                // PIN Settings
                setPinEnabled(editingExam.pin_enabled || editingExam.pinEnabled || false);
                setPinGenerationMinutes(String(editingExam.pin_generation_minutes || editingExam.pinGenerationMinutes || 5));
                setPinValidityMinutes(String(editingExam.pin_validity_minutes || editingExam.pinValidityMinutes || 30));

                // Geofencing
                setGeofencingEnabled(editingExam.geofencing_enabled || editingExam.geofencingEnabled || false);
                setGeofencingRadius(String(editingExam.geofencing_radius || editingExam.geofencingRadius || 100));

                // Batch Data (if exists)
                const existingBatches =
                    editingExam.batch_assignments ||
                    editingExam.batchAssignments ||
                    editingExam.batch_data ||
                    [];
                if (Array.isArray(existingBatches) && existingBatches.length > 0) {
                    setNumberOfBatches(existingBatches.length);
                    setBatchAssignments(existingBatches);
                }
            } else {
                // Create Mode: Default supervisor to self only if empty
                if (userProfile && !supervisorEmail) {
                    setSupervisorEmail(userProfile.email || '');
                    setSupervisorName(userProfile.name || '');
                }
            }
        }
    }, [visible, editingExam]);

    // Helper functions for date/time formatting
    const getFormattedDate = () => {
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

    // Calculate batch timings with 30-min breaks
    const calculateBatchTimings = (numBatches, perBatch = null) => {
        const timeLimitMins = parseInt(timeLimit) || 30;
        const breakMins = 30;
        const startHour = date.getHours();
        const startMin = date.getMinutes();

        const batches = [];
        let currentTime = startHour * 60 + startMin; // Convert to minutes

        // Calculate users per batch
        const totalUsers = selectedUsers.length;
        const actualPerBatch = perBatch || (totalUsers > 0 ? Math.ceil(totalUsers / numBatches) : 0);

        for (let i = 0; i < numBatches; i++) {
            const batchStartHour = Math.floor(currentTime / 60) % 24;
            const batchStartMin = currentTime % 60;
            const batchEndTime = currentTime + timeLimitMins;
            const batchEndHour = Math.floor(batchEndTime / 60) % 24;
            const batchEndMin = batchEndTime % 60;

            batches.push({
                batchNumber: i + 1,
                startTime: `${String(batchStartHour).padStart(2, '0')}:${String(batchStartMin).padStart(2, '0')}`,
                endTime: `${String(batchEndHour).padStart(2, '0')}:${String(batchEndMin).padStart(2, '0')}`,
                maxUsers: actualPerBatch,
                users: [],
                // Per-batch configuration
                date: getFormattedDate(), // Default to exam date, can be changed per batch
                location: location || '', // Default to exam location, can be changed per batch
                supervisorEmail: supervisorEmail || '',
                supervisorName: supervisorName || '',
                // Geofencing configuration (per-batch)
                geofencing: {
                    enabled: false,
                    latitude: null,
                    longitude: null,
                    radius: parseInt(geofencingRadius) || 100
                }
            });

            // Next batch starts after exam duration + 30 min break
            currentTime = batchEndTime + breakMins;
        }

        return batches;
    };

    // Distribute users into batches based on usersPerBatch or auto-calculate
    const distributeBatches = (forcedPerBatch = null) => {
        if (selectedUsers.length === 0 || numberOfBatches < 1) {
            setBatchAssignments([]);
            return;
        }

        const perBatch = forcedPerBatch || (usersPerBatch ? parseInt(usersPerBatch) : Math.ceil(selectedUsers.length / numberOfBatches));
        const batchTimings = calculateBatchTimings(numberOfBatches, perBatch);

        // Convert email strings to full user objects
        const selectedUserObjects = selectedUsers.map(email =>
            allUsers.find(u => u.email === email)
        ).filter(Boolean); // Remove any undefined values

        const newBatchAssignments = batchTimings.map((batch, idx) => {
            const startIdx = idx * perBatch;
            const endIdx = Math.min(startIdx + perBatch, selectedUserObjects.length);
            return {
                ...batch,
                maxUsers: perBatch,
                users: selectedUserObjects.slice(startIdx, endIdx)
            };
        });

        setBatchAssignments(newBatchAssignments);
    };

    // Update single batch timing
    const updateBatchTiming = (batchIndex, field, value) => {
        const updated = [...batchAssignments];
        updated[batchIndex] = { ...updated[batchIndex], [field]: value };

        // If startTime changed, auto-calculate endTime based on exam duration
        if (field === 'startTime') {
            const [hours, mins] = value.split(':').map(Number);
            const startMins = hours * 60 + mins;
            const endMins = startMins + (parseInt(timeLimit) || 30);
            const endHour = Math.floor(endMins / 60) % 24;
            const endMin = endMins % 60;
            updated[batchIndex].endTime = `${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`;
        }

        setBatchAssignments(updated);
    };

    // Move user between batches
    const moveUserToBatch = (userEmail, fromBatchIdx, toBatchIdx) => {
        const updated = [...batchAssignments];
        const userToMove = updated[fromBatchIdx].users.find(u => u.email === userEmail);

        if (userToMove) {
            updated[fromBatchIdx].users = updated[fromBatchIdx].users.filter(u => u.email !== userEmail);
            updated[toBatchIdx].users = [...updated[toBatchIdx].users, userToMove];
            setBatchAssignments(updated);
        }
    };

    // Update max users per batch
    const updateBatchMaxUsers = (batchIndex, newMax) => {
        const updated = [...batchAssignments];
        updated[batchIndex].maxUsers = parseInt(newMax) || 1;
        setBatchAssignments(updated);
    };

    // Redistribute users equally
    const redistributeUsersEqually = () => {
        distributeBatches();
    };

    // Auto-distribute when batches or users change
    useEffect(() => {
        if (selectedUsers.length > 0 && numberOfBatches > 0) {
            distributeBatches();
        } else if (selectedUsers.length === 0) {
            setBatchAssignments([]);
        }
    }, [selectedUsers.length, numberOfBatches, timeLimit, date]);

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
            const token = await AsyncStorage.getItem('userToken');
            const res = await fetch(`${API_URL}/api/v1/analytics/stores`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
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
            const token = await AsyncStorage.getItem('userToken');
            const res = await fetch(`${API_URL}/api/v1/users/list?limit=1000`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
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

    const fetchSmartCategories = async () => {
        setLoadingCategories(true);
        try {
            console.log("Fetching smart user categories...");
            const token = await AsyncStorage.getItem('userToken');
            const res = await fetch(`${API_URL}/api/v1/users/smart-categories`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            const data = await res.json();

            if (data && data.categories) {
                console.log(`Fetched ${data.categories.length} smart categories`);
                setSmartCategories(data.categories);
            } else {
                console.error('Invalid categories data:', data);
            }
        } catch (e) {
            console.error('Error fetching smart categories:', e);
            // Fail silently - categories are optional enhancement
        }
        setLoadingCategories(false);
    };

    const toggleUserSelection = (email) => {
        if (selectedUsers.includes(email)) {
            setSelectedUsers(selectedUsers.filter(e => e !== email));
        } else {
            setSelectedUsers([...selectedUsers, email]);
        }
    };

    const toggleCategorySelection = (categoryId) => {
        const category = smartCategories.find(c => c.id === categoryId);
        if (!category) return;

        const isCategorySelected = selectedCategories.includes(categoryId);

        if (isCategorySelected) {
            // Deselect category - remove its users from selection
            setSelectedCategories(selectedCategories.filter(id => id !== categoryId));
            setSelectedUsers(selectedUsers.filter(email => !category.user_emails.includes(email)));
        } else {
            // Select category - ADD its users to selection (cumulative)
            setSelectedCategories([...selectedCategories, categoryId]);
            const newUsers = [...new Set([...selectedUsers, ...category.user_emails])];
            setSelectedUsers(newUsers);
        }
    };

    const handleBulkUpload = async () => {
        try {
            setProcessingUpload(true);

            // Step 1: Pick document
            const result = await DocumentPicker.getDocumentAsync({
                type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv', 'text/comma-separated-values'],
                copyToCacheDirectory: true
            });

            if (result.canceled || !result.assets || result.assets.length === 0) {
                setProcessingUpload(false);
                return;
            }

            const file = result.assets[0];
            console.log("File picked:", file.name, file.uri);

            // Step 2: Read file based on type
            let employeeCodes = [];

            if (file.name.endsWith('.csv')) {
                // Parse CSV
                const response = await fetch(file.uri);
                const text = await response.text();
                const lines = text.split('\n').filter(line => line.trim());

                // Assume first column is Employee Code (skip header if present)
                const hasHeader = lines[0].toLowerCase().includes('employee') || lines[0].toLowerCase().includes('code');
                const dataLines = hasHeader ? lines.slice(1) : lines;

                employeeCodes = dataLines.map(line => {
                    const columns = line.split(',');
                    return columns[0]?.trim().replace(/"/g, ''); // First column, remove quotes
                }).filter(code => code);

            } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
                // Parse Excel
                const response = await fetch(file.uri);
                const arrayBuffer = await response.arrayBuffer();
                const workbook = XLSX.read(arrayBuffer, { type: 'array' });

                // Get first sheet
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                // Find Employee Code column (check first row for header)
                const firstRow = jsonData[0] || [];
                let empCodeIndex = 0;

                // Try to find the column with "Employee Code" header
                const empCodeColIndex = firstRow.findIndex(col =>
                    String(col).toLowerCase().includes('employee') && String(col).toLowerCase().includes('code')
                );

                if (empCodeColIndex !== -1) {
                    empCodeIndex = empCodeColIndex;
                    jsonData.shift(); // Remove header row
                }

                // Extract employee codes from the identified column
                employeeCodes = jsonData
                    .map(row => row[empCodeIndex])
                    .filter(code => code && String(code).trim())
                    .map(code => String(code).trim());
            }

            if (employeeCodes.length === 0) {
                Alert.alert('Error', 'No employee codes found in the file. Please ensure the first column contains employee codes.');
                setProcessingUpload(false);
                return;
            }

            console.log(`Extracted ${employeeCodes.length} employee codes:`, employeeCodes.slice(0, 5), '...');

            // Step 3: Validate employee codes with backend
            const response = await fetch(`${API_URL}/api/v1/users/validate-employee-codes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ employee_codes: employeeCodes })
            });

            if (!response.ok) {
                throw new Error(`Validation failed: ${response.status}`);
            }

            const data = await response.json();
            console.log("Validation result:", data);

            // Step 4: Add matched users to selection (cumulative)
            if (data.matched && data.matched.length > 0) {
                const newUsers = [...new Set([...selectedUsers, ...data.matched])];
                setSelectedUsers(newUsers);
                setUploadedFileName(file.name);
                setUploadedUsersCount(data.matched_count);

                // Show success message
                let message = `✅ Successfully matched ${data.matched_count} users`;
                if (data.not_found_count > 0) {
                    message += `\n⚠️ ${data.not_found_count} employee codes not found`;
                }

                Alert.alert('Bulk Upload Success', message);
            } else {
                Alert.alert('No Matches', 'None of the employee codes matched any users in the system.');
            }

            setProcessingUpload(false);

        } catch (error) {
            console.error('Bulk upload error:', error);
            Alert.alert('Upload Error', `Failed to process file: ${error.message}`);
            setProcessingUpload(false);
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

            const res = await fetch(`${API_URL}/api/v1/assessments/generate-questions`, {
                method: 'POST',
                body: formData
            });

            if (res.ok) {
                const data = await res.json();
                // Check for data.questions (direct list or nested)
                const qList = Array.isArray(data) ? data : (data.questions || []);

                if (qList.length > 0) {
                    setQuestions(qList);
                    Alert.alert('Success', `Generated ${qList.length} questions!`);
                } else {
                    Alert.alert('Note', 'AI generated no questions. Please try a different topic.');
                }
            } else {
                // Manual fallback
                Alert.alert('Note', 'AI generation failed. Please add questions manually.');
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
            formData.append('batch_assignments', JSON.stringify(batchAssignments));
            formData.append('number_of_batches', numberOfBatches.toString());
            formData.append('supervisor_email', supervisorEmail);
            formData.append('supervisor_name', supervisorName);
            const normalizedSelectedUsers = [...new Set(
                selectedUsers.map(normalizeUserEmail).filter(Boolean)
            )];
            formData.append('assigned_users', JSON.stringify(normalizedSelectedUsers));
            formData.append('questions', JSON.stringify(questions));
            formData.append('time_limit_minutes', timeLimit);
            formData.append('passing_score', passingScore);
            formData.append('created_by', userProfile?.email || 'admin');

            // Enhanced Features
            formData.append('exam_status', examStatus);
            formData.append('scheduled_publish_at', scheduledPublishAt ? scheduledPublishAt.toISOString() : '');
            formData.append('allow_different_questions_per_batch', allowDifferentQuestions.toString());
            formData.append('randomize_question_order', randomizeQuestions.toString());
            formData.append('randomize_option_order', randomizeOptions.toString());

            // Geofencing Fields
            formData.append('geofencing_enabled', geofencingEnabled.toString());
            formData.append('geofencing_radius', geofencingRadius);

            // PIN Check-in Fields
            formData.append('pin_enabled', pinEnabled.toString());
            formData.append('pin_generation_minutes', pinGenerationMinutes);
            formData.append('pin_validity_minutes', pinValidityMinutes);

            // Determine API endpoint and method
            const endpoint = isEditMode
                ? `${API_URL}/api/v1/assessments/scheduled/${editingExam.id}`
                : `${API_URL}/api/v1/assessments/scheduled`;
            const method = isEditMode ? 'PUT' : 'POST';

            const res = await fetch(endpoint, {
                method: method,
                body: formData
            });

            const data = await res.json();

            if (res.ok && (data.id || data.status === 'success')) {
                const successMessage = isEditMode
                    ? `Exam "${title}" updated successfully!`
                    : `Exam "${title}" scheduled successfully! Notifications sent to ${selectedUsers.length} users.`;
                Alert.alert('Success', successMessage);
                resetForm();
                onClose();
            } else {
                Alert.alert('Error', data.detail || `Failed to ${isEditMode ? 'update' : 'schedule'} exam`);
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
        setNumberOfBatches(1);
        setBatchAssignments([]);
        setUsersPerBatch('');
        setSelectedUsers([]);
        setSelectedCategories([]);
        setQuestions([]);
        setActiveStep(1);
        setUploadedFileName('');
        setUploadedUsersCount(0);
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
                    {Platform.OS === 'web' ? (
                        <View style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            height: 52,
                            backgroundColor: '#FFF',
                            borderWidth: 1,
                            borderColor: '#E5E7EB',
                            borderRadius: 12,
                            paddingHorizontal: 12
                        }}>
                            <Feather name="calendar" size={18} color="#6366F1" style={{ marginRight: 8 }} />
                            <input
                                type="date"
                                value={getFormattedDate()}
                                min={new Date().toISOString().split('T')[0]}
                                onChange={(e) => {
                                    if (!e.target.value) return;
                                    const [year, month, day] = e.target.value.split('-');
                                    const newDate = new Date(date);
                                    newDate.setFullYear(parseInt(year), parseInt(month) - 1, parseInt(day));
                                    setDate(newDate);
                                }}
                                style={{
                                    border: 'none',
                                    backgroundColor: 'transparent',
                                    flex: 1,
                                    height: '100%',
                                    fontSize: 14,
                                    fontFamily: 'Poppins, sans-serif',
                                    color: '#111827',
                                    outline: 'none'
                                }}
                            />
                        </View>
                    ) : (
                        <TouchableOpacity
                            style={styles.pickerBtn}
                            onPress={() => setShowDatePicker(true)}
                        >
                            <Feather name="calendar" size={18} color="#6366F1" />
                            <Text style={styles.pickerBtnText}>{getFormattedDate()}</Text>
                        </TouchableOpacity>
                    )}
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Time *</Text>
                    {Platform.OS === 'web' ? (
                        <View style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            height: 52,
                            backgroundColor: '#FFF',
                            borderWidth: 1,
                            borderColor: '#E5E7EB',
                            borderRadius: 12,
                            paddingHorizontal: 12
                        }}>
                            <Feather name="clock" size={18} color="#6366F1" style={{ marginRight: 8 }} />
                            <input
                                type="time"
                                value={getFormattedTime()}
                                onChange={(e) => {
                                    if (!e.target.value) return;
                                    const [hours, minutes] = e.target.value.split(':');
                                    const newDate = new Date(date);
                                    newDate.setHours(parseInt(hours), parseInt(minutes));
                                    setDate(newDate);
                                }}
                                style={{
                                    border: 'none',
                                    backgroundColor: 'transparent',
                                    flex: 1,
                                    height: '100%',
                                    fontSize: 14,
                                    fontFamily: 'Poppins, sans-serif',
                                    color: '#111827',
                                    outline: 'none'
                                }}
                            />
                        </View>
                    ) : (
                        <TouchableOpacity
                            style={styles.pickerBtn}
                            onPress={() => setShowTimePicker(true)}
                        >
                            <Feather name="clock" size={18} color="#6366F1" />
                            <Text style={styles.pickerBtnText}>{getFormattedTime()}</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {/* DateTimePicker - Native Only */}
            {Platform.OS !== 'web' && (showDatePicker || showTimePicker) && (
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

            {/* Shift removed - replaced with Batch System in Step 2 */}

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

            {/* ENHANCED FEATURES: Draft/Publish & Scheduled Visibility */}
            <View style={styles.enhancedFeaturesContainer}>
                <Text style={styles.sectionTitle}>Visibility Controls</Text>

                {/* Draft/Published Toggle */}
                <View style={styles.toggleRow}>
                    <View style={styles.toggleLabelContainer}>
                        <Feather name={examStatus === 'draft' ? 'eye-off' : 'eye'} size={18} color="#6366F1" />
                        <Text style={styles.toggleLabel}>Status</Text>
                    </View>
                    <View style={styles.statusSwitchContainer}>
                        <Text style={[styles.statusLabel, examStatus === 'draft' && styles.statusLabelActive]}>Draft</Text>
                        <TouchableOpacity
                            style={[styles.switchButton, examStatus === 'published' && styles.switchButtonActive]}
                            onPress={() => setExamStatus(examStatus === 'draft' ? 'published' : 'draft')}
                        >
                            <View style={[styles.switchCircle, examStatus === 'published' && styles.switchCircleActive]} />
                        </TouchableOpacity>
                        <Text style={[styles.statusLabel, examStatus === 'published' && styles.statusLabelActive]}>Published</Text>
                    </View>
                </View>
                <Text style={styles.helperText}>
                    {examStatus === 'draft'
                        ? '📝 Draft exams are hidden from users until published'
                        : '👁️ Published exams are visible to assigned users'}
                </Text>

                {/* Scheduled Publish (only if published) */}
                {examStatus === 'published' && (
                    <View style={{ marginTop: 15 }}>
                        <View style={styles.toggleRow}>
                            <View style={styles.toggleLabelContainer}>
                                <Feather name="clock" size={18} color="#6366F1" />
                                <Text style={styles.toggleLabel}>Schedule Visibility</Text>
                            </View>
                            <TouchableOpacity
                                style={[styles.switchButton, scheduledPublishAt && styles.switchButtonActive]}
                                onPress={() => {
                                    if (scheduledPublishAt) {
                                        setScheduledPublishAt(null);
                                    } else {
                                        setScheduledPublishAt(new Date());
                                        setShowScheduledPublishPicker(true);
                                    }
                                }}
                            >
                                <View style={[styles.switchCircle, scheduledPublishAt && styles.switchCircleActive]} />
                            </TouchableOpacity>
                        </View>

                        {scheduledPublishAt && (
                            <View style={{ marginTop: 10 }}>
                                {Platform.OS === 'web' ? (
                                    <View style={{
                                        marginTop: 10,
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        height: 52,
                                        backgroundColor: '#FFF',
                                        borderWidth: 1,
                                        borderColor: '#E5E7EB',
                                        borderRadius: 12,
                                        paddingHorizontal: 12
                                    }}>
                                        <Feather name="calendar" size={18} color="#6366F1" style={{ marginRight: 8 }} />
                                        <input
                                            type="datetime-local"
                                            value={(() => {
                                                const d = new Date(scheduledPublishAt);
                                                const year = d.getFullYear();
                                                const month = String(d.getMonth() + 1).padStart(2, '0');
                                                const day = String(d.getDate()).padStart(2, '0');
                                                const hours = String(d.getHours()).padStart(2, '0');
                                                const minutes = String(d.getMinutes()).padStart(2, '0');
                                                return `${year}-${month}-${day}T${hours}:${minutes}`;
                                            })()}
                                            min={new Date().toISOString().slice(0, 16)}
                                            onChange={(e) => {
                                                if (!e.target.value) return;
                                                const dateTimeStr = e.target.value;
                                                setScheduledPublishAt(new Date(dateTimeStr));
                                            }}
                                            style={{
                                                border: 'none',
                                                backgroundColor: 'transparent',
                                                flex: 1,
                                                height: '100%',
                                                fontSize: 14,
                                                fontFamily: 'Poppins, sans-serif',
                                                color: '#111827',
                                                outline: 'none'
                                            }}
                                        />
                                    </View>
                                ) : (
                                    <TouchableOpacity
                                        style={styles.pickerBtn}
                                        onPress={() => setShowScheduledPublishPicker(true)}
                                    >
                                        <Feather name="calendar" size={18} color="#6366F1" />
                                        <Text style={styles.pickerBtnText}>
                                            {scheduledPublishAt.toLocaleString()}
                                        </Text>
                                    </TouchableOpacity>
                                )}
                                <Text style={styles.helperText}>
                                    ⏰ Exam will become visible at this date/time
                                </Text>
                            </View>
                        )}

                        {Platform.OS !== 'web' && showScheduledPublishPicker && (
                            <DateTimePicker
                                value={scheduledPublishAt || new Date()}
                                mode="datetime"
                                display="default"
                                onChange={(event, selectedDate) => {
                                    setShowScheduledPublishPicker(false);
                                    if (selectedDate) {
                                        setScheduledPublishAt(selectedDate);
                                    }
                                }}
                                minimumDate={new Date()}
                            />
                        )}
                    </View>
                )}
            </View>

            {/* Add padding at bottom for scrolling */}
            <View style={{ height: 150 }} />
        </ScrollView>
    );

    const renderStep2 = () => (
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            <Text style={styles.stepTitle}>Select Participants</Text>

            {/* BATCH CONFIGURATION SYSTEM */}
            <View style={styles.batchSystemContainer}>
                <View style={styles.batchHeader}>
                    <MaterialCommunityIcons name="account-group-outline" size={20} color="#6366F1" />
                    <Text style={styles.batchTitle}>Batch Configuration</Text>
                </View>

                {/* Config Row 1: Number of Batches + Users Per Batch */}
                <View style={styles.batchConfigRow}>
                    <View style={styles.batchConfigItem}>
                        <Text style={styles.batchConfigLabel}>Batches</Text>
                        <TouchableOpacity
                            style={styles.batchDropdown}
                            onPress={() => setShowBatchDropdown(!showBatchDropdown)}
                        >
                            <Text style={styles.batchDropdownText}>{numberOfBatches}</Text>
                            <Feather name={showBatchDropdown ? "chevron-up" : "chevron-down"} size={16} color="#6366F1" />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.batchConfigItem}>
                        <Text style={styles.batchConfigLabel}>Users/Batch</Text>
                        <TextInput
                            style={styles.batchConfigInput}
                            placeholder="Auto"
                            value={usersPerBatch}
                            onChangeText={(val) => {
                                setUsersPerBatch(val);
                                if (val && selectedUsers.length > 0) {
                                    distributeBatches(parseInt(val));
                                }
                            }}
                            keyboardType="numeric"
                        />
                    </View>

                    <TouchableOpacity
                        style={styles.redistributeBtn}
                        onPress={redistributeUsersEqually}
                    >
                        <Feather name="refresh-cw" size={16} color="#FFF" />
                        <Text style={styles.redistributeBtnText}>Auto</Text>
                    </TouchableOpacity>
                </View>

                {showBatchDropdown && (
                    <View style={styles.dropdownList}>
                        <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                                <TouchableOpacity
                                    key={num}
                                    style={[styles.dropdownItem, numberOfBatches === num && styles.dropdownItemActive]}
                                    onPress={() => {
                                        setNumberOfBatches(num);
                                        setShowBatchDropdown(false);
                                    }}
                                >
                                    <Text style={[styles.dropdownItemText, numberOfBatches === num && styles.dropdownItemTextActive]}>
                                        {num} {num === 1 ? 'Batch' : 'Batches'}
                                    </Text>
                                    {numberOfBatches === num && <Feather name="check" size={16} color="#6366F1" />}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                )}

                {/* Summary Stats */}
                {selectedUsers.length > 0 && (
                    <View style={styles.batchStatsRow}>
                        <View style={styles.batchStat}>
                            <Text style={styles.batchStatValue}>{selectedUsers.length}</Text>
                            <Text style={styles.batchStatLabel}>Total Users</Text>
                        </View>
                        <View style={styles.batchStatDivider} />
                        <View style={styles.batchStat}>
                            <Text style={styles.batchStatValue}>{numberOfBatches}</Text>
                            <Text style={styles.batchStatLabel}>Batches</Text>
                        </View>
                        <View style={styles.batchStatDivider} />
                        <View style={styles.batchStat}>
                            <Text style={styles.batchStatValue}>~{Math.ceil(selectedUsers.length / numberOfBatches)}</Text>
                            <Text style={styles.batchStatLabel}>Per Batch</Text>
                        </View>
                    </View>
                )}

                {/* Editable Batch Cards */}
                {batchAssignments.length > 0 && selectedUsers.length > 0 && (
                    <View style={styles.batchCardsContainer}>
                        <View style={styles.batchCardsHeader}>
                            <Text style={styles.batchCardsTitle}>📋 Batch Schedule</Text>
                            <Text style={styles.batchCardsSubtitle}>Tap to edit timings</Text>
                        </View>

                        {batchAssignments.map((batch, idx) => (
                            <View key={idx} style={styles.editableBatchCard}>
                                <View style={styles.editableBatchHeader}>
                                    <View style={styles.batchBadge}>
                                        <Text style={styles.batchBadgeText}>Batch {batch.batchNumber}</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                        <View style={styles.batchUsersBadge}>
                                            <Feather name="users" size={12} color="#6366F1" />
                                            <Text style={styles.batchUsersText}>{batch.users.length}/{batch.maxUsers}</Text>
                                        </View>
                                        <TouchableOpacity
                                            style={styles.editBatchBtn}
                                            onPress={() => {
                                                setEditingBatchIndex(idx);
                                                setShowBatchEditModal(true);
                                            }}
                                        >
                                            <Feather name="edit-2" size={14} color="#6366F1" />
                                            <Text style={styles.editBatchBtnText}>Edit</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                {/* Quick Info Summary */}
                                <View style={styles.batchQuickInfo}>
                                    <View style={styles.batchInfoItem}>
                                        <Feather name="calendar" size={12} color="#6B7280" />
                                        <Text style={styles.batchInfoText}>{batch.date || getFormattedDate()}</Text>
                                    </View>
                                    <View style={styles.batchInfoItem}>
                                        <Feather name="clock" size={12} color="#6B7280" />
                                        <Text style={styles.batchInfoText}>{batch.startTime} - {batch.endTime}</Text>
                                    </View>
                                </View>

                                <View style={styles.batchQuickInfo}>
                                    <View style={styles.batchInfoItem}>
                                        <Feather name="map-pin" size={12} color="#6B7280" />
                                        <Text style={styles.batchInfoText} numberOfLines={1}>
                                            {batch.location || location || 'Not set'}
                                        </Text>
                                    </View>
                                </View>

                                <View style={styles.batchQuickInfo}>
                                    <View style={styles.batchInfoItem}>
                                        <Feather name="user" size={12} color="#6B7280" />
                                        <Text style={styles.batchInfoText} numberOfLines={1}>
                                            {batch.supervisorName || supervisorName || 'Not set'}
                                        </Text>
                                    </View>
                                </View>

                                {/* User list preview */}
                                {batch.users.length > 0 && (
                                    <View style={styles.batchUserPreview}>
                                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                            {batch.users.slice(0, 5).map((user, uIdx) => (
                                                <View key={uIdx} style={styles.miniUserChip}>
                                                    <Text style={styles.miniUserChipText} numberOfLines={1}>
                                                        {user.name?.split(' ')[0] || user.email?.split('@')[0]}
                                                    </Text>
                                                </View>
                                            ))}
                                            {batch.users.length > 5 && (
                                                <View style={styles.miniUserChipMore}>
                                                    <Text style={styles.miniUserChipMoreText}>+{batch.users.length - 5}</Text>
                                                </View>
                                            )}
                                        </ScrollView>
                                    </View>
                                )}

                                {batch.users.length === 0 && (
                                    <Text style={styles.batchNoUsers}>No users assigned - Tap Edit to assign</Text>
                                )}
                            </View>
                        ))}
                    </View>
                )}

                {/* Empty State */}
                {selectedUsers.length === 0 && (
                    <View style={styles.batchEmptyState}>
                        <Feather name="users" size={32} color="#D1D5DB" />
                        <Text style={styles.batchEmptyText}>Select users below to configure batches</Text>
                    </View>
                )}
            </View>

            {/* SMART CATEGORIES - Improved Grid Layout */}
            {smartCategories.length > 0 && (
                <View style={styles.smartCategoriesContainer}>
                    <View style={styles.smartCategoriesHeader}>
                        <Text style={styles.smartCategoriesTitle}>✨ Quick Select Categories</Text>
                        <Text style={styles.smartCategoriesSubtitle}>
                            {selectedCategories.length > 0
                                ? `${selectedCategories.length} ${selectedCategories.length === 1 ? 'category' : 'categories'} selected`
                                : 'Tap to select user groups'
                            }
                        </Text>
                    </View>

                    {/* Grid Layout with Internal Scrolling */}
                    <ScrollView
                        style={styles.categoriesScrollView}
                        showsVerticalScrollIndicator={true}
                        nestedScrollEnabled={true}
                    >
                        <View style={styles.categoriesGrid}>
                            {smartCategories.map(category => {
                                const isSelected = selectedCategories.includes(category.id);
                                const getCategoryColor = () => {
                                    switch (category.type) {
                                        case 'role': return '#3B82F6';
                                        case 'store': return '#10B981';
                                        case 'completion': return '#D71A21';
                                        case 'promotion': return '#8B5CF6';
                                        case 'progress': return '#06B6D4';
                                        default: return '#6B7280';
                                    }
                                };
                                const iconMap = {
                                    'users': 'account-group',
                                    'map-pin': 'map-marker',
                                    'award': 'trophy',
                                    'trending-up': 'trending-up',
                                    'activity': 'chart-line'
                                };

                                return (
                                    <TouchableOpacity
                                        key={category.id}
                                        style={[
                                            styles.smartCategoryChip,
                                            isSelected && {
                                                backgroundColor: `${getCategoryColor()}15`,
                                                borderColor: getCategoryColor(),
                                                borderWidth: 2
                                            }
                                        ]}
                                        onPress={() => toggleCategorySelection(category.id)}
                                    >
                                        <View style={[styles.categoryIconBadge, { backgroundColor: getCategoryColor() }]}>
                                            <MaterialCommunityIcons
                                                name={iconMap[category.icon] || 'account-group'}
                                                size={16}
                                                color="#FFF"
                                            />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text
                                                style={[
                                                    styles.smartCategoryName,
                                                    isSelected && { color: getCategoryColor() }
                                                ]}
                                                numberOfLines={2}
                                                ellipsizeMode="tail"
                                            >
                                                {category.name}
                                            </Text>
                                            <Text style={styles.smartCategoryCount}>
                                                {category.count} {category.count === 1 ? 'user' : 'users'}
                                            </Text>
                                        </View>
                                        {isSelected && (
                                            <View style={[styles.categoryCheckmark, { backgroundColor: getCategoryColor() }]}>
                                                <Feather name="check" size={12} color="#FFF" />
                                            </View>
                                        )}
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </ScrollView>
                </View>
            )}

            {/* BULK UPLOAD SECTION */}
            <View style={styles.bulkUploadContainer}>
                <View style={styles.bulkUploadHeader}>
                    <MaterialCommunityIcons name="file-upload" size={18} color="#6366F1" />
                    <Text style={styles.bulkUploadTitle}>Bulk Upload Users</Text>
                </View>
                <Text style={styles.bulkUploadSubtitle}>
                    Upload Excel or CSV file with employee codes
                </Text>

                <TouchableOpacity
                    style={styles.bulkUploadBtn}
                    onPress={handleBulkUpload}
                    disabled={processingUpload}
                >
                    {processingUpload ? (
                        <ActivityIndicator size="small" color="#6366F1" />
                    ) : (
                        <>
                            <Feather name="upload" size={16} color="#6366F1" />
                            <Text style={styles.bulkUploadBtnText}>
                                {uploadedFileName ? 'Upload Another File' : 'Choose File'}
                            </Text>
                        </>
                    )}
                </TouchableOpacity>

                {uploadedFileName && (
                    <View style={styles.uploadSuccessBox}>
                        <Feather name="check-circle" size={16} color="#10B981" />
                        <View style={{ flex: 1, marginLeft: 8 }}>
                            <Text style={styles.uploadSuccessTitle}>{uploadedFileName}</Text>
                            <Text style={styles.uploadSuccessText}>
                                {uploadedUsersCount} {uploadedUsersCount === 1 ? 'user' : 'users'} added to selection
                            </Text>
                        </View>
                        <TouchableOpacity
                            onPress={() => {
                                setUploadedFileName('');
                                setUploadedUsersCount(0);
                            }}
                        >
                            <Feather name="x" size={18} color="#6B7280" />
                        </TouchableOpacity>
                    </View>
                )}

                <Text style={styles.bulkUploadHint}>
                    💡 File should contain employee codes in the first column
                </Text>
            </View>

            {/* SEARCH & FILTERS */}
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

            <View style={styles.userSelectionHeader}>
                <Text style={styles.stepSubtitle}>
                    {selectedUsers.length} {selectedUsers.length === 1 ? 'user' : 'users'} selected
                </Text>
                <TouchableOpacity
                    style={styles.selectAllBtnCompact}
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
                    <Feather name="check-square" size={16} color="#6366F1" />
                    <Text style={styles.selectAllTextCompact}>Select All Visible</Text>
                </TouchableOpacity>
            </View>

            {/* User List with Fixed Height for Scrolling */}
            <View style={styles.userListContainer}>
                {loadingUsers ? (
                    <ActivityIndicator size="large" color="#6366F1" style={{ marginTop: 40 }} />
                ) : (
                    <FlatList
                        data={getFilteredUsers()}
                        keyExtractor={item => item.email}
                        showsVerticalScrollIndicator={true}
                        nestedScrollEnabled={true}
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
            </View>
        </ScrollView>
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
                        <ActivityIndicator color="#B91C1C" size="small" />
                    ) : (
                        <>
                            <MaterialCommunityIcons name="file-excel-box" size={18} color="#B91C1C" />
                            <Text style={[styles.actionBtnText, { color: '#B91C1C', fontSize: 12 }]}>Import Excel</Text>
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

                {/* ========== EXAM SETTINGS SECTION ========== */}
                <View style={styles.examSettingsSection}>
                    <Text style={styles.examSettingsSectionTitle}>⚙️ Exam Settings</Text>

                    {/* 🎲 RANDOMIZATION CARD */}
                    <View style={styles.featureCard}>
                        <LinearGradient
                            colors={['#667EEA', '#764BA2']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.featureCardGradient}
                        >
                            <View style={styles.featureCardHeader}>
                                <View style={styles.featureCardIconContainer}>
                                    <Feather name="shuffle" size={22} color="#FFFFFF" />
                                </View>
                                <View style={styles.featureCardTitleContainer}>
                                    <Text style={styles.featureCardTitle}>Randomization</Text>
                                    <Text style={styles.featureCardSubtitle}>Shuffle questions & options</Text>
                                </View>
                            </View>
                        </LinearGradient>

                        <View style={styles.featureCardBody}>
                            {/* Randomize Question Order */}
                            <View style={styles.premiumToggleRow}>
                                <View style={styles.premiumToggleInfo}>
                                    <View style={[styles.premiumToggleIcon, { backgroundColor: '#EEF2FF' }]}>
                                        <Feather name="list" size={16} color="#6366F1" />
                                    </View>
                                    <View style={styles.premiumToggleText}>
                                        <Text style={styles.premiumToggleLabel}>Shuffle Question Order</Text>
                                        <Text style={styles.premiumToggleDesc}>Each user sees questions differently</Text>
                                    </View>
                                </View>
                                <TouchableOpacity
                                    style={[styles.premiumSwitch, randomizeQuestions && styles.premiumSwitchActive]}
                                    onPress={() => setRandomizeQuestions(!randomizeQuestions)}
                                    activeOpacity={0.8}
                                >
                                    <View style={[styles.premiumSwitchThumb, randomizeQuestions && styles.premiumSwitchThumbActive]} />
                                </TouchableOpacity>
                            </View>

                            <View style={styles.premiumToggleDivider} />

                            {/* Randomize Option Order */}
                            <View style={styles.premiumToggleRow}>
                                <View style={styles.premiumToggleInfo}>
                                    <View style={[styles.premiumToggleIcon, { backgroundColor: '#F3E8FF' }]}>
                                        <MaterialCommunityIcons name="shuffle-variant" size={16} color="#8B5CF6" />
                                    </View>
                                    <View style={styles.premiumToggleText}>
                                        <Text style={styles.premiumToggleLabel}>Shuffle Options (A,B,C,D)</Text>
                                        <Text style={styles.premiumToggleDesc}>Answer choices appear randomly</Text>
                                    </View>
                                </View>
                                <TouchableOpacity
                                    style={[styles.premiumSwitch, randomizeOptions && styles.premiumSwitchActive]}
                                    onPress={() => setRandomizeOptions(!randomizeOptions)}
                                    activeOpacity={0.8}
                                >
                                    <View style={[styles.premiumSwitchThumb, randomizeOptions && styles.premiumSwitchThumbActive]} />
                                </TouchableOpacity>
                            </View>

                            {numberOfBatches > 1 && (
                                <>
                                    <View style={styles.premiumToggleDivider} />
                                    {/* Different Questions Per Batch */}
                                    <View style={styles.premiumToggleRow}>
                                        <View style={styles.premiumToggleInfo}>
                                            <View style={[styles.premiumToggleIcon, { backgroundColor: '#FEF3C7' }]}>
                                                <Feather name="layers" size={16} color="#B91C1C" />
                                            </View>
                                            <View style={styles.premiumToggleText}>
                                                <Text style={styles.premiumToggleLabel}>Different Questions Per Batch</Text>
                                                <Text style={styles.premiumToggleDesc}>Each batch gets unique set</Text>
                                            </View>
                                        </View>
                                        <TouchableOpacity
                                            style={[styles.premiumSwitch, allowDifferentQuestions && styles.premiumSwitchActive]}
                                            onPress={() => setAllowDifferentQuestions(!allowDifferentQuestions)}
                                            activeOpacity={0.8}
                                        >
                                            <View style={[styles.premiumSwitchThumb, allowDifferentQuestions && styles.premiumSwitchThumbActive]} />
                                        </TouchableOpacity>
                                    </View>
                                </>
                            )}
                        </View>
                    </View>

                    {/* 📍 GEOFENCING CARD */}
                    <View style={styles.featureCard}>
                        <LinearGradient
                            colors={['#10B981', '#059669']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.featureCardGradient}
                        >
                            <View style={styles.featureCardHeader}>
                                <View style={styles.featureCardIconContainer}>
                                    <Feather name="map-pin" size={22} color="#FFFFFF" />
                                </View>
                                <View style={styles.featureCardTitleContainer}>
                                    <Text style={styles.featureCardTitle}>Geofencing</Text>
                                    <Text style={styles.featureCardSubtitle}>Location-based validation</Text>
                                </View>
                            </View>
                        </LinearGradient>

                        <View style={styles.featureCardBody}>
                            <View style={styles.premiumToggleRow}>
                                <View style={styles.premiumToggleInfo}>
                                    <View style={[styles.premiumToggleIcon, { backgroundColor: '#ECFDF5' }]}>
                                        <Feather name="target" size={16} color="#10B981" />
                                    </View>
                                    <View style={styles.premiumToggleText}>
                                        <Text style={styles.premiumToggleLabel}>Enable Location Check</Text>
                                        <Text style={styles.premiumToggleDesc}>User must be at exam location</Text>
                                    </View>
                                </View>
                                <TouchableOpacity
                                    style={[styles.premiumSwitch, geofencingEnabled && styles.premiumSwitchActiveGreen]}
                                    onPress={() => setGeofencingEnabled(!geofencingEnabled)}
                                    activeOpacity={0.8}
                                >
                                    <View style={[styles.premiumSwitchThumb, geofencingEnabled && styles.premiumSwitchThumbActive]} />
                                </TouchableOpacity>
                            </View>

                            {geofencingEnabled && (
                                <View style={styles.premiumInputSection}>
                                    <Text style={styles.premiumInputLabel}>📏 Allowed Radius (meters)</Text>
                                    <View style={styles.premiumInputRow}>
                                        <TextInput
                                            style={styles.premiumInput}
                                            value={geofencingRadius}
                                            onChangeText={setGeofencingRadius}
                                            keyboardType="numeric"
                                            placeholder="100"
                                            placeholderTextColor="#9CA3AF"
                                        />
                                        <Text style={styles.premiumInputUnit}>m</Text>
                                    </View>
                                    <View style={styles.premiumHintBox}>
                                        <Feather name="info" size={14} color="#10B981" />
                                        <Text style={styles.premiumHintText}>
                                            Configure exact GPS coordinates per batch in Step 2 (Batch Management)
                                        </Text>
                                    </View>
                                </View>
                            )}
                        </View>
                    </View>

                    {/* 🔑 PIN CHECK-IN CARD */}
                    <View style={styles.featureCard}>
                        <LinearGradient
                            colors={['#8B5CF6', '#6D28D9']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.featureCardGradient}
                        >
                            <View style={styles.featureCardHeader}>
                                <View style={styles.featureCardIconContainer}>
                                    <Feather name="key" size={22} color="#FFFFFF" />
                                </View>
                                <View style={styles.featureCardTitleContainer}>
                                    <Text style={styles.featureCardTitle}>PIN Check-in</Text>
                                    <Text style={styles.featureCardSubtitle}>Auto attendance marking</Text>
                                </View>
                            </View>
                        </LinearGradient>

                        <View style={styles.featureCardBody}>
                            <View style={styles.premiumToggleRow}>
                                <View style={styles.premiumToggleInfo}>
                                    <View style={[styles.premiumToggleIcon, { backgroundColor: '#F3E8FF' }]}>
                                        <MaterialCommunityIcons name="numeric" size={16} color="#8B5CF6" />
                                    </View>
                                    <View style={styles.premiumToggleText}>
                                        <Text style={styles.premiumToggleLabel}>Enable PIN Check-in</Text>
                                        <Text style={styles.premiumToggleDesc}>4-digit code for attendance</Text>
                                    </View>
                                </View>
                                <TouchableOpacity
                                    style={[styles.premiumSwitch, pinEnabled && styles.premiumSwitchActivePurple]}
                                    onPress={() => setPinEnabled(!pinEnabled)}
                                    activeOpacity={0.8}
                                >
                                    <View style={[styles.premiumSwitchThumb, pinEnabled && styles.premiumSwitchThumbActive]} />
                                </TouchableOpacity>
                            </View>

                            {pinEnabled && (
                                <View style={styles.premiumInputSection}>
                                    <View style={styles.premiumInputGroup}>
                                        <Text style={styles.premiumInputLabel}>⏰ Generate PIN Before Exam</Text>
                                        <View style={styles.premiumInputRow}>
                                            <TextInput
                                                style={styles.premiumInput}
                                                value={pinGenerationMinutes}
                                                onChangeText={setPinGenerationMinutes}
                                                keyboardType="numeric"
                                                placeholder="5"
                                                placeholderTextColor="#9CA3AF"
                                            />
                                            <Text style={styles.premiumInputUnit}>min</Text>
                                        </View>
                                    </View>

                                    <View style={[styles.premiumInputGroup, { marginTop: 12 }]}>
                                        <Text style={styles.premiumInputLabel}>⌛ PIN Valid For</Text>
                                        <View style={styles.premiumInputRow}>
                                            <TextInput
                                                style={styles.premiumInput}
                                                value={pinValidityMinutes}
                                                onChangeText={setPinValidityMinutes}
                                                keyboardType="numeric"
                                                placeholder="30"
                                                placeholderTextColor="#9CA3AF"
                                            />
                                            <Text style={styles.premiumInputUnit}>min</Text>
                                        </View>
                                    </View>

                                    <View style={styles.premiumHintBox}>
                                        <Feather name="info" size={14} color="#8B5CF6" />
                                        <Text style={styles.premiumHintText}>
                                            PIN will be auto-generated and shown to supervisor to announce
                                        </Text>
                                    </View>
                                </View>
                            )}
                        </View>
                    </View>
                </View>

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
                    <MaterialCommunityIcons name="account-group" size={18} color="#6B7280" />
                    <Text style={styles.reviewLabel}>Batches:</Text>
                    <Text style={styles.reviewValue}>{numberOfBatches} {numberOfBatches === 1 ? 'batch' : 'batches'}</Text>
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

            {/* Batch Schedule Summary */}
            {batchAssignments.length > 0 && (
                <View style={styles.batchReviewContainer}>
                    <Text style={styles.batchReviewTitle}>📋 Batch Schedule</Text>
                    {batchAssignments.map((batch, idx) => (
                        <View key={idx} style={styles.batchReviewRow}>
                            <Text style={styles.batchReviewLabel}>Batch {batch.batchNumber}:</Text>
                            <Text style={styles.batchReviewTime}>{batch.startTime} - {batch.endTime}</Text>
                            <Text style={styles.batchReviewUsers}>({batch.users.length} users)</Text>
                        </View>
                    ))}
                </View>
            )}

            <Text style={styles.noteText}>
                📢 Notifications will be sent to all selected participants with their batch timings.
            </Text>
        </ScrollView>
    );

    return (
        <>
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
                                    <MaterialCommunityIcons name={isEditMode ? "pencil" : "calendar-clock"} size={24} color="#FFF" />
                                    <Text style={styles.headerTitle}>{isEditMode ? "Edit Exam" : "Schedule Exam"}</Text>
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
                                            <MaterialCommunityIcons name={isEditMode ? "content-save" : "calendar-check"} size={20} color="#FFF" />
                                            <Text style={styles.nextBtnText}>{isEditMode ? "Update Exam" : "Schedule Exam"}</Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Batch Edit Modal */}
            <Modal
                visible={showBatchEditModal}
                transparent
                animationType="slide"
                onRequestClose={() => setShowBatchEditModal(false)}
            >
                <View style={styles.overlay}>
                    <View style={[styles.container, { height: height * 0.85 }]}>
                        <LinearGradient
                            colors={['#6366F1', '#8B5CF6']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.header}
                        >
                            <View style={styles.headerTop}>
                                <View style={styles.headerTitleRow}>
                                    <MaterialCommunityIcons name="pencil" size={24} color="#FFF" />
                                    <Text style={styles.headerTitle}>
                                        Edit Batch {editingBatchIndex !== null ? batchAssignments[editingBatchIndex]?.batchNumber : ''}
                                    </Text>
                                </View>
                                <TouchableOpacity
                                    style={styles.closeBtn}
                                    onPress={() => setShowBatchEditModal(false)}
                                >
                                    <Feather name="x" size={24} color="#FFF" />
                                </TouchableOpacity>
                            </View>
                        </LinearGradient>

                        {editingBatchIndex !== null && batchAssignments[editingBatchIndex] && (
                            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                                {/* Date & Time */}
                                <Text style={styles.sectionTitle}>📅 Date & Time</Text>
                                <View style={styles.row}>
                                    <View style={{ flex: 1, marginRight: 10 }}>
                                        <Text style={styles.inputLabel}>Date</Text>
                                        {Platform.OS === 'web' ? (
                                            <input
                                                type="date"
                                                value={batchAssignments[editingBatchIndex].date || getFormattedDate()}
                                                min={new Date().toISOString().split('T')[0]}
                                                onChange={(e) => updateBatchTiming(editingBatchIndex, 'date', e.target.value)}
                                                style={{
                                                    width: '100%',
                                                    padding: 14,
                                                    borderRadius: 12,
                                                    border: '1px solid #E5E7EB',
                                                    backgroundColor: '#FFF',
                                                    fontSize: 15,
                                                    fontFamily: 'Poppins, sans-serif'
                                                }}
                                            />
                                        ) : (
                                            <TextInput
                                                style={styles.input}
                                                value={batchAssignments[editingBatchIndex].date || getFormattedDate()}
                                                onChangeText={(val) => updateBatchTiming(editingBatchIndex, 'date', val)}
                                                placeholder="YYYY-MM-DD"
                                            />
                                        )}
                                    </View>
                                </View>

                                <View style={styles.row}>
                                    <View style={{ flex: 1, marginRight: 10 }}>
                                        <Text style={styles.inputLabel}>Start Time</Text>
                                        <TextInput
                                            style={styles.input}
                                            value={batchAssignments[editingBatchIndex].startTime}
                                            onChangeText={(val) => updateBatchTiming(editingBatchIndex, 'startTime', val)}
                                            placeholder="HH:MM"
                                            maxLength={5}
                                        />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.inputLabel}>End Time</Text>
                                        <TextInput
                                            style={[styles.input, { backgroundColor: '#F3F4F6' }]}
                                            value={batchAssignments[editingBatchIndex].endTime}
                                            editable={false}
                                            placeholder="Auto-calculated"
                                        />
                                    </View>
                                </View>

                                {/* Location */}
                                <Text style={styles.sectionTitle}>📍 Location</Text>
                                <TextInput
                                    style={styles.input}
                                    value={batchAssignments[editingBatchIndex].location || ''}
                                    onChangeText={(val) => updateBatchTiming(editingBatchIndex, 'location', val)}
                                    placeholder="e.g. Room 101, Mumbai HQ"
                                />

                                {/* Supervisor */}
                                <Text style={styles.sectionTitle}>👤 Supervisor</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                                    {allUsers
                                        .filter(u => ['Manager', 'Supervisor', 'Super Admin'].includes(u.category) || u.role === 'Supervisor' || u.is_superadmin)
                                        .map(u => (
                                            <TouchableOpacity
                                                key={u.email}
                                                style={[
                                                    styles.supervisorChip,
                                                    batchAssignments[editingBatchIndex].supervisorEmail === u.email && styles.supervisorChipActive
                                                ]}
                                                onPress={() => {
                                                    const updated = [...batchAssignments];
                                                    updated[editingBatchIndex].supervisorEmail = u.email;
                                                    updated[editingBatchIndex].supervisorName = u.name;
                                                    setBatchAssignments(updated);
                                                }}
                                            >
                                                <View style={[styles.avatarSmall, { backgroundColor: u.category === 'Manager' ? '#EF4444' : '#10B981' }]}>
                                                    <Text style={styles.avatarTextSmall}>{u.name?.charAt(0)}</Text>
                                                </View>
                                                <Text style={[
                                                    styles.supervisorName,
                                                    batchAssignments[editingBatchIndex].supervisorEmail === u.email && styles.supervisorNameActive
                                                ]}>
                                                    {u.name}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                </ScrollView>

                                {/* Max Users */}
                                <Text style={styles.sectionTitle}>👥 Capacity</Text>
                                <TextInput
                                    style={styles.input}
                                    value={String(batchAssignments[editingBatchIndex].maxUsers || '')}
                                    onChangeText={(val) => updateBatchMaxUsers(editingBatchIndex, val)}
                                    keyboardType="numeric"
                                    placeholder="Maximum users for this batch"
                                />

                                {/* Geofencing (Per-Batch) */}
                                {geofencingEnabled && (
                                    <View style={{ marginTop: 20 }}>
                                        <Text style={styles.sectionTitle}>📍 Geofencing for this Batch</Text>
                                        <View style={styles.toggleRow}>
                                            <Text style={styles.toggleLabel}>Enable for this batch</Text>
                                            <TouchableOpacity
                                                style={[styles.switchButton, batchAssignments[editingBatchIndex].geofencing?.enabled && styles.switchButtonActive]}
                                                onPress={() => {
                                                    const updated = [...batchAssignments];
                                                    if (!updated[editingBatchIndex].geofencing) {
                                                        updated[editingBatchIndex].geofencing = { enabled: false, latitude: null, longitude: null, radius: parseInt(geofencingRadius) || 100 };
                                                    }
                                                    updated[editingBatchIndex].geofencing.enabled = !updated[editingBatchIndex].geofencing.enabled;
                                                    setBatchAssignments(updated);
                                                }}
                                            >
                                                <View style={[styles.switchCircle, batchAssignments[editingBatchIndex].geofencing?.enabled && styles.switchCircleActive]} />
                                            </TouchableOpacity>
                                        </View>

                                        {batchAssignments[editingBatchIndex].geofencing?.enabled && (
                                            <View style={{ marginTop: 10 }}>
                                                <Text style={styles.inputLabel}>Latitude</Text>
                                                <TextInput
                                                    style={styles.input}
                                                    value={String(batchAssignments[editingBatchIndex].geofencing?.latitude || '')}
                                                    onChangeText={(val) => {
                                                        const updated = [...batchAssignments];
                                                        if (!updated[editingBatchIndex].geofencing) {
                                                            updated[editingBatchIndex].geofencing = { enabled: true, latitude: null, longitude: null, radius: 100 };
                                                        }
                                                        updated[editingBatchIndex].geofencing.latitude = parseFloat(val) || null;
                                                        setBatchAssignments(updated);
                                                    }}
                                                    keyboardType="decimal-pad"
                                                    placeholder="e.g. 18.5204"
                                                />

                                                <Text style={[styles.inputLabel, { marginTop: 8 }]}>Longitude</Text>
                                                <TextInput
                                                    style={styles.input}
                                                    value={String(batchAssignments[editingBatchIndex].geofencing?.longitude || '')}
                                                    onChangeText={(val) => {
                                                        const updated = [...batchAssignments];
                                                        if (!updated[editingBatchIndex].geofencing) {
                                                            updated[editingBatchIndex].geofencing = { enabled: true, latitude: null, longitude: null, radius: 100 };
                                                        }
                                                        updated[editingBatchIndex].geofencing.longitude = parseFloat(val) || null;
                                                        setBatchAssignments(updated);
                                                    }}
                                                    keyboardType="decimal-pad"
                                                    placeholder="e.g. 73.8567"
                                                />

                                                <Text style={[styles.inputLabel, { marginTop: 8 }]}>Radius (meters)</Text>
                                                <TextInput
                                                    style={styles.input}
                                                    value={String(batchAssignments[editingBatchIndex].geofencing?.radius || geofencingRadius)}
                                                    onChangeText={(val) => {
                                                        const updated = [...batchAssignments];
                                                        if (!updated[editingBatchIndex].geofencing) {
                                                            updated[editingBatchIndex].geofencing = { enabled: true, latitude: null, longitude: null, radius: 100 };
                                                        }
                                                        updated[editingBatchIndex].geofencing.radius = parseInt(val) || 100;
                                                        setBatchAssignments(updated);
                                                    }}
                                                    keyboardType="numeric"
                                                    placeholder="100"
                                                />

                                                <TouchableOpacity
                                                    style={styles.getCurrentLocationBtn}
                                                    onPress={async () => {
                                                        try {
                                                            const { status } = await Location.requestForegroundPermissionsAsync();
                                                            if (status !== 'granted') {
                                                                Alert.alert('Permission Denied', 'Location access required to set coordinates');
                                                                return;
                                                            }

                                                            const { coords } = await Location.getCurrentPositionAsync({});
                                                            const updated = [...batchAssignments];
                                                            if (!updated[editingBatchIndex].geofencing) {
                                                                updated[editingBatchIndex].geofencing = { enabled: true, latitude: null, longitude: null, radius: 100 };
                                                            }
                                                            updated[editingBatchIndex].geofencing.latitude = coords.latitude;
                                                            updated[editingBatchIndex].geofencing.longitude = coords.longitude;
                                                            setBatchAssignments(updated);
                                                            Alert.alert('Location Set', `Lat: ${coords.latitude.toFixed(6)}\nLong: ${coords.longitude.toFixed(6)}`);
                                                        } catch (error) {
                                                            Alert.alert('Error', 'Failed to get location. Please enable GPS.');
                                                        }
                                                    }}
                                                >
                                                    <Feather name="map-pin" size={16} color="#FFF" />
                                                    <Text style={styles.getCurrentLocationText}>Use Current Location</Text>
                                                </TouchableOpacity>
                                            </View>
                                        )}
                                    </View>
                                )}

                                {/* Assigned Users */}
                                <Text style={[styles.sectionTitle, { marginTop: 20 }]}>
                                    👤 Assigned Users ({batchAssignments[editingBatchIndex].users.length}/{batchAssignments[editingBatchIndex].maxUsers})
                                </Text>

                                {batchAssignments[editingBatchIndex].users.length > 0 ? (
                                    <View>
                                        {batchAssignments[editingBatchIndex].users.map((user, uIdx) => (
                                            <View key={uIdx} style={styles.userItem}>
                                                <View style={styles.userAvatar}>
                                                    <Text style={styles.userAvatarText}>{user.name?.charAt(0) || '?'}</Text>
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={styles.userName}>{user.name}</Text>
                                                    <Text style={styles.userEmail}>{user.email}</Text>
                                                </View>
                                                <TouchableOpacity
                                                    onPress={() => {
                                                        const updated = [...batchAssignments];
                                                        updated[editingBatchIndex].users = updated[editingBatchIndex].users.filter((_, i) => i !== uIdx);
                                                        setBatchAssignments(updated);
                                                    }}
                                                >
                                                    <Feather name="x-circle" size={20} color="#EF4444" />
                                                </TouchableOpacity>
                                            </View>
                                        ))}
                                    </View>
                                ) : (
                                    <Text style={styles.emptyText}>No users assigned yet</Text>
                                )}

                                {/* Available Users to Add */}
                                {allUsers.filter(u => selectedUsers.includes(u.email) && !batchAssignments[editingBatchIndex].users.some(bu => bu.email === u.email)).length > 0 && (
                                    <>
                                        <Text style={[styles.sectionTitle, { marginTop: 20 }]}>➕ Add Users from Selection</Text>
                                        {allUsers
                                            .filter(u => selectedUsers.includes(u.email) && !batchAssignments[editingBatchIndex].users.some(bu => bu.email === u.email))
                                            .map((user, uIdx) => (
                                                <View key={uIdx} style={styles.userItem}>
                                                    <View style={styles.userAvatar}>
                                                        <Text style={styles.userAvatarText}>{user.name?.charAt(0) || '?'}</Text>
                                                    </View>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={styles.userName}>{user.name}</Text>
                                                        <Text style={styles.userEmail}>{user.email}</Text>
                                                    </View>
                                                    <TouchableOpacity
                                                        onPress={() => {
                                                            if (batchAssignments[editingBatchIndex].users.length < batchAssignments[editingBatchIndex].maxUsers) {
                                                                const updated = [...batchAssignments];
                                                                updated[editingBatchIndex].users.push(user);
                                                                setBatchAssignments(updated);
                                                            } else {
                                                                Alert.alert('Batch Full', 'This batch has reached its maximum capacity. Increase max users or remove someone first.');
                                                            }
                                                        }}
                                                        disabled={batchAssignments[editingBatchIndex].users.length >= batchAssignments[editingBatchIndex].maxUsers}
                                                    >
                                                        <Feather name="plus-circle" size={20} color={
                                                            batchAssignments[editingBatchIndex].users.length >= batchAssignments[editingBatchIndex].maxUsers
                                                                ? "#D1D5DB"
                                                                : "#10B981"
                                                        } />
                                                    </TouchableOpacity>
                                                </View>
                                            ))}
                                    </>
                                )}

                                <View style={{ height: 100 }} />
                            </ScrollView>
                        )}

                        {/* Footer */}
                        <View style={styles.footer}>
                            <TouchableOpacity
                                style={[styles.nextBtn, { backgroundColor: '#10B981' }]}
                                onPress={() => setShowBatchEditModal(false)}
                            >
                                <Feather name="check" size={20} color="#FFF" />
                                <Text style={styles.nextBtnText}>Done</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    container: {
        height: Platform.OS === 'web' ? '90vh' : height * 0.92,
        maxHeight: 900,
        backgroundColor: '#F9FAFB',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        overflow: 'hidden'
    },
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

    // Smart Categories - Compact Mobile Layout
    smartCategoriesContainer: {
        marginBottom: 16,
        backgroundColor: '#FFFFFF',
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.03,
        shadowRadius: 2,
        elevation: 1
    },
    smartCategoriesHeader: {
        marginBottom: 10,
        paddingBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6'
    },
    smartCategoriesTitle: {
        fontSize: 14,
        fontFamily: 'Poppins_700Bold',
        color: '#111827',
        marginBottom: 2
    },
    smartCategoriesSubtitle: {
        fontSize: 11,
        fontFamily: 'Poppins_500Medium',
        color: '#6B7280'
    },
    categoriesGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'flex-start',
        gap: 8
    },
    categoriesScrollView: {
        maxHeight: 200
    },
    smartCategoryChip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F9FAFB',
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 10,
        width: Platform.OS === 'web' ? '48.5%' : '100%',
        marginBottom: 0,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1
    },
    categoryIconBadge: {
        width: 28,
        height: 28,
        borderRadius: 7,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 8
    },
    smartCategoryName: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
        color: '#111827',
        marginBottom: 2,
        lineHeight: 16
    },
    smartCategoryCount: {
        fontSize: 10,
        fontFamily: 'Poppins_500Medium',
        color: '#6B7280'
    },
    categoryCheckmark: {
        width: 16,
        height: 16,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 4
    },

    // User Selection Header
    userSelectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
        paddingHorizontal: 4
    },
    selectAllBtnCompact: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 6,
        paddingHorizontal: 12,
        backgroundColor: '#EEF2FF',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#C7D2FE'
    },
    selectAllTextCompact: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
        color: '#6366F1'
    },

    // User List Container with Fixed Height
    userListContainer: {
        flex: 1,
        minHeight: 300,
        maxHeight: 400,
        backgroundColor: '#FFF',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        padding: 8
    },

    // Bulk Upload Styles
    bulkUploadContainer: {
        marginBottom: 16,
        backgroundColor: '#F9FAFB',
        padding: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderStyle: 'dashed'
    },
    bulkUploadHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4
    },
    bulkUploadTitle: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#111827',
        marginLeft: 6
    },
    bulkUploadSubtitle: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
        marginBottom: 10
    },
    bulkUploadBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        paddingHorizontal: 16,
        backgroundColor: '#EEF2FF',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#C7D2FE',
        gap: 6,
        minHeight: 40
    },
    bulkUploadBtnText: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
        color: '#6366F1'
    },
    uploadSuccessBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#ECFDF5',
        padding: 10,
        borderRadius: 8,
        marginTop: 10,
        borderWidth: 1,
        borderColor: '#A7F3D0'
    },
    uploadSuccessTitle: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
        color: '#059669',
        marginBottom: 2
    },
    uploadSuccessText: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        color: '#047857'
    },
    bulkUploadHint: {
        fontSize: 10,
        fontFamily: 'Poppins_400Regular',
        color: '#9CA3AF',
        marginTop: 8,
        fontStyle: 'italic',
        textAlign: 'center'
    },

    // Batch System Styles
    batchSystemContainer: {
        marginBottom: 16,
        backgroundColor: '#EEF2FF',
        padding: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#C7D2FE'
    },
    batchHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12
    },
    batchTitle: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#4338CA',
        marginLeft: 8
    },
    batchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8
    },
    batchLabel: {
        fontSize: 13,
        fontFamily: 'Poppins_500Medium',
        color: '#374151'
    },
    batchDropdown: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#C7D2FE',
        minWidth: 100,
        justifyContent: 'space-between'
    },
    batchDropdownText: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#6366F1',
        marginRight: 8
    },
    dropdownList: {
        backgroundColor: '#FFF',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        marginTop: 4,
        overflow: 'hidden',
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4
    },
    dropdownItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6'
    },
    dropdownItemActive: {
        backgroundColor: '#EEF2FF'
    },
    dropdownItemText: {
        fontSize: 13,
        fontFamily: 'Poppins_500Medium',
        color: '#374151'
    },
    dropdownItemTextActive: {
        color: '#6366F1',
        fontFamily: 'Poppins_600SemiBold'
    },
    batchPreview: {
        marginTop: 12,
        backgroundColor: '#FFF',
        padding: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#E5E7EB'
    },
    batchPreviewTitle: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
        color: '#111827',
        marginBottom: 2
    },
    batchPreviewSubtitle: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280'
    },
    batchCard: {
        backgroundColor: '#F9FAFB',
        padding: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        marginRight: 10,
        minWidth: 110
    },
    batchCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 6
    },
    batchCardTitle: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
        color: '#4338CA'
    },
    batchUserCount: {
        backgroundColor: '#6366F1',
        width: 22,
        height: 22,
        borderRadius: 11,
        justifyContent: 'center',
        alignItems: 'center'
    },
    batchUserCountText: {
        fontSize: 10,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF'
    },
    batchTimeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4
    },
    batchTimeText: {
        fontSize: 11,
        fontFamily: 'Poppins_500Medium',
        color: '#6366F1'
    },

    // Batch Review Styles (Step 4)
    batchReviewContainer: {
        backgroundColor: '#EEF2FF',
        padding: 14,
        borderRadius: 12,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#C7D2FE'
    },
    batchReviewTitle: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#4338CA',
        marginBottom: 10
    },
    batchReviewRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: '#C7D2FE'
    },
    batchReviewLabel: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
        color: '#4338CA',
        width: 70
    },
    batchReviewTime: {
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
        color: '#374151',
        flex: 1
    },
    batchReviewUsers: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280'
    },

    // NEW: Customizable Batch System Styles
    batchConfigRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 12,
        marginTop: 12
    },
    batchConfigItem: {
        flex: 1
    },
    batchConfigLabel: {
        fontSize: 11,
        fontFamily: 'Poppins_500Medium',
        color: '#6B7280',
        marginBottom: 4
    },
    batchConfigInput: {
        backgroundColor: '#FFF',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        color: '#111827',
        textAlign: 'center'
    },
    redistributeBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#6366F1',
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 8,
        gap: 6
    },
    redistributeBtnText: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF'
    },
    batchStatsRow: {
        flexDirection: 'row',
        backgroundColor: '#FFF',
        borderRadius: 10,
        padding: 12,
        marginTop: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB'
    },
    batchStat: {
        flex: 1,
        alignItems: 'center'
    },
    batchStatValue: {
        fontSize: 18,
        fontFamily: 'Poppins_700Bold',
        color: '#6366F1'
    },
    batchStatLabel: {
        fontSize: 10,
        fontFamily: 'Poppins_400Regular',
        color: '#9CA3AF',
        marginTop: 2
    },
    batchStatDivider: {
        width: 1,
        backgroundColor: '#E5E7EB',
        marginHorizontal: 8
    },
    batchCardsContainer: {
        marginTop: 14
    },
    batchCardsHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10
    },
    batchCardsTitle: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
        color: '#111827'
    },
    batchCardsSubtitle: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        color: '#9CA3AF'
    },
    editableBatchCard: {
        backgroundColor: '#FFF',
        borderRadius: 12,
        padding: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        shadowColor: '#6366F1',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 2
    },
    editableBatchHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12
    },
    batchBadge: {
        backgroundColor: '#6366F1',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6
    },
    batchBadgeText: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF'
    },
    batchUsersBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#EEF2FF',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
        gap: 4
    },
    batchUsersText: {
        fontSize: 11,
        fontFamily: 'Poppins_500Medium',
        color: '#6366F1'
    },
    batchTimingEditRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10
    },
    timeInputGroup: {
        flex: 1
    },
    timeInputLabel: {
        fontSize: 10,
        fontFamily: 'Poppins_500Medium',
        color: '#9CA3AF',
        marginBottom: 4,
        textAlign: 'center'
    },
    timeInput: {
        backgroundColor: '#F9FAFB',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 8,
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
        color: '#111827',
        textAlign: 'center'
    },
    batchUserPreview: {
        marginTop: 8,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: '#F3F4F6'
    },
    miniUserChip: {
        backgroundColor: '#F3F4F6',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 16,
        marginRight: 6
    },
    miniUserChipText: {
        fontSize: 11,
        fontFamily: 'Poppins_500Medium',
        color: '#4B5563',
        maxWidth: 60
    },
    miniUserChipMore: {
        backgroundColor: '#6366F1',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 16
    },
    miniUserChipMoreText: {
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF'
    },
    batchEmptyState: {
        alignItems: 'center',
        paddingVertical: 24,
        gap: 8
    },
    batchEmptyText: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#9CA3AF',
        textAlign: 'center'
    },

    // Enhanced Features Styles (NEW)
    enhancedFeaturesContainer: {
        backgroundColor: '#FFF',
        borderRadius: 14,
        padding: 16,
        marginTop: 16,
        borderWidth: 1,
        borderColor: '#E5E7EB'
    },
    sectionTitle: {
        fontSize: 15,
        fontFamily: 'Poppins_700Bold',
        color: '#111827',
        marginBottom: 12
    },
    toggleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 8
    },
    toggleLabelContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        gap: 10
    },
    toggleLabel: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#374151'
    },
    toggleDescription: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#9CA3AF',
        marginTop: 2
    },
    statusSwitchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8
    },
    statusLabel: {
        fontSize: 13,
        fontFamily: 'Poppins_500Medium',
        color: '#9CA3AF'
    },
    statusLabelActive: {
        color: '#6366F1',
        fontFamily: 'Poppins_700Bold'
    },
    switchButton: {
        width: 48,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#D1D5DB',
        justifyContent: 'center',
        paddingHorizontal: 2,
        position: 'relative'
    },
    switchButtonActive: {
        backgroundColor: '#6366F1'
    },
    switchCircle: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#FFF',
        position: 'absolute',
        left: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
        elevation: 2
    },
    switchCircleActive: {
        left: 22
    },
    warningBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFBEB',
        borderRadius: 10,
        padding: 12,
        marginTop: 12,
        gap: 8,
        borderWidth: 1,
        borderColor: '#FDE68A'
    },
    warningText: {
        flex: 1,
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#92400E',
        lineHeight: 18
    },

    // Batch Edit Button & Info
    editBatchBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#EEF2FF',
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 8,
        gap: 4,
        borderWidth: 1,
        borderColor: '#C7D2FE'
    },
    editBatchBtnText: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
        color: '#6366F1'
    },
    batchQuickInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 8,
        gap: 12
    },
    batchInfoItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        flex: 1
    },
    batchInfoText: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
        flex: 1
    },
    batchNoUsers: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#9CA3AF',
        fontStyle: 'italic',
        textAlign: 'center',
        marginTop: 8,
        paddingVertical: 8
    },
    getCurrentLocationBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#10B981',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 8,
        marginTop: 12,
        gap: 8
    },
    getCurrentLocationText: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFFFFF'
    },

    // ========== PREMIUM EXAM SETTINGS STYLES ==========
    examSettingsSection: {
        marginTop: 24,
        marginBottom: 16
    },
    examSettingsSectionTitle: {
        fontSize: 18,
        fontFamily: 'Poppins_700Bold',
        color: '#111827',
        marginBottom: 16
    },
    featureCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        marginBottom: 16,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 5,
        borderWidth: 1,
        borderColor: '#E5E7EB'
    },
    featureCardGradient: {
        paddingVertical: 16,
        paddingHorizontal: 18
    },
    featureCardHeader: {
        flexDirection: 'row',
        alignItems: 'center'
    },
    featureCardIconContainer: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.25)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 14
    },
    featureCardTitleContainer: {
        flex: 1
    },
    featureCardTitle: {
        fontSize: 17,
        fontFamily: 'Poppins_700Bold',
        color: '#FFFFFF',
        marginBottom: 2
    },
    featureCardSubtitle: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: 'rgba(255, 255, 255, 0.85)'
    },
    featureCardBody: {
        paddingHorizontal: 18,
        paddingVertical: 16
    },

    // Premium Toggle Styles
    premiumToggleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 10
    },
    premiumToggleInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        marginRight: 12
    },
    premiumToggleIcon: {
        width: 36,
        height: 36,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12
    },
    premiumToggleText: {
        flex: 1
    },
    premiumToggleLabel: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#1F2937',
        marginBottom: 2
    },
    premiumToggleDesc: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280'
    },
    premiumToggleDivider: {
        height: 1,
        backgroundColor: '#F3F4F6',
        marginVertical: 6
    },

    // Premium Switch (Toggle Button)
    premiumSwitch: {
        width: 52,
        height: 30,
        borderRadius: 15,
        backgroundColor: '#E5E7EB',
        justifyContent: 'center',
        paddingHorizontal: 3
    },
    premiumSwitchActive: {
        backgroundColor: '#6366F1'
    },
    premiumSwitchActiveGreen: {
        backgroundColor: '#10B981'
    },
    premiumSwitchActivePurple: {
        backgroundColor: '#8B5CF6'
    },
    premiumSwitchThumb: {
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: '#FFFFFF',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 3,
        elevation: 3
    },
    premiumSwitchThumbActive: {
        transform: [{ translateX: 20 }]
    },

    // Premium Input Section
    premiumInputSection: {
        marginTop: 16,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#F3F4F6'
    },
    premiumInputGroup: {},
    premiumInputLabel: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
        color: '#374151',
        marginBottom: 8
    },
    premiumInputRow: {
        flexDirection: 'row',
        alignItems: 'center'
    },
    premiumInput: {
        flex: 1,
        backgroundColor: '#F9FAFB',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 15,
        fontFamily: 'Poppins_500Medium',
        color: '#111827'
    },
    premiumInputUnit: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: '#6B7280',
        marginLeft: 10,
        minWidth: 30
    },
    premiumHintBox: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: '#F9FAFB',
        borderRadius: 10,
        padding: 12,
        marginTop: 14,
        gap: 10
    },
    premiumHintText: {
        flex: 1,
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
        lineHeight: 18
    }
});
