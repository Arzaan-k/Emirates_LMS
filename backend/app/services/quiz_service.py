"""
Quiz Service
Business logic for quiz management and submissions
"""

import uuid
import logging
from typing import Any, Dict, List, Optional
from datetime import datetime

from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError, ValidationError, BusinessLogicError
from app.repositories.quiz_repository import (
    QuizRepository,
    QuizSubmissionRepository,
    LiveQuizRepository,
)
from app.models.quiz import Quiz, QuizSubmission, LiveQuiz

logger = logging.getLogger(__name__)


class QuizService:
    """Service for quiz operations."""

    def __init__(self, db: Session):
        self.db = db
        self.quiz_repo = QuizRepository(db)
        self.submission_repo = QuizSubmissionRepository(db)
        self.live_quiz_repo = LiveQuizRepository(db)

    # ===========================================
    # QUIZ CRUD
    # ===========================================

    def create_quiz(self, quiz_data: Dict[str, Any]) -> Quiz:
        """Create a new quiz."""
        if not quiz_data.get("id"):
            quiz_data["id"] = str(uuid.uuid4())

        # Validate questions
        questions = quiz_data.get("questions", [])
        if not questions:
            raise ValidationError(detail="Quiz must have at least one question")

        for i, q in enumerate(questions):
            if "question" not in q:
                raise ValidationError(detail=f"Question {i+1} missing 'question' field")
            if "options" not in q or len(q["options"]) < 2:
                raise ValidationError(detail=f"Question {i+1} must have at least 2 options")
            if "correctIndex" not in q:
                raise ValidationError(detail=f"Question {i+1} missing 'correctIndex'")

        quiz_data.setdefault("source", "manual")
        quiz_data.setdefault("difficulty", "medium")
        quiz_data.setdefault("is_active", True)
        quiz_data.setdefault("passing_score", 70)

        quiz = self.quiz_repo.create(quiz_data)
        logger.info(f"Created quiz: {quiz.id} - {quiz.title}")

        return quiz

    def get_quiz_by_id(self, quiz_id: str) -> Quiz:
        """Get quiz by ID."""
        quiz = self.quiz_repo.get_by_id(quiz_id)
        if not quiz:
            raise NotFoundError(resource="Quiz", resource_id=quiz_id)
        return quiz

    def update_quiz(self, quiz_id: str, updates: Dict[str, Any]) -> Quiz:
        """Update a quiz."""
        quiz = self.get_quiz_by_id(quiz_id)

        for key, value in updates.items():
            if hasattr(quiz, key) and value is not None:
                setattr(quiz, key, value)

        quiz.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(quiz)

        return quiz

    def delete_quiz(self, quiz_id: str) -> bool:
        """Delete a quiz."""
        quiz = self.get_quiz_by_id(quiz_id)

        # Check for submissions
        submissions = self.submission_repo.get_by_quiz(quiz_id)
        if submissions:
            # Just deactivate instead of delete
            quiz.is_active = False
            self.db.commit()
            logger.info(f"Deactivated quiz: {quiz_id}")
        else:
            self.db.delete(quiz)
            self.db.commit()
            logger.info(f"Deleted quiz: {quiz_id}")

        return True

    def get_all_quizzes(
        self,
        active_only: bool = True,
        category: Optional[str] = None
    ) -> List[Quiz]:
        """Get all quizzes."""
        if active_only:
            quizzes = self.quiz_repo.get_active_quizzes()
        else:
            quizzes = self.quiz_repo.get_all(order_by="created_at")

        if category:
            quizzes = [q for q in quizzes if q.category == category]

        return quizzes

    # ===========================================
    # QUIZ SUBMISSION
    # ===========================================

    def submit_quiz(
        self,
        quiz_id: str,
        submission_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Submit quiz answers and calculate score.

        Args:
            quiz_id: Quiz ID
            submission_data: Dictionary containing user_name, user_email, answers, time_taken_seconds

        Returns:
            Submission result dictionary
        """
        quiz = self.get_quiz_by_id(quiz_id)

        user_name = submission_data.get("user_name", "Anonymous")
        user_email = submission_data.get("user_email")
        answers = submission_data.get("answers", [])
        time_taken_seconds = submission_data.get("time_taken_seconds")

        # Calculate score
        questions = quiz.questions or []
        correct_count = 0
        total_questions = len(questions)
        correct_answers = []

        for i, question in enumerate(questions):
            correct_index = question.get("correctIndex", 0)
            correct_answers.append(correct_index)

            if i < len(answers):
                if answers[i] == correct_index:
                    correct_count += 1

        score = (correct_count / total_questions * 100) if total_questions > 0 else 0
        passed = score >= quiz.passing_score if quiz.passing_score else None

        # Get attempt number
        attempt_number = 1
        if user_email:
            attempt_number = self.submission_repo.get_attempt_count(user_email, quiz_id) + 1

        submission_data = {
            "id": str(uuid.uuid4()),
            "quiz_id": quiz_id,
            "quiz_title": quiz.title,
            "user_name": user_name,
            "user_email": user_email,
            "answers": answers,
            "correct_answers": correct_answers,
            "score": round(score, 1),
            "score_percent": round(score, 1),
            "passed": passed,
            "time_taken_seconds": time_taken_seconds,
            "submitted_at": datetime.utcnow(),
            "attempt_number": attempt_number,
        }

        submission = self.submission_repo.create(submission_data)
        logger.info(f"Quiz submitted: {user_name} - {quiz_id} Score: {score}%")

        # Return result dictionary
        return {
            "id": submission.id,
            "quiz_id": quiz_id,
            "quiz_title": quiz.title,
            "user_name": user_name,
            "user_email": user_email,
            "score": round(score, 1),
            "score_percent": round(score, 1),
            "correct_count": correct_count,
            "total_questions": total_questions,
            "passed": passed,
            "attempt_number": attempt_number,
            "answers": answers,
            "correct_answers": correct_answers,
        }

    def get_quiz_submissions(self, quiz_id: str) -> List[QuizSubmission]:
        """Get all submissions for a quiz."""
        return self.submission_repo.get_by_quiz(quiz_id)

    def get_submissions_by_quiz(self, quiz_id: str) -> List[QuizSubmission]:
        """Get all submissions for a quiz (alias)."""
        return self.get_quiz_submissions(quiz_id)

    def get_submissions_by_user(self, user_email: str) -> List[QuizSubmission]:
        """Get all quiz submissions by a user (alias)."""
        return self.get_user_quiz_submissions(user_email)

    def get_user_quiz_submissions(self, user_email: str) -> List[QuizSubmission]:
        """Get all quiz submissions by a user."""
        return self.submission_repo.get_by_user(user_email)

    def get_user_best_score(self, user_email: str, quiz_id: str) -> float:
        """Get user's best score for a quiz."""
        return self.submission_repo.get_best_score(user_email, quiz_id)

    def get_quiz_stats(self, quiz_id: str) -> Dict[str, Any]:
        """Get statistics for a quiz."""
        submissions = self.submission_repo.get_by_quiz(quiz_id)
        total = len(submissions)
        avg_score = self.submission_repo.get_average_score_by_quiz(quiz_id)

        # Score distribution
        distribution = {"0-50": 0, "51-70": 0, "71-90": 0, "91-100": 0}
        for s in submissions:
            if s.score <= 50:
                distribution["0-50"] += 1
            elif s.score <= 70:
                distribution["51-70"] += 1
            elif s.score <= 90:
                distribution["71-90"] += 1
            else:
                distribution["91-100"] += 1

        return {
            "total_submissions": total,
            "average_score": round(avg_score, 1),
            "score_distribution": distribution,
        }

    # ===========================================
    # LIVE QUIZZES
    # ===========================================

    def create_live_quiz(self, quiz_data: Dict[str, Any]) -> LiveQuiz:
        """Create a live quiz."""
        if not quiz_data.get("id"):
            quiz_data["id"] = str(uuid.uuid4())

        quiz_data.setdefault("status", "draft")
        quiz_data.setdefault("is_active", True)
        quiz_data.setdefault("participants", [])
        quiz_data.setdefault("leaderboard", [])

        quiz = self.live_quiz_repo.create(quiz_data)
        logger.info(f"Created live quiz: {quiz.id}")

        return quiz

    def get_live_quiz_by_id(self, quiz_id: str) -> LiveQuiz:
        """Get live quiz by ID."""
        quiz = self.live_quiz_repo.get_by_id(quiz_id)
        if not quiz:
            raise NotFoundError(resource="LiveQuiz", resource_id=quiz_id)
        return quiz

    def update_live_quiz(self, quiz_id: str, updates: Dict[str, Any]) -> LiveQuiz:
        """Update a live quiz."""
        quiz = self.get_live_quiz_by_id(quiz_id)

        for key, value in updates.items():
            if hasattr(quiz, key) and value is not None:
                setattr(quiz, key, value)

        quiz.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(quiz)

        return quiz

    def start_live_quiz(self, quiz_id: str) -> LiveQuiz:
        """Start a live quiz."""
        quiz = self.get_live_quiz_by_id(quiz_id)
        quiz.status = "live"
        quiz.start_time = datetime.utcnow()
        self.db.commit()
        self.db.refresh(quiz)
        return quiz

    def end_live_quiz(self, quiz_id: str) -> LiveQuiz:
        """End a live quiz."""
        quiz = self.get_live_quiz_by_id(quiz_id)
        quiz.status = "completed"
        quiz.end_time = datetime.utcnow()
        self.db.commit()
        self.db.refresh(quiz)
        return quiz

    def join_live_quiz(
        self,
        quiz_id: str,
        user_email: str,
        user_name: str
    ) -> LiveQuiz:
        """Join a live quiz."""
        quiz = self.get_live_quiz_by_id(quiz_id)

        if quiz.status != "live":
            raise BusinessLogicError(
                detail="Quiz is not currently live",
                error_code="QUIZ_NOT_LIVE"
            )

        self.live_quiz_repo.add_participant(quiz_id, user_email)
        return quiz

    def submit_live_quiz_answer(
        self,
        quiz_id: str,
        user_email: str,
        user_name: str,
        score: float,
        time_taken: int
    ) -> LiveQuiz:
        """Submit answer for live quiz and update leaderboard."""
        quiz = self.get_live_quiz_by_id(quiz_id)

        leaderboard = quiz.leaderboard or []

        # Update or add user to leaderboard
        existing = next((e for e in leaderboard if e.get("user_email") == user_email), None)

        if existing:
            existing["score"] = max(existing.get("score", 0), score)
            existing["time_taken_seconds"] = time_taken
        else:
            leaderboard.append({
                "user_email": user_email,
                "user_name": user_name,
                "score": score,
                "time_taken_seconds": time_taken,
            })

        # Sort leaderboard
        leaderboard.sort(key=lambda x: (-x["score"], x["time_taken_seconds"]))

        # Add ranks
        for i, entry in enumerate(leaderboard):
            entry["rank"] = i + 1

        self.live_quiz_repo.update_leaderboard(quiz_id, leaderboard)

        return quiz

    def get_active_live_quizzes(self) -> List[LiveQuiz]:
        """Get all active live quizzes."""
        return self.live_quiz_repo.get_active_quizzes()

    def get_live_quizzes_now(self) -> List[LiveQuiz]:
        """Get quizzes that are currently live."""
        return self.live_quiz_repo.get_live_now()

    def get_all_live_quizzes(self) -> List[LiveQuiz]:
        """Get all live quizzes (active ones)."""
        return self.live_quiz_repo.get_active_quizzes()

    def delete_live_quiz(self, quiz_id: str) -> bool:
        """Delete a live quiz."""
        quiz = self.get_live_quiz_by_id(quiz_id)
        self.db.delete(quiz)
        self.db.commit()
        logger.info(f"Deleted live quiz: {quiz_id}")
        return True

    def submit_live_quiz(
        self,
        quiz_id: str,
        user_name: str,
        answers: List[int]
    ) -> Dict[str, Any]:
        """Submit answers for a live quiz."""
        quiz = self.get_live_quiz_by_id(quiz_id)

        # Calculate score
        questions = quiz.questions or []
        correct_count = 0
        total_questions = len(questions)

        for i, question in enumerate(questions):
            correct_index = question.get("correctIndex", 0)
            if i < len(answers) and answers[i] == correct_index:
                correct_count += 1

        score = (correct_count / total_questions * 100) if total_questions > 0 else 0

        logger.info(f"Live quiz submitted: {user_name} - {quiz_id} Score: {score}%")

        return {
            "quiz_id": quiz_id,
            "user_name": user_name,
            "score": round(score, 1),
            "correct_count": correct_count,
            "total_questions": total_questions,
            "answers": answers,
        }
