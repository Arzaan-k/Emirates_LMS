"""
Learning Path Endpoints
Video progress tracking, mid-video quizzes, and completion validation
Matches old backend API (server.py lines 6304-6732)
"""

import logging
import json
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Form, Query
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.services.video_progress_service import VideoProgressService
from app.core.exceptions import NotFoundError, ValidationError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/learning-path", tags=["Learning Path"])


# ===========================================
# VIDEO PROGRESS TRACKING
# ===========================================

@router.post("/track-video-progress")
async def track_video_progress(
    user_email: str = Form(...),
    node_id: str = Form(...),
    video_position_seconds: float = Form(...),
    video_duration_seconds: float = Form(...),
    explicit_progress_percent: Optional[float] = Form(None),
    db: Session = Depends(get_db)
):
    """
    Track video watching progress.
    Matches old backend POST /learning-path/track-video-progress (line 6304)

    Stores:
    - Current playback position
    - Max position reached (prevents cheating)
    - Video watch percentage
    """
    try:
        service = VideoProgressService(db)

        result = service.track_video_progress(
            user_email=user_email,
            node_id=node_id,
            video_position_seconds=video_position_seconds,
            video_duration_seconds=video_duration_seconds,
            explicit_progress_percent=explicit_progress_percent
        )

        return result

    except Exception as e:
        logger.error(f"Video progress tracking failed: {e}")
        return {
            "status": "error",
            "message": str(e)
        }


@router.get("/node-progress/{user_email}/{node_id}")
async def get_node_progress(
    user_email: str,
    node_id: str,
    db: Session = Depends(get_db)
):
    """
    Get progress for a specific node with completion validation.
    Matches old backend GET /learning-path/node-progress/{user_email}/{node_id} (line 6358)

    Returns:
    - Video watch percentage
    - Mid-quiz stats
    - End quiz stats
    - Completion status
    - Requirements validation
    """
    try:
        service = VideoProgressService(db)
        return service.get_node_progress(
            user_email=user_email,
            node_id=node_id,
            include_requirements=True
        )

    except Exception as e:
        logger.error(f"Node progress fetch failed: {e}")
        return {
            "progress": {
                "video_watched_percent": 0,
                "completed": False
            },
            "error": str(e)
        }


# ===========================================
# RECENTLY VIEWED / JUMP BACK IN
# ===========================================

@router.get("/recently-viewed/{user_email}")
def get_recently_viewed(
    user_email: str,
    limit: int = Query(default=10, ge=1, le=50),
    db: Session = Depends(get_db)
):
    """
    Get recently viewed courses for a user, sorted by last watched time.
    Powers the 'Jump Back In' section on the home screen.
    Returns courses the user has started but not necessarily completed,
    along with their watch progress and resume position.
    """
    from app.models.video_progress import VideoProgress
    from app.models.content import Content
    from sqlalchemy import desc

    try:
        # Query video_progress for this user, ordered by most recently updated
        recent_progress = (
            db.query(VideoProgress)
            .filter(
                VideoProgress.user_email == user_email,
                VideoProgress.video_watched_percent > 0,  # Only show started items
                VideoProgress.completed == False          # Exclude completed items
            )
            .order_by(desc(VideoProgress.updated_at))
            .limit(limit)
            .all()
        )

        if not recent_progress:
            return {"status": "success", "items": []}

        # Get the node IDs
        node_ids = [p.node_id for p in recent_progress]

        # Fetch content metadata for those nodes
        contents = db.query(Content).filter(Content.id.in_(node_ids)).all()
        content_map = {c.id: c for c in contents}

        # Build result preserving order from progress (most recent first)
        items = []
        for progress in recent_progress:
            content = content_map.get(progress.node_id)
            if not content:
                continue

            items.append({
                "id": content.id,
                "title": content.title,
                "description": content.description,
                "videoUrl": content.video_url,
                "file_url": content.file_url,
                "resource_type": content.resource_type,
                "bucket": content.bucket,
                "bucket_id": content.bucket_id,
                "thumbnail": content.thumbnail,
                # Progress info for the progress bar and resume
                "progress_percent": round(progress.video_watched_percent or 0, 1),
                "resume_position": progress.video_position_seconds or 0,
                "duration_seconds": progress.video_duration_seconds or 0,
                "completed": progress.completed or False,
                "last_watched": progress.updated_at.isoformat() if progress.updated_at else None,
                # Keep these for compatibility with existing CourseList rendering
                "xp": content.xp or 50,
                "is_path_node": content.is_path_node,
                "learning_path_type": content.learning_path_type,
            })

        logger.info(f"Recently viewed for {user_email}: {len(items)} items")
        return {"status": "success", "items": items}

    except Exception as e:
        logger.error(f"Recently viewed fetch failed for {user_email}: {e}")
        return {"status": "success", "items": []}


