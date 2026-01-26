"""
CRM Schemas
Pydantic models for CRM ticket and task operations
"""

from typing import List, Optional
from datetime import datetime
from pydantic import Field

from app.schemas.base import BaseSchema


class CRMTicketCreate(BaseSchema):
    """Schema for creating a CRM ticket."""
    id: Optional[str] = None
    type: str = Field(..., pattern="^(Query|Request|Complaint)$")
    category_id: Optional[str] = None
    category_name: Optional[str] = None
    customer_name: str = Field(..., min_length=1, max_length=255)
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None
    subject: str = Field(..., min_length=1, max_length=500)
    description: str = Field(..., min_length=1)
    priority: str = Field(default="medium", pattern="^(low|medium|high|urgent)$")
    tags: List[str] = []
    attachments: List[str] = []


class CRMTicketUpdate(BaseSchema):
    """Schema for updating a CRM ticket."""
    type: Optional[str] = None
    category_id: Optional[str] = None
    category_name: Optional[str] = None
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None
    subject: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None  # open, in_progress, resolved, closed
    assigned_to: Optional[str] = None  # User email
    assigned_name: Optional[str] = None
    resolution: Optional[str] = None
    tags: Optional[List[str]] = None


class CRMTicketResponse(BaseSchema):
    """Schema for CRM ticket response."""
    id: str
    type: str
    category_id: Optional[str] = None
    category_name: Optional[str] = None
    customer_name: str
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None
    subject: str
    description: str
    priority: str
    status: str
    assigned_to: Optional[str] = None
    assigned_name: Optional[str] = None
    resolution: Optional[str] = None
    resolved_at: Optional[datetime] = None
    tags: List[str] = []
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class CRMTicketListResponse(BaseSchema):
    """Schema for CRM ticket list."""
    tickets: List[CRMTicketResponse]
    total: int
    open_count: int = 0
    in_progress_count: int = 0
    resolved_count: int = 0


# Task Assignment Schemas
class CRMTaskAssignmentCreate(BaseSchema):
    """Schema for creating a CRM task assignment."""
    id: Optional[str] = None
    ticket_id: Optional[str] = None
    user_email: str = Field(..., min_length=1)
    user_name: Optional[str] = None
    course_category_id: Optional[str] = None
    course_id: Optional[str] = None
    assigned_by: Optional[str] = None
    due_date: Optional[datetime] = None
    notes: Optional[str] = None


class CRMTaskAssignmentUpdate(BaseSchema):
    """Schema for updating a CRM task assignment."""
    status: Optional[str] = None  # assigned, in_progress, completed, cancelled
    resolution: Optional[str] = None
    xp_earned: Optional[int] = None
    notes: Optional[str] = None


class CRMTaskAssignmentResponse(BaseSchema):
    """Schema for CRM task assignment response."""
    id: str
    ticket_id: Optional[str] = None
    user_email: str
    user_name: Optional[str] = None
    course_category_id: Optional[str] = None
    course_id: Optional[str] = None
    status: str
    resolution: Optional[str] = None
    xp_earned: int = 0
    due_date: Optional[datetime] = None
    assigned_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


# CRM Category Schema
class CRMCategoryResponse(BaseSchema):
    """Schema for CRM category."""
    id: str
    name: str
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
