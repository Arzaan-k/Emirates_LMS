"""
Base Pydantic Schemas
Common schema classes and utilities
"""

from typing import Any, Dict, Generic, List, Optional, TypeVar
from datetime import datetime
from pydantic import BaseModel, ConfigDict


# Generic type for paginated responses
T = TypeVar('T')


class BaseSchema(BaseModel):
    """
    Base schema with common configuration.
    All schemas should inherit from this.
    """
    model_config = ConfigDict(
        from_attributes=True,  # Allow ORM model conversion
        populate_by_name=True,  # Allow population by field name or alias
        str_strip_whitespace=True,  # Strip whitespace from strings
    )


class PaginatedResponse(BaseSchema, Generic[T]):
    """
    Generic paginated response schema.
    Use for any list endpoint that supports pagination.
    """
    items: List[T]
    total: int
    page: int
    per_page: int
    total_pages: int
    has_next: bool
    has_prev: bool

    @classmethod
    def create(
        cls,
        items: List[T],
        total: int,
        page: int,
        per_page: int,
    ) -> "PaginatedResponse[T]":
        """Helper to create a paginated response."""
        total_pages = (total + per_page - 1) // per_page if per_page > 0 else 0
        return cls(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=total_pages,
            has_next=page < total_pages,
            has_prev=page > 1,
        )


class MessageResponse(BaseSchema):
    """Simple message response."""
    message: str
    success: bool = True


class SuccessResponse(BaseSchema):
    """Generic success response with optional data."""
    success: bool = True
    message: Optional[str] = None
    data: Optional[Dict[str, Any]] = None


class ErrorResponse(BaseSchema):
    """Error response schema."""
    error: str
    message: str
    details: Optional[Dict[str, Any]] = None
    request_id: Optional[str] = None


class TimestampMixin(BaseSchema):
    """Mixin for schemas that include timestamps."""
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class IDMixin(BaseSchema):
    """Mixin for schemas that include an ID."""
    id: str


class AuditMixin(BaseSchema):
    """Mixin for schemas that include audit fields."""
    created_by: Optional[str] = None
    updated_by: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
