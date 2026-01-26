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
    UserInteraction, Resource, LocationTracking, AccessRule,
    Simulation, SimulationProgress, LiveQuiz
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


def get_news_post_by_id(db: Session, news_id: str) -> Optional[NewsFeed]:
    """Get a news post by ID"""
    return db.query(NewsFeed).filter(NewsFeed.id == news_id).first()


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
# SIMULATION OPERATIONS
# ==========================================

def create_simulation(db: Session, simulation_data: dict) -> Simulation:
    """Create a new simulation"""
    simulation = Simulation(**simulation_data)
    db.add(simulation)
    db.commit()
    db.refresh(simulation)
    return simulation


def get_simulation_by_id(db: Session, simulation_id: str) -> Optional[Simulation]:
    """Get simulation by ID"""
    return db.query(Simulation).filter(Simulation.id == simulation_id).first()


def get_all_simulations(db: Session, active_only: bool = True) -> List[Simulation]:
    """Get all simulations"""
    query = db.query(Simulation)
    if active_only:
        query = query.filter(Simulation.is_active == True)
    return query.order_by(desc(Simulation.created_at)).all()


def update_simulation(db: Session, simulation_id: str, updates: dict) -> Optional[Simulation]:
    """Update simulation"""
    simulation = get_simulation_by_id(db, simulation_id)
    if simulation:
        for key, value in updates.items():
            if hasattr(simulation, key):
                setattr(simulation, key, value)
        db.commit()
        db.refresh(simulation)
    return simulation


def delete_simulation(db: Session, simulation_id: str) -> bool:
    """Delete simulation"""
    simulation = get_simulation_by_id(db, simulation_id)
    if simulation:
        db.delete(simulation)
        db.commit()
        return True
    return False


def save_simulation_progress(db: Session, progress_data: dict) -> SimulationProgress:
    """Save or update simulation progress"""
    existing = db.query(SimulationProgress).filter(
        SimulationProgress.user_email == progress_data.get('user_email'),
        SimulationProgress.simulation_id == progress_data.get('simulation_id')
    ).first()

    if existing:
        for key, value in progress_data.items():
            if hasattr(existing, key):
                setattr(existing, key, value)
        db.commit()
        db.refresh(existing)
        return existing
    else:
        progress = SimulationProgress(**progress_data)
        db.add(progress)
        db.commit()
        db.refresh(progress)
        return progress


def get_simulation_progress(db: Session, user_email: str, simulation_id: str) -> Optional[SimulationProgress]:
    """Get simulation progress for user"""
    return db.query(SimulationProgress).filter(
        SimulationProgress.user_email == user_email,
        SimulationProgress.simulation_id == simulation_id
    ).first()


def get_user_simulation_progress(db: Session, user_email: str) -> List[SimulationProgress]:
    """Get all simulation progress for user"""
    return db.query(SimulationProgress).filter(
        SimulationProgress.user_email == user_email
    ).all()


# ==========================================
# LIVE QUIZ OPERATIONS
# ==========================================

def create_live_quiz(db: Session, quiz_data: dict) -> LiveQuiz:
    """Create a new live quiz"""
    quiz = LiveQuiz(**quiz_data)
    db.add(quiz)
    db.commit()
    db.refresh(quiz)
    return quiz


def get_live_quiz_by_id(db: Session, quiz_id: str) -> Optional[LiveQuiz]:
    """Get live quiz by ID"""
    return db.query(LiveQuiz).filter(LiveQuiz.id == quiz_id).first()


def get_all_live_quizzes(db: Session, active_only: bool = True) -> List[LiveQuiz]:
    """Get all live quizzes"""
    query = db.query(LiveQuiz)
    if active_only:
        query = query.filter(LiveQuiz.is_active == True)
    return query.order_by(desc(LiveQuiz.created_at)).all()


def update_live_quiz(db: Session, quiz_id: str, updates: dict) -> Optional[LiveQuiz]:
    """Update live quiz"""
    quiz = get_live_quiz_by_id(db, quiz_id)
    if quiz:
        for key, value in updates.items():
            if hasattr(quiz, key):
                setattr(quiz, key, value)
        db.commit()
        db.refresh(quiz)
    return quiz


