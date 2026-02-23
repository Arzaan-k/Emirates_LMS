"""
Notification Domain Models
Notifications and news feed
"""

from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime,
    Text, JSON, Index
)

from app.models.base import Base


class Notification(Base):
    """
    Notification store for system-wide and targeted notifications.
    """
    __tablename__ = "notifications"

    id = Column(String(255), primary_key=True)
    title = Column(String(500), nullable=False)
    message = Column(Text, nullable=False)
    notification_type = Column(String(100))  # info, warning, urgent, success, error
    created_at = Column(DateTime, default=datetime.utcnow)
    read_by = Column(JSON, default=[])  # List of user emails who read it
    target_users = Column(JSON, default=[])  # Empty = all users, else specific emails
    target_stores = Column(JSON, default=[])  # Target specific stores
    target_roles = Column(JSON, default=[])  # Target specific roles
    target_categories = Column(JSON, default=[])  # Target specific user categories
    source_bucket_id = Column(String(255))  # Bucket that triggered notification
    source_course_id = Column(String(255))  # Course that triggered notification
    is_crucial = Column(Boolean, default=False)  # Important notifications
    priority = Column(String(50), default="normal")  # low, normal, high, urgent
    expires_at = Column(DateTime)  # Auto-expire notification
    action_url = Column(String(1000))  # URL to navigate when clicked
    action_type = Column(String(100))  # navigate, open_modal, external
    created_by = Column(String(255))
    extra_data = Column(JSON, default={})

    __table_args__ = (
        Index('idx_notification_type', 'notification_type'),
        Index('idx_notification_crucial', 'is_crucial'),
        Index('idx_notification_priority', 'priority'),
        Index('idx_notification_created', 'created_at'),
    )

    def __repr__(self):
        return f"<Notification {self.id}: {self.title}>"

    def to_dict(self):
        """Convert to dictionary for API responses."""
        # Helper to ensure UTC timezone in ISO string
        def format_dt(dt):
            if not dt:
                return None
            iso = dt.isoformat()
            if dt.tzinfo is None and not iso.endswith("Z") and "+" not in iso:
                return f"{iso}Z"
            return iso

        return {
            "id": self.id,
            "title": self.title,
            "message": self.message,
            "notification_type": self.notification_type,
            "is_crucial": self.is_crucial,
            "priority": self.priority,
            "action_url": self.action_url,
            "action_type": self.action_type,
            "target_users": self.target_users or [],
            "target_stores": self.target_stores or [],
            "target_roles": self.target_roles or [],
            "target_categories": self.target_categories or [],
            "source_bucket_id": self.source_bucket_id,
            "source_course_id": self.source_course_id,
            "read_by": self.read_by or [],
            "created_by": self.created_by,
            "created_at": format_dt(self.created_at),
            "expires_at": format_dt(self.expires_at),
            "extra_data": self.extra_data or {},
            "media_url": (self.extra_data or {}).get("media_url") if self.extra_data else None,
        }


class NewsFeed(Base):
    """
    News feed posts for company-wide announcements.
    """
    __tablename__ = "news_feed"

    id = Column(String(255), primary_key=True)
    title = Column(String(500), nullable=False)
    content = Column(Text, nullable=False)
    summary = Column(String(500))  # Short preview text
    author = Column(String(255))
    author_email = Column(String(255))
    image = Column(String(1000))  # Featured image URL
    images = Column(JSON, default=[])  # Additional images
    date = Column(String(100))  # Display date string
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    category = Column(String(100))  # announcement, update, event, achievement
    tags = Column(JSON, default=[])
    is_pinned = Column(Boolean, default=False)  # Pinned to top
    is_published = Column(Boolean, default=True)
    likes = Column(JSON, default=[])  # List of user emails who liked
    comments = Column(JSON, default=[])  # Array of comment objects
    view_count = Column(Integer, default=0)

    __table_args__ = (
        Index('idx_news_date', 'created_at'),
        Index('idx_news_category', 'category'),
        Index('idx_news_pinned', 'is_pinned'),
        Index('idx_news_published', 'is_published'),
    )

    def __repr__(self):
        return f"<NewsFeed {self.id}: {self.title}>"

    def to_dict(self):
        """Convert to dictionary for API responses."""
        # Helper to ensure UTC
        def format_dt(dt):
            if not dt:
                return None
            iso = dt.isoformat()
            if dt.tzinfo is None and not iso.endswith("Z") and "+" not in iso:
                return f"{iso}Z"
            return iso

        return {
            "id": self.id,
            "title": self.title,
            "content": self.content,
            "summary": self.summary,
            "author": self.author,
            "author_email": self.author_email,
            "image": self.image,
            "images": self.images or [],
            "date": self.date,
            "category": self.category,
            "tags": self.tags or [],
            "is_pinned": self.is_pinned,
            "is_published": self.is_published,
            "likes": self.likes or [],
            "likes_count": len(self.likes or []),
            "comments_count": len(self.comments or []),
            "view_count": self.view_count,
            "created_at": format_dt(self.created_at),
            
            # CamelCase
            "isPinned": self.is_pinned,
            "isPublished": self.is_published,
            "likesCount": len(self.likes or []),
            "commentsCount": len(self.comments or []),
            "viewCount": self.view_count,
            "createdAt": format_dt(self.created_at),
        }


