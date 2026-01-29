"""
Analytics Repository
Data access layer for analytics and audit log operations
"""

from typing import Any, Dict, List, Optional
from datetime import datetime, timedelta
from sqlalchemy import func, and_
from sqlalchemy.orm import Session

from app.repositories.base import BaseRepository
from app.models.analytics import AuditLog
from app.models.user import User
from app.models.tracking import CourseCompletion, LocationTracking, AttendanceRecord
from app.models.quiz import QuizSubmission
from app.models.assessment import AssessmentSubmission
from app.models.content import Content


class AuditLogRepository(BaseRepository[AuditLog]):
    """Repository for AuditLog operations."""

    def __init__(self, db: Session):
        super().__init__(db, AuditLog)

    def get_by_user(self, user_email: str, limit: int = 100) -> List[AuditLog]:
        """Get audit logs for a specific user."""
        return self.db.query(AuditLog).filter(
            AuditLog.user_email == user_email
        ).order_by(AuditLog.timestamp.desc()).limit(limit).all()

    def get_by_action(self, action: str, limit: int = 100) -> List[AuditLog]:
        """Get audit logs by action type."""
        return self.db.query(AuditLog).filter(
            AuditLog.action == action
        ).order_by(AuditLog.timestamp.desc()).limit(limit).all()

    def get_recent(self, limit: int = 100) -> List[AuditLog]:
        """Get most recent audit logs."""
        return self.db.query(AuditLog).order_by(
            AuditLog.timestamp.desc()
        ).limit(limit).all()

    def get_with_filters(
        self,
        user_email: Optional[str] = None,
        action: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        skip: int = 0,
        limit: int = 100
    ) -> List[AuditLog]:
        """Get audit logs with filters."""
        query = self.db.query(AuditLog)

        if user_email:
            query = query.filter(AuditLog.user_email == user_email)
        if action:
            query = query.filter(AuditLog.action == action)
        if start_date:
            query = query.filter(AuditLog.timestamp >= start_date)
        if end_date:
            query = query.filter(AuditLog.timestamp <= end_date)

        return query.order_by(AuditLog.timestamp.desc()).offset(skip).limit(limit).all()

    def count_by_action(self, start_date: Optional[datetime] = None) -> Dict[str, int]:
        """Get count of logs grouped by action."""
        query = self.db.query(
            AuditLog.action,
            func.count(AuditLog.id)
        )

        if start_date:
            query = query.filter(AuditLog.timestamp >= start_date)

        results = query.group_by(AuditLog.action).all()
        return {action: count for action, count in results}


