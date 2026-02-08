"""
User Schemas
Pydantic models for user-related API operations
"""

from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.base import BaseSchema, PaginatedResponse


class UserBase(BaseSchema):
    """Base user schema with common fields."""
    email: str = Field(..., min_length=1, max_length=255)
    name: str = Field(..., min_length=1, max_length=255)
    role: str = Field(default="Waffler", max_length=100)
    category: str = Field(default="Employee", max_length=100)
    store: str = Field(default="Unassigned", max_length=255)
    profile_data: Optional[Dict[str, Any]] = None


class UserCreate(UserBase):
    """Schema for creating a new user."""
    password: str = Field(..., min_length=6, max_length=128)
    privileges: List[str] = Field(default=[])
    is_superadmin: bool = False
    has_admin_access: bool = False

    @field_validator('email')
    @classmethod
    def validate_email(cls, v: str) -> str:
        """Validate email format."""
        v = v.lower().strip()
        if '@' not in v and not v.isalnum():
            raise ValueError("Invalid email format")
        return v


class UserUpdate(BaseSchema):
    """Schema for updating a user."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    role: Optional[str] = Field(None, max_length=100)
    category: Optional[str] = Field(None, max_length=100)
    store: Optional[str] = Field(None, max_length=255)
    privileges: Optional[List[str]] = None
    is_superadmin: Optional[bool] = None
    has_admin_access: Optional[bool] = None
    self_learning_completed: Optional[bool] = None
    profile_data: Optional[Dict[str, Any]] = None


class UserResponse(UserBase):
    """Schema for user response (without password)."""
    id: int
    privileges: List[str] = []
    is_superadmin: bool = False
    has_admin_access: bool = False
    self_learning_completed: bool = False
    created_at: Optional[datetime] = None


class UserListResponse(BaseSchema):
    """Schema for list of users."""
    users: List[UserResponse]
    total: int
    page: int
    per_page: int
    total_pages: int


class UserLogin(BaseSchema):
    """Schema for user login."""
    email: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)

    @field_validator('email')
    @classmethod
    def normalize_email(cls, v: str) -> str:
        """Normalize email to lowercase."""
        return v.lower().strip()


class TokenResponse(BaseSchema):
    """Schema for authentication token response."""
    status: str = "success"
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = Field(description="Token expiration time in seconds")
    user: UserResponse


class RefreshTokenRequest(BaseSchema):
    """Schema for token refresh request."""
    refresh_token: str


class PasswordChange(BaseSchema):
    """Schema for password change."""
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=6, max_length=128)

    @field_validator('new_password')
    @classmethod
    def validate_new_password(cls, v: str, info) -> str:
        """Ensure new password is different from current."""
        current = info.data.get('current_password')
        if current and v == current:
            raise ValueError("New password must be different from current password")
        return v


class UserPrivilegesUpdate(BaseSchema):
    """Schema for updating user privileges."""
    privileges: List[str] = Field(..., min_items=0)


class UserProfileUpdate(BaseSchema):
    """Schema for user profile self-update."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)


class UserNodeProgressResponse(BaseSchema):
    """Schema for user node progress."""
    node_id: str
    completed: bool
    progress_percent: float
    time_spent_seconds: int
    last_position: float
    quiz_attempts: int
    quiz_best_score: float
    last_accessed: Optional[datetime] = None


class UserLevelProgressResponse(BaseSchema):
    """Schema for user level progress."""
    current_level: str
    next_level: Optional[str]
    nodes_completed_in_level: int
    nodes_required_in_level: int
    completed_nodes: int
    nodes_remaining: int
    progress_percent: float


class PrivilegeInfo(BaseSchema):
    """Schema for privilege information."""
    id: str
    name: str
    icon: str


class CategoryInfo(BaseSchema):
    """Schema for user category information."""
    id: str
    name: str
    description: str
    color: str


# Aliases for API endpoints
LoginRequest = UserLogin
LoginResponse = TokenResponse
TokenRefreshRequest = RefreshTokenRequest
TokenRefreshResponse = TokenResponse