def delete_live_quiz(db: Session, quiz_id: str) -> bool:
    """Delete live quiz"""
    quiz = get_live_quiz_by_id(db, quiz_id)
    if quiz:
        db.delete(quiz)
        db.commit()
        return True
    return False


# ==========================================
# NEWS FEED DELETE OPERATION
# ==========================================

def delete_news_post(db: Session, news_id: str) -> bool:
    """Delete news post"""
    news = db.query(NewsFeed).filter(NewsFeed.id == news_id).first()
    if news:
        db.delete(news)
        db.commit()
        return True
    return False


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


# ==========================================
# OPTIMIZED QUERY FUNCTIONS FOR PERFORMANCE
# ==========================================

def get_user_course_completions(db: Session, user_email: str) -> List[CourseCompletion]:
    """Get all completions for a specific user - uses index."""
    return db.query(CourseCompletion).filter(
        CourseCompletion.user_email == user_email
    ).order_by(desc(CourseCompletion.completed_at)).all()


def get_user_completion_count(db: Session, user_email: str) -> int:
    """Get count of completions for a user - optimized count query."""
    from sqlalchemy import func
    return db.query(func.count(CourseCompletion.id)).filter(
        CourseCompletion.user_email == user_email
    ).scalar() or 0


def get_user_completed_course_ids(db: Session, user_email: str) -> set:
    """Get set of completed course IDs for a user - fast lookup."""
    results = db.query(CourseCompletion.course_id).filter(
        CourseCompletion.user_email == user_email
    ).all()
    return {r[0] for r in results}


def get_completions_by_date_range(db: Session, start_date, end_date) -> List[CourseCompletion]:
    """Get completions within a date range - uses index."""
    return db.query(CourseCompletion).filter(
        and_(
            CourseCompletion.completed_at >= start_date,
            CourseCompletion.completed_at <= end_date
        )
    ).all()


def get_completion_count_by_date(db: Session, date) -> int:
    """Get count of completions on a specific date - optimized."""
    from sqlalchemy import func
    return db.query(func.count(CourseCompletion.id)).filter(
        func.date(CourseCompletion.completed_at) == date
    ).scalar() or 0


def get_content_by_learning_path(db: Session, learning_path_type: str, is_path_node: bool = True) -> List[Content]:
    """Get content filtered by learning path type - uses composite index."""
    return db.query(Content).filter(
        and_(
            Content.learning_path_type == learning_path_type,
            Content.is_path_node == is_path_node
        )
    ).order_by(Content.timestamp).all()


def get_content_by_bucket(db: Session, bucket: str) -> List[Content]:
    """Get content filtered by bucket - uses index."""
    return db.query(Content).filter(Content.bucket == bucket).all()


def get_quiz_submissions_by_user(db: Session, user_email: str) -> List[QuizSubmission]:
    """Get quiz submissions for a user - uses index."""
    return db.query(QuizSubmission).filter(
        QuizSubmission.user_email == user_email
    ).order_by(desc(QuizSubmission.submitted_at)).all()


def get_quiz_submissions_by_quiz(db: Session, quiz_id: str) -> List[QuizSubmission]:
    """Get submissions for a specific quiz - uses index."""
    return db.query(QuizSubmission).filter(
        QuizSubmission.quiz_id == quiz_id
    ).all()


def get_user_quiz_average_score(db: Session, user_email: str) -> float:
    """Get average quiz score for a user - optimized aggregation."""
    from sqlalchemy import func
    result = db.query(func.avg(QuizSubmission.score)).filter(
        QuizSubmission.user_email == user_email
    ).scalar()
    return float(result) if result else 0.0


def get_assessment_submissions_by_user(db: Session, user_email: str) -> List[AssessmentSubmission]:
    """Get assessment submissions for a user - uses index."""
    return db.query(AssessmentSubmission).filter(
        AssessmentSubmission.user_email == user_email
    ).order_by(desc(AssessmentSubmission.submitted_at)).all()


