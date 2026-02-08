import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    TextInput,
    Dimensions,
    Platform,
    ActivityIndicator,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import API_URL from '../config';

const { width } = Dimensions.get('window');

export default function FeedbackFormModal({ visible, onClose, courseId, courseTitle, bucket, userEmail }) {
    const [rating, setRating] = useState(0);
    const [comment, setComment] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = async () => {
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
        onClose();
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
                    ) : (
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

                            {/* Star Rating */}
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

                            {/* Comment */}
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

                            {/* Submit */}
                            <TouchableOpacity
                                style={[styles.submitBtn, rating === 0 && styles.submitBtnDisabled]}
                                onPress={handleSubmit}
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
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    card: {
        width: Math.min(width - 48, 400),
        backgroundColor: '#FFF',
        borderRadius: 20,
        padding: 24,
        ...Platform.select({
            ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12 },
            android: { elevation: 8 },
            web: { boxShadow: '0 4px 12px rgba(0,0,0,0.15)' },
        }),
    },
    header: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 20,
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1F2937',
    },
    courseName: {
        fontSize: 13,
        color: '#6B7280',
        marginTop: 3,
    },
    closeBtn: {
        padding: 4,
    },
    starsRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8,
        marginBottom: 8,
    },
    starBtn: {
        padding: 4,
    },
    ratingLabel: {
        textAlign: 'center',
        fontSize: 13,
        fontWeight: '600',
        color: '#F59E0B',
        marginBottom: 16,
    },
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
    submitBtn: {
        backgroundColor: '#F59E0B',
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: 'center',
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
        paddingVertical: 20,
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
