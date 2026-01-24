"""
Database configuration and session management for LMS Backend
Uses PostgreSQL with SQLAlchemy ORM
Optimized for production with connection pooling
"""

import os
import logging
from sqlalchemy import create_engine, event, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import QueuePool, NullPool
from sqlalchemy.exc import SQLAlchemyError

logger = logging.getLogger("BW_LMS_Database")

# Get database URL from environment
DATABASE_URL = os.environ.get("DATABASE_URL")

if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is not set")

# Environment detection
ENVIRONMENT = os.environ.get("ENVIRONMENT", "development")
IS_PRODUCTION = ENVIRONMENT == "production"

# Connection pool configuration
POOL_SIZE = int(os.environ.get("DB_POOL_SIZE", "10"))
MAX_OVERFLOW = int(os.environ.get("DB_MAX_OVERFLOW", "20"))
POOL_TIMEOUT = int(os.environ.get("DB_POOL_TIMEOUT", "30"))
POOL_RECYCLE = int(os.environ.get("DB_POOL_RECYCLE", "1800"))  # 30 minutes

# Determine pool class based on deployment
# Use QueuePool for production with connection pooling
# Use NullPool for serverless (Render free tier, Vercel, etc.)
USE_SERVERLESS = os.environ.get("USE_SERVERLESS", "false").lower() == "true"

if USE_SERVERLESS:
    # Serverless: no connection pooling (new connection per request)
    engine = create_engine(
        DATABASE_URL,
        poolclass=NullPool,
        echo=False
    )
    logger.info("Database configured for serverless (NullPool)")
else:
    # Standard deployment: use connection pooling
    engine = create_engine(
        DATABASE_URL,
        poolclass=QueuePool,
        pool_size=POOL_SIZE,
        max_overflow=MAX_OVERFLOW,
        pool_timeout=POOL_TIMEOUT,
        pool_recycle=POOL_RECYCLE,
        pool_pre_ping=True,  # Validate connections before use
        echo=False  # Set to True for SQL logging during development
    )
    logger.info(f"Database configured with QueuePool (size={POOL_SIZE}, overflow={MAX_OVERFLOW})")


# Connection event listeners for debugging and monitoring
@event.listens_for(engine, "connect")
def on_connect(dbapi_connection, connection_record):
    """Called when a new database connection is created."""
    logger.debug("New database connection established")


@event.listens_for(engine, "checkout")
def on_checkout(dbapi_connection, connection_record, connection_proxy):
    """Called when a connection is checked out from the pool."""
    logger.debug("Connection checked out from pool")


@event.listens_for(engine, "checkin")
def on_checkin(dbapi_connection, connection_record):
    """Called when a connection is returned to the pool."""
    logger.debug("Connection returned to pool")


# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for all models
Base = declarative_base()


def get_db():
    """
    FastAPI dependency to get database session.
    Automatically closes session after request.

    Usage:
        @app.get("/users")
        async def get_users(db: Session = Depends(get_db)):
            return db.query(User).all()
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def check_database_health() -> dict:
    """
    Check database connectivity and return health status.

    Returns:
        Dict with 'status', 'latency_ms', and any errors
    """
    import time

    result = {
        "status": "unhealthy",
        "latency_ms": None,
        "pool_size": POOL_SIZE if not USE_SERVERLESS else 0,
        "error": None
    }

    try:
        start = time.time()
        db = SessionLocal()

        # Simple query to check connectivity
        db.execute(text("SELECT 1"))

        latency = (time.time() - start) * 1000
        result["status"] = "healthy"
        result["latency_ms"] = round(latency, 2)

        db.close()

    except SQLAlchemyError as e:
        result["error"] = str(e)
        logger.error(f"Database health check failed: {e}")

    return result


def get_pool_status() -> dict:
    """
    Get connection pool status (only for QueuePool).

    Returns:
        Dict with pool statistics
    """
    if USE_SERVERLESS:
        return {"type": "NullPool", "message": "No connection pooling (serverless mode)"}

    pool = engine.pool
    return {
        "type": "QueuePool",
        "size": pool.size(),
        "checked_in": pool.checkedin(),
        "checked_out": pool.checkedout(),
        "overflow": pool.overflow(),
        "invalid": pool.invalidatedcount() if hasattr(pool, 'invalidatedcount') else 0
    }


def create_all_tables():
    """
    Create all database tables.
    Should be called during application startup.
    """
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables created/verified")


def dispose_engine():
    """
    Dispose the database engine and close all connections.
    Call this during application shutdown.
    """
    engine.dispose()
    logger.info("Database engine disposed")
