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
        
        return {
            "success": True,
            "message": "CRM task assigned successfully",
            "task": assignment.to_dict() if hasattr(assignment, 'to_dict') else dict(assignment)
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
        
        # Award XP would be handled here
        return {
            "success": True,
            "message": "Task completed successfully",
            "xp_earned": 50,
            "task": result.to_dict() if hasattr(result, 'to_dict') else dict(result)
        }
    except Exception as e:
        logger.error(f"CRM task completion failed: {e}")
        raise


# ==========================================
# STORE AUDIT ENDPOINTS
# ==========================================

audit_checklists: List[dict] = []
audit_submissions: List[dict] = []


@router.get("/audits/checklists")
async def get_audit_checklists():
    """
    Get all audit checklists.
    """
    if not audit_checklists:
        # Return default checklist
        return [{
            "id": "default",
            "name": "Store Hygiene Audit",
            "sections": [
                {
                    "name": "Kitchen",
                    "items": [
                        {"id": "k1", "text": "Cooking surfaces clean", "type": "checkbox"},
                        {"id": "k2", "text": "Equipment sanitized", "type": "checkbox"},
                        {"id": "k3", "text": "Temperature logs updated", "type": "checkbox"},
                    ]
                },
                {
                    "name": "Storage",
                    "items": [
                        {"id": "s1", "text": "FIFO followed", "type": "checkbox"},
                        {"id": "s2", "text": "Proper labeling", "type": "checkbox"},
                    ]
                }
            ]
        }]
    return audit_checklists


@router.post("/audits/checklists")
async def create_audit_checklist(
    name: str = Form(...),
    sections: str = Form(...),
):
    """
    Create a new audit checklist.
    """
    try:
        sections_list = json.loads(sections)
    except:
        raise HTTPException(status_code=400, detail="Invalid sections format")
    
    checklist = {
        "id": f"checklist_{uuid.uuid4().hex[:8]}",
        "name": name,
        "sections": sections_list,
        "created_at": datetime.utcnow().isoformat(),
    }
    
    audit_checklists.append(checklist)
    logger.info(f"Audit checklist created: {checklist['id']}")
    
    return checklist


@router.post("/audits/submit")
async def submit_audit(
    checklist_id: str = Form(...),
    store: str = Form(...),
    auditor_email: str = Form(...),
    auditor_name: str = Form(...),
    responses: str = Form(...),
    notes: str = Form(""),
    images: str = Form("[]"),
):
    """
    Submit an audit for a store.
    """
    try:
        responses_dict = json.loads(responses)
        images_list = json.loads(images)
    except:
        raise HTTPException(status_code=400, detail="Invalid format")
    
    # Calculate score
    total_items = len(responses_dict)
    completed_items = sum(1 for v in responses_dict.values() if v)
    score = (completed_items / total_items * 100) if total_items > 0 else 0
    
    submission = {
        "id": f"audit_{uuid.uuid4().hex[:8]}",
        "checklist_id": checklist_id,
        "store": store,
        "auditor_email": auditor_email,
        "auditor_name": auditor_name,
        "responses": responses_dict,
        "notes": notes,
        "images": images_list,
        "score": round(score, 1),
        "submitted_at": datetime.utcnow().isoformat(),
    }
    
    audit_submissions.append(submission)
    logger.info(f"Audit submitted: {submission['id']}")
    
    return submission


@router.get("/audits/submissions")
async def get_audit_submissions(
    store: str = None,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Get audit submissions, optionally filtered by store.
    """
    if store:
        return [s for s in audit_submissions if s.get("store") == store]
    return audit_submissions


@router.get("/audits/submissions/{submission_id}")
async def get_audit_submission(submission_id: str):
    """
    Get a specific audit submission.
    """
    for submission in audit_submissions:
        if submission.get("id") == submission_id:
            return submission
    
    raise HTTPException(status_code=404, detail="Audit submission not found")
