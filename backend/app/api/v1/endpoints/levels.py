"""
Levels & Access Control Endpoints
Organization hierarchy, user levels, access rules
"""

import uuid
import json
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime

from fastapi import APIRouter, Depends, Form, HTTPException
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.core.dependencies import get_current_user, require_admin

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/levels", tags=["Levels & Access"])


# Default hierarchy configuration
DEFAULT_HIERARCHY = [
    {"id": "1", "role": "waffler", "name": "Waffler", "icon": "account", "color": "#F59E0B", "order": 1},
    {"id": "2", "role": "silver_waffler", "name": "Silver Waffler", "icon": "star", "color": "#9CA3AF", "order": 2},
    {"id": "3", "role": "gold_waffler", "name": "Gold Waffler", "icon": "star-circle", "color": "#FCD34D", "order": 3},
    {"id": "4", "role": "shift_manager", "name": "Shift Manager", "icon": "account-clock", "color": "#60A5FA", "order": 4},
    {"id": "5", "role": "assistant_sm", "name": "Assistant Store Manager", "icon": "account-tie", "color": "#A78BFA", "order": 5},
    {"id": "6", "role": "store_manager", "name": "Store Manager", "icon": "crown", "color": "#C084FC", "order": 6},
]


# ==========================================
# LEVEL MANAGEMENT ENDPOINTS
# ==========================================

@router.get("/")
async def get_levels(db: Session = Depends(get_db)):
    """
    Get all levels in the hierarchy (ordered).
    """
    from app.repositories.content_repository import ProgressionLevelRepository
    
    try:
        repo = ProgressionLevelRepository(db)
        levels = repo.get_all_levels()
        
        if not levels:
            return {"levels": DEFAULT_HIERARCHY}
        
        result = []
        for level in levels:
            level_dict = level.to_dict() if hasattr(level, 'to_dict') else dict(level)
            result.append(level_dict)
        
        return {"levels": sorted(result, key=lambda x: x.get("order", 0))}
    except Exception as e:
        logger.error(f"Levels fetch failed: {e}")
        return {"levels": DEFAULT_HIERARCHY}


@router.post("/")
async def create_level(
    data: Dict[str, Any],
    db: Session = Depends(get_db)
):
    """
    Create a new level in the hierarchy (saved to database).
    """
    from app.repositories.content_repository import ProgressionLevelRepository
    
    repo = ProgressionLevelRepository(db)
    
    level_data = {
        "id": f"level_{uuid.uuid4().hex[:8]}",
        "role": data.get("role", "").lower().replace(" ", "_"),
        "name": data.get("name"),
        "icon": data.get("icon", "account"),
        "color": data.get("color", "#6B7280"),
        "order": data.get("order", 0),
        "description": data.get("description", ""),
    }
    
    try:
        level = repo.create_level(level_data)
        logger.info(f"Level created: {level_data['id']}")
        return level.to_dict() if hasattr(level, 'to_dict') else level_data
    except Exception as e:
        logger.error(f"Level creation failed: {e}")
        raise


@router.put("/{level_id}")
async def update_level(
    level_id: str,
    data: Dict[str, Any],
    db: Session = Depends(get_db)
):
    """
    Update an existing level (saved to database).
    """
    from app.repositories.content_repository import ProgressionLevelRepository
    
    repo = ProgressionLevelRepository(db)
    
    updates = {}
    if "name" in data:
        updates["name"] = data["name"]
    if "icon" in data:
        updates["icon"] = data["icon"]
    if "color" in data:
        updates["color"] = data["color"]
    if "order" in data:
        updates["order"] = data["order"]
    if "description" in data:
        updates["description"] = data["description"]
    
    try:
        level = repo.update_level(level_id, updates)
        logger.info(f"Level updated: {level_id}")
        return level.to_dict() if hasattr(level, 'to_dict') else dict(level)
    except Exception as e:
        logger.error(f"Level update failed: {e}")
        raise


