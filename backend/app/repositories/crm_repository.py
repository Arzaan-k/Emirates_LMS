"""
CRM Repository
Data access layer for CRM ticket and task operations
"""

from typing import List, Optional
from datetime import datetime
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.repositories.base import BaseRepository
from app.models.crm import CRMTicket, CRMTaskAssignment


class CRMTicketRepository(BaseRepository[CRMTicket]):
    """Repository for CRMTicket operations."""

    def __init__(self, db: Session):
        super().__init__(db, CRMTicket)

    def get_by_status(self, status: str) -> List[CRMTicket]:
        """Get tickets by status."""
        return self.db.query(CRMTicket).filter(
            CRMTicket.status == status
        ).order_by(CRMTicket.created_at.desc()).all()

    def get_by_type(self, ticket_type: str) -> List[CRMTicket]:
        """Get tickets by type."""
        return self.db.query(CRMTicket).filter(
            CRMTicket.type == ticket_type
        ).order_by(CRMTicket.created_at.desc()).all()

    def get_by_assigned_user(self, user_email: str) -> List[CRMTicket]:
        """Get tickets assigned to a user."""
        return self.db.query(CRMTicket).filter(
            CRMTicket.assigned_to == user_email
        ).order_by(CRMTicket.created_at.desc()).all()

    def get_unassigned(self) -> List[CRMTicket]:
        """Get unassigned tickets."""
        return self.db.query(CRMTicket).filter(
            CRMTicket.assigned_to == None
        ).order_by(CRMTicket.created_at.desc()).all()

    def get_by_priority(self, priority: str) -> List[CRMTicket]:
        """Get tickets by priority."""
        return self.db.query(CRMTicket).filter(
            CRMTicket.priority == priority
        ).order_by(CRMTicket.created_at.desc()).all()

    def get_with_filters(
        self,
        status: Optional[str] = None,
        ticket_type: Optional[str] = None,
        priority: Optional[str] = None,
        assigned_to: Optional[str] = None,
        skip: int = 0,
        limit: int = 100
    ) -> List[CRMTicket]:
        """Get tickets with multiple filters."""
        query = self.db.query(CRMTicket)

        if status:
            query = query.filter(CRMTicket.status == status)
        if ticket_type:
            query = query.filter(CRMTicket.type == ticket_type)
        if priority:
            query = query.filter(CRMTicket.priority == priority)
        if assigned_to:
            query = query.filter(CRMTicket.assigned_to == assigned_to)

        return query.order_by(CRMTicket.created_at.desc()).offset(skip).limit(limit).all()

    def get_status_counts(self) -> dict:
        """Get count of tickets by status."""
        results = self.db.query(
            CRMTicket.status,
            func.count(CRMTicket.id)
        ).group_by(CRMTicket.status).all()
        return {status: count for status, count in results}

    def assign_ticket(
        self,
        ticket_id: str,
        user_email: str,
        user_name: str
    ) -> Optional[CRMTicket]:
        """Assign ticket to a user."""
        ticket = self.get_by_id(ticket_id)
        if ticket:
            ticket.assigned_to = user_email
            ticket.assigned_name = user_name
            ticket.status = "in_progress"
            ticket.updated_at = datetime.utcnow()
            self.db.commit()
            self.db.refresh(ticket)
        return ticket

    def resolve_ticket(
        self,
        ticket_id: str,
        resolution: str
    ) -> Optional[CRMTicket]:
        """Resolve a ticket."""
        ticket = self.get_by_id(ticket_id)
        if ticket:
            ticket.status = "resolved"
            ticket.resolution = resolution
            ticket.resolved_at = datetime.utcnow()
            ticket.updated_at = datetime.utcnow()
            self.db.commit()
            self.db.refresh(ticket)
        return ticket


