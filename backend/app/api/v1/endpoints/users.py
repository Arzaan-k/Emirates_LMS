"""
User Management Endpoints
CRUD operations for users, privileges, stores
"""

import json
import logging
from typing import Dict, Any, Optional, List

from fastapi import APIRouter, Depends, Form, File, UploadFile, HTTPException, Request
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.core.dependencies import get_current_user, require_admin, require_privilege
from app.core.middleware import limiter
from app.services.user_service import UserService
from app.schemas.user import UserCreate, UserResponse, UserUpdate

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/users", tags=["Users"])


# ==========================================
# USER CRUD ENDPOINTS
# ==========================================

@router.get("/", response_model=Dict[str, Any])
async def list_users(
    page: int = 1,
    limit: int = 50,
    search: str = "",
    store: str = "",
    role: str = "",
    db: Session = Depends(get_db)
):
    """
    Returns all users (without passwords) with pagination and filtering.
    """
    service = UserService(db)
    skip = (page - 1) * limit
    
    users = service.get_all_users(
        skip=skip,
        limit=limit,
        store=store if store else None,
        role=role if role else None,
        search=search if search else None
    )
    
    # Remove passwords from response
    user_list = []
    for user in users:
        user_dict = user.to_dict() if hasattr(user, 'to_dict') else dict(user)
        user_dict.pop('password', None)
        user_list.append(user_dict)
        
    # Get total count for pagination
    total = service.get_user_count(
        store=store if store else None,
        role=role if role else None,
        search=search if search else None
    )
    
    return {
        "users": user_list,
        "total": total,
        "page": page,
        "total_pages": (total + limit - 1) // limit if limit > 0 else 1
    }


# ==========================================
# ALIAS ROUTES FOR BACKWARD COMPATIBILITY
# ==========================================

@router.get("/list")
async def list_users_alias(
    page: int = 1,
    limit: int = 50,
    search: str = "",
    store: str = "",
    role: str = "",
    db: Session = Depends(get_db)
):
    """
    Alias for /users/ - backward compatibility with frontend.
    """
    return await list_users(page, limit, search, store, role, db)


@router.post("/create")
async def create_user_alias(
    request: Request,
    data: Dict[str, Any],
    db: Session = Depends(get_db)
):
    """
    Alias for POST /users/ - backward compatibility with frontend.
    """
    return await create_user(request, data, db)


@router.post("/update")
async def update_user_alias(
    data: Dict[str, Any],
    db: Session = Depends(get_db)
):
    """
    Alias for PUT /users/{email} - backward compatibility with frontend.
    """
    email = data.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
    
    service = UserService(db)
    
    updates = {}
    if "name" in data:
        updates["name"] = data["name"]
    if "role" in data:
        updates["role"] = data["role"]
    if "category" in data:
        updates["category"] = data["category"]
    if "store" in data:
        updates["store"] = data["store"]
    if "privileges" in data:
        updates["privileges"] = data["privileges"]
    if "has_admin_access" in data:
        updates["has_admin_access"] = data["has_admin_access"]
    
    try:
        user = service.update_user(email, updates)
        logger.info(f"User updated via alias: {email}")
        user_dict = user.to_dict() if hasattr(user, 'to_dict') else dict(user)
        user_dict.pop('password', None)
        return {"status": "success", "user": user_dict}
    except Exception as e:
        logger.error(f"User update failed: {e}")
        raise


