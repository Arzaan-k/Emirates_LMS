"""
Authentication Utilities for LMS Backend
Handles JWT tokens, password hashing, and user authentication
"""

import os
import bcrypt
import jwt
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from fastapi import HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

# JWT Configuration
JWT_SECRET = os.environ.get("JWT_SECRET", "your-super-secret-key-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = int(os.environ.get("JWT_EXPIRATION_HOURS", "24"))
JWT_REFRESH_EXPIRATION_DAYS = int(os.environ.get("JWT_REFRESH_EXPIRATION_DAYS", "7"))

# Security scheme for FastAPI
security = HTTPBearer(auto_error=False)


# ==========================================
# PASSWORD HASHING
# ==========================================

def hash_password(password: str) -> str:
    """
    Hash a password using bcrypt.
    Returns the hashed password as a string.
    """
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a password against its hash.
    Returns True if password matches, False otherwise.
    """
    try:
        return bcrypt.checkpw(
            plain_password.encode('utf-8'),
            hashed_password.encode('utf-8')
        )
    except Exception:
        return False


def is_password_hashed(password: str) -> bool:
    """
    Check if a password is already hashed (bcrypt format).
    Bcrypt hashes start with $2a$, $2b$, or $2y$
    """
    return password.startswith(('$2a$', '$2b$', '$2y$'))


# ==========================================
# JWT TOKEN MANAGEMENT
# ==========================================

def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
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
        expire = datetime.utcnow() + timedelta(hours=JWT_EXPIRATION_HOURS)

    to_encode.update({
        "exp": expire,
        "iat": datetime.utcnow(),
        "type": "access"
    })

    encoded_jwt = jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return encoded_jwt


def create_refresh_token(email: str) -> str:
    """
    Create a JWT refresh token (longer-lived, used to get new access tokens).

    Args:
        email: User's email address

    Returns:
        JWT refresh token string
    """
    expire = datetime.utcnow() + timedelta(days=JWT_REFRESH_EXPIRATION_DAYS)

    to_encode = {
        "email": email,
        "exp": expire,
        "iat": datetime.utcnow(),
        "type": "refresh"
    }

    encoded_jwt = jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return encoded_jwt


def decode_token(token: str) -> Optional[Dict[str, Any]]:
    """
    Decode and validate a JWT token.

    Args:
        token: JWT token string

    Returns:
        Decoded token payload or None if invalid
    """
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def verify_token(token: str, token_type: str = "access") -> Optional[Dict[str, Any]]:
    """
    Verify a JWT token and check its type.

    Args:
        token: JWT token string
        token_type: Expected token type ("access" or "refresh")

    Returns:
        Decoded token payload or None if invalid
    """
    payload = decode_token(token)

    if payload is None:
        return None

    if payload.get("type") != token_type:
        return None

    return payload


# ==========================================
# FASTAPI DEPENDENCIES
# ==========================================

async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Optional[Dict[str, Any]]:
    """
    FastAPI dependency to get the current authenticated user.
    Returns None if no valid token provided.

    Usage:
        @app.get("/protected")
        async def protected_route(user: dict = Depends(get_current_user)):
            if not user:
                raise HTTPException(status_code=401, detail="Not authenticated")
            return {"email": user["email"]}
    """
    if credentials is None:
        return None

    token = credentials.credentials
    payload = verify_token(token, "access")

    return payload


async def require_auth(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Dict[str, Any]:
    """
    FastAPI dependency that REQUIRES authentication.
    Raises 401 if not authenticated.

    Usage:
        @app.get("/protected")
        async def protected_route(user: dict = Depends(require_auth)):
            return {"email": user["email"]}
    """
    if credentials is None:
        raise HTTPException(
            status_code=401,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"}
        )

    token = credentials.credentials
    payload = verify_token(token, "access")

    if payload is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"}
        )

    return payload


async def require_admin(user: Dict[str, Any] = Depends(require_auth)) -> Dict[str, Any]:
    """
    FastAPI dependency that requires admin privileges.
    Raises 403 if user is not an admin.

    Usage:
        @app.post("/admin/users")
        async def admin_route(user: dict = Depends(require_admin)):
            return {"admin": user["email"]}
    """
    if not user.get("is_superadmin", False) and not user.get("has_admin_access", False):
        raise HTTPException(
            status_code=403,
            detail="Admin access required"
        )

    return user


def require_privilege(privilege: str):
    """
    Factory function to create a dependency that checks for a specific privilege.

    Usage:
        @app.post("/users/create")
        async def create_user(user: dict = Depends(require_privilege("create_user"))):
            return {"created_by": user["email"]}
    """
    async def check_privilege(user: Dict[str, Any] = Depends(require_auth)) -> Dict[str, Any]:
        # Superadmins have all privileges
        if user.get("is_superadmin", False):
            return user

        privileges = user.get("privileges", [])
        if privilege not in privileges:
            raise HTTPException(
                status_code=403,
                detail=f"Missing required privilege: {privilege}"
            )

        return user

    return check_privilege


# ==========================================
# UTILITY FUNCTIONS
# ==========================================

def get_token_from_request(request: Request) -> Optional[str]:
    """
    Extract JWT token from request headers or query params.
    Supports both Authorization header and token query param (for WebSocket).
    """
    # Try Authorization header first
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:]

    # Try query parameter (for WebSocket connections)
    token = request.query_params.get("token")
    if token:
        return token

    return None


def generate_user_token_data(user_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate the data payload for a user's JWT token.
    Extracts relevant user fields for the token.
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
    }
