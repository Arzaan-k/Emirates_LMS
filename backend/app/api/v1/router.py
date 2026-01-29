"""
API v1 Router
Combines all endpoint routers into a single API router
"""

from fastapi import APIRouter, Form, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.v1.endpoints import (
    auth,
    users,
    content,
    assessments,
    quizzes,
    analytics,
    notifications,
    meetings,
    crm,
    levels,
    simulations,
    ai,
    tracking,
    roleplay,
)

# Create the main API router
api_router = APIRouter()

# Include all endpoint routers
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(content.router)
api_router.include_router(assessments.router)
api_router.include_router(quizzes.router)
api_router.include_router(analytics.router)
api_router.include_router(notifications.router)
api_router.include_router(meetings.router)
api_router.include_router(crm.router)
api_router.include_router(levels.router)
api_router.include_router(simulations.router)
api_router.include_router(ai.router)
api_router.include_router(tracking.router)
api_router.include_router(roleplay.router)


# Health check endpoint at root level
@api_router.get("/health")
async def health_check():
    """
    Health check endpoint for monitoring and load balancers.
    """
    import os
    from datetime import datetime
    
    # Check database connectivity
    db_status = "unknown"
    try:
        from app.config.database import get_db
        from sqlalchemy import text
        db = next(get_db())
        db.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception as e:
        db_status = f"error: {str(e)}"
    
    # Check AI services
    ai_status = "configured" if os.environ.get("GROQ_API_KEY") else "not_configured"
    
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "2.0.0",
        "database": db_status,
        "ai_services": ai_status,
    }


# Privileges endpoint
@api_router.get("/privileges")
async def get_privileges():
    """
    Get all available privileges for creating users.
    """
    from app.services.user_service import ALL_PRIVILEGES
    
    PRIVILEGE_ICONS = {
        "team_list": "users",
        "reports": "bar-chart-2",
        "assign_quiz": "check-square",
        "audits": "shield",
        "upload_training": "upload-cloud",
        "bulk_upload": "database",
        "post_news": "bell",
        "post_quiz": "edit-3",
        "create_user": "user-plus",
        "live_tracking": "map-pin",
        "proctored_assessment": "monitor",
        "proctored_create_manage": "settings",
        "proctored_view_results": "file-text",
        "view_analytics": "trending-up",
        "send_notification": "send",
        "access_control": "lock",
        "manage_buckets": "folder-plus",
        "schedule_meeting": "video",
        "crm_tickets": "tag",
        "manage_simulations": "play-circle",
        "manage_learning_path": "git-merge",
        "scheduled_exams": "calendar",
        "exam_reports": "file-text",
        "support_library": "book-open",
        "view_audit_logs": "clipboard",
    }
    
    return {
        "privileges": [
            {
                "id": priv,
                "name": priv.replace("_", " ").title(),
                "icon": PRIVILEGE_ICONS.get(priv, "check")
            }
            for priv in ALL_PRIVILEGES
        ]
    }


# CDN status endpoint
@api_router.get("/cdn/status")
async def get_cdn_status():
    """
    Check CDN configuration and connectivity status.
    """
    from app.services.cdn_service import CDNService

    cdn = CDNService()
    return cdn.check_status()


# RAG status endpoint  
@api_router.get("/rag/status")
async def get_rag_status():
    """
    Check RAG system status and statistics.
    """
    from app.services.ai_service import AIService
    
    ai = AIService()
    return ai.get_rag_status()


# Audit logs endpoint
@api_router.get("/audit-logs")
async def get_audit_logs(
    action_type: str = None,
):
    """
    Get audit logs, optionally filtered by action type.
    """
    from app.config.database import get_db
    from app.repositories.analytics_repository import AnalyticsRepository

    try:
        db = next(get_db())
        repo = AnalyticsRepository(db)
        logs = repo.get_audit_logs(action_type)

        result = []
        for log in logs:
            log_dict = log.to_dict() if hasattr(log, 'to_dict') else dict(log)
            result.append(log_dict)

        return result
    except Exception as e:
        return []


# Backward compatibility alias for old frontend endpoint
@api_router.get("/scheduled-exams/user/{user_email}")
async def get_user_scheduled_exams_alias(user_email: str):
    """
    DEPRECATED: Backward compatibility alias for /assessments/scheduled/user/{email}
    Frontend should be updated to use the new endpoint.
    """
    from app.config.database import get_db
    from app.services.assessment_service import AssessmentService

    try:
        db = next(get_db())
        service = AssessmentService(db)
        exams = service.get_scheduled_exams_for_user(user_email)

        result = []
        for exam in exams:
            exam_dict = exam.to_dict() if hasattr(exam, 'to_dict') else dict(exam)
            result.append(exam_dict)

        return result
    except Exception as e:
        return []


# ==========================================
# SUPPORT TICKET BACKWARD COMPATIBILITY ALIASES
# ==========================================

# Create a separate router for support aliases to be mounted at root level if needed
support_router = APIRouter()

@support_router.get("/support/categories")
async def get_support_categories_alias():
    """
    BACKWARD COMPATIBILITY: Alias for /notifications/support/categories
    Frontend calls /support/categories directly.
    """
    from app.api.v1.endpoints.notifications import SUPPORT_CATEGORIES
    # Frontend expects { "categories": [...] }
    return {"categories": SUPPORT_CATEGORIES}


