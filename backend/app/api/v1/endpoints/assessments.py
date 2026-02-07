"""
Assessment Endpoints
Proctored assessments, submissions, scheduled exams
"""

import uuid
import json
import logging
import random
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
from math import radians, cos, sin, asin, sqrt

from fastapi import APIRouter, Depends, Form, File, UploadFile, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.config.database import get_db
from app.core.dependencies import get_current_user, require_admin
from app.services.assessment_service import AssessmentService
from app.services.ai_service import AIService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/assessments", tags=["Assessments"])


# ==========================================
# PROCTORED ASSESSMENT ENDPOINTS
# ==========================================

@router.get("/proctored")
def get_proctored_assessments(db: Session = Depends(get_db)):
    """
    Get all active proctored assessments.
    """
    service = AssessmentService(db)
    assessments = service.get_active_assessments()
    
    result = []
    for assessment in assessments:
        assessment_dict = assessment.to_dict() if hasattr(assessment, 'to_dict') else dict(assessment)
        result.append(assessment_dict)
    
    return result


@router.get("/proctored/all")
def get_all_proctored_assessments(db: Session = Depends(get_db)):
    """
    Get all proctored assessments (admin).
    """
    service = AssessmentService(db)
    assessments = service.get_all_assessments()
    
    result = []
    for assessment in assessments:
        assessment_dict = assessment.to_dict() if hasattr(assessment, 'to_dict') else dict(assessment)
        result.append(assessment_dict)
    
    return result


@router.get("/proctored/{assessment_id}")
def get_proctored_assessment(
    assessment_id: str,
    db: Session = Depends(get_db)
):
    """
    Get a specific proctored assessment.
    """
    service = AssessmentService(db)
    assessment = service.get_assessment_by_id(assessment_id)
    
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
    
    return assessment.to_dict() if hasattr(assessment, 'to_dict') else dict(assessment)


class ProctoredAssessmentCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    questions: List[Dict[str, Any]]
    time_limit_minutes: Optional[int] = 30
    passing_score: Optional[int] = 70
    created_by: Optional[str] = "Admin"
    ai_generated: Optional[bool] = False

@router.post("/proctored")
async def create_proctored_assessment(
    assessment_in: ProctoredAssessmentCreate,
    db: Session = Depends(get_db)
):
    """
    Create a new proctored assessment.
    """
    service = AssessmentService(db)
    
    # questions is already a list from Pydantic validation
    
    assessment_data = {
        "id": f"assessment_{uuid.uuid4().hex[:8]}",
        "title": assessment_in.title,
        "description": assessment_in.description,
        "questions": assessment_in.questions,
        "time_limit_minutes": assessment_in.time_limit_minutes,
        "passing_score": assessment_in.passing_score,
        "created_by": assessment_in.created_by,
        "total_questions": len(assessment_in.questions),
    }
    
    try:
        assessment = service.create_assessment(assessment_data)
        logger.info(f"Assessment created: {assessment_data['id']}")
        
        result = assessment.to_dict() if hasattr(assessment, 'to_dict') else dict(assessment)
        # Frontend expects status field
        if isinstance(result, dict):
            result['status'] = 'success'
            
        return result
    except Exception as e:
        logger.error(f"Assessment creation failed: {e}")
        raise


