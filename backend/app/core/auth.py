"""
Authentication Utilities for Emirates LMS Backend
JWT token management with refresh token rotation and blacklisting
"""

import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, Set

import jwt

from app.config.settings import settings

logger = logging.getLogger(__name__)

# ===========================================
# TOKEN BLACKLIST (In-memory - use Redis in production)
# ===========================================

# In-memory token blacklist (for logout functionality)
# In production, this should be stored in Redis for persistence across restarts
_token_blacklist: Set[str] = set()

# Maximum size of blacklist before cleanup
_BLACKLIST_MAX_SIZE = 10000


def add_to_blacklist(token: str) -> None:
    """
    Add a token to the blacklist.

    Args:
        token: JWT token to blacklist
    """
    global _token_blacklist

    # Cleanup if blacklist is too large
    if len(_token_blacklist) > _BLACKLIST_MAX_SIZE:
        _cleanup_blacklist()

    _token_blacklist.add(token)
    logger.debug(f"Token added to blacklist. Total blacklisted: {len(_token_blacklist)}")


def is_blacklisted(token: str) -> bool:
    """
    Check if a token is blacklisted.

    Args:
        token: JWT token to check

    Returns:
        True if token is blacklisted
    """
    return token in _token_blacklist


def _cleanup_blacklist() -> None:
    """
    Remove expired tokens from blacklist.
    Called automatically when blacklist grows too large.
    """
    global _token_blacklist

    valid_tokens = set()
    for token in _token_blacklist:
        payload = decode_token(token)
        if payload is not None:  # Token is still valid (not expired)
            valid_tokens.add(token)

    _token_blacklist = valid_tokens
    logger.info(f"Blacklist cleanup complete. Remaining tokens: {len(_token_blacklist)}")


# ===========================================
# JWT TOKEN MANAGEMENT
# ===========================================

def create_access_token(
    data: Dict[str, Any],
    expires_delta: Optional[timedelta] = None
) -> str:
    """
    Create a JWT access token.

    Args:
        data: Dictionary containing user data (email, role, privileges, etc.)
        expires_delta: Optional custom expiration time

    Returns:
        JWT token string
    """
    to_encode = data.copy()

    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(hours=settings.JWT_EXPIRATION_HOURS)

    to_encode.update({
        "exp": expire,
        "iat": datetime.utcnow(),
        "type": "access"
    })

    encoded_jwt = jwt.encode(
        to_encode,
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM
    )

    return encoded_jwt


def create_refresh_token(
    email: str,
    token_family: Optional[str] = None
) -> str:
    """
    Create a JWT refresh token with token family for rotation.

    Args:
        email: User's email address
        token_family: Token family ID for rotation tracking

    Returns:
        JWT refresh token string
    """
    import uuid

    expire = datetime.utcnow() + timedelta(days=settings.JWT_REFRESH_EXPIRATION_DAYS)

    # Generate token family if not provided (new login)
    if token_family is None:
        token_family = str(uuid.uuid4())

    to_encode = {
        "email": email,
        "exp": expire,
        "iat": datetime.utcnow(),
        "type": "refresh",
        "family": token_family,  # For token rotation
    }

    encoded_jwt = jwt.encode(
        to_encode,
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM
    )

    return encoded_jwt


def decode_token(token: str) -> Optional[Dict[str, Any]]:
    """
    Decode and validate a JWT token without type checking.

    Args:
        token: JWT token string

    Returns:
        Decoded token payload or None if invalid
    """
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM]
        )
        return payload
    except jwt.ExpiredSignatureError:
        logger.debug("Token expired")
        return None
    except jwt.InvalidTokenError as e:
        logger.debug(f"Invalid token: {e}")
        return None


