"""
CRM Domain Models
Support tickets and task assignments
"""

from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime,
    Text, JSON, ForeignKey, Index
)
from sqlalchemy.orm import relationship

from app.models.base import Base


class CRMTicket(Base):
    """
    CRM support tickets.
    For managing customer queries, requests, and complaints.
    """
    __tablename__ = "crm_tickets"

    id = Column(String(255), primary_key=True)
    type = Column(String(100))  # Query, Request, Complaint
    category_id = Column(String(255))
    category_name = Column(String(255))
    customer_name = Column(String(255), nullable=False)
    customer_email = Column(String(255))
    customer_phone = Column(String(100))
    subject = Column(String(500), nullable=False)
    description = Column(Text, nullable=False)
    message = Column(Text, nullable=True) # Legacy column, kept for compatibility
    priority = Column(String(50), default="medium")  # low, medium, high, urgent
    status = Column(String(100), default="open")  # open, in_progress, resolved, closed
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    assigned_to = Column(String(255))  # User email
    assigned_name = Column(String(255))
    resolution = Column(Text)
    resolved_at = Column(DateTime)
    resolution_time_hours = Column(Integer)
    tags = Column(JSON, default=[])
    attachments = Column(JSON, default=[])

    # Relationships
    task_assignments = relationship(
        "CRMTaskAssignment",
        back_populates="ticket",
        lazy="dynamic"
    )

    __table_args__ = (
        Index('idx_ticket_status', 'status'),
        Index('idx_ticket_type', 'type'),
        Index('idx_ticket_category', 'category_id'),
        Index('idx_ticket_priority', 'priority'),
        Index('idx_ticket_assigned', 'assigned_to'),
        Index('idx_ticket_created', 'created_at'),
    )

    def __repr__(self):
        return f"<CRMTicket {self.id}: {self.subject}>"

    def to_dict(self):
        """Convert to dictionary for API responses."""
        # Helper to ensure UTC
        def format_dt(dt):
            if not dt:
                return None
            iso = dt.isoformat()
            if dt.tzinfo is None and not iso.endswith("Z") and "+" not in iso:
                return f"{iso}Z"
            return iso

        return {
            "id": self.id,
            "type": self.type,
            "category_id": self.category_id,
            "category_name": self.category_name,
            "customer_name": self.customer_name,
            "customer_email": self.customer_email,
            "customer_phone": self.customer_phone,
            "subject": self.subject,
            "description": self.description,
            "priority": self.priority,
            "status": self.status,
            "assigned_to": self.assigned_to,
            "assigned_name": self.assigned_name,
            "resolution": self.resolution,
            "resolved_at": format_dt(self.resolved_at),
            "tags": self.tags or [],
            "created_at": format_dt(self.created_at),
            "updated_at": format_dt(self.updated_at),
        }


class CRMTaskAssignment(Base):
    """
    CRM task assignments.
    Tracks training/course assignments based on ticket resolutions.
    """
    __tablename__ = "crm_task_assignments"

    id = Column(String(255), primary_key=True)
    ticket_id = Column(String(255), ForeignKey('crm_tickets.id'))
    user_email = Column(String(255), nullable=False)
    user_name = Column(String(255))
    course_category_id = Column(String(255))
    course_id = Column(String(255))
    assigned_at = Column(DateTime, default=datetime.utcnow)
    assigned_by = Column(String(255))
    status = Column(String(100), default="assigned")  # assigned, in_progress, completed, cancelled
    resolution = Column(Text)
    completed_at = Column(DateTime)
    xp_earned = Column(Integer, default=0)
    due_date = Column(DateTime)
    notes = Column(Text)

    # Relationships
    ticket = relationship("CRMTicket", back_populates="task_assignments")

    __table_args__ = (
        Index('idx_task_user_email', 'user_email'),
        Index('idx_task_status', 'status'),
        Index('idx_task_ticket', 'ticket_id'),
        Index('idx_task_assigned_at', 'assigned_at'),
    )

    def __repr__(self):
        return f"<CRMTaskAssignment {self.user_email} - {self.ticket_id}>"

    def to_dict(self):
        """Convert to dictionary for API responses."""
        # Helper to ensure UTC
        def format_dt(dt):
            if not dt:
                return None
            iso = dt.isoformat()
            if dt.tzinfo is None and not iso.endswith("Z") and "+" not in iso:
                return f"{iso}Z"
            return iso

        return {
            "id": self.id,
            "ticket_id": self.ticket_id,
            "user_email": self.user_email,
            "user_name": self.user_name,
            "course_category_id": self.course_category_id,
            "course_id": self.course_id,
            "status": self.status,
            "resolution": self.resolution,
            "xp_earned": self.xp_earned,
            "due_date": format_dt(self.due_date),
            "assigned_at": format_dt(self.assigned_at),
            "completed_at": format_dt(self.completed_at),
        }


