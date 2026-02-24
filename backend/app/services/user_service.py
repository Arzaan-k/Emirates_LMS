"""
User Service
Business logic for user management, authentication, and authorization
"""

import uuid
import logging
from typing import Any, Dict, List, Optional, Set
from datetime import datetime, timedelta
import secrets

from sqlalchemy.orm import Session
from sqlalchemy import func, or_, String

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

# All available privileges — grouped as (id, label, description, group, access_level)
# access_level: "view" = read-only, "manage" = full create/edit/delete
PRIVILEGE_GROUPS = [
    {
        "group": "Team Management",
        "icon": "users",
        "items": [
            {"id": "team_list_view",  "label": "Team Directory",  "access": "view",   "feature": "team_dir",    "description": "View team directory"},
            {"id": "team_list",       "label": "Team Directory",  "access": "manage", "feature": "team_dir",    "description": "Create, edit & delete users"},
            {"id": "bulk_upload",     "label": "Bulk Upload",     "access": "manage",                           "description": "Bulk upload users via CSV"},
            {"id": "create_user",     "label": "Create Users",    "access": "manage",                           "description": "Create individual users"},
        ]
    },
    {
        "group": "Content & Training",
        "icon": "video",
        "items": [
            {"id": "upload_training_view",  "label": "Training Content", "access": "view",   "feature": "training",  "description": "Browse training content"},
            {"id": "upload_training",       "label": "Training Content", "access": "manage", "feature": "training",  "description": "Upload & manage training materials"},
            {"id": "manage_buckets",        "label": "Manage Buckets",   "access": "manage",                         "description": "Manage content buckets"},
            {"id": "manage_learning_path",  "label": "Learning Paths",   "access": "manage",                         "description": "Create & manage learning paths"},
        ]
    },
    {
        "group": "News & Communication",
        "icon": "bell",
        "items": [
            {"id": "post_news",         "label": "Post News",          "access": "manage", "description": "Create & publish news"},
            {"id": "send_notification", "label": "Send Notifications", "access": "manage", "description": "Send push notifications to users"},
        ]
    },
    {
        "group": "Quizzes & Exams",
        "icon": "file-text",
        "items": [
            {"id": "assign_quiz",             "label": "Assign Quizzes",  "access": "manage",                         "description": "Assign quizzes to users"},
            {"id": "post_quiz",               "label": "Create Quizzes",  "access": "manage",                         "description": "Create & manage quizzes"},
            {"id": "scheduled_exams",         "label": "Exams",           "access": "manage",                         "description": "Schedule & manage exams"},
            {"id": "exam_reports",            "label": "Exam Reports",    "access": "view",                           "description": "View exam results & reports"},
            {"id": "proctored_assessment",    "label": "Proctored Exams", "access": "view",   "feature": "proctored", "description": "Access proctored assessments"},
            {"id": "proctored_create_manage", "label": "Proctored Exams", "access": "manage", "feature": "proctored", "description": "Create & manage proctored exams"},
            {"id": "proctored_view_results",  "label": "Proctor Results", "access": "view",                           "description": "View proctored exam results"},
        ]
    },
    {
        "group": "Analytics & Reports",
        "icon": "bar-chart-2",
        "items": [
            {"id": "view_analytics", "label": "Analytics",    "access": "view",   "description": "Access analytics dashboards"},
            {"id": "reports",        "label": "Full Reports",  "access": "manage", "description": "Generate & export all reports"},
            {"id": "live_tracking",  "label": "Live Tracking", "access": "view",   "description": "View real-time user activity"},
        ]
    },
    {
        "group": "Audits & Compliance",
        "icon": "clipboard",
        "items": [
            {"id": "audits_view",     "label": "Audits",      "access": "view",   "feature": "audits", "description": "View audit records"},
            {"id": "audits",          "label": "Audits",      "access": "manage", "feature": "audits", "description": "Conduct & manage audits"},
            {"id": "view_audit_logs", "label": "System Logs", "access": "view",                        "description": "Access system audit logs"},
        ]
    },
    {
        "group": "Operations",
        "icon": "settings",
        "items": [
            {"id": "access_control",      "label": "Curriculum Hierarchy", "access": "manage", "description": "Manage curriculum hierarchy & course access by level"},
            {"id": "data_access_control", "label": "Data Access Control",  "access": "manage", "description": "Manage who can view which users' data (reports, analytics)"},
            {"id": "schedule_meeting",    "label": "Meetings",             "access": "manage", "description": "Schedule & manage meetings"},
            {"id": "crm_tickets",         "label": "CRM Tickets",          "access": "manage", "description": "Handle CRM support tickets"},
            {"id": "manage_simulations",  "label": "Simulations",          "access": "manage", "description": "Manage roleplay simulations"},
            {"id": "support_library",     "label": "Support Library",      "access": "manage", "description": "Manage support library content"},
        ]
    },
]

