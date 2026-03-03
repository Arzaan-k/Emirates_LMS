"""
Assessment Endpoints
Proctored assessments, submissions, scheduled exams
"""

import uuid
import json
import logging
import random
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta, timezone
from math import radians, cos, sin, asin, sqrt

from fastapi import APIRouter, Depends, Form, File, UploadFile, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.config.database import get_db
from app.core.dependencies import get_current_user, require_admin
from app.core.access_filter import get_access_filter_context
from app.services.assessment_service import AssessmentService
from app.services.ai_service import AIService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/assessments", tags=["Assessments"])


class BulkDeleteScheduledExamsRequest(BaseModel):
    exam_ids: List[str]


# ==========================================
# PROCTORED ASSESSMENT ENDPOINTS
# ==========================================

@router.get("/proctored")
def get_proctored_assessments(
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user)
):
    """
    Get all active proctored assessments available to the current user.
    """
    service = AssessmentService(db)
    assessments = service.get_available_assessments_for_user(current_user)
    
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
    assigned_users: Optional[List[str]] = []
    assignment_filters: Optional[Dict[str, Any]] = {}

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
        "assigned_users": assessment_in.assigned_users or [],
        "assignment_filters": assessment_in.assignment_filters or {},
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
        "assigned_users": assessment_in.assigned_users or [],
        "assignment_filters": assessment_in.assignment_filters or {},
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
    answers: str = Form(...),  # JSON array
    breach_log: str = Form("[]"),
    time_taken_seconds: Optional[int] = Form(0),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Submit a proctored assessment attempt with detailed breach tracking.
    User identity is taken from the JWT token — not from form fields.
    """
    service = AssessmentService(db)

    try:
        answers_list = json.loads(answers)
        breach_log_list = json.loads(breach_log)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON format for answers or breach_log")

    user_email = current_user["email"]
    user_name = current_user.get("name") or current_user.get("email")

    try:
        result = service.submit_assessment(
            assessment_id=assessment_id,
            user_email=user_email,
            user_name=user_name,
            answers=answers_list,
            breach_log=breach_log_list,
            time_taken_seconds=time_taken_seconds or 0,
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
async def get_all_submissions(
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Get all assessment submissions (admin), scoped for the user.
    """
    service = AssessmentService(db)
    submissions = service.get_all_submissions()
    
    access_context = get_access_filter_context(db, current_user)
    is_superadmin = access_context.get('is_superadmin', False)
    accessible_emails = access_context.get('accessible_emails', set())
    viewer_email = access_context.get('viewer_email')

    result = []
    for submission in submissions:
        if not is_superadmin:
            if accessible_emails:
                if submission.user_email not in accessible_emails:
                    continue
            elif submission.user_email != viewer_email:
                continue

        submission_dict = submission.to_dict() if hasattr(submission, 'to_dict') else dict(submission)
        result.append(submission_dict)
    
    return result