class CourseFeedback(Base):
    """
    User feedback on courses after completion.
    Star rating (1-5) + optional text description.
    """
    __tablename__ = "course_feedback"

    id = Column(String(255), primary_key=True)
    user_email = Column(String(255), nullable=False)
    course_id = Column(String(255), nullable=False)
    course_title = Column(String(500))
    bucket = Column(String(255))
    rating = Column(Integer, nullable=False)  # 1-5 stars
    comment = Column(Text)  # Optional text feedback
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index('idx_feedback_user', 'user_email'),
        Index('idx_feedback_course', 'course_id'),
        Index('idx_feedback_rating', 'rating'),
        Index('idx_feedback_created', 'created_at'),
    )

    def __repr__(self):
        return f"<CourseFeedback {self.user_email} - {self.course_id} ({self.rating}★)>"

    def to_dict(self):
        # Helper to ensure UTC
        def format_dt(dt):
            if not dt:
                return None
            iso = dt.isoformat()
            if dt.tzinfo is None and not iso.endswith("Z") and "+" not in iso:
                return f"{iso}Z"
            return iso

        return {
            "id": self.id,
            "user_email": self.user_email,
            "course_id": self.course_id,
            "course_title": self.course_title,
            "bucket": self.bucket,
            "rating": self.rating,
            "comment": self.comment,
            "created_at": format_dt(self.created_at),
        }


class CourseSurvey(Base):
    """
    Customizable survey template created by Super Admin for a course.
    Contains a list of questions with types: rating, mcq, text, name.
    Each question can be mandatory or optional.
    """
    __tablename__ = "course_surveys"

    id = Column(String(255), primary_key=True)
    course_id = Column(String(255), nullable=False, unique=True)
    title = Column(String(500), default="Course Feedback Survey")
    description = Column(Text)
    is_active = Column(Boolean, default=True)
    # questions: list of {id, type, label, options, mandatory}
    # type: 'rating' | 'mcq' | 'text' | 'name'
    # options: list of strings (for mcq only)
    questions = Column(JSON, default=[])
    created_by = Column(String(255))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index('idx_survey_course', 'course_id'),
        Index('idx_survey_active', 'is_active'),
    )

    def __repr__(self):
        return f"<CourseSurvey {self.course_id}>"

    def to_dict(self):
        def format_dt(dt):
            if not dt:
                return None
            iso = dt.isoformat()
            if dt.tzinfo is None and not iso.endswith("Z") and "+" not in iso:
                return f"{iso}Z"
            return iso

        return {
            "id": self.id,
            "course_id": self.course_id,
            "title": self.title,
            "description": self.description,
            "is_active": self.is_active,
            "questions": self.questions or [],
            "created_by": self.created_by,
            "created_at": format_dt(self.created_at),
            "updated_at": format_dt(self.updated_at),
        }


class SurveyResponse(Base):
    """
    A user's response to a CourseSurvey.
    answers: {question_id: answer_value}
    """
    __tablename__ = "survey_responses"

    id = Column(String(255), primary_key=True)
    survey_id = Column(String(255), nullable=False)
    course_id = Column(String(255), nullable=False)
    user_email = Column(String(255), nullable=False)
    user_name = Column(String(255))
    answers = Column(JSON, default={})  # {question_id: answer}
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index('idx_survey_response_survey', 'survey_id'),
        Index('idx_survey_response_course', 'course_id'),
        Index('idx_survey_response_user', 'user_email'),
    )

    def __repr__(self):
        return f"<SurveyResponse {self.user_email} - {self.course_id}>"

    def to_dict(self):
        def format_dt(dt):
            if not dt:
                return None
            iso = dt.isoformat()
            if dt.tzinfo is None and not iso.endswith("Z") and "+" not in iso:
                return f"{iso}Z"
            return iso

        return {
            "id": self.id,
            "survey_id": self.survey_id,
            "course_id": self.course_id,
            "user_email": self.user_email,
            "user_name": self.user_name,
            "answers": self.answers or {},
            "created_at": format_dt(self.created_at),
        }