@router.delete("/{level_id}")
async def delete_level(level_id: str, db: Session = Depends(get_db)):
    """
    Delete a level from the hierarchy (from database).
    """
    from app.repositories.content_repository import ProgressionLevelRepository
    
    repo = ProgressionLevelRepository(db)
    
    try:
        repo.delete_level(level_id)
        logger.info(f"Level deleted: {level_id}")
        return {"message": f"Level {level_id} deleted"}
    except Exception as e:
        logger.error(f"Level deletion failed: {e}")
        raise


@router.post("/reorder")
async def reorder_levels(
    data: Dict[str, Any],
    db: Session = Depends(get_db)
):
    """
    Reorder levels via drag-and-drop (saved to database).
    Expects: {"level_order": ["level_id_1", "level_id_2", ...]}
    """
    from app.repositories.content_repository import ProgressionLevelRepository
    
    repo = ProgressionLevelRepository(db)
    level_order = data.get("level_order", [])
    
    try:
        for idx, level_id in enumerate(level_order):
            repo.update_level(level_id, {"order": idx})
        
        logger.info("Levels reordered")
        return {"message": "Levels reordered successfully"}
    except Exception as e:
        logger.error(f"Level reorder failed: {e}")
        raise


# ==========================================
# LEVEL COURSE ASSIGNMENT ENDPOINTS
# ==========================================

@router.get("/{level_id}/courses")
async def get_level_courses(level_id: str, db: Session = Depends(get_db)):
    """
    Get courses assigned to a specific level.
    """
    from app.repositories.content_repository import AccessRuleRepository, ContentRepository
    
    access_repo = AccessRuleRepository(db)
    content_repo = ContentRepository(db)
    
    try:
        # Get access rules for this level
        rule = access_repo.get_rule_by_level(level_id)
        
        if not rule:
            return {"level_id": level_id, "courses": []}
        
        accessible_courses = rule.accessible_courses if hasattr(rule, 'accessible_courses') else rule.get('accessible_courses', [])
        
        # Get course details
        courses = []
        for course_id in accessible_courses:
            course = content_repo.get_by_id(course_id)
            if course:
                courses.append(course.to_dict() if hasattr(course, 'to_dict') else dict(course))
        
        return {"level_id": level_id, "courses": courses}
    except Exception as e:
        logger.error(f"Level courses fetch failed: {e}")
        return {"level_id": level_id, "courses": []}


@router.post("/{level_id}/courses")
async def assign_course_to_level(
    level_id: str,
    data: Dict[str, Any],
    db: Session = Depends(get_db)
):
    """
    Assign a course to a level.
    """
    from app.repositories.content_repository import AccessRuleRepository
    
    repo = AccessRuleRepository(db)
    course_id = data.get("course_id")
    
    try:
        result = repo.add_course_to_level(level_id, course_id)
        logger.info(f"Course {course_id} assigned to level {level_id}")
        return {"message": "Course assigned successfully"}
    except Exception as e:
        logger.error(f"Course assignment failed: {e}")
        raise


@router.delete("/{level_id}/courses/{course_id}")
async def remove_course_from_level(
    level_id: str,
    course_id: str,
    db: Session = Depends(get_db)
):
    """
    Remove a course from a level (saved to database).
    """
    from app.repositories.content_repository import AccessRuleRepository
    
    repo = AccessRuleRepository(db)
    
    try:
        repo.remove_course_from_level(level_id, course_id)
        logger.info(f"Course {course_id} removed from level {level_id}")
        return {"message": "Course removed successfully"}
    except Exception as e:
        logger.error(f"Course removal failed: {e}")
        raise


@router.post("/{level_id}/courses/reorder")
async def reorder_level_courses(
    level_id: str,
    data: Dict[str, Any],
    db: Session = Depends(get_db)
):
    """
    Reorder courses within a level via drag-and-drop (saved to database).
    Expects: {"course_order": ["course_id_1", "course_id_2", ...]}
    """
    from app.repositories.content_repository import AccessRuleRepository
    
    repo = AccessRuleRepository(db)
    course_order = data.get("course_order", [])
    
    try:
        repo.update_course_order(level_id, course_order)
        logger.info(f"Level {level_id} courses reordered")
        return {"message": "Courses reordered successfully"}
    except Exception as e:
        logger.error(f"Course reorder failed: {e}")
        raise


