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
# PYDANTIC MODELS
# ==========================================

from pydantic import BaseModel
from typing import List, Dict, Any, Optional

class OptionModel(BaseModel):
    id: str
    text: str
    isCorrect: bool
    consequence: Optional[str] = None
    nextNodeId: Optional[str] = None

class NodeModel(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    videoUrl: Optional[str] = None
    isStart: bool
    options: List[OptionModel]

class SimulationSaveRequest(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    category: str
    difficulty: str
    thumbnailUrl: Optional[str] = None
    nodes: List[NodeModel]
    estimatedTime: Optional[str] = None
    maxScore: Optional[int] = None
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None

class SimulationCompleteRequest(BaseModel):
    userId: str
    user_name: Optional[str] = None
    simulationId: str
    score: float
    totalSteps: int
    wrongAttempts: int
    timeSpentSeconds: int
    attemptHistory: List[Dict[str, Any]] = []
    completedAt: Optional[str] = None
    outcome: Optional[str] = None
    choices: List[Any] = []

class ConsequenceRequest(BaseModel):
    scenario: str
    currentStep: str
    wrongOption: str


# ==========================================
# ADDITIONAL ENDPOINTS
# ==========================================

@router.post("/upload-media")
async def upload_simulation_media(
    file: UploadFile = File(...)
):
    """
    Generic media upload for simulations (videos/images).
    Returns a persistent URL (R2 or Local).
    """
    from app.services.cdn_service import CDNService
    
    cdn_service = CDNService()
    
    # Generate unique filename
    ext = os.path.splitext(file.filename)[1] if file.filename else ".bin"
    filename = f"sim_media_{uuid.uuid4().hex}{ext}"
    
    content = await file.read()
    
    # Upload
    result = cdn_service.upload_video(content, filename, file.content_type)
    url = result.get("url")
    
    return {"url": url}

@router.post("/save")
async def save_simulation(
    data: SimulationSaveRequest,
    db: Session = Depends(get_db)
):
    """
    Create or Update a full simulation definition (JSON).
    """
    repo = SimulationRepository(db)
    existing = repo.get_by_id(data.id)
    
    # Convert Pydantic model to dict
    sim_data = data.dict(exclude_unset=True)
    
    # Map frontend fields to DB columns
    if "thumbnailUrl" in sim_data:
        sim_data["thumbnail"] = sim_data.pop("thumbnailUrl")
    if "estimatedTime" in sim_data:
        sim_data["duration"] = sim_data.pop("estimatedTime")
    
    # Ensure nodes is a list of dicts
    # Pydantic .dict() handles recursive conversion, so sim_data['nodes'] is list of dicts.
    
    if existing:
        updated = repo.update_simulation(data.id, sim_data)
        return {"success": True, "id": updated.id, "message": "Simulation updated successfully"}
    else:
        created = repo.create_simulation(sim_data)
        return {"success": True, "id": created.id, "message": "Simulation created successfully"}


@router.post("/generate-consequence")
async def generate_consequence(
    request: ConsequenceRequest,
):
    """
    Generate a consequence for a wrong choice using AI (Mocked for now).
    """
    # In a real implementation, call an LLM here
    # For now, return a generic but context-aware message
    return {
        "consequence": f"Choosing '{request.wrongOption}' in the '{request.scenario}' scenario might lead to negative customer experience. Consider the standard operating procedure."
    }

@router.get("/analytics/{simulation_id}")
async def get_simulation_analytics(
    simulation_id: str,
    db: Session = Depends(get_db)
):
    """
    Get analytics for a simulation.
    """
    repo = SimulationProgressRepository(db)
    submissions = repo.get_by_simulation(simulation_id)
    
    total_attempts = len(submissions)
    if total_attempts == 0:
        return {
            "totalAttempts": 0,
            "averageScore": 0,
            "passRate": 0
        }
    
    avg_score = sum(s.score for s in submissions) / total_attempts
    passed_count = sum(1 for s in submissions if s.passed)
    pass_rate = (passed_count / total_attempts) * 100 if total_attempts > 0 else 0
    
    return {
        "totalAttempts": total_attempts,
        "averageScore": round(avg_score, 1),
        "passRate": round(pass_rate, 1)
    }

@router.get("/history/user")
async def get_user_history(
    email: Optional[str] = None, # Allow query param
    db: Session = Depends(get_db)
):
    """
    Get simulation history for a user.
    """
    # If no email provided, valid only if we had auth middleware content (which we might not here)
    if not email:
        return []

    repo = SimulationProgressRepository(db)
    submissions = repo.get_by_user(email)
    
    # Format for frontend
    result = []
    for sub in submissions:
        # Fetch simulation title if possible, or just ID
        sim_repo = SimulationRepository(db)
        sim = sim_repo.get_by_id(sub.simulation_id)
        
        result.append({
            "id": sub.id,
            "simulationId": sub.simulation_id,
            "simulationTitle": sim.title if sim else "Unknown Simulation",
            "score": sub.score,
            "passed": sub.passed,
            "completedAt": sub.completed_at.isoformat() if sub.completed_at else None,
            "totalSteps": 10, # Mock/Estimate if not stored
            "wrongAttempts": 0, # Not currently stored in simple model, would need field update
            "timeSpentSeconds": 300, # Mock
        })
        
    return result

@router.post("/complete")
async def complete_simulation_json(
    data: SimulationCompleteRequest,
    db: Session = Depends(get_db)
):
    """
    Complete a simulation attempt (JSON support).
    """
    progress_repo = SimulationProgressRepository(db)
    sim_repo = SimulationRepository(db)

    simulation = sim_repo.get_by_id(data.simulationId)
    passing_score = simulation.passing_score if simulation else 70.0
    passed = data.score >= passing_score

    # We use the repository's complete_simulation or create a new one if it doesn't exist
    # Since frontend might not have started it via /start endpoint, we just create a record here
    
    # Ideally logic should check if attempt exists, but for simplicity/robustness:
    progress = progress_repo.create_progress({
        "user_email": data.userId,
        "simulation_id": data.simulationId,
        "current_node_id": "end",
        "completed": True,
        "started_at": datetime.utcnow(), # Approximate if not tracked
        "score": data.score,
        "passed": passed,
        "choices_made": data.attemptHistory
    })

    logger.info(f"Simulation completed (JSON): {data.userId} - {data.simulationId}")

    return {
        "id": f"sub_{progress.id}",
        "success": True,
        "passed": passed,
        "score": data.score
    }



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
    node_found = False
    for node in nodes:
        if node.get("id") == node_id:
            node["videoUrl"] = video_url # Frontend uses videoUrl (camelCase)
            node["video_url"] = video_url # Backend consistency
            node["video_title"] = title
            node_found = True
            break
    
    if node_found:
        sim_repo.update_simulation(simulation_id, {"nodes": nodes})

    return {
        "simulation_id": simulation_id,
        "node_id": node_id,
        "video_url": video_url,
    }

