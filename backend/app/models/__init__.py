"""
SQLAlchemy ORM Models for BW LMS Backend
Organized by domain for better maintainability
"""

from app.models.base import Base, TimestampMixin

# User domain
from app.models.user import (
    User,
    UserNodeProgress,
    UserLearningProfile,
    UserInteraction,
)

# Content domain
from app.models.content import (
    Content,
    CourseBucket,
    Resource,
    ProgressionLevel,
    AccessRule,
)

# Assessment domain
from app.models.assessment import (
    ProcturedAssessment,
    AssessmentSubmission,
    ScheduledExam,
    ExamAttendance,
)

# Quiz domain
from app.models.quiz import (
    Quiz,
    QuizSubmission,
    LiveQuiz,
    LevelExamQuestion,
)

# CRM domain
from app.models.crm import (
    CRMTicket,
    CRMTaskAssignment,
)

# Notification domain
from app.models.notification import (
    Notification,
    NewsFeed,
)

# Meeting domain
from app.models.meeting import (
    Meeting,
)

# Tracking domain
from app.models.tracking import (
    LocationTracking,
    AttendanceRecord,
    CourseCompletion,
)

# Simulation domain
from app.models.simulation import (
    Simulation,
    SimulationProgress,
)

# Analytics domain
from app.models.analytics import (
    AuditLog,
)

# Report domain
from app.models.report import (
    ReportSubscription,
)

# Access Control domain
from app.models.access_control import (
    OrganizationHierarchy,
    UserAccessGrant,
)

__all__ = [
    # Base
    "Base",
    "TimestampMixin",
    # User
    "User",
    "UserNodeProgress",
    "UserLearningProfile",
    "UserInteraction",
    # Content
    "Content",
    "CourseBucket",
    "Resource",
    "ProgressionLevel",
    "AccessRule",
    # Assessment
    "ProcturedAssessment",
    "AssessmentSubmission",
    "ScheduledExam",
    "ExamAttendance",
    # Quiz
    "Quiz",
    "QuizSubmission",
    "LiveQuiz",
    "LevelExamQuestion",
    # CRM
    "CRMTicket",
    "CRMTaskAssignment",
    # Notification
    "Notification",
    "NewsFeed",
    # Meeting
    "Meeting",
    # Tracking
    "LocationTracking",
    "AttendanceRecord",
    "CourseCompletion",
    # Simulation
    "Simulation",
    "SimulationProgress",
    # Analytics
    "AuditLog",
    # Report
    "ReportSubscription",
    # Access Control
    "OrganizationHierarchy",
    "UserAccessGrant",
]
