"""
API Dependencies
Shared dependencies for all API endpoints
"""

from typing import Optional, Dict, Any
from fastapi import Depends, Header
from sqlalchemy.orm import Session

from app.config.database import get_db as get_database_session
from app.core.dependencies import (
    get_current_user as get_authenticated_user,
    get_current_user_optional as get_authenticated_user_optional,
    require_admin,
    require_superadmin,
    require_privilege,
    require_any_privilege,
    require_role,
    PaginationParams,
    get_pagination,
)
from app.services.user_service import UserService
from app.services.content_service import ContentService
from app.services.assessment_service import AssessmentService
from app.services.quiz_service import QuizService
from app.services.ai_service import AIService
from app.services.cdn_service import CDNService


# Re-export database dependency
def get_db():
    """Get database session."""
    return get_database_session()


# Re-export auth dependencies
get_current_user = get_authenticated_user
get_current_user_optional = get_authenticated_user_optional


# Service factories
def get_user_service(db: Session = Depends(get_database_session)) -> UserService:
    """Get UserService instance."""
    return UserService(db)


def get_content_service(db: Session = Depends(get_database_session)) -> ContentService:
    """Get ContentService instance."""
    return ContentService(db)


def get_assessment_service(db: Session = Depends(get_database_session)) -> AssessmentService:
    """Get AssessmentService instance."""
    return AssessmentService(db)


def get_quiz_service(db: Session = Depends(get_database_session)) -> QuizService:
    """Get QuizService instance."""
    return QuizService(db)


def get_ai_service() -> AIService:
    """Get AIService instance."""
    return AIService()


def get_cdn_service() -> CDNService:
    """Get CDNService instance."""
    return CDNService()


__all__ = [
    "get_db",
    "get_current_user",
    "get_current_user_optional",
    "require_admin",
    "require_superadmin",
    "require_privilege",
    "require_any_privilege",
    "require_role",
    "PaginationParams",
    "get_pagination",
    "get_user_service",
    "get_content_service",
    "get_assessment_service",
    "get_quiz_service",
    "get_ai_service",
    "get_cdn_service",
]