@router.post("/proctored/bulk-upload")
async def bulk_upload_assessment_questions(
    title: str = Form(...),
    description: str = Form(""),
    time_limit_minutes: int = Form(30),
    passing_score: int = Form(70),
    created_by: str = Form("Admin"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Create assessment with questions from Excel/CSV file.
    """
    import pandas as pd
    import io
    
    service = AssessmentService(db)
    
    try:
        contents = await file.read()
        
        if file.filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(contents))
        else:
            df = pd.read_excel(io.BytesIO(contents))
        
        questions = []
        for _, row in df.iterrows():
            question = {
                "question": str(row.get('Question', row.get('question', ''))),
                "options": [
                    str(row.get('Option1', row.get('option1', ''))),
                    str(row.get('Option2', row.get('option2', ''))),
                    str(row.get('Option3', row.get('option3', ''))),
                    str(row.get('Option4', row.get('option4', ''))),
                ],
                "correctIndex": int(row.get('CorrectIndex', row.get('correct_index', 0))),
            }
            questions.append(question)
        
        assessment_data = {
            "id": f"assessment_{uuid.uuid4().hex[:8]}",
            "title": title,
            "description": description,
            "questions": questions,
            "time_limit_minutes": time_limit_minutes,
            "passing_score": passing_score,
            "created_by": created_by,
            "total_questions": len(questions),
        }
        
        assessment = service.create_assessment(assessment_data)
        logger.info(f"Assessment created from file: {assessment_data['id']}")
        
        result = assessment.to_dict() if hasattr(assessment, 'to_dict') else dict(assessment)
        if isinstance(result, dict):
            result['status'] = 'success'
        return result
        
    except Exception as e:
        logger.error(f"Bulk assessment upload failed: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to process file: {str(e)}")


@router.post("/proctored/ai-generate")
async def ai_generate_assessment_questions(
    title: str = Form(...),
    description: str = Form(""),
    time_limit_minutes: int = Form(30),
    passing_score: int = Form(70),
    num_questions: int = Form(10),
    topic: str = Form(""),
    content: str = Form(""),
    created_by: str = Form("Admin"),
    db: Session = Depends(get_db)
):
    """
    Generate proctored assessment questions using AI from topic or provided content.
    """
    service = AssessmentService(db)
    ai_service = AIService()
    
    try:
        # Generate questions using AI
        source = content if content else topic
        questions = await ai_service.generate_quiz_from_text(
            text=source,
            num_questions=num_questions,
            difficulty="Medium"
        )
        
        assessment_data = {
            "id": f"assessment_{uuid.uuid4().hex[:8]}",
            "title": title,
            "description": description,
            "questions": questions,
            "time_limit_minutes": time_limit_minutes,
            "passing_score": passing_score,
            "created_by": created_by,
            "total_questions": len(questions),
        }
        
        assessment = service.create_assessment(assessment_data)
        logger.info(f"AI-generated assessment created: {assessment_data['id']}")
        
        result = assessment.to_dict() if hasattr(assessment, 'to_dict') else dict(assessment)
        if isinstance(result, dict):
            result['status'] = 'success'
        return result
        
    except Exception as e:
        logger.error(f"AI assessment generation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")


@router.post("/generate-questions")
async def generate_questions_only(
    topic: str = Form(""),
    content: str = Form(""),
    num_questions: int = Form(10),
    difficulty: str = Form("Medium"),
    db: Session = Depends(get_db)
):
    """
    Generate questions only (without creating an assessment entity).
    Useful for previews or wizard steps.
    """
    ai_service = AIService()
    
    try:
        source = content if content else topic
        questions = await ai_service.generate_quiz_from_text(
            text=source,
            num_questions=num_questions,
            difficulty=difficulty
        )
        return {"questions": questions}
    except Exception as e:
        logger.error(f"Question generation failed: {e}")
        # Return empty list or 500? Frontend handles errors.
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")


@router.put("/proctored/{assessment_id}/toggle")
async def toggle_assessment_active(
    assessment_id: str,
    db: Session = Depends(get_db)
):
    """
    Toggle assessment active/inactive status.
    """
    service = AssessmentService(db)
    
    try:
        assessment = service.toggle_assessment_status(assessment_id)
        logger.info(f"Assessment toggled: {assessment_id}")
        
        result = assessment.to_dict() if hasattr(assessment, 'to_dict') else dict(assessment)
        if isinstance(result, dict):
            result['status'] = 'success'
        return result
    except Exception as e:
        logger.error(f"Assessment toggle failed: {e}")
        raise


@router.put("/proctored/{assessment_id}")
async def update_proctored_assessment(
    assessment_id: str,
    assessment_in: ProctoredAssessmentCreate,
    db: Session = Depends(get_db)
):
    """
    Update a proctored assessment.
    """
    service = AssessmentService(db)
    
    update_data = {
        "title": assessment_in.title,
        "description": assessment_in.description,
        "questions": assessment_in.questions,
        "time_limit_minutes": assessment_in.time_limit_minutes,
        "passing_score": assessment_in.passing_score,
        "created_by": assessment_in.created_by,
    }
    
    try:
        assessment = service.update_assessment(assessment_id, update_data)
        logger.info(f"Assessment updated: {assessment_id}")
        
        result = assessment.to_dict() if hasattr(assessment, 'to_dict') else dict(assessment)
        if isinstance(result, dict):
            result['status'] = 'success'
        return result
    except Exception as e:
        logger.error(f"Assessment update failed: {e}")
        raise


@router.delete("/proctored/{assessment_id}")
async def delete_proctored_assessment(
    assessment_id: str,
    db: Session = Depends(get_db)
):
    """
    Delete a proctored assessment.
    """
    service = AssessmentService(db)
    
    try:
        service.delete_assessment(assessment_id)
        logger.info(f"Assessment deleted: {assessment_id}")
        return {
            "status": "success", 
            "message": f"Assessment {assessment_id} deleted successfully"
        }
    except Exception as e:
        logger.error(f"Assessment deletion failed: {e}")
        raise


# ==========================================
# ASSESSMENT SUBMISSION ENDPOINTS
# ==========================================

@router.post("/proctored/{assessment_id}/submit")
async def submit_assessment(
    assessment_id: str,
    user_email: str = Form(...),
    user_name: str = Form(...),
    answers: str = Form(...),  # JSON array
    time_taken_seconds: int = Form(0),
    violations: int = Form(0),
    breach_log: str = Form("[]"),
    critical_breaches: int = Form(0),
    warning_breaches: int = Form(0),
    db: Session = Depends(get_db)
):
    """
    Submit a proctored assessment attempt with detailed breach tracking.
    """
    service = AssessmentService(db)
    
    try:
        answers_list = json.loads(answers)
        breach_log_list = json.loads(breach_log)
    except:
        raise HTTPException(status_code=400, detail="Invalid JSON format")
    
    submission_data = {
        "user_email": user_email,
        "user_name": user_name,
        "answers": answers_list,
        "time_taken_seconds": time_taken_seconds,
        "violations": violations,
        "breach_log": breach_log_list,
        "critical_breaches": critical_breaches,
        "warning_breaches": warning_breaches,
    }
    
    try:
        result = service.submit_assessment(
            assessment_id=assessment_id,
            user_email=user_email,
            user_name=user_name,
            answers=answers_list,
            time_taken_seconds=time_taken_seconds,
            breach_log=breach_log_list
        )
        logger.info(f"Assessment submitted: {user_email} - {assessment_id}")
        
        # Return formatted response
        return {
            "submission_id": result.id,
            "assessment_id": result.assessment_id,
            "user_email": result.user_email,
            "correct_count": result.correct_count,
            "total_questions": result.total_questions,
            "score_percent": result.score_percent,
            "passed": result.passed,
            "integrity_status": result.integrity_status,
            "violations": result.violations,
            "critical_breaches": result.critical_breaches,
            "warning_breaches": result.warning_breaches,
        }
    except Exception as e:
        logger.error(f"Assessment submission failed: {e}")
        raise


@router.get("/submissions")
async def get_all_submissions(db: Session = Depends(get_db)):
    """
    Get all assessment submissions (admin).
    """
    service = AssessmentService(db)
    submissions = service.get_all_submissions()
    
    result = []
    for submission in submissions:
        submission_dict = submission.to_dict() if hasattr(submission, 'to_dict') else dict(submission)
        result.append(submission_dict)
    
    return result


@router.get("/submissions/assessment/{assessment_id}")
async def get_assessment_submissions(
    assessment_id: str,
    db: Session = Depends(get_db)
):
    """
    Get submissions for a specific assessment.
    """
    service = AssessmentService(db)
    submissions = service.get_submissions_by_assessment(assessment_id)
    
    result = []
    for submission in submissions:
        submission_dict = submission.to_dict() if hasattr(submission, 'to_dict') else dict(submission)
        result.append(submission_dict)
    
    return result


@router.get("/proctored/{assessment_id}/submissions")
async def get_proctored_assessment_submissions_alias(
    assessment_id: str,
    db: Session = Depends(get_db)
):
    """
    Get submissions for a specific proctored assessment.
    Alias to match frontend route structure.
    """
    return await get_assessment_submissions(assessment_id, db)


@router.get("/submissions/user/{user_email}")
async def get_user_submissions(
    user_email: str,
    db: Session = Depends(get_db)
):
    """
    Get all submissions by a specific user.
    """
    service = AssessmentService(db)
    submissions = service.get_submissions_by_user(user_email)
    
    result = []
    for submission in submissions:
        submission_dict = submission.to_dict() if hasattr(submission, 'to_dict') else dict(submission)
        result.append(submission_dict)
    
    return result


# ==========================================
# SCHEDULED EXAM ENDPOINTS
# ==========================================

@router.get("/scheduled")
async def get_scheduled_exams(db: Session = Depends(get_db)):
    """
    Get all scheduled exams (admin view).
    """
    service = AssessmentService(db)
    exams = service.get_all_scheduled_exams()
    
    result = []
    for exam in exams:
        exam_dict = exam.to_dict() if hasattr(exam, 'to_dict') else dict(exam)
        
        # Inject stats for Admin View (ExamHistoryModal)
        try:
            stats = service.get_exam_stats(exam.id)
            # Alias present_count to marked_present for frontend compatibility
            stats["marked_present"] = stats.get("present_count", 0)
            stats["completed"] = stats.get("completed_count", 0)
            stats["avg_score"] = stats.get("average_score", 0)
            exam_dict["stats"] = stats
        except Exception:
            # Fallback if stats fail
            exam_dict["stats"] = {
                "total_assigned": len(exam.assigned_users or []),
                "present_count": 0,
                "marked_present": 0,
                "completed": 0,
                "avg_score": 0
            }
            
        result.append(exam_dict)
    
    return result


@router.get("/scheduled/user/{user_email}")
async def get_user_scheduled_exams(
    user_email: str,
    db: Session = Depends(get_db)
):
    """
    Get scheduled exams assigned to a specific user with batch-specific timing.

    Features:
    - Filters out draft exams (only shows published)
    - Respects scheduled_publish_at (hides exams until publish time)
    - Shows batch-specific timing, date, location, supervisor if configured
    - Each user only sees their own batch details

    This ensures each user sees their correct exam start time based on their batch.
    """
    service = AssessmentService(db)
    exams = service.get_scheduled_exams_for_user(user_email)

    result = []
    current_datetime = datetime.utcnow()

    for exam in exams:
        exam_dict = exam.to_dict() if hasattr(exam, 'to_dict') else dict(exam)

        # Filter by exam_status: Only show published exams
        exam_status = exam_dict.get('exam_status') or exam_dict.get('examStatus', 'published')
        if exam_status == 'draft':
            continue  # Skip draft exams

        # Filter by scheduled_publish_at: Only show if publish time has passed
        scheduled_publish_at = exam_dict.get('scheduled_publish_at') or exam_dict.get('scheduledPublishAt')
        if scheduled_publish_at:
            if isinstance(scheduled_publish_at, str):
                try:
                    scheduled_publish_at = datetime.fromisoformat(scheduled_publish_at.replace('Z', '+00:00'))
                except:
                    pass  # If parsing fails, show the exam
            if isinstance(scheduled_publish_at, datetime):
                if current_datetime < scheduled_publish_at:
                    continue  # Skip exams not yet published

        # Check if exam has batch assignments
        batch_assignments = exam_dict.get('batch_assignments') or exam_dict.get('batchAssignments') or []

        if batch_assignments and len(batch_assignments) > 0:
            # Find which batch this user is assigned to
            user_batch = None
            for batch in batch_assignments:
                batch_users = batch.get('users', [])
                if user_email in batch_users:
                    user_batch = batch
                    break

            if user_batch:
                # Override exam fields with user's batch-specific configuration
                exam_dict['exam_time'] = user_batch.get('startTime', exam_dict.get('exam_time'))
                exam_dict['exam_date'] = user_batch.get('date', exam_dict.get('exam_date'))
                exam_dict['location'] = user_batch.get('location', exam_dict.get('location'))
                exam_dict['supervisor_email'] = user_batch.get('supervisorEmail', exam_dict.get('supervisor_email'))
                exam_dict['supervisor_name'] = user_batch.get('supervisorName', exam_dict.get('supervisor_name'))

                # Add batch metadata
                exam_dict['batch_number'] = user_batch.get('batchNumber', 1)
                exam_dict['batch_start_time'] = user_batch.get('startTime')
                exam_dict['batch_end_time'] = user_batch.get('endTime')
                exam_dict['batch_max_users'] = user_batch.get('maxUsers')
                exam_dict['is_batch_exam'] = True

                # If exam allows different questions per batch, override questions
                allow_different_questions = exam_dict.get('allow_different_questions_per_batch') or exam_dict.get('allowDifferentQuestionsPerBatch', False)
                if allow_different_questions and user_batch.get('questions'):
                    exam_dict['questions'] = user_batch.get('questions')
            else:
                # User is assigned to exam but not to any batch (shouldn't happen, but handle gracefully)
                exam_dict['is_batch_exam'] = False
        else:
            # No batch assignments - use default exam timing
            exam_dict['is_batch_exam'] = False

        result.append(exam_dict)

    return result


@router.get("/scheduled/{exam_id}")
async def get_scheduled_exam(
    exam_id: str,
    db: Session = Depends(get_db)
):
    """
    Get a specific scheduled exam.
    """
    service = AssessmentService(db)
    exam = service.get_scheduled_exam_by_id(exam_id)
    
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    
    return exam.to_dict() if hasattr(exam, 'to_dict') else dict(exam)


@router.post("/scheduled")
async def create_scheduled_exam(
    title: str = Form(...),
    description: str = Form(""),
    exam_date: str = Form(...),
    exam_time: str = Form(...),
    location: str = Form(...),
    # Batch System (new)
    batch_assignments: str = Form("[]"),
    number_of_batches: int = Form(1),
    # Legacy shift (optional, for backward compatibility)
    shift: str = Form(None),
    supervisor_email: str = Form(...),
    supervisor_name: str = Form(...),
    assigned_users: str = Form("[]"),
    questions: str = Form(...),
    time_limit_minutes: int = Form(30),
    passing_score: int = Form(70),
    created_by: str = Form("Admin"),
    # Enhanced Batch System & Visibility Controls (new)
    exam_status: str = Form("published"),  # "draft" or "published"
    scheduled_publish_at: str = Form(None),  # ISO datetime string
    allow_different_questions_per_batch: bool = Form(False),
    randomize_question_order: bool = Form(False),
    randomize_option_order: bool = Form(False),
    # Geofencing Parameters
    geofencing_enabled: bool = Form(False),
    geofencing_radius: int = Form(100),  # meters
    geofencing_latitude: float = Form(None),
    geofencing_longitude: float = Form(None),
    # PIN Check-in Parameters
    pin_enabled: bool = Form(False),
    pin_generation_minutes: int = Form(5),
    pin_validity_minutes: int = Form(30),
    db: Session = Depends(get_db)
):
    """
    Create a new scheduled exam with enhanced batch system.

    New Features:
    - Per-batch configuration (date, time, location, supervisor)
    - Draft/Published status with scheduled visibility
    - Optional different questions per batch
    - Randomize question and option order
    - Geofencing for location verification
    - PIN-based self check-in
    """
    service = AssessmentService(db)

    try:
        assigned_users_list = json.loads(assigned_users)
        questions_list = json.loads(questions)
        batch_assignments_list = json.loads(batch_assignments)
    except:
        raise HTTPException(status_code=400, detail="Invalid JSON format")

    # Parse scheduled_publish_at if provided
    scheduled_publish_datetime = None
    if scheduled_publish_at:
        try:
            scheduled_publish_datetime = datetime.fromisoformat(scheduled_publish_at.replace('Z', '+00:00'))
        except:
            logger.warning(f"Invalid scheduled_publish_at format: {scheduled_publish_at}")

    exam_data = {
        "id": f"exam_{uuid.uuid4().hex[:8]}",
        "title": title,
        "description": description,
        "exam_date": exam_date,
        "exam_time": exam_time,
        "location": location,
        "shift": shift,  # Legacy - can be None
        "number_of_batches": number_of_batches,
        "batch_assignments": batch_assignments_list,
        "supervisor_email": supervisor_email,
        "supervisor_name": supervisor_name,
        "assigned_users": assigned_users_list,
        "questions": questions_list,
        "time_limit_minutes": time_limit_minutes,
        "passing_score": passing_score,
        "created_by": created_by,
        # Enhanced fields
        "exam_status": exam_status,
        "scheduled_publish_at": scheduled_publish_datetime,
        "allow_different_questions_per_batch": allow_different_questions_per_batch,
        "randomize_question_order": randomize_question_order,
        "randomize_option_order": randomize_option_order,
        # Geofencing fields
        "geofencing_enabled": geofencing_enabled,
        "geofencing_radius": geofencing_radius,
        "geofencing_latitude": geofencing_latitude,
        "geofencing_longitude": geofencing_longitude,
        # PIN fields
        "pin_enabled": pin_enabled,
        "pin_generation_minutes": pin_generation_minutes,
        "pin_validity_minutes": pin_validity_minutes,
    }

    try:
        exam = service.create_scheduled_exam(exam_data)
        logger.info(f"Scheduled exam created: {exam_data['id']} - Status: {exam_status}, Batches: {number_of_batches}")
        return exam.to_dict() if hasattr(exam, 'to_dict') else dict(exam)
    except Exception as e:
        logger.error(f"Scheduled exam creation failed: {e}")
        raise



@router.get("/scheduled/{exam_id}/attendance")
async def get_exam_attendance(
    exam_id: str,
    db: Session = Depends(get_db)
):
    """
    Get attendance list for a scheduled exam.
    """
    service = AssessmentService(db)
    attendance = service.get_exam_attendance(exam_id)
    
    result = []
    for record in attendance:
        record_dict = record.to_dict() if hasattr(record, 'to_dict') else dict(record)
        result.append(record_dict)
    
    return result


@router.post("/scheduled/{exam_id}/mark-present")
async def mark_user_present(
    exam_id: str,
    user_email: str = Form(...),
    marked_by: str = Form(...),
    db: Session = Depends(get_db)
):
    """
    Mark a user as present for the exam (supervisor action).
    """
    service = AssessmentService(db)
    
    try:
        result = service.mark_user_present(exam_id, user_email, marked_by)
        logger.info(f"User marked present: {user_email} for {exam_id}")
        return result
    except Exception as e:
        logger.error(f"Mark present failed: {e}")
        raise


@router.post("/scheduled/{exam_id}/mark-absent")
async def mark_user_absent(
    exam_id: str,
    user_email: str = Form(...),
    marked_by: str = Form(...),
    db: Session = Depends(get_db)
):
    """
    Mark a user as absent for the exam.
    """
    service = AssessmentService(db)
    
    try:
        result = service.mark_user_absent(exam_id, user_email, marked_by)
        logger.info(f"User marked absent: {user_email} for {exam_id}")
        return result
    except Exception as e:
        logger.error(f"Mark absent failed: {e}")
        raise


@router.post("/scheduled/{exam_id}/start")
async def start_scheduled_exam(
    exam_id: str,
    user_email: str = Form(...),
    db: Session = Depends(get_db)
):
    """
    User starts the scheduled exam (after being marked present).
    """
    service = AssessmentService(db)
    
    try:
        result = service.start_exam_for_user(exam_id, user_email)
        logger.info(f"Exam started: {user_email} for {exam_id}")
        return result
    except Exception as e:
        logger.error(f"Exam start failed: {e}")
        raise


@router.post("/scheduled/{exam_id}/submit")
async def submit_scheduled_exam(
    exam_id: str,
    user_email: str = Form(...),
    user_name: str = Form(...),
    answers: str = Form(...),
    time_taken_seconds: int = Form(...),
    violations: int = Form(0),
    breach_log: str = Form("[]"),
    db: Session = Depends(get_db)
):
    """
    Submit a scheduled exam.
    """
    service = AssessmentService(db)
    
    try:
        answers_list = json.loads(answers)
        breach_log_list = json.loads(breach_log)
    except:
        raise HTTPException(status_code=400, detail="Invalid JSON format")
    
    submission_data = {
        "user_email": user_email,
        "user_name": user_name,
        "answers": answers_list,
        "time_taken_seconds": time_taken_seconds,
        "violations": violations,
        "breach_log": breach_log_list,
    }
    
    try:
        result = service.submit_scheduled_exam(exam_id, submission_data)
        logger.info(f"Scheduled exam submitted: {user_email} - {exam_id}")
        return result
    except Exception as e:
        logger.error(f"Scheduled exam submission failed: {e}")
        raise


@router.get("/scheduled/{exam_id}/report")
async def get_exam_report(
    exam_id: str,
    db: Session = Depends(get_db)
):
    """
    Get detailed report for a scheduled exam (admin view).
    """
    service = AssessmentService(db)
    
    try:
        report = service.get_exam_report(exam_id)
        return report
    except Exception as e:
        logger.error(f"Exam report failed: {e}")
        raise


@router.delete("/scheduled/{exam_id}")
async def delete_scheduled_exam(
    exam_id: str,
    db: Session = Depends(get_db)
):
    """
    Delete a scheduled exam.
    """
    service = AssessmentService(db)

    try:
        service.delete_scheduled_exam(exam_id)
        logger.info(f"Scheduled exam deleted: {exam_id}")
        return {"message": f"Exam {exam_id} deleted successfully"}
    except Exception as e:
        logger.error(f"Scheduled exam deletion failed: {e}")
        raise


# ==========================================
# GEOFENCING & PIN ENDPOINTS
# ==========================================

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate distance between two GPS coordinates using Haversine formula
    Returns distance in meters
    """
    # Convert decimal degrees to radians
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])

    # Haversine formula
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    c = 2 * asin(sqrt(a))

    # Radius of earth in meters
    r = 6371000

    return c * r