def verify_token(
    token: str,
    token_type: str = "access",
    check_blacklist: bool = True
) -> Optional[Dict[str, Any]]:
    """
    Verify a JWT token with type and blacklist checking.

    Args:
        token: JWT token string
        token_type: Expected token type ("access" or "refresh")
        check_blacklist: Whether to check if token is blacklisted

    Returns:
        Decoded token payload or None if invalid
    """
    # Check blacklist first
    if check_blacklist and is_blacklisted(token):
        logger.warning(f"Token is blacklisted (first 20 chars): {token[:20]}...")
        return None

    # Decode and validate
    payload = decode_token(token)

    if payload is None:
        logger.warning(f"Token decode failed (expired or invalid) - first 20 chars: {token[:20]}...")
        return None

    # Check token type
    if payload.get("type") != token_type:
        logger.warning(f"Token type mismatch: expected {token_type}, got {payload.get('type')} - first 20 chars: {token[:20]}...")
        return None

    logger.debug(f"Token verified successfully: type={token_type}, email={payload.get('email')}")
    return payload


def rotate_refresh_token(old_refresh_token: str) -> Optional[Dict[str, str]]:
    """
    Rotate a refresh token (issue new access + refresh tokens).
    Implements refresh token rotation for security.

    Args:
        old_refresh_token: Current refresh token

    Returns:
        Dictionary with new tokens or None if rotation fails
    """
    # Verify the old refresh token
    payload = verify_token(old_refresh_token, token_type="refresh")

    if payload is None:
        return None

    email = payload.get("email")
    token_family = payload.get("family")

    if not email:
        return None

    # Blacklist the old refresh token
    add_to_blacklist(old_refresh_token)

    # Create new tokens with same family
    access_token = create_access_token({"email": email})
    refresh_token = create_refresh_token(email, token_family=token_family)

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
    }


# ===========================================
# UTILITY FUNCTIONS
# ===========================================

def generate_user_token_data(user_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate the data payload for a user's JWT token.
    Extracts relevant user fields for the token.

    Args:
        user_data: Full user data dictionary

    Returns:
        Token payload dictionary
    """
    return {
        "email": user_data.get("email"),
        "name": user_data.get("name"),
        "role": user_data.get("role"),
        "category": user_data.get("category"),
        "store": user_data.get("store"),
        "is_superadmin": user_data.get("is_superadmin", False),
        "has_admin_access": user_data.get("has_admin_access", False),
        "privileges": user_data.get("privileges", []),
        "self_learning_completed": user_data.get("self_learning_completed", False),
    }


def get_token_expiration(token: str) -> Optional[datetime]:
    """
    Get the expiration time of a token.

    Args:
        token: JWT token string

    Returns:
        Expiration datetime or None if invalid
    """
    payload = decode_token(token)
    if payload is None:
        return None

    exp = payload.get("exp")
    if exp is None:
        return None

    return datetime.fromtimestamp(exp)


def get_token_remaining_time(token: str) -> Optional[timedelta]:
    """
    Get remaining valid time for a token.

    Args:
        token: JWT token string

    Returns:
        Remaining time as timedelta or None if expired/invalid
    """
    expiration = get_token_expiration(token)
    if expiration is None:
        return None

    remaining = expiration - datetime.utcnow()

    if remaining.total_seconds() <= 0:
        return None

    return remaining


def invalidate_user_tokens(email: str) -> None:
    """
    Invalidate all tokens for a user (e.g., on password change).
    Note: This is a placeholder - full implementation requires
    tracking all issued tokens per user (Redis recommended).

    Args:
        email: User's email address
    """
    # In a full implementation, you would:
    # 1. Store issued tokens per user in Redis
    # 2. Add all user's tokens to blacklist
    # 3. Update user's "tokens_valid_after" timestamp in DB
    logger.info(f"Invalidating all tokens for user: {email}")
    # TODO: Implement full token invalidation with Redis


def extract_token_from_header(authorization: str) -> Optional[str]:
    """
    Extract JWT token from Authorization header.

    Args:
        authorization: Authorization header value

    Returns:
        Token string or None if not found
    """
    if not authorization:
        return None

    parts = authorization.split()

    if len(parts) != 2:
        return None

    if parts[0].lower() != "bearer":
        return None

    return parts[1]
