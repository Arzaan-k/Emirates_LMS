"""
Simulation Repository
Data access layer for simulation operations
"""

from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.repositories.base import BaseRepository
from app.models.simulation import Simulation, SimulationProgress, SimulationAnalyticsSnapshot


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
        """
        Delete a simulation and dependent analytics/progress rows first.
        Prevents FK violations when attempts exist.
        """
        simulation = self.get_by_id(simulation_id)
        if not simulation:
            return False

        # Manual cascade to satisfy foreign-key constraints in production DB.
        self.db.query(SimulationProgress).filter(
            SimulationProgress.simulation_id == simulation_id
        ).delete(synchronize_session=False)

        self.db.query(SimulationAnalyticsSnapshot).filter(
            SimulationAnalyticsSnapshot.simulation_id == simulation_id
        ).delete(synchronize_session=False)

        self.db.delete(simulation)
        self.db.commit()
        return True


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
        time_spent_seconds: int = 0,
        completed_at: Optional[datetime] = None
    ) -> SimulationProgress:
        """Mark a simulation as completed."""
        progress = self.get_by_user_and_simulation(user_email, simulation_id)
        final_completed_at = completed_at or datetime.utcnow()
        safe_duration = max(0, int(time_spent_seconds or 0))

        if progress:
            progress.completed = True
            progress.score = score
            progress.passed = passed
            progress.completed_at = final_completed_at
            progress.time_spent_seconds = safe_duration
            if not progress.started_at and safe_duration > 0:
                progress.started_at = final_completed_at - timedelta(seconds=safe_duration)
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
                "completed_at": final_completed_at,
                "started_at": final_completed_at - timedelta(seconds=safe_duration) if safe_duration > 0 else final_completed_at,
                "choices_made": choices_made or [],
                "time_spent_seconds": safe_duration,
            })


class SimulationAnalyticsRepository:
    """
    Repository for SimulationAnalyticsSnapshot — pre-computed per-simulation aggregates.
    Call upsert_snapshot() after every completion to keep the snapshot current.
    """

    def __init__(self, db: Session):
        self.db = db

    def get_snapshot(self, simulation_id: str) -> Optional[SimulationAnalyticsSnapshot]:
        """Return the latest snapshot for a simulation, or None if none exists yet."""
        return self.db.query(SimulationAnalyticsSnapshot).filter(
            SimulationAnalyticsSnapshot.simulation_id == simulation_id
        ).first()

    def upsert_snapshot(
        self,
        simulation_id: str,
        progress_list: List[SimulationProgress]
    ) -> SimulationAnalyticsSnapshot:
        """
        Recompute and persist aggregate analytics for a simulation.
        Called after every completion — safe to call repeatedly.
        """
        total_attempts = len(progress_list)
        completed_list = [p for p in progress_list if p.completed]
        total_completed = len(completed_list)
        total_passed = sum(1 for p in completed_list if p.passed)
        total_failed = total_completed - total_passed

        scores = [p.score for p in completed_list if p.score is not None]
        avg_score = round(sum(scores) / len(scores), 1) if scores else 0.0
        highest_score = round(max(scores), 1) if scores else 0.0
        lowest_score = round(min(scores), 1) if scores else 0.0
        pass_rate = round((total_passed / total_completed) * 100, 1) if total_completed > 0 else 0.0

        times = [p.time_spent_seconds for p in completed_list if p.time_spent_seconds]
        avg_time = round(sum(times) / len(times), 1) if times else 0.0

        attempt_dates = [p.started_at for p in progress_list if p.started_at]
        last_attempt_at = max(attempt_dates) if attempt_dates else None

        snapshot = self.get_snapshot(simulation_id)
        if snapshot:
            snapshot.total_attempts = total_attempts
            snapshot.total_completed = total_completed
            snapshot.total_passed = total_passed
            snapshot.total_failed = total_failed
            snapshot.avg_score = avg_score
            snapshot.highest_score = highest_score
            snapshot.lowest_score = lowest_score
            snapshot.pass_rate = pass_rate
            snapshot.avg_time_seconds = avg_time
            snapshot.last_attempt_at = last_attempt_at
            snapshot.last_updated = datetime.utcnow()
        else:
            snapshot = SimulationAnalyticsSnapshot(
                simulation_id=simulation_id,
                total_attempts=total_attempts,
                total_completed=total_completed,
                total_passed=total_passed,
                total_failed=total_failed,
                avg_score=avg_score,
                highest_score=highest_score,
                lowest_score=lowest_score,
                pass_rate=pass_rate,
                avg_time_seconds=avg_time,
                last_attempt_at=last_attempt_at,
                last_updated=datetime.utcnow(),
            )
            self.db.add(snapshot)

        self.db.commit()
        self.db.refresh(snapshot)
        return snapshot