@router.post("/scheduled/{exam_id}/validate-location")
async def validate_user_location(
    exam_id: str,
    user_email: str = Form(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
    db: Session = Depends(get_db)
):
    """
    Validate if user is within geofence radius for the exam.

    Returns:
        - valid: bool - Whether user is within allowed radius
        - distance_meters: float - Actual distance from exam center
        - allowed_radius: int - Maximum allowed radius
    """
    try:
        service = AssessmentService(db)
        exam = service.get_scheduled_exam(exam_id)

        if not exam:
            raise HTTPException(status_code=404, detail="Exam not found")

        # Check if geofencing is enabled
        if not exam.geofencing_enabled:
            logger.info(f"Geofencing not enabled for exam {exam_id}")
            return {
                "valid": True,
                "distance_meters": 0,
                "allowed_radius": 0,
                "message": "Geofencing not enabled"
            }

        # Check if exam has location coordinates
        if not exam.geofencing_latitude or not exam.geofencing_longitude:
            logger.warning(f"Exam {exam_id} has geofencing enabled but no coordinates")
            return {
                "valid": True,
                "distance_meters": 0,
                "allowed_radius": exam.geofencing_radius or 100,
                "message": "Exam coordinates not set"
            }

        # Calculate distance
        distance = haversine_distance(
            float(exam.geofencing_latitude),
            float(exam.geofencing_longitude),
            latitude,
            longitude
        )

        allowed_radius = exam.geofencing_radius or 100
        is_valid = distance <= allowed_radius

        logger.info(
            f"Geofencing check for {user_email} on exam {exam_id}: "
            f"distance={distance:.2f}m, allowed={allowed_radius}m, valid={is_valid}"
        )

        return {
            "valid": is_valid,
            "distance_meters": round(distance, 2),
            "allowed_radius": allowed_radius,
            "exam_latitude": float(exam.geofencing_latitude),
            "exam_longitude": float(exam.geofencing_longitude)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Geofencing validation error: {e}")
        raise HTTPException(status_code=500, detail=f"Validation failed: {str(e)}")


@router.post("/scheduled/{exam_id}/generate-pin")
async def generate_exam_pin(
    exam_id: str,
    batch_number: Optional[int] = Form(None),
    db: Session = Depends(get_db)
):
    """
    Generate a 4-digit PIN for exam check-in.
    This would typically be called by a scheduler X minutes before exam start.

    Returns:
        - pin: str - 4-digit PIN
        - valid_until: datetime - When PIN expires
        - batch_number: int - Batch number (if applicable)
    """
    try:
        service = AssessmentService(db)
        exam = service.get_scheduled_exam(exam_id)

        if not exam:
            raise HTTPException(status_code=404, detail="Exam not found")

        # Check if PIN feature is enabled
        if not exam.pin_enabled:
            raise HTTPException(status_code=400, detail="PIN feature not enabled for this exam")

        # Generate random 4-digit PIN
        pin = str(random.randint(1000, 9999))

        # Calculate expiry time
        validity_minutes = exam.pin_validity_minutes or 30
        valid_until = datetime.utcnow() + timedelta(minutes=validity_minutes)

        # Update exam with generated PIN
        exam.generated_pin = pin
        exam.pin_generated_at = datetime.utcnow()
        db.commit()

        logger.info(f"Generated PIN {pin} for exam {exam_id}, valid until {valid_until}")

        return {
            "pin": pin,
            "generated_at": exam.pin_generated_at.isoformat(),
            "valid_until": valid_until.isoformat(),
            "validity_minutes": validity_minutes,
            "batch_number": batch_number
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"PIN generation error: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"PIN generation failed: {str(e)}")


@router.get("/scheduled/{exam_id}/pin-status")
async def get_exam_pin_status(
    exam_id: str,
    db: Session = Depends(get_db)
):
    """
    Get PIN status for an exam (for supervisor/admin view).
    
    Returns:
        - pin_enabled: bool - Whether PIN feature is enabled
        - pin: str - Current PIN (if generated)
        - is_active: bool - Whether PIN is still valid (not expired)
        - valid_until: datetime - When PIN expires
        - time_remaining_seconds: int - Seconds until PIN expires
        - can_generate: bool - Whether exam time is within generation window
    """
    try:
        service = AssessmentService(db)
        exam = service.get_scheduled_exam(exam_id)

        if not exam:
            raise HTTPException(status_code=404, detail="Exam not found")

        if not exam.pin_enabled:
            return {
                "pin_enabled": False,
                "pin": None,
                "is_active": False,
                "valid_until": None,
                "time_remaining_seconds": 0,
                "can_generate": False,
                "message": "PIN feature not enabled for this exam"
            }

        # Calculate if we're within the generation window
        can_generate = True  # Supervisor/admin can always generate
        
        # Check if PIN exists and calculate validity
        is_active = False
        valid_until = None
        time_remaining_seconds = 0
        
        if exam.generated_pin and exam.pin_generated_at:
            validity_minutes = exam.pin_validity_minutes or 30
            valid_until = exam.pin_generated_at + timedelta(minutes=validity_minutes)
            now = datetime.utcnow()
            
            if now < valid_until:
                is_active = True
                time_remaining_seconds = int((valid_until - now).total_seconds())
        
        return {
            "pin_enabled": True,
            "pin": exam.generated_pin,
            "is_active": is_active,
            "generated_at": exam.pin_generated_at.isoformat() if exam.pin_generated_at else None,
            "valid_until": valid_until.isoformat() if valid_until else None,
            "time_remaining_seconds": time_remaining_seconds,
            "validity_minutes": exam.pin_validity_minutes or 30,
            "can_generate": can_generate,
            "message": "PIN is active" if is_active else ("PIN expired - regenerate" if exam.generated_pin else "No PIN generated yet")
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"PIN status check error: {e}")
        raise HTTPException(status_code=500, detail=f"Status check failed: {str(e)}")


@router.post("/scheduled/{exam_id}/validate-pin")
async def validate_exam_pin(
    exam_id: str,
    user_email: str = Form(...),
    pin: str = Form(...),
    batch_number: Optional[int] = Form(None),
    db: Session = Depends(get_db)
):
    """
    Validate PIN and mark user as present.

    Returns:
        - valid: bool - Whether PIN is correct and not expired
        - marked_present: bool - Whether user was successfully marked present
        - message: str - Success/error message
    """
    try:
        service = AssessmentService(db)
        exam = service.get_scheduled_exam(exam_id)

        if not exam:
            raise HTTPException(status_code=404, detail="Exam not found")

        # Check if PIN feature is enabled
        if not exam.pin_enabled:
            return {
                "valid": False,
                "marked_present": False,
                "message": "PIN feature not enabled for this exam"
            }

        # Check if PIN was generated
        if not exam.generated_pin or not exam.pin_generated_at:
            return {
                "valid": False,
                "marked_present": False,
                "message": "PIN not generated yet. Please ask your supervisor."
            }

        # Validate PIN
        if exam.generated_pin != pin:
            logger.warning(f"Invalid PIN attempt by {user_email} for exam {exam_id}")
            return {
                "valid": False,
                "marked_present": False,
                "message": "Incorrect PIN"
            }

        # Check if PIN is expired
        validity_minutes = exam.pin_validity_minutes or 30
        expiry_time = exam.pin_generated_at + timedelta(minutes=validity_minutes)

        if datetime.utcnow() > expiry_time:
            logger.warning(f"Expired PIN attempt by {user_email} for exam {exam_id}")
            return {
                "valid": False,
                "marked_present": False,
                "message": "PIN has expired. Please ask supervisor for a new PIN."
            }

        # PIN is valid - mark user as present
        from app.models.assessment import ExamAttendance

        # Check if attendance record exists
        attendance = db.query(ExamAttendance).filter(
            ExamAttendance.exam_id == exam_id,
            ExamAttendance.user_email == user_email
        ).first()

        if attendance:
            # Update existing record
            attendance.marked_present = True
            attendance.check_in_time = datetime.utcnow()
            attendance.check_in_method = "PIN"
        else:
            # Create new attendance record
            attendance = ExamAttendance(
                id=str(uuid.uuid4()),
                exam_id=exam_id,
                user_email=user_email,
                marked_present=True,
                check_in_time=datetime.utcnow(),
                check_in_method="PIN"
            )
            db.add(attendance)

        db.commit()

        logger.info(f"User {user_email} marked present for exam {exam_id} via PIN")

        return {
            "valid": True,
            "marked_present": True,
            "message": "You have been marked present! You can now start the exam.",
            "check_in_time": attendance.check_in_time.isoformat()
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"PIN validation error: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"PIN validation failed: {str(e)}")
