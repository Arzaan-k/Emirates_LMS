"""
Security Utilities for BW LMS Backend
Password hashing, input validation, sanitization, and file validation
"""

import re
import os
import hashlib
import logging
from typing import Optional, List, Tuple
from pathlib import Path

import bcrypt

from app.config.settings import settings

logger = logging.getLogger(__name__)

# ===========================================
# PASSWORD HASHING
# ===========================================

def hash_password(password: str) -> str:
    """
    Hash a password using bcrypt with 12 rounds.
    Returns the hashed password as a string.

    Args:
        password: Plain text password

    Returns:
        Hashed password string
    """
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a password against its hash.
    Returns True if password matches, False otherwise.

    Args:
        plain_password: Plain text password to verify
        hashed_password: Bcrypt hashed password

    Returns:
        True if password matches, False otherwise
    """
    try:
        return bcrypt.checkpw(
            plain_password.encode('utf-8'),
            hashed_password.encode('utf-8')
        )
    except Exception as e:
        logger.warning(f"Password verification error: {e}")
        return False


def is_password_hashed(password: str) -> bool:
    """
    Check if a password is already hashed (bcrypt format).
    Bcrypt hashes start with $2a$, $2b$, or $2y$

    Args:
        password: Password string to check

    Returns:
        True if password appears to be bcrypt hashed
    """
    return password.startswith(('$2a$', '$2b$', '$2y$'))


# ===========================================
# INPUT VALIDATION
# ===========================================

# Email validation pattern (RFC 5322 compliant)
EMAIL_PATTERN = re.compile(
    r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
)

# Username pattern (alphanumeric, dots, underscores)
USERNAME_PATTERN = re.compile(
    r'^[a-zA-Z0-9._-]+$'
)

# Password requirements
PASSWORD_MIN_LENGTH = 8
PASSWORD_REQUIRE_UPPERCASE = True
PASSWORD_REQUIRE_LOWERCASE = True
PASSWORD_REQUIRE_DIGIT = True
PASSWORD_REQUIRE_SPECIAL = False  # Optional

# Dangerous characters to sanitize
DANGEROUS_CHARS = ['<', '>', '"', "'", '&', '\x00', '\n', '\r']


def validate_email(email: str) -> Tuple[bool, Optional[str]]:
    """
    Validate email format.

    Args:
        email: Email address to validate

    Returns:
        Tuple of (is_valid, error_message)
    """
    if not email:
        return False, "Email is required"

    if len(email) > 255:
        return False, "Email is too long (max 255 characters)"

    if not EMAIL_PATTERN.match(email):
        return False, "Invalid email format"

    return True, None


def validate_password_strength(password: str) -> Tuple[bool, Optional[str]]:
    """
    Validate password strength.

    Args:
        password: Password to validate

    Returns:
        Tuple of (is_valid, error_message)
    """
    if not password:
        return False, "Password is required"

    if len(password) < PASSWORD_MIN_LENGTH:
        return False, f"Password must be at least {PASSWORD_MIN_LENGTH} characters"

    if len(password) > 128:
        return False, "Password is too long (max 128 characters)"

    if PASSWORD_REQUIRE_UPPERCASE and not re.search(r'[A-Z]', password):
        return False, "Password must contain at least one uppercase letter"

    if PASSWORD_REQUIRE_LOWERCASE and not re.search(r'[a-z]', password):
        return False, "Password must contain at least one lowercase letter"

    if PASSWORD_REQUIRE_DIGIT and not re.search(r'\d', password):
        return False, "Password must contain at least one digit"

    if PASSWORD_REQUIRE_SPECIAL and not re.search(r'[!@#$%^&*(),.?":{}|<>]', password):
        return False, "Password must contain at least one special character"

    return True, None


def validate_username(username: str) -> Tuple[bool, Optional[str]]:
    """
    Validate username format.

    Args:
        username: Username to validate

    Returns:
        Tuple of (is_valid, error_message)
    """
    if not username:
        return False, "Username is required"

    if len(username) < 3:
        return False, "Username must be at least 3 characters"

    if len(username) > 50:
        return False, "Username is too long (max 50 characters)"

    if not USERNAME_PATTERN.match(username):
        return False, "Username can only contain letters, numbers, dots, underscores, and hyphens"

    return True, None


# ===========================================
# STRING SANITIZATION
# ===========================================

def sanitize_string(text: str, max_length: int = 1000) -> str:
    """
    Sanitize a string by removing dangerous characters.
    Prevents XSS and injection attacks.

    Args:
        text: String to sanitize
        max_length: Maximum allowed length

    Returns:
        Sanitized string
    """
    if not text:
        return ""

    # Truncate to max length
    text = text[:max_length]

    # Remove null bytes
    text = text.replace('\x00', '')

    # HTML escape dangerous characters
    text = (
        text
        .replace('&', '&amp;')
        .replace('<', '&lt;')
        .replace('>', '&gt;')
        .replace('"', '&quot;')
        .replace("'", '&#x27;')
    )

    return text.strip()


def sanitize_html(html: str, max_length: int = 10000) -> str:
    """
    Sanitize HTML content (basic implementation).
    For production, consider using bleach or similar library.

    Args:
        html: HTML string to sanitize
        max_length: Maximum allowed length

    Returns:
        Sanitized HTML string
    """
    if not html:
        return ""

    # Truncate
    html = html[:max_length]

    # Remove script tags
    html = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL | re.IGNORECASE)

    # Remove event handlers
    html = re.sub(r'\s*on\w+\s*=\s*["\'][^"\']*["\']', '', html, flags=re.IGNORECASE)

    # Remove javascript: URLs
    html = re.sub(r'javascript:', '', html, flags=re.IGNORECASE)

    return html.strip()


# ===========================================
# FILENAME SANITIZATION
# ===========================================

def sanitize_filename(filename: str) -> str:
    """
    Sanitize a filename to prevent path traversal and other attacks.

    Args:
        filename: Original filename

    Returns:
        Safe filename
    """
    if not filename:
        return "unnamed"

    # Get just the filename, not the path
    filename = os.path.basename(filename)

    # Remove null bytes and path separators
    filename = filename.replace('\x00', '').replace('/', '').replace('\\', '')

    # Replace dangerous characters with underscore
    dangerous_chars = ['<', '>', ':', '"', '|', '?', '*', '\n', '\r', '\t']
    for char in dangerous_chars:
        filename = filename.replace(char, '_')

    # Remove leading/trailing dots and spaces
    filename = filename.strip('. ')

    # Limit length
    if len(filename) > 255:
        name, ext = os.path.splitext(filename)
        filename = name[:255 - len(ext)] + ext

    # If filename is empty after sanitization, use default
    if not filename:
        filename = "unnamed"

    return filename


def generate_unique_filename(original_filename: str) -> str:
    """
    Generate a unique filename using hash.

    Args:
        original_filename: Original filename

    Returns:
        Unique filename with timestamp hash
    """
    import uuid
    from datetime import datetime

    sanitized = sanitize_filename(original_filename)
    name, ext = os.path.splitext(sanitized)

    # Generate unique prefix
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    unique_id = str(uuid.uuid4())[:8]

    return f"{timestamp}_{unique_id}_{name}{ext}"


# ===========================================
# FILE VALIDATION
# ===========================================

# MIME type mapping
MIME_TYPES = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.mp4': 'video/mp4',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.txt': 'text/plain',
    '.csv': 'text/csv',
    '.json': 'application/json',
}


def validate_file_extension(filename: str, allowed_extensions: Optional[List[str]] = None) -> Tuple[bool, Optional[str]]:
    """
    Validate file extension against allowed list.

    Args:
        filename: Filename to validate
        allowed_extensions: List of allowed extensions (with dots)

    Returns:
        Tuple of (is_valid, error_message)
    """
    if not filename:
        return False, "Filename is required"

    if allowed_extensions is None:
        allowed_extensions = settings.ALLOWED_EXTENSIONS

    ext = os.path.splitext(filename)[1].lower()

    if not ext:
        return False, "File must have an extension"

    if ext not in allowed_extensions:
        return False, f"File type '{ext}' not allowed. Allowed types: {', '.join(allowed_extensions)}"

    return True, None


def get_file_type(filename: str) -> str:
    """
    Get the general file type category.

    Args:
        filename: Filename to check

    Returns:
        File type category (video, audio, image, document, other)
    """
    ext = os.path.splitext(filename)[1].lower()

    video_exts = ['.mp4', '.webm', '.mov', '.avi', '.mkv']
    audio_exts = ['.mp3', '.wav', '.ogg', '.m4a', '.flac']
    image_exts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg']
    document_exts = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv']

    if ext in video_exts:
        return 'video'
    elif ext in audio_exts:
        return 'audio'
    elif ext in image_exts:
        return 'image'
    elif ext in document_exts:
        return 'document'
    else:
        return 'other'


def get_mime_type(filename: str) -> str:
    """
    Get MIME type for a filename.

    Args:
        filename: Filename to check

    Returns:
        MIME type string
    """
    ext = os.path.splitext(filename)[1].lower()
    return MIME_TYPES.get(ext, 'application/octet-stream')


def validate_file_size(file_size: int, is_video: bool = False) -> Tuple[bool, Optional[str]]:
    """
    Validate file size against limits.

    Args:
        file_size: File size in bytes
        is_video: Whether the file is a video (higher limit)

    Returns:
        Tuple of (is_valid, error_message)
    """
    max_size = settings.max_video_size_bytes if is_video else settings.max_file_size_bytes
    max_size_mb = settings.MAX_VIDEO_SIZE_MB if is_video else settings.MAX_FILE_SIZE_MB

    if file_size > max_size:
        return False, f"File size exceeds maximum of {max_size_mb}MB"

    return True, None


# ===========================================
# CONTENT SECURITY
# ===========================================

def generate_content_hash(content: bytes) -> str:
    """
    Generate SHA-256 hash of content.
    Useful for detecting duplicate uploads and integrity verification.

    Args:
        content: File content as bytes

    Returns:
        Hex digest of SHA-256 hash
    """
    return hashlib.sha256(content).hexdigest()


def verify_content_hash(content: bytes, expected_hash: str) -> bool:
    """
    Verify content matches expected hash.

    Args:
        content: File content as bytes
        expected_hash: Expected SHA-256 hash

    Returns:
        True if hashes match
    """
    return generate_content_hash(content) == expected_hash