# Flat list of all privilege IDs (used for SuperAdmin grant-all and backward compat)
ALL_PRIVILEGES = [item["id"] for group in PRIVILEGE_GROUPS for item in group["items"]]


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

    # Fields in profile_data that are included in the full-text search
    SEARCH_PROFILE_KEYS = [
        "Employee Code", "Temporary Employee Code", "User Name",
        "Designation", "Department", "Sub Department",
        "Store Name", "Store Code", "Region", "City", "State",
        "Grade", "Job Role", "Function", "Sub Function",
        "Concept", "Franchise", "Contact Number",
    ]

    def get_users_with_count(
        self,
        skip: int,
        limit: int,
        store: str | None,
        role: str | None,
        search: str | None,
        filters: Optional[Dict[str, Any]] = None,
    ):
        query = self.db.query(User).order_by(User.id)

        if store:
            query = query.filter(User.store == store)

        if role:
            query = query.filter(User.role == role)

        # Apply direct-column filters in SQL; collect JSON filter keys for Python-level filtering
        json_filters: Dict[str, Any] = {}

        if filters:
            for key, value in filters.items():
                if not value:
                    continue

                # Direct column on User model — apply in SQL
                if hasattr(User, key):
                    col = getattr(User, key)
                    if isinstance(value, list):
                        query = query.filter(col.in_(value))
                    else:
                        query = query.filter(col == value)

                # profile_data JSON fields — defer to Python filtering
                else:
                    json_filters[key] = value

        # Fetch all users that pass SQL filters
        all_users = query.all()

        # Apply profile_data JSON filters in Python (avoids SQLAlchemy .astext issues)
        if json_filters:
            def matches_filters(user: User) -> bool:
                pd = user.profile_data or {}
                for key, value in json_filters.items():
                    cell = pd.get(key)
                    if cell is None:
                        return False
                    cell_str = str(cell).strip()
                    if isinstance(value, list):
                        if not any(cell_str.lower() == str(v).lower() for v in value):
                            return False
                    else:
                        if cell_str.lower() != str(value).lower():
                            return False
                return True

            all_users = [u for u in all_users if matches_filters(u)]

        # Full-text search: name, email + all profile_data fields
        # Token-based: each whitespace-separated word must hit at least one field (AND across tokens, OR across fields)
        if search:
            tokens = [t for t in search.lower().strip().split() if t]

            def matches_search(user: User) -> bool:
                # Build a flat list of all searchable text values for this user
                pd = user.profile_data or {}
                haystack = [
                    (user.name or '').lower(),
                    (user.email or '').lower(),
                    (user.store or '').lower(),
                    (user.role or '').lower(),
                ]
                for k in self.SEARCH_PROFILE_KEYS:
                    v = pd.get(k)
                    if v:
                        haystack.append(str(v).lower())

                # Every token must match at least one haystack entry
                for token in tokens:
                    if not any(token in field for field in haystack):
                        return False
                return True

            all_users = [u for u in all_users if matches_search(u)]

        total = len(all_users)
        users = all_users[skip: skip + limit]

        return users, total

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
                detail="Invalid Credentials"
            )

        # Verify password
        stored_password = user.password

        if is_password_hashed(stored_password):
            # Password is hashed, use bcrypt verification
            if not verify_password(password, stored_password):
                logger.warning(f"Failed login attempt for user: {email}")
                raise AuthenticationError(
                    detail="User id /password incorrect"
                )
        else:
            # Legacy plain text password - migrate to hash
            if password != stored_password:
                raise AuthenticationError(
                    detail="User id /password incorrect"
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

        # Check for Super Admin privileges (Role OR Category)
        role = user_data.get("role", "").strip()
        category = user_data.get("category", "").strip()
        
        if role == "Super Admin" or category == "Super Admin":
            user_data["is_superadmin"] = True
            user_data["has_admin_access"] = True
            user_data["role"] = "Super Admin" # Enforce role consistency
            logger.info(f"Elevating privileges for new user {email} (Role: {role}, Category: {category})")
            
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

        # Enforce consistency for superadmin flag based on role
        if "role" in updates or "category" in updates:
            if user.role == "Super Admin" or user.category == "Super Admin":
                user.is_superadmin = True
                user.has_admin_access = True
            else:
                user.is_superadmin = False

        self.db.commit()
        self.db.refresh(user)

        logger.info(f"Updated user: {email}")
        return user

    def _delete_user_data(self, email: str):
        """
        Helper to delete all user related data from various tables.
        Ensures data integrity by removing dependent records.
        """
        # Import models here to avoid circular imports at module level if any
        from app.models.user import UserNodeProgress, UserLearningProfile, UserInteraction
        from app.models.video_progress import VideoProgress, MidVideoQuizAttempt
        
        # 1. DELETE PROFILE PICTURE FROM STORAGE
        try:
            from app.services.cdn_service import CDNService
            user = self.user_repo.get_by_email(email)
            if user and user.profile_data and user.profile_data.get('profile_pic'):
                pic_url = user.profile_data.get('profile_pic')
                cdn = CDNService()
                
                # Extract key from URL
                key = None
                if cdn.public_url and pic_url.startswith(cdn.public_url):
                    key = pic_url.replace(f"{cdn.public_url}/", "")
                elif "/uploads/" in pic_url: # Fallback/Local
                    key = pic_url.split("/uploads/")[-1]
                    if not key.startswith("uploads/"):
                         key = f"uploads/{key}"
                
                if key:
                    cdn.delete_file(key)
        except Exception as e:
            logger.error(f"Failed to delete profile pic for {email}: {e}")

        # Delete Video Progress
        self.db.query(VideoProgress).filter(VideoProgress.user_email == email).delete()
        self.db.query(MidVideoQuizAttempt).filter(MidVideoQuizAttempt.user_email == email).delete()
        
        # Delete User Node Progress
        self.db.query(UserNodeProgress).filter(UserNodeProgress.user_email == email).delete()
        
        # Delete Learning Profile
        self.db.query(UserLearningProfile).filter(UserLearningProfile.user_email == email).delete()
        
        # Delete Interactions
        self.db.query(UserInteraction).filter(UserInteraction.user_email == email).delete()
        
        # Note: CourseCompletion and Submissions usually have relationships. 
        # If cascading is not set, we should delete them too. 
        # Attempting to delete via user.completions relationship is safer if loaded.
        
    def delete_user(self, email: str) -> bool:
        """
        Delete a user and all associated data.

        Args:
            email: User email

        Returns:
            True if deleted

        Raises:
            NotFoundError: If user not found
        """
        user = self.get_user_by_email(email)
        
        # Manually delete related data to ensure cleanup
        self._delete_user_data(email)
        
        self.db.delete(user)
        self.db.commit()

        logger.info(f"Deleted user and data: {email}")
        return True

    def bulk_delete_users(self, emails: List[str]) -> Dict[str, Any]:
        """
        Delete multiple users.

        Args:
            emails: List of user emails

        Returns:
            Dictionary with results
        """
        deleted_count = 0
        errors = []
        
        for email in emails:
            try:
                # Get user to ensure existence and check superadmin
                user = self.get_user_by_email_optional(email)
                if user:
                    if user.is_superadmin:
                        errors.append(f"Cannot delete superadmin {email}")
                        continue
                    
                    # Delete data and user
                    self._delete_user_data(email)
                    self.db.delete(user)
                    deleted_count += 1
                else:
                    errors.append(f"User {email} not found")
            except Exception as e:
                errors.append(f"Error deleting {email}: {str(e)}")
                # Continue preventing one failure from stopping all?
                # Using savepoint or just continue. 
                # With one transaction, one error might rollback all if not handled carefully.
                # But here we commit at the end.
                
        try:
            self.db.commit()
        except Exception as e:
            self.db.rollback()
            return {
                "status": "partial_error",
                "deleted": 0,
                "errors": [f"Database commit failed: {str(e)}"]
            }
        
        return {
            "status": "success",
            "deleted": deleted_count,
            "errors": errors
        }

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

    def get_user_count(
        self,
        store: Optional[str] = None,
        role: Optional[str] = None,
        search: Optional[str] = None
    ) -> int:
        """Get count of users."""
        return self.user_repo.count_non_admin_users(store=store, role=role, search=search)

    # ===========================================
    # PASSWORD MANAGEMENT
    # ===========================================

    def validate_password_strength(self, password: str):
        """
        Validate password strength.
        Rules:
        - At least 8 chars
        - At least one uppercase
        - At least one lowercase
        - At least one digit
        - At least one special char
        """
        import re
        if len(password) < 8:
            raise ValidationError(detail="Password must be at least 8 characters long", field="new_password")
        if not re.search(r"[A-Z]", password):
            raise ValidationError(detail="Password must contain at least one uppercase letter", field="new_password")
        if not re.search(r"[a-z]", password):
            raise ValidationError(detail="Password must contain at least one lowercase letter", field="new_password")
        if not re.search(r"\d", password):
            raise ValidationError(detail="Password must contain at least one digit", field="new_password")
        if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password):
            raise ValidationError(detail="Password must contain at least one special character", field="new_password")

    def generate_password_reset_token(self, email: str) -> str:
        """
        Generate and save a password reset token.
        
        Args:
            email: User email
            
        Returns:
            The generated token (OTP)
        """
        user = self.get_user_by_email(email)
        
        # Generate 6-digit OTP
        token = secrets.randbelow(1000000)
        token = f"{token:06d}"
        
        # Save to DB with expiration (15 minutes)
        user.reset_token = token
        user.reset_token_expires = datetime.utcnow() + timedelta(minutes=15)
        
        self.db.commit()
        return token

    def reset_password_with_token(self, email: str, token: str, new_password: str) -> bool:
        """
        Reset password using a valid token.
        
        Args:
            email: User email
            token: The OTP token
            new_password: New password
            
        Returns:
            True if successful
            
        Raises:
            ValidationError: If token is invalid or expired
        """
        user = self.get_user_by_email(email)
        
        if not user.reset_token or user.reset_token != token:
            raise ValidationError(detail="Invalid reset code", field="token")
            
        if not user.reset_token_expires or user.reset_token_expires < datetime.utcnow():
            raise ValidationError(detail="Reset code has expired", field="token")

        # Validate password strength
        self.validate_password_strength(new_password)
            
        # Update password
        user.password = hash_password(new_password)
        
        # Clear token
        user.reset_token = None
        user.reset_token_expires = None
        
        self.db.commit()
        logger.info(f"Password reset successfully for user: {email}")
        return True

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
        """Get set of completed course IDs for a user from ALL sources."""
        # Get from course_completions table
        from_completions = self.completion_repo.get_user_completed_course_ids(user_email)
        
        # Get from user_node_progress table  
        from_node_progress = self.progress_repo.get_user_completed_nodes(user_email)
        
        # ALSO check video_progress table (this is where VideoProgressService marks completion)
        from app.models.video_progress import VideoProgress
        video_completed = self.db.query(VideoProgress.node_id).filter(
            VideoProgress.user_email == user_email,
            VideoProgress.completed == True
        ).all()
        from_video_progress = {r[0] for r in video_completed}
        
        # Combine all sources
        return from_completions.union(from_node_progress).union(from_video_progress)

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
            "career_path_unlocked": True,  # Always unlocked for all users
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

        # Use access rules for current level - these are the courses assigned by admin
        access_rule = self.access_rule_repo.get_by_level(current_role)
        required_courses = access_rule.accessible_courses if access_rule else []

        # Get user's completed courses (from ALL sources: course_completions, user_node_progress, video_progress)
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
            "is_external": getattr(user, 'is_external', False) or False,
            "joined_at_level": getattr(user, 'joined_at_level', None),
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

    def check_role_advancement_eligibility(self, user_email: str, override_role: str = None) -> Dict[str, Any]:
        """
        Check if user is eligible for role advancement.

        Eligibility is based on completing all courses assigned to the user's current level
        via access rules (configured in admin panel).

        override_role: when set, uses this role instead of the user's DB role (for exam node clicks).
        """
        user = self.get_user_by_email_optional(user_email)

        if not user:
            return {
                "eligible": False,
                "current_role": "Waffler",
                "next_role": None,
                "requirements_met": [],
                "requirements_pending": []
            }

        current_role = override_role or user.role or "Waffler"
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
        
        # Get courses assigned to current level via access rules (admin panel config)
        access_rule = self.access_rule_repo.get_by_level(current_role)
        required_courses = set(access_rule.accessible_courses) if access_rule else set()
        
        # Get user's completed courses from ALL sources
        user_completed = self.get_user_completed_courses(user_email)
        
        # DEBUG: Log the comparison to diagnose eligibility issues
        logger.info(f"[ELIGIBILITY DEBUG] User: {user_email}, Current Role: {current_role}")
        logger.info(f"[ELIGIBILITY DEBUG] Required courses ({len(required_courses)}): {list(required_courses)[:5]}...")
        logger.info(f"[ELIGIBILITY DEBUG] User completed ({len(user_completed)}): {list(user_completed)[:5]}...")
        
        # Count completed required courses
        completed_required = required_courses.intersection(user_completed)
        incomplete_required = required_courses - user_completed
        
        logger.info(f"[ELIGIBILITY DEBUG] Completed required: {len(completed_required)}, Incomplete: {len(incomplete_required)}")
        if incomplete_required:
            logger.info(f"[ELIGIBILITY DEBUG] Incomplete IDs: {list(incomplete_required)[:5]}...")
        
        completed = len(completed_required)
        total = len(required_courses)
        
        requirements_met = []
        requirements_pending = []
        
        if total == 0:
            # No courses assigned to this level - user is eligible by default
            requirements_met.append("No courses required for this level")
        elif completed >= total:
            requirements_met.append(f"Completed all {total} required courses")
        elif incomplete_required:
            remaining = len(incomplete_required)
            requirements_pending.append(f"Complete {remaining} more courses")
        
        # Eligible if ALL required courses for current level are completed
        # If no courses are required (total=0), user is eligible
        eligible = len(incomplete_required) == 0
        logger.info(f"[ELIGIBILITY DEBUG] Final eligibility: {eligible} (incomplete={len(incomplete_required)}, total={total})")
        
        # [NEW] Dynamic Exam Config (fetched from Target Level)
        exam_config = {
            "exam_questions": 10,
            "exam_time_minutes": 15,
            "pass_percent": 70,
            "proctored": True
        }
        
        if next_role:
            try:
                from app.repositories.content_repository import ProgressionLevelRepository
                # Local import to prevent circular dependency

                level_repo = ProgressionLevelRepository(self.db)
                target_level = level_repo.get_by_name(next_role)

                if target_level:
                    exam_config["exam_questions"] = getattr(target_level, "exam_questions", 10) or 10
                    exam_config["exam_time_minutes"] = getattr(target_level, "exam_time_minutes", 15) or 15
                    exam_config["pass_percent"] = getattr(target_level, "pass_percent", 70) or 70
                    exam_config["proctored"] = getattr(target_level, "proctored", True)
            except Exception as e:
                logger.warning(f"Could not load dynamic exam config for {next_role} (using defaults): {e}")

        # Override exam_questions with the actual stored question count (admin-managed bank)
        # This ensures the eligibility modal shows the real number, not the level config default
        try:
            from app.models.quiz import LevelExamQuestion
            stored_exam = self.db.query(LevelExamQuestion).filter(
                LevelExamQuestion.level_name == current_role
            ).first()
            if stored_exam and stored_exam.questions and len(stored_exam.questions) > 0:
                exam_config["exam_questions"] = len(stored_exam.questions)
        except Exception as e:
            logger.warning(f"Could not load stored question count for {current_role}: {e}")

        return {
            "eligible": eligible,
            "current_role": current_role,
            "target_role": next_role,
            "next_role": next_role,
            "requirements_met": requirements_met,
            "requirements_pending": requirements_pending,
            "progress_percent": int((completed / total * 100)) if total > 0 else 100,
            "completed_courses": completed,
            "total_courses": total,
            "courses_total": total,
            "courses_remaining": len(incomplete_required),
            "required_course_ids": list(required_courses),
            "completed_course_ids": list(completed_required),
            "config": exam_config
        }
