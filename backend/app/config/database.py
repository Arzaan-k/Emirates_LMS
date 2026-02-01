"""
Database Configuration and Session Management
Production-ready PostgreSQL connection with connection pooling
"""

import logging
from typing import Generator
from contextlib import contextmanager

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import QueuePool, NullPool

from app.config.settings import settings

# Import Base from models to ensure all models share the same metadata
from app.models.base import Base

logger = logging.getLogger(__name__)

# ===========================================
# DATABASE ENGINE CONFIGURATION
# ===========================================

def get_engine_args():
    """
    Get SQLAlchemy engine arguments based on environment.
    Uses NullPool for serverless (Render free tier) to avoid connection limits.
    Uses QueuePool for production with connection pooling.
    """
    connect_args = {}

    # SSL configuration for PostgreSQL
    if "sslmode" not in settings.DATABASE_URL:
        connect_args["sslmode"] = "require"

    # Add connection timeout for Neon PostgreSQL (serverless)
    # This prevents hanging connections on cold starts
    connect_args["connect_timeout"] = 10  # 10 seconds connection timeout
    # NOTE: Do NOT set connect_args["options"] here - it conflicts with Neon's endpoint ID
    # Statement timeout is set via event handler instead (see set_statement_timeout below)

    if settings.USE_SERVERLESS:
        # Serverless: No connection pooling (each request gets a new connection)
        return {
            "poolclass": NullPool,
            "connect_args": connect_args,
            "echo": settings.DEBUG,
        }
    else:
        # Production: Connection pooling optimized for Neon PostgreSQL
        return {
            "poolclass": QueuePool,
            "pool_size": settings.DB_POOL_SIZE,
            "max_overflow": settings.DB_MAX_OVERFLOW,
            "pool_timeout": settings.DB_POOL_TIMEOUT,
            "pool_pre_ping": True,  # Verify connections before use
            "pool_recycle": 300,    # Recycle connections after 5 minutes (Neon closes idle connections)
            "connect_args": connect_args,
            "echo": settings.DEBUG,
        }


# Create the SQLAlchemy engine
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
    bind=engine
)

# ===========================================
# CONNECTION EVENT HANDLERS
# ===========================================

@event.listens_for(engine, "connect")
def set_connection_options(dbapi_connection, connection_record):
    """Set search path and statement timeout on new connections."""
    cursor = dbapi_connection.cursor()
    cursor.execute("SET search_path TO public")
    cursor.execute("SET statement_timeout = '30s'")  # 30 second query timeout
    cursor.close()


# NOTE: Removed manual ping_connection handler as pool_pre_ping=True handles this
# The manual handler was causing additional latency on every request


# ===========================================
# DEPENDENCY INJECTION
# ===========================================

def get_db() -> Generator[Session, None, None]:
    """
    FastAPI dependency to get database session.
    Yields a database session and ensures it's closed after use.

    Usage:
        @app.get("/items")
        async def get_items(db: Session = Depends(get_db)):
            return db.query(Item).all()
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


@contextmanager
def get_db_context() -> Generator[Session, None, None]:
    """
    Context manager for database sessions.
    Use this when you need a session outside of FastAPI requests.

    Usage:
        with get_db_context() as db:
            user = db.query(User).first()
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
    Check database connectivity and health.
    Returns status information for health check endpoints.
    """
    try:
        with get_db_context() as db:
            result = db.execute(text("SELECT 1")).scalar()

            # Get connection pool stats if using QueuePool
            pool_status = {}
            if hasattr(engine.pool, 'checkedout'):
                pool_status = {
                    "pool_size": engine.pool.size(),
                    "checked_out": engine.pool.checkedout(),
                    "overflow": engine.pool.overflow(),
                    "checked_in": engine.pool.checkedin(),
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
    Creates all tables defined in models if they don't exist.
    """
    # Import all models to ensure they're registered with Base
    from app.models import (  # noqa: F401
        user, content, assessment, quiz, crm,
        notification, meeting, tracking, simulation, analytics
    )

    logger.info("Creating database tables...")
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables created successfully")


def drop_all_tables():
    """
    Drop all database tables.
    USE WITH CAUTION - This will delete all data!
    """
    logger.warning("Dropping all database tables...")
    Base.metadata.drop_all(bind=engine)
    logger.warning("All database tables dropped")
