"""
Meeting Repository
Data access layer for meeting operations
"""

from typing import List, Optional, Dict, Any
from datetime import datetime
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.repositories.base import BaseRepository
from app.models.meeting import Meeting


class MeetingRepository(BaseRepository[Meeting]):
    """Repository for Meeting operations."""

    def __init__(self, db: Session):
        super().__init__(db, Meeting)

    def get_by_host(self, host_email: str) -> List[Meeting]:
        """Get meetings hosted by a user."""
        return self.db.query(Meeting).filter(
            Meeting.host_email == host_email
        ).order_by(Meeting.scheduled_at.desc()).all()

    def get_by_status(self, status: str) -> List[Meeting]:
        """Get meetings by status."""
        return self.db.query(Meeting).filter(
            Meeting.status == status
        ).order_by(Meeting.scheduled_at).all()

    def get_upcoming(self, user_email: Optional[str] = None) -> List[Meeting]:
        """Get upcoming meetings."""
        now = datetime.utcnow()
        query = self.db.query(Meeting).filter(
            Meeting.scheduled_at >= now,
            Meeting.status.in_(["scheduled", "in_progress"])
        )

        if user_email:
            # Filter meetings where user is host or participant
            # Since participants is JSON, we'll filter in Python
            meetings = query.order_by(Meeting.scheduled_at).all()
            return [
                m for m in meetings
                if m.host_email == user_email or
                any(p.get('email') == user_email for p in (m.participants or []))
            ]

        return query.order_by(Meeting.scheduled_at).all()

    def get_by_room(self, room_id: str) -> Optional[Meeting]:
        """Get meeting by room ID."""
        return self.db.query(Meeting).filter(
            Meeting.room_id == room_id
        ).first()

    def get_for_user(self, user_email: str) -> List[Meeting]:
        """Get all meetings for a user (as host or participant)."""
        all_meetings = self.db.query(Meeting).order_by(
            Meeting.scheduled_at.desc()
        ).all()

        return [
            m for m in all_meetings
            if m.host_email == user_email or
            any(p.get('email') == user_email for p in (m.participants or []))
        ]

    def update_status(self, meeting_id: str, status: str) -> Optional[Meeting]:
        """Update meeting status."""
        meeting = self.get_by_id(meeting_id)
        if meeting:
            meeting.status = status
            meeting.updated_at = datetime.utcnow()
            self.db.commit()
            self.db.refresh(meeting)
        return meeting

    def add_participant(
        self,
        meeting_id: str,
        user_email: str,
        user_name: str,
        role: str = "participant"
    ) -> Optional[Meeting]:
        """Add participant to a meeting."""
        meeting = self.get_by_id(meeting_id)
        if meeting:
            participants = meeting.participants or []

            # Check if already a participant
            existing = next(
                (p for p in participants if p.get('email') == user_email),
                None
            )

            if existing:
                # Update existing participant
                existing['is_present'] = True
                existing['joined_at'] = datetime.utcnow().isoformat()
            else:
                # Add new participant
                participants.append({
                    "email": user_email,
                    "name": user_name,
                    "role": role,
                    "is_present": True,
                    "joined_at": datetime.utcnow().isoformat(),
                })

            meeting.participants = participants
            self.db.commit()
            self.db.refresh(meeting)
        return meeting

    def remove_participant(
        self,
        meeting_id: str,
        user_email: str
    ) -> Optional[Meeting]:
        """Remove participant from a meeting (mark as left)."""
        meeting = self.get_by_id(meeting_id)
        if meeting:
            participants = meeting.participants or []

            for p in participants:
                if p.get('email') == user_email:
                    p['is_present'] = False
                    p['left_at'] = datetime.utcnow().isoformat()
                    break

            meeting.participants = participants
            self.db.commit()
            self.db.refresh(meeting)
        return meeting

    def get_active_participants_count(self, meeting_id: str) -> int:
        """Get count of active participants in a meeting."""
        meeting = self.get_by_id(meeting_id)
        if not meeting:
            return 0

        participants = meeting.participants or []
        return sum(1 for p in participants if p.get('is_present', False))

    def set_recording_url(
        self,
        meeting_id: str,
        recording_url: str
    ) -> Optional[Meeting]:
        """Set recording URL for a meeting."""
        meeting = self.get_by_id(meeting_id)
        if meeting:
            meeting.recording_url = recording_url
            meeting.updated_at = datetime.utcnow()
            self.db.commit()
            self.db.refresh(meeting)
        return meeting

    def add_notes(self, meeting_id: str, notes: str) -> Optional[Meeting]:
        """Add or update meeting notes."""
        meeting = self.get_by_id(meeting_id)
        if meeting:
            meeting.notes = notes
            meeting.updated_at = datetime.utcnow()
            self.db.commit()
            self.db.refresh(meeting)
        return meeting

    def get_today_meetings(self) -> List[Meeting]:
        """Get meetings scheduled for today."""
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        today_end = today_start.replace(hour=23, minute=59, second=59)

        return self.db.query(Meeting).filter(
            Meeting.scheduled_at >= today_start,
            Meeting.scheduled_at <= today_end
        ).order_by(Meeting.scheduled_at).all()

    def get_all_meetings(self) -> List[Meeting]:
        """Get all meetings."""
        return self.db.query(Meeting).order_by(Meeting.scheduled_at.desc()).all()

    def create_meeting(self, meeting_data: Dict[str, Any]) -> Meeting:
        """Create a new meeting."""
        return self.create(meeting_data)
        
    def delete_meeting(self, meeting_id: str) -> bool:
        """Delete a meeting."""
        meeting = self.get_by_id(meeting_id)
        if meeting:
            self.db.delete(meeting)
            self.db.commit()
            return True
        return False

    def end_meeting(self, meeting_id: str) -> Optional[Meeting]:
        """End a meeting."""
        return self.update_status(meeting_id, "ended")
