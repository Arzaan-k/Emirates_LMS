"""
Simulations Endpoints
Interactive simulations, branching scenarios - Database backed
"""

import uuid
import json
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime

from fastapi import APIRouter, Depends, Form, File, UploadFile, HTTPException
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.repositories.simulation_repository import SimulationRepository, SimulationProgressRepository

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/simulations", tags=["Simulations"])


# ==========================================
# SIMULATION CRUD ENDPOINTS
# ==========================================

@router.get("/")
async def get_simulations(db: Session = Depends(get_db)):
    """
    Get all interactive simulations.
    """
    repo = SimulationRepository(db)
    simulations = repo.get_active_simulations()

    result = []
    for sim in simulations:
        sim_dict = sim.to_dict() if hasattr(sim, 'to_dict') else {
            "id": sim.id,
            "title": sim.title,
            "description": sim.description,
            "thumbnail": sim.thumbnail,
            "is_active": sim.is_active,
        }
        result.append(sim_dict)

    return result


@router.get("/{simulation_id}")
async def get_simulation(simulation_id: str, db: Session = Depends(get_db)):
    """
    Get a specific simulation by ID.
    """
    repo = SimulationRepository(db)
    sim = repo.get_by_id(simulation_id)

    if not sim:
        raise HTTPException(status_code=404, detail="Simulation not found")

    return sim.to_dict() if hasattr(sim, 'to_dict') else dict(sim)


@router.post("/")
async def create_simulation(
    title: str = Form(...),
    description: str = Form(""),
    scenario: str = Form(...),  # JSON with branching structure
    thumbnail: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db)
):
    """
    Create a new interactive simulation.
    """
    try:
        scenario_data = json.loads(scenario)
    except:
        raise HTTPException(status_code=400, detail="Invalid scenario JSON")

    thumbnail_url = None
    if thumbnail:
        from app.services.cdn_service import CDNService
        cdn_service = CDNService()

        content = await thumbnail.read()
        result = cdn_service.upload_file(content, thumbnail.filename, thumbnail.content_type, folder="simulations")
        thumbnail_url = result.get("url")

    repo = SimulationRepository(db)
    simulation_data = {
        "id": f"sim_{uuid.uuid4().hex[:8]}",
        "title": title,
        "description": description,
        "nodes": scenario_data,
        "thumbnail": thumbnail_url,
        "is_active": True,
    }

    simulation = repo.create_simulation(simulation_data)
    logger.info(f"Simulation created: {simulation.id}")

    return simulation.to_dict() if hasattr(simulation, 'to_dict') else dict(simulation)


