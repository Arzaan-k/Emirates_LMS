"""
Security Middleware and Utilities for LMS Backend
Handles rate limiting, input validation, and security headers
"""

import os
import re
import logging
from typing import List, Optional, Callable
from datetime import datetime
from functools import wraps

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("BW_LMS_Security")

# ==========================================
# RATE LIMITING CONFIGURATION
# ==========================================

# Get rate limit settings from environment
DEFAULT_RATE_LIMIT = os.environ.get("RATE_LIMIT_DEFAULT", "100/minute")
LOGIN_RATE_LIMIT = os.environ.get("RATE_LIMIT_LOGIN", "5/minute")
REGISTER_RATE_LIMIT = os.environ.get("RATE_LIMIT_REGISTER", "10/hour")
AI_RATE_LIMIT = os.environ.get("RATE_LIMIT_AI", "20/minute")
UPLOAD_RATE_LIMIT = os.environ.get("RATE_LIMIT_UPLOAD", "10/minute")

# Create rate limiter instance
limiter = Limiter(key_func=get_remote_address)


def setup_rate_limiting(app: FastAPI):
    """
    Configure rate limiting for the FastAPI application.

    Usage:
        from security import setup_rate_limiting
        setup_rate_limiting(app)
    """
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# ==========================================
# CORS CONFIGURATION
# ==========================================

def get_allowed_origins() -> List[str]:
    """
    Get allowed CORS origins from environment variable.
    Returns list of allowed origins or ["*"] for development.
    """
    origins_str = os.environ.get("ALLOWED_ORIGINS", "")

    if not origins_str:
        # Development mode - allow all (with warning)
        env = os.environ.get("ENVIRONMENT", "development")
        if env == "production":
            logger.warning("ALLOWED_ORIGINS not set in production! Using restrictive default.")
            return ["https://yourdomain.com"]
        return ["*"]

    # Parse comma-separated origins
    origins = [origin.strip() for origin in origins_str.split(",")]
    return origins


# ==========================================
# INPUT VALIDATION
# ==========================================

# Regex patterns for validation
EMAIL_PATTERN = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
FILENAME_PATTERN = re.compile(r'^[a-zA-Z0-9_\-. ]+$')
UUID_PATTERN = re.compile(r'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$', re.IGNORECASE)

# Dangerous characters to strip from inputs
DANGEROUS_CHARS = ['<', '>', '"', "'", '\\', '\0', '\n', '\r']

# File upload settings
MAX_FILE_SIZE_MB = int(os.environ.get("MAX_FILE_SIZE_MB", "100"))
MAX_VIDEO_SIZE_MB = int(os.environ.get("MAX_VIDEO_SIZE_MB", "500"))
ALLOWED_FILE_EXTENSIONS = {
    '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx',
    '.mp4', '.mov', '.avi', '.mkv', '.webm',
    '.mp3', '.wav', '.m4a',
    '.jpg', '.jpeg', '.png', '.gif', '.webp',
    '.csv', '.txt'
}
ALLOWED_IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp'}
ALLOWED_VIDEO_EXTENSIONS = {'.mp4', '.mov', '.avi', '.mkv', '.webm'}
ALLOWED_AUDIO_EXTENSIONS = {'.mp3', '.wav', '.m4a'}


def sanitize_string(value: str, max_length: int = 1000) -> str:
    """
    Sanitize a string input by removing dangerous characters and limiting length.
    """
    if not value:
        return ""

    # Truncate to max length
    value = value[:max_length]

    # Remove dangerous characters
    for char in DANGEROUS_CHARS:
        value = value.replace(char, '')

    # Strip whitespace
    value = value.strip()

    return value


def validate_email(email: str) -> bool:
    """Validate email format."""
    if not email or len(email) > 255:
        return False
    return bool(EMAIL_PATTERN.match(email))


def validate_filename(filename: str) -> bool:
    """Validate filename format (no path traversal, safe characters only)."""
    if not filename or len(filename) > 255:
        return False

    # Check for path traversal attempts
    if '..' in filename or '/' in filename or '\\' in filename:
        return False

    return bool(FILENAME_PATTERN.match(filename))


