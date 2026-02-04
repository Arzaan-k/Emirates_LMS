"""
Quiz Endpoints
Quizzes, live quizzes, submissions, AI generation
"""

import uuid
import json
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime

from fastapi import APIRouter, Depends, Form, File, UploadFile, HTTPException
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.core.dependencies import get_current_user
from app.services.quiz_service import QuizService
from app.services.ai_service import AIService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/quizzes", tags=["Quizzes"])


# ==========================================
# QUIZ CRUD ENDPOINTS
# ==========================================

@router.get("/")
async def get_all_quizzes(db: Session = Depends(get_db)):
    """
    Get all quizzes.
    """
    service = QuizService(db)
    quizzes = service.get_all_quizzes()
    
    result = []
    for quiz in quizzes:
        quiz_dict = quiz.to_dict() if hasattr(quiz, 'to_dict') else dict(quiz)
        result.append(quiz_dict)
    
    return result


# ==========================================
# ALIAS ROUTES FOR BACKWARD COMPATIBILITY
# ==========================================

@router.get("/list")
async def get_quizzes_list_alias(db: Session = Depends(get_db)):
    """
    Alias for /quizzes/ - backward compatibility with frontend.
    """
    return await get_all_quizzes(db)


@router.post("/create")
async def create_quiz_alias(
    title: str = Form(...),
    description: str = Form(""),
    questions: str = Form(...),  # JSON array
    difficulty: str = Form("Medium"),
    time_limit: str = Form("10 mins"),
    category: str = Form("General"),
    created_by: str = Form("Admin"),
    db: Session = Depends(get_db)
):
    """
    Alias for POST /quizzes/ - backward compatibility with frontend.
    """
    return await create_quiz(title, description, questions, difficulty, time_limit, category, created_by, db)


# NOTE: /live routes must be defined BEFORE /{quiz_id} to avoid route conflicts
@router.get("/live")
def get_live_quizzes_main(db: Session = Depends(get_db)):
    """
    Get all live topic quizzes.
    """
    service = QuizService(db)
    quizzes = service.get_all_live_quizzes()
    
    result = []
    for quiz in quizzes:
        quiz_dict = quiz.to_dict() if hasattr(quiz, 'to_dict') else dict(quiz)
        result.append(quiz_dict)
    
    return result


@router.get("/{quiz_id}")
async def get_quiz(
    quiz_id: str,
    db: Session = Depends(get_db)
):
    """
    Get a specific quiz by ID.
    """
    service = QuizService(db)
    quiz = service.get_quiz_by_id(quiz_id)
    
    if not quiz:
        raise HTTPException(status_code=404, detail=f"Quiz with id '{quiz_id}' not found")
    
    return quiz.to_dict() if hasattr(quiz, 'to_dict') else dict(quiz)


@router.post("/")
async def create_quiz(
    title: str = Form(...),
    description: str = Form(""),
    questions: str = Form(...),  # JSON array
    difficulty: str = Form("Medium"),
    time_limit: str = Form("10 mins"),
    category: str = Form("General"),
    created_by: str = Form("Admin"),
    db: Session = Depends(get_db)
):
    """
    Create a new quiz.
    """
    service = QuizService(db)
    
    try:
        questions_list = json.loads(questions)
    except:
        raise HTTPException(status_code=400, detail="Invalid questions format")
    
    quiz_data = {
        "id": f"quiz_{uuid.uuid4().hex[:8]}",
        "title": title,
        "description": description,
        "questions": questions_list,
        "difficulty": difficulty,
        "time_limit": time_limit,
        "category": category,
        "created_by": created_by,
        "source": "manual",
    }
    
    try:
        quiz = service.create_quiz(quiz_data)
        logger.info(f"Quiz created: {quiz_data['id']}")
        
        response = quiz.to_dict() if hasattr(quiz, 'to_dict') else dict(quiz)
        response["status"] = "success"
        return response
    except Exception as e:
        logger.error(f"Quiz creation failed: {e}")
        raise