def get_passed_assessment_count(db: Session, user_email: Optional[str] = None) -> int:
    """Get count of passed assessments - optimized count."""
    from sqlalchemy import func
    query = db.query(func.count(AssessmentSubmission.id)).filter(
        AssessmentSubmission.passed == True
    )
    if user_email:
        query = query.filter(AssessmentSubmission.user_email == user_email)
    return query.scalar() or 0


def get_users_by_store(db: Session, store: str) -> List[User]:
    """Get users filtered by store - uses index."""
    return db.query(User).filter(User.store == store).all()


def get_user_count_by_store(db: Session) -> Dict[str, int]:
    """Get count of users grouped by store - optimized aggregation."""
    from sqlalchemy import func
    results = db.query(
        User.store,
        func.count(User.id)
    ).filter(
        User.is_superadmin == False
    ).group_by(User.store).all()
    return {store: count for store, count in results}


def get_access_rule_by_level(db: Session, level_name: str) -> Optional[AccessRule]:
    """Get access rule for a specific level - uses index."""
    return db.query(AccessRule).filter(AccessRule.level_name == level_name).first()


def get_all_access_rules(db: Session) -> Dict[str, Dict[str, Any]]:
    """Get all access rules as a dictionary keyed by level name."""
    rules = db.query(AccessRule).all()
    return {
        rule.level_name: {
            "accessible_courses": rule.accessible_courses or [],
            "accessible_buckets": rule.accessible_buckets or [],
            "max_courses_visible": rule.max_courses_visible
        }
        for rule in rules
    }


def get_user_node_progress_all(db: Session, user_email: str) -> Dict[str, Dict[str, Any]]:
    """Get all node progress for a user as a dictionary."""
    progress_list = db.query(UserNodeProgress).filter(
        UserNodeProgress.user_email == user_email
    ).all()

    return {
        p.node_id: {
            "completed": p.completed,
            "progress_percent": p.progress_percent,
            "last_position": p.last_position,
            "updated_at": p.updated_at.isoformat() if p.updated_at else None
        }
        for p in progress_list
    }


def get_user_completed_node_ids(db: Session, user_email: str) -> set:
    """Get set of completed node IDs for a user."""
    results = db.query(UserNodeProgress.node_id).filter(
        UserNodeProgress.user_email == user_email,
        UserNodeProgress.completed == True
    ).all()
    return {r[0] for r in results}


def get_self_learning_status(db: Session, user_email: str) -> Dict[str, Any]:
    """Get user's self-learning completion status - optimized."""
    from sqlalchemy import func

    # Get user
    user = db.query(User).filter(User.email == user_email).first()
    self_learning_completed = user.self_learning_completed if user else False

    # Get self-learning courses count
    total_self_learning = db.query(func.count(Content.id)).filter(
        Content.is_path_node == True,
        Content.learning_path_type == "self_learning"
    ).scalar() or 0

    # Get user's completed self-learning course IDs
    self_learning_course_ids = db.query(Content.id).filter(
        Content.is_path_node == True,
        Content.learning_path_type == "self_learning"
    ).all()
    self_learning_ids = {c[0] for c in self_learning_course_ids}

    # Get user's completed courses that are in self-learning
    user_completed_ids = get_user_completed_course_ids(db, user_email)
    completed_self_learning = len(self_learning_ids.intersection(user_completed_ids))

    # Also check node progress
    completed_node_ids = get_user_completed_node_ids(db, user_email)
    completed_self_learning = max(
        completed_self_learning,
        len(self_learning_ids.intersection(completed_node_ids))
    )

    progress_percent = (completed_self_learning / total_self_learning * 100) if total_self_learning > 0 else 100

    return {
        "user_email": user_email,
        "self_learning_completed": self_learning_completed,
        "self_learning_progress": round(progress_percent, 1),
        "completed_courses": completed_self_learning,
        "total_courses": total_self_learning,
        "career_path_unlocked": self_learning_completed or progress_percent >= 100
    }


