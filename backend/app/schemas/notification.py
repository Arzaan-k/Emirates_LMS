"""
Notification Schemas
Pydantic models for notification and news feed operations
"""

from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import Field

from app.schemas.base import BaseSchema


class NotificationCreate(BaseSchema):
    """Schema for creating a notification."""
    id: Optional[str] = None
    title: str = Field(..., min_length=1, max_length=500)
    message: str = Field(..., min_length=1)
    notification_type: str = Field(default="info", pattern="^(info|warning|urgent|success|error)$")
    target_users: List[str] = []  # Empty = all users
    target_stores: List[str] = []  # Target specific stores
    target_roles: List[str] = []  # Target specific roles
    is_crucial: bool = False
    priority: str = Field(default="normal", pattern="^(low|normal|high|urgent)$")
    expires_at: Optional[datetime] = None
    action_url: Optional[str] = None
    action_type: Optional[str] = None  # navigate, open_modal, external


class NotificationUpdate(BaseSchema):
    """Schema for updating a notification."""
    title: Optional[str] = None
    message: Optional[str] = None
    notification_type: Optional[str] = None
    is_crucial: Optional[bool] = None
    priority: Optional[str] = None
    expires_at: Optional[datetime] = None


class NotificationResponse(BaseSchema):
    """Schema for notification response."""
    id: str
    title: str
    message: str
    notification_type: Optional[str] = "info"
    is_crucial: bool = False
    priority: str = "normal"
    action_url: Optional[str] = None
    action_type: Optional[str] = None
    target_users: List[str] = []
    read_by: List[str] = []
    is_read: bool = False  # Computed for current user
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None


class NotificationListResponse(BaseSchema):
    """Schema for notification list."""
    notifications: List[NotificationResponse]
    total: int
    unread_count: int = 0


class MarkNotificationReadRequest(BaseSchema):
    """Schema for marking notification as read."""
    notification_id: str


# News Feed Schemas
class CommentSchema(BaseSchema):
    """Schema for news feed comment."""
    id: str
    author_email: str
    author_name: str
    content: str
    created_at: datetime


class NewsFeedCreate(BaseSchema):
    """Schema for creating a news feed post."""
    id: Optional[str] = None
    title: str = Field(..., min_length=1, max_length=500)
    content: str = Field(..., min_length=1)
    summary: Optional[str] = None
    author: Optional[str] = None
    author_email: Optional[str] = None
    image: Optional[str] = None
    images: List[str] = []
    date: Optional[str] = None
    category: Optional[str] = "announcement"
    tags: List[str] = []
    is_pinned: bool = False


class NewsFeedUpdate(BaseSchema):
    """Schema for updating a news feed post."""
    title: Optional[str] = None
    content: Optional[str] = None
    summary: Optional[str] = None
    image: Optional[str] = None
    images: Optional[List[str]] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    is_pinned: Optional[bool] = None
    is_published: Optional[bool] = None


class NewsFeedResponse(BaseSchema):
    """Schema for news feed response."""
    id: str
    title: str
    content: str
    summary: Optional[str] = None
    author: Optional[str] = None
    author_email: Optional[str] = None
    image: Optional[str] = None
    images: List[str] = []
    date: Optional[str] = None
    category: Optional[str] = None
    tags: List[str] = []
    is_pinned: bool = False
    is_published: bool = True
    likes: List[str] = []
    likes_count: int = 0
    comments_count: int = 0
    view_count: int = 0
    created_at: Optional[datetime] = None


class NewsFeedListResponse(BaseSchema):
    """Schema for news feed list."""
    posts: List[NewsFeedResponse]
    total: int
    pinned_count: int = 0


class NewsLikeRequest(BaseSchema):
    """Schema for liking a news post."""
    news_id: str


class NewsCommentCreate(BaseSchema):
    """Schema for creating a comment on news."""
    news_id: str
    content: str = Field(..., min_length=1, max_length=1000)
