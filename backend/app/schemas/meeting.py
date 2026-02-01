"""
Meeting Schemas
Pydantic models for meeting operations
"""

from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import Field

from app.schemas.base import BaseSchema


class ParticipantSchema(BaseSchema):
    """Schema for meeting participant."""
    email: str
    name: str
    role: Optional[str] = "participant"  # host, co-host, participant
    joined_at: Optional[datetime] = None
    left_at: Optional[datetime] = None
    is_present: bool = False


class AgendaItemSchema(BaseSchema):
    """Schema for meeting agenda item."""
    title: str
    description: Optional[str] = None
    duration_minutes: int = 10
    presenter: Optional[str] = None


class MeetingCreate(BaseSchema):
    """Schema for creating a meeting."""
    id: Optional[str] = None
    title: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = None
    scheduled_at: datetime
    duration_minutes: int = Field(default=60, ge=5, le=480)
    host_name: Optional[str] = None
    host_email: Optional[str] = None
    room_id: Optional[str] = None
    meeting_url: Optional[str] = None
    participants: List[Dict[str, Any]] = []  # List of participant objects
    max_participants: int = 100
    is_recurring: bool = False
    recurrence_pattern: Optional[str] = None  # daily, weekly, monthly
    agenda: List[Dict[str, Any]] = []


class MeetingUpdate(BaseSchema):
    """Schema for updating a meeting."""
    title: Optional[str] = None
    description: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    duration_minutes: Optional[int] = None
    room_id: Optional[str] = None
    meeting_url: Optional[str] = None
    participants: Optional[List[Dict[str, Any]]] = None
    status: Optional[str] = None  # scheduled, in_progress, completed, cancelled
    agenda: Optional[List[Dict[str, Any]]] = None
    notes: Optional[str] = None
    recording_url: Optional[str] = None


class MeetingResponse(BaseSchema):
    """Schema for meeting response."""
    id: str
    title: str
    description: Optional[str] = None
    scheduled_at: datetime
    duration_minutes: int
    end_time: Optional[datetime] = None
    host_name: Optional[str] = None
    host_email: Optional[str] = None
    room_id: Optional[str] = None
    meeting_url: Optional[str] = None
    status: str = "scheduled"
    participants: List[Dict[str, Any]] = []
    participants_count: int = 0
    max_participants: int = 100
    is_recurring: bool = False
    recurrence_pattern: Optional[str] = None
    agenda: List[Dict[str, Any]] = []
    recording_url: Optional[str] = None
    created_at: Optional[datetime] = None


class MeetingListResponse(BaseSchema):
    """Schema for meeting list."""
    meetings: List[MeetingResponse]
    total: int
    upcoming_count: int = 0


class JoinMeetingRequest(BaseSchema):
    """Schema for joining a meeting."""
    meeting_id: str
    user_email: str
    user_name: str


class LeaveMeetingRequest(BaseSchema):
    """Schema for leaving a meeting."""
    meeting_id: str
    user_email: str


class MeetingRoomResponse(BaseSchema):
    """Schema for meeting room info."""
    room_id: str
    meeting_id: str
    title: str
    host_email: str
    participants: List[ParticipantSchema] = []
    is_active: bool = True
    started_at: Optional[datetime] = None