def get_learning_path_content(db: Session, path_type: str, user_email: str) -> Dict[str, Any]:
    """Get courses for a specific learning path type with user progress - optimized."""
    from sqlalchemy import func

    # Get user
    user = db.query(User).filter(User.email == user_email).first()
    self_learning_completed = user.self_learning_completed if user else False
    user_role = user.role if user else "Waffler"

    # Get courses for path type
    if path_type == "self_learning":
        courses = db.query(Content).filter(
            Content.is_path_node == True,
            Content.learning_path_type == "self_learning"
        ).order_by(Content.timestamp).all()
    else:
        # Career progression - fetch ALL courses (frontend builds hierarchy using access rules)
        # DO NOT filter here - frontend needs all courses to organize by level
        courses = db.query(Content).filter(
            or_(
                Content.learning_path_type == "career_progression",
                Content.learning_path_type == None,
                Content.learning_path_type == ""
            )
        ).order_by(Content.timestamp).all()

    # Get user's completed course IDs
    user_completed_ids = get_user_completed_course_ids(db, user_email)
    completed_node_ids = get_user_completed_node_ids(db, user_email)
    all_completed = user_completed_ids.union(completed_node_ids)

    # Build response with status
    response_nodes = []
    found_active = False

    for course in courses:
        node_resp = {
            "id": course.id,
            "title": course.title,
            "description": course.description,
            "bucket": course.bucket,
            "video_url": course.video_url,
            "audio_url": getattr(course, 'audio_url', None),
            "thumbnail_url": course.thumbnail,
            "learning_path_type": course.learning_path_type,
            "is_path_node": course.is_path_node,
            "timestamp": course.timestamp.isoformat() if course.timestamp else None
        }

        if course.id in all_completed:
            node_resp["status"] = "completed"
        elif not found_active:
            node_resp["status"] = "active"
            found_active = True
        else:
            node_resp["status"] = "locked"

        response_nodes.append(node_resp)

    # Calculate path completion
    completed_count = sum(1 for n in response_nodes if n.get("status") == "completed")
    total_count = len(response_nodes)

    return {
        "path_type": path_type,
        "courses": response_nodes,
        "total_courses": total_count,
        "completed_courses": completed_count,
        "progress_percent": round((completed_count / total_count * 100) if total_count > 0 else 0, 1),
        "is_locked": path_type == "career_progression" and not self_learning_completed,
        "lock_message": "Complete Self-Learning to unlock Career Progression" if (path_type == "career_progression" and not self_learning_completed) else None
    }


def get_user_level_progress(db: Session, user_email: str) -> Dict[str, Any]:
    """Get user's progress towards next level - optimized."""
    from sqlalchemy import func

    # Define Hierarchy
    HIERARCHY = ['Waffler', 'Silver Waffler', 'Gold Waffler', 'Shift Manager', 'Assistant Store Manager']

    # Get user
    user = db.query(User).filter(User.email == user_email).first()
    if not user:
        # Create user record if doesn't exist
        return {
            "current_level": "Waffler",
            "next_level": "Silver Waffler",
            "nodes_completed_in_level": 0,
            "nodes_required_in_level": 0,
            "completed_nodes": 0,
            "nodes_remaining": 0,
            "progress_percent": 0
        }

    current_role = user.role or "Waffler"

    # Get access rules for current role
    access_rule = db.query(AccessRule).filter(AccessRule.level_name == current_role).first()
    required_course_ids = access_rule.accessible_courses if access_rule and access_rule.accessible_courses else []

    # Get user's completed course IDs
    user_completed_ids = get_user_completed_course_ids(db, user_email)

    # Count how many required courses are done
    completed_count = sum(1 for cid in required_course_ids if cid in user_completed_ids)
    total_required = len(required_course_ids)

    # Determine next level
    next_level = None
    if current_role in HIERARCHY:
        idx = HIERARCHY.index(current_role)
        if idx < len(HIERARCHY) - 1:
            next_level = HIERARCHY[idx + 1]

    # Total global completed nodes
    total_completed_nodes = len(user_completed_ids)

    return {
        "current_level": current_role,
        "next_level": next_level,
        "nodes_completed_in_level": completed_count,
        "nodes_required_in_level": total_required,
        "completed_nodes": total_completed_nodes,
        "nodes_remaining": max(0, total_required - completed_count),
        "progress_percent": int((completed_count / total_required * 100)) if total_required > 0 else 100
    }


def get_distinct_stores(db: Session) -> List[str]:
    """Get list of distinct stores - optimized."""
    results = db.query(User.store).filter(
        User.is_superadmin == False
    ).distinct().all()
    return [r[0] for r in results if r[0]]