@support_router.get("/support/my-tickets/{user_email}")
async def get_my_support_tickets_alias(user_email: str):
    """
    BACKWARD COMPATIBILITY: Alias for /notifications/support/user/{email}
    Frontend calls /support/my-tickets/{email} directly.
    """
    from app.config.database import get_db
    from app.repositories.crm_repository import CRMTicketRepository
    import logging

    logger = logging.getLogger(__name__)

    try:
        db = next(get_db())
        repo = CRMTicketRepository(db)

        # Get all tickets and filter by customer email (and type='Support' if needed, or query parameter)
        # Using type=None to fetch all or check type column logic
        # CRMRepo.get_all() returns all. We filter in python.
        all_tickets = repo.get_all()
        user_tickets = [
            t for t in all_tickets
            if t.customer_email == user_email # and t.type == "Support" # Optional filter if type column exists
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
                "responses": [],
            })

        return {"tickets": sorted(result, key=lambda x: x.get("created_at", ""), reverse=True)}
    except Exception as e:
        logger.error(f"User support tickets fetch failed: {e}")
        return {"tickets": []}


@support_router.post("/support/create-ticket")
async def create_support_ticket_alias(
    user_email: str = Form(...),
    user_name: str = Form("User"),
    user_role: str = Form("user"),
    subject: str = Form(...),
    message: str = Form(...),
    category: str = Form("help"),
    priority: str = Form("medium"),
    db: Session = Depends(lambda: next(__import__("app.config.database", fromlist=["get_db"]).get_db()))
):
    """
    BACKWARD COMPATIBILITY: Alias for /notifications/support create logic
    Frontend calls POST /support/create-ticket directly.
    """
    from app.repositories.crm_repository import CRMRepository
    from app.api.v1.endpoints.notifications import SUPPORT_CATEGORIES
    import uuid
    from datetime import datetime
    import logging
    
    logger = logging.getLogger(__name__)
    
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
        "customer_phone": None, # Frontend doesn't send phone
        "subject": subject,
        "description": message,
        "message": message, # Populate legacy column to satisfy NotNull constraint
        "priority": priority,
        "status": "open",
        "created_at": datetime.utcnow(),
        "tags": [user_role],
        "assigned_to": None,
        "assigned_name": None,
        "resolution": None,
        "resolved_at": None,
        "resolution_time_hours": 0,
        "attachments": []
    }
    
    try:
        # Use repository to create
        ticket = crm_repo.create_ticket(ticket_data)
        logger.info(f"Support ticket created via alias: {ticket.id}")
        
        return {
            "status": "success",
            "message": "Ticket created successfully",
            "ticket_id": ticket.id
        }
    except Exception as e:
        logger.error(f"Failed to create ticket via alias: {e}")
        return {
            "status": "error",
            "message": str(e)
        }


@support_router.get("/audit-logs")
async def get_audit_logs_root_alias(
    action_type: str = None,
):
    """
    BACKWARD COMPATIBILITY: Alias for /api/v1/audit-logs
    Frontend calls /audit-logs directly.
    """
    from app.config.database import get_db
    from app.repositories.analytics_repository import AnalyticsRepository

    try:
        db = next(get_db())
        repo = AnalyticsRepository(db)
        logs = repo.get_audit_logs(action_type)

        result = []
        for log in logs:
            log_dict = log.to_dict() if hasattr(log, 'to_dict') else dict(log)
            result.append(log_dict)

        return result
    except Exception as e:
        return []


@support_router.get("/audit-logs")
async def get_audit_logs_root_alias(
    action_type: str = None,
):
    """
    BACKWARD COMPATIBILITY: Alias for /api/v1/audit-logs
    Frontend calls /audit-logs directly.
    """
    from app.config.database import get_db
    from app.repositories.analytics_repository import AnalyticsRepository

    try:
        db = next(get_db())
        repo = AnalyticsRepository(db)
        logs = repo.get_audit_logs(action_type)

        result = []
        for log in logs:
            log_dict = log.to_dict() if hasattr(log, 'to_dict') else dict(log)
            result.append(log_dict)

        return result
    except Exception as e:
        return []


@support_router.get("/support/all-tickets")
async def get_all_support_tickets_alias():
    """
    BACKWARD COMPATIBILITY: Alias for /notifications/support/all
    Frontend may call /support/all-tickets directly.
    """
    from app.config.database import get_db
    from app.repositories.crm_repository import CRMTicketRepository
    import logging

    logger = logging.getLogger(__name__)

    try:
        db = next(get_db())
        repo = CRMTicketRepository(db)

        all_tickets = repo.get_all()
        # support_tickets = [t for t in all_tickets if t.type == "Support"] 
        # Returning all for now to be safe
        support_tickets = all_tickets

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

        return {"tickets": sorted(result, key=lambda x: x.get("created_at", ""), reverse=True)}
    except Exception as e:
        logger.error(f"All support tickets fetch failed: {e}")
        return {"tickets": []}

# Include the support router in the main API router (so /api/v1/support/... works)
api_router.include_router(support_router)
