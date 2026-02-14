/**
 * Exam Utilities
 * Helper functions for exam randomization and processing
 */

/**
 * Seeded random number generator for deterministic shuffling
 * Same seed always produces same random sequence
 */
function seededRandom(seed) {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        const char = seed.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }

    return function() {
        hash = (hash * 9301 + 49297) % 233280;
        if (hash < 0) hash += 233280; // Ensure positive
        return hash / 233280.0;
    };
}

/**
 * Shuffle array deterministically based on seed
 * Same seed + same array = same shuffled result
 *
 * @param {Array} array - Array to shuffle
 * @param {string} seed - Seed for random generation (e.g., "userId-examId")
 * @returns {Array} Shuffled array
 */
export function shuffleArray(array, seed) {
    if (!array || array.length <= 1) return array;

    const rng = seededRandom(seed);
    const shuffled = [...array]; // Create copy

    // Fisher-Yates shuffle algorithm
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled;
}

/**
 * Randomize exam questions and/or options based on exam settings
 *
 * @param {Object} exam - Exam object with questions and randomization flags
 * @param {string} userId - User ID/email for seed generation
 * @returns {Object} Exam with randomized questions/options
 */
export function randomizeExamQuestions(exam, userId) {
    if (!exam || !exam.questions || !userId) return exam;

    const examCopy = { ...exam, questions: JSON.parse(JSON.stringify(exam.questions)) };
    const seed = `${userId}-${exam.id}`;

    // Randomize question order
    if (exam.randomize_question_order || exam.randomizeQuestionOrder) {
        console.log(`[ExamUtils] Randomizing question order for user ${userId}`);
        examCopy.questions = shuffleArray(examCopy.questions, seed);
    }

    // Randomize option order (A, B, C, D shuffle)
    if (exam.randomize_option_order || exam.randomizeOptionOrder) {
        console.log(`[ExamUtils] Randomizing option order for user ${userId}`);

        examCopy.questions = examCopy.questions.map((question, qIndex) => {
            if (!question.options || question.options.length <= 1) {
                return question;
            }

            // Create option objects with original indices
            const optionsWithIndices = question.options.map((opt, idx) => ({
                text: opt,
                originalIndex: idx,
                isCorrect: idx === question.correct_answer
            }));

            // Shuffle options deterministically
            const questionSeed = `${seed}-q${qIndex}`;
            const shuffledOptions = shuffleArray(optionsWithIndices, questionSeed);

            // Update question with shuffled options and new correct answer index
            return {
                ...question,
                options: shuffledOptions.map(o => o.text),
                correct_answer: shuffledOptions.findIndex(o => o.isCorrect),
                _originalOrder: optionsWithIndices.map(o => o.originalIndex) // For debugging
            };
        });
    }

    return examCopy;
}

/**
 * Validate if exam can be started
 *
 * @param {Object} exam - Exam object
 * @param {Object} user - User object with email
 * @returns {Object} { canStart: boolean, reason: string }
 */
export function validateExamStart(exam, user) {
    if (!exam) {
        return { canStart: false, reason: 'Exam not found' };
    }

    if (exam.has_completed) {
        return { canStart: false, reason: 'You have already completed this exam' };
    }

    if (!exam.can_start) {
        return { canStart: false, reason: 'You need to be marked present by the supervisor before starting' };
    }

    // Check if exam is within time window (for batch exams)
    if (exam.is_batch_exam && exam.batch_start_time && exam.batch_end_time) {
        const now = new Date();
        const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        if (currentTime < exam.batch_start_time) {
            return { canStart: false, reason: `Exam starts at ${exam.batch_start_time}` };
        }

        if (currentTime > exam.batch_end_time) {
            return { canStart: false, reason: `Exam ended at ${exam.batch_end_time}` };
        }
    }

    return { canStart: true, reason: '' };
}

/**
 * Format exam duration
 *
 * @param {number} minutes - Duration in minutes
 * @returns {string} Formatted duration (e.g., "30 mins", "1 hr 30 mins")
 */
export function formatDuration(minutes) {
    if (!minutes) return '0 mins';

    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;

    if (hrs === 0) {
        return `${mins} mins`;
    }
    if (mins === 0) {
        return `${hrs} ${hrs === 1 ? 'hr' : 'hrs'}`;
    }
    return `${hrs} ${hrs === 1 ? 'hr' : 'hrs'} ${mins} mins`;
}

/**
 * Calculate exam end time
 *
 * @param {string} startTime - Start time (HH:MM)
 * @param {number} durationMinutes - Duration in minutes
 * @returns {string} End time (HH:MM)
 */
export function calculateEndTime(startTime, durationMinutes) {
    if (!startTime || !durationMinutes) return startTime;

    const [hours, minutes] = startTime.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes + durationMinutes;

    const endHours = Math.floor(totalMinutes / 60) % 24;
    const endMinutes = totalMinutes % 60;

    return `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
}

/**
 * Get exam status badge info
 *
 * @param {Object} exam - Exam object
 * @returns {Object} { text: string, color: string, icon: string }
 */
export function getExamStatusBadge(exam) {
    if (exam.has_completed) {
        return {
            text: 'Completed',
            color: '#10B981',
            icon: 'check-circle'
        };
    }

    if (exam.can_start) {
        return {
            text: 'Ready',
            color: '#3B82F6',
            icon: 'play-circle'
        };
    }

    return {
        text: 'Awaiting Check-in',
        color: '#F59E0B',
        icon: 'clock'
    };
}

export default {
    shuffleArray,
    randomizeExamQuestions,
    validateExamStart,
    formatDuration,
    calculateEndTime,
    getExamStatusBadge
};
