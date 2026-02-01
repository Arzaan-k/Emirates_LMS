"""
API v1 Router
Combines all endpoint routers into a single API router
"""

from fastapi import APIRouter, Form, Depends, HTTPException, UploadFile, File
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
async def health_check(db: Session = Depends(__import__("app.config.database", fromlist=["get_db"]).get_db)):
    """
    Health check endpoint for monitoring and load balancers.
    """
    import os
    from datetime import datetime
    
    # Check database connectivity
    db_status = "unknown"
    try:
        from sqlalchemy import text
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


# ===========================================
# AUDIT LOG FRIENDLY DESCRIPTIONS
# ===========================================

def _make_audit_log_friendly(log_dict: dict) -> dict:
    """
    Transform technical audit log into user-friendly, layman terms.
    """
    action = log_dict.get("action", "")
    target = log_dict.get("target", "")
    details = log_dict.get("details", "")
    user = log_dict.get("user_email", "Someone")

    # Extract meaningful info from target/details
    friendly_action = action
    friendly_target = target
    friendly_details = details

    # Map technical actions to friendly descriptions
    action_lower = action.lower() if action else ""
    target_lower = target.lower() if target else ""

    # LOGIN actions
    if "login" in action_lower:
        friendly_action = "USER_LOGIN"
        friendly_target = f"User logged into the system"
        friendly_details = f"{user} signed in successfully"

    # LOGOUT actions
    elif "logout" in action_lower:
        friendly_action = "USER_LOGOUT"
        friendly_target = f"User logged out"
        friendly_details = f"{user} signed out of the system"

    # Video progress tracking
    elif "track-video-progress" in target_lower or "video_progress" in action_lower:
        friendly_action = "VIDEO_WATCHED"
        friendly_target = "Video progress saved"
        friendly_details = "A user watched training video content"

    # Learning path actions
    elif "learning-path" in target_lower or "learning_path" in action_lower:
        friendly_action = "LEARNING_PROGRESS"
        friendly_target = "Learning path updated"
        friendly_details = "User made progress on their learning journey"

    # Content actions
    elif "content" in target_lower or "content" in action_lower:
        if "delete" in action_lower or "DELETE" in action:
            friendly_action = "DELETE_CONTENT"
            friendly_target = "Training content removed"
            friendly_details = "A training video or course was deleted"
        elif "post" in action_lower or "create" in action_lower or "upload" in action_lower:
            friendly_action = "UPLOAD_CONTENT"
            friendly_target = "New training content added"
            friendly_details = "A new training video or course was uploaded"
        elif "put" in action_lower or "update" in action_lower:
            friendly_action = "UPDATE_CONTENT"
            friendly_target = "Training content updated"
            friendly_details = "Training material was modified"
        else:
            friendly_action = "VIEW_CONTENT"
            friendly_target = "Content accessed"
            friendly_details = "Training content was viewed"

    # Simulation actions
    elif "simulation" in target_lower or "simulation" in action_lower:
        if "delete" in action_lower or "DELETE" in action:
            friendly_action = "DELETE_SIMULATION"
            friendly_target = "Simulation removed"
            friendly_details = "An interactive simulation was deleted"
        elif "post" in action_lower or "create" in action_lower:
            friendly_action = "CREATE_SIMULATION"
            friendly_target = "New simulation created"
            friendly_details = "A new interactive training simulation was added"
        elif "complete" in target_lower:
            friendly_action = "SIMULATION_COMPLETED"
            friendly_target = "Simulation finished"
            friendly_details = "A user completed an interactive simulation"
        else:
            friendly_action = "UPDATE_SIMULATION"
            friendly_target = "Simulation updated"
            friendly_details = "An interactive simulation was modified"

    # Quiz actions
    elif "quiz" in target_lower or "quiz" in action_lower:
        if "submit" in target_lower or "complete" in target_lower:
            friendly_action = "QUIZ_SUBMITTED"
            friendly_target = "Quiz completed"
            friendly_details = "A user submitted their quiz answers"
        elif "create" in action_lower or "post" in action_lower:
            friendly_action = "CREATE_QUIZ"
            friendly_target = "New quiz created"
            friendly_details = "A new assessment quiz was added"
        else:
            friendly_action = "QUIZ_ACTIVITY"
            friendly_target = "Quiz activity"
            friendly_details = "Quiz related action performed"

    # User management
    elif "user" in target_lower or "user" in action_lower:
        if "delete" in action_lower:
            friendly_action = "DELETE_USER"
            friendly_target = "User account removed"
            friendly_details = "A user account was deleted from the system"
        elif "create" in action_lower or "register" in action_lower:
            friendly_action = "CREATE_USER"
            friendly_target = "New user registered"
            friendly_details = "A new user account was created"
        elif "update" in action_lower or "put" in action_lower:
            friendly_action = "UPDATE_USER"
            friendly_target = "User profile updated"
            friendly_details = "User account information was modified"
        else:
            friendly_action = "USER_ACTIVITY"
            friendly_target = "User activity"
            friendly_details = "User related action performed"

    # Notification actions
    elif "notification" in target_lower:
        friendly_action = "SEND_NOTIFICATION"
        friendly_target = "Notification sent"
        friendly_details = "A notification was sent to users"

    # Assessment/Exam actions
    elif "assessment" in target_lower or "exam" in target_lower:
        if "submit" in target_lower:
            friendly_action = "EXAM_SUBMITTED"
            friendly_target = "Assessment completed"
            friendly_details = "A user completed their assessment exam"
        else:
            friendly_action = "ASSESSMENT_ACTIVITY"
            friendly_target = "Assessment activity"
            friendly_details = "Assessment related action"

    # Bucket/Category actions
    elif "bucket" in target_lower:
        friendly_action = "MANAGE_CATEGORIES"
        friendly_target = "Course categories updated"
        friendly_details = "Training categories were modified"

    # Analytics actions
    elif "analytics" in target_lower:
        friendly_action = "VIEW_ANALYTICS"
        friendly_target = "Analytics viewed"
        friendly_details = "System analytics were accessed"

    # CRM actions
    elif "crm" in target_lower or "lead" in target_lower:
        friendly_action = "CRM_ACTIVITY"
        friendly_target = "CRM updated"
        friendly_details = "Customer relationship data was modified"

    # API endpoint pattern (fallback for technical logs)
    elif target.startswith("/") or "api" in target_lower:
        method = action.split()[0] if action else "ACCESS"
        if method == "GET":
            friendly_action = "DATA_ACCESS"
            friendly_target = "Data retrieved"
            friendly_details = "System data was accessed"
        elif method == "POST":
            friendly_action = "DATA_CREATED"
            friendly_target = "New data added"
            friendly_details = "New information was saved to the system"
        elif method == "PUT" or method == "PATCH":
            friendly_action = "DATA_UPDATED"
            friendly_target = "Data modified"
            friendly_details = "Existing information was updated"
        elif method == "DELETE":
            friendly_action = "DATA_DELETED"
            friendly_target = "Data removed"
            friendly_details = "Information was deleted from the system"
        else:
            friendly_action = "SYSTEM_ACTIVITY"
            friendly_target = "System action"
            friendly_details = "A system operation was performed"

    # Update the log dict with friendly values
    log_dict["action"] = friendly_action
    log_dict["target"] = friendly_target
    log_dict["details"] = friendly_details

    return log_dict


