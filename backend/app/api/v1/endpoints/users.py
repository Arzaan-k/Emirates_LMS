"""
User Management Endpoints
CRUD operations for users, privileges, stores
"""

import json
import logging
from typing import Dict, Any, Optional, List

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, BackgroundTasks, Request, Form, Query
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
import io
import csv
from app.config.database import get_db
from app.core.dependencies import get_current_user, require_admin, require_privilege
from app.core.middleware import limiter
from app.services.user_service import UserService
from app.schemas.user import UserCreate, UserResponse, UserUpdate
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/users", tags=["Users"])


# ==========================================
# USER CRUD ENDPOINTS
# ==========================================

@router.get("/filters")
def list_filters(db: Session = Depends(get_db)):
    """
    Get all available filter options for users.
    Returns distinct values for roles, stores, and profile fields.
    """
    all_users = db.query(User).all()

    filters = {
        "roles": set(),
        "stores": set(),
        "departments": set(),
        "sub_departments": set(),
        "designations": set(),
        "regions": set(),
        "cities": set(),
        "states": set(),
        "grades": set(),
        "statuses": set(),
        "qualifications": set(),
        "genders": set(),
        "franchises": set(),
        "concepts": set(),
        "functions": set(),
        "sub_functions": set(),
        "job_roles": set(),
        "marital_statuses": set(),
        "blood_groups": set(),
    }

    _INVALID = {'nan', 'none', 'n/a', 'na', '', 'unassigned'}

    def _clean(val):
        if val is None:
            return None
        s = str(val).strip()
        return None if s.lower() in _INVALID else s

    for user in all_users:
        r = _clean(user.role)
        if r:
            filters["roles"].add(r)
        s = _clean(user.store)
        if s:
            filters["stores"].add(s)

        pd = user.profile_data or {}

        def add_if_exists(key_set, *keys):
            for k in keys:
                v = _clean(pd.get(k))
                if v:
                    filters[key_set].add(v)
                    return

        add_if_exists("departments", "Department")
        add_if_exists("sub_departments", "Sub Department")
        add_if_exists("designations", "Designation")
        add_if_exists("regions", "Region")
        add_if_exists("cities", "City")
        add_if_exists("states", "State")
        add_if_exists("grades", "Grade")
        add_if_exists("statuses", "User Status")
        add_if_exists("qualifications", "Qualification")
        add_if_exists("genders", "Gender")
        add_if_exists("franchises", "Franchise")
        add_if_exists("concepts", "Concept")
        add_if_exists("functions", "Function")
        add_if_exists("sub_functions", "Sub Function")
        add_if_exists("job_roles", "Job Role")
        add_if_exists("marital_statuses", "Marital Status")
        add_if_exists("blood_groups", "Blood Group")

    # Remove empty sets from result
    return {k: sorted(list(v)) for k, v in filters.items() if v}


