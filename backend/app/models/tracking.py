"""
Tracking Domain Models
Location tracking, attendance, and course completion
"""

from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime,
    Text, JSON, Float, ForeignKey, Index
)
from sqlalchemy.orm import relationship

from app.models.base import Base


class LocationTracking(Base):
    """
    Real-time location tracking for field staff.
    """
    __tablename__ = "location_tracking"

    id = Column(Integer, primary_key=True, index=True)
    user_email = Column(String(255), nullable=False)
    user_name = Column(String(255))
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    active = Column(Boolean, default=True)
    accuracy = Column(Float)  # GPS accuracy in meters
    altitude = Column(Float)
    speed = Column(Float)  # Speed in m/s
    heading = Column(Float)  # Direction in degrees
    battery_level = Column(Integer)  # Device battery percentage
    store = Column(String(255))  # Associated store

    __table_args__ = (
        Index('idx_location_user', 'user_email'),
        Index('idx_location_timestamp', 'timestamp'),
        Index('idx_location_active', 'active'),
        Index('idx_location_store', 'store'),
    )

    def __repr__(self):
        return f"<LocationTracking {self.user_email} ({self.latitude}, {self.longitude})>"

    def to_dict(self):
        """Convert to dictionary for API responses."""
        return {
            "id": self.id,
            "user_email": self.user_email,
            "user_name": self.user_name,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "active": self.active,
            "accuracy": self.accuracy,
            "speed": self.speed,
            "store": self.store,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
        }


class AttendanceRecord(Base):
    """
    Punch in/out attendance records.
    """
    __tablename__ = "attendance_records"

    id = Column(String(255), primary_key=True)
    user_email = Column(String(255), ForeignKey('users.email'), nullable=False)
    user_name = Column(String(255))
    punch_in = Column(DateTime, nullable=False)
    punch_out = Column(DateTime)
    duration_minutes = Column(Integer)
    location_lat = Column(Float)
    location_lng = Column(Float)
    store = Column(String(255))
    # The following columns are defined but MISSING in production DB
    # status = Column(String(50), default="active")  # active, completed, absent - MISSING IN DB
    # punch_in_notes = Column(Text)  # MISSING IN DB
    # punch_out_notes = Column(Text)  # MISSING IN DB
    # overtime_minutes = Column(Integer, default=0)  # MISSING IN DB
    # break_duration_minutes = Column(Integer, default=0)  # MISSING IN DB

    __table_args__ = (
        Index('idx_attendance_user', 'user_email'),
        Index('idx_attendance_date', 'punch_in'),
        Index('idx_attendance_store', 'store'),
        # Index('idx_attendance_status', 'status'),
    )

    def __repr__(self):
        return f"<AttendanceRecord {self.user_email} - {self.punch_in}>"

    def to_dict(self):
        """Convert to dictionary for API responses."""
        return {
            "id": self.id,
            "user_email": self.user_email,
            "user_name": self.user_name,
            "punch_in": self.punch_in.isoformat() if self.punch_in else None,
            "punch_out": self.punch_out.isoformat() if self.punch_out else None,
            "duration_minutes": self.duration_minutes,
            "location_lat": self.location_lat,
            "location_lng": self.location_lng,
            "store": self.store,
            "status": self.status,
        }


class CourseCompletion(Base):
    """
    Track course completions with detailed metrics.
    """
    __tablename__ = "course_completions"

    id = Column(String(255), primary_key=True)
    user_email = Column(String(255), ForeignKey('users.email'), nullable=False)
    course_id = Column(String(255), nullable=False)
    course_title = Column(String(500))
    bucket = Column(String(255))
    learning_path_type = Column(String(100))
    score = Column(Float)
    score_percent = Column(Float)
    time_spent_seconds = Column(Integer)
    completed_at = Column(DateTime, default=datetime.utcnow)
    quiz_answers = Column(JSON)
    quiz_correct = Column(Integer)
    quiz_total = Column(Integer)
    xp_earned = Column(Integer, default=0)
    certificate_url = Column(String(1000))
    certificate_issued = Column(Boolean, default=False)

    # Relationships
    user = relationship("User", back_populates="completions")

    __table_args__ = (
        Index('idx_course_completion_user', 'user_email'),
        Index('idx_course_completion_course', 'course_id'),
        Index('idx_course_completion_date', 'completed_at'),
        Index('idx_course_completion_bucket', 'bucket'),
        Index('idx_course_completion_path', 'learning_path_type'),
    )

    def __repr__(self):
        return f"<CourseCompletion {self.user_email} - {self.course_id}>"

    def to_dict(self):
        """Convert to dictionary for API responses."""
        return {
            "id": self.id,
            "user_email": self.user_email,
            "course_id": self.course_id,
            "course_title": self.course_title,
            "bucket": self.bucket,
            "learning_path_type": self.learning_path_type,
            "score": self.score,
            "score_percent": self.score_percent,
            "time_spent_seconds": self.time_spent_seconds,
            "quiz_correct": self.quiz_correct,
            "quiz_total": self.quiz_total,
            "xp_earned": self.xp_earned,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }
