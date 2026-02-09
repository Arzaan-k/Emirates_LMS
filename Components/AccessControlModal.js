import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    Dimensions,
    Platform,
    TextInput,
    ScrollView,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import API_URL from '../config';
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

const { width } = Dimensions.get('window');

// Fallback levels in case API fails
const DEFAULT_LEVELS = ['Waffler', 'Silver Waffler', 'Gold Waffler', 'Shift Manager', 'Assistant Store Manager'];

export default function AccessControlModal({ visible, onClose }) {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [savingCurriculum, setSavingCurriculum] = useState(null); // Track which level curriculum is being saved
    const [buckets, setBuckets] = useState([]);
    const [allCourses, setAllCourses] = useState([]);
    const [accessRules, setAccessRules] = useState({});
    const [levelData, setLevelData] = useState([]); // Full level objects from API
    const [hasLevelChanges, setHasLevelChanges] = useState(false);

    // Web drag-and-drop state
    const [draggedLevelIndex, setDraggedLevelIndex] = useState(null);
    const [dragOverLevelIndex, setDragOverLevelIndex] = useState(null);

    // State for course assignments per level
    // Structure: { "level_0": ["course_id_1", "course_id_2"], "level_1": [...] }
    const [stagedAssignments, setStagedAssignments] = useState({});

    const [expandedRole, setExpandedRole] = useState(null);

    // Quiz management state (per-level)
    const [levelQuizzes, setLevelQuizzes] = useState({}); // { levelName: { questions: [], source: '', loading: false } }
    const [quizSaving, setQuizSaving] = useState(null); // levelName currently saving
    const [editingQuestionKey, setEditingQuestionKey] = useState(null); // "levelName:index"
    const [editForm, setEditForm] = useState({ question: '', options: ['', '', '', ''], correctIndex: 0 });

    // Toast notification state
    const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });

    // Show toast notification (works on web and mobile)
    const showToast = (message, type = 'success') => {
        console.log('Showing toast:', message, type); // Debug log
        setToast({ visible: true, message, type });
        setTimeout(() => {
            setToast({ visible: false, message: '', type: 'success' });
        }, 4000);
    };

    // AI generation controls per level
    const [aiGenConfigByLevel, setAiGenConfigByLevel] = useState({}); // { [levelName]: { numQuestions: number, difficulty: 'easy'|'medium'|'hard' } }

    // Bulk upload state
    const [bulkUploadLevelName, setBulkUploadLevelName] = useState(null);
    const [bulkUploadText, setBulkUploadText] = useState('');

    useEffect(() => {
        if (visible) {
            fetchData();
        }
    }, [visible]);

    const getAuthHeaders = async () => {
        const token = (await AsyncStorage.getItem('userToken')) || (await AsyncStorage.getItem('accessToken'));
        return {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        };
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Dynamic Levels from backend
            const levelsRes = await fetch(`${API_URL}/api/v1/levels/`);
            const levelsData = await levelsRes.json();
            const levels = levelsData.levels || [];

            // Sort by order
            const sortedLevels = levels.sort((a, b) => a.order - b.order);
            setLevelData(sortedLevels);

            // 2. Fetch Buckets
            const bucketRes = await fetch(`${API_URL}/api/v1/content/buckets/all`);
            const bucketData = await bucketRes.json();
            setBuckets(bucketData || []);

            // 3. Fetch All Courses - Career Progression courses for curriculum assignment
            const courseRes = await fetch(`${API_URL}/api/v1/content/`);
            const courseData = await courseRes.json();
            const careerProgressionCourses = (courseData || []).filter(c => {
                const pathType = c.learning_path_type || 'career_progression';
                const isPath = c.isPathNode === true || c.isPathNode === 'true';
                return pathType !== 'self_learning' && isPath;
            });
            setAllCourses(careerProgressionCourses);

            // 4. Fetch Access Rules
            const rulesRes = await fetch(`${API_URL}/api/v1/levels/access-rules`);
            const rulesData = await rulesRes.json();

            // Initialize staged assignments from existing rules (by level name)
            const initialStaged = {};
            sortedLevels.forEach(level => {
                const roleRules = rulesData[level.name] || {};
                initialStaged[level.id] = roleRules.accessible_courses || [];
            });
            setStagedAssignments(initialStaged);
            setAccessRules(rulesData);
            setHasLevelChanges(false);

        } catch (e) {
            console.error("Error fetching access control data:", e);
            Alert.alert("Error", "Failed to load hierarchy configurations.");
        } finally {
            setLoading(false);
        }
    };

    // =========================================================================
    // DRAG-AND-DROP: REORDER LEVELS
    // =========================================================================
    const handleLevelDragEnd = useCallback(({ data }) => {
        setLevelData(data);
        setHasLevelChanges(true);
    }, []);

    const saveLevelOrder = async () => {
        setSaving(true);
        try {
            const levelOrder = levelData.map(l => l.id);
            const response = await fetch(`${API_URL}/api/v1/levels/reorder`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ level_order: levelOrder }),
            });

            if (!response.ok) throw new Error('Failed to save level order');

            const data = await response.json();
            setLevelData(data.levels);
            setHasLevelChanges(false);
            showToast('Level order saved successfully!', 'success');
        } catch (error) {
            console.error('Failed to save level order:', error);
            showToast('Failed to save level order. Please try again.', 'error');
        } finally {
            setSaving(false);
        }
    };

    // =========================================================================
    // COURSE MANAGEMENT WITHIN LEVELS
    // =========================================================================
    const toggleCourse = (levelId, courseId) => {
        setStagedAssignments(prev => {
            const currentCourses = prev[levelId] || [];
            if (currentCourses.includes(courseId)) {
                return { ...prev, [levelId]: currentCourses.filter(id => id !== courseId) };
            } else {
                return { ...prev, [levelId]: [...currentCourses, courseId] };
            }
        });
    };

    const handleSaveCourses = async (level) => {
        console.log('=== handleSaveCourses called ===');
        console.log('Level:', level);
        setSavingCurriculum(level.id);
        try {
            const courses = stagedAssignments[level.id] || [];
            const existingRules = accessRules[level.name] || {};
            console.log('Courses to save:', courses);

            const formData = new FormData();
            formData.append('accessible_courses', JSON.stringify(courses));
            formData.append('accessible_buckets', JSON.stringify(existingRules.accessible_buckets || []));
            formData.append('max_courses_visible', String(existingRules.max_courses_visible || -1));

            console.log('Calling API:', `${API_URL}/api/v1/levels/access-rules/${level.name}`);
            const res = await fetch(`${API_URL}/api/v1/levels/access-rules/${level.name}`, {
                method: 'PUT',
                body: formData
            });

            const result = await res.json();
            console.log('API Response:', result);

            if (result.status === 'success') {
                console.log('Calling showToast for success');
                showToast(`${level.name} curriculum saved successfully! ${courses.length} courses assigned.`, 'success');
                setAccessRules({
                    ...accessRules,
                    [level.name]: { ...existingRules, accessible_courses: courses }
                });
            } else {
                console.log('Calling showToast for error:', result.message);
                showToast(result.message || 'Failed to save changes.', 'error');
            }
        } catch (e) {
            console.error('Error saving curriculum:', e);
            showToast('Failed to save curriculum. Please check your connection and try again.', 'error');
        } finally {
            setSavingCurriculum(null);
        }
    };

    // =========================================================================
    // QUIZ MANAGEMENT FUNCTIONS
    // =========================================================================
    const confirmAction = (title, message, onConfirm) => {
        if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.confirm === 'function') {
            const ok = window.confirm(`${title}\n\n${message}`);
            if (ok) {
                // Handle both sync and async callbacks
                Promise.resolve(onConfirm()).catch(err => {
                    console.error('confirmAction callback error:', err);
                });
            }
            return;
        }

        // For mobile, use Alert.alert
        import('react-native').then(({ Alert }) => {
            Alert.alert(
                title,
                message,
                [
                    { text: 'Cancel', style: 'cancel' },
                    {
                        text: 'Confirm', style: 'destructive', onPress: () => {
                            Promise.resolve(onConfirm()).catch(err => {
                                console.error('confirmAction callback error:', err);
                            });
                        }
                    },
                ]
            );
        });
    };

    const fetchQuizForLevel = async (levelName) => {
        setLevelQuizzes(prev => ({ ...prev, [levelName]: { ...(prev[levelName] || {}), loading: true } }));
        try {
            const headers = await getAuthHeaders();
            const response = await fetch(`${API_URL}/api/v1/levels/exam-questions/${encodeURIComponent(levelName)}`, { headers });
            if (!response.ok) {
                const txt = await response.text();
                throw new Error(`Fetch failed (${response.status}): ${txt}`);
            }
            const data = await response.json();
            if (data.status === 'success' && data.data) {
                setAiGenConfigByLevel(prev => ({
                    ...prev,
                    [levelName]: prev[levelName] || { numQuestions: Math.max(1, Math.min(50, (data.data.questions || []).length || 10)), difficulty: 'medium' }
                }));
                setLevelQuizzes(prev => ({
                    ...prev,
                    [levelName]: {
                        questions: data.data.questions || [],
                        source: data.data.source || null,
                        loading: false,
                    }
                }));
            } else {
                setLevelQuizzes(prev => ({ ...prev, [levelName]: { questions: [], source: null, loading: false } }));
            }
        } catch (error) {
            console.error('Failed to fetch quiz for', levelName, error);
            if (`${error?.message || ''}`.includes('401') || `${error?.message || ''}`.includes('403')) {
                Alert.alert('Unauthorized', 'Your session may have expired. Please log in again.');
            }
            setLevelQuizzes(prev => ({ ...prev, [levelName]: { questions: [], source: null, loading: false } }));
        }
    };

    const saveQuizPayload = async (levelName, questions) => {
        const headers = await getAuthHeaders();
        if (!headers.Authorization) {
            Alert.alert('Unauthorized', 'Missing auth token. Please log in again.');
            return { ok: false };
        }

        const response = await fetch(`${API_URL}/api/v1/levels/exam-questions/${encodeURIComponent(levelName)}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({ questions, updated_by: 'admin' }),
        });

        if (!response.ok) {
            const txt = await response.text();
            throw new Error(`Save failed (${response.status}): ${txt}`);
        }
        return await response.json();
    };

    const saveQuizForLevel = async (levelName) => {
        const quizData = levelQuizzes[levelName];
        if (!quizData) return;
        setQuizSaving(levelName);
        try {
            const data = await saveQuizPayload(levelName, quizData.questions);
            if (data.status === 'success') {
                showToast(`Quiz questions saved for ${levelName}! ${quizData.questions.length} questions.`, 'success');
                setLevelQuizzes(prev => ({
                    ...prev,
                    [levelName]: { ...prev[levelName], source: data.data?.source || 'manual' }
                }));
            } else {
                showToast(data.message || 'Failed to save questions', 'error');
            }
        } catch (error) {
            console.error('Failed to save quiz:', error);
            showToast('Failed to save quiz questions. Please try again.', 'error');
        } finally {
            setQuizSaving(null);
        }
    };

    const regenerateQuizForLevel = async (levelName) => {
        const cfg = aiGenConfigByLevel[levelName] || { numQuestions: 10, difficulty: 'medium' };
        const numQuestions = Math.max(1, Math.min(50, parseInt(cfg.numQuestions, 10) || 10));
        const difficulty = (cfg.difficulty || 'medium').toString().toLowerCase();

        confirmAction(
            'Regenerate Questions',
            `This will overwrite all existing questions for ${levelName} with AI-generated ones.\n\nQuestions: ${numQuestions}\nDifficulty: ${difficulty}\n\nContinue?`,
            async () => {
                setLevelQuizzes(prev => ({ ...prev, [levelName]: { ...(prev[levelName] || {}), loading: true } }));
                try {
                    const headers = await getAuthHeaders();
                    const qs = `?num_questions=${encodeURIComponent(numQuestions)}&difficulty=${encodeURIComponent(difficulty)}`;
                    const response = await fetch(`${API_URL}/api/v1/levels/exam-questions/${encodeURIComponent(levelName)}/regenerate${qs}`, {
                        method: 'POST',
                        headers,
                    });
                    if (!response.ok) {
                        const txt = await response.text();
                        throw new Error(`AI generate failed (${response.status}): ${txt}`);
                    }
                    const data = await response.json();
                    if (data.status === 'success' && data.data) {
                        setLevelQuizzes(prev => ({
                            ...prev,
                            [levelName]: { questions: data.data.questions || [], source: 'ai_generated', loading: false }
                        }));
                        showToast(`Generated ${data.data.question_count} questions for ${levelName}!`, 'success');
                    } else {
                        showToast(data.message || 'Failed to regenerate', 'error');
                        setLevelQuizzes(prev => ({ ...prev, [levelName]: { ...(prev[levelName] || {}), loading: false } }));
                    }
                } catch (error) {
                    console.error('Failed to regenerate quiz:', error);
                    const msg = error?.message || 'Failed to regenerate questions';
                    showToast(msg, 'error');
                    setLevelQuizzes(prev => ({ ...prev, [levelName]: { ...(prev[levelName] || {}), loading: false } }));
                }
            }
        );
    };

    const openBulkUpload = (levelName) => {
        setBulkUploadLevelName(levelName);
        setBulkUploadText('');
    };

    const parseQuizRows = (rows) => {
        // rows: [{question, option_a, option_b, option_c, option_d, correct_index}] or CSV equivalents
        const normalized = rows
            .filter(r => r && Object.values(r).some(v => (v ?? '').toString().trim() !== ''))
            .map((r, idx) => {
                const question = (r.question ?? r.Question ?? '').toString();
                const options = [
                    (r.option_a ?? r.OptionA ?? r.optionA ?? r.a ?? r.A ?? '').toString(),
                    (r.option_b ?? r.OptionB ?? r.optionB ?? r.b ?? r.B ?? '').toString(),
                    (r.option_c ?? r.OptionC ?? r.optionC ?? r.c ?? r.C ?? '').toString(),
                    (r.option_d ?? r.OptionD ?? r.optionD ?? r.d ?? r.D ?? '').toString(),
                ].filter(o => o !== undefined);

                let correctIndexRaw = r.correct_index ?? r.correctIndex ?? r.CorrectIndex ?? r.correct ?? r.Correct ?? 0;
                const correctIndex = Number.parseInt(correctIndexRaw, 10);

                if (!question.trim()) {
                    throw new Error(`Row ${idx + 1}: missing question`);
                }

                const cleanedOptions = options.map(o => (o ?? '').toString());
                const nonEmptyOptions = cleanedOptions.filter(o => o.trim()).length;
                if (nonEmptyOptions < 2) {
                    throw new Error(`Row ${idx + 1}: must have at least 2 options`);
                }
                if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= cleanedOptions.length) {
                    throw new Error(`Row ${idx + 1}: correct_index must be 0-${cleanedOptions.length - 1}`);
                }

                return {
                    question,
                    options: cleanedOptions,
                    correctIndex,
                };
            });

        return normalized;
    };

    const parseCsvTextToRows = (csvText) => {
        // Minimal CSV parser (supports quoted values)
        const lines = csvText.split(/\r?\n/).filter(l => l.trim() !== '');
        if (lines.length === 0) return [];

        const parseLine = (line) => {
            const result = [];
            let current = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
                const ch = line[i];
                if (ch === '"') {
                    if (inQuotes && line[i + 1] === '"') {
                        current += '"';
                        i++;
                    } else {
                        inQuotes = !inQuotes;
                    }
                } else if (ch === ',' && !inQuotes) {
                    result.push(current);
                    current = '';
                } else {
                    current += ch;
                }
            }
            result.push(current);
            return result.map(v => v.trim());
        };

        const headers = parseLine(lines[0]);
        return lines.slice(1).map((line) => {
            const values = parseLine(line);
            const obj = {};
            headers.forEach((h, idx) => {
                obj[h] = values[idx] ?? '';
            });
            return obj;
        });
    };

    const pickAndImportQuizFile = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: [
                    'text/csv',
                    'application/vnd.ms-excel',
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    '*/*'
                ],
                copyToCacheDirectory: true,
                multiple: false,
            });

            if (result.canceled || !result.assets || !result.assets[0]) return;
            const file = result.assets[0];
            const name = file.name || '';
            const ext = name.split('.').pop()?.toLowerCase();

            let rows = [];
            if (ext === 'csv') {
                const csvText = await FileSystem.readAsStringAsync(file.uri);
                rows = parseCsvTextToRows(csvText);
            } else if (ext === 'xlsx' || ext === 'xls') {
                // Read file as base64, then parse via XLSX
                const base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
                const workbook = XLSX.read(base64, { type: 'base64' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
            } else {
                Alert.alert('Unsupported File', 'Please upload a .csv or .xlsx file.');
                return;
            }

            const questions = parseQuizRows(rows);
            setLevelQuizzes(prev => ({
                ...prev,
                [bulkUploadLevelName]: {
                    ...(prev[bulkUploadLevelName] || {}),
                    questions,
                    source: 'manual',
                    loading: false,
                }
            }));
            setEditingQuestionKey(null);

            // Auto-publish to backend so app can read it immediately
            setQuizSaving(bulkUploadLevelName);
            try {
                const data = await saveQuizPayload(bulkUploadLevelName, questions);
                if (data?.status === 'success') {
                    setLevelQuizzes(prev => ({
                        ...prev,
                        [bulkUploadLevelName]: { ...prev[bulkUploadLevelName], source: data.data?.source || 'manual' }
                    }));
                    Alert.alert('Imported & Published', `Imported ${questions.length} questions and published to app.`);
                } else {
                    Alert.alert('Imported', `Imported ${questions.length} questions. Please click "Save Quiz" to publish.`);
                }
            } finally {
                setQuizSaving(null);
            }
        } catch (e) {
            console.error('Bulk import failed', e);
            Alert.alert('Import Failed', e?.message || 'Failed to import file');
        }
    };

    const getQuizTemplateRows = () => ([
        {
            question: 'Example question?',
            option_a: 'Option A',
            option_b: 'Option B',
            option_c: 'Option C',
            option_d: 'Option D',
            correct_index: 0,
        }
    ]);

    const getCurrentQuizRows = () => {
        const qs = levelQuizzes[bulkUploadLevelName]?.questions || [];
        return qs.map(q => ({
            question: q.question,
            option_a: q.options?.[0] ?? '',
            option_b: q.options?.[1] ?? '',
            option_c: q.options?.[2] ?? '',
            option_d: q.options?.[3] ?? '',
            correct_index: q.correctIndex ?? 0,
        }));
    };

    const downloadTextFileWeb = (filename, text, mimeType) => {
        const blob = new Blob([text], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };

    const downloadUtf8FileNative = async (filename, text, mimeType) => {
        const targetUri = `${FileSystem.cacheDirectory}${filename}`;
        await FileSystem.writeAsStringAsync(targetUri, text, { encoding: FileSystem.EncodingType.UTF8 });
        if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(targetUri, { mimeType });
        } else {
            Alert.alert('Sharing Unavailable', `File saved to cache: ${targetUri}`);
        }
    };

    const downloadBase64FileNative = async (filename, base64, mimeType) => {
        const targetUri = `${FileSystem.cacheDirectory}${filename}`;
        await FileSystem.writeAsStringAsync(targetUri, base64, { encoding: FileSystem.EncodingType.Base64 });
        if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(targetUri, { mimeType });
        } else {
            Alert.alert('Sharing Unavailable', `File saved to cache: ${targetUri}`);
        }
    };

    const exportQuizAsCsv = async (mode) => {
        if (!bulkUploadLevelName) return;
        const rows = mode === 'current' ? getCurrentQuizRows() : getQuizTemplateRows();
        const headers = ['question', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_index'];
        const escape = (v) => {
            const s = (v ?? '').toString();
            if (s.includes('"') || s.includes(',') || s.includes('\n')) {
                return '"' + s.replace(/"/g, '""') + '"';
            }
            return s;
        };
        const lines = [headers.join(',')].concat(
            rows.map(r => headers.map(h => escape(r[h])).join(','))
        );
        const csv = lines.join('\n');
        const filename = `${bulkUploadLevelName}_${mode === 'current' ? 'quiz_export' : 'quiz_template'}.csv`;

        if (Platform.OS === 'web') {
            downloadTextFileWeb(filename, csv, 'text/csv');
            return;
        }

        await downloadUtf8FileNative(filename, csv, 'text/csv');
    };

    const exportQuizAsExcel = async (mode) => {
        if (!bulkUploadLevelName) return;
        const rows = mode === 'current' ? getCurrentQuizRows() : getQuizTemplateRows();
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Quiz');
        const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
        const filename = `${bulkUploadLevelName}_${mode === 'current' ? 'quiz_export' : 'quiz_template'}.xlsx`;

        if (Platform.OS === 'web') {
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            return;
        }

        await downloadBase64FileNative(
            filename,
            base64,
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
    };

    const applyBulkUpload = () => {
        if (!bulkUploadLevelName) return;

        let parsed;
        try {
            parsed = JSON.parse(bulkUploadText);
        } catch (e) {
            Alert.alert('Invalid JSON', 'Please paste a valid JSON array of questions.');
            return;
        }

        if (!Array.isArray(parsed)) {
            Alert.alert('Invalid Format', 'Bulk upload must be a JSON array.');
            return;
        }

        const normalized = parsed.map((q, idx) => {
            const question = (q?.question ?? '').toString();
            const options = Array.isArray(q?.options) ? q.options.map(o => (o ?? '').toString()) : [];
            const correctIndex = Number.isInteger(q?.correctIndex) ? q.correctIndex : 0;

            if (!question.trim()) {
                throw new Error(`Question ${idx + 1}: missing 'question'`);
            }
            if (options.length < 2) {
                throw new Error(`Question ${idx + 1}: must have at least 2 options`);
            }
            if (correctIndex < 0 || correctIndex >= options.length) {
                throw new Error(`Question ${idx + 1}: 'correctIndex' out of range`);
            }
            return { question, options, correctIndex };
        });

        setLevelQuizzes(prev => ({
            ...prev,
            [bulkUploadLevelName]: {
                ...(prev[bulkUploadLevelName] || {}),
                questions: normalized,
                source: 'manual',
                loading: false,
            }
        }));

        setEditingQuestionKey(null);

        // Auto-publish to backend so app can read it immediately
        (async () => {
            setQuizSaving(bulkUploadLevelName);
            try {
                const data = await saveQuizPayload(bulkUploadLevelName, normalized);
                if (data?.status === 'success') {
                    setLevelQuizzes(prev => ({
                        ...prev,
                        [bulkUploadLevelName]: { ...prev[bulkUploadLevelName], source: data.data?.source || 'manual' }
                    }));
                    Alert.alert('Imported & Published', `Imported ${normalized.length} questions and published to app.`);
                    setBulkUploadLevelName(null);
                    setBulkUploadText('');
                } else {
                    Alert.alert('Imported', `Imported ${normalized.length} questions. Please click "Save Quiz" to publish.`);
                }
            } catch (e) {
                Alert.alert('Publish Failed', e?.message || 'Failed to publish imported questions');
            } finally {
                setQuizSaving(null);
            }
        })();
    };

    const updateQuizQuestion = (levelName, index, updatedQuestion) => {
        setLevelQuizzes(prev => {
            const current = prev[levelName] || { questions: [] };
            const updated = [...current.questions];
            updated[index] = { ...updated[index], ...updatedQuestion };
            return { ...prev, [levelName]: { ...current, questions: updated } };
        });
    };

    const addQuizQuestion = (levelName) => {
        const newQ = { question: 'New Question', options: ['Option A', 'Option B', 'Option C', 'Option D'], correctIndex: 0 };
        setLevelQuizzes(prev => {
            const current = prev[levelName] || { questions: [] };
            return { ...prev, [levelName]: { ...current, questions: [...current.questions, newQ] } };
        });
        const newIdx = (levelQuizzes[levelName]?.questions || []).length;
        setEditForm({ question: 'New Question', options: ['Option A', 'Option B', 'Option C', 'Option D'], correctIndex: 0 });
        setEditingQuestionKey(`${levelName}:${newIdx}`);
    };

    const deleteQuizQuestion = (levelName, index) => {
        confirmAction(
            'Delete Question',
            `Delete question ${index + 1}?`,
            async () => {
                // Get current questions and filter out the deleted one
                const current = levelQuizzes[levelName] || { questions: [] };
                const updatedQuestions = current.questions.filter((_, i) => i !== index);

                // Update local state first
                setLevelQuizzes(prev => ({
                    ...prev,
                    [levelName]: { ...current, questions: updatedQuestions }
                }));
                if (editingQuestionKey === `${levelName}:${index}`) setEditingQuestionKey(null);

                // Now persist to database
                try {
                    setQuizSaving(levelName);
                    const data = await saveQuizPayload(levelName, updatedQuestions);
                    if (data.status === 'success') {
                        showToast(`Question deleted successfully! ${updatedQuestions.length} questions remaining.`, 'success');
                    } else {
                        showToast('Failed to save deletion to database.', 'error');
                    }
                } catch (error) {
                    console.error('Failed to save quiz after deletion:', error);
                    showToast('Failed to save deletion. Please try again.', 'error');
                } finally {
                    setQuizSaving(null);
                }
            }
        );
    };

    const startEditQuestion = (levelName, index) => {
        const q = levelQuizzes[levelName]?.questions[index];
        if (!q) return;
        setEditForm({
            question: q.question || '',
            options: [...(q.options || ['', '', '', ''])],
            correctIndex: q.correctIndex || 0,
        });
        setEditingQuestionKey(`${levelName}:${index}`);
    };

    const saveEditQuestion = (levelName, index) => {
        if (!editForm.question.trim()) { Alert.alert('Error', 'Question text is required'); return; }
        if (editForm.options.filter(o => o.trim()).length < 2) { Alert.alert('Error', 'At least 2 options required'); return; }
        updateQuizQuestion(levelName, index, {
            question: editForm.question,
            options: editForm.options,
            correctIndex: editForm.correctIndex,
        });
        setEditingQuestionKey(null);
    };

    // Auto-fetch quiz when a level is expanded
    useEffect(() => {
        if (expandedRole) {
            const level = levelData.find(l => l.id === expandedRole);
            if (level && !levelQuizzes[level.name]) {
                fetchQuizForLevel(level.name);
            }
        }
    }, [expandedRole]);

    // Handle course reorder within a level via drag-and-drop
    const handleCourseDragEnd = useCallback((levelId, newCourseOrder) => {
        setStagedAssignments(prev => ({
            ...prev,
            [levelId]: newCourseOrder
        }));
    }, []);

    // Get courses assigned to a level
    const getAssignedCourses = (levelId) => {
        const courseIds = stagedAssignments[levelId] || [];
        return courseIds.map(id => allCourses.find(c => c.id === id)).filter(Boolean);
    };

    // Get available courses not yet assigned to any level
    const getAvailableCourses = (currentLevelId) => {
        const allAssigned = new Set();
        Object.entries(stagedAssignments).forEach(([levelId, courseIds]) => {
            if (levelId !== currentLevelId) {
                courseIds.forEach(id => allAssigned.add(id));
            }
        });
        return allCourses.filter(c => !allAssigned.has(c.id));
    };

    const countSelectedCourses = (levelId) => {
        return (stagedAssignments[levelId] || []).length;
    };

    // Web-specific drag handlers for levels
    const handleWebLevelDragStart = (e, index) => {
        if (Platform.OS !== 'web') return;
        setDraggedLevelIndex(index);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', index.toString());
    };

    const handleWebLevelDragOver = (e, index) => {
        if (Platform.OS !== 'web') return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverLevelIndex(index);
    };

    const handleWebLevelDrop = (e, dropIndex) => {
        if (Platform.OS !== 'web' || draggedLevelIndex === null) return;
        e.preventDefault();

        const dragIndex = draggedLevelIndex;
        if (dragIndex === dropIndex) {
            setDraggedLevelIndex(null);
            setDragOverLevelIndex(null);
            return;
        }

        // Reorder levels
        const newLevels = [...levelData];
        const [draggedItem] = newLevels.splice(dragIndex, 1);
        newLevels.splice(dropIndex, 0, draggedItem);

        // Update order property
        const reorderedLevels = newLevels.map((level, idx) => ({
            ...level,
            order: idx + 1
        }));

        setLevelData(reorderedLevels);
        setHasLevelChanges(true);
        setDraggedLevelIndex(null);
        setDragOverLevelIndex(null);
    };

    const handleWebLevelDragEnd = () => {
        if (Platform.OS !== 'web') return;
        setDraggedLevelIndex(null);
        setDragOverLevelIndex(null);
    };

    // =========================================================================
    // RENDER LEVEL ITEM (DRAGGABLE)
    // =========================================================================
    const renderLevelItem = useCallback(({ item: level, drag, isActive }) => {
        const isExpanded = expandedRole === level.id;
        const selectedCount = countSelectedCourses(level.id);
        const assignedCourses = getAssignedCourses(level.id);
        const availableCourses = getAvailableCourses(level.id);

        return (
            <ScaleDecorator>
                <View style={[styles.levelContainer, isActive && styles.levelContainerActive]}>
                    {/* Level Header - Draggable */}
                    <TouchableOpacity
                        style={[styles.levelHeader, isExpanded && styles.levelHeaderActive]}
                        onPress={() => setExpandedRole(isExpanded ? null : level.id)}
                        onLongPress={drag}
                        delayLongPress={150}
                    >
                        {/* Drag Handle */}
                        <View style={styles.dragHandle}>
                            <MaterialCommunityIcons name="drag" size={20} color="#9CA3AF" />
                        </View>

                        <View style={[styles.levelIcon, { backgroundColor: level.color || '#6B7280' }]}>
                            <MaterialCommunityIcons
                                name={level.icon || 'medal-outline'}
                                size={24}
                                color="#FFF"
                            />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.levelTitle}>{level.name}</Text>
                            <Text style={styles.levelSubtitle}>
                                {selectedCount} courses • Order: {level.order}
                            </Text>
                        </View>
                        <Feather name={isExpanded ? "chevron-up" : "chevron-down"} size={20} color="#6B7280" />
                    </TouchableOpacity>

                    {/* Expanded Content - Course Assignment */}
                    {isExpanded && (
                        <View style={styles.levelContent}>
                            <Text style={styles.instructionText}>
                                📌 Long press level header to drag & reorder levels
                            </Text>
                            <Text style={styles.instructionText}>
                                ✅ Select courses for this level • Long press course to reorder
                            </Text>

                            {/* Assigned Courses (Draggable) */}
                            {assignedCourses.length > 0 && (
                                <View style={styles.sectionContainer}>
                                    <Text style={styles.sectionTitle}>
                                        Assigned Courses ({assignedCourses.length})
                                    </Text>
                                    <DraggableFlatList
                                        data={assignedCourses}
                                        onDragEnd={({ data }) => {
                                            handleCourseDragEnd(level.id, data.map(c => c.id));
                                        }}
                                        keyExtractor={(item) => item.id}
                                        renderItem={({ item: course, drag: courseDrag, isActive: courseActive }) => (
                                            <ScaleDecorator>
                                                <TouchableOpacity
                                                    style={[
                                                        styles.courseItem,
                                                        styles.assignedCourse,
                                                        courseActive && { backgroundColor: '#FEF3C7' }
                                                    ]}
                                                    onLongPress={courseDrag}
                                                    delayLongPress={100}
                                                    onPress={() => toggleCourse(level.id, course.id)}
                                                >
                                                    <MaterialCommunityIcons name="drag-vertical" size={18} color="#9CA3AF" />
                                                    <View style={[styles.checkbox, styles.checkboxSelected]}>
                                                        <Feather name="check" size={12} color="#FFF" />
                                                    </View>
                                                    <Text style={styles.courseTitle} numberOfLines={1}>
                                                        {course.title}
                                                    </Text>
                                                </TouchableOpacity>
                                            </ScaleDecorator>
                                        )}
                                        scrollEnabled={false}
                                    />
                                </View>
                            )}

                            {/* Available Courses */}
                            <View style={styles.sectionContainer}>
                                <Text style={styles.sectionTitle}>
                                    Available Courses ({availableCourses.length - assignedCourses.length})
                                </Text>
                                {availableCourses
                                    .filter(c => !(stagedAssignments[level.id] || []).includes(c.id))
                                    .slice(0, 10) // Show max 10 at a time for performance
                                    .map(course => (
                                        <TouchableOpacity
                                            key={course.id}
                                            style={styles.courseItem}
                                            onPress={() => toggleCourse(level.id, course.id)}
                                        >
                                            <View style={styles.checkbox} />
                                            <Text style={styles.courseTitle} numberOfLines={1}>
                                                {course.title}
                                            </Text>
                                            <Text style={styles.courseBucket}>
                                                {course.bucket || 'General'}
                                            </Text>
                                        </TouchableOpacity>
                                    ))
                                }
                            </View>

                            {/* ============================================ */}
                            {/* QUIZ MANAGEMENT SECTION (Inline) */}
                            {/* ============================================ */}
                            <View style={[styles.sectionContainer, { marginTop: 16 }]}>
                                <View style={qStyles.quizHeader}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.sectionTitle}>
                                            Level Advancement Quiz
                                        </Text>
                                        <Text style={{ fontSize: 11, color: '#6B7280', fontFamily: 'Poppins_400Regular' }}>
                                            {(levelQuizzes[level.name]?.questions || []).length} questions
                                            {levelQuizzes[level.name]?.source ? ` • ${levelQuizzes[level.name].source === 'ai_generated' ? 'AI Generated' : levelQuizzes[level.name].source === 'manual' ? 'Edited' : 'Mixed'}` : ''}
                                        </Text>
                                    </View>
                                    <View style={qStyles.quizActions}>
                                        <TouchableOpacity
                                            style={qStyles.addQBtn}
                                            onPress={() => addQuizQuestion(level.name)}
                                        >
                                            <Feather name="plus" size={14} color="#FFF" />
                                            <Text style={qStyles.addQBtnText}>Add</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={qStyles.bulkBtn}
                                            onPress={() => openBulkUpload(level.name)}
                                        >
                                            <MaterialCommunityIcons name="database-import-outline" size={14} color="#0EA5E9" />
                                            <Text style={qStyles.bulkBtnText}>Bulk Upload</Text>
                                        </TouchableOpacity>

                                        <View style={qStyles.aiConfigWrap}>
                                            <TextInput
                                                style={qStyles.aiNumInput}
                                                value={String(aiGenConfigByLevel[level.name]?.numQuestions ?? 10)}
                                                onChangeText={(t) => setAiGenConfigByLevel(prev => ({
                                                    ...prev,
                                                    [level.name]: {
                                                        ...(prev[level.name] || { difficulty: 'medium' }),
                                                        numQuestions: t.replace(/[^0-9]/g, ''),
                                                    }
                                                }))}
                                                keyboardType="numeric"
                                                placeholder="#"
                                            />
                                            <TouchableOpacity
                                                style={qStyles.aiDiffBtn}
                                                onPress={() => {
                                                    const current = (aiGenConfigByLevel[level.name]?.difficulty || 'medium');
                                                    const order = ['easy', 'medium', 'hard'];
                                                    const next = order[(order.indexOf(current) + 1) % order.length];
                                                    setAiGenConfigByLevel(prev => ({
                                                        ...prev,
                                                        [level.name]: {
                                                            ...(prev[level.name] || { numQuestions: 10 }),
                                                            difficulty: next,
                                                        }
                                                    }));
                                                }}
                                            >
                                                <Text style={qStyles.aiDiffBtnText}>
                                                    {(aiGenConfigByLevel[level.name]?.difficulty || 'medium').toUpperCase()}
                                                </Text>
                                            </TouchableOpacity>
                                        </View>

                                        <TouchableOpacity
                                            style={qStyles.regenBtn}
                                            onPress={() => regenerateQuizForLevel(level.name)}
                                            disabled={levelQuizzes[level.name]?.loading}
                                        >
                                            <MaterialCommunityIcons name="robot" size={14} color="#6366F1" />
                                            <Text style={qStyles.regenBtnText}>AI Generate</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[qStyles.saveQBtn, quizSaving === level.name && { opacity: 0.6 }]}
                                            onPress={() => saveQuizForLevel(level.name)}
                                            disabled={quizSaving === level.name}
                                        >
                                            {quizSaving === level.name ? (
                                                <ActivityIndicator size="small" color="#FFF" />
                                            ) : (
                                                <>
                                                    <Feather name="save" size={14} color="#FFF" />
                                                    <Text style={qStyles.saveQBtnText}>Save Quiz</Text>
                                                </>
                                            )}
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                {/* Quiz Questions List */}
                                {levelQuizzes[level.name]?.loading ? (
                                    <View style={{ padding: 20, alignItems: 'center' }}>
                                        <ActivityIndicator size="small" color="#F59E0B" />
                                        <Text style={{ marginTop: 6, fontSize: 12, color: '#6B7280' }}>Loading questions...</Text>
                                    </View>
                                ) : (levelQuizzes[level.name]?.questions || []).length === 0 ? (
                                    <View style={{ padding: 20, alignItems: 'center' }}>
                                        <MaterialCommunityIcons name="help-circle-outline" size={32} color="#D1D5DB" />
                                        <Text style={{ marginTop: 6, fontSize: 12, color: '#9CA3AF' }}>No quiz questions yet</Text>
                                        <Text style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'center', marginTop: 2 }}>
                                            Click "AI Generate" to auto-create from course content, or "Add" to create manually
                                        </Text>
                                    </View>
                                ) : (
                                    <View style={{ marginTop: 8 }}>
                                        {(levelQuizzes[level.name]?.questions || []).map((q, qIdx) => {
                                            const isEditing = editingQuestionKey === `${level.name}:${qIdx}`;
                                            return (
                                                <View key={qIdx} style={qStyles.questionCard}>
                                                    {isEditing ? (
                                                        /* EDIT MODE */
                                                        <View>
                                                            <Text style={qStyles.editLabel}>Editing Question {qIdx + 1}</Text>
                                                            <TextInput
                                                                style={qStyles.qInput}
                                                                value={editForm.question}
                                                                onChangeText={(t) => setEditForm({ ...editForm, question: t })}
                                                                placeholder="Enter question text"
                                                                multiline
                                                            />
                                                            {(editForm.options || []).map((opt, oIdx) => (
                                                                <View key={oIdx} style={qStyles.optionEditRow}>
                                                                    <TouchableOpacity
                                                                        style={[qStyles.correctToggle, editForm.correctIndex === oIdx && qStyles.correctToggleActive]}
                                                                        onPress={() => setEditForm({ ...editForm, correctIndex: oIdx })}
                                                                    >
                                                                        <Feather
                                                                            name={editForm.correctIndex === oIdx ? "check-circle" : "circle"}
                                                                            size={16}
                                                                            color={editForm.correctIndex === oIdx ? "#10B981" : "#9CA3AF"}
                                                                        />
                                                                    </TouchableOpacity>
                                                                    <TextInput
                                                                        style={[qStyles.qInput, { flex: 1, marginBottom: 0 }]}
                                                                        value={opt}
                                                                        onChangeText={(t) => {
                                                                            const newOpts = [...editForm.options];
                                                                            newOpts[oIdx] = t;
                                                                            setEditForm({ ...editForm, options: newOpts });
                                                                        }}
                                                                        placeholder={`Option ${oIdx + 1}`}
                                                                    />
                                                                </View>
                                                            ))}
                                                            <View style={qStyles.editBtnRow}>
                                                                <TouchableOpacity style={qStyles.cancelBtn} onPress={() => setEditingQuestionKey(null)}>
                                                                    <Text style={{ color: '#6B7280', fontSize: 13, fontFamily: 'Poppins_500Medium' }}>Cancel</Text>
                                                                </TouchableOpacity>
                                                                <TouchableOpacity style={qStyles.confirmBtn} onPress={() => saveEditQuestion(level.name, qIdx)}>
                                                                    <Feather name="check" size={14} color="#FFF" />
                                                                    <Text style={{ color: '#FFF', fontSize: 13, fontFamily: 'Poppins_600SemiBold', marginLeft: 4 }}>Done</Text>
                                                                </TouchableOpacity>
                                                            </View>
                                                        </View>
                                                    ) : (
                                                        /* VIEW MODE */
                                                        <View>
                                                            <View style={qStyles.qHeader}>
                                                                <Text style={qStyles.qNumber}>Q{qIdx + 1}</Text>
                                                                <View style={{ flexDirection: 'row', gap: 6 }}>
                                                                    <TouchableOpacity onPress={() => startEditQuestion(level.name, qIdx)} style={{ padding: 4 }}>
                                                                        <Feather name="edit-2" size={14} color="#F59E0B" />
                                                                    </TouchableOpacity>
                                                                    <TouchableOpacity onPress={() => deleteQuizQuestion(level.name, qIdx)} style={{ padding: 4 }}>
                                                                        <Feather name="trash-2" size={14} color="#EF4444" />
                                                                    </TouchableOpacity>
                                                                </View>
                                                            </View>
                                                            <Text style={qStyles.qText}>{q.question}</Text>
                                                            {(q.options || []).map((opt, oIdx) => (
                                                                <View key={oIdx} style={[qStyles.optionRow, oIdx === q.correctIndex && qStyles.correctOptionRow]}>
                                                                    <Text style={[qStyles.optionText, oIdx === q.correctIndex && { color: '#059669', fontFamily: 'Poppins_600SemiBold' }]}>
                                                                        {String.fromCharCode(65 + oIdx)}. {opt}
                                                                    </Text>
                                                                    {oIdx === q.correctIndex && (
                                                                        <Feather name="check-circle" size={12} color="#10B981" />
                                                                    )}
                                                                </View>
                                                            ))}
                                                        </View>
                                                    )}
                                                </View>
                                            );
                                        })}
                                    </View>
                                )}
                            </View>

                            {/* Save Button */}
                            <TouchableOpacity
                                style={[styles.saveBtn, savingCurriculum === level.id && styles.saveBtnDisabled]}
                                onPress={() => handleSaveCourses(level)}
                                disabled={savingCurriculum === level.id}
                            >
                                {savingCurriculum === level.id ? (
                                    <>
                                        <ActivityIndicator size="small" color="#FFF" />
                                        <Text style={[styles.saveBtnText, { marginLeft: 8 }]}>Saving...</Text>
                                    </>
                                ) : (
                                    <>
                                        <MaterialCommunityIcons name="content-save" size={18} color="#FFF" />
                                        <Text style={[styles.saveBtnText, { marginLeft: 8 }]}>Save {level.name} Curriculum</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            </ScaleDecorator>
        );
    }, [
        expandedRole,
        stagedAssignments,
        allCourses,
        levelQuizzes,
        aiGenConfigByLevel,
        quizSaving,
        editingQuestionKey,
        editForm,
        savingCurriculum
    ]);

    // =========================================================================
    // MAIN RENDER
    // =========================================================================
    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
            <GestureHandlerRootView style={{ flex: 1 }}>
                <View style={styles.container}>
                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <Feather name="x" size={24} color="#374151" />
                        </TouchableOpacity>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.headerTitle}>Curriculum Hierarchy</Text>
                            <Text style={styles.headerSubtitle}>
                                Drag to reorder levels & courses
                            </Text>
                        </View>
                        {hasLevelChanges && (
                            <TouchableOpacity
                                style={styles.saveLevelOrderBtn}
                                onPress={saveLevelOrder}
                                disabled={saving}
                            >
                                {saving ? (
                                    <ActivityIndicator size="small" color="#FFF" />
                                ) : (
                                    <>
                                        <Feather name="save" size={16} color="#FFF" />
                                        <Text style={styles.saveLevelOrderBtnText}>Save Order</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* Info Banner */}
                    <View style={styles.infoBanner}>
                        <MaterialCommunityIcons name="gesture-swipe" size={20} color="#6366F1" />
                        <Text style={styles.infoText}>
                            Long press to drag • Levels at top = lower rank (Waffler first)
                        </Text>
                    </View>

                    {loading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color="#F59E0B" />
                            <Text style={{ marginTop: 10, color: '#6B7280' }}>Loading Hierarchy...</Text>
                        </View>
                    ) : Platform.OS === 'web' ? (
                        /* WEB: Simplified UI with Buttons for Reordering */
                        <View style={styles.webContainer}>
                            {levelData.map((level, index) => {
                                const isExpanded = expandedRole === level.id;
                                const selectedCount = countSelectedCourses(level.id);
                                const assignedCourses = getAssignedCourses(level.id);
                                const availableCourses = getAvailableCourses(level.id);

                                return (
                                    <View key={level.id} style={styles.levelContainer}>
                                        {/* Level Header */}
                                        <View style={[styles.levelHeader, isExpanded && styles.levelHeaderActive]}>
                                            {/* Move Up/Down Buttons */}
                                            <View style={styles.moveButtonsContainer}>
                                                <TouchableOpacity
                                                    onPress={() => {
                                                        if (index > 0) {
                                                            const newLevels = [...levelData];
                                                            [newLevels[index - 1], newLevels[index]] = [newLevels[index], newLevels[index - 1]];
                                                            const reordered = newLevels.map((l, i) => ({ ...l, order: i + 1 }));
                                                            setLevelData(reordered);
                                                            setHasLevelChanges(true);
                                                        }
                                                    }}
                                                    disabled={index === 0}
                                                    style={[styles.moveButton, index === 0 && styles.moveButtonDisabled]}
                                                >
                                                    <MaterialCommunityIcons name="chevron-up" size={18} color={index === 0 ? "#D1D5DB" : "#6B7280"} />
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    onPress={() => {
                                                        if (index < levelData.length - 1) {
                                                            const newLevels = [...levelData];
                                                            [newLevels[index], newLevels[index + 1]] = [newLevels[index + 1], newLevels[index]];
                                                            const reordered = newLevels.map((l, i) => ({ ...l, order: i + 1 }));
                                                            setLevelData(reordered);
                                                            setHasLevelChanges(true);
                                                        }
                                                    }}
                                                    disabled={index === levelData.length - 1}
                                                    style={[styles.moveButton, index === levelData.length - 1 && styles.moveButtonDisabled]}
                                                >
                                                    <MaterialCommunityIcons name="chevron-down" size={18} color={index === levelData.length - 1 ? "#D1D5DB" : "#6B7280"} />
                                                </TouchableOpacity>
                                            </View>

                                            <TouchableOpacity
                                                style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
                                                onPress={() => setExpandedRole(isExpanded ? null : level.id)}
                                            >
                                                <View style={[styles.levelIcon, { backgroundColor: level.color || '#6B7280' }]}>
                                                    <MaterialCommunityIcons
                                                        name={level.icon || 'medal-outline'}
                                                        size={24}
                                                        color="#FFF"
                                                    />
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={styles.levelTitle}>{level.name}</Text>
                                                    <Text style={styles.levelSubtitle}>
                                                        {selectedCount} courses • Order: {level.order}
                                                    </Text>
                                                </View>
                                                <Feather name={isExpanded ? "chevron-up" : "chevron-down"} size={20} color="#6B7280" />
                                            </TouchableOpacity>
                                        </View>

                                        {/* Expanded Content - Course Assignment */}
                                        {isExpanded && (
                                            <View style={styles.levelContent}>
                                                <Text style={styles.instructionText}>
                                                    Use ↑↓ buttons to reorder levels • Click + to assign courses
                                                </Text>

                                                {/* Assigned Courses */}
                                                <View style={styles.sectionContainer}>
                                                    <Text style={styles.sectionTitle}>
                                                        Assigned Courses ({assignedCourses.length})
                                                    </Text>
                                                    {assignedCourses.length === 0 ? (
                                                        <Text style={styles.noCourses}>No courses assigned yet</Text>
                                                    ) : (
                                                        assignedCourses.map((course, courseIndex) => (
                                                            <View key={course.id} style={[styles.courseItem, styles.assignedCourse]}>
                                                                {/* Course Reorder Buttons */}
                                                                <View style={styles.courseReorderButtons}>
                                                                    <TouchableOpacity
                                                                        onPress={() => {
                                                                            if (courseIndex > 0) {
                                                                                const currentIds = stagedAssignments[level.id] || [];
                                                                                const newIds = [...currentIds];
                                                                                [newIds[courseIndex - 1], newIds[courseIndex]] = [newIds[courseIndex], newIds[courseIndex - 1]];
                                                                                setStagedAssignments(prev => ({ ...prev, [level.id]: newIds }));
                                                                            }
                                                                        }}
                                                                        disabled={courseIndex === 0}
                                                                        style={styles.smallMoveButton}
                                                                    >
                                                                        <MaterialCommunityIcons
                                                                            name="chevron-up"
                                                                            size={14}
                                                                            color={courseIndex === 0 ? "#D1D5DB" : "#6B7280"}
                                                                        />
                                                                    </TouchableOpacity>
                                                                    <TouchableOpacity
                                                                        onPress={() => {
                                                                            if (courseIndex < assignedCourses.length - 1) {
                                                                                const currentIds = stagedAssignments[level.id] || [];
                                                                                const newIds = [...currentIds];
                                                                                [newIds[courseIndex], newIds[courseIndex + 1]] = [newIds[courseIndex + 1], newIds[courseIndex]];
                                                                                setStagedAssignments(prev => ({ ...prev, [level.id]: newIds }));
                                                                            }
                                                                        }}
                                                                        disabled={courseIndex === assignedCourses.length - 1}
                                                                        style={styles.smallMoveButton}
                                                                    >
                                                                        <MaterialCommunityIcons
                                                                            name="chevron-down"
                                                                            size={14}
                                                                            color={courseIndex === assignedCourses.length - 1 ? "#D1D5DB" : "#6B7280"}
                                                                        />
                                                                    </TouchableOpacity>
                                                                </View>

                                                                <View style={[styles.checkbox, styles.checkboxSelected]}>
                                                                    <Feather name="check" size={12} color="#FFF" />
                                                                </View>
                                                                <Text style={[styles.courseTitle, { flex: 1 }]} numberOfLines={1}>
                                                                    {course.title}
                                                                </Text>
                                                                <TouchableOpacity
                                                                    onPress={() => toggleCourse(level.id, course.id)}
                                                                    style={styles.removeButton}
                                                                >
                                                                    <Feather name="x" size={16} color="#EF4444" />
                                                                </TouchableOpacity>
                                                            </View>
                                                        ))
                                                    )}
                                                </View>

                                                {/* Available Courses */}
                                                <View style={styles.sectionContainer}>
                                                    <Text style={styles.sectionTitle}>
                                                        Available Courses ({availableCourses.length - assignedCourses.length})
                                                    </Text>
                                                    {availableCourses
                                                        .filter(c => !(stagedAssignments[level.id] || []).includes(c.id))
                                                        .slice(0, 10)
                                                        .map(course => (
                                                            <TouchableOpacity
                                                                key={course.id}
                                                                style={styles.courseItem}
                                                                onPress={() => toggleCourse(level.id, course.id)}
                                                            >
                                                                <View style={styles.checkbox} />
                                                                <Text style={styles.courseTitle} numberOfLines={1}>
                                                                    {course.title}
                                                                </Text>
                                                                <Text style={styles.courseBucket}>
                                                                    {course.bucket || 'General'}
                                                                </Text>
                                                            </TouchableOpacity>
                                                        ))
                                                    }
                                                </View>

                                                {/* ============================================ */}
                                                {/* QUIZ MANAGEMENT SECTION (Inline) */}
                                                {/* ============================================ */}
                                                <View style={[styles.sectionContainer, { marginTop: 16 }]}>
                                                    <View style={qStyles.quizHeader}>
                                                        <View style={{ flex: 1 }}>
                                                            <Text style={styles.sectionTitle}>
                                                                Level Advancement Quiz
                                                            </Text>
                                                            <Text style={{ fontSize: 11, color: '#6B7280', fontFamily: 'Poppins_400Regular' }}>
                                                                {(levelQuizzes[level.name]?.questions || []).length} questions
                                                                {levelQuizzes[level.name]?.source ? ` • ${levelQuizzes[level.name].source === 'ai_generated' ? 'AI Generated' : levelQuizzes[level.name].source === 'manual' ? 'Edited' : 'Mixed'}` : ''}
                                                            </Text>
                                                        </View>
                                                        <View style={qStyles.quizActions}>
                                                            <TouchableOpacity
                                                                style={qStyles.addQBtn}
                                                                onPress={() => addQuizQuestion(level.name)}
                                                            >
                                                                <Feather name="plus" size={14} color="#FFF" />
                                                                <Text style={qStyles.addQBtnText}>Add</Text>
                                                            </TouchableOpacity>
                                                            <TouchableOpacity
                                                                style={qStyles.bulkBtn}
                                                                onPress={() => openBulkUpload(level.name)}
                                                            >
                                                                <MaterialCommunityIcons name="database-import-outline" size={14} color="#0EA5E9" />
                                                                <Text style={qStyles.bulkBtnText}>Bulk Upload</Text>
                                                            </TouchableOpacity>

                                                            <View style={qStyles.aiConfigWrap}>
                                                                <TextInput
                                                                    style={qStyles.aiNumInput}
                                                                    value={String(aiGenConfigByLevel[level.name]?.numQuestions ?? 10)}
                                                                    onChangeText={(t) => setAiGenConfigByLevel(prev => ({
                                                                        ...prev,
                                                                        [level.name]: {
                                                                            ...(prev[level.name] || { difficulty: 'medium' }),
                                                                            numQuestions: t.replace(/[^0-9]/g, ''),
                                                                        }
                                                                    }))}
                                                                    keyboardType="numeric"
                                                                    placeholder="#"
                                                                />
                                                                <TouchableOpacity
                                                                    style={qStyles.aiDiffBtn}
                                                                    onPress={() => {
                                                                        const current = (aiGenConfigByLevel[level.name]?.difficulty || 'medium');
                                                                        const order = ['easy', 'medium', 'hard'];
                                                                        const next = order[(order.indexOf(current) + 1) % order.length];
                                                                        setAiGenConfigByLevel(prev => ({
                                                                            ...prev,
                                                                            [level.name]: {
                                                                                ...(prev[level.name] || { numQuestions: 10 }),
                                                                                difficulty: next,
                                                                            }
                                                                        }));
                                                                    }}
                                                                >
                                                                    <Text style={qStyles.aiDiffBtnText}>
                                                                        {(aiGenConfigByLevel[level.name]?.difficulty || 'medium').toUpperCase()}
                                                                    </Text>
                                                                </TouchableOpacity>
                                                            </View>

                                                            <TouchableOpacity
                                                                style={qStyles.regenBtn}
                                                                onPress={() => regenerateQuizForLevel(level.name)}
                                                                disabled={levelQuizzes[level.name]?.loading}
                                                            >
                                                                <MaterialCommunityIcons name="robot" size={14} color="#6366F1" />
                                                                <Text style={qStyles.regenBtnText}>AI Generate</Text>
                                                            </TouchableOpacity>
                                                            <TouchableOpacity
                                                                style={[qStyles.saveQBtn, quizSaving === level.name && { opacity: 0.6 }]}
                                                                onPress={() => saveQuizForLevel(level.name)}
                                                                disabled={quizSaving === level.name}
                                                            >
                                                                {quizSaving === level.name ? (
                                                                    <ActivityIndicator size="small" color="#FFF" />
                                                                ) : (
                                                                    <>
                                                                        <Feather name="save" size={14} color="#FFF" />
                                                                        <Text style={qStyles.saveQBtnText}>Save Quiz</Text>
                                                                    </>
                                                                )}
                                                            </TouchableOpacity>
                                                        </View>
                                                    </View>

                                                    {/* Quiz Questions List */}
                                                    {levelQuizzes[level.name]?.loading ? (
                                                        <View style={{ padding: 20, alignItems: 'center' }}>
                                                            <ActivityIndicator size="small" color="#F59E0B" />
                                                            <Text style={{ marginTop: 6, fontSize: 12, color: '#6B7280' }}>Loading questions...</Text>
                                                        </View>
                                                    ) : (levelQuizzes[level.name]?.questions || []).length === 0 ? (
                                                        <View style={{ padding: 20, alignItems: 'center' }}>
                                                            <MaterialCommunityIcons name="help-circle-outline" size={32} color="#D1D5DB" />
                                                            <Text style={{ marginTop: 6, fontSize: 12, color: '#9CA3AF' }}>No quiz questions yet</Text>
                                                            <Text style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'center', marginTop: 2 }}>
                                                                Click "AI Generate" to auto-create from course content, or "Add" to create manually
                                                            </Text>
                                                        </View>
                                                    ) : (
                                                        <ScrollView style={{ maxHeight: 400 }} nestedScrollEnabled={true}>
                                                            {(levelQuizzes[level.name]?.questions || []).map((q, qIdx) => {
                                                                const isEditing = editingQuestionKey === `${level.name}:${qIdx}`;
                                                                return (
                                                                    <View key={qIdx} style={qStyles.questionCard}>
                                                                        {isEditing ? (
                                                                            /* EDIT MODE */
                                                                            <View>
                                                                                <Text style={qStyles.editLabel}>Editing Question {qIdx + 1}</Text>
                                                                                <TextInput
                                                                                    style={qStyles.qInput}
                                                                                    value={editForm.question}
                                                                                    onChangeText={(t) => setEditForm({ ...editForm, question: t })}
                                                                                    placeholder="Enter question text"
                                                                                    multiline
                                                                                />
                                                                                {editForm.options.map((opt, oIdx) => (
                                                                                    <View key={oIdx} style={qStyles.optionEditRow}>
                                                                                        <TouchableOpacity
                                                                                            style={[qStyles.correctToggle, editForm.correctIndex === oIdx && qStyles.correctToggleActive]}
                                                                                            onPress={() => setEditForm({ ...editForm, correctIndex: oIdx })}
                                                                                        >
                                                                                            <Feather
                                                                                                name={editForm.correctIndex === oIdx ? "check-circle" : "circle"}
                                                                                                size={16}
                                                                                                color={editForm.correctIndex === oIdx ? "#10B981" : "#9CA3AF"}
                                                                                            />
                                                                                        </TouchableOpacity>
                                                                                        <TextInput
                                                                                            style={[qStyles.qInput, { flex: 1, marginBottom: 0 }]}
                                                                                            value={opt}
                                                                                            onChangeText={(t) => {
                                                                                                const newOpts = [...editForm.options];
                                                                                                newOpts[oIdx] = t;
                                                                                                setEditForm({ ...editForm, options: newOpts });
                                                                                            }}
                                                                                            placeholder={`Option ${oIdx + 1}`}
                                                                                        />
                                                                                    </View>
                                                                                ))}
                                                                                <View style={qStyles.editBtnRow}>
                                                                                    <TouchableOpacity style={qStyles.cancelBtn} onPress={() => setEditingQuestionKey(null)}>
                                                                                        <Text style={{ color: '#6B7280', fontSize: 13, fontFamily: 'Poppins_500Medium' }}>Cancel</Text>
                                                                                    </TouchableOpacity>
                                                                                    <TouchableOpacity style={qStyles.confirmBtn} onPress={() => saveEditQuestion(level.name, qIdx)}>
                                                                                        <Feather name="check" size={14} color="#FFF" />
                                                                                        <Text style={{ color: '#FFF', fontSize: 13, fontFamily: 'Poppins_600SemiBold', marginLeft: 4 }}>Done</Text>
                                                                                    </TouchableOpacity>
                                                                                </View>
                                                                            </View>
                                                                        ) : (
                                                                            /* VIEW MODE */
                                                                            <View>
                                                                                <View style={qStyles.qHeader}>
                                                                                    <Text style={qStyles.qNumber}>Q{qIdx + 1}</Text>
                                                                                    <View style={{ flexDirection: 'row', gap: 6 }}>
                                                                                        <TouchableOpacity onPress={() => startEditQuestion(level.name, qIdx)} style={{ padding: 4 }}>
                                                                                            <Feather name="edit-2" size={14} color="#F59E0B" />
                                                                                        </TouchableOpacity>
                                                                                        <TouchableOpacity onPress={() => deleteQuizQuestion(level.name, qIdx)} style={{ padding: 4 }}>
                                                                                            <Feather name="trash-2" size={14} color="#EF4444" />
                                                                                        </TouchableOpacity>
                                                                                    </View>
                                                                                </View>
                                                                                <Text style={qStyles.qText}>{q.question}</Text>
                                                                                {(q.options || []).map((opt, oIdx) => (
                                                                                    <View key={oIdx} style={[qStyles.optionRow, oIdx === q.correctIndex && qStyles.correctOptionRow]}>
                                                                                        <Text style={[qStyles.optionText, oIdx === q.correctIndex && { color: '#059669', fontFamily: 'Poppins_600SemiBold' }]}>
                                                                                            {String.fromCharCode(65 + oIdx)}. {opt}
                                                                                        </Text>
                                                                                        {oIdx === q.correctIndex && (
                                                                                            <Feather name="check-circle" size={12} color="#10B981" />
                                                                                        )}
                                                                                    </View>
                                                                                ))}
                                                                            </View>
                                                                        )}
                                                                    </View>
                                                                );
                                                            })}
                                                        </ScrollView>
                                                    )}
                                                </View>

                                                {/* Save Button */}
                                                <TouchableOpacity
                                                    style={styles.saveBtn}
                                                    onPress={() => handleSaveCourses(level)}
                                                >
                                                    <Text style={styles.saveBtnText}>Save {level.name} Curriculum</Text>
                                                </TouchableOpacity>
                                            </View>
                                        )}
                                    </View>
                                );
                            })}
                        </View>
                    ) : (
                        <DraggableFlatList
                            data={levelData}
                            onDragEnd={handleLevelDragEnd}
                            keyExtractor={(item) => item.id}
                            renderItem={renderLevelItem}
                            contentContainerStyle={styles.listContainer}
                            extraData={{
                                levelQuizzes,
                                expandedRole,
                                stagedAssignments,
                                aiGenConfigByLevel,
                                quizSaving,
                                savingCurriculum,
                                editingQuestionKey,
                                editForm,
                                toast
                            }}
                        />
                    )}
                </View>

                {/* Bulk Upload Modal */}
                {bulkUploadLevelName && (
                    <Modal visible={true} transparent animationType="fade">
                        <View style={qStyles.bulkOverlay}>
                            <View style={qStyles.bulkModal}>
                                <View style={qStyles.bulkHeader}>
                                    <Text style={qStyles.bulkTitle}>Bulk Upload Quiz: {bulkUploadLevelName}</Text>
                                    <TouchableOpacity onPress={() => setBulkUploadLevelName(null)}>
                                        <Feather name="x" size={20} color="#6B7280" />
                                    </TouchableOpacity>
                                </View>
                                <Text style={qStyles.bulkHelp}>
                                    Upload CSV/Excel or paste JSON. Supported columns: question, option_a, option_b, option_c, option_d, correct_index
                                </Text>

                                <View style={qStyles.bulkTopActions}>
                                    <TouchableOpacity style={qStyles.bulkActionBtn} onPress={pickAndImportQuizFile}>
                                        <MaterialCommunityIcons name="file-upload-outline" size={16} color="#111827" />
                                        <Text style={qStyles.bulkActionBtnText}>Upload CSV/Excel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={qStyles.bulkActionBtn} onPress={() => exportQuizAsCsv('template')}>
                                        <MaterialCommunityIcons name="file-download-outline" size={16} color="#111827" />
                                        <Text style={qStyles.bulkActionBtnText}>CSV Template</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={qStyles.bulkActionBtn} onPress={() => exportQuizAsExcel('template')}>
                                        <MaterialCommunityIcons name="file-download-outline" size={16} color="#111827" />
                                        <Text style={qStyles.bulkActionBtnText}>Excel Template</Text>
                                    </TouchableOpacity>
                                </View>

                                <View style={qStyles.bulkTopActions}>
                                    <TouchableOpacity style={qStyles.bulkActionBtn} onPress={() => exportQuizAsCsv('current')}>
                                        <MaterialCommunityIcons name="download" size={16} color="#111827" />
                                        <Text style={qStyles.bulkActionBtnText}>Export CSV</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={qStyles.bulkActionBtn} onPress={() => exportQuizAsExcel('current')}>
                                        <MaterialCommunityIcons name="download" size={16} color="#111827" />
                                        <Text style={qStyles.bulkActionBtnText}>Export Excel</Text>
                                    </TouchableOpacity>
                                </View>

                                <TextInput
                                    style={qStyles.bulkInput}
                                    value={bulkUploadText}
                                    onChangeText={setBulkUploadText}
                                    placeholder="Paste JSON here (optional)"
                                    multiline
                                />
                                <View style={qStyles.bulkBtnRow}>
                                    <TouchableOpacity style={qStyles.cancelBtn} onPress={() => setBulkUploadLevelName(null)}>
                                        <Text style={{ color: '#6B7280', fontSize: 13, fontFamily: 'Poppins_500Medium' }}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={qStyles.confirmBtn}
                                        onPress={() => {
                                            try {
                                                applyBulkUpload();
                                            } catch (e) {
                                                Alert.alert('Invalid Questions', e?.message || 'Invalid bulk upload payload');
                                            }
                                        }}
                                    >
                                        <Feather name="check" size={14} color="#FFF" />
                                        <Text style={{ color: '#FFF', fontSize: 13, fontFamily: 'Poppins_600SemiBold', marginLeft: 4 }}>Import</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    </Modal>
                )}
                {/* Toast Notification */}
                {toast.visible && (
                    <View style={[
                        styles.toastContainer,
                        toast.type === 'success' ? styles.toastSuccess : styles.toastError
                    ]}>
                        <MaterialCommunityIcons
                            name={toast.type === 'success' ? 'check-circle' : 'alert-circle'}
                            size={20}
                            color="#FFF"
                        />
                        <Text style={styles.toastText}>{toast.message}</Text>
                    </View>
                )}
            </GestureHandlerRootView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F9FAFB',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        paddingTop: Platform.OS === 'ios' ? 50 : 16,
        backgroundColor: '#FFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
        gap: 12,
    },
    closeBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#F3F4F6',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 18,
        fontFamily: 'Poppins_700Bold',
        color: '#111827',
    },
    headerSubtitle: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
    },
    saveLevelOrderBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#10B981',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        gap: 6,
    },
    saveLevelOrderBtnText: {
        color: '#FFF',
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
    },
    infoBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#EEF2FF',
        marginHorizontal: 16,
        marginVertical: 10,
        padding: 12,
        borderRadius: 10,
        gap: 10,
    },
    infoText: {
        flex: 1,
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
        color: '#4F46E5',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    listContainer: {
        padding: 16,
        paddingBottom: 150, // Increased for better scrolling
    },
    webContainer: {
        flex: 1,
        padding: 16,
        maxHeight: '70vh',
        overflowY: 'scroll',
    },
    moveButtonsContainer: {
        flexDirection: 'column',
        marginRight: 8,
        gap: 4,
    },
    moveButton: {
        width: 32,
        height: 32,
        borderRadius: 8,
        backgroundColor: '#F3F4F6',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    moveButtonDisabled: {
        backgroundColor: '#FAFAFA',
        opacity: 0.5,
    },
    courseReorderButtons: {
        flexDirection: 'column',
        marginRight: 6,
        gap: 2,
    },
    smallMoveButton: {
        width: 24,
        height: 24,
        borderRadius: 6,
        backgroundColor: '#F9FAFB',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    removeButton: {
        padding: 4,
        marginLeft: 8,
    },
    noCourses: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#9CA3AF',
        fontStyle: 'italic',
        textAlign: 'center',
        paddingVertical: 12,
    },
    courseSectionTitle: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
        color: '#374151',
        marginTop: 12,
        marginBottom: 8,
    },
    courseItemAvailable: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
        gap: 10,
    },
    levelInfo: {
        flex: 1,
    },
    levelName: {
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
        color: '#111827',
    },
    levelSubtext: {
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
        color: '#6B7280',
    },

    // Level Card
    levelContainer: {
        marginBottom: 12,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: '#FFF',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    levelContainerActive: {
        shadowOpacity: 0.2,
        elevation: 8,
        transform: [{ scale: 1.02 }],
    },
    levelHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 16,
        backgroundColor: '#FFF',
    },
    levelHeaderActive: {
        borderColor: '#F59E0B',
        backgroundColor: '#FFFBEB',
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
    },
    dragHandle: {
        marginRight: 8,
    },
    levelIcon: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    levelTitle: {
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
        color: '#111827',
    },
    levelSubtitle: {
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
        color: '#6B7280',
    },
    levelContent: {
        padding: 16,
        borderWidth: 1,
        borderTopWidth: 0,
        borderColor: '#F59E0B',
        borderBottomLeftRadius: 16,
        borderBottomRightRadius: 16,
        backgroundColor: '#FFFBEB',
    },
    instructionText: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#92400E',
        marginBottom: 8,
    },

    // Section
    sectionContainer: {
        marginTop: 12,
        padding: 12,
        backgroundColor: '#FFF',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    sectionTitle: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
        color: '#374151',
        marginBottom: 8,
    },

    // Course Items
    courseItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
        gap: 10,
    },
    assignedCourse: {
        backgroundColor: '#F0FDF4',
        borderRadius: 8,
        marginBottom: 6,
        borderBottomWidth: 0,
    },
    checkbox: {
        width: 22,
        height: 22,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: '#D1D5DB',
        justifyContent: 'center',
        alignItems: 'center',
    },
    checkboxSelected: {
        backgroundColor: '#10B981',
        borderColor: '#10B981',
    },
    courseTitle: {
        flex: 1,
        fontSize: 13,
        fontFamily: 'Poppins_500Medium',
        color: '#374151',
    },
    courseBucket: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        color: '#9CA3AF',
        backgroundColor: '#F3F4F6',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
    },

    // Save Button
    saveBtn: {
        marginTop: 16,
        backgroundColor: '#10B981',
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'center',
        shadowColor: '#10B981',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    saveBtnDisabled: {
        backgroundColor: '#9CA3AF',
        opacity: 0.7,
        shadowOpacity: 0,
        elevation: 0,
    },
    saveBtnText: {
        color: '#FFF',
        fontSize: 14,
        fontFamily: 'Poppins_700Bold',
    },

    // Toast Notification
    toastContainer: {
        position: 'absolute',
        top: 50, // Increased to avoid status bar/headers
        left: 20,
        right: 20,
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 100, // Very high elevation
        zIndex: 99999, // Very high z-index
        gap: 12,
        backgroundColor: '#333', // Fallback background
    },
    toastSuccess: {
        backgroundColor: '#10B981',
    },
    toastError: {
        backgroundColor: '#EF4444',
    },
    toastText: {
        flex: 1,
        color: '#FFF',
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        lineHeight: 20,
    },
});

// =========================================================================
// QUIZ MANAGEMENT STYLES
// =========================================================================
const qStyles = StyleSheet.create({
    quizHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: 10,
        flexWrap: 'wrap',
        gap: 8,
    },
    quizActions: {
        flexDirection: 'row',
        gap: 6,
        flexWrap: 'wrap',
    },
    addQBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#10B981',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 6,
        gap: 3,
    },
    addQBtnText: {
        color: '#FFF',
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
    },
    regenBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#EEF2FF',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#C7D2FE',
        gap: 3,
    },
    regenBtnText: {
        color: '#6366F1',
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
    },
    bulkBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#E0F2FE',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#BAE6FD',
        gap: 3,
    },
    bulkBtnText: {
        color: '#0284C7',
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
    },
    aiConfigWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    aiNumInput: {
        width: 44,
        height: 30,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 8,
        paddingHorizontal: 8,
        backgroundColor: '#FFF',
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
        color: '#111827',
        textAlign: 'center',
        paddingVertical: 0,
    },
    aiDiffBtn: {
        height: 30,
        paddingHorizontal: 10,
        borderRadius: 8,
        backgroundColor: '#F3F4F6',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        justifyContent: 'center',
        alignItems: 'center',
    },
    aiDiffBtnText: {
        fontSize: 11,
        fontFamily: 'Poppins_700Bold',
        color: '#374151',
    },
    saveQBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F59E0B',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 6,
        gap: 3,
    },
    saveQBtnText: {
        color: '#FFF',
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
    },
    questionCard: {
        backgroundColor: '#FAFAFA',
        borderRadius: 10,
        padding: 12,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    qHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    qNumber: {
        fontSize: 11,
        fontFamily: 'Poppins_700Bold',
        color: '#F59E0B',
        backgroundColor: '#FEF3C7',
        paddingHorizontal: 6,
        paddingVertical: 1,
        borderRadius: 4,
        overflow: 'hidden',
    },
    qText: {
        fontSize: 13,
        fontFamily: 'Poppins_500Medium',
        color: '#111827',
        marginBottom: 8,
        lineHeight: 18,
    },
    optionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: 6,
        marginBottom: 3,
        backgroundColor: '#FFF',
    },
    correctOptionRow: {
        backgroundColor: '#ECFDF5',
        borderWidth: 1,
        borderColor: '#A7F3D0',
    },
    optionText: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: '#374151',
        flex: 1,
    },
    editLabel: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
        color: '#F59E0B',
        marginBottom: 6,
    },
    qInput: {
        backgroundColor: '#FFF',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 8,
        padding: 10,
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        marginBottom: 8,
    },
    optionEditRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 6,
    },
    correctToggle: {
        width: 28,
        height: 28,
        justifyContent: 'center',
        alignItems: 'center',
    },
    correctToggleActive: {
        backgroundColor: '#ECFDF5',
        borderRadius: 14,
    },
    editBtnRow: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 8,
        marginTop: 8,
    },
    cancelBtn: {
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 6,
        backgroundColor: '#F3F4F6',
    },
    confirmBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 6,
        backgroundColor: '#10B981',
    },

    bulkOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.35)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16,
    },
    bulkModal: {
        width: '100%',
        maxWidth: 720,
        backgroundColor: '#FFF',
        borderRadius: 12,
        padding: 14,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    bulkHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    bulkTitle: {
        fontSize: 14,
        fontFamily: 'Poppins_700Bold',
        color: '#111827',
        flex: 1,
        paddingRight: 10,
    },
    bulkHelp: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        color: '#6B7280',
        marginBottom: 8,
    },
    bulkTopActions: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 10,
    },
    bulkActionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 10,
        backgroundColor: '#F9FAFB',
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    bulkActionBtnText: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
        color: '#111827',
    },
    bulkInput: {
        minHeight: 180,
        backgroundColor: '#F9FAFB',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 10,
        padding: 10,
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        textAlignVertical: 'top',
    },
    bulkBtnRow: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 8,
        marginTop: 10,
    },
});