@router.get("/me")
async def get_current_user_info(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Get current authenticated user's information.
    """
    return current_user


@router.post("/", response_model=Dict[str, Any])
@limiter.limit("10/hour")
async def create_user(
    request: Request,
    data: Dict[str, Any],
    db: Session = Depends(get_db)
):
    """
    Creates a new user account with category, privileges, and store assignment.
    """
    service = UserService(db)
    
    user_data = {
        "email": data.get("email"),
        "name": data.get("name"),
        "password": data.get("password"),
        "role": data.get("role", "Waffler"),
        "category": data.get("category", "Employee"),
        "store": data.get("store", "Unassigned"),
        "privileges": data.get("privileges", []),
        "is_superadmin": data.get("is_superadmin", False),
        "has_admin_access": data.get("has_admin_access", False),
    }
    
    try:
        user = service.create_user(user_data)
        logger.info(f"User created: {user_data['email']}")
        user_dict = user.to_dict() if hasattr(user, 'to_dict') else dict(user)
        user_dict.pop('password', None)
        return {"status": "success", "user": user_dict}
    except Exception as e:
        logger.error(f"User creation failed: {e}")
        raise





# ==========================================
# USER PRIVILEGES ENDPOINTS
# ==========================================

@router.get("/privileges")
async def get_privileges_alias():
    """
    Alias for /users/privileges/all - returns list as array (backward compatibility).
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

    # Return as array directly (what frontend expects)
    return [
        {
            "id": priv,
            "name": priv.replace("_", " ").title(),
            "icon": PRIVILEGE_ICONS.get(priv, "check")
        }
        for priv in ALL_PRIVILEGES
    ]

@router.get("/privileges/all")
async def get_all_privileges(db: Session = Depends(get_db)):
    """
    Returns ACCESS CONTROL RULES for each level (used by frontend for career progression).
    This endpoint returns a dictionary like:
    { "Waffler": { "accessible_courses": [...], "accessible_buckets": [...] }, ... }
    
    Note: This is NOT user privileges - those are at /privileges endpoint.
    Frontend expects this format for building the career hierarchy view.
    
    FALLBACK: If no access rules exist, returns ALL career progression courses
    assigned to the first level (Waffler) to ensure content is visible.
    """
    from app.repositories.content_repository import AccessRuleRepository, ContentRepository, ProgressionLevelRepository
    from app.models.content import Content
    
    try:
        repo = AccessRuleRepository(db)
        rules = repo.get_all_rules_dict()
        
        # If no rules exist, create a fallback with all career content assigned to each level
        if not rules:
            logger.info("No access rules in database, generating fallback with all career courses")
            
            # Get all career progression courses
            content_repo = ContentRepository(db)
            career_courses = db.query(Content).filter(
                Content.is_path_node == True,
                Content.learning_path_type != "self_learning"
            ).order_by(Content.timestamp).all()
            
            all_course_ids = [c.id for c in career_courses]
            
            # Get available levels from database or use defaults
            level_repo = ProgressionLevelRepository(db)
            levels = level_repo.get_all_levels()
            
            if levels:
                level_names = [l.name for l in sorted(levels, key=lambda x: x.order or 0)]
            else:
                # Default hierarchy
                level_names = [
                    "Waffler", "Silver Waffler", "Gold Waffler", 
                    "Shift Manager", "Assistant Store Manager", "Store Manager"
                ]
            
            # Assign all courses to each level (so all are visible regardless of user level)
            # This ensures content is visible when no rules are configured
            for level_name in level_names:
                rules[level_name] = {
                    "accessible_courses": all_course_ids,
                    "accessible_buckets": [],
                    "max_courses_visible": -1
                }
            
            logger.info(f"Fallback access rules created for {len(level_names)} levels with {len(all_course_ids)} courses")
        
        # Return directly as dict (format frontend expects)
        return rules
    except Exception as e:
        logger.error(f"Access rules fetch failed: {e}")
        return {}


@router.get("/privileges/list")
async def get_privileges_list():
    """
    Returns list of all available privileges for user creation/management.
    This is the actual privilege definitions (not access rules).
    Added for backward compatibility with admin panel functionality.
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

@router.put("/{email}/privileges")
async def update_user_privileges(
    email: str,
    data: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_admin)
):
    """
    Updates a user's privileges (Admin only).
    """
    service = UserService(db)
    privileges = data.get("privileges", [])
    
    try:
        user = service.update_privileges(email, privileges)
        logger.info(f"Privileges updated for {email}")
        return {"message": "Privileges updated successfully"}
    except Exception as e:
        logger.error(f"Privilege update failed: {e}")
        raise


# ==========================================
# USER CATEGORIES ENDPOINTS
# ==========================================

# In-memory store for dynamic categories
_user_categories_store = [
    {"id": "1", "name": "Super Admin", "description": "Full access to everything", "color": "#9333EA"},
    {"id": "2", "name": "Manager", "description": "Store manager with admin access", "color": "#2563EB"},
    {"id": "3", "name": "Supervisor", "description": "Team supervisor with limited admin", "color": "#10B981"},
    {"id": "4", "name": "Employee", "description": "Regular employee access", "color": "#F59E0B"},
]


@router.get("/categories")
async def get_user_categories_alias():
    """
    Returns list of all user categories (array directly for frontend compatibility).
    """
    return _user_categories_store


@router.get("/categories/all")
async def get_user_categories():
    """
    Returns list of all user categories.
    """
    return _user_categories_store


@router.post("/categories")
async def create_user_category(
    data: Dict[str, Any]
):
    """
    Creates a new user category.
    """
    import uuid
    new_category = {
        "id": str(uuid.uuid4())[:8],
        "name": data.get("name"),
        "description": data.get("description", ""),
        "color": data.get("color", "#6B7280")
    }
    _user_categories_store.append(new_category)
    return {"status": "success", "category": new_category}


# ==========================================
# STORES ENDPOINTS
# ==========================================

STORES_LIST = [
    {"id": "1", "name": "HQ", "city": "Mumbai", "region": "West"},
    {"id": "2", "name": "Mumbai Central", "city": "Mumbai", "region": "West"},
    {"id": "3", "name": "Mumbai Andheri", "city": "Mumbai", "region": "West"},
    {"id": "4", "name": "Delhi CP", "city": "Delhi", "region": "North"},
    {"id": "5", "name": "Delhi Saket", "city": "Delhi", "region": "North"},
    {"id": "6", "name": "Delhi GK", "city": "Delhi", "region": "North"},
    {"id": "7", "name": "Bangalore Koramangala", "city": "Bangalore", "region": "South"},
    {"id": "8", "name": "Bangalore Indiranagar", "city": "Bangalore", "region": "South"},
    {"id": "9", "name": "Chennai T Nagar", "city": "Chennai", "region": "South"},
    {"id": "10", "name": "Hyderabad Jubilee Hills", "city": "Hyderabad", "region": "South"},
    {"id": "11", "name": "Pune FC Road", "city": "Pune", "region": "West"},
    {"id": "12", "name": "Kolkata Park Street", "city": "Kolkata", "region": "East"},
]


@router.get("/stores/all")
async def get_stores():
    """
    Returns list of all stores for employee assignment.
    """
    return STORES_LIST


@router.get("/stores/summary")
async def get_stores_summary(db: Session = Depends(get_db)):
    """
    Returns stores with employee count for analytics.
    """
    service = UserService(db)
    store_counts = service.get_user_count_by_store()
    
    result = []
    for store in STORES_LIST:
        store_data = store.copy()
        store_data["employee_count"] = store_counts.get(store["name"], 0)
        result.append(store_data)
    
    return result


# ==========================================
# BULK UPLOAD ENDPOINTS
# ==========================================

@router.post("/bulk-upload")
async def bulk_upload_users(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_admin)
):
    """
    Bulk upload users from Excel/CSV file.
    Expected columns: Name, Email, Password, Role, Category, Store
    """
    import pandas as pd
    import io
    
    service = UserService(db)
    
    try:
        contents = await file.read()
        
        # Determine file type
        if file.filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(contents))
        else:
            df = pd.read_excel(io.BytesIO(contents))
        
        created = 0
        errors = []
        
        for _, row in df.iterrows():
            try:
                user_data = {
                    "name": str(row.get('Name', row.get('name', ''))),
                    "email": str(row.get('Email', row.get('email', ''))),
                    "password": str(row.get('Password', row.get('password', 'changeme123'))),
                    "role": str(row.get('Role', row.get('role', 'Waffler'))),
                    "category": str(row.get('Category', row.get('category', 'Employee'))),
                    "store": str(row.get('Store', row.get('store', 'Unassigned'))),
                    "privileges": [],
                    "is_superadmin": False,
                    "has_admin_access": False,
                }
                
                service.create_user(user_data)
                created += 1
                
            except Exception as e:
                errors.append({
                    "email": user_data.get("email", "unknown"),
                    "error": str(e)
                })
        
        return {
            "message": f"Bulk upload complete. Created: {created}, Errors: {len(errors)}",
            "created": created,
            "errors": errors
        }
        
    except Exception as e:
        logger.error(f"Bulk upload failed: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to process file: {str(e)}")


@router.get("/bulk-upload/template")
async def get_bulk_upload_template():
    """
    Returns the expected format for bulk user upload.
    """
    return {
        "columns": ["Name", "Email", "Password", "Role", "Category", "Store"],
        "example": [
            {
                "Name": "John Doe",
                "Email": "john@company.com",
                "Password": "SecurePass123",
                "Role": "Waffler",
                "Category": "Employee",
                "Store": "Mumbai Central"
            }
        ],
        "notes": [
            "Role options: Waffler, Silver Waffler, Gold Waffler, Shift Manager, Assistant Store Manager, Store Manager",
            "Category options: Employee, Supervisor, Manager, Super Admin",
            "Password will be hashed automatically"
        ]
    }

# ==========================================
# USER CRUD BY EMAIL (MOVED TO END TO AVOID SHADOWING)
# ==========================================

@router.get("/{email}")
async def get_user(
    email: str,
    db: Session = Depends(get_db)
):
    """
    Returns a specific user by email (without password).
    """
    service = UserService(db)
    user = service.get_user_by_email(email)
    
    user_dict = user.to_dict() if hasattr(user, 'to_dict') else dict(user)
    user_dict.pop('password', None)
    return user_dict


@router.get("/{email}/self-learning-status")
async def get_user_self_learning_status(
    email: str,
    db: Session = Depends(get_db)
):
    """
    Get self learning status for user.
    """
    service = UserService(db)
    return service.get_self_learning_status(email)


@router.put("/{email}")
async def update_user(
    email: str,
    data: Dict[str, Any],
    db: Session = Depends(get_db)
):
    """
    Updates an existing user's privileges, role, and store assignment.
    """
    service = UserService(db)
    
    updates = {}
    if "name" in data:
        updates["name"] = data["name"]
    if "role" in data:
        updates["role"] = data["role"]
    if "category" in data:
        updates["category"] = data["category"]
    if "store" in data:
        updates["store"] = data["store"]
    if "privileges" in data:
        updates["privileges"] = data["privileges"]
    if "has_admin_access" in data:
        updates["has_admin_access"] = data["has_admin_access"]
    
    try:
        user = service.update_user(email, updates)
        logger.info(f"User updated: {email}")
        user_dict = user.to_dict() if hasattr(user, 'to_dict') else dict(user)
        user_dict.pop('password', None)
        return {"status": "success", "user": user_dict}
    except Exception as e:
        logger.error(f"User update failed: {e}")
        raise


@router.delete("/{email}")
async def delete_user(
    email: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_admin)
):
    """
    Delete a user (admin only).
    """
    service = UserService(db)
    try:
        service.delete_user(email)
        logger.info(f"User deleted: {email}")
        return {"message": f"User {email} deleted successfully"}
    except Exception as e:
        logger.error(f"User deletion failed: {e}")
        raise