# Audit logs endpoint
@api_router.get("/audit-logs")
async def get_audit_logs(
    action_type: str = None,
    db: Session = Depends(__import__("app.config.database", fromlist=["get_db"]).get_db),
):
    """
    Get audit logs, optionally filtered by action type.
    Returns user-friendly descriptions instead of technical details.
    """
    from app.repositories.analytics_repository import AnalyticsRepository

    try:
        repo = AnalyticsRepository(db)
        logs = repo.get_audit_logs(action_type)

        result = []
        action_types_set = set()
        for log in logs:
            log_dict = log.to_dict() if hasattr(log, 'to_dict') else dict(log)
            # Transform to friendly format
            log_dict = _make_audit_log_friendly(log_dict)
            # Frontend expects admin_email
            log_dict["admin_email"] = log_dict.get("user_email", "System")
            result.append(log_dict)
            if log_dict.get("action"):
                action_types_set.add(log_dict["action"])

        # Return in format expected by frontend
        return {
            "logs": result,
            "action_types": sorted(list(action_types_set))
        }
    except Exception as e:
        return {"logs": [], "action_types": []}


# Backward compatibility alias for old frontend endpoint
@api_router.get("/scheduled-exams/user/{user_email}")
async def get_user_scheduled_exams_alias(
    user_email: str,
    db: Session = Depends(__import__("app.config.database", fromlist=["get_db"]).get_db),
):
    """
    DEPRECATED: Backward compatibility alias for /assessments/scheduled/user/{email}
    Frontend should be updated to use the new endpoint.
    """
    from app.services.assessment_service import AssessmentService

    try:
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
async def get_my_support_tickets_alias(
    user_email: str,
    db: Session = Depends(__import__("app.config.database", fromlist=["get_db"]).get_db),
):
    """
    BACKWARD COMPATIBILITY: Alias for /notifications/support/user/{email}
    Frontend calls /support/my-tickets/{email} directly.
    """
    from app.repositories.crm_repository import CRMTicketRepository
    import logging

    logger = logging.getLogger(__name__)

    try:
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
    db: Session = Depends(__import__("app.config.database", fromlist=["get_db"]).get_db),
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
    db: Session = Depends(__import__("app.config.database", fromlist=["get_db"]).get_db),
):
    """
    BACKWARD COMPATIBILITY: Alias for /api/v1/audit-logs
    Frontend calls /audit-logs directly.
    Returns user-friendly descriptions instead of technical details.
    """
    from app.repositories.analytics_repository import AnalyticsRepository

    try:
        repo = AnalyticsRepository(db)
        logs = repo.get_audit_logs(action_type)

        result = []
        action_types_set = set()
        for log in logs:
            log_dict = log.to_dict() if hasattr(log, 'to_dict') else dict(log)
            # Transform to friendly format
            log_dict = _make_audit_log_friendly(log_dict)
            # Frontend expects admin_email
            log_dict["admin_email"] = log_dict.get("user_email", "System")
            result.append(log_dict)
            if log_dict.get("action"):
                action_types_set.add(log_dict["action"])

        # Return in format expected by frontend
        return {
            "logs": result,
            "action_types": sorted(list(action_types_set))
        }
    except Exception as e:
        return {"logs": [], "action_types": []}