@router.get("/", response_model=Dict[str, Any])
def list_users(
    page: int = 1,
    limit: int = 50,
    search: str = "",
    store: List[str] = Query(None),
    role: List[str] = Query(None),
    department: List[str] = Query(None),
    sub_department: List[str] = Query(None),
    designation: List[str] = Query(None),
    region: List[str] = Query(None),
    city: List[str] = Query(None),
    state: List[str] = Query(None),
    grade: List[str] = Query(None),
    user_status: List[str] = Query(None),
    is_external: Optional[bool] = None,
    qualification: List[str] = Query(None),
    gender: List[str] = Query(None),
    franchise: List[str] = Query(None),
    concept: List[str] = Query(None),
    function: List[str] = Query(None),
    sub_function: List[str] = Query(None),
    job_role: List[str] = Query(None),
    marital_status: List[str] = Query(None),
    blood_group: List[str] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Optimized users list with pagination and filtering.
    """

    skip = (page - 1) * limit
    service = UserService(db)

    # Profile data JSON keys (capital-cased as stored in profile_data)
    filters = {}
    if department:     filters["Department"] = department
    if sub_department: filters["Sub Department"] = sub_department
    if designation:    filters["Designation"] = designation
    if region:         filters["Region"] = region
    if city:           filters["City"] = city
    if state:          filters["State"] = state
    if grade:          filters["Grade"] = grade
    if user_status:    filters["User Status"] = user_status
    if qualification:  filters["Qualification"] = qualification
    if gender:         filters["Gender"] = gender
    if franchise:      filters["Franchise"] = franchise
    if concept:        filters["Concept"] = concept
    if function:       filters["Function"] = function
    if sub_function:   filters["Sub Function"] = sub_function
    if job_role:       filters["Job Role"] = job_role
    if marital_status: filters["Marital Status"] = marital_status
    if blood_group:    filters["Blood Group"] = blood_group
    
    # direct column filters
    if is_external is not None:
        # We handle direct column 'is_external' in service if we pass it as part of filters 
        # but UserService.get_users_with_count handles 'store' and 'role' explicitly.
        # We need to pass is_external to the filters dict and ensure service handles it.
        # Our modified service checks hasattr(User, key), so 'is_external' will work if passed in filters.
        filters["is_external"] = is_external
        
    # Handle store and role if they are lists (service expects values)
    # The service method get_users_with_count currently takes single `store` and `role` arguments
    # but I modified it to check `filters` dict too.
    # However, I should pass them via `filters` if I want list supoort, 
    # OR update service signature.
    # In my previous edit to UserService, I kept `store` and `role` as strict args, 
    # BUT I also added `filters` loop which checks `hasattr(User, key)`.
    # `User` has `store` and `role`.
    # So if I pass them in `filters`, they will be applied using `in_` operator if list.
    # So I should pass them in `filters` and pass `None` to the specific args.
    
    if store: filters["store"] = store
    if role: filters["role"] = role

    users, total = service.get_users_with_count(
        skip=skip,
        limit=limit,
        store=None, # Passed in filters
        role=None,  # Passed in filters
        search=search or None,
        filters=filters
    )

    # Fast serialization
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
    store: List[str] = Query(None),
    role: List[str] = Query(None),
    department: List[str] = Query(None),
    sub_department: List[str] = Query(None),
    designation: List[str] = Query(None),
    region: List[str] = Query(None),
    city: List[str] = Query(None),
    state: List[str] = Query(None),
    grade: List[str] = Query(None),
    user_status: List[str] = Query(None),
    is_external: Optional[bool] = None,
    qualification: List[str] = Query(None),
    gender: List[str] = Query(None),
    franchise: List[str] = Query(None),
    concept: List[str] = Query(None),
    function: List[str] = Query(None),
    sub_function: List[str] = Query(None),
    job_role: List[str] = Query(None),
    marital_status: List[str] = Query(None),
    blood_group: List[str] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Alias for /users/ - backward compatibility with frontend.
    """
    return list_users(
        page=page, limit=limit, search=search,
        store=store, role=role, department=department,
        sub_department=sub_department, designation=designation,
        region=region, city=city, state=state, grade=grade,
        user_status=user_status, is_external=is_external,
        qualification=qualification, gender=gender,
        franchise=franchise, concept=concept, function=function,
        sub_function=sub_function, job_role=job_role,
        marital_status=marital_status, blood_group=blood_group,
        db=db,
    )


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
    if "is_external" in data:
        updates["is_external"] = data["is_external"]
    if "joined_at_level" in data:
        updates["joined_at_level"] = data["joined_at_level"]
    if "password" in data and data["password"]:
        updates["password"] = data["password"]
    if "profile_data" in data:
        updates["profile_data"] = data["profile_data"]

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
        "is_external": data.get("is_external", False),
        "joined_at_level": data.get("joined_at_level", None),
        "profile_data": data.get("profile_data", {}),
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
    Returns grouped privileges with view/manage access levels.
    Each item includes id, name, icon, access (view|manage), description, and group.
    Flat array format retained for backward compat — frontend can use 'group' field to group UI.
    """
    from app.services.user_service import PRIVILEGE_GROUPS

    flat = []
    for group in PRIVILEGE_GROUPS:
        for item in group["items"]:
            entry = {
                "id": item["id"],
                "name": item["label"],
                "label": item["label"],
                "icon": _privilege_icon(item["id"]),
                "access": item["access"],
                "description": item.get("description", ""),
                "group": group["group"],
                "group_icon": group["icon"],
            }
            if "feature" in item:
                entry["feature"] = item["feature"]
            flat.append(entry)
    return flat


def _privilege_icon(priv_id: str) -> str:
    ICONS = {
        "team_list_view": "eye", "team_list": "users", "bulk_upload": "database",
        "create_user": "user-plus", "upload_training_view": "eye",
        "upload_training": "upload-cloud", "manage_buckets": "folder-plus",
        "manage_learning_path": "git-merge", "post_news": "bell",
        "send_notification": "send", "assign_quiz": "check-square",
        "post_quiz": "edit-3", "scheduled_exams": "calendar",
        "exam_reports": "file-text", "proctored_assessment": "monitor",
        "proctored_create_manage": "settings", "proctored_view_results": "file-text",
        "view_analytics": "trending-up", "reports": "bar-chart-2",
        "live_tracking": "map-pin", "audits_view": "eye", "audits": "shield",
        "view_audit_logs": "clipboard", "access_control": "lock",
        "schedule_meeting": "video", "crm_tickets": "tag",
        "manage_simulations": "play-circle", "support_library": "book-open",
    }
    return ICONS.get(priv_id, "check")

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


@router.delete("/categories/{category_id}")
async def delete_user_category(
    category_id: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_admin)
):
    """
    Deletes a user category.
    """
    global _user_categories_store
    
    # Check if category exists
    category = next((c for c in _user_categories_store if c["id"] == str(category_id)), None)
    if not category:
        # If not found in memory, just return success to avoid blocking UI
        return {"status": "success", "message": "Category removed"}
        
    # Prevent deleting critical default categories (Super Admin, Employee)
    # IDs 1 (Super Admin) and 4 (Employee) are critical
    if category["id"] in ["1", "4"]:
        raise HTTPException(status_code=400, detail="Cannot delete critical system categories (Super Admin, Employee)")
    
    # Remove from store
    # Since _user_categories_store is a list of dicts, we filter it
    # We must access the global variable to modify it
    for i, cat in enumerate(_user_categories_store):
        if cat["id"] == str(category_id):
            del _user_categories_store[i]
            break
            
    return {"status": "success", "message": f"Category {category['name']} deleted"}


# ==========================================
# STORES ENDPOINTS
# ==========================================


# In-memory store management (mutable)
_stores_store = [
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
    return _stores_store


@router.post("/stores")
async def create_store(
    store: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_admin)
):
    """
    Create a new store.
    """
    global _stores_store
    
    new_store = {
        "id": f"store_{uuid.uuid4().hex[:8]}",
        "name": store.get("name"),
        "city": store.get("city", ""),
        "region": store.get("region", "")
    }
    
    _stores_store.append(new_store)
    return {"status": "success", "store": new_store}


@router.delete("/stores/{store_id}")
async def delete_store(
    store_id: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_admin)
):
    """
    Delete a store.
    """
    global _stores_store
    
    # Check if store exists
    store = next((s for s in _stores_store if s["id"] == str(store_id)), None)
    if not store:
        return {"status": "success", "message": "Store removed"}
        
    # Prevent deleting HQ (ID 1) as minimum default, but allow others
    if store_id == "1":
        raise HTTPException(status_code=400, detail="Cannot delete HQ store")
        
    # Remove from store
    for i, s in enumerate(_stores_store):
        if s["id"] == str(store_id):
            del _stores_store[i]
            break
            
    return {"status": "success", "message": f"Store {store['name']} deleted"}



@router.get("/stores/summary")
async def get_stores_summary(db: Session = Depends(get_db)):
    """
    Returns stores with employee count for analytics.
    """
    service = UserService(db)
    store_counts = service.get_user_count_by_store()
    
    result = []
    for store in _stores_store:
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
        updated = 0
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

                # External user flag from CSV
                raw_external = str(row_dict.get('Is External', row_dict.get('External', 'No'))).strip().lower()
                is_external = raw_external in ('yes', 'true', '1', 'y', 'external')

                raw_joined_level = str(row_dict.get('Joined At Level', row_dict.get('joined_at_level', ''))).strip()
                joined_at_level = raw_joined_level if raw_joined_level and raw_joined_level.lower() not in ('nan', 'none', '') else None
                # If external but no joined_at_level specified, default to their role
                if is_external and not joined_at_level:
                    joined_at_level = role

                password = str(row_dict.get('Password', 'Welcome@123')).strip()
                profile_data = row_dict

                # Check if user already exists
                existing_user = service.get_user_by_email_optional(email)
                if existing_user:
                    # Update profile_data and non-sensitive fields with latest data from sheet
                    # Preserve credentials (password, privileges, is_superadmin, has_admin_access)
                    updates = {
                        "name": name,
                        "store": store,
                        "profile_data": profile_data,
                    }
                    # Only update role/category if the sheet has a meaningful value
                    if role and role != "Waffler":
                        updates["role"] = role
                    if category and category != "Employee":
                        updates["category"] = category
                    if is_external:
                        updates["is_external"] = is_external
                        updates["joined_at_level"] = joined_at_level
                    service.update_user(email, updates)
                    updated += 1
                    continue

                user_data = {
                    "name": name, "email": email, "password": password,
                    "role": role, "category": category, "store": store,
                    "privileges": [], "is_superadmin": False, "has_admin_access": False,
                    "is_external": is_external, "joined_at_level": joined_at_level,
                    "profile_data": profile_data
                }

                service.create_user(user_data)
                created += 1

            except Exception as e:
                errors.append({"email": row_dict.get("Email", "unknown"), "error": str(e)})
                logger.error(f"Bulk upload row error: {e}")

        # Complete
        upload_tasks[task_id]["status"] = "completed"
        upload_tasks[task_id]["results"] = {
            "created": created,
            "updated": updated,
            "skipped": skipped,
            "errors": errors
        }
        logger.info(f"Bulk upload completed: {created} created, {updated} updated, {skipped} skipped, {len(errors)} errors")
        
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
            "Career Job Roles", "User Created On", "Is External", "Joined At Level"
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
                "Join Date": "23-09-2017",
                "Is External": "Yes",
                "Joined At Level": "Gold Waffler"
            }
        ],
        "notes": [
            "Email is mandatory.",
            "Default password will be 'Welcome@123' if not specified.",
            "Designation will be mapped to User Role.",
            "Store Name will be used for store assignment.",
            "'Is External' accepts Yes/No/True/False. External users see merged levels in their learning path.",
            "'Joined At Level' specifies the level the external user joined at. Defaults to their Designation/Role if not set."
        ]
    }

# ==========================================
# EXTERNAL USER MANAGEMENT
# (Must come BEFORE /{email} catch-all route)
# ==========================================

@router.post("/toggle-external")
async def toggle_external_status(
    data: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_admin)
):
    """
    Toggle a user's external status. Admin only.
    Body: { email, is_external, joined_at_level? }
    """
    from app.models.user import User

    email = data.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")

    is_external = data.get("is_external", False)
    joined_at_level = data.get("joined_at_level", None)

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail=f"User '{email}' not found")

    user.is_external = is_external
    if is_external:
        # If marking as external, set joined_at_level (default to current role)
        user.joined_at_level = joined_at_level or user.role
    else:
        # If marking as normal, clear joined_at_level
        user.joined_at_level = None

    db.commit()
    db.refresh(user)

    logger.info(f"External status toggled for {email}: is_external={is_external}, joined_at_level={user.joined_at_level} by {current_user.get('email')}")
    return {"status": "success", "user": user.to_dict()}


@router.post("/bulk-toggle-external")
async def bulk_toggle_external(
    data: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_admin)
):
    """
    Bulk toggle external status for multiple users. Admin only.
    Body: { emails: [...], is_external: bool, joined_at_level?: string }
    """
    from app.models.user import User

    emails = data.get("emails", [])
    is_external = data.get("is_external", False)
    joined_at_level = data.get("joined_at_level", None)

    if not emails:
        raise HTTPException(status_code=400, detail="No emails provided")

    updated = 0
    for email in emails:
        user = db.query(User).filter(User.email == email).first()
        if user:
            user.is_external = is_external
            if is_external:
                user.joined_at_level = joined_at_level or user.role
            else:
                user.joined_at_level = None
            updated += 1

    db.commit()
    logger.info(f"Bulk external toggle: {updated} users set to is_external={is_external} by {current_user.get('email')}")
    return {"status": "success", "updated": updated}


# ==========================================
# SMART USER CATEGORIZATION FOR SCHEDULE EXAMS
# (Must come BEFORE /{email} catch-all route)
# ==========================================

@router.get("/smart-categories")
async def get_smart_user_categories(db: Session = Depends(get_db)):
    """
    Get smart user categories based on learning progress, roles, and stores.
    Used for intelligent user selection in Schedule Exams feature.

    Returns categories like:
    - Completed All Waffler Courses
    - Completed All Silver Waffler Courses
    - Ready for Promotion (eligible for next level)
    - All Current Wafflers (by role)
    - Mumbai Central Store (by location)
    """
    from app.models.user import User, UserNodeProgress
    from app.models.content import Content
    from app.repositories.content_repository import AccessRuleRepository

    service = UserService(db)
    categories = []

    try:
        # Get all users
        all_users = db.query(User).all()

        # Category 1: By Current Role
        role_counts = {}
        for user in all_users:
            role = user.role or "Waffler"
            if role not in role_counts:
                role_counts[role] = []
            role_counts[role].append(user.email)

        for role, emails in role_counts.items():
            categories.append({
                "id": f"role_{role.lower().replace(' ', '_')}",
                "name": f"All Current {role}s",
                "description": f"All users with {role} designation",
                "type": "role",
                "user_emails": emails,
                "count": len(emails),
                "icon": "users",
                "color": "#3B82F6"
            })

        # Category 2: By Store Location
        store_counts = {}
        for user in all_users:
            store = user.store or "Unassigned"
            if store != "Unassigned" and store.strip():
                if store not in store_counts:
                    store_counts[store] = []
                store_counts[store].append(user.email)

        for store, emails in store_counts.items():
            categories.append({
                "id": f"store_{store.lower().replace(' ', '_').replace('/', '_')}",
                "name": f"{store}",
                "description": f"All users from {store}",
                "type": "store",
                "user_emails": emails,
                "count": len(emails),
                "icon": "map-pin",
                "color": "#10B981"
            })

        # Category 3: By Course Completion (Career Progression)
        # Get all career progression courses grouped by role
        career_courses = db.query(Content).filter(
            Content.is_path_node == True,
            Content.learning_path_type == "career_progression"
        ).all()

        # Group courses by role (from access rules or course metadata)
        access_repo = AccessRuleRepository(db)
        access_rules = access_repo.get_all_rules_dict()

        # Define role levels for career progression
        role_levels = [
            "Waffler", "Silver Waffler", "Gold Waffler",
            "Shift Manager", "Assistant Store Manager", "Store Manager"
        ]

        for role_level in role_levels:
            # Get courses accessible to this role
            if role_level in access_rules:
                accessible_course_ids = access_rules[role_level].get("accessible_courses", [])
            else:
                # Fallback: all courses
                accessible_course_ids = [c.id for c in career_courses]

            if not accessible_course_ids:
                continue

            # Find users who completed ALL courses for this role
            completed_users = []
            for user in all_users:
                # Get user's completed courses
                completed_nodes = db.query(UserNodeProgress).filter(
                    UserNodeProgress.user_email == user.email,
                    UserNodeProgress.completed == True,
                    UserNodeProgress.node_id.in_(accessible_course_ids)
                ).all()

                completed_node_ids = {node.node_id for node in completed_nodes}

                # Check if user completed ALL courses for this role
                if set(accessible_course_ids).issubset(completed_node_ids):
                    completed_users.append(user.email)

            if completed_users:
                categories.append({
                    "id": f"completed_{role_level.lower().replace(' ', '_')}",
                    "name": f"Completed All {role_level} Courses",
                    "description": f"Users who completed all {role_level} career progression courses",
                    "type": "completion",
                    "user_emails": completed_users,
                    "count": len(completed_users),
                    "icon": "award",
                    "color": "#F59E0B"
                })

        # Category 4: Ready for Promotion (completed current role + eligible for next)
        for i, current_role in enumerate(role_levels[:-1]):  # Exclude last role (Store Manager)
            next_role = role_levels[i + 1]

            # Get courses for current role
            if current_role in access_rules:
                current_courses = access_rules[current_role].get("accessible_courses", [])
            else:
                current_courses = []

            if not current_courses:
                continue

            # Find users who completed current role and are at that designation
            eligible_users = []
            for user in all_users:
                if user.role == current_role:
                    # Check if completed all current role courses
                    completed_nodes = db.query(UserNodeProgress).filter(
                        UserNodeProgress.user_email == user.email,
                        UserNodeProgress.completed == True,
                        UserNodeProgress.node_id.in_(current_courses)
                    ).all()

                    completed_node_ids = {node.node_id for node in completed_nodes}

                    if set(current_courses).issubset(completed_node_ids):
                        eligible_users.append(user.email)

            if eligible_users:
                categories.append({
                    "id": f"promotion_ready_{next_role.lower().replace(' ', '_')}",
                    "name": f"Ready for {next_role} Exam",
                    "description": f"Completed {current_role} courses, eligible for {next_role} promotion",
                    "type": "promotion",
                    "user_emails": eligible_users,
                    "count": len(eligible_users),
                    "icon": "trending-up",
                    "color": "#8B5CF6"
                })

        # Category 5: By Progress Percentage (50%, 75%, etc.)
        progress_thresholds = [
            {"min": 50, "max": 74, "label": "50-75% Progress"},
            {"min": 75, "max": 99, "label": "75-99% Progress"}
        ]

        for threshold in progress_thresholds:
            threshold_users = []
            for user in all_users:
                # Calculate overall progress
                total_courses = len(career_courses)
                if total_courses == 0:
                    continue

                completed_count = db.query(UserNodeProgress).filter(
                    UserNodeProgress.user_email == user.email,
                    UserNodeProgress.completed == True,
                    UserNodeProgress.node_id.in_([c.id for c in career_courses])
                ).count()

                progress_percent = (completed_count / total_courses) * 100

                if threshold["min"] <= progress_percent <= threshold["max"]:
                    threshold_users.append(user.email)

            if threshold_users:
                categories.append({
                    "id": f"progress_{threshold['min']}_{threshold['max']}",
                    "name": f"{threshold['label']}",
                    "description": f"Users with {threshold['label']} in career progression",
                    "type": "progress",
                    "user_emails": threshold_users,
                    "count": len(threshold_users),
                    "icon": "activity",
                    "color": "#06B6D4"
                })

        # Sort categories: Role -> Store -> Completion -> Promotion -> Progress
        type_order = {"role": 1, "store": 2, "completion": 3, "promotion": 4, "progress": 5}
        categories.sort(key=lambda x: (type_order.get(x["type"], 99), -x["count"]))

        logger.info(f"Generated {len(categories)} smart user categories")
        return {"categories": categories, "total": len(categories)}

    except Exception as e:
        logger.error(f"Smart categories generation failed: {e}")
        return {"categories": [], "total": 0, "error": str(e)}


@router.post("/validate-employee-codes")
async def validate_employee_codes(
    data: dict,
    db: Session = Depends(get_db)
):
    """
    Validate employee codes from bulk upload and return matching user emails.
    Used for bulk user selection in Schedule Exams feature.

    Request body:
    {
        "employee_codes": ["BWCO-0028", "BWCO-0029", ...]
    }

    Returns:
    {
        "matched": ["email1@example.com", "email2@example.com"],
        "not_found": ["BWCO-9999"],
        "matched_count": 2,
        "not_found_count": 1
    }
    """
    from app.models.user import User

    try:
        employee_codes = data.get("employee_codes", [])
        if not employee_codes:
            raise HTTPException(status_code=400, detail="No employee codes provided")

        # Clean and normalize employee codes
        employee_codes = [str(code).strip() for code in employee_codes if code]

        logger.info(f"Validating {len(employee_codes)} employee codes")

        # Get all users
        all_users = db.query(User).all()

        # Match employee codes with users
        # The employee code might be stored in profile_data JSON field or email prefix
        matched_emails = []
        not_found_codes = []

        for code in employee_codes:
            found = False

            # Try multiple matching strategies:
            # 1. Check if code is in profile_data
            # 2. Check if email starts with code
            # 3. Check if name contains code

            for user in all_users:
                # Strategy 1: Check profile_data for employee_code
                if user.profile_data and isinstance(user.profile_data, dict):
                    profile_emp_code = user.profile_data.get("employee_code") or user.profile_data.get("Employee Code")
                    if profile_emp_code and str(profile_emp_code).strip().upper() == code.upper():
                        matched_emails.append(user.email)
                        found = True
                        break

                # Strategy 2: Check if email starts with employee code (common pattern)
                if user.email.upper().startswith(code.upper()):
                    matched_emails.append(user.email)
                    found = True
                    break

                # Strategy 3: Check if name contains the code
                if user.name and code.upper() in user.name.upper():
                    matched_emails.append(user.email)
                    found = True
                    break

            if not found:
                not_found_codes.append(code)

        # Remove duplicates while preserving order
        matched_emails = list(dict.fromkeys(matched_emails))

        result = {
            "matched": matched_emails,
            "not_found": not_found_codes,
            "matched_count": len(matched_emails),
            "not_found_count": len(not_found_codes),
            "total_codes": len(employee_codes)
        }

        logger.info(f"Matched {len(matched_emails)}/{len(employee_codes)} employee codes")
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Employee code validation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Validation failed: {str(e)}")


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
    if "is_external" in data:
        updates["is_external"] = data["is_external"]
    if "joined_at_level" in data:
        updates["joined_at_level"] = data["joined_at_level"]
    if "password" in data and data["password"]:
        updates["password"] = data["password"]
    if "profile_data" in data:
        updates["profile_data"] = data["profile_data"]

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


# ==========================================
# SELF-PROFILE UPDATE (Employee-facing)
# ==========================================

@router.put("/me/profile")
async def update_my_profile(
    data: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Employee updates their own profile: contact number, name, profile picture.
    Profile picture must be a base64 data URL string.
    """
    email = current_user.get("email") or current_user.get("sub")
    service = UserService(db)
    user = service.get_user_by_email(email)

    # Allowed self-edit fields
    if "name" in data and data["name"]:
        user.name = data["name"].strip()

    # Merge updatable profile_data keys
    updatable_profile_keys = {"Contact Number", "Address", "profile_pic"}
    pd = dict(user.profile_data or {})
    for key in updatable_profile_keys:
        if key in data:
            pd[key] = data[key]
    user.profile_data = pd

    db.commit()
    db.refresh(user)
    user_dict = user.to_dict()
    user_dict.pop("password", None)
    return {"status": "success", "user": user_dict}


@router.post("/me/change-email/request")
async def request_email_change(
    data: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Step 1: Employee requests email change.
    Generates a 6-digit OTP and stores it (reuses reset_token column).
    In production, send via email. Here we return it in the response for testing.
    """
    import secrets as _secrets
    from datetime import datetime as _dt, timedelta as _td

    email = current_user.get("email") or current_user.get("sub")
    new_email = (data.get("new_email") or "").lower().strip()

    if not new_email:
        raise HTTPException(status_code=400, detail="new_email is required")

    service = UserService(db)
    # Check new email not already taken
    existing = service.get_user_by_email_optional(new_email)
    if existing and existing.email != email:
        raise HTTPException(status_code=409, detail="Email already in use")

    user = service.get_user_by_email(email)

    # Generate OTP and store pending email in profile_data
    otp = f"{_secrets.randbelow(1000000):06d}"
    user.reset_token = otp
    user.reset_token_expires = _dt.utcnow() + _td(minutes=15)

    pd = dict(user.profile_data or {})
    pd["_pending_email"] = new_email
    user.profile_data = pd

    db.commit()
    logger.info(f"Email change OTP generated for {email} → {new_email}")

    # In production: send OTP to NEW email via email service
    # For now return it so frontend can display (remove in prod)
    return {"status": "success", "message": "OTP sent to new email address", "otp": otp}


@router.post("/me/change-email/verify")
async def verify_email_change(
    data: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Step 2: Employee verifies OTP and completes email change.
    """
    from datetime import datetime as _dt

    email = current_user.get("email") or current_user.get("sub")
    otp = str(data.get("otp", "")).strip()

    service = UserService(db)
    user = service.get_user_by_email(email)

    if not user.reset_token or user.reset_token != otp:
        raise HTTPException(status_code=400, detail="Invalid OTP")
    if not user.reset_token_expires or user.reset_token_expires < _dt.utcnow():
        raise HTTPException(status_code=400, detail="OTP has expired")

    pd = dict(user.profile_data or {})
    new_email = pd.pop("_pending_email", None)
    if not new_email:
        raise HTTPException(status_code=400, detail="No pending email change found")

    user.email = new_email
    user.reset_token = None
    user.reset_token_expires = None
    user.profile_data = pd

    db.commit()
    db.refresh(user)
    user_dict = user.to_dict()
    user_dict.pop("password", None)
    return {"status": "success", "message": "Email updated successfully", "user": user_dict}


@router.put("/me/change-password")
async def change_my_password(
    data: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Employee changes their own password. Requires current password verification.
    """
    email = current_user.get("email") or current_user.get("sub")
    current_password = data.get("current_password", "")
    new_password = data.get("new_password", "")

    if not current_password or not new_password:
        raise HTTPException(status_code=400, detail="current_password and new_password required")

    service = UserService(db)
    try:
        service.change_password(email, current_password, new_password)
        return {"status": "success", "message": "Password changed successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
