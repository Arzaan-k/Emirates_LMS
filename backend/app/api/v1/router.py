"""
API v1 Router
Combines all endpoint routers into a single API router
"""

from fastapi import APIRouter

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
