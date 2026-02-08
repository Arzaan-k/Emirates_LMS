"""
Content Domain Models
Courses, resources, learning paths, and access control
"""

from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime,
    Text, JSON, Float, Index
)

from app.models.base import Base


class Content(Base):
    """
    Main content store for courses, videos, documents.
    Central entity for all learning content.
    """
    __tablename__ = "content"

    id = Column(String(255), primary_key=True)
    title = Column(String(500), nullable=False)
    description = Column(Text)
    bucket = Column(String(255))  # Category/bucket name
    bucket_id = Column(String(100))
    resource_type = Column(String(100))  # Video, PDF, Image, etc.
    video_url = Column(String(1000))
    audio_url = Column(String(1000))  # For audio version of content
    file_url = Column(String(1000))
    pdf_url = Column(String(1000))  # PDF version for secure viewing (converted from PPT/DOCX)
    thumbnail = Column(String(1000))
    duration = Column(String(100))
    duration_seconds = Column(Integer)  # Duration in seconds for calculations
    timestamp = Column(DateTime, default=datetime.utcnow)
    is_path_node = Column(Boolean, default=False)
    learning_path_type = Column(String(100))  # self_learning or career_progression
    transcript = Column(Text)
    quiz = Column(JSON)
    skippable = Column(Boolean, default=False)
    xp = Column(Integer, default=50)
    order_index = Column(Integer, default=0)  # For ordering in learning paths
    extra_data = Column(JSON, default={})
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index('idx_content_bucket', 'bucket'),
        Index('idx_content_type', 'resource_type'),
        Index('idx_content_path_node', 'is_path_node'),
        Index('idx_content_learning_path', 'learning_path_type'),
        Index('idx_content_path_type_node', 'learning_path_type', 'is_path_node'),
        Index('idx_content_created', 'created_at'),
    )

    def __repr__(self):
        return f"<Content {self.id}: {self.title}>"

    def to_dict(self):
        """Convert to dictionary for API responses."""
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "bucket": self.bucket,
            "bucket_id": self.bucket_id,
            "resource_type": self.resource_type,
            # Snake_case
            "video_url": self.video_url,
            "audio_url": self.audio_url,
            "file_url": self.file_url,
            "pdf_url": self.pdf_url,
            "thumbnail": self.thumbnail,
            "learning_path_type": self.learning_path_type,
            "is_path_node": self.is_path_node,
            # CamelCase for Frontend
            "videoUrl": self.video_url,
            "audioUrl": self.audio_url,
            "fileUrl": self.file_url,
            "pdfUrl": self.pdf_url,
            "thumbnailUrl": self.thumbnail,
            "learningPathType": self.learning_path_type,
            "isPathNode": self.is_path_node,
            "duration": self.duration,
            "duration_seconds": self.duration_seconds,
            "transcript": self.transcript,
            "quiz": self.quiz,
            "skippable": self.skippable,
            "xp": self.xp,
            "order_index": self.order_index,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class CourseBucket(Base):
    """
    Course categories/buckets for organizing content.
    Also serves as skill categories for AI recommendations.
    Supports hierarchical nesting via parent_bucket_id.
    """
    __tablename__ = "course_buckets"

    id = Column(String(100), primary_key=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    parent_bucket_id = Column(String(100))  # ID of parent bucket for nested structure
    folder_path = Column(String(1000))  # Full path from root (e.g., 'BWC/Career/Module1')
    learning_path_type = Column(String(100), default="career_progression")  # career_progression or self_learning
    color = Column(String(50))
    icon = Column(String(100))
    keywords = Column(JSON, default=list)  # Keywords for matching courses to this category
    order_index = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index('idx_bucket_active', 'is_active'),
        Index('idx_bucket_order', 'order_index'),
        Index('idx_bucket_parent', 'parent_bucket_id'),
        Index('idx_bucket_learning_path', 'learning_path_type'),
    )

    def __repr__(self):
        return f"<CourseBucket {self.id}: {self.name}>"

    def to_dict(self):
        """Convert to dictionary for API responses."""
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "parent_bucket_id": self.parent_bucket_id,
            "folder_path": self.folder_path,
            "learning_path_type": self.learning_path_type or "career_progression",
            "color": self.color,
            "icon": self.icon,
            "keywords": self.keywords or [],
            "order_index": self.order_index,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Resource(Base):
    """
    Resource library items (documents, guides, references).
    """
    __tablename__ = "resources"

    id = Column(String(255), primary_key=True)
    title = Column(String(500), nullable=False)
    category = Column(String(255))
    resource_type = Column(String(100))  # PDF, Video, Link, etc.
    url = Column(String(1000))
    description = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    file_size = Column(Integer)
    thumbnail = Column(String(1000))
    download_count = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)

    __table_args__ = (
        Index('idx_resource_category', 'category'),
        Index('idx_resource_type', 'resource_type'),
        Index('idx_resource_active', 'is_active'),
    )

    def __repr__(self):
        return f"<Resource {self.id}: {self.title}>"

    def to_dict(self):
        """Convert to dictionary for API responses."""
        return {
            "id": self.id,
            "title": self.title,
            "category": self.category,
            "resource_type": self.resource_type,
            "url": self.url,
            "description": self.description,
            "file_size": self.file_size,
            "thumbnail": self.thumbnail,
            "download_count": self.download_count,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class ProgressionLevel(Base):
    """
    Employee progression levels (Waffler, Silver Waffler, etc.).
    Defines the career progression hierarchy.
    """
    __tablename__ = "progression_levels"

    id = Column(String(100), primary_key=True)
    name = Column(String(255), unique=True, nullable=False)
    order = Column(Integer, nullable=False, default=0)
    icon = Column(String(100), default="medal-outline")
    color = Column(String(50), default="#6B7280")
    description = Column(Text)
    min_nodes = Column(Integer, default=0)  # Minimum nodes to reach this level
    min_score = Column(Float, default=0.0)  # Minimum average score required
    
    # Exam Configuration
    exam_questions = Column(Integer, default=10)
    exam_time_minutes = Column(Integer, default=15)
    pass_percent = Column(Integer, default=70) # Required percentage to pass
    proctored = Column(Boolean, default=False) # Is camera required?

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index('idx_level_order', 'order'),
        Index('idx_level_name', 'name'),
    )

    def __repr__(self):
        return f"<ProgressionLevel {self.name} (order: {self.order})>"

    def to_dict(self):
        """Convert to dictionary for API responses."""
        return {
            "id": self.id,
            "name": self.name,
            "order": self.order,
            "icon": self.icon,
            "color": self.color,
            "description": self.description,
            "min_nodes": self.min_nodes,
            "min_score": self.min_score,
            "exam_questions": self.exam_questions,
            "exam_time_minutes": self.exam_time_minutes,
            "pass_percent": self.pass_percent,
            "proctored": self.proctored,
        }


class AccessRule(Base):
    """
    Access rules mapping progression levels to accessible courses.
    Controls what content each level can access.
    """
    __tablename__ = "access_rules"

    id = Column(Integer, primary_key=True, index=True)
    level_name = Column(String(255), nullable=False, index=True)
    accessible_courses = Column(JSON, default=[])  # List of course IDs
    accessible_buckets = Column(JSON, default=[])  # List of bucket names
    max_courses_visible = Column(Integer, default=-1)  # -1 = unlimited
    prerequisites = Column(JSON, default=[])  # Course IDs that must be completed first
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index('idx_access_rule_level', 'level_name'),
    )

    def __repr__(self):
        return f"<AccessRule {self.level_name}>"

    def to_dict(self):
        """Convert to dictionary for API responses."""
        return {
            "id": self.id,
            "level_name": self.level_name,
            "accessible_courses": self.accessible_courses or [],
            "accessible_buckets": self.accessible_buckets or [],
            "max_courses_visible": self.max_courses_visible,
            "prerequisites": self.prerequisites or [],
        }
