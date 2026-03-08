"""
Analytics Repository
Data access layer for analytics and audit log operations
"""

import logging
import time
from typing import Any, Dict, List, Optional
from datetime import datetime, timedelta
from sqlalchemy import func, and_, or_, text
from sqlalchemy.orm import Session

from app.repositories.base import BaseRepository
from app.models.analytics import AuditLog
from app.models.user import User
from app.models.tracking import CourseCompletion, LocationTracking, AttendanceRecord
from app.models.quiz import QuizSubmission
from app.models.assessment import AssessmentSubmission
from app.models.content import Content

logger = logging.getLogger(__name__)

# ==========================================
# DYNAMIC SKILL CATEGORIES WITH CACHING
# ==========================================

# Cache for skill categories (shared across repository instances)
_skill_categories_cache = {
    "data": None,
    "dict_data": None,
    "last_updated": None,
    "ttl_seconds": 300  # Cache for 5 minutes
}

# Default skill categories (fallback if database is empty)
DEFAULT_SKILL_CATEGORIES = {
    "product_knowledge": {
        "name": "Flight Operations",
        "icon": "airplane",
        "color": "#D71A21",
        "description": "Understanding of flight operations, cabin procedures, and service protocols",
        "keywords": ["flight", "cabin", "operations", "procedure", "service", "boarding", "departure"]
    },
    "customer_service": {
        "name": "Passenger Service",
        "icon": "account-heart",
        "color": "#10B981",
        "description": "Skills for handling passenger interactions, complaints, and feedback",
        "keywords": ["passenger", "service", "complaint", "feedback", "communication", "satisfaction", "handling", "resolution"]
    },
    "safety_hygiene": {
        "name": "Safety & Emergency",
        "icon": "shield-check",
        "color": "#EF4444",
        "description": "Knowledge of aviation safety protocols and emergency procedures",
        "keywords": ["safety", "emergency", "evacuation", "security", "protocol", "compliance", "aviation safety"]
    },
    "operations": {
        "name": "Aircraft Systems",
        "icon": "cog",
        "color": "#8B5CF6",
        "description": "Understanding of aircraft systems, equipment, and cabin management",
        "keywords": ["aircraft", "system", "equipment", "cabin", "maintenance", "galley", "cargo", "management"]
    },
    "espresso_coffee": {
        "name": "Premium Service",
        "icon": "star",
        "color": "#6366F1",
        "description": "Mastery of premium cabin service, First & Business class protocols",
        "keywords": ["premium", "first class", "business", "lounge", "vip", "luxury", "fine dining"]
    },
    "onboarding": {
        "name": "Onboarding Essentials",
        "icon": "account-plus",
        "color": "#3B82F6",
        "description": "Foundational training for new crew members",
        "keywords": ["onboarding", "training", "introduction", "basics", "foundation", "new", "starter"]
    }
}

# Keep SKILL_CATEGORIES as an alias for backward compatibility
SKILL_CATEGORIES = DEFAULT_SKILL_CATEGORIES


def get_skill_categories_dict(db: Session) -> Dict[str, Any]:
    """
    Get skill categories from course_buckets table with caching.
    Buckets created via "Manage Buckets" in admin panel serve as skill categories.
    Returns a dictionary keyed by bucket_id for fast lookups.
    
    Performance optimized with in-memory caching (5 minute TTL).
    """
    global _skill_categories_cache
    
    current_time = time.time()
    
    # Check if cache is valid
    if (_skill_categories_cache["dict_data"] is not None and 
        _skill_categories_cache["last_updated"] is not None):
        
        cache_age = current_time - _skill_categories_cache["last_updated"]
        if cache_age < _skill_categories_cache["ttl_seconds"]:
            return _skill_categories_cache["dict_data"]
    
    # Fetch from database - use course_buckets table (admin-managed)
    logger.debug("Fetching skill categories from course_buckets table")
    categories_dict = {}
    
    try:
        # Fetch from course_buckets table (Manage Buckets in admin panel)
        result = db.execute(text("""
            SELECT id, name, icon, color, description, keywords, is_active 
            FROM course_buckets 
            WHERE is_active = true
            ORDER BY order_index
        """))
        
        rows = list(result)
        if rows:
            for row in rows:
                bucket_id = row[0]
                # Generate default keywords from bucket name if none exist
                keywords = row[5]
                if not keywords:
                    # Auto-generate keywords from bucket name
                    bucket_name = row[1] or ""
                    keywords = [w.lower() for w in bucket_name.split() if len(w) > 2]
                
                categories_dict[bucket_id] = {
                    "name": row[1],
                    "icon": row[2] or "school",
                    "color": row[3] or "#6366F1",
                    "description": row[4] or "",
                    "keywords": keywords if isinstance(keywords, list) else []
                }
            logger.debug(f"Loaded {len(categories_dict)} skill categories from course_buckets")
        
        # If no buckets in DB, use defaults
        if not categories_dict:
            categories_dict = DEFAULT_SKILL_CATEGORIES.copy()
            logger.debug("Using default skill categories (no buckets in DB)")
            
    except Exception as e:
        # Table might not exist yet, use defaults
        logger.debug(f"Could not fetch skill categories from course_buckets: {e}")
        categories_dict = DEFAULT_SKILL_CATEGORIES.copy()
    
    # Update cache
    _skill_categories_cache["dict_data"] = categories_dict
    _skill_categories_cache["last_updated"] = current_time
    
    return categories_dict


