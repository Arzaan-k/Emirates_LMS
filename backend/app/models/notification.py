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
            "read_by": self.read_by or [],
            "created_by": self.created_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
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
            "created_at": self.created_at.isoformat() if self.created_at else None,
            
            # CamelCase
            "isPinned": self.is_pinned,
            "isPublished": self.is_published,
            "likesCount": len(self.likes or []),
            "commentsCount": len(self.comments or []),
            "viewCount": self.view_count,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }
