"""
Configuration module for Emirates LMS Backend
"""

from app.config.settings import settings
from app.config.database import get_db, engine, SessionLocal, Base

__all__ = ["settings", "get_db", "engine", "SessionLocal", "Base"]
