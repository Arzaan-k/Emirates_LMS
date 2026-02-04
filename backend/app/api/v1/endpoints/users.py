"""
User Management Endpoints
CRUD operations for users, privileges, stores
"""

import json
import logging
from typing import Dict, Any, Optional, List

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, BackgroundTasks, Request, Form
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
import io
import csv
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
def list_users(
    page: int = 1,
    limit: int = 50,
    search: str = "",
    store: str = "",
    role: str = "",
    db: Session = Depends(get_db),
):
    """
    Optimized users list with pagination and filtering.
    Uses single DB round-trip via UserService.
    """

    skip = (page - 1) * limit
    service = UserService(db)

    users, total = service.get_users_with_count(
        skip=skip,
        limit=limit,
        store=store or None,
        role=role or None,
        search=search or None,
    )

    # Fast serialization (no password ever fetched)
    user_list = [
        {
            **(
                user.to_dict()
                if hasattr(user, "to_dict")
                else {
                    k: v
                    for k, v in user.__dict__.items()
                    if not k.startswith("_")
                }
            ),
            **{}
        }
        for user in users
    ]

    for u in user_list:
        u.pop("password", None)


    return {
        "users": user_list,
        "total": total,
        "page": page,
        "total_pages": (total + limit - 1) // limit if limit > 0 else 1,
    }


# ==========================================
# ALIAS ROUTES FOR BACKWARD COMPATIBILITY
# ==========================================

@router.get("/list")
def list_users_alias(
    page: int = 1,
    limit: int = 50,
    search: str = "",
    store: str = "",
    role: str = "",
    db: Session = Depends(get_db),
):
    """
    Alias for /users/ - backward compatibility with frontend.
    """
    return list_users(page, limit, search, store, role, db)


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


# In-memory store for upload progress (In a real app, use Redis/DB)
upload_tasks = {}

@router.get("/bulk-upload/status/{task_id}")
async def get_bulk_upload_status(task_id: str):
    """
    Get the status of a bulk upload background task.
    """
    task = upload_tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task

def process_bulk_upload_task(task_id: str, contents: bytes):
    """
    Background task to process bulk upload.
    Creates its own database session since the request session becomes invalid 
    after the request completes.
    """
    import pandas as pd
    import io
    from app.config.database import SessionLocal
    
    # Create a fresh database session for the background task
    db = SessionLocal()
    
    try:
        service = UserService(db)
        
        # Determine file type & Load DF
        try:
            # We can't easy guess extension from bytes, assume Excel then CSV or try-catch
            # Since we lost filename, let's try Excel first (most common) then CSV
            try:
                df = pd.read_excel(io.BytesIO(contents))
            except:
                try:
                    df = pd.read_csv(io.BytesIO(contents))
                except:
                    df = pd.read_csv(io.BytesIO(contents), encoding='ISO-8859-1')
        except Exception as e:
            upload_tasks[task_id]["status"] = "failed"
            upload_tasks[task_id]["error"] = f"Invalid file format: {str(e)}"
            return

        # Sanitize
        df.columns = [c.strip() for c in df.columns]
        total_rows = len(df)
        upload_tasks[task_id]["total"] = total_rows
        
        created = 0
        skipped = 0
        errors = []
        
        for index, row in df.iterrows():
            # Update progress every 5 rows or so to avoid lock contention if tracking was heavy
            upload_tasks[task_id]["current"] = index + 1
            upload_tasks[task_id]["progress"] = int(((index + 1) / total_rows) * 100) if total_rows > 0 else 100
            
            try:
                row_dict = {k: (v if pd.notna(v) else None) for k, v in row.items()}
                
                # Extract core fields
                email = str(row_dict.get('Email', row_dict.get('email', ''))).strip()
                if not email or email.lower() == 'nan' or email.lower() == 'none' or '@' not in email:
                    skipped += 1
                    continue
                    
                name = str(row_dict.get('Full Name', row_dict.get('Name', row_dict.get('name', '')))).strip()
                if not name: name = email.split('@')[0]
                
                raw_role = str(row_dict.get('Designation', row_dict.get('Role', 'Waffler'))).strip()
                role = raw_role if raw_role and raw_role.lower() != 'nan' else "Waffler"
                
                raw_cat = str(row_dict.get('Category', row_dict.get('Department', 'Employee'))).strip()
                category = "Employee"
                if raw_cat and raw_cat.lower() != 'nan':
                    if "manager" in raw_cat.lower(): category = "Manager"
                    elif "super" in raw_cat.lower(): category = "Supervisor"
                    elif "admin" in raw_cat.lower(): category = "Super Admin"
                
                store = str(row_dict.get('Store Name', row_dict.get('Store', 'Unassigned'))).strip()
                if not store or store.lower() == 'nan': store = "Unassigned"
                
                password = str(row_dict.get('Password', 'Welcome@123')).strip()
                profile_data = row_dict
                
                user_data = {
                    "name": name, "email": email, "password": password,
                    "role": role, "category": category, "store": store,
                    "privileges": [], "is_superadmin": False, "has_admin_access": False,
                    "profile_data": profile_data
                }
                
                # Check exist - use optional to not raise exception
                existing_user = service.get_user_by_email_optional(email)
                if existing_user:
                    skipped += 1
                    continue
                
                service.create_user(user_data)
                created += 1
                
            except Exception as e:
                errors.append({"email": row_dict.get("Email", "unknown"), "error": str(e)})
                logger.error(f"Bulk upload row error: {e}")

        # Complete
        upload_tasks[task_id]["status"] = "completed"
        upload_tasks[task_id]["results"] = {
            "created": created,
            "skipped": skipped,
            "errors": errors
        }
        logger.info(f"Bulk upload completed: {created} created, {skipped} skipped, {len(errors)} errors")
        
    except Exception as e:
        upload_tasks[task_id]["status"] = "failed"
        upload_tasks[task_id]["error"] = str(e)
        logger.error(f"Bulk upload task failed: {e}")
    finally:
        # Always close the session
        db.close()


