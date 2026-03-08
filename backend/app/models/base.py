"""
Base Model Classes for Emirates LMS Backend
Provides common functionality for all SQLAlchemy models
"""

from datetime import datetime
from sqlalchemy import Column, DateTime
from sqlalchemy.ext.declarative import declarative_base

# Create the declarative base
Base = declarative_base()


class TimestampMixin:
    """
    Mixin that adds created_at and updated_at timestamps.
    Use this for any model that needs automatic timestamp tracking.

    Usage:
        class MyModel(Base, TimestampMixin):
            __tablename__ = "my_table"
            id = Column(Integer, primary_key=True)
    """
    created_at = Column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
        doc="Timestamp when record was created"
    )
    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
        doc="Timestamp when record was last updated"
    )
