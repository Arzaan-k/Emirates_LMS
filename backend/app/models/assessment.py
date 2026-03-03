"""
Assessment Domain Models
Proctored assessments, scheduled exams, and submissions
"""

from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime,
    Text, JSON, Float, ForeignKey, Index, Numeric
)
from sqlalchemy.orm import relationship

from app.models.base import Base


class ProcturedAssessment(Base):
    """
    Proctored assessments with monitoring and integrity checking.
    """
    __tablename__ = "proctored_assessments"

    id = Column(String(255), primary_key=True)
    title = Column(String(500), nullable=False)
    description = Column(Text)
    questions = Column(JSON, nullable=False)
    time_limit_minutes = Column(Integer, default=30)
    passing_score = Column(Integer, default=70)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(String(255))
    active = Column(Boolean, default=True)
    total_questions = Column(Integer)
    instructions = Column(Text)
    allow_retake = Column(Boolean, default=True)
    max_attempts = Column(Integer, default=3)
    shuffle_questions = Column(Boolean, default=False)
    show_results = Column(Boolean, default=True)
    assigned_users = Column(JSON, default=[])
    assignment_filters = Column(JSON, default={})

    # Relationships
    submissions = relationship(
        "AssessmentSubmission",
        back_populates="assessment",
        lazy="dynamic"
    )

    __table_args__ = (
        Index('idx_assessment_active', 'active'),
        Index('idx_assessment_created', 'created_at'),
    )

    def __repr__(self):
        return f"<ProcturedAssessment {self.id}: {self.title}>"

    def to_dict(self):
        """Convert to dictionary for API responses."""
        # Helper to safely format datetime values
        def safe_iso(val):
            if val is None:
                return None
            if hasattr(val, 'isoformat'):
                return val.isoformat()
            return val

        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "questions": self.questions,
            "time_limit_minutes": self.time_limit_minutes,
            "passing_score": self.passing_score,
            "total_questions": self.total_questions or len(self.questions or []),
            "active": self.active,
            "instructions": self.instructions,
            "allow_retake": self.allow_retake,
            "max_attempts": self.max_attempts,
            "created_by": self.created_by,
            "created_at": safe_iso(self.created_at),
            "updated_at": safe_iso(self.updated_at),
            "assigned_users": self.assigned_users or [],
            "assignment_filters": self.assignment_filters or {},
        }


class AssessmentSubmission(Base):
    """
    Assessment submission with proctoring data and integrity checks.
    """
    __tablename__ = "assessment_submissions"

    id = Column(String(255), primary_key=True)
    assessment_id = Column(String(255), ForeignKey('proctored_assessments.id'), nullable=False)
    assessment_title = Column(String(500))
    user_email = Column(String(255), ForeignKey('users.email'), nullable=False)
    user_name = Column(String(255))
    answers = Column(JSON, nullable=False)
    correct_count = Column(Integer, default=0)
    total_questions = Column(Integer)
    score_percent = Column(Float)
    passed = Column(Boolean, default=False)
    # time_taken_seconds = Column(Integer)  # REMOVED: May be missing in prod DB
    time_limit_seconds = Column(Integer)
    violations = Column(Integer, default=0)
    breach_log = Column(JSON, default=[])
    critical_breaches = Column(Integer, default=0)
    warning_breaches = Column(Integer, default=0)
    integrity_status = Column(String(100))  # clean, warning, flagged
    integrity_score = Column(Float, default=100.0)
    submitted_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime)
    # attempt_number = Column(Integer, default=1)  # DISABLED: May be missing in prod DB

    # Relationships
    assessment = relationship("ProcturedAssessment", back_populates="submissions")
    user = relationship("User", back_populates="submissions")

    __table_args__ = (
        Index('idx_assessment_submission_user', 'user_email'),
        Index('idx_assessment_submission_assessment', 'assessment_id'),
        Index('idx_assessment_submission_passed', 'passed'),
        Index('idx_assessment_submission_date', 'submitted_at'),
    )

    def __repr__(self):
        return f"<AssessmentSubmission {self.user_email} - {self.assessment_id}>"

    def to_dict(self):
        """Convert to dictionary for API responses."""
        # Helper to safely format datetime values
        def safe_iso(val):
            if val is None:
                return None
            if hasattr(val, 'isoformat'):
                return val.isoformat()
            return val

        # Backward-compatible duration reconstruction:
        # - Prefer persisted time_taken_seconds when available.
        # - Otherwise derive from started_at -> submitted_at if both exist.
        raw_time_taken = getattr(self, 'time_taken_seconds', 0) or 0
        if raw_time_taken:
            derived_time_taken_seconds = int(raw_time_taken)
        elif self.started_at and self.submitted_at:
            try:
                derived_time_taken_seconds = max(0, int((self.submitted_at - self.started_at).total_seconds()))
            except Exception:
                derived_time_taken_seconds = 0
        else:
            derived_time_taken_seconds = 0

        return {
            "id": self.id,
            "assessment_id": self.assessment_id,
            "assessment_title": self.assessment_title,
            "user_email": self.user_email,
            "user_name": self.user_name,
            "correct_count": self.correct_count,
            "total_questions": self.total_questions,
            "score_percent": self.score_percent,
            "passed": self.passed,
            "time_taken_seconds": derived_time_taken_seconds,
            "violations": self.violations,
            "critical_breaches": self.critical_breaches or 0,
            "warning_breaches": self.warning_breaches or 0,
            "breach_log": self.breach_log or [],
            "integrity_status": self.integrity_status,
            "integrity_score": self.integrity_score,
            "submitted_at": safe_iso(self.submitted_at),
            "started_at": safe_iso(self.started_at),
            "attempt_number": getattr(self, 'attempt_number', 1) or 1,
        }


