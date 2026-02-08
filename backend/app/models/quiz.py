"""
Quiz Domain Models
Quizzes, submissions, and live quizzes
"""

from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime,
    Text, JSON, Float, ForeignKey, Index
)
from sqlalchemy.orm import relationship

from app.models.base import Base


class Quiz(Base):
    """
    Quiz store for assessments.
    Standalone quizzes that can be assigned to users.
    """
    __tablename__ = "quizzes"

    id = Column(String(255), primary_key=True)
    title = Column(String(500), nullable=False)
    description = Column(Text)
    questions = Column(JSON, nullable=False)  # Array of question objects
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(String(255))
    difficulty = Column(String(50))  # easy, medium, hard
    time_limit = Column(String(100))  # "10 mins", "30 mins", etc.
    time_limit_minutes = Column(Integer)  # Numeric time limit
    source = Column(String(100))  # manual, ai_generated, imported
    category = Column(String(255))
    tags = Column(JSON, default=[])
    is_active = Column(Boolean, default=True)
    passing_score = Column(Integer, default=70)

    # Relationships
    submissions = relationship(
        "QuizSubmission",
        back_populates="quiz",
        lazy="dynamic"
    )

    __table_args__ = (
        Index('idx_quiz_created', 'created_at'),
        Index('idx_quiz_active', 'is_active'),
        Index('idx_quiz_difficulty', 'difficulty'),
        Index('idx_quiz_category', 'category'),
    )

    def __repr__(self):
        return f"<Quiz {self.id}: {self.title}>"

    def to_dict(self):
        """Convert to dictionary for API responses."""
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "questions": self.questions,
            "difficulty": self.difficulty,
            "time_limit": self.time_limit,
            "time_limit_minutes": self.time_limit_minutes,
            "source": self.source,
            "category": self.category,
            "tags": self.tags or [],
            "is_active": self.is_active,
            "passing_score": self.passing_score,
            "created_by": self.created_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class QuizSubmission(Base):
    """
    Quiz submission records.
    Tracks user answers and scores.
    """
    __tablename__ = "quiz_submissions"

    id = Column(String(255), primary_key=True)
    quiz_id = Column(String(255), ForeignKey('quizzes.id'), nullable=False)
    # quiz_title = Column(String(500))  # REMOVED: Column missing in DB, using property instead
    
    @property
    def quiz_title(self):
        return self.quiz.title if self.quiz else "Unknown Quiz"

    user_name = Column(String(255), nullable=False)
    user_email = Column(String(255), ForeignKey('users.email'))
    answers = Column(JSON, nullable=False)  # Array of answer indices
    score = Column(Float, nullable=False)
    # passed = Column(Boolean) # REMOVED: Missing in DB, using property
    
    @property
    def passed(self):
        if self.quiz and self.quiz.passing_score is not None:
             return self.score >= self.quiz.passing_score
        return self.score >= 70.0  # Default passing score if undefined

    # time_taken_seconds = Column(Integer)  # DISABLED: Column missing in prod DB
    # attempt_number = Column(Integer, default=1)  # DISABLED: Column missing in prod DB
    submitted_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    quiz = relationship("Quiz", back_populates="submissions")
    user = relationship("User", back_populates="quiz_submissions")

    __table_args__ = (
        Index('idx_quiz_submission_user', 'user_email'),
        Index('idx_quiz_submission_quiz', 'quiz_id'),
        Index('idx_quiz_submission_date', 'submitted_at'),
        Index('idx_quiz_submission_score', 'score'),
    )

    def __repr__(self):
        return f"<QuizSubmission {self.user_email} - {self.quiz_id}>"

    def to_dict(self):
        """Convert to dictionary for API responses."""
        return {
            "id": self.id,
            "quiz_id": self.quiz_id,
            "quiz_title": self.quiz_title,
            "user_name": self.user_name,
            "user_email": self.user_email,
            "score": self.score,
            "score_percent": self.score,
            "passed": self.passed,
            "time_taken_seconds": getattr(self, 'time_taken_seconds', 0) or 0,
            "submitted_at": self.submitted_at.isoformat() if self.submitted_at else None,
            "attempt_number": getattr(self, 'attempt_number', 1) or 1,
        }


class LevelExamQuestion(Base):
    """
    Stores admin-editable level advancement exam questions.
    These are the questions shown when a user takes the role advancement exam
    (e.g., Waffler → Silver Waffler). Admins can edit, add, delete, or regenerate.
    
    Questions are stored per level_name (the level the user is advancing FROM).
    """
    __tablename__ = "level_exam_questions"

    id = Column(String(255), primary_key=True)
    level_name = Column(String(255), nullable=False, index=True)  # e.g., "Waffler"
    questions = Column(JSON, nullable=False, default=[])  # Array of question objects
    # Format: [{"question": str, "options": [str], "correctIndex": int, "explanation": str}]
    
    source = Column(String(100), default="ai_generated")  # ai_generated, manual, mixed
    generated_from_content = Column(Text, nullable=True)  # Content summary used for AI generation
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    updated_by = Column(String(255), nullable=True)  # Admin who last edited

    __table_args__ = (
        Index('idx_level_exam_level', 'level_name', unique=True),
    )

    def __repr__(self):
        return f"<LevelExamQuestion {self.level_name} ({len(self.questions or [])} questions)>"

    def to_dict(self):
        """Convert to dictionary for API responses."""
        return {
            "id": self.id,
            "level_name": self.level_name,
            "questions": self.questions or [],
            "question_count": len(self.questions or []),
            "source": self.source,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "updated_by": self.updated_by,
        }


class LiveQuiz(Base):
    """
    Live/Topic quizzes for quick assessments.
    Real-time quizzes for training sessions.
    """
    __tablename__ = "live_quizzes"

    id = Column(String(255), primary_key=True)
    title = Column(String(500), nullable=False)
    description = Column(Text)
    difficulty = Column(String(50))
    time_limit = Column(String(100))
    time_limit_minutes = Column(Integer)
    image = Column(String(1000))  # Thumbnail/banner image
    questions = Column(JSON, default=[])
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(String(255))
    is_active = Column(Boolean, default=True)
    start_time = Column(DateTime)  # When the live quiz starts
    end_time = Column(DateTime)  # When the live quiz ends
    participants = Column(JSON, default=[])  # List of participant emails
    leaderboard = Column(JSON, default=[])  # Real-time leaderboard
    status = Column(String(50), default="draft")  # draft, scheduled, live, completed

    __table_args__ = (
        Index('idx_live_quiz_active', 'is_active'),
        Index('idx_live_quiz_status', 'status'),
        Index('idx_live_quiz_start', 'start_time'),
    )

    def __repr__(self):
        return f"<LiveQuiz {self.id}: {self.title}>"

    def to_dict(self):
        """Convert to dictionary for API responses."""
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "difficulty": self.difficulty,
            "time_limit": self.time_limit,
            "time_limit_minutes": self.time_limit_minutes,
            "image": self.image,
            "questions": self.questions,
            "is_active": self.is_active,
            "status": self.status,
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "created_by": self.created_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,

            # CamelCase
            "timeLimit": self.time_limit,
            "timeLimitMinutes": self.time_limit_minutes,
            "isActive": self.is_active,
            "startTime": self.start_time.isoformat() if self.start_time else None,
            "endTime": self.end_time.isoformat() if self.end_time else None,
            "createdBy": self.created_by,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }
