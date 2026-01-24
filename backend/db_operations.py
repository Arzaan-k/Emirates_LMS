"""
Database Operations Helper
Provides functions to interact with PostgreSQL database
Designed to work alongside existing in-memory operations for gradual migration
"""

from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, desc
from typing import List, Optional, Dict, Any
from datetime import datetime
import uuid

from database import SessionLocal
from models import (
    User, UserNodeProgress, Content, CourseBucket, Quiz, QuizSubmission,
    ProcturedAssessment, AssessmentSubmission, CourseCompletion, Notification,
    AttendanceRecord, NewsFeed, Meeting, CRMTicket, CRMTaskAssignment,
    ScheduledExam, ExamAttendance, AuditLog, UserLearningProfile,
    UserInteraction, Resource, LocationTracking
)


# ==========================================
# USER OPERATIONS
# ==========================================

def get_user_by_email(db: Session, email: str) -> Optional[User]:
    """Get user by email"""
    return db.query(User).filter(User.email == email).first()


def create_user(db: Session, user_data: dict) -> User:
    """Create new user"""
    user = User(**user_data)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def update_user(db: Session, email: str, updates: dict) -> Optional[User]:
    """Update user data"""
    user = get_user_by_email(db, email)
    if user:
        for key, value in updates.items():
            if hasattr(user, key):
                setattr(user, key, value)
        db.commit()
        db.refresh(user)
    return user


def get_all_users(db: Session) -> List[User]:
    """Get all users"""
    return db.query(User).all()


# ==========================================
# CONTENT OPERATIONS
# ==========================================

def create_content(db: Session, content_data: dict) -> Content:
    """Create new content"""
    content = Content(**content_data)
    db.add(content)
    db.commit()
    db.refresh(content)
    return content


def get_content_by_id(db: Session, content_id: str) -> Optional[Content]:
    """Get content by ID"""
    return db.query(Content).filter(Content.id == content_id).first()


def get_all_content(db: Session, bucket: Optional[str] = None,
                    is_path_node: Optional[bool] = None) -> List[Content]:
    """Get all content with optional filters"""
    query = db.query(Content)
    if bucket:
        query = query.filter(Content.bucket == bucket)
    if is_path_node is not None:
        query = query.filter(Content.is_path_node == is_path_node)
    return query.order_by(Content.timestamp).all()


def update_content(db: Session, content_id: str, updates: dict) -> Optional[Content]:
    """Update content"""
    content = get_content_by_id(db, content_id)
    if content:
        for key, value in updates.items():
            if hasattr(content, key):
                setattr(content, key, value)
        db.commit()
        db.refresh(content)
    return content


def delete_content(db: Session, content_id: str) -> bool:
    """Delete content"""
    content = get_content_by_id(db, content_id)
    if content:
        db.delete(content)
        db.commit()
        return True
    return False


# ==========================================
# COURSE COMPLETION OPERATIONS
# ==========================================

def create_course_completion(db: Session, completion_data: dict) -> CourseCompletion:
    """Record course completion"""
    if 'id' not in completion_data:
        completion_data['id'] = str(uuid.uuid4())
    completion = CourseCompletion(**completion_data)
    db.add(completion)
    db.commit()
    db.refresh(completion)
    return completion


def get_user_completions(db: Session, user_email: str) -> List[CourseCompletion]:
    """Get all completions for a user"""
    return db.query(CourseCompletion).filter(
        CourseCompletion.user_email == user_email
    ).all()


def get_completion_by_course(db: Session, user_email: str, course_id: str) -> Optional[CourseCompletion]:
    """Check if user completed specific course"""
    return db.query(CourseCompletion).filter(
        and_(
            CourseCompletion.user_email == user_email,
            CourseCompletion.course_id == course_id
        )
    ).first()


# ==========================================
# QUIZ OPERATIONS
# ==========================================

def create_quiz(db: Session, quiz_data: dict) -> Quiz:
    """Create new quiz"""
    quiz = Quiz(**quiz_data)
    db.add(quiz)
    db.commit()
    db.refresh(quiz)
    return quiz


def get_quiz_by_id(db: Session, quiz_id: str) -> Optional[Quiz]:
    """Get quiz by ID"""
    return db.query(Quiz).filter(Quiz.id == quiz_id).first()