def get_active_user_count(db: Session) -> int:
    """Get count of non-admin users - optimized count."""
    from sqlalchemy import func
    return db.query(func.count(User.id)).filter(
        User.is_superadmin == False
    ).scalar() or 0


def get_crm_tickets_filtered(db: Session, status: Optional[str] = None,
                              assigned_to: Optional[str] = None,
                              unassigned_only: bool = False) -> List[CRMTicket]:
    """Get CRM tickets with filters - uses composite index."""
    query = db.query(CRMTicket)
    if status:
        query = query.filter(CRMTicket.status == status)
    if assigned_to:
        query = query.filter(CRMTicket.assigned_to == assigned_to)
    if unassigned_only:
        query = query.filter(CRMTicket.assigned_to == None)
    return query.order_by(desc(CRMTicket.created_at)).all()


def get_user_attendance_records(db: Session, user_email: str, limit: int = 30) -> List[AttendanceRecord]:
    """Get attendance records for a user - uses index."""
    return db.query(AttendanceRecord).filter(
        AttendanceRecord.user_email == user_email
    ).order_by(desc(AttendanceRecord.punch_in)).limit(limit).all()


def get_active_locations(db: Session) -> List[LocationTracking]:
    """Get all active location tracking records - uses index."""
    return db.query(LocationTracking).filter(
        LocationTracking.active == True
    ).all()


# ==========================================
# DASHBOARD ANALYTICS - OPTIMIZED QUERIES
# ==========================================

def get_dashboard_stats(db: Session) -> Dict[str, Any]:
    """Get all dashboard statistics in optimized queries."""
    from sqlalchemy import func

    stats = {}

    # User stats
    stats['total_users'] = db.query(func.count(User.id)).filter(
        User.is_superadmin == False
    ).scalar() or 0

    stats['total_stores'] = db.query(func.count(func.distinct(User.store))).filter(
        User.is_superadmin == False
    ).scalar() or 0

    # Completion stats
    stats['total_completions'] = db.query(func.count(CourseCompletion.id)).scalar() or 0

    # Quiz stats
    stats['total_quiz_submissions'] = db.query(func.count(QuizSubmission.id)).scalar() or 0
    avg_score = db.query(func.avg(QuizSubmission.score)).scalar()
    stats['avg_quiz_score'] = round(float(avg_score), 1) if avg_score else 0

    # Assessment stats
    stats['total_assessments'] = db.query(func.count(AssessmentSubmission.id)).scalar() or 0
    stats['passed_assessments'] = db.query(func.count(AssessmentSubmission.id)).filter(
        AssessmentSubmission.passed == True
    ).scalar() or 0

    # Content stats
    stats['total_courses'] = db.query(func.count(Content.id)).scalar() or 0

    return stats


def get_completion_trend(db: Session, days: int = 30) -> List[Dict[str, Any]]:
    """Get completion trend for the last N days - optimized."""
    from sqlalchemy import func
    from datetime import datetime, timedelta

    end_date = datetime.now().date()
    start_date = end_date - timedelta(days=days)

    results = db.query(
        func.date(CourseCompletion.completed_at).label('date'),
        func.count(CourseCompletion.id).label('count')
    ).filter(
        func.date(CourseCompletion.completed_at) >= start_date
    ).group_by(
        func.date(CourseCompletion.completed_at)
    ).order_by('date').all()

    return [{'date': str(r.date), 'count': r.count} for r in results]


def get_store_analytics(db: Session) -> List[Dict[str, Any]]:
    """Get analytics grouped by store - single optimized query."""
    from sqlalchemy import func

    # Get user counts per store
    user_counts = db.query(
        User.store,
        func.count(User.id).label('user_count')
    ).filter(
        User.is_superadmin == False
    ).group_by(User.store).all()

    store_data = {}
    for store, count in user_counts:
        if store:
            store_data[store] = {
                'store': store,
                'user_count': count,
                'completion_count': 0,
                'avg_quiz_score': 0
            }

    # Get completion counts per store via user join
    completion_counts = db.query(
        User.store,
        func.count(CourseCompletion.id).label('completion_count')
    ).join(
        CourseCompletion, CourseCompletion.user_email == User.email
    ).filter(
        User.is_superadmin == False
    ).group_by(User.store).all()

    for store, count in completion_counts:
        if store and store in store_data:
            store_data[store]['completion_count'] = count

    return list(store_data.values())