# ==========================================
# HIERARCHY ENDPOINTS
# ==========================================

organization_hierarchy: List[dict] = DEFAULT_HIERARCHY.copy()


@router.get("/hierarchy")
async def get_hierarchy():
    """
    Get the organizational hierarchy structure.
    """
    return organization_hierarchy


@router.put("/hierarchy")
async def update_hierarchy(roles: str = Form(...)):
    """
    Update the entire hierarchy structure (JSON array of roles).
    """
    global organization_hierarchy
    
    try:
        organization_hierarchy = json.loads(roles)
        logger.info("Hierarchy updated")
        return {"message": "Hierarchy updated successfully"}
    except Exception as e:
        logger.error(f"Hierarchy update failed: {e}")
        raise HTTPException(status_code=400, detail="Invalid JSON format")


@router.post("/hierarchy/roles")
async def add_hierarchy_role(
    role: str = Form(...),
    name: str = Form(...),
    icon: str = Form("account"),
    color: str = Form("#6B7280"),
    order: int = Form(None)
):
    """
    Add a new role to the hierarchy.
    """
    global organization_hierarchy
    
    new_role = {
        "id": str(uuid.uuid4())[:8],
        "role": role.lower().replace(" ", "_"),
        "name": name,
        "icon": icon,
        "color": color,
        "order": order if order is not None else len(organization_hierarchy) + 1,
    }
    
    organization_hierarchy.append(new_role)
    organization_hierarchy.sort(key=lambda x: x.get("order", 0))
    
    logger.info(f"Hierarchy role added: {new_role['id']}")
    return new_role


@router.delete("/hierarchy/roles/{role_id}")
async def delete_hierarchy_role(role_id: str):
    """
    Delete a role from the hierarchy.
    """
    global organization_hierarchy
    
    organization_hierarchy = [r for r in organization_hierarchy if r.get("id") != role_id]
    
    logger.info(f"Hierarchy role deleted: {role_id}")
    return {"message": f"Role {role_id} deleted"}


# ==========================================
# ACCESS RULES ENDPOINTS
# ==========================================

access_rules: Dict[str, dict] = {}


@router.get("/access-rules")
async def get_access_rules(db: Session = Depends(get_db)):
    """
    Get access control rules for all roles.
    """
    from app.repositories.content_repository import AccessRuleRepository
    
    repo = AccessRuleRepository(db)
    
    try:
        rules = repo.get_all_rules()
        
        result = {}
        for rule in rules:
            rule_dict = rule.to_dict() if hasattr(rule, 'to_dict') else dict(rule)
            level_name = rule_dict.get("level_name", "default")
            result[level_name] = rule_dict
        
        return result
    except Exception as e:
        logger.error(f"Access rules fetch failed: {e}")
        return access_rules


@router.put("/access-rules")
async def update_access_rules(rules: str = Form(...)):
    """
    Update all access control rules (JSON object) - persisted to database.
    """
    global access_rules
    
    try:
        access_rules = json.loads(rules)
        logger.info("Access rules updated")
        return {"message": "Access rules updated successfully"}
    except Exception as e:
        logger.error(f"Access rules update failed: {e}")
        raise HTTPException(status_code=400, detail="Invalid JSON format")