@router.put("/{simulation_id}")
async def update_simulation(
    simulation_id: str,
    title: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    scenario: Optional[str] = Form(None),
    is_active: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    """
    Update a simulation.
    """
    repo = SimulationRepository(db)

    updates = {}
    if title is not None:
        updates["title"] = title
    if description is not None:
        updates["description"] = description
    if scenario is not None:
        try:
            updates["nodes"] = json.loads(scenario)
        except:
            pass
    if is_active is not None:
        updates["is_active"] = is_active.lower() == "true"

    simulation = repo.update_simulation(simulation_id, updates)

    if not simulation:
        raise HTTPException(status_code=404, detail="Simulation not found")

    logger.info(f"Simulation updated: {simulation_id}")
    return simulation.to_dict() if hasattr(simulation, 'to_dict') else dict(simulation)


@router.delete("/{simulation_id}")
async def delete_simulation(simulation_id: str, db: Session = Depends(get_db)):
    """
    Delete a simulation.
    """
    repo = SimulationRepository(db)

    if not repo.delete_simulation(simulation_id):
        raise HTTPException(status_code=404, detail="Simulation not found")

    logger.info(f"Simulation deleted: {simulation_id}")
    return {"message": f"Simulation {simulation_id} deleted"}


# ==========================================
# SIMULATION SUBMISSION ENDPOINTS
# ==========================================

@router.post("/{simulation_id}/start")
async def start_simulation(
    simulation_id: str,
    user_email: str = Form(...),
    user_name: str = Form(...),
    db: Session = Depends(get_db)
):
    """
    Start a simulation attempt for a user.
    """
    sim_repo = SimulationRepository(db)
    progress_repo = SimulationProgressRepository(db)

    simulation = sim_repo.get_by_id(simulation_id)
    if not simulation:
        raise HTTPException(status_code=404, detail="Simulation not found")

    # Create progress record
    progress = progress_repo.create_progress({
        "user_email": user_email,
        "simulation_id": simulation_id,
        "current_node_id": simulation.start_node_id,
        "completed": False,
        "started_at": datetime.utcnow(),
    })

    return {
        "id": f"attempt_{progress.id}",
        "simulation_id": simulation_id,
        "user_email": user_email,
        "user_name": user_name,
        "started_at": datetime.utcnow().isoformat(),
        "completed": False,
        "choices": [],
    }


@router.post("/{simulation_id}/choice")
async def record_simulation_choice(
    simulation_id: str,
    user_email: str = Form(...),
    node_id: str = Form(...),
    choice_id: str = Form(...),
    choice_text: str = Form(""),
    db: Session = Depends(get_db)
):
    """
    Record a choice made during a simulation.
    """
    progress_repo = SimulationProgressRepository(db)

    progress = progress_repo.get_by_user_and_simulation(user_email, simulation_id)
    if progress:
        choices = progress.choices_made or []
        choices.append({
            "node_id": node_id,
            "choice_id": choice_id,
            "choice_text": choice_text,
            "timestamp": datetime.utcnow().isoformat(),
        })
        progress_repo.update_progress(progress.id, {
            "choices_made": choices,
            "current_node_id": node_id,
        })

    return {
        "recorded": True,
        "choice": {
            "simulation_id": simulation_id,
            "user_email": user_email,
            "node_id": node_id,
            "choice_id": choice_id,
            "choice_text": choice_text,
            "timestamp": datetime.utcnow().isoformat(),
        }
    }


@router.post("/{simulation_id}/complete")
async def complete_simulation(
    simulation_id: str,
    user_email: str = Form(...),
    user_name: str = Form(...),
    choices: str = Form("[]"),
    outcome: str = Form(""),
    score: int = Form(0),
    db: Session = Depends(get_db)
):
    """
    Complete a simulation attempt.
    """
    try:
        choices_list = json.loads(choices)
    except:
        choices_list = []

    progress_repo = SimulationProgressRepository(db)
    sim_repo = SimulationRepository(db)

    simulation = sim_repo.get_by_id(simulation_id)
    passing_score = simulation.passing_score if simulation else 70.0
    passed = score >= passing_score

    progress = progress_repo.complete_simulation(
        user_email=user_email,
        simulation_id=simulation_id,
        score=float(score),
        passed=passed,
        choices_made=choices_list,
    )

    logger.info(f"Simulation completed: {user_email} - {simulation_id}")

    return {
        "id": f"sub_{progress.id}",
        "simulation_id": simulation_id,
        "user_email": user_email,
        "user_name": user_name,
        "choices": choices_list,
        "outcome": outcome,
        "score": score,
        "passed": passed,
        "completed_at": datetime.utcnow().isoformat(),
    }


@router.get("/{simulation_id}/submissions")
async def get_simulation_submissions(
    simulation_id: str,
    db: Session = Depends(get_db)
):
    """
    Get all submissions for a simulation.
    """
    progress_repo = SimulationProgressRepository(db)
    submissions = progress_repo.get_by_simulation(simulation_id)

    result = []
    for sub in submissions:
        sub_dict = sub.to_dict() if hasattr(sub, 'to_dict') else {
            "id": sub.id,
            "user_email": sub.user_email,
            "simulation_id": sub.simulation_id,
            "score": sub.score,
            "completed": sub.completed,
        }
        result.append(sub_dict)

    return result


@router.get("/submissions/user/{user_email}")
async def get_user_simulation_submissions(
    user_email: str,
    db: Session = Depends(get_db)
):
    """
    Get all simulation submissions by a user.
    """
    progress_repo = SimulationProgressRepository(db)
    submissions = progress_repo.get_by_user(user_email)

    result = []
    for sub in submissions:
        sub_dict = sub.to_dict() if hasattr(sub, 'to_dict') else {
            "id": sub.id,
            "user_email": sub.user_email,
            "simulation_id": sub.simulation_id,
            "score": sub.score,
            "completed": sub.completed,
        }
        result.append(sub_dict)

    return result


# ==========================================
# SIMULATION VIDEO ENDPOINTS
# ==========================================

@router.post("/{simulation_id}/videos")
async def upload_simulation_video(
    simulation_id: str,
    node_id: str = Form(...),
    title: str = Form(""),
    video: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Upload a video for a simulation node.
    """
    from app.services.cdn_service import CDNService

    sim_repo = SimulationRepository(db)
    simulation = sim_repo.get_by_id(simulation_id)

    if not simulation:
        raise HTTPException(status_code=404, detail="Simulation not found")

    cdn_service = CDNService()

    content = await video.read()
    filename = video.filename or "video.mp4"

    result = cdn_service.upload_video(content, filename, video.content_type)
    video_url = result.get("url")

    # Update simulation nodes with video URL
    nodes = simulation.nodes or []
    for node in nodes:
        if node.get("id") == node_id:
            node["video_url"] = video_url
            node["video_title"] = title
            break

    sim_repo.update_simulation(simulation_id, {"nodes": nodes})

    return {
        "simulation_id": simulation_id,
        "node_id": node_id,
        "video_url": video_url,
    }
