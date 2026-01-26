"""
User Service
Business logic for user management, authentication, and authorization
"""

import uuid
import logging
from typing import Any, Dict, List, Optional, Set
from datetime import datetime

from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password, is_password_hashed
from app.core.auth import (
    create_access_token,
    create_refresh_token,
    verify_token,
    generate_user_token_data,
    add_to_blacklist,
    rotate_refresh_token,
)
from app.core.exceptions import (
    AuthenticationError,
    AuthorizationError,
    NotFoundError,
    ConflictError,
    ValidationError,
)
from app.repositories.user_repository import (
    UserRepository,
    UserNodeProgressRepository,
    CourseCompletionRepository,
)
from app.repositories.content_repository import AccessRuleRepository
from app.models.user import User
from app.config.settings import settings

logger = logging.getLogger(__name__)

# Role hierarchy for access control
ROLE_HIERARCHY = [
    'Waffler',
    'Silver Waffler',
    'Gold Waffler',
    'Shift Manager',
    'Assistant Store Manager',
    'Store Manager'
]

# All available privileges
ALL_PRIVILEGES = [
    "team_list", "reports", "assign_quiz", "audits", "upload_training",
    "bulk_upload", "post_news", "post_quiz", "create_user", "live_tracking",
    "proctored_assessment", "proctored_create_manage", "proctored_view_results",
    "view_analytics", "send_notification", "access_control", "manage_buckets",
    "schedule_meeting", "crm_tickets", "manage_simulations", "manage_learning_path",
    "scheduled_exams", "exam_reports", "support_library", "view_audit_logs",
]