def get_all_quizzes(db: Session) -> List[Quiz]:
    """Get all quizzes"""
    return db.query(Quiz).order_by(desc(Quiz.created_at)).all()


def create_quiz_submission(db: Session, submission_data: dict) -> QuizSubmission:
    """Record quiz submission"""
    if 'id' not in submission_data:
        submission_data['id'] = str(uuid.uuid4())
    submission = QuizSubmission(**submission_data)
    db.add(submission)
    db.commit()
    db.refresh(submission)
    return submission


# ==========================================
# ASSESSMENT OPERATIONS
# ==========================================

def create_assessment(db: Session, assessment_data: dict) -> ProcturedAssessment:
    """Create new proctored assessment"""
    assessment = ProcturedAssessment(**assessment_data)
    db.add(assessment)
    db.commit()
    db.refresh(assessment)
    return assessment


def get_assessment_by_id(db: Session, assessment_id: str) -> Optional[ProcturedAssessment]:
    """Get assessment by ID"""
    return db.query(ProcturedAssessment).filter(
        ProcturedAssessment.id == assessment_id
    ).first()


def get_all_assessments(db: Session, active_only: bool = True) -> List[ProcturedAssessment]:
    """Get all assessments"""
    query = db.query(ProcturedAssessment)
    if active_only:
        query = query.filter(ProcturedAssessment.active == True)
    return query.order_by(desc(ProcturedAssessment.created_at)).all()


def create_assessment_submission(db: Session, submission_data: dict) -> AssessmentSubmission:
    """Record assessment submission"""
    if 'id' not in submission_data:
        submission_data['id'] = str(uuid.uuid4())
    submission = AssessmentSubmission(**submission_data)
    db.add(submission)
    db.commit()
    db.refresh(submission)
    return submission


def get_assessment_submissions(db: Session, assessment_id: str) -> List[AssessmentSubmission]:
    """Get all submissions for an assessment"""
    return db.query(AssessmentSubmission).filter(
        AssessmentSubmission.assessment_id == assessment_id
    ).order_by(desc(AssessmentSubmission.submitted_at)).all()


# ==========================================
# NOTIFICATION OPERATIONS
# ==========================================

def create_notification(db: Session, notification_data: dict) -> Notification:
    """Create new notification"""
    notification = Notification(**notification_data)
    db.add(notification)
    db.commit()
    db.refresh(notification)
    return notification


def get_all_notifications(db: Session, limit: int = 50) -> List[Notification]:
    """Get recent notifications"""
    return db.query(Notification).order_by(
        desc(Notification.created_at)
    ).limit(limit).all()


def mark_notification_read(db: Session, notification_id: str, user_email: str) -> bool:
    """Mark notification as read by user"""
    notification = db.query(Notification).filter(
        Notification.id == notification_id
    ).first()
    if notification:
        read_by = notification.read_by or []
        if user_email not in read_by:
            read_by.append(user_email)
            notification.read_by = read_by
            db.commit()
        return True
    return False


# ==========================================
# NEWS FEED OPERATIONS
# ==========================================

def create_news_post(db: Session, news_data: dict) -> NewsFeed:
    """Create news post"""
    news = NewsFeed(**news_data)
    db.add(news)
    db.commit()
    db.refresh(news)
    return news


def get_all_news(db: Session, limit: int = 20) -> List[NewsFeed]:
    """Get recent news"""
    return db.query(NewsFeed).order_by(
        desc(NewsFeed.created_at)
    ).limit(limit).all()


# ==========================================
# MEETING OPERATIONS
# ==========================================

def create_meeting(db: Session, meeting_data: dict) -> Meeting:
    """Create new meeting"""
    meeting = Meeting(**meeting_data)
    db.add(meeting)
    db.commit()
    db.refresh(meeting)
    return meeting


def get_all_meetings(db: Session, host_email: Optional[str] = None) -> List[Meeting]:
    """Get all meetings"""
    query = db.query(Meeting)
    if host_email:
        query = query.filter(Meeting.host_email == host_email)
    return query.order_by(desc(Meeting.scheduled_at)).all()


def get_upcoming_meetings(db: Session, user_email: str) -> List[Meeting]:
    """Get upcoming meetings for user"""
    now = datetime.utcnow()
    return db.query(Meeting).filter(
        Meeting.scheduled_at >= now
    ).order_by(Meeting.scheduled_at).all()


