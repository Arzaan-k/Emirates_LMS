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

    def get_exam_attendance(self, exam_id: str) -> List[ExamAttendance]:
        """Get all attendance records for an exam."""
        return self.attendance_repo.get_by_exam(exam_id)

    def get_exam_stats(self, exam_id: str) -> Dict[str, Any]:
        """Get statistics for a scheduled exam."""
        exam = self.get_scheduled_exam_by_id(exam_id)
        attendance = self.attendance_repo.get_by_exam(exam_id)

        total_assigned = len(exam.assigned_users or [])
        present_count = self.attendance_repo.get_present_count(exam_id)
        completed_count = self.attendance_repo.get_completed_count(exam_id)

        # Calculate pass rate among completed
        passed = sum(1 for a in attendance if a.completed and a.passed)
        avg_score = sum(a.score or 0 for a in attendance if a.completed)
        if completed_count > 0:
            avg_score = avg_score / completed_count

        return {
            "total_assigned": total_assigned,
            "present_count": present_count,
            "completed_count": completed_count,
            "passed_count": passed,
            "failed_count": completed_count - passed,
            "attendance_rate": round((present_count / total_assigned * 100) if total_assigned > 0 else 0, 1),
            "completion_rate": round((completed_count / present_count * 100) if present_count > 0 else 0, 1),
            "pass_rate": round((passed / completed_count * 100) if completed_count > 0 else 0, 1),
            "average_score": round(avg_score, 1),
        }
