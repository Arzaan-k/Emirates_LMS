"""
Assessment Repository
Data access layer for assessment-related operations
"""

from typing import Any, Dict, List, Optional
from datetime import datetime
from sqlalchemy import func, and_, case

from sqlalchemy.orm import Session

from app.repositories.base import BaseRepository
from app.models.assessment import (
    ProcturedAssessment,
    AssessmentSubmission,
    ScheduledExam,
    ExamAttendance
)


class AssessmentRepository(BaseRepository[ProcturedAssessment]):
    """Repository for ProcturedAssessment operations."""

    def __init__(self, db: Session):
        super().__init__(db, ProcturedAssessment)

    def get_active_assessments(self) -> List[ProcturedAssessment]:
        """Get all active assessments."""
        return self.db.query(ProcturedAssessment).filter(
            ProcturedAssessment.active == True
        ).order_by(ProcturedAssessment.created_at.desc()).all()

    def get_all_assessments(self, active_only: bool = True) -> List[ProcturedAssessment]:
        """Get all assessments with optional active filter."""
        query = self.db.query(ProcturedAssessment)
        if active_only:
            query = query.filter(ProcturedAssessment.active == True)
        return query.order_by(ProcturedAssessment.created_at.desc()).all()

    def deactivate(self, assessment_id: str) -> Optional[ProcturedAssessment]:
        """Deactivate an assessment."""
        assessment = self.get_by_id(assessment_id)
        if assessment:
            assessment.active = False
            self.db.commit()
            self.db.refresh(assessment)
        return assessment


class AssessmentSubmissionRepository(BaseRepository[AssessmentSubmission]):
    """Repository for AssessmentSubmission operations."""

    def __init__(self, db: Session):
        super().__init__(db, AssessmentSubmission)

    def get_by_assessment(self, assessment_id: str) -> List[AssessmentSubmission]:
        """Get all submissions for an assessment."""
        return self.db.query(AssessmentSubmission).filter(
            AssessmentSubmission.assessment_id == assessment_id
        ).order_by(AssessmentSubmission.submitted_at.desc()).all()

    def get_by_user(self, user_email: str) -> List[AssessmentSubmission]:
        """Get all submissions by a user."""
        return self.db.query(AssessmentSubmission).filter(
            AssessmentSubmission.user_email == user_email
        ).order_by(AssessmentSubmission.submitted_at.desc()).all()

    def get_by_user_and_assessment(
        self,
        user_email: str,
        assessment_id: str
    ) -> List[AssessmentSubmission]:
        """Get submissions by user for specific assessment."""
        return self.db.query(AssessmentSubmission).filter(
            AssessmentSubmission.user_email == user_email,
            AssessmentSubmission.assessment_id == assessment_id
        ).order_by(AssessmentSubmission.submitted_at.desc()).all()

    def get_user_attempt_count(self, user_email: str, assessment_id: str) -> int:
        """Get number of attempts by user for assessment."""
        return self.db.query(func.count(AssessmentSubmission.id)).filter(
            AssessmentSubmission.user_email == user_email,
            AssessmentSubmission.assessment_id == assessment_id
        ).scalar() or 0

    def get_passed_count(self, assessment_id: Optional[str] = None) -> int:
        """Get count of passed submissions."""
        query = self.db.query(func.count(AssessmentSubmission.id)).filter(
            AssessmentSubmission.passed == True
        )
        if assessment_id:
            query = query.filter(AssessmentSubmission.assessment_id == assessment_id)
        return query.scalar() or 0

    def get_average_score(self, assessment_id: Optional[str] = None) -> float:
        """Get average score for submissions."""
        query = self.db.query(func.avg(AssessmentSubmission.score_percent))
        if assessment_id:
            query = query.filter(AssessmentSubmission.assessment_id == assessment_id)
        result = query.scalar()
        return float(result) if result else 0.0


