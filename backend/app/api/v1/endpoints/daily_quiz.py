"""
Daily Quiz Endpoints
Admin: Create (manual, AI topic, revision toggle), list, delete
Employee: Get today's quiz, submit answers
"""

import uuid
import json
import logging
from typing import Any, Dict
from datetime import datetime, date

from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.config.settings import settings
from app.core.dependencies import get_current_user
from app.models.daily_quiz import DailyQuiz, DailyQuizResponse
from app.models.notification import Notification
from app.models.content import Content
from app.models.user import User
from app.models.video_progress import VideoProgress

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/daily-quiz", tags=["Daily Quiz"])


# ─────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────

def _is_visible_to_user(quiz: DailyQuiz, user_email: str, user: User) -> bool:
    """Check if a daily quiz is targeted at this user."""
    # Check user list
    if quiz.assigned_users and user_email not in quiz.assigned_users:
        return False
    # Check role
    if quiz.assigned_roles and user and user.role not in quiz.assigned_roles:
        return False
    # Check store
    if quiz.assigned_stores and user and user.store not in quiz.assigned_stores:
        return False
    return True


def _groq_generate_questions(prompt: str, num_questions: int = 5) -> list:
    """Call Groq to generate MCQ questions. Returns list of question dicts."""
    try:
        from groq import Groq
        client = Groq(api_key=settings.GROQ_API_KEY)
        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a quiz question generator. "
                        "Return ONLY a valid JSON array, no markdown, no explanation. "
                        "Each object must have: question (string), options (array of 4 strings), correctIndex (0-3 integer)."
                    )
                },
                {"role": "user", "content": prompt}
            ],
            max_tokens=2000,
            temperature=0.7,
        )
        raw = response.choices[0].message.content.strip()
        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        questions = json.loads(raw)
        if not isinstance(questions, list):
            raise ValueError("Expected list")
        return questions[:num_questions]
    except Exception as e:
        logger.error(f"Groq quiz generation failed: {e}")
        raise HTTPException(status_code=500, detail=f"AI quiz generation failed: {str(e)}")


# ─────────────────────────────────────────────────────────────────
# ADMIN ENDPOINTS
# ─────────────────────────────────────────────────────────────────