@support_router.get("/support/all-tickets")
async def get_all_support_tickets_alias(
    db: Session = Depends(__import__("app.config.database", fromlist=["get_db"]).get_db),
):
    """
    BACKWARD COMPATIBILITY: Alias for /notifications/support/all
    Frontend may call /support/all-tickets directly.
    """
    from app.repositories.crm_repository import CRMTicketRepository
    import logging

    logger = logging.getLogger(__name__)

    try:
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


# ==========================================
# LEARNING PATH BACKWARD COMPATIBILITY ALIASES
# ==========================================

learning_path_router = APIRouter()


@learning_path_router.get("/learning-path/node-progress/user/{content_id}")
async def get_node_progress_alias(
    content_id: str,
    user_email: str = "user",
    db: Session = Depends(__import__("app.config.database", fromlist=["get_db"]).get_db),
):
    """
    BACKWARD COMPATIBILITY: Get progress for a specific content node.
    Frontend calls /learning-path/node-progress/user/{content_id} directly.
    """
    from app.services.user_service import UserService
    import logging

    logger = logging.getLogger(__name__)

    try:
        service = UserService(db)
        progress = service.get_user_node_progress(user_email, content_id)

        if progress:
            return {
                "node_id": progress.node_id,
                "progress_percent": progress.progress_percent or 0,
                "completed": progress.completed or False,
                "last_position": progress.last_position or 0,
                "time_spent_seconds": progress.time_spent_seconds or 0,
            }
        else:
            return {
                "node_id": content_id,
                "progress_percent": 0,
                "completed": False,
                "last_position": 0,
                "time_spent_seconds": 0,
            }
    except Exception as e:
        logger.error(f"Node progress fetch failed: {e}")
        return {
            "node_id": content_id,
            "progress_percent": 0,
            "completed": False,
            "last_position": 0,
            "time_spent_seconds": 0,
        }


