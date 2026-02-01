"""
Meeting Endpoints
Virtual meetings, video calls, scheduling
"""

import uuid
import json
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime

from fastapi import APIRouter, Depends, Form, HTTPException
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.core.dependencies import get_current_user
from app.repositories.meeting_repository import MeetingRepository
from app.repositories.tracking_repository import AttendanceRepository, LocationTrackingRepository
from app.core.websocket import manager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/meetings", tags=["Meetings"])


# ==========================================
# MEETING CRUD ENDPOINTS
# ==========================================

@router.get("")
def get_meetings(db: Session = Depends(get_db)):
    """
    Get all upcoming and ongoing meetings.
    """
    repo = MeetingRepository(db)

    try:
        meetings = repo.get_all_meetings()
        result = []
        for meeting in meetings:
            meeting_dict = meeting.to_dict() if hasattr(meeting, 'to_dict') else dict(meeting)
            result.append(meeting_dict)
        return result
    except Exception as e:
        logger.error(f"Meetings fetch failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch meetings")


@router.get("/{meeting_id}")
def get_meeting(meeting_id: str, db: Session = Depends(get_db)):
    """
    Get a specific meeting by ID.
    """
    repo = MeetingRepository(db)

    try:
        meeting = repo.get_by_id(meeting_id)
        if not meeting:
            raise HTTPException(status_code=404, detail="Meeting not found")

        return meeting.to_dict() if hasattr(meeting, 'to_dict') else dict(meeting)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Meeting fetch failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch meeting")


@router.post("")
async def create_meeting(
    title: str = Form(...),
    description: str = Form(""),
    scheduled_at: str = Form(...),
    duration_minutes: int = Form(30),
    host_name: str = Form(...),
    host_email: str = Form(...),
    invited_users: str = Form("[]"),
    db: Session = Depends(get_db)
):
    """
    Create a new virtual meeting and notify invited users.
    """
    repo = MeetingRepository(db)

    try:
        invited_list = json.loads(invited_users) if invited_users else []
    except:
        invited_list = []

    meeting_id = f"meet_{uuid.uuid4().hex[:8]}"

    # Parse scheduled_at
    try:
        scheduled_datetime = datetime.fromisoformat(scheduled_at.replace('Z', '+00:00'))
    except:
        scheduled_datetime = datetime.utcnow()

    meeting_data = {
        "id": meeting_id,
        "title": title,
        "description": description,
        "scheduled_at": scheduled_datetime,
        "duration_minutes": duration_minutes,
        "host_name": host_name,
        "host_email": host_email,
        "status": "scheduled",
        "participants": [],
        "room_id": f"room_{uuid.uuid4().hex[:12]}",
        "created_at": datetime.utcnow(),
    }

    try:
        meeting = repo.create_meeting(meeting_data)
        logger.info(f"Meeting created: {meeting_id}")

        meeting_dict = meeting.to_dict() if hasattr(meeting, 'to_dict') else meeting_data
        if isinstance(meeting_dict, dict):
            meeting_dict['status'] = 'success'

        # Broadcast meeting notification to all connected clients
        await manager.broadcast_notification(
            notification_type="MEETING_SCHEDULED",
            data=meeting_dict,
            title=f"📅 Meeting: {title}",
            message=f"{host_name} scheduled a meeting for {scheduled_at[:16].replace('T', ' at ')}. Tap to join when it starts."
        )

        return meeting_dict
    except Exception as e:
        logger.error(f"Meeting creation failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to create meeting")


@router.post("/{meeting_id}/join")
async def join_meeting(
    meeting_id: str,
    user_email: str = Form(...),
    user_name: str = Form(...),
    db: Session = Depends(get_db)
):
    """
    Mark a user as joined a meeting.
    """
    repo = MeetingRepository(db)

    try:
        result = repo.add_participant(meeting_id, user_email, user_name)
        if not result:
            raise HTTPException(status_code=404, detail="Meeting not found")

        logger.info(f"User joined meeting: {user_email} -> {meeting_id}")

        result_dict = result.to_dict() if hasattr(result, 'to_dict') else result

        # Broadcast participant joined event
        await manager.broadcast_notification(
            notification_type="MEETING_PARTICIPANT_JOINED",
            data={
                "meeting_id": meeting_id,
                "participant": {"user_email": user_email, "user_name": user_name}
            }
        )

        return result_dict
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Join meeting failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to join meeting")


@router.post("/{meeting_id}/leave")
async def leave_meeting(
    meeting_id: str,
    user_email: str = Form(...),
    db: Session = Depends(get_db)
):
    """
    Mark a user as left a meeting.
    """
    repo = MeetingRepository(db)

    try:
        result = repo.remove_participant(meeting_id, user_email)
        if not result:
            raise HTTPException(status_code=404, detail="Meeting not found")

        logger.info(f"User left meeting: {user_email} -> {meeting_id}")
        return result.to_dict() if hasattr(result, 'to_dict') else result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Leave meeting failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to leave meeting")


@router.post("/{meeting_id}/end")
async def end_meeting(meeting_id: str, db: Session = Depends(get_db)):
    """
    End a meeting (host only).
    """
    repo = MeetingRepository(db)

    try:
        result = repo.end_meeting(meeting_id)
        if not result:
            raise HTTPException(status_code=404, detail="Meeting not found")

        logger.info(f"Meeting ended: {meeting_id}")

        result_dict = result.to_dict() if hasattr(result, 'to_dict') else result

        # Broadcast meeting ended event
        await manager.broadcast_notification(
            notification_type="MEETING_ENDED",
            data={
                "meeting_id": meeting_id,
                "title": result_dict.get("title", "Meeting")
            }
        )

        return result_dict
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"End meeting failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to end meeting")