@router.put("/{quiz_id}")
async def update_quiz(
    quiz_id: str,
    title: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    questions: Optional[str] = Form(None),
    difficulty: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    """
    Update a quiz.
    """
    service = QuizService(db)
    
    updates = {}
    if title is not None:
        updates["title"] = title
    if description is not None:
        updates["description"] = description
    if difficulty is not None:
        updates["difficulty"] = difficulty
    if questions is not None:
        try:
            updates["questions"] = json.loads(questions)
        except:
            raise HTTPException(status_code=400, detail="Invalid questions format")
    
    try:
        quiz = service.update_quiz(quiz_id, updates)
        logger.info(f"Quiz updated: {quiz_id}")
        
        response = quiz.to_dict() if hasattr(quiz, 'to_dict') else dict(quiz)
        response["status"] = "success"
        return response
    except Exception as e:
        logger.error(f"Quiz update failed: {e}")
        raise


@router.delete("/{quiz_id}")
async def delete_quiz(
    quiz_id: str,
    db: Session = Depends(get_db)
):
    """
    Delete a quiz.
    """
    service = QuizService(db)
    
    try:
        service.delete_quiz(quiz_id)
        logger.info(f"Quiz deleted: {quiz_id}")
        return {"status": "success", "message": f"Quiz {quiz_id} deleted successfully"}
    except Exception as e:
        logger.error(f"Quiz deletion failed: {e}")
        raise


# ==========================================
# QUIZ SUBMISSION ENDPOINTS
# ==========================================

@router.post("/{quiz_id}/submit")
async def submit_quiz(
    quiz_id: str,
    user_name: str = Form(...),
    user_email: str = Form(None),
    answers: str = Form(...),  # JSON array of answer indices
    time_taken_seconds: int = Form(0),
    db: Session = Depends(get_db)
):
    """
    Submit a quiz and calculate the score.
    """
    service = QuizService(db)
    
    try:
        answers_list = json.loads(answers)
    except:
        raise HTTPException(status_code=400, detail="Invalid answers format")
    
    submission_data = {
        "user_name": user_name,
        "user_email": user_email,
        "answers": answers_list,
        "time_taken_seconds": time_taken_seconds,
    }
    
    try:
        result = service.submit_quiz(quiz_id, submission_data)
        logger.info(f"Quiz submitted: {user_name} - {quiz_id}")
        return result
    except Exception as e:
        logger.error(f"Quiz submission failed: {e}")
        raise


@router.post("/submit")
async def submit_quiz_alias(
    quiz_id: str = Form(...),
    user_name: str = Form(...),
    user_email: str = Form(None),
    answers: str = Form(...),
    time_taken_seconds: int = Form(0),
    db: Session = Depends(get_db)
):
    """
    Alias for /{quiz_id}/submit to handle direct POSTs.
    Forward compatibility for frontend calling /submit directly.
    """
    return await submit_quiz(quiz_id, user_name, user_email, answers, time_taken_seconds, db)


@router.get("/{quiz_id}/submissions")
async def get_quiz_submissions(
    quiz_id: str,
    db: Session = Depends(get_db)
):
    """
    Get all submissions for a quiz.
    """
    service = QuizService(db)
    submissions = service.get_submissions_by_quiz(quiz_id)
    
    result = []
    for submission in submissions:
        submission_dict = submission.to_dict() if hasattr(submission, 'to_dict') else dict(submission)
        result.append(submission_dict)
    
    return result


# Alias for /submissions - frontend calls /results
@router.get("/{quiz_id}/results")
async def get_quiz_results_alias(
    quiz_id: str,
    db: Session = Depends(get_db)
):
    """
    Alias for /{quiz_id}/submissions - backward compatibility with frontend.
    """
    return await get_quiz_submissions(quiz_id, db)


@router.get("/submissions/user/{user_email}")
async def get_user_quiz_submissions(
    user_email: str,
    db: Session = Depends(get_db)
):
    """
    Get all quiz submissions by a user.
    """
    service = QuizService(db)
    submissions = service.get_submissions_by_user(user_email)
    
    result = []
    for submission in submissions:
        submission_dict = submission.to_dict() if hasattr(submission, 'to_dict') else dict(submission)
        result.append(submission_dict)
    
    return result


# ==========================================
# LIVE QUIZ ENDPOINTS (POST, DELETE, SUBMIT)
# Note: GET /live is defined earlier to avoid route conflicts with /{quiz_id}
# ==========================================

@router.post("/live")
async def create_live_quiz(
    title: str = Form(...),
    difficulty: str = Form(...),
    time: str = Form(...),
    questions: str = Form(...),  # JSON string
    image: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db)
):
    """
    Create a new topic quiz and broadcast to all users.
    """
    service = QuizService(db)
    
    try:
        questions_list = json.loads(questions)
    except:
        raise HTTPException(status_code=400, detail="Invalid questions format")
    
    # Handle image upload
    image_url = None
    if image:
        from app.services.cdn_service import CDNService
        cdn_service = CDNService()

        content = await image.read()
        result = cdn_service.upload_thumbnail(content, image.filename)
        image_url = result.get("url")
    
    quiz_data = {
        "id": f"live_{uuid.uuid4().hex[:8]}",
        "title": title,
        "difficulty": difficulty,
        "time_limit": time,
        "questions": questions_list,
        "image": image_url,
    }
    
    try:
        quiz = service.create_live_quiz(quiz_data)
        logger.info(f"Live quiz created: {quiz_data['id']}")
        
        response = quiz.to_dict() if hasattr(quiz, 'to_dict') else dict(quiz)
        response["status"] = "success"
        return response
    except Exception as e:
        logger.error(f"Live quiz creation failed: {e}")
        raise


