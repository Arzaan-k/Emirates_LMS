"""
Video Progress Service
Business logic for video progress tracking with in-memory caching
Matches old backend implementation (server.py lines 6305-6732)
"""

import logging
from typing import Dict, Any, Optional, List
from datetime import datetime
from functools import lru_cache

from sqlalchemy.orm import Session

from app.repositories.video_progress_repository import (
    VideoProgressRepository,
    MidVideoQuizRepository,
    MidVideoQuizAttemptRepository
)
from app.services.ai_service import AIService
from app.core.exceptions import NotFoundError, ValidationError

logger = logging.getLogger(__name__)

# Fixed completion requirements (90% video, 70% quiz, mid-quiz optional)
DEFAULT_REQUIREMENTS = {
    "video_watch_percent": 90,
    "quiz_pass_percent": 70,
    "mid_quiz_required": False,  # Optional to prevent blocking
    "mid_quiz_pass_percent": 60
}

# In-memory cache for frequently accessed progress (improves performance)
_progress_cache: Dict[str, Dict[str, Any]] = {}
_quiz_cache: Dict[str, List[Dict]] = {}


class VideoProgressService:
    """Service for video progress tracking and completion validation."""

    def __init__(self, db: Session):
        self.db = db
        self.progress_repo = VideoProgressRepository(db)
        self.quiz_repo = MidVideoQuizRepository(db)
        self.attempt_repo = MidVideoQuizAttemptRepository(db)
        self.ai_service = AIService()

    # ===========================================
    # VIDEO PROGRESS TRACKING
    # ===========================================

    def track_video_progress(
        self,
        user_email: str,
        node_id: str,
        video_position_seconds: float,
        video_duration_seconds: float,
        explicit_progress_percent: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Track video watching progress.
        Matches old backend POST /learning-path/track-video-progress (line 6304)

        CRITICAL FIX: Progress must NEVER decrease. We always keep the maximum
        of stored progress and any new progress sent.

        Args:
            user_email: User identifier
            node_id: Course/content identifier
            video_position_seconds: Current playback position
            video_duration_seconds: Total video length
            explicit_progress_percent: Frontend-calculated percentage (optional)

        Returns:
            Current progress snapshot with guaranteed non-decreasing percentage
        """
        cache_key = f"{user_email}:{node_id}"

        # Get existing progress FIRST to preserve stored values
        progress = self.progress_repo.get_by_user_and_node(user_email, node_id)

        # Get the existing stored percentage (this is the critical value to preserve)
        stored_percent = 0.0
        stored_max_position = 0.0
        if progress:
            stored_percent = progress.video_watched_percent or 0.0
            stored_max_position = progress.max_position_reached or 0.0

        if not progress:
            # Create new progress record with initial values
            progress_data = {
                "video_position_seconds": video_position_seconds,
                "video_duration_seconds": video_duration_seconds,
                "max_position_reached": video_position_seconds,
                "video_watched_percent": 0.0
            }
            progress = self.progress_repo.upsert_progress(user_email, node_id, progress_data)

        # Update current position (this is just for display, not for completion calculation)
        progress.video_position_seconds = video_position_seconds
        progress.video_duration_seconds = video_duration_seconds

        # Update max_position_reached (only increase, never decrease)
        new_max_position = max(stored_max_position, video_position_seconds)
        progress.max_position_reached = new_max_position

        # Calculate new percentage from this request
        if explicit_progress_percent is not None:
            # Frontend sent explicit percentage (more accurate - counts unique seconds)
            incoming_percent = min(100.0, float(explicit_progress_percent))
        else:
            # Fallback: calculate from max_position_reached
            if video_duration_seconds > 0:
                incoming_percent = min(100.0, (new_max_position / video_duration_seconds) * 100)
            else:
                incoming_percent = 0.0

        # CRITICAL: Progress can ONLY INCREASE, never decrease
        # Use the maximum of: stored value, incoming value
        final_percent = max(stored_percent, incoming_percent)
        progress.video_watched_percent = final_percent
        progress.updated_at = datetime.utcnow()

        self.db.commit()
        self.db.refresh(progress)

        # Update cache with final values
        _progress_cache[cache_key] = progress.to_dict()

        logger.info(
            f"Video progress: {user_email} - {node_id} | "
            f"stored={stored_percent:.1f}% incoming={incoming_percent:.1f}% final={final_percent:.1f}%"
        )

        return {
            "status": "success",
            "progress": progress.to_dict()
        }

    def get_node_progress(
        self,
        user_email: str,
        node_id: str,
        include_requirements: bool = True
    ) -> Dict[str, Any]:
        """
        Get progress for a specific node with validation.
        Matches old backend GET /learning-path/node-progress/{user_email}/{node_id} (line 6358)

        Returns:
            Progress data with completion validation
        """
        cache_key = f"{user_email}:{node_id}"

        # Try cache first
        if cache_key in _progress_cache and not include_requirements:
            return {"progress": _progress_cache[cache_key]}

        # Get from database
        progress = self.progress_repo.get_by_user_and_node(user_email, node_id)

        if not progress:
            # Return empty progress
            empty_progress = {
                "video_watched_percent": 0,
                "video_duration_seconds": 0,
                "video_position_seconds": 0,
                "max_position_reached": 0,
                "mid_quizzes_passed": 0,
                "mid_quizzes_total": 0,
                "mid_quizzes_completed": [],
                "end_quiz_score": 0.0,
                "end_quiz_passed": False,
                "end_quiz_attempts": 0,
                "completed": False,
                "completed_at": None
            }
            result = {"progress": empty_progress}
        else:
            result = {"progress": progress.to_dict()}
            _progress_cache[cache_key] = progress.to_dict()

        if include_requirements:
            # Check if this content has a transcript/quiz
            has_quiz = self._content_has_quiz(node_id)
            
            # Add completion validation
            requirements = DEFAULT_REQUIREMENTS.copy()
            # If no quiz exists (no transcript was generated), quiz is not required
            requirements["quiz_required"] = has_quiz
            
            progress_dict = progress.to_dict() if progress else empty_progress
            validation = self._validate_completion(progress_dict, requirements)
            result.update(validation)
            result["requirements"] = requirements
            result["has_quiz"] = has_quiz
            
            # Check feedback
            from app.models.notification import CourseSurvey, SurveyResponse, CourseFeedback
            feedback_submitted = False
            
            survey = self.db.query(CourseSurvey).filter(CourseSurvey.course_id == node_id, CourseSurvey.is_active == True).first()
            if survey:
                existing = self.db.query(SurveyResponse).filter(SurveyResponse.survey_id == survey.id, SurveyResponse.user_email == user_email).first()
                if existing:
                    feedback_submitted = True
            
            if not feedback_submitted:
                legacy = self.db.query(CourseFeedback).filter(CourseFeedback.course_id == node_id, CourseFeedback.user_email == user_email).first()
                if legacy:
                    feedback_submitted = True
                    
            result["feedback_submitted"] = feedback_submitted

        return result

    def _content_has_quiz(self, node_id: str) -> bool:
        """Check if a content node has a quiz (i.e., transcript was generated)."""
        try:
            from app.models.content import Content
            content = self.db.query(Content).filter(Content.id == node_id).first()
            if content and content.quiz:
                if isinstance(content.quiz, list) and len(content.quiz) > 0:
                    return True
            return False
        except Exception as e:
            logger.warning(f"Error checking content quiz for {node_id}: {e}")
            return True  # Default to requiring quiz on error (safe fallback)

    def complete_node_video_only(
        self,
        user_email: str,
        node_id: str
    ) -> Dict[str, Any]:
        """
        Complete a node based on video progress alone (no quiz required).
        Used when a video has no audio/transcript and thus no quiz was generated.
        
        Only completes if video_watched_percent >= required threshold.
        """
        progress = self.progress_repo.get_by_user_and_node(user_email, node_id)
        if not progress:
            progress = self.progress_repo.upsert_progress(user_email, node_id, {})
        
        current_video_percent = progress.video_watched_percent or 0
        video_complete = current_video_percent >= DEFAULT_REQUIREMENTS["video_watch_percent"]
        
        if not video_complete:
            return {
                "status": "error",
                "message": f"Video progress insufficient. Current: {current_video_percent:.0f}%, Required: {DEFAULT_REQUIREMENTS['video_watch_percent']}%",
                "result": {
                    "node_completed": False,
                    "video_complete": video_complete,
                    "current_video_percent": current_video_percent,
                    "is_complete": False
                }
            }
        
        # Mark as completed
        newly_completed = False
        if not progress.completed:
            progress.completed = True
            progress.completed_at = datetime.utcnow()
            # Set quiz as "passed" implicitly (no quiz needed)
            progress.end_quiz_passed = True
            progress.end_quiz_score = 100.0
            progress.updated_at = datetime.utcnow()
            self.db.commit()
            newly_completed = True
            
            logger.info(f"Course COMPLETED (video-only, no quiz): {user_email} - {node_id}")
            
            # Record in course_completions table for learning path advancement
            try:
                self._record_course_completion(user_email, node_id, 100.0)
            except Exception as e:
                logger.error(f"Failed to record video-only course completion: {e}")
        
        # Clear cache
        cache_key = f"{user_email}:{node_id}"
        _progress_cache.pop(cache_key, None)
        
        return {
            "status": "success",
            "result": {
                "node_completed": True,
                "video_complete": True,
                "current_video_percent": current_video_percent,
                "quiz_passed": True,
                "is_complete": True,
                "newly_completed": newly_completed,
                "message": "Course completed! (Video progress only)"
            }
        }

    # ===========================================
    # MID-VIDEO QUIZ GENERATION
    # ===========================================

    def generate_mid_video_quiz(
        self,
        node_id: str,
        transcript_segment: str,
        trigger_time_seconds: float,
        num_questions: int = 3
    ) -> Dict[str, Any]:
        """
        Generate mid-video quiz at checkpoint (33% or 66%).
        Matches old backend POST /learning-path/generate-mid-video-quiz (line 6411)

        Args:
            node_id: Course identifier
            transcript_segment: Transcript snippet around checkpoint
            trigger_time_seconds: When to trigger quiz in video
            num_questions: Number of questions to generate

        Returns:
            Quiz object with questions
        """
        # Check for existing quiz within ±10 seconds (prevents duplicates)
        existing_quiz = self.quiz_repo.find_by_trigger_time(node_id, trigger_time_seconds, tolerance=10.0)

        if existing_quiz:
            logger.info(f"Returning existing quiz for {node_id} @ {trigger_time_seconds}s")
            return {
                "status": "exists",  # Old backend uses "exists" for cached
                "quiz": existing_quiz.to_dict()
            }

        # Validate transcript
        if not transcript_segment or len(transcript_segment.strip()) < 50:
            return {
                "status": "error",
                "message": "Insufficient content for quiz generation",
                "quiz": None
            }

        try:
            # Generate questions using AI
            questions = self.ai_service.generate_quiz_from_transcript(
                transcript=transcript_segment,
                num_questions=num_questions,
                difficulty="easy"
            )

            # Store quiz in database
            quiz = self.quiz_repo.create_quiz(
                node_id=node_id,
                trigger_time=trigger_time_seconds,
                questions=questions,
                transcript=transcript_segment[:500]  # Store snippet
            )

            logger.info(f"Generated mid-video quiz: {quiz.id} for {node_id} @ {trigger_time_seconds}s")

            return {
                "status": "success",
                "quiz": quiz.to_dict()
            }

        except Exception as e:
            logger.error(f"Mid-video quiz generation failed: {e}")
            return {
                "status": "error",
                "message": str(e),
                "quiz": None
            }

    def get_mid_video_quizzes(
        self,
        node_id: str,
        user_email: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get all mid-video quizzes for a node.
        Matches old backend GET /learning-path/mid-video-quizzes/{node_id} (line 6491)

        If user_email provided, marks which quizzes user has completed.
        """
        # Get quizzes for node
        quizzes = self.quiz_repo.get_by_node(node_id)
        quiz_list = [q.to_dict() for q in quizzes]

        # If user specified, mark completed quizzes
        if user_email:
            progress = self.progress_repo.get_by_user_and_node(user_email, node_id)
            if progress and progress.mid_quizzes_completed:
                completed_times = progress.mid_quizzes_completed
                for quiz in quiz_list:
                    trigger_time = quiz["trigger_time_seconds"]
                    # Mark as completed if trigger time in completed list (±5 second tolerance)
                    quiz["completed"] = any(
                        abs(trigger_time - t) < 5.0 for t in completed_times
                    )
            else:
                for quiz in quiz_list:
                    quiz["completed"] = False

        return quiz_list

    # ===========================================
    # MID-VIDEO QUIZ SUBMISSION
    # ===========================================

    def submit_mid_video_quiz(
        self,
        user_email: str,
        node_id: str,
        quiz_id: str,
        trigger_time_seconds: float,
        answers: List[int]
    ) -> Dict[str, Any]:
        """
        Submit mid-video quiz attempt.
        Matches old backend POST /learning-path/submit-mid-video-quiz (line 6514)

        Args:
            user_email: User identifier
            node_id: Course identifier
            quiz_id: Quiz identifier
            trigger_time_seconds: When quiz was triggered
            answers: Array of selected answer indices

        Returns:
            Submission result with score and pass/fail status
        """
        # Get quiz
        quiz = self.quiz_repo.get_by_id(quiz_id)
        if not quiz:
            raise NotFoundError(resource="MidVideoQuiz", resource_id=quiz_id)

        # Calculate score
        questions = quiz.questions
        correct = 0
        total = len(questions)

        for i, answer_idx in enumerate(answers):
            if i < total and questions[i].get("correctIndex") == answer_idx:
                correct += 1

        score_percent = (correct / total * 100) if total > 0 else 0
        passed = score_percent >= DEFAULT_REQUIREMENTS["mid_quiz_pass_percent"]

        # Record attempt
        attempt = self.attempt_repo.record_attempt(
            user_email=user_email,
            node_id=node_id,
            quiz_id=quiz_id,
            trigger_time=trigger_time_seconds,
            score=correct,
            total=total,
            passed=passed,
            answers=answers
        )

        # Update user progress (only count each trigger time once)
        progress = self.progress_repo.get_by_user_and_node(user_email, node_id)
        if not progress:
            progress = self.progress_repo.upsert_progress(user_email, node_id, {})

        completed_times = progress.mid_quizzes_completed or []

        # Check if this trigger time already counted
        already_counted = any(abs(trigger_time_seconds - t) < 5.0 for t in completed_times)

        if not already_counted:
            # Increment totals
            progress.mid_quizzes_total += 1
            if passed:
                progress.mid_quizzes_passed += 1

            # Add trigger time to completed list
            completed_times.append(trigger_time_seconds)
            progress.mid_quizzes_completed = completed_times

            progress.updated_at = datetime.utcnow()
            self.db.commit()
            self.db.refresh(progress)

        logger.info(f"Mid-video quiz submitted: {user_email} - {quiz_id} ({score_percent}%)")

        return {
            "status": "success",
            "result": {
                "correct": correct,
                "total": total,
                "score_percent": score_percent,
                "passed": passed,
                "can_continue": True  # Always allow continuation (mid-quizzes are optional)
            }
        }

    # ===========================================
    # END QUIZ SUBMISSION
    # ===========================================

    def submit_end_quiz(
        self,
        user_email: str,
        node_id: str,
        score: int,
        total: int
    ) -> Dict[str, Any]:
        """
        Submit end-of-lesson quiz.
        OPTIMIZED: Reduced from 11s to <1s by removing unnecessary queries.

        Args:
            user_email: User identifier
            node_id: Course identifier
            score: Points scored
            total: Total points possible

        Returns:
            Submission result with completion status
        """
        # Calculate score percentage
        score_percent = (score / total * 100) if total > 0 else 0
        required_percent = DEFAULT_REQUIREMENTS["quiz_pass_percent"]
        passed = score_percent >= required_percent

        logger.info(
            f"Quiz submission: {user_email} - {node_id} | "
            f"score={score}/{total} ({score_percent:.1f}%) | "
            f"required={required_percent}% | passed={passed}"
        )

        # Get or create progress (FAST: single query)
        progress = self.progress_repo.get_by_user_and_node(user_email, node_id)
        if not progress:
            progress = self.progress_repo.upsert_progress(user_email, node_id, {})

        # Update end quiz stats
        progress.end_quiz_attempts += 1
        progress.end_quiz_score = max(progress.end_quiz_score, score_percent)  # Keep best score
        progress.end_quiz_passed = progress.end_quiz_passed or passed  # Once passed, always passed

        # Get current video progress
        current_video_percent = progress.video_watched_percent or 0

        # Quick completion check (avoid extra queries)
        video_complete = current_video_percent >= DEFAULT_REQUIREMENTS["video_watch_percent"]
        quiz_passed = progress.end_quiz_passed
        mid_quiz_ok = True  # Mid-quizzes are optional by default

        if DEFAULT_REQUIREMENTS.get("mid_quiz_required", False):
            if progress.mid_quizzes_total > 0:
                mid_pass_rate = (progress.mid_quizzes_passed / progress.mid_quizzes_total * 100)
                mid_quiz_ok = mid_pass_rate >= DEFAULT_REQUIREMENTS["mid_quiz_pass_percent"]
            else:
                mid_quiz_ok = False

        is_complete = video_complete and quiz_passed and mid_quiz_ok

        logger.info(
            f"Completion check: video={current_video_percent:.1f}% (need {DEFAULT_REQUIREMENTS['video_watch_percent']}%) | "
            f"video_ok={video_complete} | quiz_passed={quiz_passed} | mid_ok={mid_quiz_ok} | complete={is_complete}"
        )

        # Mark as completed if all requirements met
        newly_completed = False
        if is_complete and not progress.completed:
            progress.completed = True
            progress.completed_at = datetime.utcnow()
            newly_completed = True
            logger.info(f"Course COMPLETED: {user_email} - {node_id}")
            
            # CRITICAL FIX: Also record in course_completions table
            # This ensures ContentService.get_learning_path_content() detects the completion
            # and properly advances the scooter/unlocks the next node
            try:
                self._record_course_completion(user_email, node_id, score_percent)
            except Exception as e:
                logger.error(f"Failed to record course completion: {e}")
                # Don't fail the whole operation if completion record fails

        progress.updated_at = datetime.utcnow()

        # OPTIMIZATION: Single commit instead of commit + refresh
        self.db.commit()

        # Clear cache (async-safe)
        cache_key = f"{user_email}:{node_id}"
        _progress_cache.pop(cache_key, None)

        # Generate appropriate message
        if is_complete:
            message = "Course completed! 🎉"
        elif not passed:
            message = f"You scored {score_percent:.0f}%. You need {required_percent}% to pass."
        elif not video_complete:
            message = f"Quiz passed! Watch more video to complete ({current_video_percent:.0f}% / {DEFAULT_REQUIREMENTS['video_watch_percent']}% required)."
        else:
            message = "Keep trying!"

        return {
            "status": "success",
            "result": {
                "score": score,
                "total": total,
                "score_percent": score_percent,
                "passed": passed,
                "node_completed": progress.completed,
                "video_complete": video_complete,
                "current_video_percent": current_video_percent,  # Added for frontend reference
                "quiz_passed": quiz_passed,
                "mid_quiz_ok": mid_quiz_ok,
                "is_complete": is_complete,
                "newly_completed": newly_completed,
                "message": message
            }
        }

    # ===========================================
    # COMPLETION VALIDATION
    # ===========================================

    def validate_completion(
        self,
        user_email: str,
        node_id: str
    ) -> Dict[str, Any]:
        """
        Validate node completion status.
        Matches old backend POST /learning-path/validate-completion (line 6685)

        Returns:
            Detailed breakdown of completion requirements
        """
        progress = self.progress_repo.get_by_user_and_node(user_email, node_id)

        if not progress:
            return {
                "is_complete": False,
                "video_complete": False,
                "quiz_passed": False,
                "mid_quiz_ok": True,
                "requirements": DEFAULT_REQUIREMENTS,
                "progress": None
            }

        validation = self._validate_completion(progress.to_dict(), DEFAULT_REQUIREMENTS)
        validation["progress"] = progress.to_dict()
        validation["requirements"] = DEFAULT_REQUIREMENTS

        return validation

    def _check_completion(self, progress) -> Dict[str, bool]:
        """Internal method to check if all completion requirements met."""
        return self._validate_completion(progress.to_dict() if hasattr(progress, 'to_dict') else progress, DEFAULT_REQUIREMENTS)

    def _validate_completion(self, progress_dict: Dict, requirements: Dict) -> Dict[str, bool]:
        """Validate completion requirements."""
        # Check video requirement
        video_complete = progress_dict.get("video_watched_percent", 0) >= requirements["video_watch_percent"]

        # Check if quiz is required for this content
        # If quiz_required is False (no transcript → no quiz generated), skip quiz check
        quiz_required = requirements.get("quiz_required", True)
        
        if quiz_required:
            # Check end quiz requirement
            quiz_passed = progress_dict.get("end_quiz_passed", False)
        else:
            # No quiz exists for this content (no transcript/audio) → auto-pass
            quiz_passed = True

        # Check mid-quiz requirement (optional)
        mid_quiz_ok = True
        if quiz_required and requirements.get("mid_quiz_required", False):
            mid_total = progress_dict.get("mid_quizzes_total", 0)
            if mid_total > 0:
                mid_passed = progress_dict.get("mid_quizzes_passed", 0)
                mid_pass_rate = (mid_passed / mid_total * 100)
                mid_quiz_ok = mid_pass_rate >= requirements["mid_quiz_pass_percent"]
            else:
                mid_quiz_ok = False  # If required but none taken, not OK

        # Overall completion
        is_complete = video_complete and quiz_passed and mid_quiz_ok

        return {
            "video_complete": video_complete,
            "quiz_passed": quiz_passed,
            "mid_quiz_ok": mid_quiz_ok,
            "is_complete": is_complete,
            "quiz_required": quiz_required
        }

    # ===========================================
    # COMPLETION RECORDING (Syncs with learning path)
    # ===========================================

    def _record_course_completion(
        self,
        user_email: str,
        node_id: str,
        score_percent: float = 0.0
    ) -> None:
        """
        Record completion in course_completions table.
        This is CRITICAL for the learning path to detect completions
        and properly advance the scooter/unlock the next node.
        
        Also updates user_node_progress table.
        """
        import uuid
        from app.models.tracking import CourseCompletion
        from app.models.user import UserNodeProgress
        from app.models.content import Content
        
        # Check if already recorded (avoid duplicates)
        existing = self.db.query(CourseCompletion).filter(
            CourseCompletion.user_email == user_email,
            CourseCompletion.course_id == node_id
        ).first()
        
        if existing:
            logger.info(f"Completion already recorded for {user_email} - {node_id}")
            return
        
        # Get course details
        course = self.db.query(Content).filter(Content.id == node_id).first()
        course_title = course.title if course else f"Course {node_id}"
        bucket = course.bucket if course else None
        xp = course.xp if course else 50
        
        # Create completion record
        completion = CourseCompletion(
            id=str(uuid.uuid4()),
            user_email=user_email,
            course_id=node_id,
            course_title=course_title,
            bucket=bucket,
            score=score_percent,
            score_percent=score_percent,
            xp_earned=xp,
            completed_at=datetime.utcnow()
        )
        self.db.add(completion)
        
        # Also update user_node_progress for redundancy
        existing_progress = self.db.query(UserNodeProgress).filter(
            UserNodeProgress.user_email == user_email,
            UserNodeProgress.node_id == node_id
        ).first()
        
        if existing_progress:
            existing_progress.completed = True
            existing_progress.progress_percent = 100.0
            existing_progress.quiz_best_score = score_percent
            existing_progress.updated_at = datetime.utcnow()
        else:
            node_progress = UserNodeProgress(
                user_email=user_email,
                node_id=node_id,
                completed=True,
                progress_percent=100.0,
                quiz_best_score=score_percent
            )
            self.db.add(node_progress)
        
        logger.info(
            f"Recorded completion in course_completions & user_node_progress: "
            f"{user_email} - {node_id} (XP: {xp})"
        )
        
        # Check if external user has completed all merged levels and should transition to normal
        self._check_external_user_transition(user_email)

    def _check_external_user_transition(self, user_email: str) -> None:
        """
        For external users: check if they have completed ALL courses across
        all levels from the base level up to (and including) their joined_at_level.
        If so, automatically transition them to a normal user (is_external=False).
        """
        from app.models.user import User
        from app.models.tracking import CourseCompletion
        from app.repositories.content_repository import AccessRuleRepository, ProgressionLevelRepository
        
        try:
            user = self.db.query(User).filter(User.email == user_email).first()
            if not user or not getattr(user, 'is_external', False) or not getattr(user, 'joined_at_level', None):
                return
            
            # Get level hierarchy
            level_repo = ProgressionLevelRepository(self.db)
            all_levels = level_repo.get_all_ordered()
            if not all_levels:
                return
            
            hierarchy = [l.name for l in all_levels]
            joined_idx = -1
            for i, name in enumerate(hierarchy):
                if name.lower() == user.joined_at_level.lower():
                    joined_idx = i
                    break
            
            if joined_idx == -1:
                return
            
            # Get all courses from level 0 up to joined_at_level (inclusive)
            access_repo = AccessRuleRepository(self.db)
            all_required_courses = []
            for level_name in hierarchy[:joined_idx + 1]:
                rule = access_repo.get_by_level(level_name)
                if rule and rule.accessible_courses:
                    all_required_courses.extend(rule.accessible_courses)
            
            if not all_required_courses:
                return
            
            # Check completions
            completed_ids = set(
                row[0] for row in self.db.query(CourseCompletion.course_id).filter(
                    CourseCompletion.user_email == user_email,
                    CourseCompletion.course_id.in_(all_required_courses)
                ).all()
            )
            
            if completed_ids.issuperset(set(all_required_courses)):
                # All merged level courses completed - transition to normal user
                user.is_external = False
                user.joined_at_level = None
                self.db.commit()
                logger.info(
                    f"External user {user_email} completed all merged levels. "
                    f"Transitioned to normal user."
                )
        except Exception as e:
            logger.error(f"External user transition check failed for {user_email}: {e}")

    # ===========================================
    # CACHE MANAGEMENT
    # ===========================================

    @staticmethod
    def clear_cache(user_email: str = None, node_id: str = None):
        """Clear progress cache. If parameters provided, clear specific entry."""
        global _progress_cache, _quiz_cache

        if user_email and node_id:
            cache_key = f"{user_email}:{node_id}"
            if cache_key in _progress_cache:
                del _progress_cache[cache_key]
        elif user_email:
            # Clear all entries for user
            keys_to_delete = [k for k in _progress_cache.keys() if k.startswith(f"{user_email}:")]
            for key in keys_to_delete:
                del _progress_cache[key]
        else:
            # Clear entire cache
            _progress_cache = {}
            _quiz_cache = {}

        logger.info(f"Progress cache cleared: user={user_email}, node={node_id}")
