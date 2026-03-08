"""
API Module for Emirates LMS Backend
Contains all API routers and dependencies
"""

from app.api.deps import get_current_user, get_db

__all__ = ["get_current_user", "get_db"]