class CRMTaskAssignmentRepository(BaseRepository[CRMTaskAssignment]):
    """Repository for CRMTaskAssignment operations."""

    def __init__(self, db: Session):
        super().__init__(db, CRMTaskAssignment)

    def get_by_ticket(self, ticket_id: str) -> List[CRMTaskAssignment]:
        """Get all task assignments for a ticket."""
        return self.db.query(CRMTaskAssignment).filter(
            CRMTaskAssignment.ticket_id == ticket_id
        ).all()

    def get_by_user(self, user_email: str) -> List[CRMTaskAssignment]:
        """Get all task assignments for a user."""
        return self.db.query(CRMTaskAssignment).filter(
            CRMTaskAssignment.user_email == user_email
        ).order_by(CRMTaskAssignment.assigned_at.desc()).all()

    def get_by_status(self, status: str) -> List[CRMTaskAssignment]:
        """Get task assignments by status."""
        return self.db.query(CRMTaskAssignment).filter(
            CRMTaskAssignment.status == status
        ).all()

    def get_pending_for_user(self, user_email: str) -> List[CRMTaskAssignment]:
        """Get pending task assignments for a user."""
        return self.db.query(CRMTaskAssignment).filter(
            CRMTaskAssignment.user_email == user_email,
            CRMTaskAssignment.status.in_(["assigned", "in_progress"])
        ).order_by(CRMTaskAssignment.assigned_at.desc()).all()

    def complete_task(
        self,
        task_id: str,
        resolution: str,
        xp_earned: int = 0
    ) -> Optional[CRMTaskAssignment]:
        """Complete a task assignment."""
        task = self.get_by_id(task_id)
        if task:
            task.status = "completed"
            task.resolution = resolution
            task.completed_at = datetime.utcnow()
            task.xp_earned = xp_earned
            self.db.commit()
            self.db.refresh(task)
        return task

    def get_user_completed_count(self, user_email: str) -> int:
        """Get count of completed tasks for a user."""
        return self.db.query(func.count(CRMTaskAssignment.id)).filter(
            CRMTaskAssignment.user_email == user_email,
            CRMTaskAssignment.status == "completed"
        ).scalar() or 0

    def get_user_total_xp(self, user_email: str) -> int:
        """Get total XP earned by user from tasks."""
        result = self.db.query(func.sum(CRMTaskAssignment.xp_earned)).filter(
            CRMTaskAssignment.user_email == user_email,
            CRMTaskAssignment.status == "completed"
        ).scalar()
        return int(result) if result else 0


class CRMRepository:
    """Combined CRM repository for tickets and tasks."""

    def __init__(self, db: Session):
        self.db = db
        self.ticket_repo = CRMTicketRepository(db)
        self.task_repo = CRMTaskAssignmentRepository(db)

    def get_all_tickets(self) -> List[CRMTicket]:
        """Get all tickets."""
        return self.ticket_repo.get_all()

    def get_available_tickets(self, category_id: Optional[str] = None) -> List[CRMTicket]:
        """Get unassigned tickets optionally filtered by category."""
        tickets = self.ticket_repo.get_unassigned()
        if category_id:
            tickets = [t for t in tickets if t.category_id == category_id]
        return tickets

    def get_ticket_by_id(self, ticket_id: str) -> Optional[CRMTicket]:
        """Get ticket by ID."""
        return self.ticket_repo.get_by_id(ticket_id)

    def create_ticket(self, ticket_data: dict) -> CRMTicket:
        """Create a new ticket."""
        return self.ticket_repo.create(ticket_data)

    def delete_ticket(self, ticket_id: str) -> bool:
        """Delete a ticket."""
        return self.ticket_repo.delete(ticket_id)

    def assign_ticket(self, ticket_id: str, user_email: str, user_name: str) -> CRMTaskAssignment:
        """Assign ticket to a user and create task assignment."""
        # Update ticket
        self.ticket_repo.assign_ticket(ticket_id, user_email, user_name)
        
        # Create task assignment
        task_data = {
            "ticket_id": ticket_id,
            "user_email": user_email,
            "user_name": user_name,
            "status": "assigned",
        }
        return self.task_repo.create(task_data)

    def get_user_tasks(self, user_email: str) -> List[CRMTaskAssignment]:
        """Get all tasks for a user."""
        return self.task_repo.get_by_user(user_email)

    def complete_task(self, task_id: str, resolution: str) -> CRMTaskAssignment:
        """Complete a task."""
        return self.task_repo.complete_task(task_id, resolution, xp_earned=50)