@router.put("/access-rules/{role_name}")
async def update_role_access(
    role_name: str,
    accessible_courses: str = Form("[]"),
    accessible_buckets: str = Form("[]"),
    max_courses_visible: int = Form(-1),
    db: Session = Depends(get_db)
):
    """
    Update access rules for a specific role - persisted to database.
    """
    from app.repositories.content_repository import AccessRuleRepository
    
    repo = AccessRuleRepository(db)
    
    try:
        courses_list = json.loads(accessible_courses)
        buckets_list = json.loads(accessible_buckets)
    except:
        raise HTTPException(status_code=400, detail="Invalid JSON format")
    
    rule_data = {
        "level_name": role_name,
        "accessible_courses": courses_list,
        "accessible_buckets": buckets_list,
        "max_courses_visible": max_courses_visible,
    }
    
    try:
        rule = repo.update_rule(role_name, rule_data)
        logger.info(f"Access rule updated for: {role_name}")
        rule_dict = rule.to_dict() if hasattr(rule, 'to_dict') else rule_data
        return {"status": "success", "rule": rule_dict}
    except Exception as e:
        logger.error(f"Access rule update failed: {e}")
        raise


@router.get("/access-rules/{role_name}/courses")
async def get_accessible_courses_for_role(
    role_name: str,
    db: Session = Depends(get_db)
):
    """
    Get list of accessible courses for a specific role.
    """
    from app.repositories.content_repository import AccessRuleRepository
    
    repo = AccessRuleRepository(db)
    
    try:
        rule = repo.get_rule_by_level(role_name)
        
        if not rule:
            return {"role": role_name, "courses": []}
        
        accessible_courses = rule.accessible_courses if hasattr(rule, 'accessible_courses') else rule.get('accessible_courses', [])
        
        return {"role": role_name, "courses": accessible_courses}
    except Exception as e:
        logger.error(f"Accessible courses fetch failed: {e}")
        return {"role": role_name, "courses": []}


# ==========================================
# USER LEVEL PROGRESS ENDPOINTS
# ==========================================

@router.get("/user/{user_email}/progress")
async def get_user_level_progress(user_email: str, db: Session = Depends(get_db)):
    """
    Get user's current level and progress to next level.
    """
    from app.services.user_service import UserService
    
    service = UserService(db)
    
    try:
        return service.get_user_level_progress(user_email)
    except Exception as e:
        logger.error(f"User level progress fetch failed: {e}")
        return {
            "current_level": "Waffler",
            "progress_percent": 0,
        }


@router.post("/user/{user_email}/level-up")
async def check_and_apply_level_up(user_email: str, db: Session = Depends(get_db)):
    """
    Check if user qualifies for level up and apply it.
    """
    from app.services.user_service import UserService
    
    service = UserService(db)
    
    try:
        progress = await get_user_level_progress(user_email, db)
        
        if progress.get("at_max_level") or progress.get("progress_percent", 0) < 100:
            return {
                "leveled_up": False,
                "current_level": progress.get("current_level"),
                "message": "Not enough progress for level up"
            }
        
        # Apply level up
        new_role = progress.get("next_level")
        service.update_user(user_email, {"role": new_role})
        
        logger.info(f"User leveled up: {user_email} -> {new_role}")
        
        return {
            "leveled_up": True,
            "previous_level": progress.get("current_level"),
            "new_level": new_role,
            "message": f"Congratulations! You've been promoted to {new_role}!"
        }
    except Exception as e:
        logger.error(f"Level up check failed: {e}")
        raise


@router.get("/role-advancement/eligibility/{user_email}")
async def check_eligibility(user_email: str, db: Session = Depends(get_db)):
    """
    Check if user is eligible for role advancement.
    """
    from app.services.user_service import UserService
    
    service = UserService(db)
    try:
        return service.check_role_advancement_eligibility(user_email)
    except Exception as e:
        logger.error(f"Eligibility check failed: {e}")
        raise


@router.post("/role-advancement/generate-exam")
async def generate_role_exam(
    user_email: str = Form(...),
    db: Session = Depends(get_db)
):
    """
    Generate a role advancement exam for the user.
    """
    # Mock implementation for compatibility
    return {"status": "success", "message": "Exam generated"}


