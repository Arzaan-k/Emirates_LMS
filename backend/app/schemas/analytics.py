"""
Analytics Schemas
Pydantic models for analytics and reporting
"""

from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import Field

from app.schemas.base import BaseSchema


class DashboardStats(BaseSchema):
    """Schema for main dashboard statistics."""
    total_users: int = 0
    total_stores: int = 0
    total_completions: int = 0
    total_quiz_submissions: int = 0
    avg_quiz_score: float = 0.0
    total_assessments: int = 0
    passed_assessments: int = 0
    total_courses: int = 0
    active_users_today: int = 0
    completions_today: int = 0
    completions_this_week: int = 0
    completions_this_month: int = 0


class StoreAnalytics(BaseSchema):
    """Schema for store-level analytics."""
    store_id: str
    store_name: str
    completion_percent: float = 0.0
    avg_quiz_score: float = 0.0
    hygiene_score: float = 100.0
    risk_level: str = "green"  # green, yellow, red
    employee_count: int = 0
    total_courses: int = 0
    completed_courses: int = 0
    active_learners: int = 0


class StoreDetailAnalytics(StoreAnalytics):
    """Schema for detailed store analytics."""
    employees: List[Dict[str, Any]] = []
    completion_trend: List[Dict[str, Any]] = []
    top_performers: List[Dict[str, Any]] = []
    pending_completions: int = 0


class UserAnalytics(BaseSchema):
    """Schema for user-level analytics."""
    user_email: str
    user_name: Optional[str] = None
    completion_count: int = 0
    quiz_count: int = 0
    avg_quiz_score: float = 0.0
    assessment_count: int = 0
    passed_assessments: int = 0
    completed_course_ids: List[str] = []
    total_time_spent_seconds: int = 0
    current_level: Optional[str] = None
    xp_earned: int = 0
    learning_streak: int = 0


class CompletionTrend(BaseSchema):
    """Schema for completion trend data."""
    date: str
    count: int


class CompletionTrendResponse(BaseSchema):
    """Schema for completion trend response."""
    trends: List[CompletionTrend]
    total: int
    period: str = "30_days"


class LeaderboardEntry(BaseSchema):
    """Schema for leaderboard entry."""
    rank: int
    user_email: str
    user_name: str
    store: Optional[str] = None
    score: float
    completions: int = 0
    xp: int = 0


class LeaderboardResponse(BaseSchema):
    """Schema for leaderboard response."""
    entries: List[LeaderboardEntry]
    total_participants: int
    period: str = "all_time"


class TrainingEffectivenessResponse(BaseSchema):
    """Schema for training effectiveness report."""
    total_courses: int = 0
    total_completions: int = 0
    avg_completion_rate: float = 0.0
    avg_quiz_score: float = 0.0
    avg_time_to_complete_minutes: float = 0.0
    courses_by_completion: List[Dict[str, Any]] = []
    score_distribution: Dict[str, int] = {}


class AuditLogResponse(BaseSchema):
    """Schema for audit log response."""
    id: int
    timestamp: datetime
    user_email: Optional[str] = None
    user_name: Optional[str] = None
    action: str
    target: Optional[str] = None
    target_type: Optional[str] = None
    details: Optional[str] = None
    ip_address: Optional[str] = None
    status: Optional[str] = None


class AuditLogListResponse(BaseSchema):
    """Schema for audit log list."""
    logs: List[AuditLogResponse]
    total: int
    page: int = 1
    per_page: int = 50


class ReportGenerateRequest(BaseSchema):
    """Schema for report generation request."""
    report_type: str = Field(..., pattern="^(completions|quiz_scores|assessments|attendance|store_performance)$")
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    store: Optional[str] = None
    user_email: Optional[str] = None
    format: str = Field(default="json", pattern="^(json|csv|xlsx)$")


class ReportResponse(BaseSchema):
    """Schema for generated report."""
    report_type: str
    generated_at: datetime
    period: Dict[str, Any]
    data: List[Dict[str, Any]]
    summary: Dict[str, Any] = {}
    download_url: Optional[str] = None


# Location tracking schemas
class LocationUpdate(BaseSchema):
    """Schema for location update."""
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    accuracy: Optional[float] = None
    speed: Optional[float] = None
    heading: Optional[float] = None
    battery_level: Optional[int] = Field(None, ge=0, le=100)


class LocationResponse(BaseSchema):
    """Schema for location response."""
    user_email: str
    user_name: Optional[str] = None
    latitude: float
    longitude: float
    accuracy: Optional[float] = None
    speed: Optional[float] = None
    active: bool = True
    store: Optional[str] = None
    timestamp: Optional[datetime] = None


class LocationListResponse(BaseSchema):
    """Schema for location list."""
    locations: List[LocationResponse]
    total: int
    active_count: int = 0


# Attendance schemas
class AttendancePunchIn(BaseSchema):
    """Schema for punch in."""
    location_lat: Optional[float] = None
    location_lng: Optional[float] = None
    notes: Optional[str] = None


class AttendancePunchOut(BaseSchema):
    """Schema for punch out."""
    notes: Optional[str] = None


class AttendanceRecordResponse(BaseSchema):
    """Schema for attendance record response."""
    id: str
    user_email: str
    user_name: Optional[str] = None
    punch_in: datetime
    punch_out: Optional[datetime] = None
    duration_minutes: Optional[int] = None
    location_lat: Optional[float] = None
    location_lng: Optional[float] = None
    store: Optional[str] = None
    status: str = "active"
