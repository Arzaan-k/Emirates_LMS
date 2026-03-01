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
from app.core.access_filter import get_access_filter_context
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
async def get_all_attendance(
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Get all attendance records (admin), filtered by access controls.
    """
    repo = AttendanceRepository(db)
    access_context = get_access_filter_context(db, current_user)
    
    records = repo.get_all_records()
    
    result = []
    
    # Pre-fetch user emails that can be accessed by the current user
    is_superadmin = access_context.get('is_superadmin', False)
    accessible_emails = access_context.get('accessible_emails', set())
    viewer_email = access_context.get('viewer_email')
    
    for record in records:
        # Access control
        if not is_superadmin:
            if accessible_emails:
                if record.user_email not in accessible_emails:
                    continue
            elif record.user_email != viewer_email:
                continue

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
async def get_all_locations(
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Get all location records for live tracking, filtered by access controls.

    A user is considered "actively tracking" only when:
      1. Their latest LocationTracking record has active == True, AND
      2. That record's timestamp is within the last 30 minutes.

    If either condition fails the record is returned with active=False and
    a last_seen_minutes field so the frontend can display "Last seen X min ago".
    Lat/lng are hidden (None) for inactive users so they don't appear as map pins.
    """
    from app.models.user import User
    from app.models.tracking import LocationTracking
    from sqlalchemy import func

    access_context = get_access_filter_context(db, current_user)
    is_superadmin = access_context.get('is_superadmin', False)
    accessible_emails = access_context.get('accessible_emails', set())
    viewer_email = access_context.get('viewer_email')

    # ------------------------------------------------------------------
    # Step 1: Get the LATEST location record per user via a subquery
    # ------------------------------------------------------------------
    latest_ts_sq = (
        db.query(
            LocationTracking.user_email,
            func.max(LocationTracking.timestamp).label("max_ts")
        )
        .group_by(LocationTracking.user_email)
        .subquery()
    )

    locations_query = (
        db.query(LocationTracking, User.name, User.role)
        .outerjoin(User, LocationTracking.user_email == User.email)
        .join(
            latest_ts_sq,
            (LocationTracking.user_email == latest_ts_sq.c.user_email) &
            (LocationTracking.timestamp == latest_ts_sq.c.max_ts)
        )
    )

    # Apply email-level access control at the DB layer
    if not is_superadmin:
        if accessible_emails:
            locations_query = locations_query.filter(
                LocationTracking.user_email.in_(accessible_emails)
            )
        elif viewer_email:
            locations_query = locations_query.filter(
                LocationTracking.user_email == viewer_email
            )
        else:
            return []  # No access at all

    locations = locations_query.order_by(LocationTracking.timestamp.desc()).all()

    # ------------------------------------------------------------------
    # Step 2: Build result with staleness check and last-seen time
    # ------------------------------------------------------------------
    # A record is truly "active" only if it was updated within the last 30 min
    STALE_MINUTES = 30
    now = datetime.utcnow()

    result = []
    for loc, user_name, user_role in locations:
        last_seen_minutes = None
        is_truly_active = False

        if loc.timestamp:
            age_seconds = (now - loc.timestamp).total_seconds()
            last_seen_minutes = int(age_seconds / 60)
            # Truly active: user explicitly has active=True AND updated recently
            is_truly_active = loc.active and (age_seconds <= STALE_MINUTES * 60)

        result.append({
            "user_email": loc.user_email,
            "user_name": user_name or loc.user_email,
            "role": user_role,
            # Only expose coordinates when actively tracking
            "latitude": loc.latitude if is_truly_active else None,
            "longitude": loc.longitude if is_truly_active else None,
            "accuracy": loc.accuracy if is_truly_active else None,
            "timestamp": loc.timestamp.isoformat() if loc.timestamp else None,
            "last_seen_minutes": last_seen_minutes,
            "store": loc.store,
            "active": is_truly_active,
        })

    return result
