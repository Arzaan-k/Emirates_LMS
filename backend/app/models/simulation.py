"""
Simulation Domain Models
Interactive simulations and scenario-based learning
"""

from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime,
    Text, JSON, Float, ForeignKey, Index
)

from app.models.base import Base


class Simulation(Base):
    """
    First-person simulation/scenario store.
    Interactive branching scenarios for training.
    """
    __tablename__ = "simulations"

    id = Column(String(255), primary_key=True)
    title = Column(String(500), nullable=False)
    description = Column(Text)
    category = Column(String(255))  # customer_service, safety, operations
    difficulty = Column(String(50))  # easy, medium, hard
    duration = Column(String(100))  # Estimated duration
    duration_minutes = Column(Integer)
    thumbnail = Column(String(1000))
    nodes = Column(JSON, default=[])  # Array of simulation nodes/steps
    start_node_id = Column(String(255))  # Entry point
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(String(255))
    is_active = Column(Boolean, default=True)
    total_branches = Column(Integer, default=0)
    optimal_path = Column(JSON, default=[])  # Ideal path through simulation
    max_score = Column(Float, default=100.0)
    passing_score = Column(Float, default=70.0)
    tags = Column(JSON, default=[])
    prerequisites = Column(JSON, default=[])  # Course IDs to complete first

    __table_args__ = (
        Index('idx_simulation_category', 'category'),
        Index('idx_simulation_active', 'is_active'),
        Index('idx_simulation_difficulty', 'difficulty'),
        Index('idx_simulation_created', 'created_at'),
    )

    def __repr__(self):
        return f"<Simulation {self.id}: {self.title}>"

    def to_dict(self):
        """Convert to dictionary for API responses."""
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "category": self.category,
            "difficulty": self.difficulty,
            "duration": self.duration,
            "duration_minutes": self.duration_minutes,
            "thumbnail": self.thumbnail,
            "thumbnailUrl": self.thumbnail,  # Frontend expects camelCase
            "nodes": self.nodes or [],
            "start_node_id": self.start_node_id,
            "is_active": self.is_active,
            "total_branches": self.total_branches,
            "max_score": self.max_score,
            "passing_score": self.passing_score,
            "tags": self.tags or [],
            "prerequisites": self.prerequisites or [],
            "created_by": self.created_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class SimulationProgress(Base):
    """
    User progress through simulations.
    Tracks choices made and current state.
    """
    __tablename__ = "simulation_progress"

    id = Column(Integer, primary_key=True, index=True)
    user_email = Column(String(255), nullable=False, index=True)
    simulation_id = Column(String(255), ForeignKey('simulations.id'), nullable=False)
    current_node_id = Column(String(255))
    completed = Column(Boolean, default=False)
    score = Column(Float, default=0.0)
    max_possible_score = Column(Float, default=100.0)
    time_spent_seconds = Column(Integer, default=0)
    choices_made = Column(JSON, default=[])  # Track user's choices
    path_taken = Column(JSON, default=[])  # Node IDs visited
    completed_at = Column(DateTime)
    started_at = Column(DateTime, default=datetime.utcnow)
    last_accessed = Column(DateTime, default=datetime.utcnow)
    attempt_number = Column(Integer, default=1)
    passed = Column(Boolean)
    feedback = Column(JSON, default=[])  # Feedback on choices

    __table_args__ = (
        Index('idx_sim_progress_user', 'user_email'),
        Index('idx_sim_progress_sim', 'simulation_id'),
        Index('idx_sim_progress_completed', 'completed'),
        Index('idx_sim_progress_user_sim', 'user_email', 'simulation_id'),
    )

    def __repr__(self):
        return f"<SimulationProgress {self.user_email} - {self.simulation_id}>"

    def to_dict(self):
        """Convert to dictionary for API responses."""
        return {
            "id": self.id,
            "user_email": self.user_email,
            "simulation_id": self.simulation_id,
            "current_node_id": self.current_node_id,
            "completed": self.completed,
            "score": self.score,
            "time_spent_seconds": self.time_spent_seconds,
            "choices_made": self.choices_made,
            "attempt_number": self.attempt_number,
            "passed": self.passed,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }


class SimulationAnalyticsSnapshot(Base):
    """
    Pre-computed analytics snapshot per simulation.
    Refreshed after every completion to provide instant historical reads.
    Only stores aggregates — individual attempts remain in simulation_progress.
    """
    __tablename__ = "simulation_analytics_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    simulation_id = Column(String(255), ForeignKey('simulations.id'), unique=True, nullable=False, index=True)

    # Attempt counts
    total_attempts = Column(Integer, default=0)
    total_completed = Column(Integer, default=0)
    total_passed = Column(Integer, default=0)
    total_failed = Column(Integer, default=0)

    # Score aggregates
    avg_score = Column(Float, default=0.0)
    highest_score = Column(Float, default=0.0)
    lowest_score = Column(Float, default=0.0)
    pass_rate = Column(Float, default=0.0)          # percentage 0-100

    # Time
    avg_time_seconds = Column(Float, default=0.0)

    # Metadata
    last_attempt_at = Column(DateTime)
    last_updated = Column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "simulation_id": self.simulation_id,
            "total_attempts": self.total_attempts,
            "total_completed": self.total_completed,
            "total_passed": self.total_passed,
            "total_failed": self.total_failed,
            "avg_score": self.avg_score,
            "highest_score": self.highest_score,
            "lowest_score": self.lowest_score,
            "pass_rate": self.pass_rate,
            "avg_time_seconds": self.avg_time_seconds,
            "last_attempt_at": self.last_attempt_at.isoformat() if self.last_attempt_at else None,
            "last_updated": self.last_updated.isoformat() if self.last_updated else None,
        }