@router.delete("/live/{quiz_id}")
async def delete_live_quiz(
    quiz_id: str,
    db: Session = Depends(get_db)
):
    """
    Delete a live quiz.
    """
    service = QuizService(db)
    
    try:
        service.delete_live_quiz(quiz_id)
        logger.info(f"Live quiz deleted: {quiz_id}")
        return {"status": "success", "message": f"Live quiz {quiz_id} deleted successfully"}
    except Exception as e:
        logger.error(f"Live quiz deletion failed: {e}")
        raise


@router.post("/live/{quiz_id}/submit")
async def submit_live_quiz(
    quiz_id: str,
    user_name: str = Form(...),
    answers: str = Form(...),
    db: Session = Depends(get_db)
):
    """
    Submit a live quiz.
    """
    service = QuizService(db)
    
    try:
        answers_list = json.loads(answers)
    except:
        raise HTTPException(status_code=400, detail="Invalid answers format")
    
    try:
        result = service.submit_live_quiz(quiz_id, user_name, answers_list)
        logger.info(f"Live quiz submitted: {user_name} - {quiz_id}")
        return result
    except Exception as e:
        logger.error(f"Live quiz submission failed: {e}")
        raise


# ==========================================
# AI QUIZ GENERATION ENDPOINTS
# ==========================================