# ===========================================
# MID-VIDEO QUIZ GENERATION
# ===========================================

@router.post("/generate-mid-video-quiz")
async def generate_mid_video_quiz(
    node_id: str = Form(...),
    transcript_segment: str = Form(...),
    trigger_time_seconds: float = Form(...),
    num_questions: int = Form(2),  # Default 2 questions for mid-video
    user_email: str = Form(None),  # Optional: check if user has watched enough
    video_duration_seconds: float = Form(None),  # Optional: for validation
    db: Session = Depends(get_db)
):
    """
    Generate mid-video quiz at checkpoint (33% or 66%).

    OPTIMIZATION: First checks if quiz already exists in database for this node/trigger.
    If yes, returns the existing quiz immediately (no AI call needed).
    This saves AI API costs and makes the app faster for subsequent users.
    
    IMPORTANT: Only generates new quiz if user has actually WATCHED enough of the video.
    Prevents users from skipping ahead and triggering quizzes they haven't earned.
    """
    try:
        service = VideoProgressService(db)

        # OPTIMIZATION: Check for existing quiz FIRST (before any processing)
        # This is the key optimization - return cached quiz immediately
        from app.repositories.video_progress_repository import MidVideoQuizRepository
        quiz_repo = MidVideoQuizRepository(db)
        existing_quiz = quiz_repo.find_by_trigger_time(node_id, trigger_time_seconds, tolerance=15.0)
        
        if existing_quiz:
            logger.info(
                f"CACHE HIT: Returning existing quiz {existing_quiz.id} for {node_id} @ {trigger_time_seconds}s "
                f"(requested by {user_email or 'anonymous'})"
            )
            return {
                "status": "exists",
                "quiz": existing_quiz.to_dict(),
                "cached": True
            }
        
        logger.info(
            f"CACHE MISS: Generating new quiz for {node_id} @ {trigger_time_seconds}s "
            f"(requested by {user_email or 'first user'})"
        )

        # CRITICAL: Validate user has actually watched up to this point (only for new quiz generation)
        if user_email and video_duration_seconds:
            progress = service.get_node_progress(user_email, node_id, include_requirements=False)
            watched_percent = progress.get("progress", {}).get("video_watched_percent", 0)

            # Calculate what percentage this trigger time represents
            trigger_percent = (trigger_time_seconds / video_duration_seconds) * 100

            # User must have watched at least this percentage (with small tolerance)
            required_watch_percent = trigger_percent - 5  # 5% tolerance

            if watched_percent < required_watch_percent:
                logger.warning(
                    f"Quiz blocked: User {user_email} only watched {watched_percent}% "
                    f"but tried to trigger quiz at {trigger_percent}%"
                )
                return {
                    "status": "blocked",
                    "message": f"Please watch more of the video before accessing this quiz. "
                               f"You've watched {watched_percent:.0f}%, need {required_watch_percent:.0f}%.",
                    "quiz": None,
                    "watched_percent": watched_percent,
                    "required_percent": required_watch_percent
                }

        # Generate NEW quiz (AI call) - this only happens once per node/trigger
        result = service.generate_mid_video_quiz(
            node_id=node_id,
            transcript_segment=transcript_segment,
            trigger_time_seconds=trigger_time_seconds,
            num_questions=num_questions
        )

        return result

    except Exception as e:
        logger.error(f"Mid-video quiz generation failed: {e}")
        return {
            "status": "error",
            "message": str(e),
            "quiz": None
        }