@router.delete("/{meeting_id}")
async def delete_meeting(meeting_id: str, db: Session = Depends(get_db)):
    """
    Cancel/delete a meeting.
    """
    repo = MeetingRepository(db)

    try:
        success = repo.delete_meeting(meeting_id)
        if not success:
            raise HTTPException(status_code=404, detail="Meeting not found")

        logger.info(f"Meeting deleted: {meeting_id}")
        return {"message": f"Meeting {meeting_id} deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Meeting deletion failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete meeting")


# ==========================================
# ATTENDANCE ENDPOINTS
# ==========================================

@router.get("/attendance/all")
async def get_all_attendance(db: Session = Depends(get_db)):
    """
    Get all attendance records.
    """
    repo = AttendanceRepository(db)

    try:
        records = repo.get_all_records()
        result = []
        for record in records:
            record_dict = record.to_dict() if hasattr(record, 'to_dict') else dict(record)
            result.append(record_dict)
        return result
    except Exception as e:
        logger.error(f"Attendance fetch failed: {e}")
        return []


@router.get("/attendance/user/{user_email}")
async def get_user_attendance(user_email: str, db: Session = Depends(get_db)):
    """
    Get attendance records for a specific user.
    """
    repo = AttendanceRepository(db)

    try:
        records = repo.get_by_user(user_email)
        result = []
        for record in records:
            record_dict = record.to_dict() if hasattr(record, 'to_dict') else dict(record)
            result.append(record_dict)
        return result
    except Exception as e:
        logger.error(f"User attendance fetch failed: {e}")
        return []


@router.post("/attendance/punch-in")
async def punch_in(
    user_email: str = Form(...),
    user_name: str = Form(...),
    store: str = Form(None),
    db: Session = Depends(get_db)
):
    """
    Record punch-in time for a user.
    """
    repo = AttendanceRepository(db)

    # Check if already punched in
    existing = repo.get_active_punch_in(user_email)
    if existing:
        raise HTTPException(
            status_code=400,
            detail="Already punched in. Please punch out first."
        )

    record_data = {
        "id": f"att_{uuid.uuid4().hex[:8]}",
        "user_email": user_email,
        "user_name": user_name,
        "store": store,
        "punch_in": datetime.utcnow(),
        "status": "active",
    }

    try:
        record = repo.punch_in(record_data)
        logger.info(f"Punch in: {user_email}")
        return record.to_dict() if hasattr(record, 'to_dict') else record_data
    except Exception as e:
        logger.error(f"Punch in failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to record punch-in")


@router.post("/attendance/punch-out")
async def punch_out(
    user_email: str = Form(...),
    db: Session = Depends(get_db)
):
    """
    Record punch-out time for a user.
    """
    repo = AttendanceRepository(db)

    try:
        record = repo.punch_out(user_email)
        if not record:
            raise HTTPException(status_code=404, detail="No active punch-in found")

        logger.info(f"Punch out: {user_email}")
        return record.to_dict() if hasattr(record, 'to_dict') else record
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Punch out failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to record punch-out")


# ==========================================
# LOCATION TRACKING ENDPOINTS
# ==========================================

@router.post("/location/update")
async def update_location(
    data: Dict[str, Any],
    db: Session = Depends(get_db)
):
    """
    Employee sends GPS coordinates.
    """
    repo = LocationTrackingRepository(db)

    user_email = data.get("user_id", data.get("email"))

    if not user_email:
        raise HTTPException(status_code=400, detail="User identifier required")

    location_data = {
        "user_email": user_email,
        "user_name": data.get("name", "Unknown"),
        "latitude": data.get("latitude"),
        "longitude": data.get("longitude"),
        "active": True,
        "accuracy": data.get("accuracy"),
        "altitude": data.get("altitude"),
        "speed": data.get("speed"),
        "heading": data.get("heading"),
        "battery_level": data.get("battery_level"),
        "store": data.get("store"),
    }

    try:
        location = repo.update_location(location_data)
        logger.info(f"Location updated: {user_email}")
        return {"success": True}
    except Exception as e:
        logger.error(f"Location update failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to update location")


@router.post("/location/stop")
async def stop_location(data: Dict[str, Any], db: Session = Depends(get_db)):
    """
    Employee stops sharing location.
    """
    repo = LocationTrackingRepository(db)

    user_email = data.get("user_id", data.get("email"))

    if not user_email:
        raise HTTPException(status_code=400, detail="User identifier required")

    try:
        repo.stop_tracking(user_email)
        logger.info(f"Location tracking stopped: {user_email}")
        return {"success": True}
    except Exception as e:
        logger.error(f"Stop tracking failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to stop tracking")


@router.get("/locations/all")
async def get_all_locations(db: Session = Depends(get_db)):
    """
    Returns all employee locations for Admin/Manager.
    """
    repo = LocationTrackingRepository(db)

    try:
        locations = repo.get_active_locations()
        result = []
        for loc in locations:
            loc_dict = loc.to_dict() if hasattr(loc, 'to_dict') else dict(loc)
            result.append(loc_dict)
        return result
    except Exception as e:
        logger.error(f"Locations fetch failed: {e}")
        return []