class UserService:
    """Service for user-related operations."""

    def __init__(self, db: Session):
        self.db = db
        self.user_repo = UserRepository(db)
        self.progress_repo = UserNodeProgressRepository(db)
        self.completion_repo = CourseCompletionRepository(db)
        self.access_rule_repo = AccessRuleRepository(db)

    # ===========================================
    # AUTHENTICATION
    # ===========================================

    def authenticate(self, email: str, password: str) -> Dict[str, Any]:
        """
        Authenticate user and return tokens.

        Args:
            email: User email
            password: Plain text password

        Returns:
            Dictionary with tokens and user data

        Raises:
            AuthenticationError: If credentials are invalid
        """
        # Normalize email
        email = email.lower().strip()

        # Get user from database
        user = self.user_repo.get_by_email(email)

        if not user:
            logger.warning(f"Login attempt for non-existent user: {email}")
            raise AuthenticationError(
                detail="Invalid email or password",
                error_code="INVALID_CREDENTIALS"
            )

        # Verify password
        stored_password = user.password

        if is_password_hashed(stored_password):
            # Password is hashed, use bcrypt verification
            if not verify_password(password, stored_password):
                logger.warning(f"Failed login attempt for user: {email}")
                raise AuthenticationError(
                    detail="Invalid email or password",
                    error_code="INVALID_CREDENTIALS"
                )
        else:
            # Legacy plain text password - migrate to hash
            if password != stored_password:
                raise AuthenticationError(
                    detail="Invalid email or password",
                    error_code="INVALID_CREDENTIALS"
                )
            # Hash and save the password
            user.password = hash_password(password)
            self.db.commit()

        # Generate tokens
        user_data = user.to_dict()
        token_data = generate_user_token_data(user_data)

        access_token = create_access_token(token_data)
        refresh_token = create_refresh_token(email)

        logger.info(f"User logged in: {email}")

        return {
            "status": "success",
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "expires_in": settings.JWT_EXPIRATION_HOURS * 3600,
            "user": user_data,
        }

    def refresh_tokens(self, refresh_token: str) -> Dict[str, str]:
        """
        Refresh access token using refresh token.

        Args:
            refresh_token: Valid refresh token

        Returns:
            New access and refresh tokens

        Raises:
            AuthenticationError: If refresh token is invalid
        """
        result = rotate_refresh_token(refresh_token)

        if not result:
            raise AuthenticationError(
                detail="Invalid or expired refresh token",
                error_code="INVALID_REFRESH_TOKEN"
            )

        return result

    def logout(self, access_token: str, refresh_token: Optional[str] = None) -> bool:
        """
        Logout user by blacklisting tokens.

        Args:
            access_token: Current access token
            refresh_token: Optional refresh token

        Returns:
            True if successful
        """
        add_to_blacklist(access_token)
        if refresh_token:
            add_to_blacklist(refresh_token)

        logger.info("User logged out")
        return True

    # ===========================================
    # USER CRUD
    # ===========================================

    def create_user(self, user_data: Dict[str, Any]) -> User:
        """
        Create a new user.

        Args:
            user_data: User data dictionary

        Returns:
            Created user

        Raises:
            ConflictError: If email already exists
            ValidationError: If data is invalid
        """
        email = user_data.get("email", "").lower().strip()

        # Check if email exists
        if self.user_repo.email_exists(email):
            raise ConflictError(
                detail=f"User with email '{email}' already exists",
                resource="User",
                field="email"
            )

        # Hash password
        password = user_data.get("password", "")
        if not password:
            raise ValidationError(detail="Password is required", field="password")

        user_data["email"] = email
        user_data["password"] = hash_password(password)

        # Set defaults
        user_data.setdefault("role", "Waffler")
        user_data.setdefault("category", "Employee")
        user_data.setdefault("store", "Unassigned")
        user_data.setdefault("privileges", [])
        user_data.setdefault("is_superadmin", False)
        user_data.setdefault("has_admin_access", False)
        user_data.setdefault("self_learning_completed", False)

        user = self.user_repo.create(user_data)
        logger.info(f"Created new user: {email}")

        return user

    def get_user_by_email(self, email: str) -> User:
        """
        Get user by email.

        Args:
            email: User email

        Returns:
            User object

        Raises:
            NotFoundError: If user not found
        """
        user = self.user_repo.get_by_email(email.lower().strip())
        if not user:
            raise NotFoundError(resource="User", resource_id=email)
        return user

    def get_user_by_email_optional(self, email: str) -> Optional[User]:
        """Get user by email, returns None if not found."""
        return self.user_repo.get_by_email(email.lower().strip())

    def update_user(self, email: str, updates: Dict[str, Any]) -> User:
        """
        Update user data.

        Args:
            email: User email
            updates: Dictionary of fields to update

        Returns:
            Updated user

        Raises:
            NotFoundError: If user not found
        """
        user = self.get_user_by_email(email)

        # If updating password, hash it
        if "password" in updates and updates["password"]:
            updates["password"] = hash_password(updates["password"])

        for key, value in updates.items():
            if hasattr(user, key) and value is not None:
                setattr(user, key, value)

        self.db.commit()
        self.db.refresh(user)

        logger.info(f"Updated user: {email}")
        return user

    def delete_user(self, email: str) -> bool:
        """
        Delete a user.

        Args:
            email: User email

        Returns:
            True if deleted

        Raises:
            NotFoundError: If user not found
        """
        user = self.get_user_by_email(email)
        self.db.delete(user)
        self.db.commit()

        logger.info(f"Deleted user: {email}")
        return True

    def get_all_users(
        self,
        skip: int = 0,
        limit: int = 100,
        store: Optional[str] = None,
        role: Optional[str] = None,
        search: Optional[str] = None,
    ) -> List[User]:
        """Get all users with optional filters."""
        return self.user_repo.get_non_admin_users(
            skip=skip,
            limit=limit,
            store=store,
            role=role,
            search=search
        )

    def get_user_count(self, store: Optional[str] = None) -> int:
        """Get count of users."""
        return self.user_repo.count_non_admin_users(store=store)

    # ===========================================
    # PASSWORD MANAGEMENT
    # ===========================================

    def change_password(
        self,
        email: str,
        current_password: str,
        new_password: str
    ) -> bool:
        """
        Change user password.

        Args:
            email: User email
            current_password: Current password
            new_password: New password

        Returns:
            True if successful

        Raises:
            AuthenticationError: If current password is wrong
        """
        user = self.get_user_by_email(email)

        # Verify current password
        if is_password_hashed(user.password):
            if not verify_password(current_password, user.password):
                raise AuthenticationError(
                    detail="Current password is incorrect",
                    error_code="WRONG_PASSWORD"
                )
        else:
            if current_password != user.password:
                raise AuthenticationError(
                    detail="Current password is incorrect",
                    error_code="WRONG_PASSWORD"
                )

        # Update password
        user.password = hash_password(new_password)
        self.db.commit()

        logger.info(f"Password changed for user: {email}")
        return True

    # ===========================================
    # PRIVILEGES AND ROLES
    # ===========================================

    def update_privileges(self, email: str, privileges: List[str]) -> User:
        """Update user privileges."""
        user = self.get_user_by_email(email)
        user.privileges = privileges
        self.db.commit()
        self.db.refresh(user)
        return user

    def get_all_privileges(self) -> List[Dict[str, str]]:
        """Get all available privileges with their display names."""
        return [
            {"id": p, "name": p.replace("_", " ").title()}
            for p in ALL_PRIVILEGES
        ]

    def get_role_hierarchy(self) -> List[str]:
        """Get role hierarchy list."""
        return ROLE_HIERARCHY.copy()

    def get_user_level_index(self, role: str) -> int:
        """Get index of role in hierarchy."""
        try:
            return ROLE_HIERARCHY.index(role)
        except ValueError:
            return 0

    # ===========================================
    # LEARNING PROGRESS
    # ===========================================

    def get_user_node_progress(
        self,
        user_email: str,
        node_id: str
    ) -> Optional[Dict[str, Any]]:
        """Get user's progress for a specific node."""
        progress = self.progress_repo.get_by_user_and_node(user_email, node_id)
        if progress:
            return {
                "node_id": progress.node_id,
                "completed": progress.completed,
                "progress_percent": progress.progress_percent,
                "last_position": progress.last_position,
                "time_spent_seconds": progress.time_spent_seconds,
                "quiz_attempts": progress.quiz_attempts,
                "quiz_best_score": progress.quiz_best_score,
            }
        return None

    def update_node_progress(
        self,
        user_email: str,
        node_id: str,
        progress_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Update user's progress for a node."""
        progress = self.progress_repo.upsert_progress(user_email, node_id, progress_data)
        return {
            "node_id": progress.node_id,
            "completed": progress.completed,
            "progress_percent": progress.progress_percent,
            "last_position": progress.last_position,
        }

    def complete_node(
        self,
        user_email: str,
        node_id: str,
        score: Optional[float] = None
    ) -> Dict[str, Any]:
        """Mark a node as completed."""
        progress_data = {
            "completed": True,
            "progress_percent": 100.0,
        }
        if score is not None:
            progress_data["quiz_best_score"] = score

        return self.update_node_progress(user_email, node_id, progress_data)

    def get_user_completed_nodes(self, user_email: str) -> Set[str]:
        """Get set of completed node IDs for a user."""
        return self.progress_repo.get_user_completed_nodes(user_email)

    def get_user_completed_courses(self, user_email: str) -> Set[str]:
        """Get set of completed course IDs for a user."""
        return self.completion_repo.get_user_completed_course_ids(user_email)

    def get_user_completions(self, user_email: str) -> List:
        """Get all completion records for a user."""
        return self.completion_repo.get_by_user(user_email)

    # ===========================================
    # SELF-LEARNING STATUS
    # ===========================================

    def get_self_learning_status(self, user_email: str) -> Dict[str, Any]:
        """Get user's self-learning completion status."""
        user = self.get_user_by_email_optional(user_email)
        self_learning_completed = user.self_learning_completed if user else False

        # Get self-learning content count
        from app.repositories.content_repository import ContentRepository
        content_repo = ContentRepository(self.db)

        self_learning_content = content_repo.get_self_learning_content()
        total_self_learning = len(self_learning_content)
        self_learning_ids = {c.id for c in self_learning_content}

        # Get user's completed courses/nodes
        user_completed = self.get_user_completed_courses(user_email)
        user_completed_nodes = self.get_user_completed_nodes(user_email)
        all_completed = user_completed.union(user_completed_nodes)

        completed_self_learning = len(self_learning_ids.intersection(all_completed))

        progress_percent = (
            (completed_self_learning / total_self_learning * 100)
            if total_self_learning > 0 else 100
        )

        return {
            "user_email": user_email,
            "self_learning_completed": self_learning_completed,
            "self_learning_progress": round(progress_percent, 1),
            "completed_courses": completed_self_learning,
            "total_courses": total_self_learning,
            "career_path_unlocked": self_learning_completed or progress_percent >= 100,
        }

    def complete_self_learning(self, user_email: str) -> User:
        """Mark self-learning as completed for user."""
        user = self.get_user_by_email(user_email)
        user.self_learning_completed = True
        self.db.commit()
        self.db.refresh(user)
        return user

    # ===========================================
    # LEVEL PROGRESSION
    # ===========================================

    def get_user_level_progress(self, user_email: str) -> Dict[str, Any]:
        """Get user's progress towards next level."""
        user = self.get_user_by_email_optional(user_email)

        if not user:
            return {
                "current_level": "Waffler",
                "next_level": "Silver Waffler",
                "nodes_completed_in_level": 0,
                "nodes_required_in_level": 0,
                "progress_percent": 0,
            }

        current_role = user.role or "Waffler"

        # Get access rules for current role
        access_rule = self.access_rule_repo.get_by_level(current_role)
        required_courses = access_rule.accessible_courses if access_rule else []

        # Get user's completed courses
        user_completed = self.get_user_completed_courses(user_email)

        # Count completed required courses
        completed_count = sum(1 for cid in required_courses if cid in user_completed)
        total_required = len(required_courses)

        # Determine next level
        next_level = None
        level_index = self.get_user_level_index(current_role)
        if level_index < len(ROLE_HIERARCHY) - 1:
            next_level = ROLE_HIERARCHY[level_index + 1]

        return {
            "current_level": current_role,
            "next_level": next_level,
            "nodes_completed_in_level": completed_count,
            "nodes_required_in_level": total_required,
            "completed_nodes": len(user_completed),
            "nodes_remaining": max(0, total_required - completed_count),
            "progress_percent": int((completed_count / total_required * 100)) if total_required > 0 else 100,
        }

    def promote_user(self, email: str, new_role: str) -> User:
        """Promote user to a new role."""
        user = self.get_user_by_email(email)

        if new_role not in ROLE_HIERARCHY:
            raise ValidationError(
                detail=f"Invalid role: {new_role}",
                field="role"
            )

        user.role = new_role
        self.db.commit()
        self.db.refresh(user)

        logger.info(f"Promoted user {email} to {new_role}")
        return user

    # ===========================================
    # STORES AND CATEGORIES
    # ===========================================

    def get_distinct_stores(self) -> List[str]:
        """Get list of all stores."""
        return self.user_repo.get_distinct_stores()

    def get_users_by_store(self, store: str) -> List[User]:
        """Get all users in a store."""
        return self.user_repo.get_by_store(store)

    def get_user_count_by_store(self) -> Dict[str, int]:
        """Get user count grouped by store."""
        return self.user_repo.get_user_count_by_store()

    def check_role_advancement_eligibility(self, user_email: str) -> Dict[str, Any]:
        """Check if user is eligible for role advancement."""
        user = self.get_user_by_email_optional(user_email)
        
        if not user:
            return {
                "eligible": False,
                "current_role": "Waffler",
                "next_role": None,
                "requirements_met": [],
                "requirements_pending": []
            }
        
        current_role = user.role or "Waffler"
        level_index = self.get_user_level_index(current_role)
        
        # Check if already at max level
        if level_index >= len(ROLE_HIERARCHY) - 1:
            return {
                "eligible": False,
                "current_role": current_role,
                "next_role": None,
                "requirements_met": ["Maximum level reached"],
                "requirements_pending": []
            }
        
        next_role = ROLE_HIERARCHY[level_index + 1]
        
        # Get progress data
        progress = self.get_user_level_progress(user_email)
        completed = progress.get("nodes_completed_in_level", 0)
        required = progress.get("nodes_required_in_level", 0)
        
        requirements_met = []
        requirements_pending = []
        
        if completed >= required and required > 0:
            requirements_met.append(f"Completed {completed}/{required} required courses")
        else:
            requirements_pending.append(f"Complete {required - completed} more courses")
        
        eligible = len(requirements_pending) == 0 and required > 0
        
        return {
            "eligible": eligible,
            "current_role": current_role,
            "next_role": next_role,
            "requirements_met": requirements_met,
            "requirements_pending": requirements_pending,
            "progress_percent": progress.get("progress_percent", 0)
        }
