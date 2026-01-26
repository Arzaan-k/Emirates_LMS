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
            "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None,
            "tags": self.tags or [],
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
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
            "due_date": self.due_date.isoformat() if self.due_date else None,
            "assigned_at": self.assigned_at.isoformat() if self.assigned_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }
