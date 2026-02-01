"""
Repository Layer for BW LMS Backend
Data access layer with consistent CRUD operations
"""

from app.repositories.base import BaseRepository
from app.repositories.user_repository import (
    UserRepository,
    UserNodeProgressRepository,
    CourseCompletionRepository,
)
from app.repositories.content_repository import (
    ContentRepository,
    CourseBucketRepository,
    ResourceRepository,
    ProgressionLevelRepository,
    AccessRuleRepository,
)
from app.repositories.assessment_repository import AssessmentRepository
from app.repositories.quiz_repository import QuizRepository
from app.repositories.crm_repository import CRMRepository
from app.repositories.notification_repository import NotificationRepository
from app.repositories.meeting_repository import MeetingRepository
from app.repositories.analytics_repository import AnalyticsRepository

__all__ = [
    "BaseRepository",
    "UserRepository",
    "UserNodeProgressRepository",
    "CourseCompletionRepository",
    "ContentRepository",
    "CourseBucketRepository",
    "ResourceRepository",
    "ProgressionLevelRepository",
    "AccessRuleRepository",
    "AssessmentRepository",
    "QuizRepository",
    "CRMRepository",
    "NotificationRepository",
    "MeetingRepository",
    "AnalyticsRepository",
]