@router.post("/generate/from-content")
async def generate_quiz_from_content(
    title: str = Form(...),
    difficulty: str = Form("Medium"),
    num_questions: int = Form(5),
    preview_only: str = Form("false"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Generate a quiz from any uploaded content (video, PDF, image, or text file).
    """
    ai_service = AIService()
    quiz_service = QuizService(db)
    
    try:
        content = await file.read()
        filename = file.filename or "unknown"
        
        # Extract text from content
        text = await ai_service.extract_text_from_file(content, filename)
        
        if not text:
            raise HTTPException(status_code=400, detail="Could not extract text from file")
        
        # Generate quiz questions
        questions = await ai_service.generate_quiz_from_text(
            text=text,
            num_questions=num_questions,
            difficulty=difficulty
        )
        
        if preview_only.lower() == "true":
            return {
                "status": "success",
                "title": title,
                "questions": questions,
                "preview": True
            }
        
        # Create quiz
        quiz_data = {
            "id": f"quiz_{uuid.uuid4().hex[:8]}",
            "title": title,
            "description": f"AI-generated quiz from {filename}",
            "questions": questions,
            "difficulty": difficulty,
            "source": "ai_generated",
        }
        
        quiz = quiz_service.create_quiz(quiz_data)
        logger.info(f"AI quiz generated: {quiz_data['id']}")

        return {"status": "success", "quiz": quiz.to_dict() if hasattr(quiz, 'to_dict') else dict(quiz), "questions": questions}

    except Exception as e:
        logger.error(f"Quiz generation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")


@router.post("/generate/from-topic")
async def generate_quiz_from_topic(
    data: Optional[Dict[str, Any]] = None,
    topic: Optional[str] = Form(None),
    num_questions: int = Form(5),
    difficulty: str = Form("Medium"),
    db: Session = Depends(get_db)
):
    """
    Generate a quiz from a topic using AI.
    Accepts both JSON body and Form data.
    """
    # Handle JSON body if provided
    if data:
        topic = data.get("topic", topic)
        num_questions = data.get("num_questions", num_questions)
        difficulty = data.get("difficulty", difficulty)

    if not topic:
        raise HTTPException(status_code=400, detail="Topic is required")

    ai_service = AIService()
    quiz_service = QuizService(db)

    try:
        questions = await ai_service.generate_quiz_from_text(
            text=f"Generate quiz questions about: {topic}",
            num_questions=num_questions,
            difficulty=difficulty
        )

        quiz_data = {
            "id": f"quiz_{uuid.uuid4().hex[:8]}",
            "title": f"Quiz: {topic}",
            "description": f"AI-generated quiz about {topic}",
            "questions": questions,
            "difficulty": difficulty,
            "source": "ai_generated",
        }

        quiz = quiz_service.create_quiz(quiz_data)
        logger.info(f"Topic quiz generated: {quiz_data['id']}")

        return {"status": "success", "quiz": quiz.to_dict() if hasattr(quiz, 'to_dict') else dict(quiz), "questions": questions}

    except Exception as e:
        logger.error(f"Topic quiz generation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")


# ==========================================
# MID-VIDEO QUIZ ENDPOINTS
# ==========================================

@router.post("/mid-video/generate")
async def generate_mid_video_quiz(
    node_id: str = Form(...),
    transcript_segment: str = Form(None),
    trigger_time_seconds: float = Form(...),
    num_questions: int = Form(3),
    db: Session = Depends(get_db)
):
    """
    Get or generate a mid-video quiz.
    First checks database for pre-generated quiz, falls back to real-time generation if needed.
    """
    from app.models.video_progress import MidVideoQuiz

    try:
        # First, try to get pre-generated quiz from database
        # Look for quiz within 5 seconds of trigger time (handles rounding)
        existing_quizzes = db.query(MidVideoQuiz).filter(
            MidVideoQuiz.node_id == node_id,
            MidVideoQuiz.trigger_time_seconds.between(trigger_time_seconds - 5, trigger_time_seconds + 5)
        ).all()

        if existing_quizzes:
            # Return cached quiz
            quiz = existing_quizzes[0]
            logger.info(f"Returning cached mid-video quiz for {node_id} at {trigger_time_seconds}s")
            return {
                "id": quiz.id,
                "node_id": quiz.node_id,
                "trigger_time_seconds": quiz.trigger_time_seconds,
                "questions": quiz.questions,
                "cached": True
            }

        # Fallback: Generate on-demand if no cached quiz exists
        logger.warning(f"No cached quiz found for {node_id} at {trigger_time_seconds}s, generating on-demand...")

        if not transcript_segment:
            raise HTTPException(status_code=400, detail="transcript_segment required for on-demand generation")

        ai_service = AIService()
        questions = await ai_service.generate_quiz_from_text(
            text=transcript_segment,
            num_questions=num_questions,
            difficulty="Easy"
        )

        # Store for future use
        mid_quiz_id = f"mvq_{node_id}_{int(trigger_time_seconds)}"
        mid_quiz = MidVideoQuiz(
            id=mid_quiz_id,
            node_id=node_id,
            trigger_time_seconds=trigger_time_seconds,
            questions=questions,
            generated_from_transcript=transcript_segment[:500] if transcript_segment else "",
            created_at=datetime.utcnow()
        )

        db.add(mid_quiz)
        db.commit()

        logger.info(f"Generated and cached mid-video quiz for {node_id} at {trigger_time_seconds}s")

        return {
            "id": mid_quiz_id,
            "node_id": node_id,
            "trigger_time_seconds": trigger_time_seconds,
            "questions": questions,
            "cached": False
        }

    except Exception as e:
        logger.error(f"Mid-video quiz retrieval/generation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed: {str(e)}")


@router.get("/mid-video/all/{node_id}")
async def get_all_mid_video_quizzes(
    node_id: str,
    db: Session = Depends(get_db)
):
    """
    Get all pre-generated mid-video quizzes for a video.
    Returns empty array if none exist yet (still generating in background).
    """
    from app.models.video_progress import MidVideoQuiz

    try:
        quizzes = db.query(MidVideoQuiz).filter(
            MidVideoQuiz.node_id == node_id
        ).order_by(MidVideoQuiz.trigger_time_seconds).all()

        result = []
        for quiz in quizzes:
            result.append({
                "id": quiz.id,
                "node_id": quiz.node_id,
                "trigger_time_seconds": quiz.trigger_time_seconds,
                "questions": quiz.questions,
                "question_count": len(quiz.questions) if quiz.questions else 0
            })

        logger.info(f"Returning {len(result)} pre-generated quizzes for {node_id}")
        return result

    except Exception as e:
        logger.error(f"Failed to fetch mid-video quizzes for {node_id}: {e}")
        return []


@router.post("/mid-video/submit")
async def submit_mid_video_quiz(
    user_email: str = Form(...),
    node_id: str = Form(...),
    quiz_id: str = Form(...),
    trigger_time_seconds: float = Form(...),
    answers: str = Form(...),
    db: Session = Depends(get_db)
):
    """
    Submit answers for a mid-video quiz.
    """
    quiz_service = QuizService(db)

    try:
        answers_list = json.loads(answers)
    except:
        raise HTTPException(status_code=400, detail="Invalid answers format")

    # Calculate score (simplified - would need stored quiz questions)
    result = {
        "quiz_id": quiz_id,
        "node_id": node_id,
        "user_email": user_email,
        "submitted_at": datetime.utcnow().isoformat(),
        "answers": answers_list,
    }

    return result


@router.post("/end-quiz/submit")
async def submit_end_quiz(
    user_email: str = Form(...),
    node_id: str = Form(...),
    score: int = Form(...),
    total: int = Form(...),
    db: Session = Depends(get_db)
):
    """
    Submit the end-of-lesson quiz score and check completion.
    """
    from app.services.user_service import UserService
    
    user_service = UserService(db)
    
    passed = (score / total * 100) >= 70 if total > 0 else False
    
    # Update node progress
    progress_data = {
        "quiz_attempts": 1,
        "quiz_best_score": score / total * 100 if total > 0 else 0,
        "completed": passed,
    }
    
    try:
        user_service.update_node_progress(user_email, node_id, progress_data)
    except:
        pass
    
    return {
        "node_id": node_id,
        "score": score,
        "total": total,
        "percentage": score / total * 100 if total > 0 else 0,
        "passed": passed,
    }