@learning_path_router.get("/learning-path/mid-video-quizzes/{content_id}")
async def get_mid_video_quizzes_alias(
    content_id: str,
    user_email: str = "user",
    db: Session = Depends(__import__("app.config.database", fromlist=["get_db"]).get_db),
):
    """
    BACKWARD COMPATIBILITY: Get mid-video quiz checkpoints for a content item.
    Frontend calls /learning-path/mid-video-quizzes/{content_id} directly.
    """
    from app.services.content_service import ContentService
    import logging

    logger = logging.getLogger(__name__)

    try:
        service = ContentService(db)
        content = service.get_content_by_id(content_id)

        if content and content.quiz:
            # Return quiz checkpoints if they exist
            return {"quizzes": content.quiz if isinstance(content.quiz, list) else []}
        else:
            return {"quizzes": []}
    except Exception as e:
        logger.error(f"Mid-video quizzes fetch failed: {e}")
        return {"quizzes": []}


@learning_path_router.post("/learning-path/track-video-progress")
async def track_video_progress_alias(
    user_email: str = Form(...),
    node_id: str = Form(...),
    progress_percent: float = Form(0),
    last_position: float = Form(0),
    time_spent_seconds: int = Form(0),
    completed: bool = Form(False),
    db: Session = Depends(__import__("app.config.database", fromlist=["get_db"]).get_db),
):
    """
    BACKWARD COMPATIBILITY: Track video watching progress.
    Frontend calls POST /learning-path/track-video-progress directly.
    """
    from app.services.user_service import UserService
    import logging

    logger = logging.getLogger(__name__)

    try:
        service = UserService(db)

        progress_data = {
            "progress_percent": progress_percent,
            "last_position": last_position,
            "time_spent_seconds": time_spent_seconds,
            "completed": completed,
        }

        service.update_node_progress(user_email, node_id, progress_data)
        return {"status": "success", "message": "Progress tracked"}
    except Exception as e:
        logger.error(f"Video progress tracking failed: {e}")
        return {"status": "error", "message": str(e)}


# Include the learning path router in the main API router
api_router.include_router(learning_path_router)


# ==========================================
# AI BACKWARD COMPATIBILITY ALIASES
# ==========================================

ai_compat_router = APIRouter()

@ai_compat_router.get("/ai/suggested-questions")
async def ai_suggested_questions_alias(
    db: Session = Depends(__import__("app.config.database", fromlist=["get_db"]).get_db),
):
    """
    BACKWARD COMPATIBILITY: Alias for /api/v1/ai/suggested-questions
    Frontend calls /ai/suggested-questions directly.
    """
    from app.services.content_service import ContentService
    import logging

    logger = logging.getLogger(__name__)

    suggestions = [
        "What is the standard waffle baking temperature?",
        "Explain the opening checklist",
        "How do I prepare the batter?",
        "What are the cleaning protocols?",
    ]
    
    try:
        content_service = ContentService(db)
        courses = content_service.get_all_content(limit=3)
        for course in courses:
            if hasattr(course, 'is_path_node') and course.is_path_node:
                suggestions.append(f"Tell me about {course.title}")
    except Exception as e:
        logger.warning(f"Could not fetch courses for suggestions: {e}")
    
    return {"suggestions": suggestions[:8]}


