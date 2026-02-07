
"""
Report Domain Models
"""

from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, ForeignKey, Index, JSON, Text
)
from sqlalchemy.orm import relationship

from app.models.base import Base

class ReportSubscription(Base):
    """
    User subscriptions for automated weekly reports.
    """
    __tablename__ = "report_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    report_type = Column(String(50), nullable=False)  # 'users', 'training', 'quizzes', 'overview'
    frequency = Column(String(20), default='weekly')  # 'weekly'
    day_of_week = Column(String(20), default='Monday') # 'Monday', 'Tuesday', etc.
    time_of_day = Column(String(10), default='09:00')  # '09:00', '14:00' (24h format)
    format = Column(String(20), default='pdf') # 'pdf', 'csv', 'both'
    is_active = Column(Boolean, default=True)
    last_sent_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationship
    user = relationship("User", backref="report_subscriptions")

    __table_args__ = (
        Index('idx_sub_user', 'user_id'),
        Index('idx_sub_type', 'report_type'),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "report_type": self.report_type,
            "frequency": self.frequency,
            "day_of_week": self.day_of_week,
            "time_of_day": self.time_of_day,
            "format": self.format,
            "is_active": self.is_active
        }