@router.post("/bulk-upload")
async def bulk_upload_users(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_admin)
):
    """
    Start background bulk upload task.
    """
    import uuid
    
    # Read content here (async) before passing to background task
    try:
        contents = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file: {e}")

    task_id = str(uuid.uuid4())
    upload_tasks[task_id] = {
        "status": "processing",
        "progress": 0,
        "total": 0,
        "current": 0,
        "filename": file.filename
    }
    
    background_tasks.add_task(process_bulk_upload_task, task_id, contents)
    
    return {
        "status": "processing",
        "task_id": task_id,
        "message": "Upload started in background"
    }


@router.get("/bulk-upload/template")
async def get_bulk_upload_template():
    """
    Returns the expected format for bulk user upload based on the standard employee export.
    """
    return {
        "columns": [
            "Employee Code", "Full Name", "Temporary Employee Code", "User Name", "Date of Birth", 
            "Gender", "Email", "Contact Number", "Address", "Proof Type", "Proof ID", 
            "Qualification", "Specialization", "Qualification Status", "Previous Experience Designation", 
            "Previous Experience", "Marital Status", "Shirt Size", "Denim Size", "Blood Group", 
            "Account Verified", "Account Approved", "Approved By", "Joining Date", "Date of Resign", 
            "Date of Leaving", "Reason for Leaving", "Franchise", "Store Name", "Store Code", 
            "Region", "City", "State", "Designation", "User Status", "Grade", "Concept", 
            "Department", "Sub Department", "Function", "Sub Function", "Job Role", 
            "Career Job Roles", "User Created On"
        ],
        "example": [
            {
                "Employee Code": "BWCO-0028",
                "Full Name": "Roshan Malekar",
                "Email": "malekarroshan2@gmail.com",
                "Designation": "Assistant Store Manager - Store Operations",
                "Store Name": "C/005-MH-MMR-Ghatkopar",
                "Department": "Store Operations",
                "Contact Number": "9177382834",
                "Gender": "male",
                "Join Date": "23-09-2017"
            }
        ],
        "notes": [
            "Email is mandatory.",
            "Default password will be 'Welcome@123' if not specified.",
            "Designation will be mapped to User Role.",
            "Store Name will be used for store assignment."
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


@router.post("/bulk-delete")
async def bulk_delete_users(
    data: Dict[str, List[str]],
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_admin)
):
    """
    Bulk delete users by list of emails (admin only).
    """
    emails = data.get("emails", [])
    if not emails:
        raise HTTPException(status_code=400, detail="No emails provided")
        
    service = UserService(db)
    try:
        result = service.bulk_delete_users(emails)
        logger.info(f"Bulk deleted {result['deleted']} users by {current_user.get('email')}")
        return result
    except Exception as e:
        logger.error(f"Bulk deletion failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
