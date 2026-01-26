"""
BW LMS Backend - Main Application Entry Point

Production-ready FastAPI application with modular architecture.
"""

import os
import sys
import logging
from datetime import datetime
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, FileResponse

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config.settings import settings
from app.config.database import engine, Base, get_db
from app.api.v1.router import api_router
from app.core.middleware import setup_middleware, limiter


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
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
async def health_check():
    """
    Health check endpoint for monitoring and load balancers.
    Checks database connectivity and AI services.
    """
    db_status = "unknown"
    try:
        db = next(get_db())
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