def invalidate_skill_categories_cache():
    """
    Invalidate the skill categories cache.
    Call this when buckets are created, updated, or deleted.
    """
    global _skill_categories_cache
    _skill_categories_cache["dict_data"] = None
    _skill_categories_cache["last_updated"] = None
    logger.info("Skill categories cache invalidated")

def find_skill_key_from_content(bucket: str, title: str, skill_categories: Dict[str, Any] = None) -> str:
    """
    Match content to a skill category based on bucket or title keywords.
    
    Args:
        bucket: The bucket/category of the content
        title: The title of the content
        skill_categories: Optional dict of skill categories. Uses default if not provided.
    
    Returns:
        skill_key: The matched skill category key
    """
    if skill_categories is None:
        skill_categories = DEFAULT_SKILL_CATEGORIES
    
    if not bucket and not title:
        return "onboarding"
    
    bucket_lower = (bucket or "").lower()
    title_lower = (title or "").lower()
    
    # Direct bucket match
    if bucket_lower in skill_categories:
        return bucket_lower
    
    # Keyword matching - check each category's keywords
    for skill_key, skill_data in skill_categories.items():
        keywords = skill_data.get("keywords", [])
        if isinstance(keywords, list):
            for keyword in keywords:
                if keyword.lower() in bucket_lower or keyword.lower() in title_lower:
                    return skill_key
    
    return "onboarding"  # Default


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

    def get_dashboard_stats(self, accessible_emails: set = None) -> Dict[str, Any]:
        """Get main dashboard statistics. Filters by accessible_emails if provided."""
        stats = {}

        # User stats - apply access filter
        user_query = self.db.query(func.count(User.id)).filter(
            User.is_superadmin == False
        )
        if accessible_emails is not None:
            user_query = user_query.filter(User.email.in_(accessible_emails))
        stats['total_users'] = user_query.scalar() or 0

        # Store stats - apply access filter
        store_query = self.db.query(func.count(func.distinct(User.store))).filter(
            User.is_superadmin == False
        )
        if accessible_emails is not None:
            store_query = store_query.filter(User.email.in_(accessible_emails))
        stats['total_stores'] = store_query.scalar() or 0

        # Completion stats - apply access filter
        completion_query = self.db.query(func.count(CourseCompletion.id))
        if accessible_emails is not None:
            completion_query = completion_query.filter(CourseCompletion.user_email.in_(accessible_emails))
        stats['total_completions'] = completion_query.scalar() or 0

        # Quiz stats - apply access filter
        quiz_count_query = self.db.query(func.count(QuizSubmission.id))
        quiz_avg_query = self.db.query(func.avg(QuizSubmission.score))
        if accessible_emails is not None:
            quiz_count_query = quiz_count_query.filter(QuizSubmission.user_email.in_(accessible_emails))
            quiz_avg_query = quiz_avg_query.filter(QuizSubmission.user_email.in_(accessible_emails))
        stats['total_quiz_submissions'] = quiz_count_query.scalar() or 0
        avg_score = quiz_avg_query.scalar()
        stats['avg_quiz_score'] = round(float(avg_score), 1) if avg_score else 0

        # Assessment stats - apply access filter
        assessment_query = self.db.query(func.count(AssessmentSubmission.id))
        passed_query = self.db.query(func.count(AssessmentSubmission.id)).filter(
            AssessmentSubmission.passed == True
        )
        if accessible_emails is not None:
            assessment_query = assessment_query.filter(AssessmentSubmission.user_email.in_(accessible_emails))
            passed_query = passed_query.filter(AssessmentSubmission.user_email.in_(accessible_emails))
        stats['total_assessments'] = assessment_query.scalar() or 0
        stats['passed_assessments'] = passed_query.scalar() or 0

        # Content stats (not filtered by user access - courses are the same for all)
        stats['total_courses'] = self.db.query(func.count(Content.id)).scalar() or 0

        # Today's stats - apply access filter
        today = datetime.utcnow().date()
        today_query = self.db.query(func.count(CourseCompletion.id)).filter(
            func.date(CourseCompletion.completed_at) == today
        )
        if accessible_emails is not None:
            today_query = today_query.filter(CourseCompletion.user_email.in_(accessible_emails))
        stats['completions_today'] = today_query.scalar() or 0

        return stats

    def get_store_analytics(self, accessible_emails: set = None) -> List[Dict[str, Any]]:
        """Get analytics grouped by store. Filters by accessible_emails if provided."""
        total_courses = self.db.query(func.count(Content.id)).scalar() or 0

        # Get user counts per store - apply access filter
        user_query = self.db.query(
            User.store,
            func.count(User.id).label('user_count')
        ).filter(
            User.is_superadmin == False,
            User.store != None,
            User.store != ''
        )
        if accessible_emails is not None:
            user_query = user_query.filter(User.email.in_(accessible_emails))
        user_counts = user_query.group_by(User.store).all()

        stores_list = []

        for store, user_count in user_counts:
            # Get completion count for this store - apply access filter
            completion_query = self.db.query(func.count(CourseCompletion.id)).join(
                User, CourseCompletion.user_email == User.email
            ).filter(
                User.store == store,
                User.is_superadmin == False
            )
            if accessible_emails is not None:
                completion_query = completion_query.filter(User.email.in_(accessible_emails))
            completion_count = completion_query.scalar() or 0

            # Get average quiz score for this store - apply access filter
            quiz_query = self.db.query(func.avg(QuizSubmission.score)).join(
                User, QuizSubmission.user_email == User.email
            ).filter(
                User.store == store,
                User.is_superadmin == False
            )
            if accessible_emails is not None:
                quiz_query = quiz_query.filter(User.email.in_(accessible_emails))
            avg_score = quiz_query.scalar()

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

    def get_leaderboard(self, limit: int = 10, accessible_emails: set = None) -> List[Dict[str, Any]]:
        """Get leaderboard by completions. Filters by accessible_emails if provided."""
        query = self.db.query(
            User.email,
            User.name,
            User.store,
            func.count(CourseCompletion.id).label('completions')
        ).join(
            CourseCompletion, CourseCompletion.user_email == User.email
        ).filter(
            User.is_superadmin == False
        )

        # Apply access filter if provided
        if accessible_emails is not None:
            query = query.filter(User.email.in_(accessible_emails))

        results = query.group_by(
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

    def get_dashboard_metrics(self, accessible_emails: set = None) -> Dict[str, Any]:
        """Get dashboard metrics (alias for get_dashboard_stats). Filters by accessible_emails if provided."""
        return self.get_dashboard_stats(accessible_emails=accessible_emails)

    def get_store_performance(self, accessible_emails: set = None) -> List[Dict[str, Any]]:
        """Get store performance analytics. Filters by accessible_emails if provided."""
        return self.get_store_analytics(accessible_emails=accessible_emails)

    def get_store_detail(self, store_name: str, accessible_emails: set = None) -> Dict[str, Any]:
        """Get detailed analytics for a specific store. Filters by accessible_emails if provided."""
        # Get users in store
        query = self.db.query(User).filter(
            User.store == store_name,
            User.is_superadmin == False
        )

        # Apply access filter if provided
        if accessible_emails is not None:
            query = query.filter(User.email.in_(accessible_emails))

        users = query.all()

        user_count = len(users)
        user_emails = [u.email for u in users]

        if not user_emails:
            return {
                "store_name": store_name,
                "employee_count": 0,
                "total_completions": 0,
                "total_quizzes": 0,
                "avg_quiz_score": 0,
                "employees": [],
            }

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

    def get_employee_performance(self, accessible_emails: set = None) -> List[Dict[str, Any]]:
        """Get employee performance list. Filters by accessible_emails if provided."""
        query = self.db.query(
            User.email,
            User.name,
            User.role,
            User.store,
            func.count(CourseCompletion.id).label('completions')
        ).outerjoin(
            CourseCompletion, CourseCompletion.user_email == User.email
        ).filter(
            User.is_superadmin == False
        )

        # Apply access filter if provided
        if accessible_emails is not None:
            query = query.filter(User.email.in_(accessible_emails))

        results = query.group_by(
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

    def get_store_leaderboard(self, store_id: str, limit: int = 10, accessible_emails: set = None) -> List[Dict[str, Any]]:
        """Get leaderboard for a specific store. Filters by accessible_emails if provided."""
        query = self.db.query(
            User.email,
            User.name,
            func.count(CourseCompletion.id).label('completions')
        ).join(
            CourseCompletion, CourseCompletion.user_email == User.email
        ).filter(
            User.store == store_id,
            User.is_superadmin == False
        )

        # Apply access filter if provided
        if accessible_emails is not None:
            query = query.filter(User.email.in_(accessible_emails))

        results = query.group_by(
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
        """Get skill gap analysis for a user based on course completions and quiz scores."""
        logger.info(f"--- Calculating Skill Gaps for {user_email} ---")
        
        # Get dynamic skill categories (cached for performance)
        skill_categories = get_skill_categories_dict(self.db)
        
        skill_gaps = []
        
        # 1. Calculate total modules per skill category from all content
        total_modules_per_skill = {k: 0 for k in skill_categories}
        try:
            result = self.db.execute(text("SELECT bucket, title FROM content"))
            for row in result:
                bucket = row[0] or ""
                title = row[1] or ""
                skill_key = find_skill_key_from_content(bucket, title, skill_categories)
                if skill_key in total_modules_per_skill:
                    total_modules_per_skill[skill_key] += 1
        except Exception as e:
            logger.warning(f"Could not fetch content for skill gaps: {e}")
        
        # 2. Calculate completed modules per skill for the user
        completed_modules_per_skill = {k: 0 for k in skill_categories}
        completed_course_ids = set()
        try:
            result = self.db.execute(
                text("SELECT course_id, course_title, bucket FROM course_completions WHERE user_email = :email"),
                {"email": user_email}
            )
            for row in result:
                course_id = row[0]
                course_title = row[1] or ""
                bucket = row[2] or ""
                if course_id and course_id not in completed_course_ids:
                    completed_course_ids.add(course_id)
                    skill_key = find_skill_key_from_content(bucket, course_title, skill_categories)
                    if skill_key in completed_modules_per_skill:
                        completed_modules_per_skill[skill_key] += 1
        except Exception as e:
            logger.warning(f"Could not fetch course completions for skill gaps: {e}")
        
        # 3. Calculate quiz scores per skill category
        quiz_scores_per_skill = {k: {"total_score": 0, "max_score": 0, "attempts": 0} for k in skill_categories}
        try:
            result = self.db.execute(
                text("""
                    SELECT qs.quiz_id, qs.score, q.title as quiz_title
                    FROM quiz_submissions qs
                    LEFT JOIN quizzes q ON qs.quiz_id = q.id
                    WHERE qs.user_email = :email
                """),
                {"email": user_email}
            )
            
            for row in result:
                quiz_title = row[2] or ""
                score = row[1] or 0
                skill_key = find_skill_key_from_content("", quiz_title, skill_categories)
                if skill_key in quiz_scores_per_skill:
                    quiz_scores_per_skill[skill_key]["total_score"] += score
                    quiz_scores_per_skill[skill_key]["max_score"] += 100
                    quiz_scores_per_skill[skill_key]["attempts"] += 1
        except Exception as e:
            logger.warning(f"Could not fetch quiz submissions for skill gaps: {e}")
        
        # 4. Build skill gaps array
        for skill_key, skill_data in skill_categories.items():
            total_mod = total_modules_per_skill.get(skill_key, 0)
            completed_mod = completed_modules_per_skill.get(skill_key, 0)
            quiz_data = quiz_scores_per_skill.get(skill_key, {"total_score": 0, "max_score": 0, "attempts": 0})
            
            # Calculate percentage based on module completion
            if total_mod > 0:
                percentage = (completed_mod / total_mod) * 100
            else:
                percentage = 100 if completed_mod > 0 else 0
            
            # Cap at 100%
            percentage = min(100.0, percentage)
            
            # Count attempts
            attempts = quiz_data["attempts"]
            if attempts == 0 and completed_mod > 0:
                attempts = 1
            
            # Determine status text
            if percentage >= 100:
                status_text = "Completed"
            elif percentage > 0:
                status_text = "In Progress"
            else:
                status_text = "Not Started"
            
            # Determine gap level
            if percentage < 50:
                gap_level = "critical"
            elif percentage < 70:
                gap_level = "moderate"
            elif percentage < 85:
                gap_level = "minor"
            else:
                gap_level = "none"
            
            skill_gaps.append({
                "skill_key": skill_key,
                "skill_name": skill_data.get("name", skill_key),
                "icon": skill_data.get("icon", "school"),
                "color": skill_data.get("color", "#6366F1"),
                "current_score": quiz_data["total_score"],
                "max_score": quiz_data["max_score"],
                "percentage": round(percentage, 1),
                "attempts": attempts,
                "gap_level": gap_level,
                "status": status_text,
                "needs_improvement": percentage < 70 or attempts == 0,
                "modules_completed": completed_mod,
                "total_modules": total_mod
            })
        
        # Sort by gap severity (critical first)
        gap_order = {"critical": 0, "moderate": 1, "minor": 2, "none": 3}
        skill_gaps.sort(key=lambda x: (gap_order.get(x["gap_level"], 4), -x["attempts"]))
        
        # Calculate weak and strong areas
        weak_areas = [g["skill_key"] for g in skill_gaps if g["gap_level"] in ["critical", "moderate"]]
        strong_areas = [g["skill_key"] for g in skill_gaps if g["gap_level"] == "none" and g["attempts"] > 0]
        
        return {
            "user_email": user_email,
            "skill_gaps": skill_gaps,
            "weak_areas": weak_areas,
            "strong_areas": strong_areas,
            "recommendations": []
        }

    def get_recommendations(self, user_email: str, limit: int = 5) -> Dict[str, Any]:
        """Get AI-powered personalized course recommendations based on real skill gaps and progress."""
        logger.info(f"--- Generating Recommendations for {user_email} ---")
        
        # Get dynamic skill categories (cached for performance)
        skill_categories = get_skill_categories_dict(self.db)
        
        # 1. Get skill gaps for this user (real calculation)
        skill_gap_data = self.get_skill_gaps(user_email)
        skill_gaps = skill_gap_data.get("skill_gaps", [])
        weak_areas = skill_gap_data.get("weak_areas", [])
        
        # 2. Get courses user hasn't completed
        completed_ids = []
        try:
            result = self.db.execute(
                text("SELECT course_id FROM course_completions WHERE user_email = :email"),
                {"email": user_email}
            )
            completed_ids = [row[0] for row in result if row[0]]
        except Exception as e:
            logger.warning(f"Could not fetch completed courses: {e}")
        
        # Fetch candidate courses using raw SQL to avoid schema mismatches
        candidate_courses = []
        try:
            if completed_ids:
                # Build a safe parameterized query
                placeholders = ','.join([f':id{i}' for i in range(len(completed_ids))])
                query = text(f"""
                    SELECT id, title, bucket, description, video_url, file_url, thumbnail, xp, resource_type, duration
                    FROM content
                    WHERE id NOT IN ({placeholders})
                    LIMIT 30
                """)
                params = {f'id{i}': cid for i, cid in enumerate(completed_ids)}
                result = self.db.execute(query, params)
            else:
                result = self.db.execute(text("""
                    SELECT id, title, bucket, description, video_url, file_url, thumbnail, xp, resource_type, duration
                    FROM content
                    LIMIT 30
                """))
            
            for row in result:
                candidate_courses.append({
                    "id": row[0],
                    "title": row[1] or "",
                    "bucket": row[2] or "",
                    "description": row[3] or "",
                    "video_url": row[4],
                    "file_url": row[5],
                    "thumbnail": row[6],
                    "xp": row[7] or 0,
                    "resource_type": row[8] or "",
                    "duration": row[9] or ""
                })
        except Exception as e:
            logger.warning(f"Could not fetch candidate courses: {e}")
        
        recommendations = []
        focus_tags = set()
        
        # 3. Rank courses based on skill gaps
        for course in candidate_courses:
            bucket = (course.get("bucket") or "").lower()
            title = (course.get("title") or "").lower()
            skill_key = find_skill_key_from_content(bucket, title, skill_categories)
            
            # Determine priority based on skill gaps
            priority = "low"
            reason = "Recommended for your role"
            
            # Check if this course addresses a weak skill area
            if skill_key in weak_areas:
                matching_gap = next((g for g in skill_gaps if g["skill_key"] == skill_key), None)
                if matching_gap:
                    if matching_gap["gap_level"] == "critical":
                        priority = "high"
                        reason = f"Critical skill gap in {matching_gap['skill_name']}. Immediate attention needed!"
                    elif matching_gap["gap_level"] == "moderate":
                        priority = "high"
                        reason = f"You're at {matching_gap['percentage']}% in {matching_gap['skill_name']}. This will help you improve."
                    else:
                        priority = "medium"
                        reason = f"Boost your {matching_gap['skill_name']} skills further."
            
            # Additional priority boosts
            course_bucket = course.get("bucket") or ""
            if course_bucket.lower() in ["safety", "compliance", "mandatory", "hygiene"]:
                if priority != "high":
                    priority = "high"
                    reason = "Mandatory compliance training - complete this first!"
            
            if "advanced" in title:
                if priority == "low":
                    priority = "medium"
                    reason = "Advanced training to enhance your expertise."
            
            # XP-based reasoning
            course_xp = course.get("xp") or 0
            if priority == "low" and course_xp > 50:
                priority = "medium"
                reason = f"+{course_xp} XP opportunity to boost your ranking!"
            
            # Get skill name from dynamic categories
            skill_name = skill_categories.get(skill_key, {}).get("name", course_bucket or "General Skills")
            focus_tags.add(skill_name)
            
            recommendations.append({
                "course_id": course.get("id"),
                "course_title": course.get("title"),
                "priority": priority,
                "reason": reason,
                "skill_addressed": skill_name,
                "skill_key": skill_key,
                "expected_improvement": f"Improve {skill_name} proficiency",
                "course_data": {
                    "id": course.get("id"),
                    "title": course.get("title"),
                    "description": course.get("description"),
                    "bucket": course.get("bucket"),
                    "videoUrl": course.get("video_url"),
                    "fileUrl": course.get("file_url"),
                    "thumbnail": course.get("thumbnail"),
                    "xp": course.get("xp"),
                    "resource_type": course.get("resource_type"),
                    "resourceType": course.get("resource_type"),  # camelCase for frontend
                    "duration": course.get("duration")
                }
            })
        
        # 4. Sort by priority (high > medium > low)
        priority_map = {"high": 3, "medium": 2, "low": 1}
        recommendations.sort(key=lambda x: priority_map.get(x["priority"], 0), reverse=True)
        
        # Limit to requested number
        recommendations = recommendations[:limit]
        
        # 5. Generate personalized advice based on skill gaps
        if weak_areas:
            critical_count = sum(1 for g in skill_gaps if g["gap_level"] == "critical")
            moderate_count = sum(1 for g in skill_gaps if g["gap_level"] == "moderate")
            
            if critical_count > 0:
                overall_advice = f"You have {critical_count} critical skill gaps that need immediate attention. Focus on the High Priority courses below to improve quickly."
            elif moderate_count > 0:
                overall_advice = f"You're making progress! Complete {moderate_count} more areas to reach proficiency. The courses below are tailored for you."
            else:
                overall_advice = f"You have {len(recommendations)} recommended courses to enhance your skills. Keep up the great work!"
        else:
            overall_advice = "Great job! You're on track. Explore new courses to expand your expertise and earn more XP."
        
        # 6. Get profile summary
        profile = self.get_user_learning_profile(user_email)
        
        return {
            "status": "success",
            "recommendations": recommendations,
            "overall_advice": overall_advice,
            "focus_areas": list(focus_tags)[:3],
            "skill_gaps": skill_gaps,
            "profile_summary": profile
        }

    def get_competency_matrix(self, accessible_emails: set = None) -> List[Dict[str, Any]]:
        """Get competency matrix for all users. Filters by accessible_emails if provided."""
        query = self.db.query(User).filter(User.is_superadmin == False)

        # Apply access filter if provided
        if accessible_emails is not None:
            query = query.filter(User.email.in_(accessible_emails))

        users = query.limit(50).all()

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

    def get_company_skill_gaps(self, accessible_emails: set = None) -> Dict[str, Any]:
        """Get company-wide skill gap analysis. Filters by accessible_emails if provided."""
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

    def get_audit_logs(
        self, 
        action_type: Optional[str] = None, 
        limit: int = 1000,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """Get audit logs, optionally filtered by action type and date range."""
        query = self.db.query(AuditLog)
        
        if action_type:
            query = query.filter(AuditLog.action == action_type)
            
        if start_date:
            query = query.filter(AuditLog.timestamp >= start_date)
            
        if end_date:
            query = query.filter(AuditLog.timestamp <= end_date)
            
        total_count = query.count()
        logs = query.order_by(AuditLog.timestamp.desc()).limit(limit).all()
            
        return {"logs": logs, "total": total_count}

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