@ai_compat_router.post("/ai/chatbot")
async def ai_chatbot_alias(
    message: str = Form(...),
    history: str = Form("[]"),
    db: Session = Depends(__import__("app.config.database", fromlist=["get_db"]).get_db),
):
    """
    Dynamic AI Chatbot that:
    1. Searches through courses and resources (knowledge base)
    2. Uses Groq to generate contextual responses
    3. Adds disclaimer for answers outside BW LMS context
    """
    from app.services.ai_service import AIService
    from app.services.content_service import ContentService
    from groq import Groq
    import logging
    import json
    import os

    logger = logging.getLogger(__name__)

    try:
        # Parse chat history
        try:
            chat_history = json.loads(history)
        except:
            chat_history = []
        
        # --- BUILD KNOWLEDGE BASE ---
        # Gather all available courses and resources from database
        content_service = ContentService(db)
        is_internal_answer = False
        relevant_context = []
        
        # Get courses from database
        course_summaries = []
        try:
            courses = content_service.get_all_content(limit=20)
            for course in courses:
                if hasattr(course, 'is_path_node') and course.is_path_node:
                    title = course.title if hasattr(course, 'title') else 'Untitled'
                    desc = (course.description[:100] if hasattr(course, 'description') and course.description else 'No description')
                    course_summaries.append(f"- {title}: {desc}")
                    
                    # Check if this course is relevant to the question
                    if title.lower() in message.lower() or (course.description and message.lower() in course.description.lower()):
                        relevant_context.append(f"Course: {title} - {course.description}")
                        is_internal_answer = True
        except Exception as e:
            logger.warning(f"Could not fetch courses: {e}")
        
        # --- BUILD PROMPT ---
        system_prompt = """You are BWC AI Assistant, the intelligent helper for Belgian Waffle Co.'s Learning Management System.

YOUR KNOWLEDGE BASE INCLUDES:
1. Training courses and learning paths
2. Standard Operating Procedures (SOPs)
3. Recipes and food preparation guides
4. Equipment handling and safety protocols
5. Customer service standards
6. Store operations (opening, closing, cleaning)

RESPONSE GUIDELINES:
- Be helpful, friendly, and professional
- Use emojis sparingly to keep it engaging (🧇, ✅, 📚)
- Format responses with **bold** for important terms
- Use bullet points for lists
- Keep responses concise but informative
- If the answer is from BW LMS training materials, mention the relevant course/resource
- If answering general questions OUTSIDE the BW LMS scope, add this note at the end:
  "ℹ️ Note: This information is general knowledge and not part of BW LMS training materials."

BELGIAN WAFFLE CO. SPECIFIC INFO:
- Standard baking temp: 180-190°C
- Batter: 5kg Premix + 4L Water + 500g Oil
- Cooking time: 3:30 - 4:00 minutes
- Uniform: BWC Cap, Black T-Shirt, Apron, Non-slip shoes"""

        # Build context section
        context_section = ""
        if relevant_context:
            context_section = f"\n\nRELEVANT TRAINING CONTENT:\n" + "\n".join(relevant_context[:3])
        
        if course_summaries:
            context_section += f"\n\nAVAILABLE COURSES:\n" + "\n".join(course_summaries[:10])
        
        # Build conversation messages
        messages = [{"role": "system", "content": system_prompt + context_section}]
        
        # Add chat history (last 10 messages)
        for msg in chat_history[-10:]:
            role = "user" if msg.get("sender") == "user" else "assistant"
            messages.append({"role": role, "content": msg.get("text", "")})
        
        # Add current message
        messages.append({"role": "user", "content": message})
        
        # --- GROQ API CALL ---
        from app.config.settings import settings
        client = Groq(api_key=settings.GROQ_API_KEY)
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages,
            temperature=0.7,
            max_tokens=1000
        )
        
        ai_response = response.choices[0].message.content.strip()
        
        # Determine if answer is from internal sources
        internal_keywords = ["sop", "recipe", "batter", "waffle", "temperature", "iron", 
                           "cleaning", "opening", "closing", "uniform", "training", "course"]
        message_lower = message.lower()
        is_internal_question = any(kw in message_lower for kw in internal_keywords)
        
        return {
            "status": "success",
            "response": ai_response,
            "is_internal": is_internal_answer or is_internal_question,
            "sources_found": len(relevant_context)
        }
        
    except Exception as e:
        logger.error(f"AI Chatbot Error: {e}")
        return {
            "status": "error",
            "response": "I'm having trouble connecting right now. Please try again in a moment. 🔄",
            "error": str(e)
        }


