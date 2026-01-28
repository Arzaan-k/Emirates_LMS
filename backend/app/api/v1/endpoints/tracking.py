"""
Tracking Endpoints
Attendance, location tracking, and punch-in/out functionality
"""

import uuid
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime

from fastapi import APIRouter, Depends, Form, HTTPException, Body
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.core.dependencies import get_current_user
from app.repositories.tracking_repository import (
    AttendanceRepository,
    LocationTrackingRepository,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/tracking", tags=["Tracking"])


# ==========================================
# ATTENDANCE ENDPOINTS
# ==========================================

@router.post("/attendance/punch-in")
async def punch_in(
    data: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
):
    """
    Record a punch-in for a user.
    """
    repo = AttendanceRepository(db)
    
    user_email = data.get("user_email", "")
    store = data.get("store", "")
    
    if not user_email:
        raise HTTPException(status_code=400, detail="user_email is required")
    
    # Check if already punched in
    existing = repo.get_active_punch_in(user_email)
    if existing:
        return {
            "status": "already_punched_in",
            "message": "Already punched in",
            "record_id": existing.id,
            "punch_in_time": existing.punch_in.isoformat() if existing.punch_in else None
        }
    
    attendance_data = {
        "id": str(uuid.uuid4()),
        "user_email": user_email,
        "punch_in": datetime.utcnow(),
        "status": "active",
        "store": store,
    }
    
    try:
        record = repo.punch_in(attendance_data)
        logger.info(f"User punched in: {user_email}")
        return {
            "status": "success",
            "message": "Punched in successfully",
            "record_id": record.id,
            "punch_in_time": record.punch_in.isoformat() if record.punch_in else None
        }
    except Exception as e:
        logger.error(f"Punch-in failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/attendance/punch-out")
async def punch_out(
    data: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
):
    """
    Record a punch-out for a user.
    """
    repo = AttendanceRepository(db)
    
    user_email = data.get("user_email", "")
    
    if not user_email:
        raise HTTPException(status_code=400, detail="user_email is required")
    
    try:
        record = repo.punch_out(user_email)
        if record:
            logger.info(f"User punched out: {user_email}")
            return {
                "status": "success",
                "message": "Punched out successfully",
                "record_id": record.id,
                "punch_out_time": record.punch_out.isoformat() if record.punch_out else None,
                "duration_minutes": record.duration_minutes
            }
        else:
            return {
                "status": "not_punched_in",
                "message": "No active punch-in found"
            }
    except Exception as e:
        logger.error(f"Punch-out failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/attendance/status/{user_email}")
async def get_attendance_status(
    user_email: str,
    db: Session = Depends(get_db)
):
    """
    Get current attendance status for a user.
    """
    repo = AttendanceRepository(db)
    
    active = repo.get_active_punch_in(user_email)
    
    if active:
        return {
            "is_punched_in": True,
            "record_id": active.id,
            "punch_in_time": active.punch_in.isoformat() if active.punch_in else None,
            "store": active.store
        }
    else:
        return {
            "is_punched_in": False,
            "record_id": None,
            "punch_in_time": None
        }


@router.get("/attendance/records/{user_email}")
async def get_attendance_records(
    user_email: str,
    db: Session = Depends(get_db)
):
    """
    Get attendance records for a user.
    """
    repo = AttendanceRepository(db)
    
    records = repo.get_by_user(user_email)
    
    result = []
    for record in records:
        result.append({
            "id": record.id,
            "punch_in": record.punch_in.isoformat() if record.punch_in else None,
            "punch_out": record.punch_out.isoformat() if record.punch_out else None,
            "duration_minutes": record.duration_minutes,
            "status": record.status,
            "store": record.store
        })
    
    return result


@router.get("/attendance/all")
async def get_all_attendance(db: Session = Depends(get_db)):
    """
    Get all attendance records (admin).
    """
    repo = AttendanceRepository(db)
    
    records = repo.get_all_records()
    
    result = []
    for record in records:
        result.append({
            "id": record.id,
            "user_email": record.user_email,
            "punch_in": record.punch_in.isoformat() if record.punch_in else None,
            "punch_out": record.punch_out.isoformat() if record.punch_out else None,
            "duration_minutes": record.duration_minutes,
            "status": record.status,
            "store": record.store
        })
    
    return result


# ==========================================
# LOCATION TRACKING ENDPOINTS
# ==========================================

@router.post("/location/update")
async def update_location(
    data: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
):
    """
    Update user's location.
    """
    repo = LocationTrackingRepository(db)
    
    user_email = data.get("user_email", "")
    latitude = data.get("latitude", 0)
    longitude = data.get("longitude", 0)
    
    if not user_email:
        raise HTTPException(status_code=400, detail="user_email is required")
    
    location_data = {
        # "id": str(uuid.uuid4()),  # Removed: ID is Integer and auto-incremented
        "user_email": user_email,
        "latitude": float(latitude),
        "longitude": float(longitude),
        "accuracy": float(data.get("accuracy", 0)),
        "store": data.get("store", ""),
        "active": True,
        "timestamp": datetime.utcnow(),
    }
    
    try:
        record = repo.update_location(location_data)
        logger.info(f"Location updated for: {user_email}")
        return {
            "status": "success",
            "message": "Location updated",
            "timestamp": record.timestamp.isoformat() if record.timestamp else None
        }
    except Exception as e:
        logger.error(f"Location update failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/location/stop")
async def stop_tracking(
    data: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
):
    """
    Stop location tracking for a user.
    """
    repo = LocationTrackingRepository(db)
    
    user_email = data.get("user_email") or data.get("user_id", "")
    
    if not user_email:
        raise HTTPException(status_code=400, detail="user_email is required")
    
    try:
        record = repo.stop_tracking(user_email)
        logger.info(f"Location tracking stopped for: {user_email}")
        return {
            "status": "success",
            "message": "Location tracking stopped"
        }
    except Exception as e:
        logger.error(f"Stop tracking failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/location/user/{user_email}")
async def get_user_location(
    user_email: str,
    db: Session = Depends(get_db)
):
    """
    Get latest location for a user.
    """
    repo = LocationTrackingRepository(db)
    
    location = repo.get_user_latest_location(user_email)
    
    if location:
        return {
            "user_email": user_email,
            "latitude": location.latitude,
            "longitude": location.longitude,
            "accuracy": location.accuracy,
            "timestamp": location.timestamp.isoformat() if location.timestamp else None,
            "active": location.active
        }
    else:
        return {
            "user_email": user_email,
            "latitude": None,
            "longitude": None,
            "active": False
        }


@router.get("/location/all")
async def get_all_locations(db: Session = Depends(get_db)):
    """
    Get all active locations (for live tracking).
    """
    repo = LocationTrackingRepository(db)
    
    locations = repo.get_active_locations()
    
    result = []
    for loc in locations:
        result.append({
            "user_email": loc.user_email,
            "latitude": loc.latitude,
            "longitude": loc.longitude,
            "accuracy": loc.accuracy,
            "timestamp": loc.timestamp.isoformat() if loc.timestamp else None,
            "store": loc.store
        })
    
    return result
