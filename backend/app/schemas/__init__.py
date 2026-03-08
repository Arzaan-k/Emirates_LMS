"""
Pydantic Schemas for Emirates LMS Backend
Data validation and serialization for API requests/responses
"""

from app.schemas.base import (
    BaseSchema,
    PaginatedResponse,
    MessageResponse,
    SuccessResponse,
    ErrorResponse,
)

from app.schemas.user import (
    UserBase,
    UserCreate,
    UserUpdate,
    UserResponse,
    UserListResponse,
    UserLogin,
    TokenResponse,
    RefreshTokenRequest,
    PasswordChange,
    UserPrivilegesUpdate,
)

from app.schemas.content import (
    ContentBase,
    ContentCreate,
    ContentUpdate,
    ContentResponse,
    ContentListResponse,
    CourseBucketCreate,
    CourseBucketUpdate,
    CourseBucketResponse,
    ResourceCreate,
    ResourceUpdate,
    ResourceResponse,
    LearningPathResponse,
    NodeProgressUpdate,
    AccessRuleCreate,
    AccessRuleResponse,
)

from app.schemas.assessment import (
    AssessmentBase,
    AssessmentCreate,
    AssessmentUpdate,
    AssessmentResponse,
    AssessmentSubmissionCreate,
    AssessmentSubmissionResponse,
    ScheduledExamCreate,
    ScheduledExamUpdate,
    ScheduledExamResponse,
    ExamAttendanceCreate,
    ExamAttendanceResponse,
)

from app.schemas.quiz import (
    QuizBase,
    QuizCreate,
    QuizUpdate,
    QuizResponse,
    QuizSubmissionCreate,
    QuizSubmissionResponse,
    QuizGenerateRequest,
    LiveQuizCreate,
    LiveQuizResponse,
)

from app.schemas.crm import (
    CRMTicketCreate,
    CRMTicketUpdate,
    CRMTicketResponse,
    CRMTaskAssignmentCreate,
    CRMTaskAssignmentResponse,
)

from app.schemas.notification import (
    NotificationCreate,
    NotificationResponse,
    NewsFeedCreate,
    NewsFeedUpdate,
    NewsFeedResponse,
)

from app.schemas.meeting import (
    MeetingCreate,
    MeetingUpdate,
    MeetingResponse,
)

from app.schemas.analytics import (
    DashboardStats,
    StoreAnalytics,
    UserAnalytics,
    CompletionTrend,
    AuditLogResponse,
)

__all__ = [
    # Base
    "BaseSchema",
    "PaginatedResponse",
    "MessageResponse",
    "SuccessResponse",
    "ErrorResponse",
    # User
    "UserBase",
    "UserCreate",
    "UserUpdate",
    "UserResponse",
    "UserListResponse",
    "UserLogin",
    "TokenResponse",
    "RefreshTokenRequest",
    "PasswordChange",
    "UserPrivilegesUpdate",
    # Content
    "ContentBase",
    "ContentCreate",
    "ContentUpdate",
    "ContentResponse",
    "ContentListResponse",
    "CourseBucketCreate",
    "CourseBucketUpdate",
    "CourseBucketResponse",
    "ResourceCreate",
    "ResourceUpdate",
    "ResourceResponse",
    "LearningPathResponse",
    "NodeProgressUpdate",
    "AccessRuleCreate",
    "AccessRuleResponse",
    # Assessment
    "AssessmentBase",
    "AssessmentCreate",
    "AssessmentUpdate",
    "AssessmentResponse",
    "AssessmentSubmissionCreate",
    "AssessmentSubmissionResponse",
    "ScheduledExamCreate",
    "ScheduledExamUpdate",
    "ScheduledExamResponse",
    "ExamAttendanceCreate",
    "ExamAttendanceResponse",
    # Quiz
    "QuizBase",
    "QuizCreate",
    "QuizUpdate",
    "QuizResponse",
    "QuizSubmissionCreate",
    "QuizSubmissionResponse",
    "QuizGenerateRequest",
    "LiveQuizCreate",
    "LiveQuizResponse",
    # CRM
    "CRMTicketCreate",
    "CRMTicketUpdate",
    "CRMTicketResponse",
    "CRMTaskAssignmentCreate",
    "CRMTaskAssignmentResponse",
    # Notification
    "NotificationCreate",
    "NotificationResponse",
    "NewsFeedCreate",
    "NewsFeedUpdate",
    "NewsFeedResponse",
    # Meeting
    "MeetingCreate",
    "MeetingUpdate",
    "MeetingResponse",
    # Analytics
    "DashboardStats",
    "StoreAnalytics",
    "UserAnalytics",
    "CompletionTrend",
    "AuditLogResponse",
]
