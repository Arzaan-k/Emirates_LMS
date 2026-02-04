"""
Middleware for BW LMS Backend
Request/response processing, logging, error handling, and rate limiting
"""

import time
import logging
import uuid
from typing import Callable
from datetime import datetime

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.config.settings import settings
from app.core.exceptions import AppException

logger = logging.getLogger(__name__)

# ===========================================
# RATE LIMITER
# ===========================================

# Initialize rate limiter
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[settings.RATE_LIMIT_DEFAULT],
    storage_uri=settings.REDIS_URL if settings.REDIS_URL else "memory://",
)


def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> Response:
    """Custom handler for rate limit exceeded errors."""
    return JSONResponse(
        status_code=429,
        content={
            "error": "rate_limit_exceeded",
            "message": f"Rate limit exceeded: {exc.detail}",
            "retry_after": getattr(exc, 'retry_after', 60),
        },
        headers={"Retry-After": str(getattr(exc, 'retry_after', 60))},
    )


# ===========================================
# REQUEST LOGGING MIDDLEWARE
# ===========================================

class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """
    Middleware for logging all requests and responses.
    Adds request ID for tracing.
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Generate request ID
        request_id = str(uuid.uuid4())[:8]

        # Add request ID to state for access in handlers
        request.state.request_id = request_id

        # Start timer
        start_time = time.time()

        # Log request
        logger.info(
            f"[{request_id}] {request.method} {request.url.path} "
            f"- Client: {request.client.host if request.client else 'unknown'}"
        )

        # Process request
        response = None
        try:
            response = await call_next(request)
        except RuntimeError as e:
            # Handle "No response returned" specifically
            if "No response returned" in str(e):
                process_time = time.time() - start_time
                logger.warning(
                    f"[{request_id}] {request.method} {request.url.path} "
                    f"- No response returned, returning 500 ({process_time:.3f}s)"
                )
                return JSONResponse(
                    status_code=500,
                    content={"detail": "Request processing failed", "request_id": request_id}
                )
            raise
        except Exception as e:
            # Log unhandled exceptions
            process_time = time.time() - start_time
            logger.error(
                f"[{request_id}] {request.method} {request.url.path} "
                f"- ERROR: {str(e)} ({process_time:.3f}s)"
            )
            return JSONResponse(
                status_code=500,
                content={"detail": "Internal server error", "request_id": request_id}
            )

        # Safety check for None response
        if response is None:
            process_time = time.time() - start_time
            logger.warning(
                f"[{request_id}] {request.method} {request.url.path} "
                f"- Response was None, returning 500 ({process_time:.3f}s)"
            )
            return JSONResponse(
                status_code=500,
                content={"detail": "No response generated", "request_id": request_id}
            )

        # Calculate processing time
        process_time = time.time() - start_time

        # Add custom headers
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Process-Time"] = f"{process_time:.3f}"

        # Log response
        log_level = logging.WARNING if response.status_code >= 400 else logging.INFO
        logger.log(
            log_level,
            f"[{request_id}] {request.method} {request.url.path} "
            f"- {response.status_code} ({process_time:.3f}s)"
        )

        return response


# ===========================================
# ERROR HANDLING MIDDLEWARE
# ===========================================

class ErrorHandlingMiddleware(BaseHTTPMiddleware):
    """
    Middleware for consistent error response formatting.
    Catches all exceptions and returns structured error responses.
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        try:
            return await call_next(request)
        except AppException as e:
            # Our custom exceptions
            return JSONResponse(
                status_code=e.status_code,
                content={
                    "error": e.error_code,
                    "message": e.detail,
                    "data": e.data,
                    "request_id": getattr(request.state, 'request_id', None),
                },
                headers=e.headers,
            )
        except Exception as e:
            # Unexpected errors
            logger.exception(f"Unhandled exception: {e}")

            return JSONResponse(
                status_code=500,
                content={
                    "error": "INTERNAL_SERVER_ERROR",
                    "message": "An unexpected error occurred",
                    "request_id": getattr(request.state, 'request_id', None),
                },
            )


# ===========================================
# SECURITY HEADERS MIDDLEWARE
# ===========================================

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Middleware to add security headers to all responses.
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response = await call_next(request)

        # Security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # Only add HSTS in production
        if settings.is_production:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

        return response


# ===========================================
# REQUEST SIZE LIMIT MIDDLEWARE
# ===========================================

class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    """
    Middleware to limit request body size.
    Prevents denial-of-service attacks via large payloads.
    """

    def __init__(self, app: FastAPI, max_size: int = 100 * 1024 * 1024):  # 100MB default
        super().__init__(app)
        self.max_size = max_size

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Check content-length header
        content_length = request.headers.get("content-length")

        if content_length and int(content_length) > self.max_size:
            return JSONResponse(
                status_code=413,
                content={
                    "error": "REQUEST_TOO_LARGE",
                    "message": f"Request body too large. Maximum size: {self.max_size // (1024*1024)}MB",
                },
            )

        return await call_next(request)