def get_store_performance_data(db: Session) -> List[Dict[str, Any]]:
    """Get comprehensive store performance for analytics endpoint - optimized."""
    from sqlalchemy import func

    # Get total courses count
    total_courses = db.query(func.count(Content.id)).scalar() or 0

    # Get user counts per store with emails
    store_users = db.query(
        User.store,
        func.count(User.id).label('user_count'),
        func.array_agg(User.email).label('user_emails')
    ).filter(
        User.is_superadmin == False,
        User.store != None,
        User.store != ''
    ).group_by(User.store).all()

    stores_list = []

    for store_row in store_users:
        store_name = store_row.store
        user_count = store_row.user_count

        # Get completion count for this store's users
        completion_count = db.query(func.count(CourseCompletion.id)).join(
            User, CourseCompletion.user_email == User.email
        ).filter(
            User.store == store_name,
            User.is_superadmin == False
        ).scalar() or 0

        # Get average quiz score for this store's users
        avg_score = db.query(func.avg(QuizSubmission.score)).join(
            User, QuizSubmission.user_email == User.email
        ).filter(
            User.store == store_name,
            User.is_superadmin == False
        ).scalar()

        avg_quiz_score = round(float(avg_score), 1) if avg_score else 0

        # Calculate completion percentage
        total_expected = user_count * total_courses
        completion_percent = round((completion_count / total_expected * 100) if total_expected > 0 else 0, 1)

        # Risk calculation
        if completion_percent < 30 or avg_quiz_score < 50:
            risk_level = "red"
        elif completion_percent < 60 or avg_quiz_score < 70:
            risk_level = "yellow"
        else:
            risk_level = "green"

        stores_list.append({
            "store_id": store_name,
            "store_name": store_name,
            "completion_percent": completion_percent,
            "avg_quiz_score": avg_quiz_score,
            "hygiene_score": 100,
            "risk_level": risk_level,
            "employee_count": user_count,
            "total_courses": total_courses,
            "completed_courses": completion_count
        })

    return stores_list


def get_store_detail(db: Session, store_name: str) -> Dict[str, Any]:
    """Get detailed analytics for a specific store - optimized."""
    from sqlalchemy import func

    total_courses = db.query(func.count(Content.id)).scalar() or 0

    # Get employees in this store with their stats
    employees = db.query(User).filter(
        User.store == store_name,
        User.is_superadmin == False
    ).all()

    employee_list = []
    for emp in employees:
        # Get completion count for this employee
        completion_count = db.query(func.count(CourseCompletion.id)).filter(
            CourseCompletion.user_email == emp.email
        ).scalar() or 0

        # Get quiz stats
        quiz_stats = db.query(
            func.count(QuizSubmission.id),
            func.avg(QuizSubmission.score)
        ).filter(
            QuizSubmission.user_email == emp.email
        ).first()

        quiz_count = quiz_stats[0] or 0 if quiz_stats else 0
        avg_score = round(float(quiz_stats[1]), 1) if quiz_stats and quiz_stats[1] else 0

        completion_pct = (completion_count / total_courses * 100) if total_courses > 0 else 0

        employee_list.append({
            "email": emp.email,
            "name": emp.name,
            "role": emp.role,
            "completion_percent": round(completion_pct, 1),
            "avg_score": avg_score,
            "quiz_count": quiz_count,
            "completion_count": completion_count
        })

    # Calculate store-level metrics
    if employee_list:
        total_completion = sum(e["completion_percent"] for e in employee_list) / len(employee_list)
        avg_store_score = sum(e["avg_score"] for e in employee_list) / len(employee_list)
    else:
        total_completion = 0
        avg_store_score = 0

    return {
        "store_name": store_name,
        "total_completion": round(total_completion, 1),
        "avg_score": round(avg_store_score, 1),
        "employee_count": len(employee_list),
        "employees": employee_list
    }


