"""
Configuration module for BW LMS Backend
"""

from app.config.settings import settings
from app.config.database import get_db, engine, SessionLocal, Base

__all__ = ["settings", "get_db", "engine", "SessionLocal", "Base"]