class ScheduledExamRepository(BaseRepository[ScheduledExam]):
    """Repository for ScheduledExam operations."""

    def __init__(self, db: Session):
        super().__init__(db, ScheduledExam)

    def get_by_supervisor(self, supervisor_email: str) -> List[ScheduledExam]:
        """Get exams by supervisor."""
        return self.db.query(ScheduledExam).filter(
            ScheduledExam.supervisor_email == supervisor_email
        ).order_by(ScheduledExam.created_at.desc()).all()

    def get_by_status(self, status: str) -> List[ScheduledExam]:
        """Get exams by status."""
        return self.db.query(ScheduledExam).filter(
            ScheduledExam.status == status
        ).order_by(ScheduledExam.exam_date, ScheduledExam.exam_time).all()

    def get_upcoming_exams(self) -> List[ScheduledExam]:
        """Get upcoming scheduled exams."""
        today = datetime.now().strftime("%Y-%m-%d")
        return self.db.query(ScheduledExam).filter(
            ScheduledExam.exam_date >= today,
            ScheduledExam.status == "scheduled"
        ).order_by(ScheduledExam.exam_date, ScheduledExam.exam_time).all()

    def get_user_assigned_exams(self, user_email: str) -> List[ScheduledExam]:
        """Get exams assigned to a specific user."""
        def extract_email(entry: Any) -> str:
            if isinstance(entry, str):
                return entry.strip().lower()
            if isinstance(entry, dict):
                return str(
                    entry.get("email")
                    or entry.get("user_email")
                    or entry.get("userEmail")
                    or ""
                ).strip().lower()
            return ""

        target = (user_email or "").strip().lower()
        if not target:
            return []

        from sqlalchemy import cast, String
        # Pre-filter at the DB level to dramatically reduce loaded rows
        exams = self.db.query(ScheduledExam).filter(
            cast(ScheduledExam.assigned_users, String).ilike(f"%{target}%")
        ).all()
        
        matched: List[ScheduledExam] = []
        for exam in exams:
            assigned = exam.assigned_users or []
            normalized_assigned = [extract_email(v) for v in assigned]
            if target in normalized_assigned:
                matched.append(exam)
        return matched

    def update_status(self, exam_id: str, status: str) -> Optional[ScheduledExam]:
        """Update exam status."""
        exam = self.get_by_id(exam_id)
        if exam:
            exam.status = status
            exam.updated_at = datetime.utcnow()
            self.db.commit()
            self.db.refresh(exam)
        return exam