class ScheduledExam(Base):
    """
    Scheduled exams with attendance tracking.
    For organizing exam sessions with supervisor oversight.
    """
    __tablename__ = "scheduled_exams"

    id = Column(String(255), primary_key=True)
    title = Column(String(500), nullable=False)
    description = Column(Text)
    exam_date = Column(String(100))
    exam_time = Column(String(100))
    exam_datetime = Column(DateTime)  # Combined date and time
    location = Column(String(255))
    shift = Column(String(100))  # Legacy - kept for backward compatibility
    # Batch System Fields
    number_of_batches = Column(Integer, default=1)
    batch_assignments = Column(JSON, default=[])  # [{batchNumber, startTime, endTime, examDate?, location?, supervisorEmail?, supervisorName?, maxUsers, users: [...], questions?: [...]}]
    supervisor_email = Column(String(255))
    supervisor_name = Column(String(255))
    assigned_users = Column(JSON, default=[])
    questions = Column(JSON, nullable=False)
    time_limit_minutes = Column(Integer, default=30)
    passing_score = Column(Integer, default=70)
    created_by = Column(String(255))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    status = Column(String(100), default="scheduled")  # scheduled, in_progress, completed, cancelled

    # Enhanced Batch System Fields
    exam_status = Column(String(20), default="published")  # draft or published
    scheduled_publish_at = Column(DateTime, nullable=True)  # Optional: auto-publish at this time
    allow_different_questions_per_batch = Column(Boolean, default=False)  # If true, each batch can have different questions
    randomize_question_order = Column(Boolean, default=False)  # Randomize question order for each user
    randomize_option_order = Column(Boolean, default=False)  # Randomize option order (ABCD shuffled)

    # Geofencing Fields
    geofencing_enabled = Column(Boolean, default=False)  # Enable location-based validation
    geofencing_radius = Column(Integer, default=100)  # Radius in meters
    geofencing_latitude = Column(Numeric(10, 8), nullable=True)  # Exam location latitude
    geofencing_longitude = Column(Numeric(11, 8), nullable=True)  # Exam location longitude

    # PIN-Based Check-in Fields
    pin_enabled = Column(Boolean, default=False)  # Enable PIN-based auto check-in
    pin_generation_minutes = Column(Integer, default=5)  # Generate PIN X minutes before exam
    pin_validity_minutes = Column(Integer, default=30)  # PIN valid for X minutes
    generated_pin = Column(String(4), nullable=True)  # Auto-generated 4-digit PIN
    pin_generated_at = Column(DateTime, nullable=True)  # When PIN was generated
    active_pins = Column(JSON, default=[])  # List of previously generated PINs that are still valid

    # Relationships
    attendance_records = relationship(
        "ExamAttendance",
        back_populates="exam",
        lazy="dynamic"
    )

    __table_args__ = (
        Index('idx_exam_supervisor', 'supervisor_email'),
        Index('idx_exam_date', 'exam_date'),
        Index('idx_exam_status', 'status'),
        Index('idx_exam_datetime', 'exam_datetime'),
    )

    def __repr__(self):
        return f"<ScheduledExam {self.id}: {self.title}>"

    def to_dict(self):
        """Convert to dictionary for API responses."""
        # Helper to safely format datetime values
        def safe_iso(val):
            if val is None:
                return None
            if hasattr(val, 'isoformat'):
                return val.isoformat()
            return val

        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "exam_date": self.exam_date,
            "exam_time": self.exam_time,
            "exam_datetime": safe_iso(self.exam_datetime),
            "location": self.location,
            "shift": self.shift,  # Legacy - kept for backward compatibility
            "number_of_batches": self.number_of_batches or 1,
            "batch_assignments": self.batch_assignments or [],
            # CamelCase aliases for frontend
            "numberOfBatches": self.number_of_batches or 1,
            "batchAssignments": self.batch_assignments or [],
            "supervisor_email": self.supervisor_email,
            "supervisor_name": self.supervisor_name,
            "assigned_users": self.assigned_users or [],
            "questions": self.questions,
            "time_limit_minutes": self.time_limit_minutes,
            "passing_score": self.passing_score,
            "status": self.status,
            "created_by": self.created_by,
            "created_at": safe_iso(self.created_at),
            "updated_at": safe_iso(self.updated_at),
            # Enhanced Batch System
            "exam_status": getattr(self, 'exam_status', 'published'),
            "scheduled_publish_at": safe_iso(getattr(self, 'scheduled_publish_at', None)),
            "allow_different_questions_per_batch": getattr(self, 'allow_different_questions_per_batch', False),
            "randomize_question_order": getattr(self, 'randomize_question_order', False),
            "randomize_option_order": getattr(self, 'randomize_option_order', False),
            # CamelCase for enhanced fields
            "examStatus": getattr(self, 'exam_status', 'published'),
            "scheduledPublishAt": safe_iso(getattr(self, 'scheduled_publish_at', None)),
            "allowDifferentQuestionsPerBatch": getattr(self, 'allow_different_questions_per_batch', False),
            "randomizeQuestionOrder": getattr(self, 'randomize_question_order', False),
            "randomizeOptionOrder": getattr(self, 'randomize_option_order', False),
            # Geofencing Fields
            "geofencing_enabled": getattr(self, 'geofencing_enabled', False),
            "geofencing_radius": getattr(self, 'geofencing_radius', 100),
            "geofencing_latitude": float(self.geofencing_latitude) if self.geofencing_latitude else None,
            "geofencing_longitude": float(self.geofencing_longitude) if self.geofencing_longitude else None,
            "geofencingEnabled": getattr(self, 'geofencing_enabled', False),
            "geofencingRadius": getattr(self, 'geofencing_radius', 100),
            "geofencingLatitude": float(self.geofencing_latitude) if self.geofencing_latitude else None,
            "geofencingLongitude": float(self.geofencing_longitude) if self.geofencing_longitude else None,
            # PIN Fields
            "pin_enabled": getattr(self, 'pin_enabled', False),
            "pin_generation_minutes": getattr(self, 'pin_generation_minutes', 5),
            "pin_validity_minutes": getattr(self, 'pin_validity_minutes', 30),
            "generated_pin": getattr(self, 'generated_pin', None),
            "pin_generated_at": safe_iso(getattr(self, 'pin_generated_at', None)),
            "pinEnabled": getattr(self, 'pin_enabled', False),
            "pinGenerationMinutes": getattr(self, 'pin_generation_minutes', 5),
            "pinValidityMinutes": getattr(self, 'pin_validity_minutes', 30),
            "generatedPin": getattr(self, 'generated_pin', None),
            "pinGeneratedAt": safe_iso(getattr(self, 'pin_generated_at', None)),
        }


