"""
Notifications Endpoints
System notifications, news feed, broadcasts
"""

import os
import uuid
import json
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime

from fastapi import APIRouter, Depends, Form, File, UploadFile, HTTPException
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.config.settings import settings
from app.core.dependencies import get_current_user
from app.repositories.notification_repository import NotificationRepository, NewsFeedRepository
from app.repositories.crm_repository import CRMRepository
from app.core.websocket import manager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/notifications", tags=["Notifications"])


# ==========================================
# NOTIFICATION ENDPOINTS
# ==========================================

@router.get("")
async def get_notifications(
    user_id: Optional[str] = "user",
    db: Session = Depends(get_db)
):
    """
    Returns all stored notifications for a user.
    """
    repo = NotificationRepository(db)

    try:
        notifications = repo.get_all_notifications()

        result = []
        for notif in notifications:
            notif_dict = notif.to_dict() if hasattr(notif, 'to_dict') else dict(notif)
            # Check if user has read this notification
            read_by = notif.read_by or []
            notif_dict["read"] = user_id in read_by
            result.append(notif_dict)

        return result
    except Exception as e:
        logger.error(f"Notifications fetch failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch notifications")


@router.get("/crucial")
async def get_crucial_notifications(
    user_id: str = "user",
    db: Session = Depends(get_db)
):
    """
    Returns the first unread crucial notification for this user (for blocking modal).
    """
    repo = NotificationRepository(db)

    try:
        notification = repo.get_crucial_unread_for_user(user_id)
        if notification:
            return notification.to_dict() if hasattr(notification, 'to_dict') else notification
        return None
    except Exception as e:
        logger.error(f"Crucial notification fetch failed: {e}")
        return None


@router.post("")
async def send_notification(
    title: str = Form(...),
    message: str = Form(...),
    type: str = Form("info"),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db)
):
    """
    Broadcasts a system-wide notification AND stores it.
    Supports optional media attachment (Image/Video).
    """
    from app.services.cdn_service import CDNService

    cdn_service = CDNService()
    repo = NotificationRepository(db)

    media_url = None

    if file:
        try:
            content = await file.read()
            filename = file.filename or "media"

            if cdn_service.enabled:
                key = f"notifications/{uuid.uuid4().hex[:8]}_{filename}"
                upload_result = cdn_service.upload_file(content, key, file.content_type)
                media_url = upload_result.get("url") if isinstance(upload_result, dict) else upload_result
            else:
                # Save locally
                local_path = os.path.join(settings.UPLOAD_DIR, f"notif_{uuid.uuid4().hex[:8]}_{filename}")
                with open(local_path, "wb") as f:
                    f.write(content)
                media_url = f"{settings.BASE_URL}/uploads/{os.path.basename(local_path)}"
        except Exception as e:
            logger.error(f"Media upload failed: {e}")

    notification_data = {
        "id": f"notif_{uuid.uuid4().hex[:8]}",
        "title": title,
        "message": message,
        "notification_type": type,
        "is_crucial": type == "crucial",
        "created_at": datetime.utcnow(),
        "read_by": [],
        "target_users": [],
        "target_stores": [],
        "target_roles": [],
        "extra_data": {"media_url": media_url} if media_url else {},
    }

    try:
        notification = repo.create_notification(notification_data)
        logger.info(f"Notification sent: {notification_data['id']}")

        notification_dict = notification.to_dict() if hasattr(notification, 'to_dict') else notification_data

        # Frontend expects status field
        if isinstance(notification_dict, dict):
            notification_dict['status'] = 'success'

        # Broadcast notification to all connected WebSocket clients
        notification_type = "CRUCIAL_NOTIFICATION" if type == "crucial" else "NOTIFICATION"
        await manager.broadcast_notification(
            notification_type=notification_type,
            data=notification_dict,
            title=title,
            message=message
        )

        return notification_dict
    except Exception as e:
        logger.error(f"Notification creation failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to create notification")


