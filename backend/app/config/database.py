"""
Database Configuration and Session Management
Optimized for Neon PostgreSQL + FastAPI
"""

import logging
from typing import Generator
from contextlib import contextmanager

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import QueuePool

from app.config.settings import settings
from app.models.base import Base

logger = logging.getLogger(__name__)

# ===========================================
# DATABASE ENGINE CONFIGURATION
# ===========================================

def get_engine_args():
    """
    SQLAlchemy engine arguments optimized for Neon PostgreSQL.
    IMPORTANT:
    - Always use QueuePool with Neon
    - Never use NullPool (causes 3–5s latency per request)
    """

    connect_args = {
        "sslmode": "require",
        "connect_timeout": 3,  # Fail fast on cold starts
    }

    return {
        "poolclass": QueuePool,
        "pool_size": settings.DB_POOL_SIZE or 5,
        "max_overflow": settings.DB_MAX_OVERFLOW or 5,
        "pool_timeout": settings.DB_POOL_TIMEOUT or 30,
        "pool_pre_ping": True,
        "pool_recycle": 300,  # Neon closes idle connections
        "connect_args": connect_args,
        "echo": settings.DEBUG,
    }


# Create SQLAlchemy engine
engine = create_engine(
    settings.DATABASE_URL,
    **get_engine_args()
)

# ===========================================
# SESSION FACTORY
# ===========================================

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

# ===========================================
# CONNECTION EVENT HANDLERS
# ===========================================

@event.listens_for(engine, "connect")
def set_connection_options(dbapi_connection, connection_record):
    """
    Apply per-connection settings.
    Runs ONLY when a new DB connection is created.
    """
    cursor = dbapi_connection.cursor()
    cursor.execute("SET search_path TO public")
    cursor.execute("SET statement_timeout = '5s'")  # APIs should be fast
    cursor.close()


# ===========================================
# DEPENDENCY INJECTION (FASTAPI)
# ===========================================

def get_db() -> Generator[Session, None, None]:
    """
    FastAPI dependency.
    IMPORTANT:
    - Do NOT use async def with sync SQLAlchemy
    - FastAPI will run this in a threadpool automatically
    """
    db = SessionLocal()
    try:
        yield db
    except Exception as e:
        logger.error(f"Database error: {e}")
        db.rollback()
        raise
    finally:
        db.close()


# ===========================================
# CONTEXT MANAGER (NON-FASTAPI USE)
# ===========================================

@contextmanager
def get_db_context() -> Generator[Session, None, None]:
    """
    Context manager for background jobs / scripts.
    """
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception as e:
        logger.error(f"Database error: {e}")
        db.rollback()
        raise
    finally:
        db.close()


# ===========================================
# HEALTH CHECK
# ===========================================

def check_database_health() -> dict:
    """
    Lightweight DB health check.
    NO commits, NO transactions.
    """
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))

            pool = engine.pool
            pool_status = {
                "pool_size": pool.size(),
                "checked_out": pool.checkedout(),
                "checked_in": pool.checkedin(),
                "overflow": pool.overflow(),
            }

            return {
                "status": "healthy",
                "connected": True,
                "pool": pool_status,
            }

    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        return {
            "status": "unhealthy",
            "connected": False,
            "error": str(e),
        }


# ===========================================
# DATABASE INITIALIZATION
# ===========================================

def init_db():
    """
    Initialize database tables.
    """
    from app.models import (  # noqa: F401
        user,
        content,
        assessment,
        quiz,
        crm,
        notification,
        meeting,
        tracking,
        simulation,
        analytics,
    )

    logger.info("Creating database tables...")
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables created successfully")


def drop_all_tables():
    """
    Drop all database tables.
    USE WITH EXTREME CAUTION.
    """
    logger.warning("Dropping all database tables...")
    Base.metadata.drop_all(bind=engine)
    logger.warning("All database tables dropped")
