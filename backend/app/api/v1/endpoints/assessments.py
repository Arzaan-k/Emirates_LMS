"""
Assessment Endpoints
Proctored assessments, submissions, scheduled exams
"""

import uuid
import json
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime

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
    Get scheduled exams assigned to a specific user.
    """
    service = AssessmentService(db)
    exams = service.get_scheduled_exams_for_user(user_email)
    
    result = []
    for exam in exams:
        exam_dict = exam.to_dict() if hasattr(exam, 'to_dict') else dict(exam)
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
    db: Session = Depends(get_db)
):
    """
    Create a new scheduled exam with batch assignments.
    """
    service = AssessmentService(db)
    
    try:
        assigned_users_list = json.loads(assigned_users)
        questions_list = json.loads(questions)
        batch_assignments_list = json.loads(batch_assignments)
    except:
        raise HTTPException(status_code=400, detail="Invalid JSON format")
    
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
    }
    
    try:
        exam = service.create_scheduled_exam(exam_data)
        logger.info(f"Scheduled exam created: {exam_data['id']} with {number_of_batches} batches")
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
