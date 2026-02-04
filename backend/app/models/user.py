"""
User Domain Models
User accounts, profiles, progress tracking, and interactions
"""

from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime,
    Text, JSON, Float, ForeignKey, Index
)
from sqlalchemy.orm import relationship

from app.models.base import Base


class User(Base):
    """
    User account with authentication and profile data.
    Central entity for all user-related operations.
    """
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    name = Column(String(255), nullable=False)
    password = Column(String(255), nullable=False)  # Bcrypt hashed
    role = Column(String(100), default="Waffler")
    
    # These columns might be missing in production DB - using Column but will handle None gracefully
    category = Column(String(100), default="Employee", nullable=True)
    privileges = Column(JSON, default=[], nullable=True)
    is_superadmin = Column(Boolean, default=False, nullable=True)
    has_admin_access = Column(Boolean, default=False, nullable=True)
    store = Column(String(255), default="Unassigned", nullable=True)
    self_learning_completed = Column(Boolean, default=False, nullable=True)
    profile_data = Column(JSON, default={}, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=True)
    last_active = Column(DateTime, nullable=True)
    xp_points = Column(Integer, default=0, nullable=True)

    # Relationships
    completions = relationship(
        "CourseCompletion",
        back_populates="user",
        lazy="dynamic"
    )
    submissions = relationship(
        "AssessmentSubmission",
        back_populates="user",
        lazy="dynamic"
    )
    quiz_submissions = relationship(
        "QuizSubmission",
        back_populates="user",
        lazy="dynamic"
    )
    node_progress = relationship(
        "UserNodeProgress",
        back_populates="user",
        lazy="dynamic"
    )
    learning_profile = relationship(
        "UserLearningProfile",
        back_populates="user",
        uselist=False
    )
    interactions = relationship(
        "UserInteraction",
        back_populates="user",
        lazy="dynamic"
    )

    __table_args__ = (
        Index('idx_user_email', 'email'),
        Index('idx_user_store', 'store'),
        Index('idx_user_role', 'role'),
        Index('idx_user_category', 'category'),
    )

    def __repr__(self):
        return f"<User {self.email}>"

    def to_dict(self):
        """Convert to dictionary for API responses."""
        # Ensure privileges is always a list, never null
        privileges = self.privileges if isinstance(self.privileges, list) else []

        # If user is superadmin, automatically grant all privileges for frontend compatibility
        if self.is_superadmin:
            from app.services.user_service import ALL_PRIVILEGES
            privileges = ALL_PRIVILEGES

        return {
            "id": self.id,
            "email": self.email,
            "name": self.name,
            "role": self.role,
            "category": self.category,
            "privileges": privileges,
            "is_superadmin": self.is_superadmin or False,
            "has_admin_access": self.has_admin_access or False,
            "store": self.store,
            "self_learning_completed": self.self_learning_completed or False,
            "profile_data": self.profile_data or {},
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class UserNodeProgress(Base):
    """
    Track user progress through learning path nodes.
    Stores video position, completion status, quiz scores, etc.
    """
    __tablename__ = "user_node_progress"

    id = Column(Integer, primary_key=True, index=True)
    user_email = Column(String(255), ForeignKey('users.email'), nullable=False)
    node_id = Column(String(255), nullable=False)
    completed = Column(Boolean, default=False)
    progress_percent = Column(Float, default=0.0)
    time_spent_seconds = Column(Integer, default=0)
    last_position = Column(Float, default=0.0)  # Video position in seconds
    last_accessed = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    quiz_attempts = Column(Integer, default=0)
    quiz_best_score = Column(Float, default=0.0)
    extra_data = Column(JSON, default={})

    # Relationships
    user = relationship("User", back_populates="node_progress")

    __table_args__ = (
        Index('idx_user_node', 'user_email', 'node_id'),
        Index('idx_user_node_completed', 'user_email', 'completed'),
    )

    def __repr__(self):
        return f"<UserNodeProgress {self.user_email} - {self.node_id}>"


class UserLearningProfile(Base):
    """
    User learning analytics and profile.
    Aggregated learning statistics and preferences.
    """
    __tablename__ = "user_learning_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_email = Column(String(255), ForeignKey('users.email'), unique=True, nullable=False)
    skill_scores = Column(JSON, default={})
    total_xp = Column(Integer, default=0)
    courses_completed = Column(Integer, default=0)
    last_activity = Column(DateTime)
    learning_streak = Column(Integer, default=0)
    weak_areas = Column(JSON, default=[])
    strong_areas = Column(JSON, default=[])
    preferred_learning_style = Column(String(50))  # visual, auditory, reading, kinesthetic
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="learning_profile")

    __table_args__ = (
        Index('idx_learning_profile_user', 'user_email'),
    )

    def __repr__(self):
        return f"<UserLearningProfile {self.user_email}>"


class UserInteraction(Base):
    """
    Track all user interactions for analytics.
    Granular event tracking for behavior analysis.
    """
    __tablename__ = "user_interactions"

    id = Column(Integer, primary_key=True, index=True)
    user_email = Column(String(255), ForeignKey('users.email'), nullable=False)
    interaction_type = Column(String(100), nullable=False)  # view, click, complete, etc.
    content_id = Column(String(255))
    content_type = Column(String(100))  # video, quiz, document, etc.
    duration_seconds = Column(Integer)
    timestamp = Column(DateTime, default=datetime.utcnow)
    extra_data = Column(JSON, default={})

    # Relationships
    user = relationship("User", back_populates="interactions")

    __table_args__ = (
        Index('idx_interaction_user', 'user_email'),
        Index('idx_interaction_type', 'interaction_type'),
        Index('idx_interaction_timestamp', 'timestamp'),
        Index('idx_interaction_content', 'content_id'),
    )

    def __repr__(self):
        return f"<UserInteraction {self.user_email} - {self.interaction_type}>"
