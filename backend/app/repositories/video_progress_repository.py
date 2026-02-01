"""
Video Progress Repository
Data access layer for video progress tracking
"""

from typing import List, Optional, Dict, Any
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_

from app.repositories.base import BaseRepository
from app.models.video_progress import VideoProgress, MidVideoQuiz, MidVideoQuizAttempt


class VideoProgressRepository(BaseRepository[VideoProgress]):
    """Repository for VideoProgress operations."""

    def __init__(self, db: Session):
        super().__init__(db, VideoProgress)

    def get_by_user_and_node(self, user_email: str, node_id: str) -> Optional[VideoProgress]:
        """Get progress for specific user and node."""
        return self.db.query(VideoProgress).filter(
            and_(
                VideoProgress.user_email == user_email,
                VideoProgress.node_id == node_id
            )
        ).first()

    def get_user_progress(self, user_email: str) -> List[VideoProgress]:
        """Get all progress records for a user."""
        return self.db.query(VideoProgress).filter(
            VideoProgress.user_email == user_email
        ).all()

    def get_completed_nodes(self, user_email: str) -> List[str]:
        """Get list of completed node IDs for a user."""
        results = self.db.query(VideoProgress.node_id).filter(
            and_(
                VideoProgress.user_email == user_email,
                VideoProgress.completed == True
            )
        ).all()
        return [r[0] for r in results]

    def upsert_progress(
        self,
        user_email: str,
        node_id: str,
        progress_data: Dict[str, Any]
    ) -> VideoProgress:
        """Create or update progress record."""
        existing = self.get_by_user_and_node(user_email, node_id)

        if existing:
            # Update existing record
            for key, value in progress_data.items():
                if hasattr(existing, key) and value is not None:
                    setattr(existing, key, value)
            existing.updated_at = datetime.utcnow()
            self.db.commit()
            self.db.refresh(existing)
            return existing
        else:
            # Create new record
            import uuid
            progress_data['id'] = f"vprog_{uuid.uuid4().hex[:12]}"
            progress_data['user_email'] = user_email
            progress_data['node_id'] = node_id
            progress_data['created_at'] = datetime.utcnow()
            progress_data['updated_at'] = datetime.utcnow()
            return self.create(progress_data)


class MidVideoQuizRepository(BaseRepository[MidVideoQuiz]):
    """Repository for MidVideoQuiz operations."""

    def __init__(self, db: Session):
        super().__init__(db, MidVideoQuiz)

    def get_by_node(self, node_id: str) -> List[MidVideoQuiz]:
        """Get all quizzes for a node."""
        return self.db.query(MidVideoQuiz).filter(
            MidVideoQuiz.node_id == node_id
        ).order_by(MidVideoQuiz.trigger_time_seconds).all()

    def find_by_trigger_time(
        self,
        node_id: str,
        trigger_time: float,
        tolerance: float = 10.0
    ) -> Optional[MidVideoQuiz]:
        """Find quiz within tolerance of trigger time (prevents duplicates)."""
        quizzes = self.get_by_node(node_id)
        for quiz in quizzes:
            if abs(quiz.trigger_time_seconds - trigger_time) < tolerance:
                return quiz
        return None

    def create_quiz(
        self,
        node_id: str,
        trigger_time: float,
        questions: List[Dict],
        transcript: str = None
    ) -> MidVideoQuiz:
        """Create a new mid-video quiz."""
        import uuid
        quiz_data = {
            'id': f"mvq_{uuid.uuid4().hex[:12]}",
            'node_id': node_id,
            'trigger_time_seconds': trigger_time,
            'questions': questions,
            'generated_from_transcript': transcript,
            'created_at': datetime.utcnow()
        }
        return self.create(quiz_data)


class MidVideoQuizAttemptRepository(BaseRepository[MidVideoQuizAttempt]):
    """Repository for MidVideoQuizAttempt operations."""

    def __init__(self, db: Session):
        super().__init__(db, MidVideoQuizAttempt)

    def get_user_attempts(
        self,
        user_email: str,
        node_id: str = None
    ) -> List[MidVideoQuizAttempt]:
        """Get all attempts for a user, optionally filtered by node."""
        query = self.db.query(MidVideoQuizAttempt).filter(
            MidVideoQuizAttempt.user_email == user_email
        )
        if node_id:
            query = query.filter(MidVideoQuizAttempt.node_id == node_id)
        return query.order_by(MidVideoQuizAttempt.attempted_at.desc()).all()

    def get_attempts_for_quiz(
        self,
        user_email: str,
        quiz_id: str
    ) -> List[MidVideoQuizAttempt]:
        """Get all attempts for a specific quiz by a user."""
        return self.db.query(MidVideoQuizAttempt).filter(
            and_(
                MidVideoQuizAttempt.user_email == user_email,
                MidVideoQuizAttempt.quiz_id == quiz_id
            )
        ).order_by(MidVideoQuizAttempt.attempted_at.desc()).all()

    def has_completed_trigger_time(
        self,
        user_email: str,
        node_id: str,
        trigger_time: float,
        tolerance: float = 5.0
    ) -> bool:
        """Check if user has completed a quiz at this trigger time."""
        attempts = self.db.query(MidVideoQuizAttempt).filter(
            and_(
                MidVideoQuizAttempt.user_email == user_email,
                MidVideoQuizAttempt.node_id == node_id
            )
        ).all()

        for attempt in attempts:
            if abs(attempt.trigger_time_seconds - trigger_time) < tolerance:
                return True
        return False

    def record_attempt(
        self,
        user_email: str,
        node_id: str,
        quiz_id: str,
        trigger_time: float,
        score: int,
        total: int,
        passed: bool,
        answers: List[int] = None
    ) -> MidVideoQuizAttempt:
        """Record a quiz attempt."""
        import uuid
        attempt_data = {
            'id': f"mvqa_{uuid.uuid4().hex[:12]}",
            'user_email': user_email,
            'node_id': node_id,
            'quiz_id': quiz_id,
            'trigger_time_seconds': trigger_time,
            'score': score,
            'total': total,
            'score_percent': (score / total * 100) if total > 0 else 0,
            'passed': passed,
            'answers': answers,
            'attempted_at': datetime.utcnow()
        }
        return self.create(attempt_data)