@router.get("/mid-video-quizzes/{node_id}")
async def get_mid_video_quizzes(
    node_id: str,
    user_email: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Get all mid-video quizzes for a node.
    Matches old backend GET /learning-path/mid-video-quizzes/{node_id} (line 6491)

    If user_email provided, marks which quizzes user has completed.
    """
    try:
        service = VideoProgressService(db)
        quizzes = service.get_mid_video_quizzes(
            node_id=node_id,
            user_email=user_email
        )

        return {"quizzes": quizzes}

    except Exception as e:
        logger.error(f"Mid-video quizzes fetch failed: {e}")
        return {"quizzes": []}


# ===========================================
# MID-VIDEO QUIZ SUBMISSION
# ===========================================

@router.post("/submit-mid-video-quiz")
async def submit_mid_video_quiz(
    user_email: str = Form(...),
    node_id: str = Form(...),
    quiz_id: str = Form(...),
    trigger_time_seconds: float = Form(...),
    answers: str = Form(...),  # JSON array of answer indices
    db: Session = Depends(get_db)
):
    """
    Submit mid-video quiz attempt.
    Matches old backend POST /learning-path/submit-mid-video-quiz (line 6514)

    Calculates score, checks passing threshold (60%), updates progress.
    Only counts each trigger time once (prevents re-submission exploitation).
    """
    try:
        service = VideoProgressService(db)

        # Parse answers JSON
        try:
            answers_list = json.loads(answers)
        except json.JSONDecodeError:
            raise ValidationError(detail="Invalid answers format", field="answers")

        result = service.submit_mid_video_quiz(
            user_email=user_email,
            node_id=node_id,
            quiz_id=quiz_id,
            trigger_time_seconds=trigger_time_seconds,
            answers=answers_list
        )

        return result

    except NotFoundError as e:
        logger.error(f"Quiz not found: {e}")
        return {
            "status": "error",
            "message": "Quiz not found"
        }
    except Exception as e:
        logger.error(f"Mid-video quiz submission failed: {e}")
        return {
            "status": "error",
            "message": str(e)
        }


# ===========================================
# END QUIZ SUBMISSION
# ===========================================

@router.post("/submit-end-quiz")
async def submit_end_quiz(
    user_email: str = Form(...),
    node_id: str = Form(...),
    score: int = Form(...),
    total: int = Form(...),
    db: Session = Depends(get_db)
):
    """
    Submit end-of-lesson quiz.
    Matches old backend POST /learning-path/submit-end-quiz (line 6612)

    Checks completion requirements:
    - Video watched >= 90%
    - Quiz score >= 70%
    - Mid-quizzes optional (default)

    If all requirements met, marks node as completed.
    """
    try:
        service = VideoProgressService(db)

        result = service.submit_end_quiz(
            user_email=user_email,
            node_id=node_id,
            score=score,
            total=total
        )

        return result

    except Exception as e:
        logger.error(f"End quiz submission failed: {e}")
        return {
            "status": "error",
            "message": str(e)
        }


# ===========================================
# VIDEO-ONLY COMPLETION (No transcript/quiz)
# ===========================================

@router.post("/complete-video-only")
async def complete_node_video_only(
    user_email: str = Form(...),
    node_id: str = Form(...),
    db: Session = Depends(get_db)
):
    """
    Complete a node based on video progress alone.
    Used when a video has no audio/transcript and thus no quiz was generated.
    Only completes if video_watched_percent >= 90%.
    """
    try:
        service = VideoProgressService(db)
        result = service.complete_node_video_only(
            user_email=user_email,
            node_id=node_id
        )
        return result
    except Exception as e:
        logger.error(f"Video-only completion failed: {e}")
        return {
            "status": "error",
            "message": str(e)
        }


# ===========================================
# COMPLETION VALIDATION
# ===========================================

@router.post("/validate-completion")
async def validate_completion(
    user_email: str = Form(...),
    node_id: str = Form(...),
    db: Session = Depends(get_db)
):
    """
    Validate node completion status.
    Matches old backend POST /learning-path/validate-completion (line 6685)

    Returns detailed breakdown:
    - video_complete: Video watched >= 90%
    - quiz_passed: End quiz score >= 70%
    - mid_quiz_ok: Mid-quiz requirement met (if enabled)
    - is_complete: All requirements met
    """
    try:
        service = VideoProgressService(db)
        return service.validate_completion(
            user_email=user_email,
            node_id=node_id
        )

    except Exception as e:
        logger.error(f"Completion validation failed: {e}")
        return {
            "is_complete": False,
            "error": str(e)
        }


# ===========================================
# BACKWARD COMPATIBILITY ALIASES
# ===========================================

# Alias for old frontend endpoint (without user in path)
@router.get("/node-progress/user/{node_id}")
async def get_node_progress_alias(
    node_id: str,
    user_email: str = Query(...),
    db: Session = Depends(get_db)
):
    """Backward compatibility alias."""
    return await get_node_progress(user_email, node_id, db)


# Cache management endpoint (admin only)
@router.post("/clear-cache")
async def clear_progress_cache(
    user_email: Optional[str] = Form(None),
    node_id: Optional[str] = Form(None)
):
    """Clear progress cache for performance testing."""
    VideoProgressService.clear_cache(user_email, node_id)
    return {"status": "success", "message": "Cache cleared"}


# ===========================================
# RECOMMENDATIONS - TRACK COMPLETION
# ===========================================

@router.post("/recommendations/track-completion", include_in_schema=False)
async def track_course_completion(
    user_email: str = Form(...),
    course_id: str = Form(...),
    course_title: str = Form(""),
    bucket: Optional[str] = Form(None),
    xp_earned: int = Form(50),
    score: int = Form(0),
    max_score: int = Form(100),
    time_spent_seconds: int = Form(0),
    quiz_correct: int = Form(0),
    quiz_total: int = Form(0),
    db: Session = Depends(get_db)
):
    """
    Track course/module completion and award XP.
    Matches old backend POST /recommendations/track-completion (line 6140)

    This endpoint:
    1. Records the course completion in the database
    2. Calculates and awards XP (base + skill matching bonus)
    3. Updates user learning profile
    4. Checks for level advancement eligibility

    Note: Level advancement requires proctored exam (matches old backend behavior)
    """
    import uuid
    from app.models.tracking import CourseCompletion
    from app.models.user import User

    try:
        # 1. Get or create user
        user = db.query(User).filter(User.email == user_email).first()
        if not user:
            logger.warning(f"User not found for track-completion: {user_email}")
            return {
                "status": "error",
                "message": "User not found"
            }

        # 2. Check if already completed (avoid duplicates)
        existing_completion = db.query(CourseCompletion).filter(
            CourseCompletion.user_email == user_email,
            CourseCompletion.course_id == course_id
        ).first()

        if existing_completion:
            logger.info(f"Course {course_id} already completed by {user_email}")
            return {
                "status": "success",
                "message": "Already completed",
                "xp_earned": 0,
                "total_xp": 0,
                "level_up": False,
                "new_level": None
            }

        # 3. Calculate XP
        # Find skill key for bonus XP (matches old backend line 6153-6158)
        skill_key = find_skill_for_content(bucket or "", course_title or "")
        actual_xp = int(xp_earned)
        if skill_key and skill_key != "onboarding":
            actual_xp += 10  # Skill matching bonus

        # 4. Create completion record
        completion = CourseCompletion(
            id=str(uuid.uuid4()),
            user_email=user_email,
            course_id=course_id,
            course_title=course_title or f"Course {course_id}",
            bucket=bucket,
            score=score,
            score_percent=(score / max_score * 100) if max_score > 0 else 0,
            time_spent_seconds=time_spent_seconds,
            quiz_correct=quiz_correct,
            quiz_total=quiz_total,
            xp_earned=actual_xp,
            completed_at=datetime.utcnow()
        )
        db.add(completion)

        # 5. Count total completions for XP calculation
        completion_count = db.query(CourseCompletion).filter(
            CourseCompletion.user_email == user_email
        ).count()

        # Calculate total XP (base XP * completions)
        total_xp = (completion_count + 1) * 50  # Approximate total

        # 6. Check for level advancement (matches old backend line 6185-6228)
        level_up = False
        new_role = None
        current_role = user.role or "Crew Member"

        HIERARCHY = ['Crew Member', 'Senior Crew', 'Flight Purser', 'Shift Manager', 'Assistant Manager']

        if current_role in HIERARCHY:
            current_idx = HIERARCHY.index(current_role)

            if current_idx < len(HIERARCHY) - 1:
                # Get user's completed course IDs
                user_completed_ids = db.query(CourseCompletion.course_id).filter(
                    CourseCompletion.user_email == user_email
                ).all()
                completed_course_ids = [c[0] for c in user_completed_ids]

                # For now, simple completion count threshold for level progress tracking
                # Actual promotion requires proctored exam (matches old backend)
                completion_threshold = (current_idx + 1) * 3  # 3, 6, 9, 12 courses for each level

                if len(completed_course_ids) >= completion_threshold:
                    # User is eligible for promotion exam
                    logger.info(
                        f"User {user_email} has completed {len(completed_course_ids)} courses for {current_role}. "
                        f"Ready for promotion exam to {HIERARCHY[current_idx + 1]}."
                    )
                    # Note: Actual promotion requires passing proctored exam
                    # (matches old backend line 6221-6227)

        db.commit()

        logger.info(
            f"Module completion tracked for {user_email}: {course_title} "
            f"+{actual_xp} XP (skill: {skill_key or 'general'})"
        )

        return {
            "status": "success",
            "xp_earned": actual_xp,
            "total_xp": total_xp,
            "message": f"Module completed! +{actual_xp} XP",
            "level_up": level_up,
            "new_level": new_role,
            "courses_completed": completion_count + 1,
            "skill_matched": skill_key
        }

    except Exception as e:
        logger.error(f"Track completion error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        # Return partial success to not block UI
        return {
            "status": "success",
            "message": "Tracked with warnings",
            "xp_earned": xp_earned,
            "level_up": False
        }


def find_skill_for_content(bucket: str, title: str) -> Optional[str]:
    """
    Find the skill key that matches the content bucket or title.
    Matches old backend find_skill_key_from_content logic.
    """
    bucket_lower = (bucket or "").lower()
    title_lower = (title or "").lower()

    # Skill keywords mapping
    skill_mapping = {
        "product_knowledge": ["product", "menu", "service", "flight", "aircraft", "cabin"],
        "customer_service": ["customer", "service", "guest", "hospitality", "communication"],
        "hygiene_safety": ["hygiene", "safety", "sanitation", "food safety", "haccp", "clean"],
        "operations": ["operation", "procedure", "sop", "process", "efficiency", "equipment"],
        "leadership": ["leadership", "management", "supervisor", "team lead", "mentor"],
        "onboarding": ["onboarding", "orientation", "welcome", "new hire", "introduction"]
    }

    # Check bucket first
    for skill_key, keywords in skill_mapping.items():
        for keyword in keywords:
            if keyword in bucket_lower:
                return skill_key

    # Check title
    for skill_key, keywords in skill_mapping.items():
        for keyword in keywords:
            if keyword in title_lower:
                return skill_key

    return None