def validate_uuid(uuid_str: str) -> bool:
    """Validate UUID format."""
    if not uuid_str:
        return False
    return bool(UUID_PATTERN.match(uuid_str))


def sanitize_filename(filename: str) -> str:
    """
    Sanitize a filename to be safe for file system storage.
    Removes path components and dangerous characters.
    """
    if not filename:
        return "unnamed_file"

    # Remove path separators
    filename = filename.replace('/', '_').replace('\\', '_')

    # Remove dangerous characters
    filename = re.sub(r'[<>:"|?*\x00-\x1f]', '_', filename)

    # Remove leading/trailing dots and spaces
    filename = filename.strip('. ')

    # Limit length
    if len(filename) > 200:
        name, ext = os.path.splitext(filename)
        filename = name[:200-len(ext)] + ext

    return filename or "unnamed_file"


def validate_file_extension(filename: str, allowed: set = None) -> bool:
    """
    Validate file extension against allowed list.
    """
    if allowed is None:
        allowed = ALLOWED_FILE_EXTENSIONS

    ext = os.path.splitext(filename)[1].lower()
    return ext in allowed


def get_file_type(filename: str) -> str:
    """
    Determine file type from extension.
    Returns: 'video', 'audio', 'image', 'document', or 'unknown'
    """
    ext = os.path.splitext(filename)[1].lower()

    if ext in ALLOWED_VIDEO_EXTENSIONS:
        return 'video'
    elif ext in ALLOWED_AUDIO_EXTENSIONS:
        return 'audio'
    elif ext in ALLOWED_IMAGE_EXTENSIONS:
        return 'image'
    elif ext in {'.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.txt'}:
        return 'document'
    else:
        return 'unknown'


# ==========================================
# SECURITY MIDDLEWARE
# ==========================================

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Middleware to add security headers to all responses.
    """

    async def dispatch(self, request: Request, call_next: Callable):
        response = await call_next(request)

        # Security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # Remove server header
        if "server" in response.headers:
            del response.headers["server"]

        # HSTS for HTTPS (only in production)
        if os.environ.get("ENVIRONMENT") == "production":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

        return response


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """
    Middleware to log all requests with timing information.
    """

    async def dispatch(self, request: Request, call_next: Callable):
        start_time = datetime.now()

        # Generate request ID
        request_id = request.headers.get("X-Request-ID", str(hash(start_time))[:8])

        # Log request
        logger.info(f"[{request_id}] {request.method} {request.url.path}")

        try:
            response = await call_next(request)

            # Calculate duration
            duration = (datetime.now() - start_time).total_seconds() * 1000

            # Log response
            logger.info(f"[{request_id}] {response.status_code} ({duration:.2f}ms)")

            # Add request ID to response
            response.headers["X-Request-ID"] = request_id

            return response

        except Exception as e:
            duration = (datetime.now() - start_time).total_seconds() * 1000
            logger.error(f"[{request_id}] Error after {duration:.2f}ms: {str(e)}")
            raise


# ==========================================
# PASSWORD VALIDATION
# ==========================================

def validate_password_strength(password: str) -> tuple[bool, str]:
    """
    Validate password strength.
    Returns (is_valid, error_message)
    """
    if len(password) < 8:
        return False, "Password must be at least 8 characters long"

    if len(password) > 128:
        return False, "Password must be less than 128 characters"

    if not re.search(r'[A-Z]', password):
        return False, "Password must contain at least one uppercase letter"

    if not re.search(r'[a-z]', password):
        return False, "Password must contain at least one lowercase letter"

    if not re.search(r'\d', password):
        return False, "Password must contain at least one digit"

    # Check for common weak passwords
    weak_passwords = {'password', 'password123', '12345678', 'qwerty123', 'admin123'}
    if password.lower() in weak_passwords:
        return False, "Password is too common. Please choose a stronger password"

    return True, ""


# ==========================================
# SETUP FUNCTION
# ==========================================

def setup_security(app: FastAPI):
    """
    Configure all security features for the FastAPI application.

    Usage:
        from security import setup_security
        setup_security(app)
    """
    # Add security middlewares
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(RequestLoggingMiddleware)

    # Setup rate limiting
    setup_rate_limiting(app)

    logger.info("Security middleware configured successfully")
