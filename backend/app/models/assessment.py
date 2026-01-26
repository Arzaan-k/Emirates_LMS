"""
Assessment Domain Models
Proctored assessments, scheduled exams, and submissions
"""

from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime,
    Text, JSON, Float, ForeignKey, Index
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
            "created_at": self.created_at.isoformat() if self.created_at else None,
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
    time_taken_seconds = Column(Integer)
    time_limit_seconds = Column(Integer)
    violations = Column(Integer, default=0)
    breach_log = Column(JSON, default=[])
    critical_breaches = Column(Integer, default=0)
    warning_breaches = Column(Integer, default=0)
    integrity_status = Column(String(100))  # clean, warning, flagged
    integrity_score = Column(Float, default=100.0)
    submitted_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime)
    attempt_number = Column(Integer, default=1)

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
            "time_taken_seconds": self.time_taken_seconds,
            "violations": self.violations,
            "integrity_status": self.integrity_status,
            "integrity_score": self.integrity_score,
            "submitted_at": self.submitted_at.isoformat() if self.submitted_at else None,
            "attempt_number": self.attempt_number,
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
    shift = Column(String(100))
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
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "exam_date": self.exam_date,
            "exam_time": self.exam_time,
            "location": self.location,
            "shift": self.shift,
            "supervisor_email": self.supervisor_email,
            "supervisor_name": self.supervisor_name,
            "assigned_users": self.assigned_users or [],
            "questions": self.questions,
            "time_limit_minutes": self.time_limit_minutes,
            "passing_score": self.passing_score,
            "status": self.status,
            "created_by": self.created_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
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
        return {
            "id": self.id,
            "exam_id": self.exam_id,
            "user_email": self.user_email,
            "user_name": self.user_name,
            "marked_present": self.marked_present,
            "marked_by": self.marked_by,
            "marked_at": self.marked_at.isoformat() if self.marked_at else None,
            "started_exam": self.started_exam,
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "completed": self.completed,
            "submission_id": self.submission_id,
            "score": self.score,
            "passed": self.passed,
        }
