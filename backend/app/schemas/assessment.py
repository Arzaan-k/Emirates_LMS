"""
Assessment Schemas
Pydantic models for assessment-related API operations
"""

from typing import Any, Dict, List, Optional
from datetime import datetime
from pydantic import Field

from app.schemas.base import BaseSchema


class QuestionSchema(BaseSchema):
    """Schema for a quiz/assessment question."""
    question: str
    options: List[str] = Field(..., min_items=2)
    correctIndex: int = Field(..., ge=0)
    explanation: Optional[str] = None
    points: int = 1


# Proctored Assessment Schemas
class AssessmentBase(BaseSchema):
    """Base assessment schema."""
    title: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = None
    time_limit_minutes: int = Field(default=30, ge=1)
    passing_score: int = Field(default=70, ge=0, le=100)


class AssessmentCreate(AssessmentBase):
    """Schema for creating a proctored assessment."""
    id: Optional[str] = None
    questions: List[Dict[str, Any]] = Field(..., min_items=1)
    instructions: Optional[str] = None
    allow_retake: bool = True
    max_attempts: int = 3
    shuffle_questions: bool = False
    show_results: bool = True
    assigned_users: List[str] = []
    assignment_filters: Dict[str, Any] = {}


class AssessmentUpdate(BaseSchema):
    """Schema for updating a proctored assessment."""
    title: Optional[str] = Field(None, min_length=1, max_length=500)
    description: Optional[str] = None
    time_limit_minutes: Optional[int] = Field(None, ge=1)
    passing_score: Optional[int] = Field(None, ge=0, le=100)
    questions: Optional[List[Dict[str, Any]]] = None
    instructions: Optional[str] = None
    active: Optional[bool] = None
    allow_retake: Optional[bool] = None
    max_attempts: Optional[int] = None
    assigned_users: Optional[List[str]] = None
    assignment_filters: Optional[Dict[str, Any]] = None


class AssessmentResponse(AssessmentBase):
    """Schema for assessment response."""
    id: str
    questions: List[Dict[str, Any]]
    total_questions: int
    active: bool = True
    instructions: Optional[str] = None
    allow_retake: bool = True
    max_attempts: int = 3
    max_attempts: int = 3
    assigned_users: List[str] = []
    assignment_filters: Dict[str, Any] = {}
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None


class AssessmentListResponse(BaseSchema):
    """Schema for assessment list."""
    assessments: List[AssessmentResponse]
    total: int


# Assessment Submission Schemas
class BreachLogEntry(BaseSchema):
    """Schema for breach log entry."""
    type: str  # tab_switch, copy_attempt, screen_record_warning
    timestamp: str
    severity: str = "warning"  # warning, critical
    details: Optional[str] = None


class AssessmentSubmissionCreate(BaseSchema):
    """Schema for submitting an assessment."""
    assessment_id: str
    answers: List[int]  # List of selected answer indices
    time_taken_seconds: int = Field(..., ge=0)
    breach_log: List[BreachLogEntry] = []
    started_at: Optional[datetime] = None


class AssessmentSubmissionResponse(BaseSchema):
    """Schema for assessment submission response."""
    id: str
    assessment_id: str
    assessment_title: Optional[str] = None
    user_email: str
    user_name: Optional[str] = None
    correct_count: int
    total_questions: int
    score_percent: float
    passed: bool
    time_taken_seconds: int
    violations: int = 0
    integrity_status: Optional[str] = None
    integrity_score: float = 100.0
    submitted_at: Optional[datetime] = None
    attempt_number: int = 1


# Scheduled Exam Schemas
class ScheduledExamCreate(BaseSchema):
    """Schema for creating a scheduled exam."""
    id: Optional[str] = None
    title: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = None
    exam_date: str  # Format: YYYY-MM-DD
    exam_time: str  # Format: HH:MM
    location: Optional[str] = None
    shift: Optional[str] = None  # Legacy - kept for backward compatibility
    # Batch System
    number_of_batches: int = 1
    batch_assignments: List[Dict[str, Any]] = []  # [{batchNumber, startTime, endTime, maxUsers, users: [...]}]
    supervisor_email: Optional[str] = None
    supervisor_name: Optional[str] = None
    assigned_users: List[str] = []  # List of user emails
    questions: List[Dict[str, Any]] = Field(..., min_items=1)
    time_limit_minutes: int = Field(default=30, ge=1)
    passing_score: int = Field(default=70, ge=0, le=100)


class ScheduledExamUpdate(BaseSchema):
    """Schema for updating a scheduled exam."""
    title: Optional[str] = Field(None, min_length=1, max_length=500)
    description: Optional[str] = None
    exam_date: Optional[str] = None
    exam_time: Optional[str] = None
    location: Optional[str] = None
    shift: Optional[str] = None  # Legacy
    number_of_batches: Optional[int] = None
    batch_assignments: Optional[List[Dict[str, Any]]] = None
    supervisor_email: Optional[str] = None
    supervisor_name: Optional[str] = None
    assigned_users: Optional[List[str]] = None
    questions: Optional[List[Dict[str, Any]]] = None
    time_limit_minutes: Optional[int] = None
    passing_score: Optional[int] = None
    status: Optional[str] = None


class ScheduledExamResponse(BaseSchema):
    """Schema for scheduled exam response."""
    id: str
    title: str
    description: Optional[str] = None
    exam_date: str
    exam_time: str
    location: Optional[str] = None
    shift: Optional[str] = None  # Legacy
    number_of_batches: int = 1
    batch_assignments: List[Dict[str, Any]] = []
    supervisor_email: Optional[str] = None
    supervisor_name: Optional[str] = None
    assigned_users: List[str] = []
    questions: List[Dict[str, Any]]
    time_limit_minutes: int
    passing_score: int
    status: str = "scheduled"
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None


# Exam Attendance Schemas
class ExamAttendanceCreate(BaseSchema):
    """Schema for marking exam attendance."""
    exam_id: str
    user_email: str
    user_name: Optional[str] = None
    marked_present: bool = True


class ExamAttendanceResponse(BaseSchema):
    """Schema for exam attendance response."""
    id: str
    exam_id: str
    user_email: str
    user_name: Optional[str] = None
    marked_present: bool
    marked_by: Optional[str] = None
    marked_at: Optional[datetime] = None
    started_exam: bool = False
    start_time: Optional[datetime] = None
    completed: bool = False
    submission_id: Optional[str] = None
    score: Optional[float] = None
    passed: Optional[bool] = None


class ExamStartRequest(BaseSchema):
    """Schema for starting an exam."""
    exam_id: str


class ExamSubmitRequest(BaseSchema):
    """Schema for submitting exam answers."""
    exam_id: str
    answers: List[int]
    time_taken_seconds: int = Field(..., ge=0)


class ExamResultResponse(BaseSchema):
    """Schema for exam result."""
    exam_id: str
    user_email: str
    user_name: Optional[str] = None
    correct_count: int
    total_questions: int
    score_percent: float
    passed: bool
    time_taken_seconds: int
    submitted_at: Optional[datetime] = None
