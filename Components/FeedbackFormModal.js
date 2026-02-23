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
    Platform,
    ActivityIndicator,
    Switch,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import API_URL from '../config';

const { width } = Dimensions.get('window');

/**
 * FeedbackFormModal
 * - If a custom survey exists for the course → renders dynamic survey questions
 * - Otherwise → falls back to the classic star rating + comment form
 *
 * Props:
 *   visible, onClose, courseId, courseTitle, bucket, userEmail
 */
export default function FeedbackFormModal({ visible, onClose, courseId, courseTitle, bucket, userEmail }) {
    // Survey state
    const [survey, setSurvey] = useState(null);
    const [loadingSurvey, setLoadingSurvey] = useState(false);
    const [answers, setAnswers] = useState({});
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [validationErrors, setValidationErrors] = useState({});

    // Legacy fallback state
    const [rating, setRating] = useState(0);
    const [comment, setComment] = useState('');

    // Fetch survey when modal opens
    useEffect(() => {
        if (visible && courseId) {
            fetchSurvey();
        }
    }, [visible, courseId]);

    const fetchSurvey = async () => {
        setLoadingSurvey(true);
        setAnswers({});
        setValidationErrors({});
        try {
            // Pass user_email so backend can check if user already submitted
            const emailParam = userEmail ? `?user_email=${encodeURIComponent(userEmail)}` : '';

            // Add timeout to prevent hanging - fallback to legacy form after 5s
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const res = await fetch(`${API_URL}/api/v1/self-learning/survey/${courseId}${emailParam}`, {
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            const data = await res.json();

            // If user already submitted the survey → silently close the modal
            if (data.has_submitted) {
                onClose();
                return;
            }

            setSurvey(data.survey || null);
        } catch (e) {
            // On timeout or error, fallback to legacy rating form
            console.log('Survey fetch timeout/error, using legacy form:', e.name);
            setSurvey(null);
        } finally {
            setLoadingSurvey(false);
        }
    };

    const setAnswer = (questionId, value) => {
        setAnswers(prev => ({ ...prev, [questionId]: value }));
        if (validationErrors[questionId]) {
            setValidationErrors(prev => { const n = { ...prev }; delete n[questionId]; return n; });
        }
    };

    const validateSurvey = () => {
        const errors = {};
        for (const q of (survey?.questions || [])) {
            if (q.mandatory) {
                const ans = answers[q.id];
                if (ans === undefined || ans === null || String(ans).trim() === '') {
                    errors[q.id] = 'This question is required';
                }
            }
        }
        setValidationErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSubmitSurvey = async () => {
        if (!validateSurvey()) return;
        setSubmitting(true);
        try {
            // Find user_name from name question if present
            const nameQ = (survey?.questions || []).find(q => q.type === 'name');
            const userName = nameQ ? (answers[nameQ.id] || '') : '';

            // Resolve MCQ index answers back to option text for readable backend storage
            const resolvedAnswers = { ...answers };
            for (const q of (survey?.questions || [])) {
                if (q.type === 'mcq' && typeof resolvedAnswers[q.id] === 'number') {
                    resolvedAnswers[q.id] = (q.options || [])[resolvedAnswers[q.id]] || resolvedAnswers[q.id];
                }
            }

            await fetch(`${API_URL}/api/v1/self-learning/survey/${courseId}/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    survey_id: survey.id,
                    user_email: userEmail,
                    user_name: userName,
                    answers: resolvedAnswers,
                }),
            });
            setSubmitted(true);
            setTimeout(() => {
                setSubmitted(false);
                setAnswers({});
                onClose();
            }, 1800);
        } catch (error) {
            console.error('Survey submit error:', error);
        } finally {
            setSubmitting(false);
        }
    };

    // Legacy submit (no survey)
    const handleSubmitLegacy = async () => {
        if (rating === 0) return;
        setSubmitting(true);
        try {
            await fetch(`${API_URL}/api/v1/self-learning/feedback`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_email: userEmail,
                    course_id: courseId,
                    course_title: courseTitle,
                    bucket: bucket || '',
                    rating,
                    comment: comment.trim(),
                }),
            });
            setSubmitted(true);
            setTimeout(() => {
                setSubmitted(false);
                setRating(0);
                setComment('');
                onClose();
            }, 1500);
        } catch (error) {
            console.error('Feedback submit error:', error);
        } finally {
            setSubmitting(false);
        }
    };

    const handleClose = () => {
        setRating(0);
        setComment('');
        setSubmitted(false);
        setAnswers({});
        setValidationErrors({});
        onClose();
    };

    // ---- Render a single survey question ----
    const renderQuestion = (q, idx) => {
        const error = validationErrors[q.id];
        const ans = answers[q.id];

        return (
            <View key={q.id} style={styles.questionBlock}>
                <View style={styles.questionLabelRow}>
                    <Text style={styles.questionLabel}>
                        {idx + 1}. {q.label}
                        {q.mandatory && <Text style={styles.requiredStar}> *</Text>}
                    </Text>
                </View>

                {/* TEXT */}
                {q.type === 'text' && (
                    <TextInput
                        style={[styles.answerInput, error && styles.inputError]}
                        placeholder="Type your answer..."
                        placeholderTextColor="#9CA3AF"
                        value={ans || ''}
                        onChangeText={v => setAnswer(q.id, v)}
                        multiline
                        numberOfLines={3}
                        textAlignVertical="top"
                    />
                )}

                {/* NAME */}
                {q.type === 'name' && (
                    <TextInput
                        style={[styles.answerInput, error && styles.inputError]}
                        placeholder="Enter your full name..."
                        placeholderTextColor="#9CA3AF"
                        value={ans || ''}
                        onChangeText={v => setAnswer(q.id, v)}
                    />
                )}

                {/* RATING */}
                {q.type === 'rating' && (
                    <View>
                        <View style={styles.starsRow}>
                            {[1, 2, 3, 4, 5].map(star => (
                                <TouchableOpacity key={star} onPress={() => setAnswer(q.id, star)} style={styles.starBtn}>
                                    <MaterialCommunityIcons
                                        name={star <= (ans || 0) ? 'star' : 'star-outline'}
                                        size={34}
                                        color={star <= (ans || 0) ? '#F59E0B' : '#D1D5DB'}
                                    />
                                </TouchableOpacity>
                            ))}
                        </View>
                        {ans > 0 && (
                            <Text style={styles.ratingLabel}>
                                {ans === 1 ? 'Poor' : ans === 2 ? 'Fair' : ans === 3 ? 'Good' : ans === 4 ? 'Very Good' : 'Excellent!'}
                            </Text>
                        )}
                    </View>
                )}

                {/* MCQ — compare by index to handle duplicate option text */}
                {q.type === 'mcq' && (
                    <View style={styles.mcqOptions}>
                        {(q.options || []).map((opt, oi) => {
                            const isSelected = ans === oi;
                            return (
                                <TouchableOpacity
                                    key={oi}
                                    style={[styles.mcqOption, isSelected && styles.mcqOptionSelected]}
                                    onPress={() => setAnswer(q.id, oi)}
                                >
                                    <View style={[styles.mcqRadio, isSelected && styles.mcqRadioSelected]}>
                                        {isSelected && <View style={styles.mcqRadioDot} />}
                                    </View>
                                    <Text style={[styles.mcqOptionText, isSelected && styles.mcqOptionTextSelected]}>
                                        {opt}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                )}

                {error && <Text style={styles.errorText}>{error}</Text>}
            </View>
        );
    };

    return (
        <Modal visible={visible} transparent animationType="fade">
            <View style={styles.overlay}>
                <View style={styles.card}>
                    {submitted ? (
                        <View style={styles.successWrap}>
                            <View style={styles.successIcon}>
                                <Feather name="check" size={32} color="#FFF" />
                            </View>
                            <Text style={styles.successTitle}>Thank you!</Text>
                            <Text style={styles.successSub}>Your feedback has been submitted</Text>
                        </View>
                    ) : loadingSurvey ? (
                        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                            <ActivityIndicator size="large" color="#F59E0B" />
                            <Text style={{ marginTop: 12, color: '#6B7280', fontSize: 13 }}>Loading survey...</Text>
                        </View>
                    ) : survey ? (
                        /* ===== CUSTOM SURVEY ===== */
                        <>
                            <View style={styles.header}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.title}>{survey.title || 'Course Feedback'}</Text>
                                    <Text style={styles.courseName} numberOfLines={1}>{courseTitle}</Text>
                                    {survey.description ? (
                                        <Text style={styles.surveyDesc}>{survey.description}</Text>
                                    ) : null}
                                </View>
                                <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
                                    <Feather name="x" size={20} color="#6B7280" />
                                </TouchableOpacity>
                            </View>

                            <ScrollView
                                style={{ maxHeight: 420 }}
                                showsVerticalScrollIndicator={false}
                                keyboardShouldPersistTaps="handled"
                            >
                                {(survey.questions || []).map((q, idx) => renderQuestion(q, idx))}
                            </ScrollView>

                            <TouchableOpacity
                                style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
                                onPress={handleSubmitSurvey}
                                disabled={submitting}
                            >
                                {submitting ? (
                                    <ActivityIndicator size="small" color="#FFF" />
                                ) : (
                                    <Text style={styles.submitText}>Submit Survey</Text>
                                )}
                            </TouchableOpacity>

                            <TouchableOpacity onPress={handleClose}>
                                <Text style={styles.skipText}>Skip</Text>
                            </TouchableOpacity>
                        </>
                    ) : (
                        /* ===== LEGACY STAR RATING ===== */
                        <>
                            <View style={styles.header}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.title}>Rate this course</Text>
                                    <Text style={styles.courseName} numberOfLines={1}>{courseTitle}</Text>
                                </View>
                                <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
                                    <Feather name="x" size={20} color="#6B7280" />
                                </TouchableOpacity>
                            </View>

                            <View style={styles.starsRow}>
                                {[1, 2, 3, 4, 5].map(star => (
                                    <TouchableOpacity key={star} onPress={() => setRating(star)} style={styles.starBtn}>
                                        <MaterialCommunityIcons
                                            name={star <= rating ? 'star' : 'star-outline'}
                                            size={36}
                                            color={star <= rating ? '#F59E0B' : '#D1D5DB'}
                                        />
                                    </TouchableOpacity>
                                ))}
                            </View>
                            <Text style={styles.ratingLabel}>
                                {rating === 0 ? 'Tap a star to rate' :
                                 rating === 1 ? 'Poor' :
                                 rating === 2 ? 'Fair' :
                                 rating === 3 ? 'Good' :
                                 rating === 4 ? 'Very Good' : 'Excellent!'}
                            </Text>

                            <TextInput
                                style={styles.commentInput}
                                placeholder="Share your thoughts about this course (optional)"
                                placeholderTextColor="#9CA3AF"
                                multiline
                                numberOfLines={3}
                                value={comment}
                                onChangeText={setComment}
                                textAlignVertical="top"
                            />

                            <TouchableOpacity
                                style={[styles.submitBtn, rating === 0 && styles.submitBtnDisabled]}
                                onPress={handleSubmitLegacy}
                                disabled={rating === 0 || submitting}
                            >
                                {submitting ? (
                                    <ActivityIndicator size="small" color="#FFF" />
                                ) : (
                                    <Text style={styles.submitText}>Submit Feedback</Text>
                                )}
                            </TouchableOpacity>

                            <TouchableOpacity onPress={handleClose}>
                                <Text style={styles.skipText}>Skip</Text>
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.45)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    card: {
        width: Math.min(width - 40, 420),
        backgroundColor: '#FFF',
        borderRadius: 20,
        padding: 22,
        ...Platform.select({
            ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 16 },
            android: { elevation: 10 },
            web: { boxShadow: '0 6px 24px rgba(0,0,0,0.18)' },
        }),
    },
    header: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 16,
    },
    title: {
        fontSize: 17,
        fontWeight: '700',
        color: '#1F2937',
    },
    courseName: {
        fontSize: 12,
        color: '#6B7280',
        marginTop: 2,
    },
    surveyDesc: {
        fontSize: 12,
        color: '#9CA3AF',
        marginTop: 4,
        lineHeight: 17,
    },
    closeBtn: {
        padding: 4,
        marginLeft: 8,
    },

    // Questions
    questionBlock: {
        marginBottom: 16,
    },
    questionLabelRow: {
        marginBottom: 8,
    },
    questionLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#1F2937',
        lineHeight: 20,
    },
    requiredStar: {
        color: '#EF4444',
        fontWeight: '700',
    },
    answerInput: {
        backgroundColor: '#F9FAFB',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 10,
        padding: 10,
        fontSize: 14,
        color: '#1F2937',
        minHeight: 70,
    },
    inputError: {
        borderColor: '#EF4444',
        backgroundColor: '#FFF5F5',
    },
    errorText: {
        fontSize: 11,
        color: '#EF4444',
        marginTop: 4,
        fontWeight: '500',
    },

    // Stars
    starsRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 6,
        marginBottom: 6,
    },
    starBtn: {
        padding: 3,
    },
    ratingLabel: {
        textAlign: 'center',
        fontSize: 13,
        fontWeight: '600',
        color: '#F59E0B',
        marginBottom: 12,
    },

    // MCQ
    mcqOptions: {
        gap: 8,
    },
    mcqOption: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 10,
        borderWidth: 1.5,
        borderColor: '#E5E7EB',
        backgroundColor: '#F9FAFB',
    },
    mcqOptionSelected: {
        borderColor: '#F59E0B',
        backgroundColor: '#FFFBEB',
    },
    mcqRadio: {
        width: 18,
        height: 18,
        borderRadius: 9,
        borderWidth: 2,
        borderColor: '#D1D5DB',
        justifyContent: 'center',
        alignItems: 'center',
    },
    mcqRadioSelected: {
        borderColor: '#F59E0B',
    },
    mcqRadioDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#F59E0B',
    },
    mcqOptionText: {
        fontSize: 13,
        color: '#374151',
        flex: 1,
    },
    mcqOptionTextSelected: {
        color: '#78350F',
        fontWeight: '600',
    },

    // Legacy comment
    commentInput: {
        backgroundColor: '#F9FAFB',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 12,
        padding: 12,
        fontSize: 14,
        color: '#1F2937',
        minHeight: 80,
        marginBottom: 16,
    },

    // Submit
    submitBtn: {
        backgroundColor: '#F59E0B',
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: 'center',
        marginTop: 12,
        marginBottom: 10,
    },
    submitBtnDisabled: {
        backgroundColor: '#D1D5DB',
    },
    submitText: {
        fontSize: 15,
        fontWeight: '700',
        color: '#FFF',
    },
    skipText: {
        textAlign: 'center',
        fontSize: 13,
        color: '#9CA3AF',
        fontWeight: '500',
    },

    // Success
    successWrap: {
        alignItems: 'center',
        paddingVertical: 24,
    },
    successIcon: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#10B981',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    successTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#1F2937',
    },
    successSub: {
        fontSize: 13,
        color: '#6B7280',
        marginTop: 4,
    },
});
