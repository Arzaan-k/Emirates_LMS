"""
Authentication Endpoints
Login, logout, register, token refresh
"""

import logging
from typing import Dict, Any, Optional

from fastapi import APIRouter, Depends, Form, Request, HTTPException
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.core.middleware import limiter
from app.services.user_service import UserService
from app.schemas.user import (
    UserCreate, UserResponse, LoginRequest, LoginResponse,
    TokenRefreshRequest, TokenRefreshResponse
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=LoginResponse)
@limiter.limit("5/minute")
async def login(
    request: Request,
    email: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db)
):
    """
    Authenticate user and return tokens.
    Rate limited to 5 attempts per minute.
    """
    service = UserService(db)
    try:
        result = service.authenticate(email, password)
        logger.info(f"User logged in: {email}")
        return result
    except Exception as e:
        logger.warning(f"Login failed for {email}: {e}")
        raise


@router.post("/login-json", response_model=LoginResponse)
@limiter.limit("5/minute")
async def login_json(
    request: Request,
    data: Dict[str, Any],
    db: Session = Depends(get_db)
):
    """
    Authenticate user with JSON body.
    Rate limited to 5 attempts per minute.
    """
    email = data.get("email", "")
    password = data.get("password", "")
    
    service = UserService(db)
    try:
        result = service.authenticate(email, password)
        logger.info(f"User logged in: {email}")
        return result
    except Exception as e:
        logger.warning(f"Login failed for {email}: {e}")
        raise


@router.post("/refresh", response_model=TokenRefreshResponse)
async def refresh_token(
    data: Dict[str, Any],
    db: Session = Depends(get_db)
):
    """
    Refresh access token using refresh token.
    """
    refresh_token = data.get("refresh_token", "")
    
    service = UserService(db)
    try:
        result = service.refresh_tokens(refresh_token)
        return result
    except Exception as e:
        logger.warning(f"Token refresh failed: {e}")
        raise


@router.post("/logout")
async def logout(
    access_token: str = Form(None),
    refresh_token: str = Form(None),
    db: Session = Depends(get_db)
):
    """
    Logout user and invalidate tokens.
    """
    service = UserService(db)
    try:
        service.logout(access_token, refresh_token)
        return {"message": "Logged out successfully"}
    except Exception as e:
        logger.warning(f"Logout failed: {e}")
        return {"message": "Logged out"}


@router.post("/register", response_model=UserResponse)
@limiter.limit("10/hour")
async def register(
    request: Request,
    email: str = Form(...),
    name: str = Form(...),
    password: str = Form(...),
    role: str = Form("Waffler"),
    store: str = Form("Unassigned"),
    db: Session = Depends(get_db)
):
    """
    Register a new user account.
    Rate limited to 10 registrations per hour.
    """
    service = UserService(db)
    user_data = {
        "email": email,
        "name": name,
        "password": password,
        "role": role,
        "category": "Employee",
        "store": store,
        "privileges": [],
        "is_superadmin": False,
        "has_admin_access": False,
    }
    
    try:
        user = service.create_user(user_data)
        logger.info(f"New user registered: {email}")
        return user
    except Exception as e:
        logger.error(f"Registration failed for {email}: {e}")
        raise