@ai_compat_router.post("/ai/voice_query")
async def ai_voice_query_alias(
    file: UploadFile = File(...),
    db: Session = Depends(__import__("app.config.database", fromlist=["get_db"]).get_db),
):
    """
    Voice query endpoint - transcribes audio and processes with AI chatbot.
    """
    from groq import Groq
    from app.config.settings import settings
    from app.services.content_service import ContentService
    import logging
    import os
    import tempfile

    logger = logging.getLogger(__name__)

    try:
        # Save uploaded file temporarily
        suffix = os.path.splitext(file.filename)[1] if file.filename else '.m4a'
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            content = await file.read()
            temp_file.write(content)
            temp_path = temp_file.name
        
        # Transcribe using Groq Whisper
        client = Groq(api_key=settings.GROQ_API_KEY)
        
        with open(temp_path, "rb") as audio_file:
            transcription = client.audio.transcriptions.create(
                model="whisper-large-v3",
                file=audio_file,
                response_format="text"
            )
        
        # Clean up temp file
        os.unlink(temp_path)
        
        user_text = transcription.strip() if isinstance(transcription, str) else str(transcription).strip()
        
        if not user_text:
            return {
                "status": "error",
                "user_text": "",
                "ai_response": "I couldn't understand the audio. Please try speaking more clearly. 🎤"
            }
        
        # --- Process with AI Chatbot logic ---
        content_service = ContentService(db)
        
        # Get courses from database
        course_summaries = []
        try:
            courses = content_service.get_all_content(limit=20)
            for course in courses:
                if hasattr(course, 'is_path_node') and course.is_path_node:
                    title = course.title if hasattr(course, 'title') else 'Untitled'
                    desc = (course.description[:100] if hasattr(course, 'description') and course.description else 'No description')
                    course_summaries.append(f"- {title}: {desc}")
        except Exception as e:
            logger.warning(f"Could not fetch courses: {e}")
        
        # Build system prompt
        system_prompt = """You are BWC AI Assistant, the intelligent helper for Belgian Waffle Co.'s Learning Management System.

YOUR KNOWLEDGE BASE INCLUDES:
1. Training courses and learning paths
2. Standard Operating Procedures (SOPs)
3. Recipes and food preparation guides
4. Equipment handling and safety protocols
5. Customer service standards
6. Store operations (opening, closing, cleaning)

RESPONSE GUIDELINES:
- Be helpful, friendly, and professional
- Use emojis sparingly to keep it engaging (🧇, ✅, 📚)
- Keep responses concise for voice output
- If answering general questions OUTSIDE the BW LMS scope, mention it briefly

BELGIAN WAFFLE CO. SPECIFIC INFO:
- Standard baking temp: 180-190°C
- Batter: 5kg Premix + 4L Water + 500g Oil
- Cooking time: 3:30 - 4:00 minutes
- Uniform: BWC Cap, Black T-Shirt, Apron, Non-slip shoes"""

        context_section = ""
        if course_summaries:
            context_section = f"\n\nAVAILABLE COURSES:\n" + "\n".join(course_summaries[:10])
        
        messages = [
            {"role": "system", "content": system_prompt + context_section},
            {"role": "user", "content": user_text}
        ]
        
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages,
            temperature=0.7,
            max_tokens=500
        )
        
        ai_response = response.choices[0].message.content.strip()
        
        return {
            "status": "success",
            "user_text": user_text,
            "ai_response": ai_response
        }
        
    except Exception as e:
        logger.error(f"Voice query error: {e}")
        try:
            if 'temp_path' in locals():
                os.unlink(temp_path)
        except:
            pass
        
        return {
            "status": "error",
            "user_text": "",
            "ai_response": "I'm having trouble processing your voice request. Please try again. 🔄"
        }


# Include the AI compat router in the main API router  
api_router.include_router(ai_compat_router)