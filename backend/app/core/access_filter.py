"""
Access Control Filter Helper
Utility for applying access control filters to queries and data

This module provides helper functions that can be used in any endpoint
to filter data based on the current user's access grants.

Usage:
    from app.core.access_filter import get_accessible_emails, filter_users_by_access

    # In an endpoint:
    accessible = get_accessible_emails(db, current_user.get('email'))
    filtered_users = [u for u in users if u.email in accessible]
"""

import logging
from typing import List, Set, Optional
from functools import lru_cache
from sqlalchemy.orm import Session

from app.models.user import User

logger = logging.getLogger(__name__)


def get_accessible_emails(db: Session, viewer_email: str) -> Set[str]:
    """
    Get set of user emails that a viewer can access based on their grants.

    Args:
        db: Database session
        viewer_email: Email of the user viewing the data

    Returns:
        Set of user emails that the viewer can access

    Note:
        - Superadmins get access to ALL users
        - Users with no grants can only see themselves
        - This function is called frequently, so results could be cached
    """
    from app.services.access_control_service import AccessControlService

    service = AccessControlService(db)
    return service.get_accessible_user_emails(viewer_email)


def filter_users_by_access(db: Session, viewer_email: str, users: List[User]) -> List[User]:
    """
    Filter a list of users based on viewer's access grants.

    Args:
        db: Database session
        viewer_email: Email of the user viewing the data
        users: List of User objects to filter

    Returns:
        Filtered list containing only users the viewer can access
    """
    from app.services.access_control_service import AccessControlService

    service = AccessControlService(db)
    return service.filter_users_by_access(viewer_email, users)


def check_access(db: Session, viewer_email: str, target_email: str) -> bool:
    """
    Check if viewer has access to view target user's data.

    Args:
        db: Database session
        viewer_email: Email of the user viewing the data
        target_email: Email of the user whose data is being accessed

    Returns:
        True if viewer can access target user's data
    """
    from app.services.access_control_service import AccessControlService

    service = AccessControlService(db)
    return service.check_access(viewer_email, target_email)


def is_superadmin(db: Session, user_email: str) -> bool:
    """
    Check if a user is a superadmin (bypasses all access control).

    Args:
        db: Database session
        user_email: Email of the user to check

    Returns:
        True if user is superadmin
    """
    user = db.query(User).filter(User.email == user_email).first()
    return user.is_superadmin if user else False


def get_accessible_user_list(db: Session, viewer_email: str) -> List[User]:
    """
    Get list of User objects that a viewer can access.

    Args:
        db: Database session
        viewer_email: Email of the user viewing the data

    Returns:
        List of User objects the viewer can access
    """
    from app.services.access_control_service import AccessControlService

    service = AccessControlService(db)
    return service.get_accessible_users(viewer_email)


def apply_access_filter(
    db: Session,
    viewer_email: str,
    user_emails: List[str]
) -> List[str]:
    """
    Filter a list of user emails based on viewer's access grants.

    Args:
        db: Database session
        viewer_email: Email of the user viewing the data
        user_emails: List of user emails to filter

    Returns:
        Filtered list of emails the viewer can access
    """
    accessible = get_accessible_emails(db, viewer_email)
    return [email for email in user_emails if email in accessible]


# ===========================================
# HELPER FOR REPORTS/ANALYTICS INTEGRATION
# ===========================================

def get_access_filter_context(db: Session, current_user: dict) -> dict:
    """
    Get access filter context for use in report/analytics queries.

    Args:
        db: Database session
        current_user: Current user dict from authentication

    Returns:
        Dict containing:
            - is_superadmin: True if user bypasses all filters
            - accessible_emails: Set of accessible user emails (None if superadmin)
            - viewer_email: The viewer's email
    """
    viewer_email = current_user.get('email')
    user_is_superadmin = current_user.get('is_superadmin', False)

    # Double-check superadmin status — use the process cache to avoid a DB hit per request
    if not user_is_superadmin:
        from app.services._user_cache import user_cache as _user_cache
        cached = _user_cache.get()
        if cached is not None:
            # Find in cache (O(n) but n is small and no DB round-trip)
            user = next((u for u in cached if u.email == viewer_email), None)
        else:
            user = db.query(User).filter(User.email == viewer_email).first()
        user_is_superadmin = user.is_superadmin if user else False

    if user_is_superadmin:
        return {
            'is_superadmin': True,
            'accessible_emails': None,  # None means no filter needed
            'viewer_email': viewer_email,
        }

    accessible_emails = get_accessible_emails(db, viewer_email)

    return {
        'is_superadmin': False,
        'accessible_emails': accessible_emails,
        'viewer_email': viewer_email,
    }


def should_include_user(
    access_context: dict,
    user_email: str
) -> bool:
    """
    Check if a user should be included based on access context.

    Args:
        access_context: Dict from get_access_filter_context()
        user_email: Email to check

    Returns:
        True if user should be included in results
    """
    if access_context.get('is_superadmin'):
        return True

    accessible = access_context.get('accessible_emails', set())
    return user_email in accessible


def get_email_filter_set(db: Session, current_user: dict):
    """
    Convenience helper for report / analytics endpoints.

    Returns:
        (is_superadmin: bool, accessible_emails: set | None)

    If is_superadmin is True, accessible_emails is None (no filter needed).
    Otherwise accessible_emails is the set of emails the viewer may see.
    If the set is empty, the viewer should only see their own data.

    Usage in a report endpoint::

        is_sa, emails = get_email_filter_set(db, current_user)
        if not is_sa and emails is not None:
            subq = subq.filter(CourseCompletion.user_email.in_(emails))
    """
    ctx = get_access_filter_context(db, current_user)
    if ctx['is_superadmin']:
        return True, None
    emails = ctx.get('accessible_emails') or set()
    if not emails:
        # Viewer has no grants — they should only see their own data
        viewer = ctx.get('viewer_email')
        emails = {viewer} if viewer else set()
    return False, emails