class ExamAttendanceRepository(BaseRepository[ExamAttendance]):
    """Repository for ExamAttendance operations."""

    def __init__(self, db: Session):
        super().__init__(db, ExamAttendance)

    def get_by_exam(self, exam_id: str) -> List[ExamAttendance]:
        """Get all attendance records for an exam."""
        return self.db.query(ExamAttendance).filter(
            ExamAttendance.exam_id == exam_id
        ).all()

    def get_by_exam_and_user(self, exam_id: str, user_email: str) -> Optional[ExamAttendance]:
        """Get attendance record for specific user and exam."""
        return self.db.query(ExamAttendance).filter(
            ExamAttendance.exam_id == exam_id,
            ExamAttendance.user_email == user_email
        ).first()

    def mark_present(
        self,
        exam_id: str,
        user_email: str,
        user_name: str,
        marked_by: str
    ) -> ExamAttendance:
        """Mark user as present for exam."""
        attendance = self.get_by_exam_and_user(exam_id, user_email)

        if attendance:
            attendance.marked_present = True
            attendance.marked_by = marked_by
            attendance.marked_at = datetime.utcnow()
            self.db.commit()
            self.db.refresh(attendance)
            return attendance
        else:
            import uuid
            return self.create({
                "id": str(uuid.uuid4()),
                "exam_id": exam_id,
                "user_email": user_email,
                "user_name": user_name,
                "marked_present": True,
                "marked_by": marked_by,
                "marked_at": datetime.utcnow(),
            })

    def mark_absent(
        self,
        exam_id: str,
        user_email: str,
        marked_by: str
    ) -> Optional[ExamAttendance]:
        """Mark user as absent for exam."""
        attendance = self.get_by_exam_and_user(exam_id, user_email)

        if attendance:
            attendance.marked_present = False
            attendance.marked_by = marked_by
            attendance.marked_at = datetime.utcnow()
            self.db.commit()
            self.db.refresh(attendance)
        return attendance

    def start_exam(self, exam_id: str, user_email: str) -> Optional[ExamAttendance]:
        """Mark that user started the exam."""
        attendance = self.get_by_exam_and_user(exam_id, user_email)
        if attendance:
            attendance.started_exam = True
            attendance.start_time = datetime.utcnow()
            self.db.commit()
            self.db.refresh(attendance)
        return attendance

    def complete_exam(
        self,
        exam_id: str,
        user_email: str,
        submission_id: str,
        score: float,
        passed: bool
    ) -> Optional[ExamAttendance]:
        """Mark exam as completed with results."""
        attendance = self.get_by_exam_and_user(exam_id, user_email)
        if attendance:
            attendance.completed = True
            attendance.completion_time = datetime.utcnow()
            attendance.submission_id = submission_id
            attendance.score = score
            attendance.passed = passed
            self.db.commit()
            self.db.refresh(attendance)
        return attendance

    def get_completed_count(self, exam_id: str) -> int:
        """Get count of users who completed an exam."""
        return self.db.query(func.count(ExamAttendance.id)).filter(
            ExamAttendance.exam_id == exam_id,
            ExamAttendance.completed == True
        ).scalar() or 0

    def get_aggregated_stats(self, exam_id: str) -> Dict[str, Any]:
        """Get all exam stats in a single DB query."""
        stats = self.db.query(
            func.count(ExamAttendance.id).label('total'),
            func.sum(case((ExamAttendance.marked_present == True, 1), else_=0)).label('present'),
            func.sum(case((and_(ExamAttendance.marked_present == False, ExamAttendance.marked_by != None), 1), else_=0)).label('absent'),
            func.sum(case((ExamAttendance.completed == True, 1), else_=0)).label('completed'),
            func.sum(case((and_(ExamAttendance.completed == True, ExamAttendance.passed == True), 1), else_=0)).label('passed'),
            func.avg(case((ExamAttendance.completed == True, ExamAttendance.score), else_=None)).label('avg_score')
        ).filter(ExamAttendance.exam_id == exam_id).first()

        if not stats:
            return {
                "total": 0, "present": 0, "absent": 0, 
                "completed": 0, "passed": 0, "avg_score": 0
            }

        return {
            "total": stats.total or 0,
            "present": stats.present or 0,
            "absent": stats.absent or 0,
            "completed": stats.completed or 0,
            "passed": stats.passed or 0,
            "avg_score": float(stats.avg_score or 0)
        }

    def get_all_aggregated_stats(self, exam_ids: List[str]) -> Dict[str, Dict[str, Any]]:
        """Get aggregated stats for multiple exams in a single DB query."""
        if not exam_ids:
            return {}

        stats_list = self.db.query(
            ExamAttendance.exam_id,
            func.count(ExamAttendance.id).label('total'),
            func.sum(case((ExamAttendance.marked_present == True, 1), else_=0)).label('present'),
            func.sum(case((and_(ExamAttendance.marked_present == False, ExamAttendance.marked_by != None), 1), else_=0)).label('absent'),
            func.sum(case((ExamAttendance.completed == True, 1), else_=0)).label('completed'),
            func.sum(case((and_(ExamAttendance.completed == True, ExamAttendance.passed == True), 1), else_=0)).label('passed'),
            func.avg(case((ExamAttendance.completed == True, ExamAttendance.score), else_=None)).label('avg_score')
        ).filter(ExamAttendance.exam_id.in_(exam_ids)).group_by(ExamAttendance.exam_id).all()

        results = {}
        for stats in stats_list:
            results[stats.exam_id] = {
                "total": stats.total or 0,
                "present": stats.present or 0,
                "absent": stats.absent or 0,
                "completed": stats.completed or 0,
                "passed": stats.passed or 0,
                "avg_score": float(stats.avg_score or 0)
            }
        return results

    def get_completed_count(self, exam_id: str) -> int:
        """Get count of users who completed the exam."""
        return self.db.query(func.count(ExamAttendance.id)).filter(
            ExamAttendance.exam_id == exam_id,
            ExamAttendance.completed == True
        ).scalar() or 0
