"""
Custom Exception Classes for BW LMS Backend
Provides consistent error handling across the application
"""

from typing import Any, Dict, Optional
from fastapi import HTTPException, status


class AppException(HTTPException):
    """
    Base application exception.
    All custom exceptions should inherit from this.
    """

    def __init__(
        self,
        status_code: int,
        detail: str,
        error_code: Optional[str] = None,
        headers: Optional[Dict[str, str]] = None,
        data: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(status_code=status_code, detail=detail, headers=headers)
        self.error_code = error_code or f"ERR_{status_code}"
        self.data = data or {}


class AuthenticationError(AppException):
    """
    Raised when authentication fails.
    401 Unauthorized
    """

    def __init__(
        self,
        detail: str = "Authentication required",
        error_code: str = "AUTH_REQUIRED",
        headers: Optional[Dict[str, str]] = None,
    ):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail,
            error_code=error_code,
            headers=headers or {"WWW-Authenticate": "Bearer"},
        )


class InvalidTokenError(AuthenticationError):
    """Raised when token is invalid or expired."""

    def __init__(self, detail: str = "Invalid or expired token"):
        super().__init__(detail=detail, error_code="INVALID_TOKEN")


class TokenExpiredError(AuthenticationError):
    """Raised when token has expired."""

    def __init__(self, detail: str = "Token has expired"):
        super().__init__(detail=detail, error_code="TOKEN_EXPIRED")


class AuthorizationError(AppException):
    """
    Raised when user lacks permission.
    403 Forbidden
    """

    def __init__(
        self,
        detail: str = "Permission denied",
        error_code: str = "FORBIDDEN",
        required_privilege: Optional[str] = None,
    ):
        data = {}
        if required_privilege:
            data["required_privilege"] = required_privilege
            detail = f"Missing required privilege: {required_privilege}"

        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=detail,
            error_code=error_code,
            data=data,
        )


class NotFoundError(AppException):
    """
    Raised when resource is not found.
    404 Not Found
    """

    def __init__(
        self,
        resource: str = "Resource",
        resource_id: Optional[str] = None,
        detail: Optional[str] = None,
    ):
        if detail is None:
            if resource_id:
                detail = f"{resource} with id '{resource_id}' not found"
            else:
                detail = f"{resource} not found"

        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=detail,
            error_code="NOT_FOUND",
            data={"resource": resource, "resource_id": resource_id},
        )


class ValidationError(AppException):
    """
    Raised when validation fails.
    422 Unprocessable Entity
    """

    def __init__(
        self,
        detail: str = "Validation failed",
        errors: Optional[Dict[str, Any]] = None,
        field: Optional[str] = None,
    ):
        data = {}
        if errors:
            data["errors"] = errors
        if field:
            data["field"] = field
            detail = f"Validation failed for field '{field}': {detail}"

        super().__init__(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=detail,
            error_code="VALIDATION_ERROR",
            data=data,
        )


class ConflictError(AppException):
    """
    Raised when there's a conflict (e.g., duplicate resource).
    409 Conflict
    """

    def __init__(
        self,
        detail: str = "Resource already exists",
        resource: Optional[str] = None,
        field: Optional[str] = None,
    ):
        data = {}
        if resource:
            data["resource"] = resource
        if field:
            data["field"] = field
            detail = f"{resource or 'Resource'} with this {field} already exists"

        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            detail=detail,
            error_code="CONFLICT",
            data=data,
        )


class RateLimitError(AppException):
    """
    Raised when rate limit is exceeded.
    429 Too Many Requests
    """

    def __init__(
        self,
        detail: str = "Rate limit exceeded",
        retry_after: Optional[int] = None,
    ):
        headers = {}
        if retry_after:
            headers["Retry-After"] = str(retry_after)

        super().__init__(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=detail,
            error_code="RATE_LIMITED",
            headers=headers if headers else None,
            data={"retry_after": retry_after} if retry_after else {},
        )


class ExternalServiceError(AppException):
    """
    Raised when an external service fails.
    502 Bad Gateway
    """

    def __init__(
        self,
        service: str,
        detail: Optional[str] = None,
        original_error: Optional[str] = None,
    ):
        if detail is None:
            detail = f"External service '{service}' is unavailable"

        super().__init__(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=detail,
            error_code="EXTERNAL_SERVICE_ERROR",
            data={"service": service, "original_error": original_error},
        )


class FileUploadError(AppException):
    """
    Raised when file upload fails.
    400 Bad Request
    """

    def __init__(
        self,
        detail: str = "File upload failed",
        filename: Optional[str] = None,
        reason: Optional[str] = None,
    ):
        if reason:
            detail = f"File upload failed: {reason}"

        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=detail,
            error_code="FILE_UPLOAD_ERROR",
            data={"filename": filename, "reason": reason},
        )


class FileTooLargeError(FileUploadError):
    """Raised when file exceeds size limit."""

    def __init__(self, filename: str, max_size_mb: int):
        super().__init__(
            detail=f"File '{filename}' exceeds maximum size of {max_size_mb}MB",
            filename=filename,
            reason="file_too_large",
        )


class InvalidFileTypeError(FileUploadError):
    """Raised when file type is not allowed."""

    def __init__(self, filename: str, allowed_types: list):
        super().__init__(
            detail=f"File type not allowed. Allowed types: {', '.join(allowed_types)}",
            filename=filename,
            reason="invalid_file_type",
        )


class DatabaseError(AppException):
    """
    Raised when database operation fails.
    500 Internal Server Error
    """

    def __init__(
        self,
        detail: str = "Database operation failed",
        operation: Optional[str] = None,
    ):
        super().__init__(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=detail,
            error_code="DATABASE_ERROR",
            data={"operation": operation},
        )


class BusinessLogicError(AppException):
    """
    Raised when business logic validation fails.
    400 Bad Request
    """

    def __init__(
        self,
        detail: str,
        error_code: str = "BUSINESS_LOGIC_ERROR",
        data: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=detail,
            error_code=error_code,
            data=data,
        )