@router.get("/submissions/assessment/{assessment_id}")
async def get_assessment_submissions(
    assessment_id: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Get submissions for a specific assessment, scoped to the user.
    """
    service = AssessmentService(db)
    submissions = service.get_assessment_submissions(assessment_id)
    
    access_context = get_access_filter_context(db, current_user)
    is_superadmin = access_context.get('is_superadmin', False)
    accessible_emails = access_context.get('accessible_emails', set())
    viewer_email = access_context.get('viewer_email')

    result = []
    for submission in submissions:
        if not is_superadmin:
            if accessible_emails:
                if submission.user_email not in accessible_emails:
                    continue
            elif submission.user_email != viewer_email:
                continue

        submission_dict = submission.to_dict() if hasattr(submission, 'to_dict') else dict(submission)
        result.append(submission_dict)
    
    return result


@router.get("/proctored/{assessment_id}/submissions")
async def get_proctored_assessment_submissions_alias(
    assessment_id: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Get submissions for a specific proctored assessment.
    Alias to match frontend route structure.
    """
    return await get_assessment_submissions(
        assessment_id=assessment_id,
        db=db,
        current_user=current_user
    )


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
    
    # Pre-fetch all stats to prevent N+1 DB queries
    exam_ids = [str(exam.id) for exam in exams if exam.id]
    bulk_stats = service.attendance_repo.get_all_aggregated_stats(exam_ids)
    
    result = []
    for exam in exams:
        exam_dict = exam.to_dict() if hasattr(exam, 'to_dict') else dict(exam)
        
        # Inject stats for Admin View (ExamHistoryModal)
        try:
            agg = bulk_stats.get(str(exam.id), {
                "total": 0, "present": 0, "absent": 0, 
                "completed": 0, "passed": 0, "avg_score": 0
            })
            total_assigned = len(exam.assigned_users or [])
            
            present = agg['present']
            completed = agg['completed']
            passed = agg['passed']
            absent = agg['absent']
            avg_score = agg['avg_score']
            
            stats = {
                "total_assigned": total_assigned,
                "present_count": present,
                "marked_present": present,
                "marked_absent": absent,
                "completed_count": completed,
                "completed": completed,
                "passed_count": passed,
                "failed_count": completed - passed,
                "attendance_rate": round((present / total_assigned * 100) if total_assigned > 0 else 0, 1),
                "completion_rate": round((completed / present * 100) if present > 0 else 0, 1),
                "pass_rate": round((passed / completed * 100) if completed > 0 else 0, 1),
                "average_score": round(avg_score, 1),
            }
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

    # Pre-fetch attendance for this user to avoid N+1 queries
    from app.models.assessment import ExamAttendance
    exam_ids = [e.id for e in exams]
    attendances = []
    if exam_ids:
        attendances = db.query(ExamAttendance).filter(
            ExamAttendance.user_email == user_email,
            ExamAttendance.exam_id.in_(exam_ids)
        ).all()
    
    attendance_map = {a.exam_id: a for a in attendances}

    result = []
    current_datetime_utc = datetime.now(timezone.utc)
    current_datetime_local = datetime.now()

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
                # If datetime is timezone-aware, compare in UTC.
                # If it's naive (common DB storage), compare in local server time.
                if scheduled_publish_at.tzinfo is not None:
                    if current_datetime_utc < scheduled_publish_at.astimezone(timezone.utc):
                        continue  # Skip exams not yet published
                else:
                    if current_datetime_local < scheduled_publish_at:
                        continue  # Skip exams not yet published

        # Check if exam has batch assignments
        batch_assignments = exam_dict.get('batch_assignments') or exam_dict.get('batchAssignments') or []

        if batch_assignments and len(batch_assignments) > 0:
            # Find which batch this user is assigned to
            user_batch = None
            for batch in batch_assignments:
                batch_users = batch.get('users', [])
                for u in batch_users:
                    candidate_email = u.get('email') if isinstance(u, dict) else u
                    if str(candidate_email or '').strip().lower() == str(user_email or '').strip().lower():
                        user_batch = batch
                        break
                if user_batch:
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

        # Inject Attendance Status
        attendance = attendance_map.get(exam.id)
        marked_present = attendance.marked_present if attendance else False
        has_completed = attendance.completed if attendance else False
        
        exam_dict['marked_present'] = marked_present
        exam_dict['has_completed'] = has_completed
        
        # 'can_start' logic: 
        # 1. Must be marked present
        # 2. Must not be completed
        # 3. Can add time check if needed, but 'marked_present' usually implies time is valid or supervisor allowed it
        exam_dict['can_start'] = marked_present and not has_completed

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
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Get attendance list for a scheduled exam, scoped to users the accessor can see.
    """
    service = AssessmentService(db)
    attendance = service.get_exam_attendance(exam_id)
    
    access_context = get_access_filter_context(db, current_user)
    is_superadmin = access_context.get('is_superadmin', False)
    accessible_emails = access_context.get('accessible_emails', set())
    viewer_email = access_context.get('viewer_email')

    result = []
    for record in attendance:
        if not is_superadmin:
            if accessible_emails:
                if record.user_email not in accessible_emails:
                    continue
            elif record.user_email != viewer_email:
                continue

        record_dict = record.to_dict() if hasattr(record, 'to_dict') else dict(record)
        result.append(record_dict)
    
    return result


@router.put("/scheduled/{exam_id}")
async def update_scheduled_exam(
    exam_id: str,
    title: str = Form(...),
    description: str = Form(""),
    exam_date: str = Form(...),
    exam_time: str = Form(...),
    location: str = Form(...),
    batch_assignments: str = Form("[]"),
    number_of_batches: int = Form(1),
    shift: str = Form(None),
    supervisor_email: str = Form(...),
    supervisor_name: str = Form(...),
    assigned_users: str = Form("[]"),
    questions: str = Form(...),
    time_limit_minutes: int = Form(30),
    passing_score: int = Form(70),
    created_by: str = Form("Admin"),
    exam_status: str = Form("published"),
    scheduled_publish_at: str = Form(None),
    allow_different_questions_per_batch: bool = Form(False),
    randomize_question_order: bool = Form(False),
    randomize_option_order: bool = Form(False),
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
    Update a scheduled exam.
    """
    service = AssessmentService(db)
    
    # Check if this is a toggle request (hack for frontend sometimes sending partial data)
    # Actually, toggle is separate? No, frontend might use PUT for everything.
    # But let's assume standard update logic.
    
    try:
        # Parse JSON fields
        try:
            assigned_users_list = json.loads(assigned_users)
            questions_list = json.loads(questions)
            batch_assignments_list = json.loads(batch_assignments)
        except:
             # Fallback if already dict (rare in Form)
            assigned_users_list = assigned_users if isinstance(assigned_users, list) else []
            questions_list = questions if isinstance(questions, list) else []
            batch_assignments_list = batch_assignments if isinstance(batch_assignments, list) else []

        # Parse date
        scheduled_publish_datetime = None
        if scheduled_publish_at and scheduled_publish_at != 'null':
             try:
                 scheduled_publish_datetime = datetime.fromisoformat(scheduled_publish_at.replace('Z', '+00:00'))
             except:
                 pass

        update_data = {
            "title": title,
            "description": description,
            "exam_date": exam_date,
            "exam_time": exam_time,
            "location": location,
            "batch_assignments": batch_assignments_list,
            "number_of_batches": number_of_batches,
            "shift": shift,
            "supervisor_email": supervisor_email,
            "supervisor_name": supervisor_name,
            "assigned_users": assigned_users_list,
            "questions": questions_list,
            "time_limit_minutes": time_limit_minutes,
            "passing_score": passing_score,
            "created_by": created_by,
            "exam_status": exam_status,
            "scheduled_publish_at": scheduled_publish_datetime,
            "allow_different_questions_per_batch": allow_different_questions_per_batch,
            "randomize_question_order": randomize_question_order,
            "randomize_option_order": randomize_option_order,
            "geofencing_enabled": geofencing_enabled,
            "geofencing_radius": geofencing_radius,
            "geofencing_latitude": geofencing_latitude,
            "geofencing_longitude": geofencing_longitude,
            "pin_enabled": pin_enabled,
            "pin_generation_minutes": pin_generation_minutes,
            "pin_validity_minutes": pin_validity_minutes,
        }
        
        exam = service.update_scheduled_exam(exam_id, update_data)
        logger.info(f"Scheduled exam updated: {exam_id}")
        
        return exam.to_dict() if hasattr(exam, 'to_dict') else dict(exam)
    except Exception as e:
        logger.error(f"Scheduled exam update failed: {e}")
        raise


@router.post("/scheduled/bulk-delete")
async def bulk_delete_scheduled_exams(
    payload: BulkDeleteScheduledExamsRequest,
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(require_admin),
):
    """Bulk delete scheduled exams (admin only)."""
    service = AssessmentService(db)

    try:
        result = service.bulk_delete_scheduled_exams(payload.exam_ids)
        logger.info(
            f"Bulk deleted scheduled exams: deleted={len(result.get('deleted', []))}, not_found={len(result.get('not_found', []))}"
        )
        return {"status": "success", **result}
    except Exception as e:
        logger.error(f"Bulk scheduled exam deletion failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))



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
    answers: str = Form(...),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Submit a scheduled exam.
    User identity is taken from the JWT token — not from form fields.
    """
    service = AssessmentService(db)

    try:
        answers_list = json.loads(answers)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON format for answers")

    user_email = current_user["email"]
    user_name = current_user.get("name") or current_user.get("email")

    try:
        result = service.submit_scheduled_exam(
            exam_id=exam_id,
            user_email=user_email,
            user_name=user_name,
            answers=answers_list,
        )
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
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Delete a scheduled exam.

    Authorization:
    - Superadmin/admin can delete any scheduled exam
    - Supervisor can delete exams where they are the supervisor
    """
    service = AssessmentService(db)

    try:
        exam = service.get_scheduled_exam_by_id(exam_id)

        is_admin = bool(user.get("is_superadmin", False) or user.get("has_admin_access", False))
        is_supervisor_owner = bool(exam.supervisor_email and exam.supervisor_email == user.get("email"))

        if not is_admin and not is_supervisor_owner:
            raise HTTPException(status_code=403, detail="Not authorized to delete this scheduled exam")

        service.delete_scheduled_exam(exam_id)
        logger.info(f"Scheduled exam deleted: {exam_id}")
        return {"status": "success", "message": f"Exam {exam_id} deleted successfully"}
    except Exception as e:
        logger.error(f"Scheduled exam deletion failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
        exam = service.get_scheduled_exam_by_id(exam_id)

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
    keep_old_pin: bool = Form(False),
    validity_minutes: Optional[int] = Form(None),
    db: Session = Depends(get_db)
):
    """
    Generate a 4-digit PIN for exam check-in.
    
    Args:
        keep_old_pin: If True, moves current PIN to active_pins list instead of overwriting.
        validity_minutes: Override default validity duration (e.g. 5 mins for regen).
    """
    try:
        service = AssessmentService(db)
        exam = service.get_scheduled_exam_by_id(exam_id)

        if not exam:
            raise HTTPException(status_code=404, detail="Exam not found")

        # Check if PIN feature is enabled
        if not exam.pin_enabled:
            raise HTTPException(status_code=400, detail="PIN feature not enabled for this exam")

        # Handle keeping old PIN
        active_pins = list(exam.active_pins) if exam.active_pins else []
        
        # Clean up expired pins from active_pins first
        now = datetime.utcnow()
        active_pins = [
            p for p in active_pins 
            if datetime.fromisoformat(p['valid_until']) > now
        ]

        if keep_old_pin and exam.generated_pin and exam.pin_generated_at:
            current_validity = exam.pin_validity_minutes or 30
            old_valid_until = exam.pin_generated_at + timedelta(minutes=current_validity)
            
            if old_valid_until > now:
                # Add current pin to active_pins
                active_pins.append({
                    "pin": exam.generated_pin,
                    "generated_at": exam.pin_generated_at.isoformat(),
                    "valid_until": old_valid_until.isoformat()
                })

        # Generate random 4-digit PIN
        pin = str(random.randint(1000, 9999))
        while pin == exam.generated_pin or any(p['pin'] == pin for p in active_pins):
             pin = str(random.randint(1000, 9999))

        # Update validity if provided
        if validity_minutes:
            exam.pin_validity_minutes = validity_minutes

        # Calculate expiry time
        final_validity = exam.pin_validity_minutes or 30
        valid_until = now + timedelta(minutes=final_validity)

        # Update exam with generated PIN and active_pins list
        exam.generated_pin = pin
        exam.pin_generated_at = now
        exam.active_pins = active_pins
        
        db.commit()

        logger.info(f"Generated PIN {pin} for exam {exam_id}, valid until {valid_until}")

        return {
            "pin": pin,
            "generated_at": exam.pin_generated_at.isoformat(),
            "valid_until": valid_until.isoformat(),
            "validity_minutes": validity_minutes,
            "batch_number": batch_number,
            "active_pins_count": len(active_pins)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"PIN generation error: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"PIN generation failed: {str(e)}")


@router.put("/scheduled/{exam_id}/toggle-pin")
async def toggle_exam_pin(
    exam_id: str,
    enabled: bool = Form(...),
    db: Session = Depends(get_db)
):
    """
    Toggle PIN feature for a scheduled exam.
    """
    try:
        service = AssessmentService(db)
        exam = service.get_scheduled_exam_by_id(exam_id)
        
        # Update pin_enabled status
        service.update_scheduled_exam(exam_id, {"pin_enabled": enabled})
        
        return {
            "status": "success", 
            "message": f"PIN feature {'enabled' if enabled else 'disabled'}",
            "pin_enabled": enabled
        }
    except Exception as e:
        logger.error(f"Toggle PIN failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
        exam = service.get_scheduled_exam_by_id(exam_id)

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
            # Handle potential string type from DB
            pin_gen_at = exam.pin_generated_at
            if isinstance(pin_gen_at, str):
                try:
                    pin_gen_at = datetime.fromisoformat(pin_gen_at)
                except:
                    logger.error(f"Invalid pin_generated_at format: {pin_gen_at}")
                    pin_gen_at = None

            if pin_gen_at:
                validity_minutes = exam.pin_validity_minutes or 30
                try:
                    valid_until = pin_gen_at + timedelta(minutes=validity_minutes)
                    now = datetime.utcnow()
                    
                    if now < valid_until:
                        is_active = True
                        time_remaining_seconds = int((valid_until - now).total_seconds())
                except Exception as e:
                    logger.error(f"Error calculating PIN validity: {e}")

        def safe_iso(val):
            if hasattr(val, 'isoformat'):
                return val.isoformat()
            return val

        return {
            "pin_enabled": True,
            "pin": exam.generated_pin,
            "active_pins": exam.active_pins or [],
            "is_active": is_active,
            "generated_at": safe_iso(exam.pin_generated_at) if exam.pin_generated_at else None,
            "valid_until": safe_iso(valid_until) if valid_until else None,
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
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    batch_number: Optional[int] = Form(None),
    db: Session = Depends(get_db)
):
    """
    Validate PIN and mark user as present. If geofencing is enabled, also validates location.

    Returns:
        - valid: bool - Whether PIN is correct and not expired
        - marked_present: bool - Whether user was successfully marked present
        - location_valid: bool - Whether location check passed (if enabled)
        - message: str - Success/error message
        - requires_override: bool - Whether supervisor override is needed
    """
    try:
        service = AssessmentService(db)
        exam = service.get_scheduled_exam_by_id(exam_id)

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

        # 1. Validate against latest PIN
        is_latest_valid = False
        if exam.generated_pin and exam.generated_pin == pin:
            validity_minutes = exam.pin_validity_minutes or 30
            if exam.pin_generated_at:
                expiry_time = exam.pin_generated_at + timedelta(minutes=validity_minutes)
                if datetime.utcnow() <= expiry_time:
                    is_latest_valid = True

        # 2. Validate against active_pins list
        is_alt_valid = False
        if not is_latest_valid and exam.active_pins:
            now = datetime.utcnow()
            for p in exam.active_pins:
                if p.get('pin') == pin:
                    # Check expiry
                    try:
                        valid_until = datetime.fromisoformat(p.get('valid_until'))
                        if now <= valid_until:
                            is_alt_valid = True
                            break
                    except:
                        pass

        if not (is_latest_valid or is_alt_valid):
            logger.warning(f"Invalid or expired PIN attempt by {user_email} for exam {exam_id}")
            return {
                "valid": False,
                "marked_present": False,
                "message": "Invalid or expired PIN"
            }

        # Check geofencing if enabled
        location_valid = True
        location_message = None
        requires_override = False

        if exam.geofencing_enabled and latitude is not None and longitude is not None:
            if exam.geofencing_latitude is None or exam.geofencing_longitude is None:
                logger.warning(f"Geofencing enabled but coordinates not set for exam {exam_id}")
                location_valid = True  # Allow if coordinates not configured
            else:
                # Calculate distance
                distance = haversine_distance(
                    float(exam.geofencing_latitude),
                    float(exam.geofencing_longitude),
                    latitude,
                    longitude
                )

                allowed_radius = exam.geofencing_radius or 100
                location_valid = distance <= allowed_radius

                if not location_valid:
                    logger.warning(
                        f"Location check failed for {user_email} on exam {exam_id}: "
                        f"distance={distance:.2f}m, allowed={allowed_radius}m"
                    )
                    location_message = (
                        f"You are {round(distance)}m away from the exam location. "
                        f"You must be within {allowed_radius}m to check-in. "
                        f"Contact your supervisor if you believe this is an error."
                    )
                    requires_override = True

                    return {
                        "valid": True,  # PIN is valid
                        "marked_present": False,  # But not marked due to location
                        "location_valid": False,
                        "distance_meters": round(distance, 2),
                        "allowed_radius": allowed_radius,
                        "message": location_message,
                        "requires_override": True
                    }

        # PIN is valid and location check passed (if enabled) - mark user as present
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

        logger.info(f"User {user_email} marked present for exam {exam_id} via PIN{' with location check' if exam.geofencing_enabled else ''}")

        return {
            "valid": True,
            "marked_present": True,
            "location_valid": location_valid,
            "requires_override": False,
            "message": "You have been marked present! You can now start the exam.",
            "check_in_time": attendance.check_in_time.isoformat()
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"PIN validation error: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"PIN validation failed: {str(e)}")


@router.post("/scheduled/{exam_id}/supervisor-override")
async def supervisor_override_location(
    exam_id: str,
    user_email: str = Form(...),
    supervisor_email: str = Form(...),
    override_reason: Optional[str] = Form("Supervisor manual override"),
    db: Session = Depends(get_db)
):
    """
    Allow supervisor to manually mark user as present, overriding location check failure.

    Returns:
        - success: bool
        - marked_present: bool
        - message: str
    """
    try:
        service = AssessmentService(db)
        exam = service.get_scheduled_exam_by_id(exam_id)

        if not exam:
            raise HTTPException(status_code=404, detail="Exam not found")

        # Verify supervisor authorization
        if exam.supervisor_email != supervisor_email:
            return {
                "success": False,
                "marked_present": False,
                "message": "Only the assigned supervisor can override attendance"
            }

        # Mark user as present with override flag
        from app.models.assessment import ExamAttendance

        attendance = db.query(ExamAttendance).filter(
            ExamAttendance.exam_id == exam_id,
            ExamAttendance.user_email == user_email
        ).first()

        if attendance:
            attendance.marked_present = True
            attendance.check_in_time = datetime.utcnow()
            attendance.check_in_method = "SUPERVISOR_OVERRIDE"
            attendance.override_reason = override_reason
        else:
            attendance = ExamAttendance(
                id=str(uuid.uuid4()),
                exam_id=exam_id,
                user_email=user_email,
                marked_present=True,
                check_in_time=datetime.utcnow(),
                check_in_method="SUPERVISOR_OVERRIDE",
                override_reason=override_reason
            )
            db.add(attendance)

        db.commit()

        logger.info(f"Supervisor {supervisor_email} manually marked {user_email} present for exam {exam_id}")

        return {
            "success": True,
            "marked_present": True,
            "message": f"User {user_email} has been manually marked present by supervisor",
            "check_in_time": attendance.check_in_time.isoformat()
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Supervisor override error: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Override failed: {str(e)}")