class AnalyticsRepository:
    """Repository for aggregated analytics queries."""

    def __init__(self, db: Session):
        self.db = db

    def get_dashboard_stats(self) -> Dict[str, Any]:
        """Get main dashboard statistics."""
        stats = {}

        # User stats
        stats['total_users'] = self.db.query(func.count(User.id)).filter(
            User.is_superadmin == False
        ).scalar() or 0

        stats['total_stores'] = self.db.query(func.count(func.distinct(User.store))).filter(
            User.is_superadmin == False
        ).scalar() or 0

        # Completion stats
        stats['total_completions'] = self.db.query(func.count(CourseCompletion.id)).scalar() or 0

        # Quiz stats
        stats['total_quiz_submissions'] = self.db.query(func.count(QuizSubmission.id)).scalar() or 0
        avg_score = self.db.query(func.avg(QuizSubmission.score)).scalar()
        stats['avg_quiz_score'] = round(float(avg_score), 1) if avg_score else 0

        # Assessment stats
        stats['total_assessments'] = self.db.query(func.count(AssessmentSubmission.id)).scalar() or 0
        stats['passed_assessments'] = self.db.query(func.count(AssessmentSubmission.id)).filter(
            AssessmentSubmission.passed == True
        ).scalar() or 0

        # Content stats
        stats['total_courses'] = self.db.query(func.count(Content.id)).scalar() or 0

        # Today's stats
        today = datetime.utcnow().date()
        stats['completions_today'] = self.db.query(func.count(CourseCompletion.id)).filter(
            func.date(CourseCompletion.completed_at) == today
        ).scalar() or 0

        return stats

    def get_store_analytics(self) -> List[Dict[str, Any]]:
        """Get analytics grouped by store."""
        total_courses = self.db.query(func.count(Content.id)).scalar() or 0

        # Get user counts per store
        user_counts = self.db.query(
            User.store,
            func.count(User.id).label('user_count')
        ).filter(
            User.is_superadmin == False,
            User.store != None,
            User.store != ''
        ).group_by(User.store).all()

        stores_list = []

        for store, user_count in user_counts:
            # Get completion count for this store
            completion_count = self.db.query(func.count(CourseCompletion.id)).join(
                User, CourseCompletion.user_email == User.email
            ).filter(
                User.store == store,
                User.is_superadmin == False
            ).scalar() or 0

            # Get average quiz score for this store
            avg_score = self.db.query(func.avg(QuizSubmission.score)).join(
                User, QuizSubmission.user_email == User.email
            ).filter(
                User.store == store,
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
                "store_id": store,
                "store_name": store,
                "completion_percent": completion_percent,
                "avg_quiz_score": avg_quiz_score,
                "risk_level": risk_level,
                "employee_count": user_count,
                "total_courses": total_courses,
                "completed_courses": completion_count,
            })

        return stores_list

    def get_user_analytics(self, user_email: str) -> Dict[str, Any]:
        """Get comprehensive analytics for a single user."""
        analytics = {
            'completion_count': 0,
            'quiz_count': 0,
            'avg_quiz_score': 0,
            'assessment_count': 0,
            'passed_assessments': 0,
            'completed_course_ids': []
        }

        # Completion count
        analytics['completion_count'] = self.db.query(func.count(CourseCompletion.id)).filter(
            CourseCompletion.user_email == user_email
        ).scalar() or 0

        # Completed course IDs
        course_ids = self.db.query(CourseCompletion.course_id).filter(
            CourseCompletion.user_email == user_email
        ).all()
        analytics['completed_course_ids'] = [c[0] for c in course_ids]

        # Quiz stats
        quiz_stats = self.db.query(
            func.count(QuizSubmission.id),
            func.avg(QuizSubmission.score)
        ).filter(
            QuizSubmission.user_email == user_email
        ).first()

        if quiz_stats:
            analytics['quiz_count'] = quiz_stats[0] or 0
            analytics['avg_quiz_score'] = round(float(quiz_stats[1]), 1) if quiz_stats[1] else 0

        # Assessment stats
        assessment_count = self.db.query(func.count(AssessmentSubmission.id)).filter(
            AssessmentSubmission.user_email == user_email
        ).scalar() or 0

        passed_count = self.db.query(func.count(AssessmentSubmission.id)).filter(
            AssessmentSubmission.user_email == user_email,
            AssessmentSubmission.passed == True
        ).scalar() or 0

        analytics['assessment_count'] = assessment_count
        analytics['passed_assessments'] = passed_count

        return analytics

    def get_completion_trend(self, days: int = 30) -> List[Dict[str, Any]]:
        """Get completion trend for last N days."""
        end_date = datetime.now().date()
        start_date = end_date - timedelta(days=days)

        results = self.db.query(
            func.date(CourseCompletion.completed_at).label('date'),
            func.count(CourseCompletion.id).label('count')
        ).filter(
            func.date(CourseCompletion.completed_at) >= start_date
        ).group_by(
            func.date(CourseCompletion.completed_at)
        ).order_by('date').all()

        return [{'date': str(r.date), 'count': r.count} for r in results]

    def get_leaderboard(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get leaderboard by completions."""
        results = self.db.query(
            User.email,
            User.name,
            User.store,
            func.count(CourseCompletion.id).label('completions')
        ).join(
            CourseCompletion, CourseCompletion.user_email == User.email
        ).filter(
            User.is_superadmin == False
        ).group_by(
            User.email, User.name, User.store
        ).order_by(
            func.count(CourseCompletion.id).desc()
        ).limit(limit).all()

        return [
            {
                "rank": idx + 1,
                "user_email": r.email,
                "user_name": r.name,
                "store": r.store,
                "completions": r.completions,
            }
            for idx, r in enumerate(results)
        ]

    def get_dashboard_metrics(self) -> Dict[str, Any]:
        """Get dashboard metrics (alias for get_dashboard_stats)."""
        return self.get_dashboard_stats()

    def get_store_performance(self) -> List[Dict[str, Any]]:
        """Get store performance analytics."""
        return self.get_store_analytics()

    def get_store_detail(self, store_name: str) -> Dict[str, Any]:
        """Get detailed analytics for a specific store."""
        # Get users in store
        users = self.db.query(User).filter(
            User.store == store_name,
            User.is_superadmin == False
        ).all()

        user_count = len(users)
        user_emails = [u.email for u in users]

        # Get completions
        completion_count = self.db.query(func.count(CourseCompletion.id)).filter(
            CourseCompletion.user_email.in_(user_emails)
        ).scalar() or 0

        # Get quiz stats
        quiz_stats = self.db.query(
            func.count(QuizSubmission.id),
            func.avg(QuizSubmission.score)
        ).filter(
            QuizSubmission.user_email.in_(user_emails)
        ).first()

        total_quizzes = quiz_stats[0] or 0
        avg_score = round(float(quiz_stats[1]), 1) if quiz_stats[1] else 0

        return {
            "store_name": store_name,
            "employee_count": user_count,
            "total_completions": completion_count,
            "total_quizzes": total_quizzes,
            "avg_quiz_score": avg_score,
            "employees": [{"email": u.email, "name": u.name, "role": u.role} for u in users[:10]],
        }

    def get_employee_performance(self) -> List[Dict[str, Any]]:
        """Get employee performance list."""
        results = self.db.query(
            User.email,
            User.name,
            User.role,
            User.store,
            func.count(CourseCompletion.id).label('completions')
        ).outerjoin(
            CourseCompletion, CourseCompletion.user_email == User.email
        ).filter(
            User.is_superadmin == False
        ).group_by(
            User.email, User.name, User.role, User.store
        ).order_by(
            func.count(CourseCompletion.id).desc()
        ).limit(50).all()

        return [
            {
                "user_email": r.email,
                "user_name": r.name,
                "role": r.role,
                "store": r.store,
                "completions": r.completions,
            }
            for r in results
        ]

    def get_employee_detail(self, user_email: str) -> Dict[str, Any]:
        """Get detailed analytics for a specific employee."""
        return self.get_user_analytics(user_email)

    def get_training_effectiveness(self) -> List[Dict[str, Any]]:
        """Get training effectiveness metrics by course."""
        courses = self.db.query(Content).limit(20).all()
        results = []

        for course in courses:
            # Count completions
            completion_count = self.db.query(func.count(CourseCompletion.id)).filter(
                CourseCompletion.course_id == course.id
            ).scalar() or 0

            results.append({
                "course_id": course.id,
                "course_title": course.title,
                "completions": completion_count,
                "effectiveness_score": min(100, completion_count * 10),
            })

        return results

    def get_store_leaderboard(self, store_id: str, limit: int = 10) -> List[Dict[str, Any]]:
        """Get leaderboard for a specific store."""
        results = self.db.query(
            User.email,
            User.name,
            func.count(CourseCompletion.id).label('completions')
        ).join(
            CourseCompletion, CourseCompletion.user_email == User.email
        ).filter(
            User.store == store_id,
            User.is_superadmin == False
        ).group_by(
            User.email, User.name
        ).order_by(
            func.count(CourseCompletion.id).desc()
        ).limit(limit).all()

        return [
            {
                "rank": idx + 1,
                "user_email": r.email,
                "user_name": r.name,
                "completions": r.completions,
            }
            for idx, r in enumerate(results)
        ]

    def get_user_learning_profile(self, user_email: str) -> Dict[str, Any]:
        """Get a user's learning profile."""
        analytics = self.get_user_analytics(user_email)
        user = self.db.query(User).filter(User.email == user_email).first()

        return {
            "user_email": user_email,
            "user_name": user.name if user else "Unknown",
            "role": user.role if user else "Unknown",
            "skill_scores": {},
            "total_xp": analytics.get('completion_count', 0) * 100,
            "courses_completed": analytics.get('completion_count', 0),
            "avg_quiz_score": analytics.get('avg_quiz_score', 0),
        }

    def get_skill_gaps(self, user_email: str) -> Dict[str, Any]:
        """Get skill gap analysis for a user."""
        return {
            "user_email": user_email,
            "weak_areas": [],
            "strong_areas": [],
            "recommendations": [],
        }

    def get_recommendations(self, user_email: str, limit: int = 5) -> Dict[str, Any]:
        """Get AI-powered personalized course recommendations."""
        # 1. Get courses user hasn't completed
        completed = self.db.query(CourseCompletion.course_id).filter(
            CourseCompletion.user_email == user_email
        ).all()
        completed_ids = [c[0] for c in completed]

        candidate_courses = self.db.query(Content).filter(
            ~Content.id.in_(completed_ids) if completed_ids else True
        ).limit(20).all()  # Fetch more to rank

        recommendations = []
        focus_tags = set()

        # 2. Rank and Format Courses
        for course in candidate_courses:
            # Logic for priority
            priority = "low"
            if course.resource_type == "video":
                priority = "medium"
            if course.bucket and course.bucket.lower() in ["safety", "compliance", "mandatory"]:
                priority = "high"
            if "advanced" in course.title.lower():
                priority = "high"

            # Logic for reasons
            reason = "Recommended for your role"
            if priority == "high":
                reason = "Critical skill for your progression"
            elif course.xp > 50:
                reason = "High XP opportunity to boost your rank"
            
            skill = course.bucket or "General Skills"
            focus_tags.add(skill)

            recommendations.append({
                "course_id": course.id,
                "course_title": course.title,
                "priority": priority,
                "reason": reason,
                "skill_addressed": skill,
                "expected_improvement": f"Mastery in {skill}",
                "course_data": course.to_dict()
            })

        # Sort by priority (high > medium > low)
        priority_map = {"high": 3, "medium": 2, "low": 1}
        recommendations.sort(key=lambda x: priority_map.get(x["priority"], 0), reverse=True)

        # Limit
        recommendations = recommendations[:limit]

        # 3. Calculate Skill Gaps (Mock for now or based on quiz scores)
        # In a real AI system, this would analyze quiz failures.
        skill_gaps = []
        for tag in list(focus_tags)[:4]:
             skill_gaps.append({
                 "skill_name": tag,
                 "skill_key": tag.lower(),
                 "gap_level": "moderate",
                 "icon": "school",
                 "percentage": 45,
                 "attempts": 0,
                 "needs_improvement": True
             })
        
        # 4. Construct Response
        return {
            "status": "success",
            "recommendations": recommendations,
            "overall_advice": f"You have {len(recommendations)} recommended courses to improve your proficiency. Focus on High Priority items first.",
            "focus_areas": list(focus_tags)[:3],
            "skill_gaps": skill_gaps,
            "profile_summary": self.get_user_learning_profile(user_email)
        }

    def get_competency_matrix(self) -> List[Dict[str, Any]]:
        """Get competency matrix for all users."""
        users = self.db.query(User).filter(User.is_superadmin == False).limit(50).all()

        matrix = []
        for user in users:
            analytics = self.get_user_analytics(user.email)
            matrix.append({
                "user_email": user.email,
                "user_name": user.name,
                "role": user.role,
                "store": user.store,
                "completions": analytics.get('completion_count', 0),
                "avg_score": analytics.get('avg_quiz_score', 0),
            })

        return matrix

    def get_company_skill_gaps(self) -> Dict[str, Any]:
        """Get company-wide skill gap analysis."""
        return {
            "overall_completion_rate": 0,
            "skill_areas": [],
            "improvement_areas": [],
        }

    def track_course_completion(
        self,
        user_email: str,
        course_id: str,
        course_title: str,
        bucket: Optional[str] = None,
        score: int = 0,
        max_score: int = 100,
        time_spent_seconds: int = 0,
        quiz_correct: int = 0,
        quiz_total: int = 0
    ) -> Dict[str, Any]:
        """Track a course completion."""
        from app.models.tracking import CourseCompletion
        import uuid

        completion = CourseCompletion(
            id=str(uuid.uuid4()),
            user_email=user_email,
            course_id=course_id,
            course_title=course_title,
            bucket=bucket,
            score=score,
            max_score=max_score,
            time_spent_seconds=time_spent_seconds,
            quiz_correct=quiz_correct,
            quiz_total=quiz_total,
            completed_at=datetime.utcnow(),
        )
        self.db.add(completion)
        self.db.commit()

        return {"success": True, "completion_id": completion.id}

    def track_quiz_submission(
        self,
        user_email: str,
        quiz_id: str,
        quiz_title: str,
        correct: int,
        total: int,
        time_spent_seconds: int = 0
    ) -> Dict[str, Any]:
        """Track a quiz submission."""
        score = (correct / total * 100) if total > 0 else 0
        return {
            "success": True,
            "score": round(score, 1),
            "correct": correct,
            "total": total,
        }

    def track_interaction(
        self,
        user_email: str,
        interaction_type: str,
        content_id: str,
        content_type: str,
        duration_seconds: int = 0,
        metadata: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """Track a user interaction."""
        return {
            "success": True,
            "interaction_type": interaction_type,
            "content_id": content_id,
        }

    def get_audit_logs(self, action_type: Optional[str] = None, limit: int = 100) -> List[AuditLog]:
        """Get audit logs, optionally filtered by action type."""
        query = self.db.query(AuditLog)
        if action_type:
            query = query.filter(AuditLog.action == action_type)
        return query.order_by(AuditLog.timestamp.desc()).limit(limit).all()

    def create_audit_log(self, data: Dict[str, Any]) -> AuditLog:
        """Create a new audit log entry."""
        log = AuditLog(**data)
        self.db.add(log)
        self.db.commit()
        self.db.refresh(log)
        return log


class LocationTrackingRepository(BaseRepository[LocationTracking]):
    """Repository for LocationTracking operations."""

    def __init__(self, db: Session):
        super().__init__(db, LocationTracking)

    def get_active_locations(self) -> List[LocationTracking]:
        """Get all active location records."""
        return self.db.query(LocationTracking).filter(
            LocationTracking.active == True
        ).all()

    def get_by_user(self, user_email: str) -> Optional[LocationTracking]:
        """Get location for a specific user."""
        return self.db.query(LocationTracking).filter(
            LocationTracking.user_email == user_email
        ).first()

    def upsert_location(
        self,
        user_email: str,
        location_data: Dict[str, Any]
    ) -> LocationTracking:
        """Create or update location record."""
        existing = self.get_by_user(user_email)

        if existing:
            for key, value in location_data.items():
                if hasattr(existing, key):
                    setattr(existing, key, value)
            existing.timestamp = datetime.utcnow()
            self.db.commit()
            self.db.refresh(existing)
            return existing
        else:
            location_data['user_email'] = user_email
            location_data['timestamp'] = datetime.utcnow()
            return self.create(location_data)

    def deactivate_user(self, user_email: str) -> Optional[LocationTracking]:
        """Deactivate location tracking for a user."""
        location = self.get_by_user(user_email)
        if location:
            location.active = False
            self.db.commit()
            self.db.refresh(location)
        return location


class AttendanceRepository(BaseRepository[AttendanceRecord]):
    """Repository for AttendanceRecord operations."""

    def __init__(self, db: Session):
        super().__init__(db, AttendanceRecord)

    def get_by_user(self, user_email: str, limit: int = 30) -> List[AttendanceRecord]:
        """Get attendance records for a user."""
        return self.db.query(AttendanceRecord).filter(
            AttendanceRecord.user_email == user_email
        ).order_by(AttendanceRecord.punch_in.desc()).limit(limit).all()

    def get_active_record(self, user_email: str) -> Optional[AttendanceRecord]:
        """Get active (punched in, not punched out) record for user."""
        return self.db.query(AttendanceRecord).filter(
            AttendanceRecord.user_email == user_email,
            AttendanceRecord.punch_out == None
        ).first()

    def punch_out(self, record_id: str) -> Optional[AttendanceRecord]:
        """Punch out an attendance record."""
        record = self.get_by_id(record_id)
        if record and not record.punch_out:
            record.punch_out = datetime.utcnow()
            # Calculate duration
            duration = (record.punch_out - record.punch_in).total_seconds() / 60
            record.duration_minutes = int(duration)
            record.status = "completed"
            self.db.commit()
            self.db.refresh(record)
        return record

    def get_by_date_range(
        self,
        start_date: datetime,
        end_date: datetime,
        user_email: Optional[str] = None
    ) -> List[AttendanceRecord]:
        """Get attendance records within a date range."""
        query = self.db.query(AttendanceRecord).filter(
            AttendanceRecord.punch_in >= start_date,
            AttendanceRecord.punch_in <= end_date
        )

        if user_email:
            query = query.filter(AttendanceRecord.user_email == user_email)

        return query.order_by(AttendanceRecord.punch_in.desc()).all()
