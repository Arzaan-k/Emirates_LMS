"""
Video Progress Models
Tracks video watching progress, mid-video quizzes, and completion requirements
Based on old backend implementation (server.py lines 767-790)
"""

from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime,
    Float, JSON, ForeignKey, Index
)
from sqlalchemy.orm import relationship

from app.models.base import Base


class VideoProgress(Base):
    """
    Track user progress through video content.
    Matches old backend user_node_progress structure.
    """
    __tablename__ = "video_progress"

    id = Column(String(255), primary_key=True)
    user_email = Column(String(255), ForeignKey('users.email'), nullable=False, index=True)
    node_id = Column(String(255), nullable=False, index=True)  # course/content ID

    # Video watching progress
    video_watched_percent = Column(Float, default=0.0)  # 0-100%
    video_duration_seconds = Column(Float, default=0.0)
    video_position_seconds = Column(Float, default=0.0)  # Current position
    max_position_reached = Column(Float, default=0.0)  # Highest position (prevents cheating)

    # Mid-video quiz progress
    mid_quizzes_passed = Column(Integer, default=0)
    mid_quizzes_total = Column(Integer, default=0)
    mid_quizzes_completed = Column(JSON, default=list)  # List of trigger times completed

    # End quiz progress
    end_quiz_score = Column(Float, default=0.0)  # Best score percentage
    end_quiz_passed = Column(Boolean, default=False)
    end_quiz_attempts = Column(Integer, default=0)

    # Completion status
    completed = Column(Boolean, default=False)
    completed_at = Column(DateTime, nullable=True)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index('idx_video_progress_user_node', 'user_email', 'node_id', unique=True),
        Index('idx_video_progress_completed', 'completed'),
    )

    def __repr__(self):
        return f"<VideoProgress {self.user_email} - {self.node_id} ({self.video_watched_percent}%)>"

    def to_dict(self):
        """Convert to dictionary for API responses."""
        return {
            "id": self.id,
            "user_email": self.user_email,
            "node_id": self.node_id,
            "video_watched_percent": self.video_watched_percent,
            "video_duration_seconds": self.video_duration_seconds,
            "video_position_seconds": self.video_position_seconds,
            "max_position_reached": self.max_position_reached,
            "mid_quizzes_passed": self.mid_quizzes_passed,
            "mid_quizzes_total": self.mid_quizzes_total,
            "mid_quizzes_completed": self.mid_quizzes_completed or [],
            "end_quiz_score": self.end_quiz_score,
            "end_quiz_passed": self.end_quiz_passed,
            "end_quiz_attempts": self.end_quiz_attempts,
            "completed": self.completed,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class MidVideoQuiz(Base):
    """
    Store generated mid-video quizzes.
    Matches old backend mid_video_quizzes structure.
    Generated at 33% and 66% marks of video.
    """
    __tablename__ = "mid_video_quizzes"

    id = Column(String(255), primary_key=True)  # UUID
    node_id = Column(String(255), nullable=False, index=True)
    trigger_time_seconds = Column(Float, nullable=False)  # When to show quiz in video

    # Quiz content (JSON array of questions)
    questions = Column(JSON, nullable=False)
    # Format: [{"question": str, "options": [str], "correctIndex": int}]

    # Metadata
    generated_from_transcript = Column(String(5000), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    attempts = relationship("MidVideoQuizAttempt", back_populates="quiz", lazy="dynamic")

    __table_args__ = (
        Index('idx_mid_quiz_node', 'node_id'),
        Index('idx_mid_quiz_trigger', 'node_id', 'trigger_time_seconds'),
    )

    def __repr__(self):
        return f"<MidVideoQuiz {self.node_id} @ {self.trigger_time_seconds}s>"

    def to_dict(self):
        """Convert to dictionary for API responses."""
        return {
            "quiz_id": self.id,
            "node_id": self.node_id,
            "trigger_time_seconds": self.trigger_time_seconds,
            "questions": self.questions,
            "generated_from_transcript": self.generated_from_transcript,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class MidVideoQuizAttempt(Base):
    """
    Track user attempts at mid-video quizzes.
    Matches old backend mid_video_quiz_attempts structure.
    """
    __tablename__ = "mid_video_quiz_attempts"

    id = Column(String(255), primary_key=True)  # UUID
    user_email = Column(String(255), ForeignKey('users.email'), nullable=False, index=True)
    node_id = Column(String(255), nullable=False, index=True)
    quiz_id = Column(String(255), ForeignKey('mid_video_quizzes.id'), nullable=False)
    trigger_time_seconds = Column(Float, nullable=False)

    # Results
    score = Column(Integer, nullable=False)  # Number correct
    total = Column(Integer, nullable=False)  # Total questions
    score_percent = Column(Float, nullable=False)  # Percentage
    passed = Column(Boolean, nullable=False)  # Whether met passing threshold

    # User answers (for review)
    answers = Column(JSON, nullable=True)  # Array of selected indices

    # Timestamp
    attempted_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    quiz = relationship("MidVideoQuiz", back_populates="attempts")

    __table_args__ = (
        Index('idx_mid_attempt_user', 'user_email'),
        Index('idx_mid_attempt_quiz', 'quiz_id'),
        Index('idx_mid_attempt_user_node', 'user_email', 'node_id'),
    )

    def __repr__(self):
        return f"<MidVideoQuizAttempt {self.user_email} - {self.quiz_id} ({self.score_percent}%)>"

    def to_dict(self):
        """Convert to dictionary for API responses."""
        return {
            "id": self.id,
            "user_email": self.user_email,
            "node_id": self.node_id,
            "quiz_id": self.quiz_id,
            "trigger_time_seconds": self.trigger_time_seconds,
            "score": self.score,
            "total": self.total,
            "score_percent": self.score_percent,
            "passed": self.passed,
            "answers": self.answers,
            "attempted_at": self.attempted_at.isoformat() if self.attempted_at else None,
        }
