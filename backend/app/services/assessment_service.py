"""
Assessment Service
Business logic for proctored assessments and scheduled exams
"""

import uuid
import logging
from typing import Any, Dict, List, Optional
from datetime import datetime

from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError, ValidationError, BusinessLogicError
from app.repositories.assessment_repository import (
    AssessmentRepository,
    AssessmentSubmissionRepository,
    ScheduledExamRepository,
    ExamAttendanceRepository,
)
from app.repositories.user_repository import UserRepository  # Added import
from app.models.assessment import (
    ProcturedAssessment,
    AssessmentSubmission,
    ScheduledExam,
    ExamAttendance,
)

logger = logging.getLogger(__name__)


class AssessmentService:
    """Service for assessment operations."""

    def __init__(self, db: Session):
        self.db = db
        self.assessment_repo = AssessmentRepository(db)
        self.submission_repo = AssessmentSubmissionRepository(db)
        self.exam_repo = ScheduledExamRepository(db)
        self.attendance_repo = ExamAttendanceRepository(db)
        self.user_repo = UserRepository(db)  # Added user repo

    # ===========================================
    # PROCTORED ASSESSMENTS
    # ===========================================
    


    def get_exam_attendance(self, exam_id: str) -> List[ExamAttendance]:
        """Get all attendance records for an exam, ensuring all assigned users are included."""
        # Sync assigned users with attendance table
        exam = self.get_scheduled_exam_by_id(exam_id)
        assigned_users = exam.assigned_users or []
        
        existing_attendance = self.attendance_repo.get_by_exam(exam_id)
        existing_emails = {a.user_email for a in existing_attendance}
        
        # 1. Update existing "Unknown" names
        for rec in existing_attendance:
            if rec.user_name == "Unknown":
                user_obj = self.user_repo.get_by_email(rec.user_email)
                if user_obj and user_obj.name:
                    rec.user_name = user_obj.name
                    # Save the update
                    self.db.add(rec)
        
        # 2. Add new records
        new_records = []
        for user in assigned_users:
            # Handle both string emails and object format from frontend
            email = user.get('email') if isinstance(user, dict) else str(user)
            name = user.get('name') if isinstance(user, dict) else "Unknown"
            
            # If name is still unknown, try to look up
            if name == "Unknown":
                user_obj = self.user_repo.get_by_email(email)
                if user_obj and user_obj.name:
                    name = user_obj.name

            if email not in existing_emails:
                # Create default attendance record
                record_data = {
                    "id": str(uuid.uuid4()),
                    "exam_id": exam_id,
                    "user_email": email,
                    "user_name": name,
                    "marked_present": False,
                    "started_exam": False,
                    "completed": False,
                    "passed": False
                }
                new_record = self.attendance_repo.create(record_data)
                new_records.append(new_record)
        
        # Commit any name updates or new records
        if new_records or any(rec.user_name != "Unknown" for rec in existing_attendance):
             self.db.commit()

        # Always return fresh list
        return self.attendance_repo.get_by_exam(exam_id)

    # ===========================================
    # PROCTORED ASSESSMENTS
    # ===========================================

    def create_assessment(self, assessment_data: Dict[str, Any]) -> ProcturedAssessment:
        """Create a new proctored assessment."""
        if not assessment_data.get("id"):
            assessment_data["id"] = str(uuid.uuid4())

        # Calculate total questions
        questions = assessment_data.get("questions", [])
        assessment_data["total_questions"] = len(questions)

        # Set defaults
        assessment_data.setdefault("time_limit_minutes", 30)
        assessment_data.setdefault("passing_score", 70)
        assessment_data.setdefault("active", True)

        assessment = self.assessment_repo.create(assessment_data)
        logger.info(f"Created assessment: {assessment.id}")

        return assessment

    def get_assessment_by_id(self, assessment_id: str) -> ProcturedAssessment:
        """Get assessment by ID."""
        assessment = self.assessment_repo.get_by_id(assessment_id)
        if not assessment:
            raise NotFoundError(resource="Assessment", resource_id=assessment_id)
        return assessment

    def update_assessment(
        self,
        assessment_id: str,
        updates: Dict[str, Any]
    ) -> ProcturedAssessment:
        """Update an assessment."""
        assessment = self.get_assessment_by_id(assessment_id)

        # Recalculate total questions if questions updated
        if "questions" in updates:
            updates["total_questions"] = len(updates["questions"])

        for key, value in updates.items():
            if hasattr(assessment, key) and value is not None:
                setattr(assessment, key, value)

        assessment.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(assessment)

        return assessment

    def delete_assessment(self, assessment_id: str) -> bool:
        """Delete or deactivate an assessment."""
        assessment = self.get_assessment_by_id(assessment_id)

        # Check if there are submissions - if so, just deactivate
        submissions = self.submission_repo.get_by_assessment(assessment_id)
        if submissions:
            assessment.active = False
            self.db.commit()
            logger.info(f"Deactivated assessment: {assessment_id}")
        else:
            self.db.delete(assessment)
            self.db.commit()
            logger.info(f"Deleted assessment: {assessment_id}")

        return True

    def get_all_assessments(self, active_only: bool = True) -> List[ProcturedAssessment]:
        """Get all assessments."""
        return self.assessment_repo.get_all_assessments(active_only=active_only)

    def get_active_assessments(self) -> List[ProcturedAssessment]:
        """Get all active assessments."""
        return self.get_all_assessments(active_only=True)

    # ===========================================
    # ASSESSMENT SUBMISSION
    # ===========================================

    def submit_assessment(
        self,
        assessment_id: str,
        user_email: str,
        user_name: str,
        answers: List[int],
        time_taken_seconds: int,
        breach_log: List[Dict] = None
    ) -> AssessmentSubmission:
        """Submit an assessment and calculate score."""
        # Validate user exists (FK constraint on assessment_submissions.user_email)
        user = self.user_repo.get_by_email(user_email)
        if not user:
            raise BusinessLogicError(
                detail="User not found. Please login again or ensure the user exists before submitting.",
                error_code="USER_NOT_FOUND",
                data={"user_email": user_email},
            )

        assessment = self.get_assessment_by_id(assessment_id)

        # Check if assessment is active
        if not assessment.active:
            raise BusinessLogicError(
                detail="This assessment is no longer active",
                error_code="ASSESSMENT_INACTIVE"
            )

        # Check attempt limits
        attempt_count = self.submission_repo.get_user_attempt_count(user_email, assessment_id)
        if assessment.max_attempts and attempt_count >= assessment.max_attempts:
            raise BusinessLogicError(
                detail=f"Maximum attempts ({assessment.max_attempts}) reached",
                error_code="MAX_ATTEMPTS_REACHED"
            )

        # Calculate score
        questions = assessment.questions or []
        correct_count = 0
        total_questions = len(questions)

        for i, question in enumerate(questions):
            if i < len(answers):
                if answers[i] == question.get("correctIndex"):
                    correct_count += 1

        score_percent = (correct_count / total_questions * 100) if total_questions > 0 else 0
        passed = score_percent >= assessment.passing_score

        # Process breach log
        violations = 0
        critical_breaches = 0
        warning_breaches = 0
        integrity_score = 100.0

        if breach_log:
            for breach in breach_log:
                violations += 1
                if breach.get("severity") == "critical":
                    critical_breaches += 1
                    integrity_score -= 15
                else:
                    warning_breaches += 1
                    integrity_score -= 5

        integrity_score = max(0, integrity_score)

        # Determine integrity status
        if critical_breaches > 0 or integrity_score < 50:
            integrity_status = "flagged"
        elif warning_breaches > 0 or integrity_score < 80:
            integrity_status = "warning"
        else:
            integrity_status = "clean"

        submission_data = {
            "id": str(uuid.uuid4()),
            "assessment_id": assessment_id,
            "assessment_title": assessment.title,
            "user_email": user_email,
            "user_name": user_name,
            "answers": answers,
            "correct_count": correct_count,
            "total_questions": total_questions,
            "score_percent": round(score_percent, 1),
            "passed": passed,
            "time_taken_seconds": time_taken_seconds,
            "time_limit_seconds": assessment.time_limit_minutes * 60,
            "violations": violations,
            "breach_log": breach_log or [],
            "critical_breaches": critical_breaches,
            "warning_breaches": warning_breaches,
            "integrity_status": integrity_status,
            "integrity_score": integrity_score,
            "submitted_at": datetime.utcnow(),
            "attempt_number": attempt_count + 1,
        }

        submission = self.submission_repo.create(submission_data)
        logger.info(
            f"Assessment submitted: {user_email} - {assessment_id} "
            f"Score: {score_percent}% Passed: {passed}"
        )

        return submission

    def get_assessment_submissions(
        self,
        assessment_id: str
    ) -> List[AssessmentSubmission]:
        """Get all submissions for an assessment."""
        return self.submission_repo.get_by_assessment(assessment_id)

    def get_user_submissions(self, user_email: str) -> List[AssessmentSubmission]:
        """Get all submissions by a user."""
        return self.submission_repo.get_by_user(user_email)

    def get_assessment_stats(self, assessment_id: str) -> Dict[str, Any]:
        """Get statistics for an assessment."""
        submissions = self.submission_repo.get_by_assessment(assessment_id)
        total = len(submissions)
        passed = sum(1 for s in submissions if s.passed)
        avg_score = self.submission_repo.get_average_score(assessment_id)

        return {
            "total_submissions": total,
            "passed_count": passed,
            "failed_count": total - passed,
            "pass_rate": round((passed / total * 100) if total > 0 else 0, 1),
            "average_score": round(avg_score, 1),
        }

    # ===========================================
    # SCHEDULED EXAMS
    # ===========================================

    def create_scheduled_exam(self, exam_data: Dict[str, Any]) -> ScheduledExam:
        """Create a scheduled exam."""
        if not exam_data.get("id"):
            exam_data["id"] = str(uuid.uuid4())

        exam_data.setdefault("status", "scheduled")
        exam_data.setdefault("time_limit_minutes", 30)
        exam_data.setdefault("passing_score", 70)

        exam = self.exam_repo.create(exam_data)
        logger.info(f"Created scheduled exam: {exam.id}")

        return exam

    def get_scheduled_exam_by_id(self, exam_id: str) -> ScheduledExam:
        """Get scheduled exam by ID."""
        exam = self.exam_repo.get_by_id(exam_id)
        if not exam:
            raise NotFoundError(resource="ScheduledExam", resource_id=exam_id)
        return exam

    def update_scheduled_exam(
        self,
        exam_id: str,
        updates: Dict[str, Any]
    ) -> ScheduledExam:
        """Update a scheduled exam."""
        exam = self.get_scheduled_exam_by_id(exam_id)

        for key, value in updates.items():
            if hasattr(exam, key) and value is not None:
                setattr(exam, key, value)

        exam.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(exam)

        return exam

    def delete_scheduled_exam(self, exam_id: str) -> bool:
        """Delete a scheduled exam."""
        exam = self.get_scheduled_exam_by_id(exam_id)
        self.db.delete(exam)
        self.db.commit()
        return True

    def get_all_scheduled_exams(self) -> List[ScheduledExam]:
        """Get all scheduled exams."""
        return self.exam_repo.get_all(order_by="created_at")

    def get_user_assigned_exams(self, user_email: str) -> List[ScheduledExam]:
        """Get exams assigned to a user."""
        return self.exam_repo.get_user_assigned_exams(user_email)

    def get_scheduled_exams_for_user(self, user_email: str) -> List[ScheduledExam]:
        """Get scheduled exams for a user (alias for get_user_assigned_exams)."""
        return self.exam_repo.get_user_assigned_exams(user_email)

    def get_exams_by_supervisor(self, supervisor_email: str) -> List[ScheduledExam]:
        """Get exams supervised by a user."""
        return self.exam_repo.get_by_supervisor(supervisor_email)

    # ===========================================
    # EXAM ATTENDANCE
    # ===========================================

    def mark_attendance(
        self,
        exam_id: str,
        user_email: str,
        user_name: str,
        marked_by: str
    ) -> ExamAttendance:
        """Mark a user as present for an exam."""
        # Verify exam exists
        self.get_scheduled_exam_by_id(exam_id)

        attendance = self.attendance_repo.mark_present(
            exam_id, user_email, user_name, marked_by
        )
        logger.info(f"Marked present: {user_email} for exam {exam_id}")

        return attendance

    def mark_user_present(
        self,
        exam_id: str,
        user_email: str,
        marked_by: str
    ) -> ExamAttendance:
        """Mark a user as present (alias for mark_attendance with auto-name resolution)."""
        # Try to find existing record to get name
        existing = self.attendance_repo.get_by_exam_and_user(exam_id, user_email)
        user_name = existing.user_name if existing else "Unknown"
        
        # If unknown and we have access to user repo, we could fetch it. 
        # But for now, if record exists, name is there.
        
        return self.mark_attendance(exam_id, user_email, user_name, marked_by)

    def mark_user_absent(
        self,
        exam_id: str,
        user_email: str,
        marked_by: str
    ) -> Optional[ExamAttendance]:
        """Mark a user as absent."""
        self.get_scheduled_exam_by_id(exam_id)
        attendance = self.attendance_repo.mark_absent(exam_id, user_email, marked_by)
        logger.info(f"Marked absent: {user_email} for exam {exam_id}")
        return attendance

    def start_exam_for_user(self, exam_id: str, user_email: str) -> ExamAttendance:
        """Mark that a user has started the exam."""
        # Verify user is marked present
        attendance = self.attendance_repo.get_by_exam_and_user(exam_id, user_email)
        if not attendance or not attendance.marked_present:
            raise BusinessLogicError(
                detail="User must be marked present before starting exam",
                error_code="NOT_MARKED_PRESENT"
            )

        attendance = self.attendance_repo.start_exam(exam_id, user_email)
        logger.info(f"Exam started: {user_email} for exam {exam_id}")

        return attendance

    def submit_scheduled_exam(
        self,
        exam_id: str,
        user_email: str,
        user_name: str,
        answers: List[int],
        time_taken_seconds: int
    ) -> Dict[str, Any]:
        """Submit a scheduled exam."""
        exam = self.get_scheduled_exam_by_id(exam_id)

        # Calculate score
        questions = exam.questions or []
        correct_count = 0
        total_questions = len(questions)

        for i, question in enumerate(questions):
            if i < len(answers):
                if answers[i] == question.get("correctIndex"):
                    correct_count += 1

        score_percent = (correct_count / total_questions * 100) if total_questions > 0 else 0
        passed = score_percent >= exam.passing_score

        # Create submission ID
        submission_id = str(uuid.uuid4())

        # Update attendance record
        self.attendance_repo.complete_exam(
            exam_id, user_email, submission_id, score_percent, passed
        )

        logger.info(
            f"Exam submitted: {user_email} - {exam_id} "
            f"Score: {score_percent}% Passed: {passed}"
        )

        return {
            "submission_id": submission_id,
            "exam_id": exam_id,
            "user_email": user_email,
            "correct_count": correct_count,
            "total_questions": total_questions,
            "score_percent": round(score_percent, 1),
            "passed": passed,
            "time_taken_seconds": time_taken_seconds,
        }



    def get_exam_stats(self, exam_id: str) -> Dict[str, Any]:
        """Get statistics for a scheduled exam using DB aggregation."""
        # Ensure sync happens once (lazy check)
        # self.get_exam_attendance(exam_id) # OPTIONAL: Un-comment if sync ensures accurate 'total'
        # But for pure speed, we assume sync happened at some point or we just report what's in DB.
        # User wants "Faster". Syncing is slow (loop).
        # We will skip Sync for just "getting stats". Sync happens on "View".
        
        exam = self.get_scheduled_exam_by_id(exam_id)
        
        # Get aggregated stats in one query
        agg = self.attendance_repo.get_aggregated_stats(exam_id)
        
        # Use total from exam assignment if available, else from attendance count
        total_assigned = len(exam.assigned_users or [])
        # If attendance records exist, use that total. (agg['total'])
        # But agg['total'] might be 0 if not synced.
        # So total_assigned is safer from exam object.
        
        present = agg['present']
        completed = agg['completed']
        passed = agg['passed']
        absent = agg['absent']
        avg_score = agg['avg_score']
        
        return {
            "total_assigned": total_assigned,
            "present_count": present,
            "marked_present": present,
            "marked_absent": absent,
            "completed_count": completed,
            "completed": completed,
            "passed_count": passed,
            "failed_count": completed - passed,
            "attendance_rate": round((present / total_assigned * 100) if total_assigned > 0 else 0, 1),
            "completion_rate": round((completed / present * 100) if present > 0 else 0, 1),
            "pass_rate": round((passed / completed * 100) if completed > 0 else 0, 1),
            "average_score": round(avg_score, 1),
            "avg_score": round(avg_score, 1),
        }

    def get_exam_report(self, exam_id: str) -> Dict[str, Any]:
        """Generate full report for an exam."""
        exam = self.get_scheduled_exam_by_id(exam_id)
        
        # Get synced attendance list for the attendees table
        attendance_list = self.get_exam_attendance(exam_id)
        
        # Get stats via DB aggregation (User requested "Database Only")
        stats = self.get_exam_stats(exam_id)
        
        # Helper to safely format date
        def safe_iso(val):
            if hasattr(val, 'isoformat'):
                return val.isoformat()
            return val

        # Format exam data
        exam_data = {
            "id": exam.id,
            "title": exam.title,
            "status": exam.status,
            "exam_date": safe_iso(exam.exam_date),
            "exam_time": exam.exam_time,
            "location": exam.location,
            "supervisor_name": exam.supervisor_name,
            "passing_score": exam.passing_score
        }
        
        # Serialize attendance
        attendance_data = [
            {
                "user_name": a.user_name,
                "user_email": a.user_email,
                "marked_present": a.marked_present,
                "completed": a.completed,
                "score": a.score,
                "passed": a.passed,
                "completion_time": safe_iso(a.completion_time)
            }
            for a in attendance_list
        ]
        
        return {
            "exam": exam_data,
            "statistics": stats,
            "attendees": attendance_data
        }
