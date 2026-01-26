"""
Simulation Repository
Data access layer for simulation operations
"""

from typing import List, Optional, Dict, Any
from datetime import datetime
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.repositories.base import BaseRepository
from app.models.simulation import Simulation, SimulationProgress


class SimulationRepository(BaseRepository[Simulation]):
    """Repository for Simulation operations."""

    def __init__(self, db: Session):
        super().__init__(db, Simulation)

    def get_active_simulations(self) -> List[Simulation]:
        """Get all active simulations."""
        return self.db.query(Simulation).filter(
            Simulation.is_active == True
        ).order_by(Simulation.created_at.desc()).all()

    def get_by_category(self, category: str) -> List[Simulation]:
        """Get simulations by category."""
        return self.db.query(Simulation).filter(
            Simulation.category == category,
            Simulation.is_active == True
        ).all()

    def get_all_simulations(self) -> List[Simulation]:
        """Get all simulations."""
        return self.db.query(Simulation).order_by(Simulation.created_at.desc()).all()

    def create_simulation(self, simulation_data: Dict[str, Any]) -> Simulation:
        """Create a new simulation."""
        return self.create(simulation_data)

    def update_simulation(self, simulation_id: str, updates: Dict[str, Any]) -> Optional[Simulation]:
        """Update a simulation."""
        simulation = self.get_by_id(simulation_id)
        if simulation:
            for key, value in updates.items():
                if hasattr(simulation, key) and value is not None:
                    setattr(simulation, key, value)
            simulation.updated_at = datetime.utcnow()
            self.db.commit()
            self.db.refresh(simulation)
        return simulation

    def delete_simulation(self, simulation_id: str) -> bool:
        """Delete a simulation."""
        return self.delete(simulation_id)


class SimulationProgressRepository(BaseRepository[SimulationProgress]):
    """Repository for SimulationProgress operations."""

    def __init__(self, db: Session):
        super().__init__(db, SimulationProgress)

    def get_by_user(self, user_email: str) -> List[SimulationProgress]:
        """Get all progress records for a user."""
        return self.db.query(SimulationProgress).filter(
            SimulationProgress.user_email == user_email
        ).order_by(SimulationProgress.started_at.desc()).all()

    def get_by_simulation(self, simulation_id: str) -> List[SimulationProgress]:
        """Get all progress records for a simulation."""
        return self.db.query(SimulationProgress).filter(
            SimulationProgress.simulation_id == simulation_id
        ).order_by(SimulationProgress.started_at.desc()).all()

    def get_by_user_and_simulation(
        self,
        user_email: str,
        simulation_id: str
    ) -> Optional[SimulationProgress]:
        """Get progress for a specific user and simulation."""
        return self.db.query(SimulationProgress).filter(
            SimulationProgress.user_email == user_email,
            SimulationProgress.simulation_id == simulation_id
        ).order_by(SimulationProgress.started_at.desc()).first()

    def get_completed_by_user(self, user_email: str) -> List[SimulationProgress]:
        """Get completed simulations for a user."""
        return self.db.query(SimulationProgress).filter(
            SimulationProgress.user_email == user_email,
            SimulationProgress.completed == True
        ).all()

    def create_progress(self, progress_data: Dict[str, Any]) -> SimulationProgress:
        """Create a new progress record."""
        return self.create(progress_data)

    def update_progress(
        self,
        progress_id: int,
        updates: Dict[str, Any]
    ) -> Optional[SimulationProgress]:
        """Update a progress record."""
        progress = self.get_by_id(progress_id)
        if progress:
            for key, value in updates.items():
                if hasattr(progress, key) and value is not None:
                    setattr(progress, key, value)
            progress.last_accessed = datetime.utcnow()
            self.db.commit()
            self.db.refresh(progress)
        return progress

    def complete_simulation(
        self,
        user_email: str,
        simulation_id: str,
        score: float,
        passed: bool,
        choices_made: List[Dict] = None,
        time_spent_seconds: int = 0
    ) -> SimulationProgress:
        """Mark a simulation as completed."""
        progress = self.get_by_user_and_simulation(user_email, simulation_id)

        if progress:
            progress.completed = True
            progress.score = score
            progress.passed = passed
            progress.completed_at = datetime.utcnow()
            progress.time_spent_seconds = time_spent_seconds
            if choices_made:
                progress.choices_made = choices_made
            self.db.commit()
            self.db.refresh(progress)
            return progress
        else:
            # Create new completed progress
            return self.create({
                "user_email": user_email,
                "simulation_id": simulation_id,
                "completed": True,
                "score": score,
                "passed": passed,
                "completed_at": datetime.utcnow(),
                "choices_made": choices_made or [],
                "time_spent_seconds": time_spent_seconds,
            })
