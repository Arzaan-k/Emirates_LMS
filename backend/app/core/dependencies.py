"""
FastAPI Dependencies for BW LMS Backend
Reusable dependencies for authentication, authorization, and common operations
"""

import logging
from typing import Optional, Dict, Any, Callable

from fastapi import Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.core.auth import verify_token, is_blacklisted
from app.core.exceptions import (
    AuthenticationError,
    AuthorizationError,
    InvalidTokenError,
)

logger = logging.getLogger(__name__)

# ===========================================
# SECURITY SCHEME
# ===========================================

# HTTPBearer with auto_error=False to allow optional authentication
security = HTTPBearer(auto_error=False)


# ===========================================
# AUTHENTICATION DEPENDENCIES
# ===========================================

async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    request: Request = None,
) -> Optional[Dict[str, Any]]:
    """
    Get current user if authenticated, None otherwise.
    Does not raise an error if not authenticated.

    Usage:
        @app.get("/items")
        async def get_items(user: Optional[dict] = Depends(get_current_user_optional)):
            if user:
                return {"message": f"Hello {user['name']}"}
            return {"message": "Hello guest"}
    """
    if credentials is None:
        return None

    token = credentials.credentials

    # Check blacklist
    if is_blacklisted(token):
        return None

    # Verify token
    payload = verify_token(token, "access", check_blacklist=False)

    return payload


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Dict[str, Any]:
    """
    Get current authenticated user.
    Raises AuthenticationError if not authenticated.

    Usage:
        @app.get("/protected")
        async def protected_route(user: dict = Depends(get_current_user)):
            return {"email": user["email"]}
    """
    if credentials is None:
        logger.warning("No credentials provided in request")
        raise AuthenticationError(
            detail="Authentication required",
            error_code="AUTH_REQUIRED"
        )

    token = credentials.credentials
    logger.debug(f"Received token (first 20 chars): {token[:20]}...")

    # Check blacklist
    if is_blacklisted(token):
        logger.warning("Token is blacklisted")
        raise InvalidTokenError(detail="Token has been revoked")

    # Verify token
    payload = verify_token(token, "access", check_blacklist=False)

    if payload is None:
        logger.warning(f"Token verification failed for token: {token[:20]}...")
        raise InvalidTokenError(detail="Invalid or expired token")

    logger.debug(f"Token verified successfully for user: {payload.get('email')}")
    return payload


# Alias for backward compatibility
require_auth = get_current_user