class AuditTemplate(Base):
    """
    Template for reusable audits/checklists.
    """
    __tablename__ = "audit_templates"

    id = Column(String(255), primary_key=True)
    title = Column(String(255), nullable=False)
    description = Column(Text)
    icon = Column(String(50), default="clipboard")
    color = Column(String(50), default="#10B981")
    checklist_items = Column(JSON, default=[]) # List of strings or objects {text, type}
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    assignments = relationship("AuditAssignment", back_populates="template", lazy="dynamic")

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "icon": self.icon,
            "color": self.color,
            "checklist_items": self.checklist_items or [],
            "created_at": self.created_at.isoformat() if self.created_at else None
        }


class AuditAssignment(Base):
    """
    Assignment of an audit template to a user or store.
    """
    __tablename__ = "audit_assignments"

    id = Column(String(255), primary_key=True)
    template_id = Column(String(255), ForeignKey('audit_templates.id'), nullable=False)
    assigned_to = Column(String(255)) # User email
    store_id = Column(String(255)) # Store identifier
    status = Column(String(50), default="pending") # pending, completed, overdue
    due_date = Column(DateTime)
    assigned_at = Column(DateTime, default=datetime.utcnow)
    assigned_by = Column(String(255))
    
    # Relationships
    template = relationship("AuditTemplate", back_populates="assignments")

    def to_dict(self):
        return {
            "id": self.id,
            "template_id": self.template_id,
            "template_title": self.template.title if self.template else "Unknown Audit",
            "assigned_to": self.assigned_to,
            "store_id": self.store_id,
            "status": self.status,
            "due_date": self.due_date.isoformat() if self.due_date else None,
            "assigned_at": self.assigned_at.isoformat() if self.assigned_at else None,
        }


class AuditSubmission(Base):
    """
    Store Audit Submissions.
    Tracks compliance checks for stores.
    """
    __tablename__ = "audit_submissions"

    id = Column(String(255), primary_key=True)
    user_email = Column(String(255), nullable=False)
    user_name = Column(String(255))
    store = Column(String(255))
    category = Column(String(100)) # e.g., 'safety', 'cleanliness' or template_id
    checklist_items = Column(JSON, default=[]) # Snapshot of items at time of audit
    checked_items = Column(JSON, default={}) # Key-value pairs of checked items
    completion_rate = Column(Integer, default=0)
    submitted_at = Column(DateTime, default=datetime.utcnow)
    status = Column(String(50), default="completed")
    
    # Link to assignment if applicable
    # assignment_id = Column(String(255), nullable=True)

    __table_args__ = (
        Index('idx_audit_user', 'user_email'),
        Index('idx_audit_store', 'store'),
        Index('idx_audit_category', 'category'),
        Index('idx_audit_submitted', 'submitted_at'),
    )

    def __repr__(self):
        return f"<AuditSubmission {self.id}: {self.store} - {self.category}>"

    def to_dict(self):
        """Convert to dictionary for API responses."""
        return {
            "id": self.id,
            "user_email": self.user_email,
            "user_name": self.user_name,
            "store": self.store,
            "category": self.category,
            "category_name": self.category.title() if self.category else "", 
            "checklist_items": self.checklist_items or [],
            "checked_items": self.checked_items or {},
            "completion_rate": self.completion_rate,
            "submitted_at": (self.submitted_at.isoformat() + "Z") if self.submitted_at else None,
            "status": self.status,
            # "assignment_id": self.assignment_id
        }