# ===========================================
# SETUP FUNCTION
# ===========================================

class DatabaseAuditMiddleware(BaseHTTPMiddleware):
    """
    Middleware to log modification actions (POST, PUT, DELETE, PATCH) to the database.
    Captures user info from token and saves to audit_logs table.
    """
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response = await call_next(request)
        
        # Only log success actions that modify data
        if response.status_code < 400 and request.method in ["POST", "PUT", "DELETE", "PATCH"]:
            # Run in background to avoid blocking response? 
            # Ideally BackgroundTasks, but middleware restrictions apply.
            # We'll do it synchronously here for reliability as per user request ("each and every log").
            try:
                 # Extract user info
                 user_email = "system"
                 user_name = "System"
                 auth_header = request.headers.get("Authorization")
                 
                 if auth_header and auth_header.startswith("Bearer "):
                     try:
                         # Dynamic imports to avoid circular dependencies
                         from app.core.auth import verify_token
                         token = auth_header.replace("Bearer ", "")
                         payload = verify_token(token, "access")
                         if payload:
                             user_email = payload.get("sub", "unknown")
                             user_name = payload.get("name", user_email)
                     except Exception:
                         pass # Invalid token, treat as system/anonymous
                 
                 # Prepare log data matching the EXISTING database schema
                 # (avoiding missing column errors for target_type, status, request_id)
                 status_code = response.status_code
                 req_id = getattr(request.state, 'request_id', 'unknown')
                 
                 log_data = {
                     "user_email": user_email,
                     "user_name": user_name,
                     "action": f"{request.method} {request.url.path}",
                     "target": str(request.url.path),
                     # "target_type": "api_endpoint", # Column missing in DB
                     "details": f"Status: {status_code} | RequestID: {req_id} | Type: api_endpoint",
                     "ip_address": request.client.host if request.client else "unknown",
                     "user_agent": request.headers.get("user-agent", "unknown"),
                     "timestamp": datetime.utcnow(),
                     # "status": "success", # Column missing in DB
                     # "request_id": req_id # Column missing in DB
                 }
                 
                 # Save to DB
                 from app.config.database import SessionLocal
                 from app.repositories.analytics_repository import AnalyticsRepository
                 
                 db = SessionLocal()
                 try:
                     repo = AnalyticsRepository(db)
                     repo.create_audit_log(log_data)
                 finally:
                     db.close()
                     
            except Exception as e:
                logger = logging.getLogger(__name__)
                logger.error(f"Failed to write audit log: {e}")
                
        return response


def setup_middleware(app: FastAPI) -> None:
    """
    Setup all middleware for the FastAPI application.
    Order matters! Middleware is executed in reverse order of addition.

    Args:
        app: FastAPI application instance
    """
    # 1. CORS middleware (must be first for proper preflight handling)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins_list,
        allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?", # Allow any localhost port
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID", "X-Process-Time"],
    )

    # 2. Request size limit
    app.add_middleware(
        RequestSizeLimitMiddleware,
        max_size=settings.max_video_size_bytes,  # Use video size as max
    )

    # 3. Security headers
    app.add_middleware(SecurityHeadersMiddleware)

    # 4. Error handling (catches exceptions from downstream middleware)
    app.add_middleware(ErrorHandlingMiddleware)

    # 5. Database Audit Logging (logs State-Changing actions)
    app.add_middleware(DatabaseAuditMiddleware)

    # 6. Request logging (outermost - logs everything)
    app.add_middleware(RequestLoggingMiddleware)




    # 6. Rate limiting
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

    logger.info("Middleware setup complete")
    logger.info(f"CORS configured for origins: {settings.allowed_origins_list}")


# ===========================================
# RATE LIMIT DECORATORS
# ===========================================

def rate_limit_login():
    """Rate limit decorator for login endpoints."""
    return limiter.limit(settings.RATE_LIMIT_LOGIN)


def rate_limit_register():
    """Rate limit decorator for registration endpoints."""
    return limiter.limit(settings.RATE_LIMIT_REGISTER)


def rate_limit_ai():
    """Rate limit decorator for AI-powered endpoints."""
    return limiter.limit(settings.RATE_LIMIT_AI)


def rate_limit_upload():
    """Rate limit decorator for file upload endpoints."""
    return limiter.limit(settings.RATE_LIMIT_UPLOAD)


def rate_limit_default():
    """Rate limit decorator with default limits."""
    return limiter.limit(settings.RATE_LIMIT_DEFAULT)
