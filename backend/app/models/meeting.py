"""
Meeting Domain Models
Virtual meetings and video calls
"""

from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime,
    Text, JSON, Index
)

from app.models.base import Base


class Meeting(Base):
    """
    Virtual meetings/video calls.
    For scheduling and managing training sessions.
    """
    __tablename__ = "meetings"

    id = Column(String(255), primary_key=True)
    title = Column(String(500), nullable=False)
    description = Column(Text)
    scheduled_at = Column(DateTime, nullable=False)
    duration_minutes = Column(Integer, default=60)
    end_time = Column(DateTime)  # Calculated from scheduled_at + duration
    host_name = Column(String(255))
    host_email = Column(String(255))
    room_id = Column(String(255))  # Video room identifier
    meeting_url = Column(String(1000))  # External meeting URL (Zoom, Teams, etc.)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    status = Column(String(100), default="scheduled")  # scheduled, in_progress, completed, cancelled
    participants = Column(JSON, default=[])  # List of participant objects
    max_participants = Column(Integer, default=100)
    is_recurring = Column(Boolean, default=False)
    recurrence_pattern = Column(String(100))  # daily, weekly, monthly
    recording_url = Column(String(1000))
    agenda = Column(JSON, default=[])  # Meeting agenda items
    notes = Column(Text)  # Meeting notes
    attachments = Column(JSON, default=[])  # Shared files

    __table_args__ = (
        Index('idx_meeting_host', 'host_email'),
        Index('idx_meeting_date', 'scheduled_at'),
        Index('idx_meeting_status', 'status'),
        Index('idx_meeting_room', 'room_id'),
    )

    def __repr__(self):
        return f"<Meeting {self.id}: {self.title}>"

    def to_dict(self):
        """Convert to dictionary for API responses."""
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "scheduled_at": self.scheduled_at.isoformat() if self.scheduled_at else None,
            "duration_minutes": self.duration_minutes,
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "host_name": self.host_name,
            "host_email": self.host_email,
            "room_id": self.room_id,
            "meeting_url": self.meeting_url,
            "status": self.status,
            "participants": self.participants or [],
            "max_participants": self.max_participants,
            "is_recurring": self.is_recurring,
            "recurrence_pattern": self.recurrence_pattern,
            "recording_url": self.recording_url,
            "agenda": self.agenda or [],
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