# Alias for POST / - frontend calls /send
@router.post("/send")
async def send_notification_alias(
    title: str = Form(...),
    message: str = Form(...),
    type: str = Form("info"),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db)
):
    """
    Alias for POST /notifications/ - backward compatibility with frontend.
    """
    return await send_notification(title, message, type, file, db)


@router.put("/{notif_id}/read")
async def mark_notification_read(
    notif_id: str,
    user_id: str = "user",
    db: Session = Depends(get_db)
):
    """
    Marks a notification as read for a specific user.
    """
    repo = NotificationRepository(db)

    try:
        notification = repo.mark_as_read(notif_id, user_id)
        if notification:
            return {"message": f"Notification {notif_id} marked as read"}
        raise HTTPException(status_code=404, detail="Notification not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Mark as read failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to mark notification as read")


# POST alias for PUT /{notif_id}/read
@router.post("/{notif_id}/read")
async def mark_notification_read_post(
    notif_id: str,
    user_id: str = "user",
    db: Session = Depends(get_db)
):
    """
    POST alias for mark as read - backward compatibility.
    """
    return await mark_notification_read(notif_id, user_id, db)


@router.delete("/{notif_id}")
async def delete_notification(
    notif_id: str,
    db: Session = Depends(get_db)
):
    """
    Delete a notification.
    """
    repo = NotificationRepository(db)

    try:
        success = repo.delete_notification(notif_id)
        if success:
            logger.info(f"Notification deleted: {notif_id}")
            return {"message": f"Notification {notif_id} deleted"}
        raise HTTPException(status_code=404, detail="Notification not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Notification deletion failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete notification")


# ==========================================
# NEWS FEED ENDPOINTS
# ==========================================

@router.get("/news")
async def get_news(db: Session = Depends(get_db)):
    """
    Get all news articles, sorted by date (newest first).
    """
    repo = NewsFeedRepository(db)

    try:
        news = repo.get_published()
        result = []
        for article in news:
            article_dict = article.to_dict() if hasattr(article, 'to_dict') else dict(article)
            result.append(article_dict)
        return result
    except Exception as e:
        logger.error(f"News fetch failed: {e}")
        return []


@router.post("/news")
async def create_news(
    title: str = Form(...),
    content: str = Form(...),
    author: str = Form(...),
    image: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db)
):
    """
    Create a new news article and broadcast to all users.
    Images uploaded to CDN.
    """
    from app.services.cdn_service import CDNService

    cdn_service = CDNService()
    repo = NewsFeedRepository(db)

    image_url = None

    if image:
        try:
            content_bytes = await image.read()
            filename = image.filename or "news_image"

            if cdn_service.enabled:
                key = f"news/{uuid.uuid4().hex[:8]}_{filename}"
                upload_result = cdn_service.upload_file(content_bytes, key, image.content_type)
                image_url = upload_result.get("url") if isinstance(upload_result, dict) else upload_result
            else:
                local_path = os.path.join(settings.UPLOAD_DIR, f"news_{uuid.uuid4().hex[:8]}_{filename}")
                with open(local_path, "wb") as f:
                    f.write(content_bytes)
                image_url = f"{settings.BASE_URL}/uploads/{os.path.basename(local_path)}"
        except Exception as e:
            logger.error(f"News image upload failed: {e}")

    news_data = {
        "id": f"news_{uuid.uuid4().hex[:8]}",
        "title": title,
        "content": content,
        "author": author,
        "image": image_url,
        "date": datetime.utcnow().strftime("%B %d, %Y"),
        "created_at": datetime.utcnow(),
        "is_published": True,
        "is_pinned": False,
        "likes": [],
        "comments": [],
        "view_count": 0,
    }

    try:
        news = repo.create_news(news_data)
        logger.info(f"News created: {news_data['id']}")

        response = news.to_dict() if hasattr(news, 'to_dict') else news_data
        response["status"] = "success"

        # Broadcast news post to all connected clients
        await manager.broadcast_notification(
            notification_type="NEWS_POSTED",
            data=response,
            title=f"📰 {title}",
            message=f"New announcement from {author}"
        )

        return response
    except Exception as e:
        logger.error(f"News creation failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to create news")


