"""
User Repository
Data access layer for user-related operations
"""

from typing import Any, Dict, List, Optional, Set
from datetime import datetime
from sqlalchemy import func, and_, or_
from sqlalchemy.orm import Session

from app.repositories.base import BaseRepository
from app.models.user import User, UserNodeProgress, UserLearningProfile, UserInteraction
from app.models.tracking import CourseCompletion
from app.models.content import AccessRule


class UserRepository(BaseRepository[User]):
    """Repository for User operations."""

    def __init__(self, db: Session):
        super().__init__(db, User)

    def get_by_email(self, email: str) -> Optional[User]:
        """Get user by email address."""
        return self.db.query(User).filter(User.email == email).first()

    def email_exists(self, email: str) -> bool:
        """Check if email already exists."""
        return self.db.query(
            self.db.query(User).filter(User.email == email).exists()
        ).scalar()

    def get_by_store(self, store: str) -> List[User]:
        """Get all users in a specific store."""
        return self.db.query(User).filter(
            User.store == store,
            User.is_superadmin == False
        ).all()

    def get_by_role(self, role: str) -> List[User]:
        """Get all users with a specific role."""
        return self.db.query(User).filter(User.role == role).all()

    def get_non_admin_users(
        self,
        skip: int = 0,
        limit: int = 100,
        store: Optional[str] = None,
        role: Optional[str] = None,
        search: Optional[str] = None,
    ) -> List[User]:
        """Get non-admin users with filters."""
        query = self.db.query(User).filter(User.is_superadmin == False)

        if store:
            query = query.filter(User.store == store)
        if role:
            query = query.filter(User.role == role)
        if search:
            search_term = f"%{search}%"
            query = query.filter(
                or_(
                    User.email.ilike(search_term),
                    User.name.ilike(search_term)
                )
            )

        return query.order_by(User.name).offset(skip).limit(limit).all()

    def count_non_admin_users(
        self,
        store: Optional[str] = None,
        role: Optional[str] = None,
    ) -> int:
        """Count non-admin users with filters."""
        query = self.db.query(func.count(User.id)).filter(User.is_superadmin == False)

        if store:
            query = query.filter(User.store == store)
        if role:
            query = query.filter(User.role == role)

        return query.scalar() or 0

    def get_distinct_stores(self) -> List[str]:
        """Get list of distinct stores."""
        results = self.db.query(User.store).filter(
            User.is_superadmin == False,
            User.store != None,
            User.store != ''
        ).distinct().all()
        return [r[0] for r in results if r[0]]

    def get_user_count_by_store(self) -> Dict[str, int]:
        """Get count of users grouped by store."""
        results = self.db.query(
            User.store,
            func.count(User.id)
        ).filter(
            User.is_superadmin == False
        ).group_by(User.store).all()
        return {store: count for store, count in results if store}

    def update_self_learning_status(self, email: str, completed: bool) -> Optional[User]:
        """Update user's self-learning completion status."""
        user = self.get_by_email(email)
        if user:
            user.self_learning_completed = completed
            self.db.commit()
            self.db.refresh(user)
        return user


class UserNodeProgressRepository(BaseRepository[UserNodeProgress]):
    """Repository for UserNodeProgress operations."""

    def __init__(self, db: Session):
        super().__init__(db, UserNodeProgress)

    def get_by_user_and_node(self, user_email: str, node_id: str) -> Optional[UserNodeProgress]:
        """Get progress for specific user and node."""
        return self.db.query(UserNodeProgress).filter(
            UserNodeProgress.user_email == user_email,
            UserNodeProgress.node_id == node_id
        ).first()

    def get_user_progress(self, user_email: str) -> List[UserNodeProgress]:
        """Get all progress records for a user."""
        return self.db.query(UserNodeProgress).filter(
            UserNodeProgress.user_email == user_email
        ).all()

    def get_user_completed_nodes(self, user_email: str) -> Set[str]:
        """Get set of completed node IDs for a user."""
        results = self.db.query(UserNodeProgress.node_id).filter(
            UserNodeProgress.user_email == user_email,
            UserNodeProgress.completed == True
        ).all()
        return {r[0] for r in results}

    def get_progress_dict(self, user_email: str) -> Dict[str, Dict[str, Any]]:
        """Get all progress as dictionary keyed by node_id."""
        progress_list = self.get_user_progress(user_email)
        return {
            p.node_id: {
                "completed": p.completed,
                "progress_percent": p.progress_percent,
                "last_position": p.last_position,
                "time_spent_seconds": p.time_spent_seconds,
                "quiz_attempts": p.quiz_attempts,
                "quiz_best_score": p.quiz_best_score,
            }
            for p in progress_list
        }

    def upsert_progress(
        self,
        user_email: str,
        node_id: str,
        progress_data: Dict[str, Any]
    ) -> UserNodeProgress:
        """Create or update progress record."""
        existing = self.get_by_user_and_node(user_email, node_id)

        if existing:
            for key, value in progress_data.items():
                if hasattr(existing, key) and value is not None:
                    setattr(existing, key, value)
            existing.updated_at = datetime.utcnow()
            self.db.commit()
            self.db.refresh(existing)
            return existing
        else:
            progress_data['user_email'] = user_email
            progress_data['node_id'] = node_id
            return self.create(progress_data)


class CourseCompletionRepository(BaseRepository[CourseCompletion]):
    """Repository for CourseCompletion operations."""

    def __init__(self, db: Session):
        super().__init__(db, CourseCompletion)

    def get_by_user(self, user_email: str) -> List[CourseCompletion]:
        """Get all completions for a user."""
        return self.db.query(CourseCompletion).filter(
            CourseCompletion.user_email == user_email
        ).order_by(CourseCompletion.completed_at.desc()).all()

    def get_user_completed_course_ids(self, user_email: str) -> Set[str]:
        """Get set of completed course IDs for a user."""
        results = self.db.query(CourseCompletion.course_id).filter(
            CourseCompletion.user_email == user_email
        ).all()
        return {r[0] for r in results}

    def get_by_user_and_course(self, user_email: str, course_id: str) -> Optional[CourseCompletion]:
        """Check if user completed specific course."""
        return self.db.query(CourseCompletion).filter(
            CourseCompletion.user_email == user_email,
            CourseCompletion.course_id == course_id
        ).first()

    def get_completions_by_date_range(self, start_date, end_date) -> List[CourseCompletion]:
        """Get completions within a date range."""
        return self.db.query(CourseCompletion).filter(
            and_(
                CourseCompletion.completed_at >= start_date,
                CourseCompletion.completed_at <= end_date
            )
        ).all()

    def get_completion_count(self, user_email: Optional[str] = None) -> int:
        """Get count of completions."""
        query = self.db.query(func.count(CourseCompletion.id))
        if user_email:
            query = query.filter(CourseCompletion.user_email == user_email)
        return query.scalar() or 0

    def get_completion_trend(self, days: int = 30) -> List[Dict[str, Any]]:
        """Get completion trend for last N days."""
        from datetime import timedelta

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



