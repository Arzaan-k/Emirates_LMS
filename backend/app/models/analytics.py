"""
Analytics Domain Models
Audit logs and system analytics
"""

from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, DateTime, Text, Index
)

from app.models.base import Base


class AuditLog(Base):
    """
    System audit logs for tracking all actions.
    Critical for compliance and security auditing.
    """
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    user_email = Column(String(255), index=True)
    user_name = Column(String(255))
    action = Column(String(255), nullable=False)  # CREATE_USER, LOGIN, UPLOAD_CONTENT, etc.
    target = Column(String(500))  # What was affected (user email, content ID, etc.)
    # target_type = Column(String(100))  # REMOVED: Column missing in DB
    details = Column(Text)  # Additional context
    ip_address = Column(String(100))
    user_agent = Column(String(500))
    # request_id = Column(String(100))  # REMOVED: Column missing in DB
    # status = Column(String(50))  # REMOVED: Column missing in DB
    # error_message = Column(Text)  # REMOVED: Column missing in DB
    # duration_ms = Column(Integer)  # REMOVED: Column missing in DB
    # extra_data = Column(Text)  # REMOVED: Column missing in DB

    __table_args__ = (
        Index('idx_audit_user', 'user_email'),
        Index('idx_audit_action', 'action'),
        Index('idx_audit_timestamp', 'timestamp'),
        # Index('idx_audit_target_type', 'target_type'),
        # Index('idx_audit_status', 'status'),
    )

    def __repr__(self):
        return f"<AuditLog {self.id}: {self.action} by {self.user_email}>"

    def to_dict(self):
        """Convert to dictionary for API responses."""
        return {
            "id": self.id,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "user_email": self.user_email,
            "user_name": self.user_name,
            "action": self.action,
            "target": self.target,
            # "target_type": self.target_type,
            "details": self.details,
            "ip_address": self.ip_address,
            # "status": self.status,
            # "error_message": self.error_message,
        }