@router.delete("/news/{news_id}")
async def delete_news(
    news_id: str,
    db: Session = Depends(get_db)
):
    """
    Delete a news article - from DATABASE and CDN.
    """
    repo = NewsFeedRepository(db)

    try:
        success = repo.delete_news(news_id)
        if success:
            logger.info(f"News deleted: {news_id}")
            return {"status": "success", "message": f"News {news_id} deleted"}
        raise HTTPException(status_code=404, detail="News not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"News deletion failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete news")


# ==========================================
# SUPPORT TICKET ENDPOINTS (Using CRM)
# ==========================================

SUPPORT_CATEGORIES = [
    {"id": "bug", "name": "Bug Report", "icon": "bug", "color": "#EF4444"},
    {"id": "feature", "name": "Feature Request", "icon": "lightbulb-on", "color": "#F59E0B"},
    {"id": "help", "name": "Help & Questions", "icon": "help-circle", "color": "#3B82F6"},
    {"id": "complaint", "name": "Complaint", "icon": "alert-circle", "color": "#DC2626"},
    {"id": "feedback", "name": "General Feedback", "icon": "message-square", "color": "#10B981"},
]


@router.get("/support/categories")
async def get_support_categories():
    """
    Get available support ticket categories.
    """
    return SUPPORT_CATEGORIES


@router.post("/support")
async def create_support_ticket(
    user_email: str = Form(...),
    user_name: str = Form("User"),
    user_role: str = Form("user"),
    subject: str = Form(...),
    message: str = Form(...),
    category: str = Form("help"),
    priority: str = Form("medium"),
    db: Session = Depends(get_db)
):
    """
    Create a new support ticket to LMS team.
    Uses CRM ticket system for database persistence.
    """
    crm_repo = CRMRepository(db)

    # Find category name
    category_name = next(
        (c["name"] for c in SUPPORT_CATEGORIES if c["id"] == category),
        "Help & Questions"
    )

    ticket_data = {
        "id": f"ticket_{uuid.uuid4().hex[:8]}",
        "type": "Support",
        "category_id": category,
        "category_name": category_name,
        "customer_name": user_name,
        "customer_email": user_email,
        "subject": subject,
        "description": message,
        "message": message, # Populate legacy column
        "priority": priority,
        "status": "open",
        "created_at": datetime.utcnow(),
        "tags": [user_role],
    }

    try:
        ticket = crm_repo.create_ticket(ticket_data)
        logger.info(f"Support ticket created: {ticket_data['id']}")

        # Return in the format expected by frontend
        return {
            "id": ticket.id,
            "user_email": ticket.customer_email,
            "user_name": ticket.customer_name,
            "user_role": user_role,
            "subject": ticket.subject,
            "message": ticket.description,
            "category": ticket.category_id,
            "priority": ticket.priority,
            "status": ticket.status,
            "created_at": ticket.created_at.isoformat() if ticket.created_at else None,
            "responses": [],
        }
    except Exception as e:
        logger.error(f"Support ticket creation failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to create support ticket")


@router.get("/support/user/{user_email}")
async def get_user_support_tickets(
    user_email: str,
    db: Session = Depends(get_db)
):
    """
    Get all support tickets for a specific user.
    """
    from app.repositories.crm_repository import CRMTicketRepository

    repo = CRMTicketRepository(db)

    try:
        # Get all tickets and filter by customer email
        all_tickets = repo.get_all()
        user_tickets = [
            t for t in all_tickets
            if t.customer_email == user_email and t.type == "Support"
        ]

        result = []
        for ticket in user_tickets:
            result.append({
                "id": ticket.id,
                "user_email": ticket.customer_email,
                "user_name": ticket.customer_name,
                "subject": ticket.subject,
                "message": ticket.description,
                "category": ticket.category_id,
                "priority": ticket.priority,
                "status": ticket.status,
                "created_at": ticket.created_at.isoformat() if ticket.created_at else None,
                "resolved_at": ticket.resolved_at.isoformat() if ticket.resolved_at else None,
                "responses": [],  # TODO: Add response tracking if needed
            })

        return sorted(result, key=lambda x: x.get("created_at", ""), reverse=True)
    except Exception as e:
        logger.error(f"User support tickets fetch failed: {e}")
        return []


@router.get("/support/all")
async def get_all_support_tickets(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get all support tickets (for LMS team/super admin).
    """
    from app.repositories.crm_repository import CRMTicketRepository

    repo = CRMTicketRepository(db)

    try:
        all_tickets = repo.get_all()
        support_tickets = [t for t in all_tickets if t.type == "Support"]

        result = []
        for ticket in support_tickets:
            result.append({
                "id": ticket.id,
                "user_email": ticket.customer_email,
                "user_name": ticket.customer_name,
                "subject": ticket.subject,
                "message": ticket.description,
                "category": ticket.category_id,
                "priority": ticket.priority,
                "status": ticket.status,
                "created_at": ticket.created_at.isoformat() if ticket.created_at else None,
                "resolved_at": ticket.resolved_at.isoformat() if ticket.resolved_at else None,
                "responses": [],
            })

        return sorted(result, key=lambda x: x.get("created_at", ""), reverse=True)
    except Exception as e:
        logger.error(f"All support tickets fetch failed: {e}")
        return []


@router.post("/support/{ticket_id}/respond")
async def respond_to_support_ticket(
    ticket_id: str,
    responder_email: str = Form(...),
    responder_name: str = Form("LMS Team"),
    response_message: str = Form(...),
    new_status: str = Form(None),
    db: Session = Depends(get_db)
):
    """
    Add a response to a support ticket.
    Note: For full response tracking, consider adding a ticket_responses table.
    Currently updates the resolution field.
    """
    from app.repositories.crm_repository import CRMTicketRepository

    repo = CRMTicketRepository(db)

    try:
        ticket = repo.get_by_id(ticket_id)
        if not ticket:
            raise HTTPException(status_code=404, detail="Ticket not found")

        # Update ticket with response (store in resolution field for now)
        existing_resolution = ticket.resolution or ""
        timestamp = datetime.utcnow().isoformat()
        new_response = f"\n\n[{timestamp}] {responder_name} ({responder_email}):\n{response_message}"
        ticket.resolution = existing_resolution + new_response

        if new_status:
            ticket.status = new_status
            if new_status == "resolved":
                ticket.resolved_at = datetime.utcnow()

        ticket.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(ticket)

        logger.info(f"Response added to ticket: {ticket_id}")

        return {
            "id": ticket.id,
            "user_email": ticket.customer_email,
            "user_name": ticket.customer_name,
            "subject": ticket.subject,
            "message": ticket.description,
            "category": ticket.category_id,
            "priority": ticket.priority,
            "status": ticket.status,
            "created_at": ticket.created_at.isoformat() if ticket.created_at else None,
            "resolved_at": ticket.resolved_at.isoformat() if ticket.resolved_at else None,
            "responses": [],  # Parse from resolution if needed
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Response to ticket failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to respond to ticket")


@router.put("/support/{ticket_id}/status")
async def update_ticket_status(
    ticket_id: str,
    new_status: str = Form(...),
    db: Session = Depends(get_db)
):
    """
    Update support ticket status.
    """
    from app.repositories.crm_repository import CRMTicketRepository

    repo = CRMTicketRepository(db)

    try:
        ticket = repo.get_by_id(ticket_id)
        if not ticket:
            raise HTTPException(status_code=404, detail="Ticket not found")

        ticket.status = new_status
        if new_status == "resolved":
            ticket.resolved_at = datetime.utcnow()

        ticket.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(ticket)

        logger.info(f"Ticket status updated: {ticket_id} -> {new_status}")

        return {
            "id": ticket.id,
            "user_email": ticket.customer_email,
            "user_name": ticket.customer_name,
            "subject": ticket.subject,
            "message": ticket.description,
            "category": ticket.category_id,
            "priority": ticket.priority,
            "status": ticket.status,
            "created_at": ticket.created_at.isoformat() if ticket.created_at else None,
            "resolved_at": ticket.resolved_at.isoformat() if ticket.resolved_at else None,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ticket status update failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to update ticket status")