def get_user_analytics(db: Session, user_email: str) -> Dict[str, Any]:
    """Get comprehensive analytics for a single user - optimized."""
    from sqlalchemy import func

    analytics = {
        'completion_count': 0,
        'quiz_count': 0,
        'avg_quiz_score': 0,
        'assessment_count': 0,
        'passed_assessments': 0,
        'completed_course_ids': []
    }

    # Completion count
    analytics['completion_count'] = db.query(func.count(CourseCompletion.id)).filter(
        CourseCompletion.user_email == user_email
    ).scalar() or 0

    # Completed course IDs
    course_ids = db.query(CourseCompletion.course_id).filter(
        CourseCompletion.user_email == user_email
    ).all()
    analytics['completed_course_ids'] = [c[0] for c in course_ids]

    # Quiz stats
    quiz_stats = db.query(
        func.count(QuizSubmission.id),
        func.avg(QuizSubmission.score)
    ).filter(
        QuizSubmission.user_email == user_email
    ).first()

    if quiz_stats:
        analytics['quiz_count'] = quiz_stats[0] or 0
        analytics['avg_quiz_score'] = round(float(quiz_stats[1]), 1) if quiz_stats[1] else 0

    # Assessment stats
    assessment_stats = db.query(
        func.count(AssessmentSubmission.id),
        func.count(AssessmentSubmission.id).filter(AssessmentSubmission.passed == True)
    ).filter(
        AssessmentSubmission.user_email == user_email
    ).first()

    if assessment_stats:
        analytics['assessment_count'] = assessment_stats[0] or 0
        analytics['passed_assessments'] = assessment_stats[1] or 0

    return analytics


# ==========================================
# PAGINATION HELPERS
# ==========================================

def paginate_query(query, page: int = 1, per_page: int = 50):
    """Apply pagination to a query."""
    offset = (page - 1) * per_page
    return query.offset(offset).limit(per_page)


def get_users_paginated(db: Session, page: int = 1, per_page: int = 50,
                        search: str = None, store: str = None,
                        role: str = None) -> Dict[str, Any]:
    """Get users with pagination and filters - optimized."""
    from sqlalchemy import func

    query = db.query(User).filter(User.is_superadmin == False)

    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                User.email.ilike(search_term),
                User.name.ilike(search_term)
            )
        )

    if store:
        query = query.filter(User.store == store)

    if role:
        query = query.filter(User.role == role)

    # Get total count
    total = query.count()

    # Get paginated results
    users = query.order_by(User.name).offset((page - 1) * per_page).limit(per_page).all()

    return {
        'users': users,
        'total': total,
        'page': page,
        'per_page': per_page,
        'total_pages': (total + per_page - 1) // per_page
    }


def get_content_paginated(db: Session, page: int = 1, per_page: int = 50,
                          bucket: str = None, learning_path_type: str = None) -> Dict[str, Any]:
    """Get content with pagination and filters - optimized."""
    query = db.query(Content)

    if bucket:
        query = query.filter(Content.bucket == bucket)

    if learning_path_type:
        query = query.filter(Content.learning_path_type == learning_path_type)

    total = query.count()
    content = query.order_by(desc(Content.created_at)).offset((page - 1) * per_page).limit(per_page).all()

    return {
        'content': content,
        'total': total,
        'page': page,
        'per_page': per_page,
        'total_pages': (total + per_page - 1) // per_page
    }


# ==========================================
# ACCESS RULE OPERATIONS
# ==========================================

def get_access_rule_by_level(db: Session, level_name: str) -> Optional[AccessRule]:
    """Get access rule for a specific level"""
    return db.query(AccessRule).filter(AccessRule.level_name == level_name).first()

def create_or_update_access_rule(db: Session, level_name: str, courses: list, buckets: list, max_visible: int) -> AccessRule:
    """Create or update access rule"""
    rule = get_access_rule_by_level(db, level_name)
    if not rule:
        rule = AccessRule(level_name=level_name)
        db.add(rule)
    
    rule.accessible_courses = courses
    rule.accessible_buckets = buckets
    rule.max_courses_visible = max_visible
    rule.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(rule)
    return rule