# ==========================================
# ATTENDANCE OPERATIONS
# ==========================================

def create_attendance_record(db: Session, attendance_data: dict) -> AttendanceRecord:
    """Record attendance (punch in/out)"""
    if 'id' not in attendance_data:
        attendance_data['id'] = str(uuid.uuid4())
    attendance = AttendanceRecord(**attendance_data)
    db.add(attendance)
    db.commit()
    db.refresh(attendance)
    return attendance


def get_user_attendance(db: Session, user_email: str, limit: int = 30) -> List[AttendanceRecord]:
    """Get user's attendance records"""
    return db.query(AttendanceRecord).filter(
        AttendanceRecord.user_email == user_email
    ).order_by(desc(AttendanceRecord.punch_in)).limit(limit).all()


# ==========================================
# CRM OPERATIONS
# ==========================================

def create_crm_ticket(db: Session, ticket_data: dict) -> CRMTicket:
    """Create CRM ticket"""
    if 'id' not in ticket_data:
        ticket_data['id'] = str(uuid.uuid4())
    ticket = CRMTicket(**ticket_data)
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    return ticket


def get_all_crm_tickets(db: Session, status: Optional[str] = None) -> List[CRMTicket]:
    """Get CRM tickets"""
    query = db.query(CRMTicket)
    if status:
        query = query.filter(CRMTicket.status == status)
    return query.order_by(desc(CRMTicket.created_at)).all()


def get_crm_ticket_by_id(db: Session, ticket_id: str) -> Optional[CRMTicket]:
    """Get specific CRM ticket by ID"""
    return db.query(CRMTicket).filter(CRMTicket.id == ticket_id).first()


def update_crm_ticket(db: Session, ticket_id: str, updates: dict) -> Optional[CRMTicket]:
    """Update CRM ticket"""
    ticket = get_crm_ticket_by_id(db, ticket_id)
    if ticket:
        for key, value in updates.items():
            if hasattr(ticket, key):
                setattr(ticket, key, value)
        db.commit()
        db.refresh(ticket)
    return ticket


def delete_crm_ticket(db: Session, ticket_id: str) -> bool:
    """Delete CRM ticket"""
    ticket = get_crm_ticket_by_id(db, ticket_id)
    if ticket:
        db.delete(ticket)
        db.commit()
        return True
    return False


def create_crm_task_assignment(db: Session, assignment_data: dict) -> CRMTaskAssignment:
    """Create CRM task assignment"""
    if 'id' not in assignment_data:
        assignment_data['id'] = str(uuid.uuid4())
    assignment = CRMTaskAssignment(**assignment_data)
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return assignment


def get_user_crm_tasks(db: Session, user_email: str) -> List[CRMTaskAssignment]:
    """Get all CRM tasks assigned to a user"""
    return db.query(CRMTaskAssignment).filter(
        CRMTaskAssignment.assigned_to == user_email
    ).order_by(desc(CRMTaskAssignment.created_at)).all()


def get_crm_task_by_id(db: Session, task_id: str) -> Optional[CRMTaskAssignment]:
    """Get specific CRM task assignment by ID"""
    return db.query(CRMTaskAssignment).filter(CRMTaskAssignment.id == task_id).first()


def update_crm_task(db: Session, task_id: str, updates: dict) -> Optional[CRMTaskAssignment]:
    """Update CRM task assignment"""
    task = get_crm_task_by_id(db, task_id)
    if task:
        for key, value in updates.items():
            if hasattr(task, key):
                setattr(task, key, value)
        db.commit()
        db.refresh(task)
    return task


# ==========================================
# AUDIT LOG OPERATIONS
# ==========================================

def create_audit_log(db: Session, log_data: dict) -> AuditLog:
    """Create audit log entry"""
    log = AuditLog(**log_data)
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def get_audit_logs(db: Session, user_email: Optional[str] = None,
                   action: Optional[str] = None, limit: int = 100) -> List[AuditLog]:
    """Get audit logs with filters"""
    query = db.query(AuditLog)
    if user_email:
        query = query.filter(AuditLog.user_email == user_email)
    if action:
        query = query.filter(AuditLog.action == action)
    return query.order_by(desc(AuditLog.timestamp)).limit(limit).all()


