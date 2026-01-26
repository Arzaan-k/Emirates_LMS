"""
Quiz Repository
Data access layer for quiz-related operations
"""

from typing import Any, Dict, List, Optional
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.repositories.base import BaseRepository
from app.models.quiz import Quiz, QuizSubmission, LiveQuiz


class QuizRepository(BaseRepository[Quiz]):
    """Repository for Quiz operations."""

    def __init__(self, db: Session):
        super().__init__(db, Quiz)

    def get_active_quizzes(self) -> List[Quiz]:
        """Get all active quizzes."""
        return self.db.query(Quiz).filter(
            Quiz.is_active == True
        ).order_by(Quiz.created_at.desc()).all()

    def get_by_category(self, category: str) -> List[Quiz]:
        """Get quizzes by category."""
        return self.db.query(Quiz).filter(
            Quiz.category == category,
            Quiz.is_active == True
        ).all()

    def get_by_difficulty(self, difficulty: str) -> List[Quiz]:
        """Get quizzes by difficulty."""
        return self.db.query(Quiz).filter(
            Quiz.difficulty == difficulty,
            Quiz.is_active == True
        ).all()

    def search_quizzes(
        self,
        search_term: str,
        skip: int = 0,
        limit: int = 50
    ) -> List[Quiz]:
        """Search quizzes by title."""
        return self.db.query(Quiz).filter(
            Quiz.title.ilike(f"%{search_term}%"),
            Quiz.is_active == True
        ).offset(skip).limit(limit).all()


class QuizSubmissionRepository(BaseRepository[QuizSubmission]):
    """Repository for QuizSubmission operations."""

    def __init__(self, db: Session):
        super().__init__(db, QuizSubmission)

    def get_by_quiz(self, quiz_id: str) -> List[QuizSubmission]:
        """Get all submissions for a quiz."""
        return self.db.query(QuizSubmission).filter(
            QuizSubmission.quiz_id == quiz_id
        ).order_by(QuizSubmission.submitted_at.desc()).all()

    def get_by_user(self, user_email: str) -> List[QuizSubmission]:
        """Get all submissions by a user."""
        return self.db.query(QuizSubmission).filter(
            QuizSubmission.user_email == user_email
        ).order_by(QuizSubmission.submitted_at.desc()).all()

    def get_by_user_and_quiz(self, user_email: str, quiz_id: str) -> List[QuizSubmission]:
        """Get submissions by user for specific quiz."""
        return self.db.query(QuizSubmission).filter(
            QuizSubmission.user_email == user_email,
            QuizSubmission.quiz_id == quiz_id
        ).order_by(QuizSubmission.submitted_at.desc()).all()

    def get_best_score(self, user_email: str, quiz_id: str) -> float:
        """Get user's best score for a quiz."""
        result = self.db.query(func.max(QuizSubmission.score)).filter(
            QuizSubmission.user_email == user_email,
            QuizSubmission.quiz_id == quiz_id
        ).scalar()
        return float(result) if result else 0.0

    def get_average_score_by_quiz(self, quiz_id: str) -> float:
        """Get average score for a quiz."""
        result = self.db.query(func.avg(QuizSubmission.score)).filter(
            QuizSubmission.quiz_id == quiz_id
        ).scalar()
        return float(result) if result else 0.0

    def get_average_score_by_user(self, user_email: str) -> float:
        """Get user's average quiz score."""
        result = self.db.query(func.avg(QuizSubmission.score)).filter(
            QuizSubmission.user_email == user_email
        ).scalar()
        return float(result) if result else 0.0

    def get_submission_count_by_quiz(self, quiz_id: str) -> int:
        """Get number of submissions for a quiz."""
        return self.db.query(func.count(QuizSubmission.id)).filter(
            QuizSubmission.quiz_id == quiz_id
        ).scalar() or 0

    def get_attempt_count(self, user_email: str, quiz_id: str) -> int:
        """Get number of attempts by user for quiz."""
        return self.db.query(func.count(QuizSubmission.id)).filter(
            QuizSubmission.user_email == user_email,
            QuizSubmission.quiz_id == quiz_id
        ).scalar() or 0


class LiveQuizRepository(BaseRepository[LiveQuiz]):
    """Repository for LiveQuiz operations."""

    def __init__(self, db: Session):
        super().__init__(db, LiveQuiz)

    def get_active_quizzes(self) -> List[LiveQuiz]:
        """Get all active live quizzes."""
        return self.db.query(LiveQuiz).filter(
            LiveQuiz.is_active == True
        ).order_by(LiveQuiz.created_at.desc()).all()

    def get_by_status(self, status: str) -> List[LiveQuiz]:
        """Get live quizzes by status."""
        return self.db.query(LiveQuiz).filter(
            LiveQuiz.status == status,
            LiveQuiz.is_active == True
        ).all()

    def get_live_now(self) -> List[LiveQuiz]:
        """Get quizzes that are currently live."""
        return self.db.query(LiveQuiz).filter(
            LiveQuiz.status == "live",
            LiveQuiz.is_active == True
        ).all()

    def update_status(self, quiz_id: str, status: str) -> Optional[LiveQuiz]:
        """Update quiz status."""
        quiz = self.get_by_id(quiz_id)
        if quiz:
            quiz.status = status
            self.db.commit()
            self.db.refresh(quiz)
        return quiz

    def add_participant(self, quiz_id: str, user_email: str) -> Optional[LiveQuiz]:
        """Add participant to live quiz."""
        quiz = self.get_by_id(quiz_id)
        if quiz:
            participants = quiz.participants or []
            if user_email not in participants:
                participants.append(user_email)
                quiz.participants = participants
                self.db.commit()
                self.db.refresh(quiz)
        return quiz

    def update_leaderboard(
        self,
        quiz_id: str,
        leaderboard: List[Dict[str, Any]]
    ) -> Optional[LiveQuiz]:
        """Update quiz leaderboard."""
        quiz = self.get_by_id(quiz_id)
        if quiz:
            quiz.leaderboard = leaderboard
            self.db.commit()
            self.db.refresh(quiz)
        return quiz
