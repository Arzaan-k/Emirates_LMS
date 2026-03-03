import logging
from typing import Dict, Any, List, Set
from sqlalchemy.orm import Session

from app.services.access_control_service import AccessControlService
from app.models.user import User, UserNodeProgress
from app.models.quiz import QuizSubmission
from app.models.daily_quiz import DailyQuizResponse
from app.models.assessment import AssessmentSubmission
from app.models.content import Content, CourseBucket

logger = logging.getLogger(__name__)

class AdminChatbotService:
    """Service to provide access-controlled data context for the Admin Copilot."""

    def __init__(self, db: Session):
        self.db = db
        self.access_control = AccessControlService(db)

    def get_context_for_admin(self, admin_email: str) -> Dict[str, Any]:
        """Fetch all data sections filtered by the admin's accessible users."""
        
        # 1. Get accessible user emails
        accessible_emails = self.access_control.get_accessible_user_emails(admin_email)
        accessible_emails_list = list(accessible_emails)
        
        if not accessible_emails_list:
            return {
                "user_data": "No accessible users found.",
                "learning_progress": "No data.",
                "quiz_data": "No data.",
                "daily_quiz_data": "No data.",
                "assessment_data": "No data.",
                "content_overview": self._get_content_overview(),
                "accessible_count": 0
            }

        # 2. Fetch specific data dimensions
        return {
            "user_data": self._get_user_data(accessible_emails_list),
            "learning_progress": self._get_learning_progress(accessible_emails_list),
            "quiz_data": self._get_quiz_data(accessible_emails_list),
            "daily_quiz_data": self._get_daily_quiz_data(accessible_emails_list),
            "assessment_data": self._get_assessment_data(accessible_emails_list),
            "content_overview": self._get_content_overview(),
            "accessible_count": len(accessible_emails_list)
        }

    def _get_user_data(self, emails: List[str]) -> str:
        """Fetch basic profile data for accessible users."""
        users = self.db.query(User).filter(User.email.in_(emails)).all()
        
        if not users:
            return "No user data found."
            
        lines = []
        for u in users:
            pd = u.profile_data or {}
            city = pd.get("City", "N/A")
            dept = pd.get("Department", "N/A")
            xp = getattr(u, "xp_points", getattr(u, "xp", 0))
            level = getattr(u, "level", "N/A")
            lines.append(
                f"- {u.name} ({u.email}): Role={u.role}, Store={u.store}, City={city}, Dept={dept}, XP={xp}, Level={level}"
            )
        return "\n".join(lines)

    def _get_learning_progress(self, emails: List[str]) -> str:
        """Fetch learning progress (Course completions, Video progress, UserNodeProgress) for accessible users."""
        from app.models.tracking import CourseCompletion
        from app.models.video_progress import VideoProgress
        
        progress_records = self.db.query(UserNodeProgress).filter(
            UserNodeProgress.user_email.in_(emails)
        ).all()
        
        completions = self.db.query(CourseCompletion).filter(
            CourseCompletion.user_email.in_(emails)
        ).all()
        
        video_progress = self.db.query(VideoProgress).filter(
            VideoProgress.user_email.in_(emails)
        ).all()
        
        user_stats = {}
        for email in emails:
            user_stats[email] = {
                "completed": 0, 
                "courses": 0,
                "videos": 0,
                "total_time": 0.0, 
                "scores": []
            }
                
        has_data = False
        
        # Process legacy node progress
        for p in progress_records:
            has_data = True
            email = p.user_email
            if email in user_stats:
                if p.completed:
                    user_stats[email]["completed"] += 1
                if p.time_spent_seconds:
                    user_stats[email]["total_time"] += p.time_spent_seconds
                if p.quiz_best_score is not None and p.quiz_best_score > 0:
                    user_stats[email]["scores"].append(p.quiz_best_score)
                    
        # Process course completions
        for c in completions:
            has_data = True
            email = c.user_email
            if email in user_stats:
                user_stats[email]["courses"] += 1
                if getattr(c, 'time_spent_seconds', 0):
                    user_stats[email]["total_time"] += c.time_spent_seconds
                if getattr(c, 'score_percent', None) is not None and getattr(c, 'score_percent') > 0:
                    user_stats[email]["scores"].append(c.score_percent)
                    
        # Process video progress
        for v in video_progress:
            has_data = True
            email = v.user_email
            if email in user_stats:
                if getattr(v, 'completed', False):
                    user_stats[email]["videos"] += 1
                if getattr(v, 'video_position_seconds', 0):
                    # We might want to use duration * watched percent, but position is most reliable for time spent
                    user_stats[email]["total_time"] += v.video_position_seconds
                if getattr(v, 'end_quiz_score', 0) > 0:
                    user_stats[email]["scores"].append(v.end_quiz_score)
        
        if not has_data:
            return "No learning progress found."
            
        lines = []
        for email, stats in user_stats.items():
            if stats["completed"] == 0 and stats["courses"] == 0 and stats["videos"] == 0 and stats["total_time"] == 0:
                continue
                
            avg_score = sum(stats["scores"]) / len(stats["scores"]) if stats["scores"] else 0
            time_mins = round(stats["total_time"] / 60, 1)
            total_items = stats["completed"] + stats["courses"] + stats["videos"]
            
            lines.append(
                f"- {email}: Completed {total_items} items (Courses/Videos), "
                f"Time spent: {time_mins} mins, Avg learning score: {round(avg_score, 1)}%"
            )
            
        return "\n".join(lines) if lines else "No learning progress found."

    def _get_quiz_data(self, emails: List[str]) -> str:
        """Fetch quiz submission data for accessible users."""
        submissions = self.db.query(QuizSubmission).filter(
            QuizSubmission.user_email.in_(emails)
        ).all()
        
        if not submissions:
            return "No quiz submissions found."
            
        user_stats = {}
        for s in submissions:
            email = s.user_email
            if email not in user_stats:
                user_stats[email] = {"attempts": 0, "passed": 0, "scores": []}
                
            user_stats[email]["attempts"] += 1
            if s.score is not None:
                user_stats[email]["scores"].append(s.score)
                if s.score >= 70:  # Assuming 70 is standard passing score
                    user_stats[email]["passed"] += 1
                    
        lines = []
        for email, stats in user_stats.items():
            avg_score = sum(stats["scores"]) / len(stats["scores"]) if stats["scores"] else 0
            lines.append(f"- {email}: {stats['attempts']} attempts, {stats['passed']} passed, Avg score: {round(avg_score, 1)}%")
            
        return "\n".join(lines)

    def _get_daily_quiz_data(self, emails: List[str]) -> str:
        """Fetch daily quiz data for accessible users."""
        responses = self.db.query(DailyQuizResponse).filter(
            DailyQuizResponse.user_email.in_(emails)
        ).all()
        
        if not responses:
            return "No daily quiz data found."
            
        user_stats = {}
        for r in responses:
            email = r.user_email
            if email not in user_stats:
                user_stats[email] = {"attempted": 0, "correct": 0}
                
            user_stats[email]["attempted"] += 1
            if r.is_correct:
                user_stats[email]["correct"] += 1
                
        lines = []
        for email, stats in user_stats.items():
            accuracy = (stats["correct"] / stats["attempted"] * 100) if stats["attempted"] > 0 else 0
            lines.append(f"- {email}: Answered {stats['attempted']} daily qs, {stats['correct']} correct, Accuracy: {round(accuracy, 1)}%")
            
        return "\n".join(lines)

    def _get_assessment_data(self, emails: List[str]) -> str:
        """Fetch proctored assessment data for accessible users."""
        submissions = self.db.query(AssessmentSubmission).filter(
            AssessmentSubmission.user_email.in_(emails)
        ).all()
        
        if not submissions:
            return "No assessment data found."
            
        user_stats = {}
        for s in submissions:
            email = s.user_email
            if email not in user_stats:
                user_stats[email] = {"attempts": 0, "passed": 0, "flagged": 0}
                
            user_stats[email]["attempts"] += 1
            if s.passed:
                user_stats[email]["passed"] += 1
            if s.integrity_status == "flagged":
                user_stats[email]["flagged"] += 1
                
        lines = []
        for email, stats in user_stats.items():
            lines.append(f"- {email}: {stats['attempts']} assessments, {stats['passed']} passed, {stats['flagged']} integrity flags")
            
        return "\n".join(lines)

    def _get_content_overview(self) -> str:
        """Fetch general content overview (not user-specific)."""
        courses_count = self.db.query(Content).filter(Content.is_published == True).count()
        buckets_count = self.db.query(CourseBucket).filter(CourseBucket.is_active == True).count()
        
        return f"Total active published courses: {courses_count}, Active course buckets: {buckets_count}"

    def build_context_string(self, context_dict: Dict[str, Any]) -> str:
        """Convert the context dictionary into a readable robust string for the LLM."""
        if context_dict.get("accessible_count", 0) == 0:
            return "No accessible user data available for this admin. They can only see general content stats.\n" + context_dict.get("content_overview", "")

        parts = [
            f"ADMIN ACCESSIBLE USERS COUNT: {context_dict['accessible_count']}\n",
            "--- USER PROFILES ---",
            context_dict["user_data"],
            "\n--- LEARNING PROGRESS ---",
            context_dict["learning_progress"],
            "\n--- QUIZ STATS ---",
            context_dict["quiz_data"],
            "\n--- DAILY QUIZ STATS ---",
            context_dict["daily_quiz_data"],
            "\n--- PROCTORED ASSESSMENTS ---",
            context_dict["assessment_data"],
            "\n--- GENERAL CONTENT OVERVIEW ---",
            context_dict["content_overview"]
        ]
        return "\n".join(parts)