# ==========================================
# SCHEDULED EXAM OPERATIONS
# ==========================================

def create_scheduled_exam(db: Session, exam_data: dict) -> ScheduledExam:
    """Create scheduled exam"""
    if 'id' not in exam_data:
        exam_data['id'] = str(uuid.uuid4())
    exam = ScheduledExam(**exam_data)
    db.add(exam)
    db.commit()
    db.refresh(exam)
    return exam


def get_all_scheduled_exams(db: Session) -> List[ScheduledExam]:
    """Get all scheduled exams"""
    return db.query(ScheduledExam).order_by(desc(ScheduledExam.created_at)).all()


def get_scheduled_exam_by_id(db: Session, exam_id: str) -> Optional[ScheduledExam]:
    """Get specific scheduled exam by ID"""
    return db.query(ScheduledExam).filter(ScheduledExam.id == exam_id).first()


def get_user_scheduled_exams(db: Session, user_email: str) -> List[ScheduledExam]:
    """Get scheduled exams assigned to a specific user"""
    # Using JSON contains query for PostgreSQL
    from sqlalchemy import func
    return db.query(ScheduledExam).filter(
        func.json_contains(ScheduledExam.assigned_users, f'"{user_email}"')
    ).order_by(desc(ScheduledExam.created_at)).all()


def update_scheduled_exam(db: Session, exam_id: str, updates: dict) -> Optional[ScheduledExam]:
    """Update scheduled exam"""
    exam = get_scheduled_exam_by_id(db, exam_id)
    if exam:
        for key, value in updates.items():
            if hasattr(exam, key):
                setattr(exam, key, value)
        db.commit()
        db.refresh(exam)
    return exam


def delete_scheduled_exam(db: Session, exam_id: str) -> bool:
    """Delete scheduled exam"""
    exam = get_scheduled_exam_by_id(db, exam_id)
    if exam:
        db.delete(exam)
        db.commit()
        return True
    return False


def create_exam_attendance(db: Session, attendance_data: dict) -> ExamAttendance:
    """Create exam attendance record"""
    if 'id' not in attendance_data:
        attendance_data['id'] = str(uuid.uuid4())
    attendance = ExamAttendance(**attendance_data)
    db.add(attendance)
    db.commit()
    db.refresh(attendance)
    return attendance


def get_exam_attendance(db: Session, exam_id: str) -> List[ExamAttendance]:
    """Get all attendance records for an exam"""
    return db.query(ExamAttendance).filter(
        ExamAttendance.exam_id == exam_id
    ).all()


def get_user_exam_attendance(db: Session, exam_id: str, user_email: str) -> Optional[ExamAttendance]:
    """Get attendance record for specific user and exam"""
    return db.query(ExamAttendance).filter(
        and_(
            ExamAttendance.exam_id == exam_id,
            ExamAttendance.user_email == user_email
        )
    ).first()


def update_exam_attendance(db: Session, attendance_id: str, updates: dict) -> Optional[ExamAttendance]:
    """Update exam attendance record"""
    attendance = db.query(ExamAttendance).filter(
        ExamAttendance.id == attendance_id
    ).first()
    if attendance:
        for key, value in updates.items():
            if hasattr(attendance, key):
                setattr(attendance, key, value)
        db.commit()
        db.refresh(attendance)
    return attendance


# ==========================================
# RESOURCE OPERATIONS
# ==========================================

def create_resource(db: Session, resource_data: dict) -> Resource:
    """Create resource"""
    if 'id' not in resource_data:
        resource_data['id'] = str(uuid.uuid4())
    resource = Resource(**resource_data)
    db.add(resource)
    db.commit()
    db.refresh(resource)
    return resource


def get_all_resources(db: Session, category: Optional[str] = None) -> List[Resource]:
    """Get all resources with optional category filter"""
    query = db.query(Resource)
    if category:
        query = query.filter(Resource.category == category)
    return query.order_by(desc(Resource.created_at)).all()


def get_resource_by_id(db: Session, resource_id: str) -> Optional[Resource]:
    """Get specific resource by ID"""
    return db.query(Resource).filter(Resource.id == resource_id).first()


