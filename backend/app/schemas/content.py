"""
Content Schemas
Pydantic models for content-related API operations
"""

from typing import Any, Dict, List, Optional
from datetime import datetime
from pydantic import Field

from app.schemas.base import BaseSchema


class ContentBase(BaseSchema):
    """Base content schema."""
    title: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = None
    bucket: Optional[str] = None


class ContentCreate(ContentBase):
    """Schema for creating content."""
    id: Optional[str] = None  # Auto-generated if not provided
    resource_type: Optional[str] = "Video"
    video_url: Optional[str] = None
    audio_url: Optional[str] = None
    file_url: Optional[str] = None
    thumbnail: Optional[str] = None
    duration: Optional[str] = None
    is_path_node: bool = False
    learning_path_type: Optional[str] = "career_progression"
    transcript: Optional[str] = None
    quiz: Optional[Dict[str, Any]] = None
    skippable: bool = False
    xp: int = 50
    order_index: int = 0


class ContentUpdate(BaseSchema):
    """Schema for updating content."""
    title: Optional[str] = Field(None, min_length=1, max_length=500)
    description: Optional[str] = None
    bucket: Optional[str] = None
    video_url: Optional[str] = None
    audio_url: Optional[str] = None
    thumbnail: Optional[str] = None
    duration: Optional[str] = None
    is_path_node: Optional[bool] = None
    learning_path_type: Optional[str] = None
    transcript: Optional[str] = None
    quiz: Optional[Dict[str, Any]] = None
    skippable: Optional[bool] = None
    xp: Optional[int] = None


class ContentResponse(ContentBase):
    """Schema for content response."""
    id: str
    resource_type: Optional[str] = None
    video_url: Optional[str] = None
    audio_url: Optional[str] = None
    file_url: Optional[str] = None
    thumbnail: Optional[str] = None
    duration: Optional[str] = None
    is_path_node: bool = False
    learning_path_type: Optional[str] = None
    transcript: Optional[str] = None
    quiz: Optional[Dict[str, Any]] = None
    skippable: bool = False
    xp: int = 50
    created_at: Optional[datetime] = None


class ContentListResponse(BaseSchema):
    """Schema for content list response."""
    content: List[ContentResponse]
    total: int
    page: int = 1
    per_page: int = 50


# Course Bucket Schemas
class CourseBucketCreate(BaseSchema):
    """Schema for creating a course bucket."""
    id: Optional[str] = None
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    color: Optional[str] = "#6B7280"
    icon: Optional[str] = "folder"
    order_index: int = 0


class CourseBucketUpdate(BaseSchema):
    """Schema for updating a course bucket."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    order_index: Optional[int] = None
    is_active: Optional[bool] = None


class CourseBucketResponse(BaseSchema):
    """Schema for course bucket response."""
    id: str
    name: str
    description: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    order_index: int = 0
    is_active: bool = True
    created_at: Optional[datetime] = None


# Resource Schemas
class ResourceCreate(BaseSchema):
    """Schema for creating a resource."""
    id: Optional[str] = None
    title: str = Field(..., min_length=1, max_length=500)
    category: Optional[str] = None
    resource_type: Optional[str] = None
    url: Optional[str] = None
    description: Optional[str] = None
    file_size: Optional[int] = None
    thumbnail: Optional[str] = None


class ResourceUpdate(BaseSchema):
    """Schema for updating a resource."""
    title: Optional[str] = Field(None, min_length=1, max_length=500)
    category: Optional[str] = None
    resource_type: Optional[str] = None
    url: Optional[str] = None
    description: Optional[str] = None
    thumbnail: Optional[str] = None


class ResourceResponse(BaseSchema):
    """Schema for resource response."""
    id: str
    title: str
    category: Optional[str] = None
    resource_type: Optional[str] = None
    url: Optional[str] = None
    description: Optional[str] = None
    file_size: Optional[int] = None
    thumbnail: Optional[str] = None
    download_count: int = 0
    created_at: Optional[datetime] = None


# Learning Path Schemas
class LearningPathNodeResponse(BaseSchema):
    """Schema for a learning path node."""
    id: str
    title: str
    description: Optional[str] = None
    bucket: Optional[str] = None
    video_url: Optional[str] = None
    audio_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    learning_path_type: Optional[str] = None
    is_path_node: bool = True
    status: str  # completed, active, locked


class LearningPathResponse(BaseSchema):
    """Schema for learning path response."""
    path_type: str
    courses: List[LearningPathNodeResponse]
    total_courses: int
    completed_courses: int
    progress_percent: float
    is_locked: bool = False
    lock_message: Optional[str] = None


class NodeProgressUpdate(BaseSchema):
    """Schema for updating node progress."""
    node_id: str
    progress_percent: Optional[float] = None
    last_position: Optional[float] = None
    time_spent_seconds: Optional[int] = None
    completed: Optional[bool] = None
    quiz_score: Optional[float] = None


class NodeProgressResponse(BaseSchema):
    """Schema for node progress response."""
    node_id: str
    completed: bool
    progress_percent: float
    last_position: float
    time_spent_seconds: int


# Access Rule Schemas
class AccessRuleCreate(BaseSchema):
    """Schema for creating an access rule."""
    level_name: str = Field(..., min_length=1, max_length=255)
    accessible_courses: List[str] = []
    accessible_buckets: List[str] = []
    max_courses_visible: int = -1


class AccessRuleUpdate(BaseSchema):
    """Schema for updating an access rule."""
    accessible_courses: Optional[List[str]] = None
    accessible_buckets: Optional[List[str]] = None
    max_courses_visible: Optional[int] = None


class AccessRuleResponse(BaseSchema):
    """Schema for access rule response."""
    id: int
    level_name: str
    accessible_courses: List[str] = []
    accessible_buckets: List[str] = []
    max_courses_visible: int = -1


# Level Schemas
class ProgressionLevelResponse(BaseSchema):
    """Schema for progression level response."""
    id: str
    name: str
    order: int
    icon: str
    color: str
    description: Optional[str] = None
    min_nodes: int = 0


class UploadResponse(BaseSchema):
    """Schema for file upload response."""
    success: bool
    file_url: str
    file_type: str
    filename: str
    size: Optional[int] = None
    duration: Optional[str] = None
    thumbnail_url: Optional[str] = None
    transcript: Optional[str] = None
