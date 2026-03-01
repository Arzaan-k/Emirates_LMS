"""
CRM Endpoints
CRM tickets, task assignments, categories
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
from app.core.websocket import manager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/crm", tags=["CRM"])


# CRM Categories
CRM_CATEGORIES = [
    {"id": "1", "name": "Product Knowledge", "description": "Menu, ingredients, preparation"},
    {"id": "2", "name": "Customer Service", "description": "Customer interactions, service quality"},
    {"id": "3", "name": "Safety & Hygiene", "description": "Store safety, food safety, cleaning"},
    {"id": "4", "name": "Skills Development", "description": "Training, certifications, growth"},
    {"id": "5", "name": "Operations", "description": "Store operations and procedures"},
]

# Ticket types by category
CATEGORY_TICKET_TYPES = {
    "1": ["Query", "Request"],
    "2": ["Complaint", "Feedback"],
    "3": ["Complaint", "Query"],
    "4": ["Query", "Request"],
    "5": ["Query", "Request"],
}


# ==========================================
# CRM CATEGORY ENDPOINTS
# ==========================================

@router.get("/categories")
async def get_crm_categories():
    """
    Get all CRM categories.
    """
    return CRM_CATEGORIES


@router.get("/categories/{category_id}/types")
async def get_category_ticket_types(category_id: str):
    """
    Get ticket types for a category.
    """
    types = CATEGORY_TICKET_TYPES.get(category_id, ["Query", "Request"])
    return {"category_id": category_id, "types": types}


# ==========================================
# CRM TICKET ENDPOINTS  
# ==========================================

@router.get("/tickets")
async def get_crm_tickets(db: Session = Depends(get_db)):
    """
    Get all CRM tickets (for admin/manager).
    """
    from app.repositories.crm_repository import CRMRepository
    
    repo = CRMRepository(db)
    
    try:
        tickets = repo.get_all_tickets()
        result = []
        for ticket in tickets:
            ticket_dict = ticket.to_dict() if hasattr(ticket, 'to_dict') else dict(ticket)
            result.append(ticket_dict)
        return result
    except Exception as e:
        logger.error(f"CRM tickets fetch failed: {e}")
        return []


@router.get("/tickets/available")
async def get_available_tickets(
    category_id: str = None,
    db: Session = Depends(get_db)
):
    """
    Get unassigned tickets, optionally filtered by category.
    """
    from app.repositories.crm_repository import CRMRepository
    
    repo = CRMRepository(db)
    
    try:
        tickets = repo.get_available_tickets(category_id)
        result = []
        for ticket in tickets:
            ticket_dict = ticket.to_dict() if hasattr(ticket, 'to_dict') else dict(ticket)
            result.append(ticket_dict)
        return result
    except Exception as e:
        logger.error(f"Available tickets fetch failed: {e}")
        return []


@router.get("/tickets/{ticket_id}")
async def get_ticket_by_id(ticket_id: str, db: Session = Depends(get_db)):
    """
    Get a specific ticket by ID.
    """
    from app.repositories.crm_repository import CRMRepository
    
    repo = CRMRepository(db)
    
    try:
        ticket = repo.get_ticket_by_id(ticket_id)
        if not ticket:
            raise HTTPException(status_code=404, detail="Ticket not found")
        return ticket.to_dict() if hasattr(ticket, 'to_dict') else dict(ticket)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ticket fetch failed: {e}")
        raise HTTPException(status_code=404, detail="Ticket not found")


@router.post("/tickets")
async def create_crm_ticket(
    type: str = Form(...),
    category_id: str = Form(...),
    customer_name: str = Form(...),
    customer_email: str = Form(""),
    customer_phone: str = Form(""),
    subject: str = Form(...),
    description: str = Form(...),
    priority: str = Form("medium"),
    db: Session = Depends(get_db)
):
    """
    Manager creates a new CRM ticket.
    """
    from app.repositories.crm_repository import CRMRepository
    
    repo = CRMRepository(db)
    
    ticket_data = {
        "id": f"crm_{uuid.uuid4().hex[:8]}",
        "type": type,
        "category_id": category_id,
        "customer_name": customer_name,
        "customer_email": customer_email,
        "customer_phone": customer_phone,
        "subject": subject,
        "description": description,
        "priority": priority,
        "status": "open",
        "assigned_to": None,
    }
    
    try:
        ticket = repo.create_ticket(ticket_data)
        logger.info(f"CRM ticket created: {ticket_data['id']}")
        return ticket.to_dict() if hasattr(ticket, 'to_dict') else ticket_data
    except Exception as e:
        logger.error(f"CRM ticket creation failed: {e}")
        raise


@router.delete("/tickets/{ticket_id}")
async def delete_crm_ticket(
    ticket_id: str,
    db: Session = Depends(get_db)
):
    """
    Delete a CRM ticket (admin only).
    """
    from app.repositories.crm_repository import CRMRepository
    
    repo = CRMRepository(db)
    
    try:
        repo.delete_ticket(ticket_id)
        logger.info(f"CRM ticket deleted: {ticket_id}")
        return {"message": f"Ticket {ticket_id} deleted"}
    except Exception as e:
        logger.error(f"CRM ticket deletion failed: {e}")
        raise


# ==========================================
# CRM TASK ASSIGNMENT ENDPOINTS
# ==========================================

@router.post("/tasks/assign")
@router.post("/assign-task")  # Backward compatibility alias
async def assign_crm_task(
    user_email: str = Form(...),
    user_name: str = Form(...),
    category_id: str = Form(...),
    db: Session = Depends(get_db)
):
    """
    Assign an available CRM ticket to user after course completion.
    Smart matching based on course type.
    """
    from app.repositories.crm_repository import CRMRepository
    
    repo = CRMRepository(db)
    
    # Determine ticket types based on category
    if category_id in ["3", "4"]:  # Safety & Hygiene or Customer Service
        preferred_types = ["Complaint"]
    else:
        preferred_types = ["Query", "Request"]
    
    try:
        # Find available ticket
        available_tickets = repo.get_available_tickets(category_id)
        
        selected_ticket = None
        for ticket in available_tickets:
            ticket_type = ticket.type if hasattr(ticket, 'type') else ticket.get('type')
            if ticket_type in preferred_types:
                selected_ticket = ticket
                break
        
        if not selected_ticket and available_tickets:
            selected_ticket = available_tickets[0]
        
        if not selected_ticket:
            return {
                "success": False,
                "message": "No matching CRM tickets available at this time"
            }
        
        # Assign ticket
        ticket_id = selected_ticket.id if hasattr(selected_ticket, 'id') else selected_ticket.get('id')
        assignment = repo.assign_ticket(ticket_id, user_email, user_name)

        logger.info(f"CRM task assigned: {ticket_id} -> {user_email}")

        assignment_dict = assignment.to_dict() if hasattr(assignment, 'to_dict') else dict(assignment)
        ticket_dict = selected_ticket.to_dict() if hasattr(selected_ticket, 'to_dict') else dict(selected_ticket)

        # Broadcast CRM task assignment notification
        await manager.broadcast_notification(
            notification_type="CRM_TASK_ASSIGNED",
            data={
                "assignment": assignment_dict,
                "ticket": ticket_dict,
                "user_email": user_email,
                "user_name": user_name
            },
            title="CRM Task Assigned",
            message=f"New CRM task assigned to {user_name}"
        )

        return {
            "success": True,
            "message": "CRM task assigned successfully",
            "task": assignment_dict
        }
    
    except Exception as e:
        logger.error(f"CRM task assignment failed: {e}")
        return {
            "success": False,
            "message": f"Assignment failed: {str(e)}"
        }


@router.get("/tasks/user/{user_email}")
async def get_my_crm_tasks(user_email: str, db: Session = Depends(get_db)):
    """
    Get all CRM tasks assigned to a user.
    """
    from app.repositories.crm_repository import CRMRepository
    
    repo = CRMRepository(db)
    
    try:
        tasks = repo.get_user_tasks(user_email)
        result = []
        for task in tasks:
            task_dict = task.to_dict() if hasattr(task, 'to_dict') else dict(task)
            result.append(task_dict)
        return result
    except Exception as e:
        logger.error(f"User CRM tasks fetch failed: {e}")
        return []


# Alias for /tasks/user/{email} - frontend calls /my-tasks?user_email=
@router.get("/my-tasks")
async def get_my_crm_tasks_alias(user_email: str, db: Session = Depends(get_db)):
    """
    Alias for /tasks/user/{user_email} - backward compatibility with frontend.
    """
    return await get_my_crm_tasks(user_email, db)


@router.post("/tasks/{task_id}/complete")
async def complete_crm_task(
    task_id: str,
    resolution: str = Form(...),
    db: Session = Depends(get_db)
):
    """
    Complete a CRM task with resolution - awards 50 XP.
    """
    from app.repositories.crm_repository import CRMRepository
    
    repo = CRMRepository(db)
    
    try:
        result = repo.complete_task(task_id, resolution)
        logger.info(f"CRM task completed: {task_id}")

        result_dict = result.to_dict() if hasattr(result, 'to_dict') else dict(result)
        user_email = result_dict.get("assigned_to", "")

        # Broadcast CRM task completion notification
        await manager.broadcast_notification(
            notification_type="CRM_TASK_COMPLETED",
            data={
                "task_id": task_id,
                "user_email": user_email,
                "xp_earned": 50,
                "resolution": resolution
            }
        )

        # Award XP would be handled here
        return {
            "success": True,
            "message": "Task completed successfully",
            "xp_earned": 50,
            "task": result_dict
        }
    except Exception as e:
        logger.error(f"CRM task completion failed: {e}")
        raise


# ==========================================
# STORE AUDIT ENDPOINTS
# ==========================================

@router.get("/audits/templates")
async def get_audit_templates(db: Session = Depends(get_db)):
    """
    Get all audit templates (definitions).
    """
    from app.models.crm import AuditTemplate
    templates = db.query(AuditTemplate).all()
    # Map to legacy format if needed, but better to use new format
    return [t.to_dict() for t in templates]


@router.post("/audits/templates")
async def create_audit_template(
    title: str = Form(...),
    description: str = Form(""),
    checklist_items: str = Form(...), # JSON string
    icon: str = Form("clipboard"),
    color: str = Form("#10B981"),
    current_user: Dict[str, Any] = Depends(require_admin), # Admin only
    db: Session = Depends(get_db)
):
    """
    Create a new audit template.
    """
    from app.models.crm import AuditTemplate
    
    try:
        items = json.loads(checklist_items)
    except:
        raise HTTPException(status_code=400, detail="Invalid checklist_items JSON")

    template = AuditTemplate(
        id=str(uuid.uuid4()),
        title=title,
        description=description,
        icon=icon,
        color=color,
        checklist_items=items,
        created_at=datetime.utcnow(),
    )
    # created_by not in model yet, assumed handling user context elsewhere or add it to model if needed
    
    db.add(template)
    db.commit()
    logger.info(f"Audit template created: {template.id} by {current_user.get('email')}")
    
    return template.to_dict()


@router.post("/audits/assign")
async def assign_audit(
    template_id: str = Form(...),
    assigned_to: str = Form(None), # Single User email (optional if target_users provided)
    target_users: str = Form(None), # JSON string for bulk assignment
    store_id: str = Form(""),
    due_date: str = Form(None), # ISO format
    current_user: Dict[str, Any] = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Assign an audit to a user or a set of users.
    """
    from app.models.crm import AuditAssignment, AuditTemplate
    from app.models.user import User
    from sqlalchemy import or_

    # Validate template
    template = db.query(AuditTemplate).filter(AuditTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Audit template not found")

    # Determine target users
    users_to_assign = []
    
    if target_users:
        try:
            assignment_data = json.loads(target_users)
            
            # Start with all users query
            query = db.query(User)
            
            # Collect filter conditions
            conditions = []
            
            # Specific emails - if provided, these are added specifically
            specific_emails = assignment_data.get('emails', [])
            if specific_emails:
                # If only emails are provided and no groups, just use these
                has_groups = any(assignment_data.get(k) for k in ['roles', 'stores', 'categories', 'regions', 'cities', 'states', 'designations', 'departments'])
                if not has_groups:
                    users_to_assign = db.query(User).filter(User.email.in_(specific_emails)).all()
            
            # Group filters
            # If groups are selected, we find users matching ANY of the groups (OR logic within types? usually AND across types, OR within type)
            # But the UserAssignmentPicker logic usually implies:
            # Users matching (Role A OR Role B) AND (Store X OR Store Y) ...
            
            # Actually, let's follow a simpler approach:
            # 1. Fetch all users suitable for assignment
            # 2. Filter them in python to match the assignment_data logic exactly as Frontend does
            # This is safer to ensure consistency
            
            all_candidates = db.query(User).all()
            
            roles = set(assignment_data.get('roles', []))
            stores = set(assignment_data.get('stores', []))
            categories = set(assignment_data.get('categories', []))
            regions = set(assignment_data.get('regions', []))
            cities = set(assignment_data.get('cities', []))
            states = set(assignment_data.get('states', []))
            designations = set(assignment_data.get('designations', []))
            departments = set(assignment_data.get('departments', []))
            
            # Emails explicitly selected
            selected_emails_set = set(specific_emails)
            
            for user in all_candidates:
                # Check if explicitly selected
                if user.email in selected_emails_set:
                    users_to_assign.append(user)
                    continue
                
                # Check if matches group filters
                # Logic: matches IF defined in filter. If filter empty, ignore it.
                # Must match ALL non-empty filter types.
                
                matches = True
                if roles and user.role not in roles: matches = False
                if stores and user.store not in stores: matches = False
                if categories and user.category not in categories: matches = False
                
                # Optional fields on user model
                u_region = getattr(user, 'region', None)
                if regions and (not u_region or u_region not in regions): matches = False
                
                u_city = getattr(user, 'city', None)
                if cities and (not u_city or u_city not in cities): matches = False
                
                u_state = getattr(user, 'state', None)
                if states and (not u_state or u_state not in states): matches = False
                
                u_desig = getattr(user, 'designation', None)
                if designations and (not u_desig or u_desig not in designations): matches = False

                u_dept = getattr(user, 'department', None)
                if departments and (not u_dept or u_dept not in departments): matches = False
                
                if matches and (roles or stores or categories or regions or cities or states or designations or departments):
                    users_to_assign.append(user)
            
            # Deduplicate just in case
            users_to_assign = list({u.email: u for u in users_to_assign}.values())
            
        except Exception as e:
            logger.error(f"Error parsing target_users: {e}")
            raise HTTPException(status_code=400, detail="Invalid target_users format")

    elif assigned_to:
        # Single user legacy
        user = db.query(User).filter(User.email == assigned_to).first()
        if user:
            users_to_assign.append(user)
    
    if not users_to_assign:
        raise HTTPException(status_code=404, detail="No users found for assignment")

    # Parse due date
    due_dt = None
    if due_date:
        try:
            due_dt = datetime.fromisoformat(due_date.replace("Z", "+00:00"))
        except:
             pass 

    created_assignments = []
    
    for user in users_to_assign:
        # Check if already assigned (optional, but good practice)
        # For now, allow multiple assignments
        
        assignment = AuditAssignment(
            id=str(uuid.uuid4()),
            template_id=template_id,
            assigned_to=user.email,
            store_id=store_id or user.store or "Unassigned",
            due_date=due_dt,
            status="pending",
            assigned_by=current_user.get("email"),
            assigned_at=datetime.utcnow()
        )
        db.add(assignment)
        created_assignments.append(assignment)
    
    db.commit()
    
    return {
        "status": "success",
        "message": f"Assigned to {len(created_assignments)} users",
        "assignments_count": len(created_assignments)
    }


@router.get("/audits/my-assignments")
async def get_my_audit_assignments(
    status: str = "pending",
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get audits assigned to the current user.
    """
    from app.models.crm import AuditAssignment, AuditTemplate
    
    filters = [AuditAssignment.assigned_to == current_user["email"]]
    if status != "all":
        filters.append(AuditAssignment.status == status)
        
    assignments = db.query(AuditAssignment).filter(*filters).all()
    
    results = []
    for a in assignments:
        d = a.to_dict()
        # Ensure template details are included
        if a.template:
             d['template'] = a.template.to_dict()
        results.append(d)
        
    return results


@router.get("/audits/all-assignments")
async def get_all_audit_assignments(
    store_id: str = None,
    status: str = None,
    current_user: Dict[str, Any] = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Get all audit assignments (Admin only).
    """
    from app.models.crm import AuditAssignment, AuditTemplate
    from app.models.user import User
    
    query = db.query(AuditAssignment)
    
    if store_id:
        query = query.filter(AuditAssignment.store_id == store_id)
    if status and status != 'all':
        query = query.filter(AuditAssignment.status == status)
        
    assignments = query.order_by(AuditAssignment.assigned_at.desc()).all()
    
    results = []
    for a in assignments:
        d = a.to_dict()
        # Enrich with template and user info
        if a.template:
             d['template'] = a.template.to_dict()
        
        # Fetch user name manually if not in relation
        user = db.query(User).filter(User.email == a.assigned_to).first()
        if user:
            d['user_name'] = user.name
            d['user_role'] = user.role
            
        results.append(d)
        
    return results


# Legacy checklist endpoint - map to templates for backward compatibility
@router.get("/audits/checklists")
async def get_audit_checklists(db: Session = Depends(get_db)):
    """
    Get all audit checklists/templates.
    """
    from app.models.crm import AuditTemplate
    templates = db.query(AuditTemplate).all()
    
    if not templates:
        # Return default checklist if no templates in DB (bootstrap)
        return [{
            "id": "safety", # Match frontend ID
            "name": "Safety Compliance",
            "checklist_items": ["Fire extinguishers", "Exits marked"]
        }]

    # Convert to format expected by frontend or use standardized format
    # Frontend AuditsScreen expects:
    # filters object? NO. AuditsScreen calls this but uses result as setFilters(data).
    # IF AuditsScreen expects filters, we should return filters here??
    
    # Wait, Step 451: 
    # const response = await fetch(`${API_URL}/api/v1/crm/audits/checklists`);
    # const data = await response.json();
    # setFilters(data);
    # And filters state is { stores: [], employees: [], categories: [] }.
    
    # So this endpoint MUST return { stores: [], employees: [], categories: [] }!!!
    # The previous implementation (Step 466) returned a LIST of checklists!
    # So the current frontend code was receiving a list and setting it to `filters`.
    # This implies `filters.stores` was undefined.
    # So filters were broken.
    
    # I should fix this to return correct filters!
    
    # Get all stores and employees for filtering
    from app.models.user import User
    
    stores = [u.store for u in db.query(User.store).distinct().all() if u.store]
    employees = [{"name": u.name, "email": u.email} for u in db.query(User).all()]
    categories = [t.title for t in templates]
    
    return {
        "stores": stores,
        "employees": employees,
        "categories": categories
    }


@router.post("/audits/submit")
async def submit_audit(
    user_email: str = Form(...),
    user_name: str = Form(...),
    store: str = Form(...),
    category: str = Form(...), # template_id basically
    checklist_items: str = Form(...),
    checked_items: str = Form(...),
    assignment_id: str = Form(None), # Link to assignment if applicable
    audit_status: str = Form("completed"), # 'completed' or 'partial'
    db: Session = Depends(get_db)
):
    """
    Submit an audit for a store.
    """
    from app.repositories.crm_repository import CRMRepository
    from app.models.crm import AuditAssignment
    
    repo = CRMRepository(db)

    try:
        items_list = json.loads(checklist_items)
        checked_dict = json.loads(checked_items)
    except:
        raise HTTPException(status_code=400, detail="Invalid JSON format")

    # Calculate completion rate
    total_items = len(items_list)
    # checked_items keys might be "cat-idx" or just "idx" or "text"?
    # Frontend AuditsScreen uses "category-idx".
    # We count how many entries in checked_items are True.
    checked_count = sum(1 for val in checked_dict.values() if val)
    completion_rate = round((checked_count / total_items) * 100) if total_items > 0 else 0

    submission_data = {
        "id": str(uuid.uuid4()),
        "user_email": user_email,
        "user_name": user_name,
        "store": store,
        "category": category,
        "checklist_items": items_list,
        "checked_items": checked_dict,
        "completion_rate": completion_rate,
        "submitted_at": datetime.utcnow(),
        "status": audit_status if audit_status in ("completed", "partial") else "completed",
        "assignment_id": assignment_id
    }

    try:
        audit = repo.submit_audit(submission_data)
        logger.info(f"Audit submitted: {submission_data['id']} - {completion_rate}%")
        
        # If assignment_id provided, mark assignment as completed
        if assignment_id:
            assign = db.query(AuditAssignment).filter(AuditAssignment.id == assignment_id).first()
            if assign:
                assign.status = "completed"
                assign.completed_at = datetime.utcnow()
                db.commit()
        
        # Convert to dict for response
        submission_dict = audit.to_dict() if hasattr(audit, 'to_dict') else dict(audit)
        return {"status": "success", "submission": submission_dict}
    except Exception as e:
        logger.error(f"Audit submission failed: {e}")
        raise


@router.get("/audits/submissions")
async def get_audit_submissions(
    store: str = None,
    user_email: str = None, # Added filter
    category: str = None, # Added filter
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get audit submissions, filtered by store, user, or category.
    """
    from app.models.crm import AuditSubmission
    
    query = db.query(AuditSubmission)
    
    if store:
        query = query.filter(AuditSubmission.store == store)
    if user_email:
        query = query.filter(AuditSubmission.user_email == user_email)
    if category:
        query = query.filter(AuditSubmission.category == category)
        
    audits = query.order_by(AuditSubmission.submitted_at.desc()).limit(100).all()
    
    result = [a.to_dict() for a in audits]
    
    total_count = len(result)
    avg_completion = sum(a.get('completion_rate', 0) for a in result) / total_count if total_count > 0 else 0
    
    return {
        "audits": result,
        "total_count": total_count,
        "avg_completion_rate": round(avg_completion),
        "category_stats": {} 
    }
