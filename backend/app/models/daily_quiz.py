"""
Daily Quiz Model
Supports manual, AI-generated topic-based, and revision-mode daily quizzes.
"""

from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, Text, JSON, Integer, Index

from app.models.base import Base


class DailyQuiz(Base):
    """
    A daily quiz assigned to employees.
    mode: 'manual' | 'ai_topic' | 'revision'
    - manual: admin pastes questions themselves
    - ai_topic: admin provides a topic, AI generates questions
    - revision: AI generates based on the employee's watched course transcripts
    """
    __tablename__ = "daily_quizzes"

    id = Column(String(255), primary_key=True)
    title = Column(String(500), nullable=False)
    description = Column(Text)
    mode = Column(String(50), default="manual")          # manual | ai_topic | revision
    topic = Column(String(500))                           # For ai_topic mode
    difficulty = Column(String(50), default="medium")    # easy | medium | hard
    time_limit_minutes = Column(Integer, default=10)
    questions = Column(JSON, default=[])                  # [{question, options, correctIndex}]
    # Targeting
    assigned_users = Column(JSON, default=[])             # [] = all users
    assigned_roles = Column(JSON, default=[])
    assigned_stores = Column(JSON, default=[])
    # Scheduling
    quiz_date = Column(String(20))                        # YYYY-MM-DD — the day this quiz is for
    is_active = Column(Boolean, default=True)
    # Metadata
    created_by = Column(String(255))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    # Notification sent flag
    notification_sent = Column(Boolean, default=False)

    __table_args__ = (
        Index('idx_dq_date', 'quiz_date'),
        Index('idx_dq_active', 'is_active'),
        Index('idx_dq_mode', 'mode'),
        Index('idx_dq_created', 'created_at'),
    )

    def to_dict(self):
        def fmt(dt):
            if not dt:
                return None
            iso = dt.isoformat()
            if dt.tzinfo is None and not iso.endswith("Z") and "+" not in iso:
                return f"{iso}Z"
            return iso

        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "mode": self.mode,
            "topic": self.topic,
            "difficulty": self.difficulty,
            "time_limit_minutes": self.time_limit_minutes,
            "questions": self.questions or [],
            "assigned_users": self.assigned_users or [],
            "assigned_roles": self.assigned_roles or [],
            "assigned_stores": self.assigned_stores or [],
            "quiz_date": self.quiz_date,
            "is_active": self.is_active,
            "created_by": self.created_by,
            "created_at": fmt(self.created_at),
            "updated_at": fmt(self.updated_at),
            "notification_sent": self.notification_sent,
        }


class DailyQuizResponse(Base):
    """
    Stores the result of a user's daily quiz attempt.
    """
    __tablename__ = "daily_quiz_responses"

    id = Column(String(255), primary_key=True)
    quiz_id = Column(String(255), nullable=False)
    user_email = Column(String(255), nullable=False)
    answers = Column(JSON, default=[])          # [selected_option_index, ...]
    score = Column(Integer, default=0)          # number correct
    total = Column(Integer, default=0)          # total questions
    passed = Column(Boolean, default=False)
    time_taken_seconds = Column(Integer, default=0)
    submitted_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index('idx_dqr_quiz', 'quiz_id'),
        Index('idx_dqr_user', 'user_email'),
        Index('idx_dqr_submitted', 'submitted_at'),
    )

    def to_dict(self):
        def fmt(dt):
            if not dt:
                return None
            iso = dt.isoformat()
            if dt.tzinfo is None and not iso.endswith("Z") and "+" not in iso:
                return f"{iso}Z"
            return iso

        return {
            "id": self.id,
            "quiz_id": self.quiz_id,
            "user_email": self.user_email,
            "answers": self.answers or [],
            "score": self.score,
            "total": self.total,
            "passed": self.passed,
            "time_taken_seconds": self.time_taken_seconds,
            "submitted_at": fmt(self.submitted_at),
        }
