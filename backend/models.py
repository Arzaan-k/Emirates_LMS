"""
SQLAlchemy ORM Models for LMS Backend
Maps all in-memory data structures to PostgreSQL tables
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, JSON, Float, ForeignKey, Index
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base

# ==========================================
# USER MODELS
# ==========================================

class User(Base):
    """User account with authentication and profile data"""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    name = Column(String(255), nullable=False)
    password = Column(String(255), nullable=False)  # In production: hash this!
    role = Column(String(100), default="Waffler")
    category = Column(String(100), default="Employee")
    privileges = Column(JSON, default=[])
    is_superadmin = Column(Boolean, default=False)
    has_admin_access = Column(Boolean, default=False)
    store = Column(String(255), default="Unassigned")
    self_learning_completed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    completions = relationship("CourseCompletion", back_populates="user")
    submissions = relationship("AssessmentSubmission", back_populates="user")

    __table_args__ = (
        Index('idx_user_email', 'email'),
        Index('idx_user_store', 'store'),
    )


class UserNodeProgress(Base):
    """Track user progress through learning path nodes"""
    __tablename__ = "user_node_progress"

    id = Column(Integer, primary_key=True, index=True)
    user_email = Column(String(255), ForeignKey('users.email'), nullable=False)
    node_id = Column(String(255), nullable=False)
    completed = Column(Boolean, default=False)
    progress_percent = Column(Float, default=0.0)
    time_spent_seconds = Column(Integer, default=0)
    last_accessed = Column(DateTime, default=datetime.utcnow)
    quiz_attempts = Column(Integer, default=0)
    quiz_best_score = Column(Float, default=0.0)
    extra_data = Column(JSON, default={})

    __table_args__ = (
        Index('idx_user_node', 'user_email', 'node_id'),
    )


# ==========================================
# CONTENT MODELS
# ==========================================

class Content(Base):
    """Main content store for courses, videos, documents"""
    __tablename__ = "content"

    id = Column(String(255), primary_key=True)
    title = Column(String(500), nullable=False)
    description = Column(Text)
    bucket = Column(String(255))  # Category/bucket name
    bucket_id = Column(String(100))
    resource_type = Column(String(100))  # Video, PDF, Image, etc.
    video_url = Column(String(1000))
    file_url = Column(String(1000))
    thumbnail = Column(String(1000))
    duration = Column(String(100))
    timestamp = Column(DateTime, default=datetime.utcnow)
    is_path_node = Column(Boolean, default=False)
    learning_path_type = Column(String(100))  # self_learning or career_progression
    transcript = Column(Text)
    quiz = Column(JSON)
    extra_data = Column(JSON, default={})
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index('idx_content_bucket', 'bucket'),
        Index('idx_content_type', 'resource_type'),
        Index('idx_content_path_node', 'is_path_node'),
    )


class CourseBucket(Base):
    """Course categories/buckets"""
    __tablename__ = "course_buckets"

    id = Column(String(100), primary_key=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    color = Column(String(50))
    icon = Column(String(100))
    created_at = Column(DateTime, default=datetime.utcnow)


# ==========================================
# ASSESSMENT MODELS
# ==========================================

class Quiz(Base):
    """Quiz store for assessments"""
    __tablename__ = "quizzes"

    id = Column(String(255), primary_key=True)
    title = Column(String(500), nullable=False)
    description = Column(Text)
    questions = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by = Column(String(255))
    difficulty = Column(String(50))
    time_limit = Column(String(100))
    source = Column(String(100))  # manual, ai_generated, etc.

    # Relationships
    submissions = relationship("QuizSubmission", back_populates="quiz")


class QuizSubmission(Base):
    """Quiz submission records"""
    __tablename__ = "quiz_submissions"

    id = Column(String(255), primary_key=True)
    quiz_id = Column(String(255), ForeignKey('quizzes.id'), nullable=False)
    user_name = Column(String(255), nullable=False)
    user_email = Column(String(255))
    answers = Column(JSON, nullable=False)
    score = Column(Float, nullable=False)
    submitted_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    quiz = relationship("Quiz", back_populates="submissions")

    __table_args__ = (
        Index('idx_quiz_submission_user', 'user_email'),
    )


class ProcturedAssessment(Base):
    """Proctored assessments with monitoring"""
    __tablename__ = "proctored_assessments"

    id = Column(String(255), primary_key=True)
    title = Column(String(500), nullable=False)
    description = Column(Text)
    questions = Column(JSON, nullable=False)
    time_limit_minutes = Column(Integer, default=30)
    passing_score = Column(Integer, default=70)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by = Column(String(255))
    active = Column(Boolean, default=True)
    total_questions = Column(Integer)

    # Relationships
    submissions = relationship("AssessmentSubmission", back_populates="assessment")


class AssessmentSubmission(Base):
    """Assessment submission with proctoring data"""
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
    integrity_status = Column(String(100))
    submitted_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    assessment = relationship("ProcturedAssessment", back_populates="submissions")
    user = relationship("User", back_populates="submissions")

    __table_args__ = (
        Index('idx_assessment_submission_user', 'user_email'),
        Index('idx_assessment_submission_assessment', 'assessment_id'),
    )


# ==========================================
# COURSE COMPLETION MODELS
# ==========================================

class CourseCompletion(Base):
    """Track course completions with detailed metrics"""
    __tablename__ = "course_completions"

    id = Column(String(255), primary_key=True)
    user_email = Column(String(255), ForeignKey('users.email'), nullable=False)
    course_id = Column(String(255), nullable=False)
    course_title = Column(String(500))
    bucket = Column(String(255))
    score = Column(Float)
    time_spent_seconds = Column(Integer)
    completed_at = Column(DateTime, default=datetime.utcnow)
    quiz_answers = Column(JSON)
    quiz_correct = Column(Integer)
    quiz_total = Column(Integer)

    # Relationships
    user = relationship("User", back_populates="completions")

    __table_args__ = (
        Index('idx_course_completion_user', 'user_email'),
        Index('idx_course_completion_course', 'course_id'),
    )


# ==========================================
# NOTIFICATION MODELS
# ==========================================

class Notification(Base):
    """Notification store"""
    __tablename__ = "notifications"

    id = Column(String(255), primary_key=True)
    title = Column(String(500), nullable=False)
    message = Column(Text, nullable=False)
    notification_type = Column(String(100))  # info, warning, urgent, etc.
    created_at = Column(DateTime, default=datetime.utcnow)
    read_by = Column(JSON, default=[])
    target_users = Column(JSON, default=[])  # Specific users or empty for all
    is_crucial = Column(Boolean, default=False)
    priority = Column(String(50), default="normal")

    __table_args__ = (
        Index('idx_notification_type', 'notification_type'),
        Index('idx_notification_crucial', 'is_crucial'),
    )


# ==========================================
# ATTENDANCE MODELS
# ==========================================

class AttendanceRecord(Base):
    """Punch in/out attendance records"""
    __tablename__ = "attendance_records"

    id = Column(String(255), primary_key=True)
    user_email = Column(String(255), ForeignKey('users.email'), nullable=False)
    user_name = Column(String(255))
    punch_in = Column(DateTime, nullable=False)
    punch_out = Column(DateTime)
    duration_minutes = Column(Integer)
    location_lat = Column(Float)
    location_lng = Column(Float)
    store = Column(String(255))

    __table_args__ = (
        Index('idx_attendance_user', 'user_email'),
        Index('idx_attendance_date', 'punch_in'),
    )


# ==========================================
# NEWS & MEDIA MODELS
# ==========================================

class NewsFeed(Base):
    """News feed posts"""
    __tablename__ = "news_feed"

    id = Column(String(255), primary_key=True)
    title = Column(String(500), nullable=False)
    content = Column(Text, nullable=False)
    author = Column(String(255))
    image = Column(String(1000))
    date = Column(String(100))
    created_at = Column(DateTime, default=datetime.utcnow)
    category = Column(String(100))

    __table_args__ = (
        Index('idx_news_date', 'created_at'),
    )


# ==========================================
# MEETING MODELS
# ==========================================

class Meeting(Base):
    """Virtual meetings/video calls"""
    __tablename__ = "meetings"

    id = Column(String(255), primary_key=True)
    title = Column(String(500), nullable=False)
    description = Column(Text)
    scheduled_at = Column(DateTime, nullable=False)
    duration_minutes = Column(Integer)
    host_name = Column(String(255))
    host_email = Column(String(255))
    room_id = Column(String(255))
    created_at = Column(DateTime, default=datetime.utcnow)
    status = Column(String(100), default="scheduled")
    participants = Column(JSON, default=[])

    __table_args__ = (
        Index('idx_meeting_host', 'host_email'),
        Index('idx_meeting_date', 'scheduled_at'),
    )


# ==========================================
# CRM MODELS
# ==========================================

class CRMTicket(Base):
    """CRM support tickets"""
    __tablename__ = "crm_tickets"

    id = Column(String(255), primary_key=True)
    type = Column(String(100))  # Query, Request, Complaint
    category_id = Column(String(255))
    customer_name = Column(String(255), nullable=False)
    customer_email = Column(String(255))
    customer_phone = Column(String(100))
    subject = Column(String(500), nullable=False)
    description = Column(Text, nullable=False)
    priority = Column(String(50), default="medium")
    status = Column(String(100), default="open")
    created_at = Column(DateTime, default=datetime.utcnow)
    assigned_to = Column(String(255))

    __table_args__ = (
        Index('idx_ticket_status', 'status'),
        Index('idx_ticket_type', 'type'),
        Index('idx_ticket_category', 'category_id'),
    )


class CRMTaskAssignment(Base):
    """CRM task assignments"""
    __tablename__ = "crm_task_assignments"

    id = Column(String(255), primary_key=True)
    ticket_id = Column(String(255), ForeignKey('crm_tickets.id'))
    user_email = Column(String(255), nullable=False)
    user_name = Column(String(255))
    course_category_id = Column(String(255))
    assigned_at = Column(DateTime, default=datetime.utcnow)
    status = Column(String(100), default="assigned")
    resolution = Column(Text)
    completed_at = Column(DateTime)
    xp_earned = Column(Integer, default=0)

    __table_args__ = (
        Index('idx_task_user_email', 'user_email'),
        Index('idx_task_status', 'status'),
        Index('idx_task_ticket', 'ticket_id'),
    )


# ==========================================
# SCHEDULED EXAM MODELS
# ==========================================

class ScheduledExam(Base):
    """Scheduled exams with attendance tracking"""
    __tablename__ = "scheduled_exams"

    id = Column(String(255), primary_key=True)
    title = Column(String(500), nullable=False)
    description = Column(Text)
    exam_date = Column(String(100))
    exam_time = Column(String(100))
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
    status = Column(String(100), default="scheduled")

    __table_args__ = (
        Index('idx_exam_supervisor', 'supervisor_email'),
        Index('idx_exam_date', 'exam_date'),
    )


class ExamAttendance(Base):
    """Exam attendance tracking"""
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
    submission_id = Column(String(255))

    __table_args__ = (
        Index('idx_exam_attendance_exam', 'exam_id'),
        Index('idx_exam_attendance_user', 'user_email'),
    )


# ==========================================
# AUDIT LOG MODELS
# ==========================================

class AuditLog(Base):
    """System audit logs for tracking all actions"""
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    user_email = Column(String(255), index=True)
    user_name = Column(String(255))
    action = Column(String(255), nullable=False)
    target = Column(String(500))
    details = Column(Text)
    ip_address = Column(String(100))
    user_agent = Column(String(500))

    __table_args__ = (
        Index('idx_audit_user', 'user_email'),
        Index('idx_audit_action', 'action'),
        Index('idx_audit_timestamp', 'timestamp'),
    )


# ==========================================
# LEARNING ANALYTICS MODELS
# ==========================================

class UserLearningProfile(Base):
    """User learning analytics and profile"""
    __tablename__ = "user_learning_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_email = Column(String(255), unique=True, nullable=False)
    skill_scores = Column(JSON, default={})
    total_xp = Column(Integer, default=0)
    courses_completed = Column(Integer, default=0)
    last_activity = Column(DateTime)
    learning_streak = Column(Integer, default=0)
    weak_areas = Column(JSON, default=[])
    strong_areas = Column(JSON, default=[])
    updated_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index('idx_learning_profile_user', 'user_email'),
    )


class UserInteraction(Base):
    """Track all user interactions for analytics"""
    __tablename__ = "user_interactions"

    id = Column(Integer, primary_key=True, index=True)
    user_email = Column(String(255), nullable=False)
    interaction_type = Column(String(100), nullable=False)
    content_id = Column(String(255))
    content_type = Column(String(100))
    duration_seconds = Column(Integer)
    timestamp = Column(DateTime, default=datetime.utcnow)
    extra_data = Column(JSON, default={})

    __table_args__ = (
        Index('idx_interaction_user', 'user_email'),
        Index('idx_interaction_type', 'interaction_type'),
        Index('idx_interaction_timestamp', 'timestamp'),
    )


# ==========================================
# RESOURCE MODELS
# ==========================================

class Resource(Base):
    """Resource library items"""
    __tablename__ = "resources"

    id = Column(String(255), primary_key=True)
    title = Column(String(500), nullable=False)
    category = Column(String(255))
    resource_type = Column(String(100))
    url = Column(String(1000))
    description = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    file_size = Column(Integer)
    thumbnail = Column(String(1000))

    __table_args__ = (
        Index('idx_resource_category', 'category'),
        Index('idx_resource_type', 'resource_type'),
    )


# ==========================================
# LOCATION TRACKING MODELS
# ==========================================

class LocationTracking(Base):
    """Real-time location tracking for field staff"""
    __tablename__ = "location_tracking"

    id = Column(Integer, primary_key=True, index=True)
    user_email = Column(String(255), nullable=False)
    user_name = Column(String(255))
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    active = Column(Boolean, default=True)
    accuracy = Column(Float)

    __table_args__ = (
        Index('idx_location_user', 'user_email'),
        Index('idx_location_timestamp', 'timestamp'),
        Index('idx_location_active', 'active'),
    )


# ==========================================
# PROGRESSION LEVEL MODELS
# ==========================================

class ProgressionLevel(Base):
    """Employee progression levels (Waffler, Silver Waffler, etc.)"""
    __tablename__ = "progression_levels"

    id = Column(String(100), primary_key=True)
    name = Column(String(255), unique=True, nullable=False)
    order = Column(Integer, nullable=False, default=0)
    icon = Column(String(100), default="medal-outline")
    color = Column(String(50), default="#6B7280")
    description = Column(Text)
    min_nodes = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index('idx_level_order', 'order'),
        Index('idx_level_name', 'name'),
    )


class AccessRule(Base):
    """Access rules mapping progression levels to accessible courses"""
    __tablename__ = "access_rules"

    id = Column(Integer, primary_key=True, index=True)
    level_name = Column(String(255), nullable=False, index=True)
    accessible_courses = Column(JSON, default=[])  # List of course IDs
    accessible_buckets = Column(JSON, default=[])  # List of bucket names
    max_courses_visible = Column(Integer, default=-1)  # -1 = unlimited
    updated_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index('idx_access_rule_level', 'level_name'),
    )
