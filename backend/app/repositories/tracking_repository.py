"""
Tracking Repository
Data access layer for attendance and location tracking operations
"""

from typing import List, Optional, Dict, Any
from datetime import datetime
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.repositories.base import BaseRepository
from app.models.tracking import AttendanceRecord, LocationTracking, CourseCompletion


class AttendanceRepository(BaseRepository[AttendanceRecord]):
    """Repository for AttendanceRecord operations."""

    def __init__(self, db: Session):
        super().__init__(db, AttendanceRecord)

    def get_by_user(self, user_email: str) -> List[AttendanceRecord]:
        """Get all attendance records for a user."""
        return self.db.query(AttendanceRecord).filter(
            AttendanceRecord.user_email == user_email
        ).order_by(AttendanceRecord.punch_in.desc()).all()

    def get_all_records(self) -> List[AttendanceRecord]:
        """Get all attendance records."""
        return self.db.query(AttendanceRecord).order_by(
            AttendanceRecord.punch_in.desc()
        ).all()

    def get_by_store(self, store: str) -> List[AttendanceRecord]:
        """Get attendance records for a specific store."""
        return self.db.query(AttendanceRecord).filter(
            AttendanceRecord.store == store
        ).order_by(AttendanceRecord.punch_in.desc()).all()

    def get_active_punch_in(self, user_email: str) -> Optional[AttendanceRecord]:
        """Get active punch-in record (no punch-out yet) for a user."""
        return self.db.query(AttendanceRecord).filter(
            AttendanceRecord.user_email == user_email,
            AttendanceRecord.punch_out == None,
            AttendanceRecord.status == "active"
        ).order_by(AttendanceRecord.punch_in.desc()).first()

    def punch_in(self, attendance_data: Dict[str, Any]) -> AttendanceRecord:
        """Create a new punch-in record."""
        record = AttendanceRecord(**attendance_data)
        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)
        return record

    def punch_out(self, user_email: str) -> Optional[AttendanceRecord]:
        """Record punch-out for a user with an active punch-in."""
        record = self.get_active_punch_in(user_email)
        if record:
            record.punch_out = datetime.utcnow()
            record.status = "completed"

            # Calculate duration
            if record.punch_in:
                duration = (record.punch_out - record.punch_in).total_seconds() / 60
                record.duration_minutes = int(duration)

            self.db.commit()
            self.db.refresh(record)
        return record

    def get_by_date_range(
        self,
        start_date: datetime,
        end_date: datetime,
        user_email: Optional[str] = None
    ) -> List[AttendanceRecord]:
        """Get attendance records within a date range."""
        query = self.db.query(AttendanceRecord).filter(
            AttendanceRecord.punch_in >= start_date,
            AttendanceRecord.punch_in <= end_date
        )

        if user_email:
            query = query.filter(AttendanceRecord.user_email == user_email)

        return query.order_by(AttendanceRecord.punch_in.desc()).all()


class LocationTrackingRepository(BaseRepository[LocationTracking]):
    """Repository for LocationTracking operations."""

    def __init__(self, db: Session):
        super().__init__(db, LocationTracking)

    def get_active_locations(self) -> List[LocationTracking]:
        """Get all active location records."""
        return self.db.query(LocationTracking).filter(
            LocationTracking.active == True
        ).order_by(LocationTracking.timestamp.desc()).all()

    def get_user_latest_location(self, user_email: str) -> Optional[LocationTracking]:
        """Get the latest location for a user."""
        return self.db.query(LocationTracking).filter(
            LocationTracking.user_email == user_email
        ).order_by(LocationTracking.timestamp.desc()).first()

    def update_location(self, location_data: Dict[str, Any]) -> LocationTracking:
        """Update or create location record for a user."""
        user_email = location_data.get("user_email")

        # Check for existing active location
        existing = self.db.query(LocationTracking).filter(
            LocationTracking.user_email == user_email,
            LocationTracking.active == True
        ).first()

        if existing:
            # Update existing record
            for key, value in location_data.items():
                if hasattr(existing, key) and value is not None:
                    setattr(existing, key, value)
            existing.timestamp = datetime.utcnow()
            self.db.commit()
            self.db.refresh(existing)
            return existing
        else:
            # Create new record
            location = LocationTracking(**location_data)
            location.timestamp = datetime.utcnow()
            self.db.add(location)
            self.db.commit()
            self.db.refresh(location)
            return location

    def stop_tracking(self, user_email: str) -> Optional[LocationTracking]:
        """Stop location tracking for a user."""
        location = self.db.query(LocationTracking).filter(
            LocationTracking.user_email == user_email,
            LocationTracking.active == True
        ).first()

        if location:
            location.active = False
            self.db.commit()
            self.db.refresh(location)
        return location

    def get_by_store(self, store: str) -> List[LocationTracking]:
        """Get active locations for a specific store."""
        return self.db.query(LocationTracking).filter(
            LocationTracking.store == store,
            LocationTracking.active == True
        ).all()


class CourseCompletionRepository(BaseRepository[CourseCompletion]):
    """Repository for CourseCompletion operations."""

    def __init__(self, db: Session):
        super().__init__(db, CourseCompletion)

    def get_by_user(self, user_email: str) -> List[CourseCompletion]:
        """Get all completions for a user."""
        return self.db.query(CourseCompletion).filter(
            CourseCompletion.user_email == user_email
        ).order_by(CourseCompletion.completed_at.desc()).all()

    def get_by_course(self, course_id: str) -> List[CourseCompletion]:
        """Get all completions for a course."""
        return self.db.query(CourseCompletion).filter(
            CourseCompletion.course_id == course_id
        ).order_by(CourseCompletion.completed_at.desc()).all()

    def get_by_user_and_course(
        self,
        user_email: str,
        course_id: str
    ) -> Optional[CourseCompletion]:
        """Check if a user has completed a specific course."""
        return self.db.query(CourseCompletion).filter(
            CourseCompletion.user_email == user_email,
            CourseCompletion.course_id == course_id
        ).first()

    def create_completion(self, completion_data: Dict[str, Any]) -> CourseCompletion:
        """Create a new course completion record."""
        completion = CourseCompletion(**completion_data)
        self.db.add(completion)
        self.db.commit()
        self.db.refresh(completion)
        return completion

    def get_user_total_xp(self, user_email: str) -> int:
        """Get total XP earned by a user from completions."""
        result = self.db.query(func.sum(CourseCompletion.xp_earned)).filter(
            CourseCompletion.user_email == user_email
        ).scalar()
        return int(result) if result else 0

    def get_user_completion_count(self, user_email: str) -> int:
        """Get count of courses completed by a user."""
        return self.db.query(func.count(CourseCompletion.id)).filter(
            CourseCompletion.user_email == user_email
        ).scalar() or 0

    def get_by_bucket(self, bucket: str) -> List[CourseCompletion]:
        """Get completions by content bucket."""
        return self.db.query(CourseCompletion).filter(
            CourseCompletion.bucket == bucket
        ).order_by(CourseCompletion.completed_at.desc()).all()