@router.get("/admin/list")
def admin_list_quizzes(
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get all daily quizzes (admin view, most recent first)."""
    quizzes = db.query(DailyQuiz).order_by(DailyQuiz.created_at.desc()).all()
    return {"quizzes": [q.to_dict() for q in quizzes]}


@router.post("/admin/create")
def admin_create_quiz(
    body: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Create a daily quiz.
    body fields:
      title, mode (manual|ai_topic|revision), topic, difficulty, time_limit_minutes,
      questions (for manual), num_questions (for AI modes),
      quiz_date (YYYY-MM-DD, defaults to today),
      assigned_users, assigned_roles, assigned_stores,
      send_notification (bool, default True)
    """
    mode = body.get("mode", "manual")
    title = body.get("title", "Daily Quiz")
    difficulty = body.get("difficulty", "medium")
    time_limit = body.get("time_limit_minutes", 10)
    topic = body.get("topic", "")
    num_q = int(body.get("num_questions", 5))
    quiz_date = body.get("quiz_date") or date.today().isoformat()
    assigned_users = body.get("assigned_users", [])
    assigned_roles = body.get("assigned_roles", [])
    assigned_stores = body.get("assigned_stores", [])
    send_notif = body.get("send_notification", True)

    questions = []

    if mode == "manual":
        questions = body.get("questions", [])
        if not questions:
            raise HTTPException(status_code=400, detail="Manual mode requires questions array")

    elif mode == "ai_topic":
        if not topic:
            raise HTTPException(status_code=400, detail="ai_topic mode requires a topic")
        prompt = (
            f"Generate {num_q} multiple-choice quiz questions about: '{topic}'. "
            f"Difficulty: {difficulty}. "
            "Return valid JSON array only."
        )
        questions = _groq_generate_questions(prompt, num_q)

    elif mode == "revision":
        # ── PERSONALISED REVISION ────────────────────────────────────────
        # Fetch only the courses that the TARGETED users have actually completed.
        # If no specific users are targeted, use the quiz's role/store filters
        # to find all matching users and pool their completions.
        # ─────────────────────────────────────────────────────────────────

        # 1. Build the list of target user emails
        target_emails = list(assigned_users)  # explicit list from admin form

        if not target_emails and (assigned_roles or assigned_stores):
            # Find all users matching the role/store filter
            q = db.query(User.email)
            if assigned_roles:
                q = q.filter(User.role.in_(assigned_roles))
            if assigned_stores:
                q = q.filter(User.store.in_(assigned_stores))
            target_emails = [row[0] for row in q.all()]

        if not target_emails:
            # Fallback: use currently logged-in admin's completions
            target_emails = [current_user.get("email", "")]

        # 2. Find all course IDs that ANY of these users have completed
        completed_node_ids = (
            db.query(VideoProgress.node_id)
            .filter(
                VideoProgress.user_email.in_(target_emails),
                VideoProgress.completed == True
            )
            .distinct()
            .all()
        )
        completed_ids = [row[0] for row in completed_node_ids]

        # Also check UserNodeProgress table (used by career progression)
        from app.models.user import UserNodeProgress
        career_completed = (
            db.query(UserNodeProgress.node_id)
            .filter(
                UserNodeProgress.user_email.in_(target_emails),
                UserNodeProgress.completed == True
            )
            .distinct()
            .all()
        )
        completed_ids += [row[0] for row in career_completed]
        completed_ids = list(set(completed_ids))  # deduplicate

        if not completed_ids:
            raise HTTPException(
                status_code=400,
                detail="No completed courses found for the targeted users. "
                       "They must complete at least one course before a revision quiz can be generated."
            )

        # 3. Fetch content for those completed IDs
        watched_content = (
            db.query(Content)
            .filter(Content.id.in_(completed_ids))
            .all()
        )

        # 4. Build transcript context (prioritise transcript > description > title)
        content_texts = []
        for c in watched_content:
            text = c.transcript or c.description or ""
            if text:
                # Include the course title as context header
                content_texts.append(f"[{c.title}]:\n{text[:400]}")

        transcripts = "\n\n".join(content_texts)[:4000]

        if not transcripts:
            raise HTTPException(
                status_code=400,
                detail="Completed courses have no transcripts or descriptions to generate questions from."
            )

        logger.info(
            f"Revision quiz: generating {num_q} questions from {len(watched_content)} "
            f"completed courses for {len(target_emails)} user(s)."
        )

        prompt = (
            f"Based on the following training course content that employees have completed, "
            f"generate {num_q} multiple-choice revision questions to test their retention. "
            f"Difficulty: {difficulty}.\n\n"
            f"Training Content:\n{transcripts}\n\n"
            "Return valid JSON array only."
        )
        questions = _groq_generate_questions(prompt, num_q)
        title = title or "Today's Revision Quiz"

    quiz_id = f"dq_{uuid.uuid4().hex[:12]}"
    quiz = DailyQuiz(
        id=quiz_id,
        title=title,
        description=body.get("description", ""),
        mode=mode,
        topic=topic,
        difficulty=difficulty,
        time_limit_minutes=time_limit,
        questions=questions,
        assigned_users=assigned_users,
        assigned_roles=assigned_roles,
        assigned_stores=assigned_stores,
        quiz_date=quiz_date,
        is_active=True,
        created_by=current_user.get("email", "admin"),
    )
    db.add(quiz)

    # Send notification
    if send_notif:
        notif = Notification(
            id=f"notif_dq_{uuid.uuid4().hex[:10]}",
            title=f"📝 Daily Quiz: {title}",
            message=f"A new daily quiz is available for you! It has {len(questions)} questions ({difficulty} difficulty). Tap to start.",
            notification_type="quiz",
            is_crucial=True,
            priority="high",
            target_users=assigned_users,
            target_roles=assigned_roles,
            target_stores=assigned_stores,
            action_type="daily_quiz",
            extra_data={"quiz_id": quiz_id, "quiz_date": quiz_date},
            created_by=current_user.get("email", "admin"),
        )
        db.add(notif)
        quiz.notification_sent = True

    db.commit()
    return {"status": "success", "quiz": quiz.to_dict(), "questions_count": len(questions)}


@router.post("/admin/generate-ai-preview")
def admin_generate_preview(
    body: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Preview AI-generated questions without saving.
    """
    topic = body.get("topic", "")
    difficulty = body.get("difficulty", "medium")
    num_q = int(body.get("num_questions", 5))
    mode = body.get("mode", "ai_topic")

    if mode == "ai_topic":
        if not topic:
            raise HTTPException(status_code=400, detail="Topic required")
        prompt = (
            f"Generate {num_q} multiple-choice quiz questions about: '{topic}'. "
            f"Difficulty: {difficulty}. Return valid JSON array only."
        )
    else:
        # Revision preview — use the admin's own completed courses for the preview
        admin_email = current_user.get("email", "")

        completed_node_ids = (
            db.query(VideoProgress.node_id)
            .filter(VideoProgress.user_email == admin_email, VideoProgress.completed == True)
            .distinct().all()
        )
        from app.models.user import UserNodeProgress
        career_completed = (
            db.query(UserNodeProgress.node_id)
            .filter(UserNodeProgress.user_email == admin_email, UserNodeProgress.completed == True)
            .distinct().all()
        )
        completed_ids = list(set([r[0] for r in completed_node_ids] + [r[0] for r in career_completed]))

        if completed_ids:
            watched_content = db.query(Content).filter(Content.id.in_(completed_ids)).all()
        else:
            # Fallback for preview: use any 10 published courses
            watched_content = db.query(Content).filter(Content.is_published == True).limit(10).all()

        content_texts = []
        for c in watched_content:
            text = c.transcript or c.description or ""
            if text:
                content_texts.append(f"[{c.title}]:\n{text[:300]}")
        transcripts = "\n\n".join(content_texts)[:2500]

        if not transcripts:
            raise HTTPException(status_code=400, detail="No completed course content available for revision preview")

        prompt = (
            f"Based on the following training course content, generate {num_q} revision questions. "
            f"Difficulty: {difficulty}.\n\nTraining Content:\n{transcripts}\n\nReturn valid JSON array only."
        )

    questions = _groq_generate_questions(prompt, num_q)
    return {"questions": questions}


@router.delete("/admin/{quiz_id}")
def admin_delete_quiz(
    quiz_id: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Delete a daily quiz."""
    quiz = db.query(DailyQuiz).filter(DailyQuiz.id == quiz_id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    db.delete(quiz)
    db.commit()
    return {"status": "success"}


@router.put("/admin/{quiz_id}/toggle")
def admin_toggle_quiz(
    quiz_id: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Toggle quiz active/inactive."""
    quiz = db.query(DailyQuiz).filter(DailyQuiz.id == quiz_id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    quiz.is_active = not quiz.is_active
    db.commit()
    return {"status": "success", "is_active": quiz.is_active}


# ─────────────────────────────────────────────────────────────────
# EMPLOYEE ENDPOINTS
# ─────────────────────────────────────────────────────────────────

@router.get("/today")
def get_today_quiz(
    user_email: str,
    db: Session = Depends(get_db)
):
    """
    Get today's active daily quiz for this user.
    Returns the quiz + whether the user has already submitted.
    """
    today = date.today().isoformat()
    user = db.query(User).filter(User.email == user_email).first()

    # Get all active quizzes for today (or no date = always active)
    quizzes = db.query(DailyQuiz).filter(
        DailyQuiz.is_active == True,
        (DailyQuiz.quiz_date == today) | (DailyQuiz.quiz_date == None) | (DailyQuiz.quiz_date == "")
    ).order_by(DailyQuiz.created_at.desc()).all()

    # Filter by targeting
    visible = [q for q in quizzes if _is_visible_to_user(q, user_email, user)]

    if not visible:
        return {"quiz": None, "already_submitted": False, "message": "No quiz available for today"}

    quiz = visible[0]  # Most recent

    # Check if already submitted
    response = db.query(DailyQuizResponse).filter(
        DailyQuizResponse.quiz_id == quiz.id,
        DailyQuizResponse.user_email == user_email
    ).first()

    return {
        "quiz": quiz.to_dict(),
        "already_submitted": response is not None,
        "previous_response": response.to_dict() if response else None
    }


@router.get("/history")
def get_quiz_history(
    user_email: str,
    db: Session = Depends(get_db)
):
    """Get all daily quizzes and results for a user."""
    responses = db.query(DailyQuizResponse).filter(
        DailyQuizResponse.user_email == user_email
    ).order_by(DailyQuizResponse.submitted_at.desc()).all()

    result = []
    for r in responses:
        quiz = db.query(DailyQuiz).filter(DailyQuiz.id == r.quiz_id).first()
        result.append({
            **r.to_dict(),
            "quiz_title": quiz.title if quiz else "Unknown Quiz",
            "quiz_difficulty": quiz.difficulty if quiz else "medium",
        })
    return {"history": result}


@router.post("/submit/{quiz_id}")
def submit_quiz(
    quiz_id: str,
    body: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
):
    """
    Submit answers for a daily quiz.
    body: { user_email, answers: [int,...], time_taken_seconds: int }
    """
    user_email = body.get("user_email")
    answers = body.get("answers", [])
    time_taken = body.get("time_taken_seconds", 0)

    if not user_email:
        raise HTTPException(status_code=400, detail="user_email required")

    quiz = db.query(DailyQuiz).filter(DailyQuiz.id == quiz_id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    # Prevent duplicate submissions
    existing = db.query(DailyQuizResponse).filter(
        DailyQuizResponse.quiz_id == quiz_id,
        DailyQuizResponse.user_email == user_email
    ).first()
    if existing:
        return {"status": "already_submitted", "response": existing.to_dict()}

    # Score calculation
    questions = quiz.questions or []
    score = 0
    for i, q in enumerate(questions):
        if i < len(answers) and answers[i] == q.get("correctIndex"):
            score += 1

    total = len(questions)
    pass_threshold = 0.6  # 60% to pass
    passed = (score / total) >= pass_threshold if total > 0 else False

    resp = DailyQuizResponse(
        id=f"dqr_{uuid.uuid4().hex[:12]}",
        quiz_id=quiz_id,
        user_email=user_email,
        answers=answers,
        score=score,
        total=total,
        passed=passed,
        time_taken_seconds=time_taken,
    )
    db.add(resp)
    db.commit()

    return {
        "status": "success",
        "score": score,
        "total": total,
        "passed": passed,
        "percentage": round((score / total) * 100, 1) if total > 0 else 0,
        "response": resp.to_dict()
    }