async def require_admin(
    user: Dict[str, Any] = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Require admin privileges.
    Raises AuthorizationError if user is not an admin.

    Usage:
        @app.post("/admin/users")
        async def admin_route(user: dict = Depends(require_admin)):
            return {"admin": user["email"]}
    """
    is_superadmin = user.get("is_superadmin", False)
    has_admin_access = user.get("has_admin_access", False)

    if not is_superadmin and not has_admin_access:
        raise AuthorizationError(
            detail="Admin access required",
            error_code="ADMIN_REQUIRED"
        )

    return user


async def require_superadmin(
    user: Dict[str, Any] = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Require superadmin privileges (highest level).

    Usage:
        @app.delete("/admin/system")
        async def system_route(user: dict = Depends(require_superadmin)):
            return {"superadmin": user["email"]}
    """
    if not user.get("is_superadmin", False):
        raise AuthorizationError(
            detail="Superadmin access required",
            error_code="SUPERADMIN_REQUIRED"
        )

    return user


def require_privilege(privilege: str) -> Callable:
    """
    Factory function to create a dependency that checks for a specific privilege.

    Usage:
        @app.post("/users/create")
        async def create_user(user: dict = Depends(require_privilege("create_user"))):
            return {"created_by": user["email"]}
    """
    async def check_privilege(
        user: Dict[str, Any] = Depends(get_current_user)
    ) -> Dict[str, Any]:
        # Superadmins have all privileges
        if user.get("is_superadmin", False):
            return user

        privileges = user.get("privileges", [])

        if privilege not in privileges:
            raise AuthorizationError(
                detail=f"Missing required privilege: {privilege}",
                error_code="MISSING_PRIVILEGE",
                required_privilege=privilege
            )

        return user

    return check_privilege


def require_any_privilege(*privileges: str) -> Callable:
    """
    Factory function requiring ANY of the specified privileges.

    Usage:
        @app.get("/reports")
        async def get_reports(user: dict = Depends(require_any_privilege("reports", "view_analytics"))):
            return {"user": user["email"]}
    """
    async def check_any_privilege(
        user: Dict[str, Any] = Depends(get_current_user)
    ) -> Dict[str, Any]:
        # Superadmins have all privileges
        if user.get("is_superadmin", False):
            return user

        user_privileges = set(user.get("privileges", []))
        required_privileges = set(privileges)

        if not user_privileges.intersection(required_privileges):
            raise AuthorizationError(
                detail=f"Requires one of: {', '.join(privileges)}",
                error_code="MISSING_PRIVILEGE"
            )

        return user

    return check_any_privilege


def require_all_privileges(*privileges: str) -> Callable:
    """
    Factory function requiring ALL specified privileges.

    Usage:
        @app.post("/admin/sensitive")
        async def sensitive_action(user: dict = Depends(require_all_privileges("admin", "audits"))):
            return {"user": user["email"]}
    """
    async def check_all_privileges(
        user: Dict[str, Any] = Depends(get_current_user)
    ) -> Dict[str, Any]:
        # Superadmins have all privileges
        if user.get("is_superadmin", False):
            return user

        user_privileges = set(user.get("privileges", []))
        required_privileges = set(privileges)

        missing = required_privileges - user_privileges

        if missing:
            raise AuthorizationError(
                detail=f"Missing privileges: {', '.join(missing)}",
                error_code="MISSING_PRIVILEGES"
            )

        return user

    return check_all_privileges


# ===========================================
# ROLE-BASED DEPENDENCIES
# ===========================================

def require_role(role: str) -> Callable:
    """
    Factory function requiring a specific role.

    Usage:
        @app.get("/manager/dashboard")
        async def manager_dashboard(user: dict = Depends(require_role("Store Manager"))):
            return {"manager": user["email"]}
    """
    async def check_role(
        user: Dict[str, Any] = Depends(get_current_user)
    ) -> Dict[str, Any]:
        # Superadmins can access any role
        if user.get("is_superadmin", False):
            return user

        user_role = user.get("role", "")

        if user_role != role:
            raise AuthorizationError(
                detail=f"Role '{role}' required",
                error_code="ROLE_REQUIRED"
            )

        return user

    return check_role


def require_any_role(*roles: str) -> Callable:
    """
    Factory function requiring ANY of the specified roles.

    Usage:
        @app.get("/staff/area")
        async def staff_area(user: dict = Depends(require_any_role("Manager", "Supervisor"))):
            return {"user": user["email"]}
    """
    async def check_any_role(
        user: Dict[str, Any] = Depends(get_current_user)
    ) -> Dict[str, Any]:
        # Superadmins can access any role
        if user.get("is_superadmin", False):
            return user

        user_role = user.get("role", "")

        if user_role not in roles:
            raise AuthorizationError(
                detail=f"Requires one of roles: {', '.join(roles)}",
                error_code="ROLE_REQUIRED"
            )

        return user

    return check_any_role


# ===========================================
# STORE-BASED DEPENDENCIES
# ===========================================

def require_same_store(user_email_param: str = "user_email") -> Callable:
    """
    Factory function requiring user to be from the same store as the target.
    Admins can access any store.

    Usage:
        @app.get("/users/{user_email}")
        async def get_user(
            user_email: str,
            current_user: dict = Depends(require_same_store("user_email"))
        ):
            return {"target": user_email}
    """
    async def check_same_store(
        user: Dict[str, Any] = Depends(get_current_user),
        db: Session = Depends(get_db),
        request: Request = None,
    ) -> Dict[str, Any]:
        # Admins can access any store
        if user.get("is_superadmin", False) or user.get("has_admin_access", False):
            return user

        # Get target user's store from path parameters
        # This is a simplified check - in practice, you'd query the DB
        target_email = request.path_params.get(user_email_param)

        if target_email:
            # Query target user's store
            from app.repositories.user_repository import UserRepository
            user_repo = UserRepository(db)
            target_user = user_repo.get_by_email(target_email)

            if target_user and target_user.store != user.get("store"):
                raise AuthorizationError(
                    detail="Cannot access users from other stores",
                    error_code="STORE_MISMATCH"
                )

        return user

    return check_same_store


# ===========================================
# SELF-LEARNING GATE DEPENDENCY
# ===========================================

async def require_self_learning_complete(
    user: Dict[str, Any] = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Require self-learning to be completed before accessing career progression.

    Usage:
        @app.get("/career-progression")
        async def career_path(user: dict = Depends(require_self_learning_complete)):
            return {"user": user["email"]}
    """
    # Admins bypass this check
    if user.get("is_superadmin", False) or user.get("has_admin_access", False):
        return user

    if not user.get("self_learning_completed", False):
        raise AuthorizationError(
            detail="Complete Self-Learning path to unlock Career Progression",
            error_code="SELF_LEARNING_INCOMPLETE"
        )

    return user


# ===========================================
# PAGINATION DEPENDENCIES
# ===========================================

class PaginationParams:
    """Pagination parameters for list endpoints."""

    def __init__(
        self,
        page: int = 1,
        per_page: int = 50,
        max_per_page: int = 100,
    ):
        self.page = max(1, page)
        self.per_page = min(max(1, per_page), max_per_page)
        self.offset = (self.page - 1) * self.per_page


def get_pagination(
    page: int = 1,
    per_page: int = 50,
) -> PaginationParams:
    """
    Dependency to get pagination parameters.

    Usage:
        @app.get("/items")
        async def list_items(pagination: PaginationParams = Depends(get_pagination)):
            return {"page": pagination.page, "per_page": pagination.per_page}
    """
    return PaginationParams(page=page, per_page=per_page)


# ===========================================
# REQUEST CONTEXT DEPENDENCIES
# ===========================================

async def get_client_ip(request: Request) -> str:
    """
    Get client IP address from request.
    Handles X-Forwarded-For header for proxied requests.

    Usage:
        @app.post("/audit")
        async def create_audit(ip: str = Depends(get_client_ip)):
            return {"ip": ip}
    """
    # Check for X-Forwarded-For header (common for proxies/load balancers)
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        # Get first IP in the list (client's original IP)
        return forwarded_for.split(",")[0].strip()

    # Fall back to direct client IP
    if request.client:
        return request.client.host

    return "unknown"


async def get_user_agent(request: Request) -> str:
    """
    Get user agent from request.

    Usage:
        @app.post("/audit")
        async def create_audit(user_agent: str = Depends(get_user_agent)):
            return {"user_agent": user_agent}
    """
    return request.headers.get("User-Agent", "unknown")
