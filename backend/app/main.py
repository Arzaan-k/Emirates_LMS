"""
BW LMS Backend - Main Application Entry Point

Production-ready FastAPI application with modular architecture.
"""

import os
import sys
import logging
from datetime import datetime
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, HTTPException, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.orm import Session
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, FileResponse

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config.settings import settings
from app.config.database import engine, Base, get_db
from app.api.v1.router import api_router, support_router, ai_compat_router
from app.api.v1.endpoints import learning_path
from app.core.middleware import setup_middleware, limiter
from app.core.websocket import manager

# Import models to ensure they are registered with Base.metadata before create_all
from app.models import (
    user, content, assessment, quiz, crm,
    notification, meeting, tracking, simulation, analytics
)


# Configure logging
# Force logging to stdout to ensure visibility
log_level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)
logging.basicConfig(
    level=log_level,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout)
    ],
    force=True
)
logger = logging.getLogger(__name__)


# ==========================================
# APPLICATION LIFESPAN
# ==========================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan handler.
    Runs on startup and shutdown.
    """
    # Startup
    logger.info("Starting BW LMS Backend...")

    # Create database tables
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables created/verified")
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")

    # Check for in-memory database (Data Loss Risk)
    db_url = str(settings.DATABASE_URL)
    if "sqlite" in db_url and (":memory:" in db_url or "mode=memory" in db_url):
        logger.warning("⚠️ CRITICAL: Application is using an IN-MEMORY database. All data (including simulations) will be lost on server restart!")
        logger.warning("Please configure a persistent PostgreSQL or SQLite file in your .env > DATABASE_URL")


    # Ensure upload directory exists
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    logger.info(f"Upload directory: {settings.UPLOAD_DIR}")

    # Initialize FFmpeg path
    try:
        import imageio_ffmpeg
        ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()
        ffmpeg_dir = os.path.dirname(ffmpeg_path)
        if ffmpeg_dir not in os.environ.get("PATH", ""):
            os.environ["PATH"] = os.environ.get("PATH", "") + os.pathsep + ffmpeg_dir
        logger.info(f"FFmpeg configured: {ffmpeg_dir}")
    except Exception as e:
        logger.warning(f"FFmpeg configuration failed: {e}")

    logger.info(f"Server starting at {settings.BASE_URL}")

    yield

    # Shutdown
    logger.info("Shutting down BW LMS Backend...")


# ==========================================
# CREATE APPLICATION
# ==========================================

app = FastAPI(
    title="BW LMS Backend",
    description="Learning Management System Backend API - Production Ready",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)


# ==========================================
# MIDDLEWARE
# ==========================================

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure properly for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security middleware (rate limiting, headers, logging)
setup_middleware(app)


# ==========================================
# STATIC FILES
# ==========================================

# Mount uploads directory
if os.path.exists(settings.UPLOAD_DIR):
    app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")


# ==========================================
# ROOT ENDPOINTS
# ==========================================

@app.get("/")
async def root():
    """Root endpoint - API information."""
    return {
        "message": "BW LMS Backend API",
        "version": "2.0.0",
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/health")
async def health_check(db: Session = Depends(get_db)):
    """
    Health check endpoint for monitoring and load balancers.
    Checks database connectivity and AI services.
    """
    db_status = "unknown"
    try:
        from sqlalchemy import text
        db.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception as e:
        db_status = f"error: {str(e)[:50]}"

    ai_status = "configured" if os.environ.get("GROQ_API_KEY") else "not_configured"
    cdn_status = "configured" if os.environ.get("R2_ACCOUNT_ID") else "not_configured"

    return {
        "status": "healthy" if db_status == "connected" else "degraded",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "2.0.0",
        "services": {
            "database": db_status,
            "ai": ai_status,
            "cdn": cdn_status,
        }
    }


# ==========================================
# INCLUDE API ROUTER
# ==========================================

# Include all API v1 endpoints - this is the ONLY API router
app.include_router(api_router, prefix="/api/v1")

# Include support aliases at root level for backward compatibility
# Frontend calls /support/... directly instead of /api/v1/support/...
app.include_router(support_router, prefix="")
app.include_router(ai_compat_router, prefix="")
# Include learning path at root level for backward compatibility
# Frontend calls /learning-path/... directly instead of /api/v1/learning-path/...
app.include_router(learning_path.router, prefix="")

# Include API router at /api for legacy frontend calls (missing v1)
# Frontend calls /api/content/... instead of /api/v1/content/...
app.include_router(api_router, prefix="/api")


# ==========================================
# RECOMMENDATIONS ENDPOINT (ROOT LEVEL ALIAS)
# ==========================================
# Frontend calls /recommendations/track-completion directly
# This is an alias to handle old API structure

from fastapi import Form
from typing import Optional
from app.models.tracking import CourseCompletion
from app.models.user import User
import uuid

@app.post("/recommendations/track-completion")
async def track_completion_alias(
    user_email: str = Form(...),
    course_id: str = Form(...),
    course_title: str = Form(""),
    bucket: Optional[str] = Form(None),
    xp_earned: int = Form(50),
    score: int = Form(0),
    max_score: int = Form(100),
    time_spent_seconds: int = Form(0),
    quiz_correct: int = Form(0),
    quiz_total: int = Form(0),
    db: Session = Depends(get_db)
):
    """
    Track course/module completion and award XP.
    Root-level alias for backward compatibility with frontend.
    """
    try:
        # Get or create user
        user = db.query(User).filter(User.email == user_email).first()
        if not user:
            logger.warning(f"User not found for track-completion: {user_email}")
            return {"status": "error", "message": "User not found"}

        # Check if already completed (avoid duplicates)
        existing_completion = db.query(CourseCompletion).filter(
            CourseCompletion.user_email == user_email,
            CourseCompletion.course_id == course_id
        ).first()

        if existing_completion:
            logger.info(f"Course {course_id} already completed by {user_email}")
            return {
                "status": "success",
                "message": "Already completed",
                "xp_earned": 0,
                "total_xp": 0,
                "level_up": False,
                "new_level": None
            }

        # Calculate XP with skill matching bonus
        actual_xp = int(xp_earned)
        bucket_lower = (bucket or "").lower()
        title_lower = (course_title or "").lower()
        
        # Simple skill matching for bonus XP
        skill_keywords = ["product", "customer", "hygiene", "safety", "operation", "leadership"]
        skill_matched = any(kw in bucket_lower or kw in title_lower for kw in skill_keywords)
        if skill_matched:
            actual_xp += 10  # Skill matching bonus

        # Create completion record
        completion = CourseCompletion(
            id=str(uuid.uuid4()),
            user_email=user_email,
            course_id=course_id,
            course_title=course_title or f"Course {course_id}",
            bucket=bucket,
            score=score,
            score_percent=(score / max_score * 100) if max_score > 0 else 0,
            time_spent_seconds=time_spent_seconds,
            quiz_correct=quiz_correct,
            quiz_total=quiz_total,
            xp_earned=actual_xp,
            completed_at=datetime.utcnow()
        )
        db.add(completion)

        # Count total completions
        completion_count = db.query(CourseCompletion).filter(
            CourseCompletion.user_email == user_email
        ).count()

        total_xp = (completion_count + 1) * 50  # Approximate total

        db.commit()

        logger.info(f"Module completion tracked for {user_email}: {course_title} +{actual_xp} XP")

        return {
            "status": "success",
            "xp_earned": actual_xp,
            "total_xp": total_xp,
            "message": f"Module completed! +{actual_xp} XP",
            "level_up": False,
            "new_level": None,
            "courses_completed": completion_count + 1
        }

    except Exception as e:
        logger.error(f"Track completion error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return {
            "status": "success",
            "message": "Tracked with warnings",
            "xp_earned": xp_earned,
            "level_up": False
        }


# ==========================================
# WEBSOCKET ENDPOINT
# ==========================================

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = None):
    """
    WebSocket endpoint for real-time bidirectional communication.
    Supports real-time updates for:
    - Meeting notifications (scheduled, participant joined, ended)
    - CRM task assignments and completions
    - Content uploads and updates
    - General notifications
    - Quiz assignments
    - News posts
    - Exam scheduling and attendance

    Args:
        websocket: WebSocket connection
        token: Optional JWT token for authentication (query parameter)
    """
    user_email = None

    # Optional: Authenticate using token query parameter
    if token:
        try:
            from app.services.auth_service import AuthService
            payload = AuthService.verify_token(token)
            user_email = payload.get("email")
        except Exception as e:
            logger.warning(f"WebSocket authentication failed: {e}")
            # Continue without authentication - allow anonymous connections

    await manager.connect(websocket, user_email)
    logger.info(f"WebSocket client connected. Active connections: {manager.get_active_connection_count()}, User: {user_email or 'anonymous'}")

    try:
        while True:
            # Keep connection alive by listening for messages
            # Client can send ping messages, we just acknowledge them
            data = await websocket.receive_text()

            # Optional: Handle client messages (e.g., ping/pong)
            if data == "ping":
                await websocket.send_text("pong")

    except WebSocketDisconnect:
        manager.disconnect(websocket)
        logger.info(f"WebSocket client disconnected. Active connections: {manager.get_active_connection_count()}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)


# ==========================================
# WEBSOCKET STATUS ENDPOINT
# ==========================================

@app.get("/ws/status")
async def websocket_status():
    """
    Get WebSocket connection statistics.
    Shows active connection count and connection details.
    """
    return {
        "active_connections": manager.get_active_connection_count(),
        "connections": manager.get_connection_info(),
        "timestamp": datetime.utcnow().isoformat()
    }


# ==========================================
# EXCEPTION HANDLERS
# ==========================================

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Handle HTTP exceptions."""
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail}
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Handle general exceptions."""
    logger.error(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
    )


# ==========================================
# RUN APPLICATION
# ==========================================

if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    host = "0.0.0.0"

    logger.info(f"Starting server on {host}:{port}")

    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=True,
        log_level="info"
    )