class ExamAttendance(Base):
    """
    Exam attendance tracking.
    Records who attended, who started the exam, and submission status.
    """
    __tablename__ = "exam_attendance"

    id = Column(String(255), primary_key=True)
    exam_id = Column(String(255), ForeignKey('scheduled_exams.id'), nullable=False)
    user_email = Column(String(255), nullable=False)
    user_name = Column(String(255))
    marked_present = Column(Boolean, default=False)
    marked_by = Column(String(255))
    marked_at = Column(DateTime)
    check_in_time = Column(DateTime)  # When user checked in (via PIN or supervisor)
    check_in_method = Column(String(50))  # PIN, SUPERVISOR, SUPERVISOR_OVERRIDE
    override_reason = Column(Text)  # Reason for supervisor override
    started_exam = Column(Boolean, default=False)
    start_time = Column(DateTime)
    completed = Column(Boolean, default=False)
    completion_time = Column(DateTime)
    submission_id = Column(String(255))  # Link to assessment submission
    score = Column(Float)
    passed = Column(Boolean)

    # Relationships
    exam = relationship("ScheduledExam", back_populates="attendance_records")

    __table_args__ = (
        Index('idx_exam_attendance_exam', 'exam_id'),
        Index('idx_exam_attendance_user', 'user_email'),
        Index('idx_exam_attendance_present', 'marked_present'),
    )

    def __repr__(self):
        return f"<ExamAttendance {self.user_email} - {self.exam_id}>"

    def to_dict(self):
        """Convert to dictionary for API responses."""
        # Helper to safely format datetime values
        def safe_iso(val):
            if val is None:
                return None
            if hasattr(val, 'isoformat'):
                return val.isoformat()
            return val

        return {
            "id": self.id,
            "exam_id": self.exam_id,
            "user_email": self.user_email,
            "user_name": self.user_name,
            "marked_present": self.marked_present,
            "marked_by": self.marked_by,
            "marked_at": safe_iso(self.marked_at),
            "started_exam": self.started_exam,
            "start_time": safe_iso(self.start_time),
            "completed": self.completed,
            "completion_time": safe_iso(self.completion_time),
            "submission_id": self.submission_id,
            "score": self.score,
            "passed": self.passed,
        }