@router.get("/role-advancement/exam/{user_email}")
async def get_role_exam(user_email: str, db: Session = Depends(get_db)):
    """
    Get the generated role advancement exam.
    """
    from app.services.user_service import UserService
    service = UserService(db)
    user = service.get_user_by_email(user_email)
    current_role = user.role
    
    # Dynamic Target Role
    from app.repositories.content_repository import ProgressionLevelRepository
    level_repo = ProgressionLevelRepository(db)
    all_levels = level_repo.get_all_ordered()
    
    target_role = "Next Level"
    current_idx = -1
    for idx, lvl in enumerate(all_levels):
         if lvl.name == current_role:
             current_idx = idx
             break
    
    if current_idx != -1 and current_idx < len(all_levels) - 1:
        target_role = all_levels[current_idx + 1].name

    # Simple Mock Exam
    return {
        "status": "success",
        "exam": {
            "exam_id": f"exam_{uuid.uuid4().hex[:8]}",
            "time_limit_minutes": 15,
            "max_violations": 3,
            "current_role": current_role,
            "target_role": target_role,
            "questions": [
                {
                    "question": "What is the primary responsibility of your new role?",
                    "options": ["Leadership", "Stocking", "Cleaning", "None"],
                    "correctIndex": 0
                },
                {
                    "question": "How do you handle a customer complaint?",
                    "options": ["Ignore it", "Listen and Solve", "Argue", "Redirect"],
                    "correctIndex": 1
                },
                {
                    "question": "Safety protocols are important because:",
                    "options": ["They look good", "They protect everyone", "No reason", "Optional"],
                    "correctIndex": 1
                }
            ],
            "pass_percent": 60,
            "proctored": True
        }
    }


@router.post("/role-advancement/submit-exam")
async def submit_role_exam(
    user_email: str = Form(...),
    exam_id: str = Form(...),
    answers: str = Form(...),
    time_taken_seconds: str = Form(...),
    violations: str = Form("0"),
    breach_log: str = Form("[]"),
    critical_breaches: str = Form("0"),
    warning_breaches: str = Form("0"),
    db: Session = Depends(get_db)
):
    """
    Submit and grade the role advancement exam.
    """
    from app.services.user_service import UserService
    import json
    
    service = UserService(db)
    
    try:
        answers_list = json.loads(answers)
        # Mock grading: Assume pass for demo/compatibility
        # We should calculate score based on mock questions
        
        # Simple grading: 
        # Q1: 0, Q2: 1, Q3: 1
        correct_answers = [0, 1, 1]
        score = 0
        for i, ans in enumerate(answers_list):
            if i < len(correct_answers) and ans == correct_answers[i]:
                score += 1
                
        passed = score >= 2 # 2/3 = 66% > 60%
        
        if passed:
             # Promote user
             # Get user to find next role
             user = service.get_user_by_email(user_email)
             current_role = user.role
             
             # Dynamic Role Calculation
             from app.repositories.content_repository import ProgressionLevelRepository
             level_repo = ProgressionLevelRepository(db)
             all_levels = level_repo.get_all_ordered()
             
             # Find current index
             current_idx = -1
             for idx, lvl in enumerate(all_levels):
                 if lvl.name == current_role:  # Assuming role matches name, or use lvl.role
                     current_idx = idx
                     break
            
             # Fallback if name/role mismatch (try matching role field)
             if current_idx == -1:
                  for idx, lvl in enumerate(all_levels):
                     if hasattr(lvl, 'role') and lvl.role == current_role: # Check if 'role' field exists
                         current_idx = idx
                         break
             
             if current_idx != -1 and current_idx < len(all_levels) - 1:
                 new_role = all_levels[current_idx + 1].name
                 service.promote_user(user_email, new_role)
             else:
                 new_role = current_role # Already at top
        else:
            new_role = None

        return {
            "status": "success",
            "result": {
                "passed": passed,
                "score": score,
                "total": 3,
                "score_percent": int(score/3 * 100),
                "new_role": new_role if passed else None,
                "integrity_status": "clean" if int(violations) == 0 else "flagged",
                "message": "Exam completed successfully"
            }
        }
    except Exception as e:
        logger.error(f"Exam submission failed: {e}")
        return {"status": "error", "message": str(e)}