def update_resource(db: Session, resource_id: str, updates: dict) -> Optional[Resource]:
    """Update resource"""
    resource = get_resource_by_id(db, resource_id)
    if resource:
        for key, value in updates.items():
            if hasattr(resource, key):
                setattr(resource, key, value)
        db.commit()
        db.refresh(resource)
    return resource


def delete_resource(db: Session, resource_id: str) -> bool:
    """Delete resource"""
    resource = get_resource_by_id(db, resource_id)
    if resource:
        db.delete(resource)
        db.commit()
        return True
    return False


# ==========================================
# COURSE BUCKET OPERATIONS
# ==========================================

def create_course_bucket(db: Session, bucket_data: dict) -> CourseBucket:
    """Create a new course bucket"""
    bucket = CourseBucket(**bucket_data)
    db.add(bucket)
    db.commit()
    db.refresh(bucket)
    return bucket


def get_all_course_buckets(db: Session) -> List[CourseBucket]:
    """Get all course buckets"""
    return db.query(CourseBucket).all()


def get_course_bucket_by_id(db: Session, bucket_id: str) -> Optional[CourseBucket]:
    """Get course bucket by ID"""
    return db.query(CourseBucket).filter(CourseBucket.id == bucket_id).first()


def update_course_bucket(db: Session, bucket_id: str, updates: dict) -> Optional[CourseBucket]:
    """Update course bucket"""
    bucket = get_course_bucket_by_id(db, bucket_id)
    if bucket:
        for key, value in updates.items():
            if hasattr(bucket, key):
                setattr(bucket, key, value)
        db.commit()
        db.refresh(bucket)
    return bucket


def delete_course_bucket(db: Session, bucket_id: str) -> bool:
    """Delete course bucket"""
    bucket = get_course_bucket_by_id(db, bucket_id)
    if bucket:
        db.delete(bucket)
        db.commit()
        return True
    return False


# ==========================================
# PROCTORED ASSESSMENT EXTENDED OPERATIONS
# ==========================================

def update_assessment(db: Session, assessment_id: str, updates: dict) -> Optional[ProcturedAssessment]:
    """Update proctored assessment"""
    assessment = get_assessment_by_id(db, assessment_id)
    if assessment:
        for key, value in updates.items():
            if hasattr(assessment, key):
                setattr(assessment, key, value)
        db.commit()
        db.refresh(assessment)
    return assessment


def delete_assessment(db: Session, assessment_id: str) -> bool:
    """Delete proctored assessment"""
    assessment = get_assessment_by_id(db, assessment_id)
    if assessment:
        db.delete(assessment)
        db.commit()
        return True
    return False


# ==========================================
# LOCATION TRACKING OPERATIONS
# ==========================================

def update_location(db: Session, user_email: str, location_data: dict) -> LocationTracking:
    """Update or create location tracking record"""
    existing = db.query(LocationTracking).filter(
        LocationTracking.user_email == user_email
    ).first()

    if existing:
        for key, value in location_data.items():
            if hasattr(existing, key):
                setattr(existing, key, value)
        db.commit()
        db.refresh(existing)
        return existing
    else:
        if 'id' not in location_data:
            location_data['id'] = str(uuid.uuid4())
        location_data['user_email'] = user_email
        location = LocationTracking(**location_data)
        db.add(location)
        db.commit()
        db.refresh(location)
        return location


def get_all_locations(db: Session, active_only: bool = True) -> List[LocationTracking]:
    """Get all location tracking records"""
    query = db.query(LocationTracking)
    if active_only:
        query = query.filter(LocationTracking.active == True)
    return query.all()


def get_user_location(db: Session, user_email: str) -> Optional[LocationTracking]:
    """Get location for specific user"""
    return db.query(LocationTracking).filter(
        LocationTracking.user_email == user_email
    ).first()


# ==========================================
# UTILITY FUNCTIONS
# ==========================================

def get_db_session() -> Session:
    """Get a new database session"""
    return SessionLocal()


def dict_to_model(data: dict, model_class):
    """Convert dictionary to SQLAlchemy model instance"""
    return model_class(**data)


def model_to_dict(model_instance) -> dict:
    """Convert SQLAlchemy model instance to dictionary"""
    return {c.name: getattr(model_instance, c.name)
            for c in model_instance.__table__.columns}
