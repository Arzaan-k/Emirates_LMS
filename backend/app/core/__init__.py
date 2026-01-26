"""
Core module for BW LMS Backend
Contains security, authentication, dependencies, and middleware
"""

from app.core.security import (
    hash_password,
    verify_password,
    is_password_hashed,
    sanitize_string,
    sanitize_filename,
    validate_email,
    validate_password_strength,
    validate_file_extension,
    get_file_type,
)

from app.core.auth import (
    create_access_token,
    create_refresh_token,
    decode_token,
    verify_token,
    generate_user_token_data,
)

from app.core.dependencies import (
    get_current_user,
    get_current_user_optional,
    require_auth,
    require_admin,
    require_privilege,
)

from app.core.exceptions import (
    AppException,
    AuthenticationError,
    AuthorizationError,
    NotFoundError,
    ValidationError,
    ConflictError,
    RateLimitError,
    ExternalServiceError,
)

__all__ = [
    # Security
    "hash_password",
    "verify_password",
    "is_password_hashed",
    "sanitize_string",
    "sanitize_filename",
    "validate_email",
    "validate_password_strength",
    "validate_file_extension",
    "get_file_type",
    # Auth
    "create_access_token",
    "create_refresh_token",
    "decode_token",
    "verify_token",
    "generate_user_token_data",
    # Dependencies
    "get_current_user",
    "get_current_user_optional",
    "require_auth",
    "require_admin",
    "require_privilege",
    # Exceptions
    "AppException",
    "AuthenticationError",
    "AuthorizationError",
    "NotFoundError",
    "ValidationError",
    "ConflictError",
    "RateLimitError",
    "ExternalServiceError",
]
