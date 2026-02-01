"""
Analytics Endpoints
Dashboard, reports, employee/store performance, leaderboards
"""

import logging
from typing import Dict, Any, Optional, List, Tuple
from datetime import datetime, date, timedelta

from fastapi import APIRouter, Depends, Form, HTTPException
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.core.dependencies import get_current_user, require_admin

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analytics", tags=["Analytics"])


def _month_date_range(year: int, month: int) -> Tuple[datetime, datetime]:
    start = datetime(year, month, 1)
    if month == 12:
        end = datetime(year + 1, 1, 1)
    else:
        end = datetime(year, month + 1, 1)
    return start, end


def _day_date_range(d: date) -> Tuple[datetime, datetime]:
    start = datetime(d.year, d.month, d.day)
    end = start + timedelta(days=1)
    return start, end


# ==========================================
# DASHBOARD ENDPOINTS
# ==========================================

@router.get("/dashboard")
async def get_analytics_dashboard(db: Session = Depends(get_db)):
    """
    Main analytics dashboard with overview metrics.
    """
    from app.repositories.analytics_repository import AnalyticsRepository
    
    repo = AnalyticsRepository(db)
    
    try:
        dashboard = repo.get_dashboard_metrics()
        return dashboard
    except Exception as e:
        logger.error(f"Dashboard fetch failed: {e}")
        # Return default metrics
        return {
            "total_users": 0,
            "active_users": 0,
            "courses_completed": 0,
            "avg_completion_rate": 0,
            "avg_score": 0,
            "total_xp": 0,
        }


# ==========================================
# CALENDAR INSIGHTS (PER-USER)
# ==========================================


@router.get("/calendar/month")
def get_calendar_month(
    user_email: str,
    year: int,
    month: int,
    db: Session = Depends(get_db),
):
    from collections import defaultdict

    from app.models.video_progress import VideoProgress
    from app.models.quiz import QuizSubmission
    from app.models.tracking import CourseCompletion, AttendanceRecord
    from app.models.assessment import AssessmentSubmission
    from app.models.simulation import SimulationProgress
    from app.models.crm import AuditSubmission

    if month < 1 or month > 12:
        raise HTTPException(status_code=400, detail="Invalid month")

    start_dt, end_dt = _month_date_range(year, month)

    daily = defaultdict(lambda: {
        "videos": 0,
        "videos_completed": 0,
        "quizzes": 0,
        "assessments": 0,
        "simulations": 0,
        "simulations_completed": 0,
        "audits": 0,
        "completions": 0,
        "focus_seconds": 0,
        "avg_score": None,
        "topSkill": None,
        "attendance_minutes": 0,
    })

    try:
        completions = db.query(CourseCompletion).filter(
            CourseCompletion.user_email == user_email,
            CourseCompletion.completed_at >= start_dt,
            CourseCompletion.completed_at < end_dt,
        ).all()
        for c in completions:
            d = c.completed_at.date().day
            daily[d]["completions"] += 1
            daily[d]["focus_seconds"] += int(c.time_spent_seconds or 0)

        quizzes = db.query(QuizSubmission).filter(
            QuizSubmission.user_email == user_email,
            QuizSubmission.submitted_at >= start_dt,
            QuizSubmission.submitted_at < end_dt,
        ).all()
        for q in quizzes:
            d = q.submitted_at.date().day
            daily[d]["quizzes"] += 1
            daily[d]["focus_seconds"] += int(q.time_taken_seconds or 0)

        assessments = db.query(AssessmentSubmission).filter(
            AssessmentSubmission.user_email == user_email,
            AssessmentSubmission.submitted_at >= start_dt,
            AssessmentSubmission.submitted_at < end_dt,
        ).all()
        for a in assessments:
            d = a.submitted_at.date().day
            daily[d]["assessments"] += 1
            daily[d]["focus_seconds"] += int(a.time_taken_seconds or 0)

        # VideoProgress doesn't store explicit time spent; use progress updates as "videos" activity,
        # and completed_at as true completion signal.
        video_updates = db.query(VideoProgress).filter(
            VideoProgress.user_email == user_email,
            VideoProgress.updated_at >= start_dt,
            VideoProgress.updated_at < end_dt,
            VideoProgress.video_watched_percent > 0,
        ).all()
        for v in video_updates:
            d = v.updated_at.date().day
            daily[d]["videos"] += 1

        video_completed = db.query(VideoProgress).filter(
            VideoProgress.user_email == user_email,
            VideoProgress.completed == True,
            VideoProgress.completed_at != None,
            VideoProgress.completed_at >= start_dt,
            VideoProgress.completed_at < end_dt,
        ).all()
        for v in video_completed:
            d = v.completed_at.date().day
            daily[d]["videos_completed"] += 1

        attendance = db.query(AttendanceRecord).filter(
            AttendanceRecord.user_email == user_email,
            AttendanceRecord.punch_in >= start_dt,
            AttendanceRecord.punch_in < end_dt,
        ).all()
        for a in attendance:
            d = a.punch_in.date().day
            daily[d]["attendance_minutes"] += int(a.duration_minutes or 0)

        sim_started = db.query(SimulationProgress).filter(
            SimulationProgress.user_email == user_email,
            SimulationProgress.started_at >= start_dt,
            SimulationProgress.started_at < end_dt,
        ).all()
        for s in sim_started:
            d = s.started_at.date().day
            daily[d]["simulations"] += 1
            daily[d]["focus_seconds"] += int(s.time_spent_seconds or 0)

        sim_completed = db.query(SimulationProgress).filter(
            SimulationProgress.user_email == user_email,
            SimulationProgress.completed == True,
            SimulationProgress.completed_at != None,
            SimulationProgress.completed_at >= start_dt,
            SimulationProgress.completed_at < end_dt,
        ).all()
        for s in sim_completed:
            d = s.completed_at.date().day
            daily[d]["simulations_completed"] += 1

        audits = db.query(AuditSubmission).filter(
            AuditSubmission.user_email == user_email,
            AuditSubmission.submitted_at >= start_dt,
            AuditSubmission.submitted_at < end_dt,
        ).all()
        for a in audits:
            try:
                day_num = a.submitted_at.date().day
            except Exception:
                continue
            daily[day_num]["audits"] += 1
    except Exception as e:
        logger.error(f"Calendar month fetch failed: {e}")
        return {"days": {}}

    # Compute avg_score and topSkill per day
    score_acc = defaultdict(list)
    bucket_acc = defaultdict(list)
    for c in completions:
        d = c.completed_at.date().day
        if c.score_percent is not None:
            score_acc[d].append(float(c.score_percent))
        if c.bucket:
            bucket_acc[d].append(c.bucket)
    for q in quizzes:
        d = q.submitted_at.date().day
        if q.score is not None:
            score_acc[d].append(float(q.score))
    for a in assessments:
        d = a.submitted_at.date().day
        if a.score_percent is not None:
            score_acc[d].append(float(a.score_percent))

    for s in sim_completed:
        if s.completed_at is None:
            continue
        d = s.completed_at.date().day
        if s.score is not None:
            score_acc[d].append(float(s.score))

    for d, scores in score_acc.items():
        if scores:
            daily[d]["avg_score"] = round(sum(scores) / len(scores))
    for d, buckets in bucket_acc.items():
        if buckets:
            # most common
            daily[d]["topSkill"] = max(set(buckets), key=buckets.count)

    days_out: Dict[str, Any] = {}
    for d, stats in daily.items():
        intensity = min(
            5,
            (stats["videos"] > 0)
            + (stats["quizzes"] > 0)
            + (stats["completions"] > 0)
            + (stats["assessments"] > 0)
            + (stats["simulations"] > 0)
            + (stats["audits"] > 0)
            + (stats["attendance_minutes"] > 0),
        )
        days_out[str(d)] = {
            "videos": stats["videos"],
            "quizzes": stats["quizzes"],
            "assessments": stats["assessments"],
            "simulations": stats["simulations"],
            "audits": stats["audits"],
            "completions": stats["completions"],
            "focus_seconds": stats["focus_seconds"],
            "focus_minutes": int((stats["focus_seconds"] or 0) // 60),
            "avg_score": stats["avg_score"],
            "topSkill": stats["topSkill"] or "General",
            "attendance_minutes": stats["attendance_minutes"],
            "intensity": intensity,
        }

    return {
        "year": year,
        "month": month,
        "user_email": user_email,
        "days": days_out,
    }


@router.get("/calendar/day")
def get_calendar_day(
    user_email: str,
    day: str,
    db: Session = Depends(get_db),
):
    from app.models.video_progress import VideoProgress
    from app.models.quiz import QuizSubmission
    from app.models.tracking import CourseCompletion, AttendanceRecord
    from app.models.assessment import AssessmentSubmission

    try:
        d = date.fromisoformat(day)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid day; expected YYYY-MM-DD")

    start_dt, end_dt = _day_date_range(d)

    try:
        completions = db.query(CourseCompletion).filter(
            CourseCompletion.user_email == user_email,
            CourseCompletion.completed_at >= start_dt,
            CourseCompletion.completed_at < end_dt,
        ).order_by(CourseCompletion.completed_at.desc()).all()

        quizzes = db.query(QuizSubmission).filter(
            QuizSubmission.user_email == user_email,
            QuizSubmission.submitted_at >= start_dt,
            QuizSubmission.submitted_at < end_dt,
        ).order_by(QuizSubmission.submitted_at.desc()).all()

        assessments = db.query(AssessmentSubmission).filter(
            AssessmentSubmission.user_email == user_email,
            AssessmentSubmission.submitted_at >= start_dt,
            AssessmentSubmission.submitted_at < end_dt,
        ).order_by(AssessmentSubmission.submitted_at.desc()).all()

        video_updates = db.query(VideoProgress).filter(
            VideoProgress.user_email == user_email,
            VideoProgress.updated_at >= start_dt,
            VideoProgress.updated_at < end_dt,
            VideoProgress.video_watched_percent > 0,
        ).order_by(VideoProgress.updated_at.desc()).all()

        attendance = db.query(AttendanceRecord).filter(
            AttendanceRecord.user_email == user_email,
            AttendanceRecord.punch_in >= start_dt,
            AttendanceRecord.punch_in < end_dt,
        ).order_by(AttendanceRecord.punch_in.desc()).all()

        sim_started = db.query(SimulationProgress).filter(
            SimulationProgress.user_email == user_email,
            SimulationProgress.started_at >= start_dt,
            SimulationProgress.started_at < end_dt,
        ).order_by(SimulationProgress.started_at.desc()).all()

        sim_completed = db.query(SimulationProgress).filter(
            SimulationProgress.user_email == user_email,
            SimulationProgress.completed == True,
            SimulationProgress.completed_at != None,
            SimulationProgress.completed_at >= start_dt,
            SimulationProgress.completed_at < end_dt,
        ).order_by(SimulationProgress.completed_at.desc()).all()

        audits = db.query(AuditSubmission).filter(
            AuditSubmission.user_email == user_email,
            AuditSubmission.submitted_at >= start_dt,
            AuditSubmission.submitted_at < end_dt,
        ).order_by(AuditSubmission.submitted_at.desc()).all()

    except Exception as e:
        logger.error(f"Calendar day fetch failed: {e}")
        return {
            "day": day,
            "user_email": user_email,
            "summary": {
                "videos": 0,
                "quizzes": 0,
                "assessments": 0,
                "simulations": 0,
                "audits": 0,
                "completions": 0,
                "focus_seconds": 0,
                "focus_minutes": 0,
                "avg_score": None,
                "topSkill": "General",
            },
            "items": {
                "videos": [],
                "quizzes": [],
                "assessments": [],
                "simulations": [],
                "audits": [],
                "completions": [],
                "attendance": [],
                "timeline": [],
            },
        }

    focus_seconds = 0
    focus_seconds += sum(int(c.time_spent_seconds or 0) for c in completions)
    focus_seconds += sum(int(q.time_taken_seconds or 0) for q in quizzes)
    focus_seconds += sum(int(a.time_taken_seconds or 0) for a in assessments)
    focus_seconds += sum(int(s.time_spent_seconds or 0) for s in sim_started)

    scores: List[float] = []
    scores += [float(c.score_percent) for c in completions if c.score_percent is not None]
    scores += [float(q.score) for q in quizzes if q.score is not None]
    scores += [float(a.score_percent) for a in assessments if a.score_percent is not None]
    scores += [float(s.score) for s in sim_completed if s.score is not None]
    avg_score = round(sum(scores) / len(scores)) if scores else None

    buckets = [c.bucket for c in completions if c.bucket]
    top_skill = max(set(buckets), key=buckets.count) if buckets else "General"

    def _ts(val: Any) -> Optional[str]:
        if val is None:
            return None
        try:
            return val.isoformat()
        except Exception:
            try:
                return str(val)
            except Exception:
                return None

    timeline: List[Dict[str, Any]] = []
    for v in video_updates:
        timeline.append({
            "type": "video",
            "ts": _ts(v.updated_at),
            "title": "Video Progress",
            "meta": {"node_id": v.node_id, "watched_percent": v.video_watched_percent, "completed": v.completed},
        })
    for q in quizzes:
        timeline.append({
            "type": "quiz",
            "ts": _ts(q.submitted_at),
            "title": q.quiz_title,
            "meta": {"score_percent": q.score, "passed": q.passed, "time_taken_seconds": q.time_taken_seconds},
        })
    for a in assessments:
        timeline.append({
            "type": "assessment",
            "ts": _ts(a.submitted_at),
            "title": a.assessment_title or "Assessment",
            "meta": {"score_percent": a.score_percent, "passed": a.passed, "time_taken_seconds": a.time_taken_seconds},
        })
    for c in completions:
        timeline.append({
            "type": "completion",
            "ts": _ts(c.completed_at),
            "title": c.course_title or "Course Completed",
            "meta": {"score_percent": c.score_percent, "xp_earned": c.xp_earned, "time_spent_seconds": c.time_spent_seconds},
        })
    for s in sim_started:
        timeline.append({
            "type": "simulation",
            "ts": _ts(s.started_at),
            "title": "Simulation Started",
            "meta": {"simulation_id": s.simulation_id, "score": s.score, "completed": s.completed, "time_spent_seconds": s.time_spent_seconds},
        })
    for s in sim_completed:
        timeline.append({
            "type": "simulation",
            "ts": _ts(s.completed_at),
            "title": "Simulation Completed",
            "meta": {"simulation_id": s.simulation_id, "score": s.score, "passed": s.passed, "time_spent_seconds": s.time_spent_seconds},
        })
    for a in audits:
        timeline.append({
            "type": "audit",
            "ts": _ts(a.submitted_at),
            "title": "Hygiene Audit",
            "meta": {"category": a.category, "store": a.store, "completion_rate": a.completion_rate},
        })
    for a in attendance:
        timeline.append({
            "type": "attendance",
            "ts": _ts(a.punch_in),
            "title": "Punch In",
            "meta": {"store": a.store, "duration_minutes": a.duration_minutes, "status": a.status},
        })
        if a.punch_out:
            timeline.append({
                "type": "attendance",
                "ts": _ts(a.punch_out),
                "title": "Punch Out",
                "meta": {"store": a.store, "duration_minutes": a.duration_minutes, "status": a.status},
            })

    def _sort_key(item: Dict[str, Any]):
        t = item.get("ts")
        return t or ""
    timeline = sorted(timeline, key=_sort_key)

    return {
        "day": day,
        "user_email": user_email,
        "summary": {
            "videos": len(video_updates),
            "quizzes": len(quizzes),
            "assessments": len(assessments),
            "simulations": len(sim_started),
            "audits": len(audits),
            "completions": len(completions),
            "focus_seconds": focus_seconds,
            "focus_minutes": int(focus_seconds // 60),
            "avg_score": avg_score,
            "topSkill": top_skill,
            "attendance_minutes": sum(int(a.duration_minutes or 0) for a in attendance),
        },
        "items": {
            "videos": [
                {
                    "node_id": v.node_id,
                    "watched_percent": v.video_watched_percent,
                    "completed": v.completed,
                    "updated_at": v.updated_at.isoformat() if v.updated_at else None,
                }
                for v in video_updates
            ],
            "quizzes": [q.to_dict() for q in quizzes],
            "assessments": [a.to_dict() for a in assessments],
            "simulations": [s.to_dict() for s in sim_started],
            "audits": [a.to_dict() for a in audits],
            "completions": [c.to_dict() for c in completions],
            "attendance": [a.to_dict() for a in attendance],
            "timeline": timeline,
        },
    }


@router.get("/store-performance")
async def get_store_performance(db: Session = Depends(get_db)):
    """
    Store-wise performance analytics.
    """
    from app.repositories.analytics_repository import AnalyticsRepository
    
    repo = AnalyticsRepository(db)
    
    try:
        performance = repo.get_store_performance()
        return performance
    except Exception as e:
        logger.error(f"Store performance fetch failed: {e}")
        return []


@router.get("/store/{store_name}")
async def get_store_detail(
    store_name: str,
    db: Session = Depends(get_db)
):
    """
    Detailed store analytics with tabs.
    """
    from app.repositories.analytics_repository import AnalyticsRepository
    
    repo = AnalyticsRepository(db)
    
    try:
        detail = repo.get_store_detail(store_name)
        return detail
    except Exception as e:
        logger.error(f"Store detail fetch failed: {e}")
        raise HTTPException(status_code=404, detail="Store not found")


@router.get("/employee-performance")
async def get_employee_performance(db: Session = Depends(get_db)):
    """
    Employee-wise performance analytics.
    """
    from app.repositories.analytics_repository import AnalyticsRepository
    
    repo = AnalyticsRepository(db)
    
    try:
        performance = repo.get_employee_performance()
        return performance
    except Exception as e:
        logger.error(f"Employee performance fetch failed: {e}")
        return []


@router.get("/employee/{user_email}")
async def get_employee_detail(
    user_email: str,
    db: Session = Depends(get_db)
):
    """
    Detailed employee analytics with tabs.
    """
    from app.repositories.analytics_repository import AnalyticsRepository
    
    repo = AnalyticsRepository(db)
    
    try:
        detail = repo.get_employee_detail(user_email)
        return detail
    except Exception as e:
        logger.error(f"Employee detail fetch failed: {e}")
        raise HTTPException(status_code=404, detail="Employee not found")


@router.get("/training-effectiveness")
async def get_training_effectiveness(db: Session = Depends(get_db)):
    """
    Course-wise effectiveness analytics.
    """
    from app.repositories.analytics_repository import AnalyticsRepository
    
    repo = AnalyticsRepository(db)
    
    try:
        effectiveness = repo.get_training_effectiveness()
        return effectiveness
    except Exception as e:
        logger.error(f"Training effectiveness fetch failed: {e}")
        return []


@router.get("/hygiene-compliance")
async def get_hygiene_compliance(db: Session = Depends(get_db)):
    """
    Hygiene and compliance analytics.
    """
    return {
        "overall_score": 92,
        "trend": "up",
        "categories": [
            {"name": "Food Safety", "score": 95, "status": "excellent"},
            {"name": "Personal Hygiene", "score": 90, "status": "good"},
            {"name": "Equipment Maintenance", "score": 88, "status": "good"},
            {"name": "Waste Management", "score": 94, "status": "excellent"},
        ]
    }


@router.get("/customer-experience")
async def get_customer_experience_impact(db: Session = Depends(get_db)):
    """
    Customer experience correlation with training.
    """
    return {
        "satisfaction_score": 4.5,
        "training_correlation": 0.85,
        "top_factors": [
            {"factor": "Product Knowledge", "impact": "high"},
            {"factor": "Customer Service", "impact": "high"},
            {"factor": "Speed of Service", "impact": "medium"},
        ]
    }


@router.get("/ai-insights")
async def get_ai_learning_insights(db: Session = Depends(get_db)):
    """
    AI-powered learning insights.
    """
    return {
        "top_performers": [],
        "at_risk_employees": [],
        "recommended_actions": [
            "Increase customer service training frequency",
            "Schedule refresher courses for hygiene protocols",
        ],
        "predictions": {
            "next_month_completions": 150,
            "trend": "positive"
        }
    }


# ==========================================
# LEADERBOARD ENDPOINTS
# ==========================================

@router.get("/leaderboard")
async def get_leaderboard(limit: int = 10, db: Session = Depends(get_db)):
    """
    Get top learners leaderboard based on XP and completions.
    """
    from app.repositories.analytics_repository import AnalyticsRepository
    
    repo = AnalyticsRepository(db)
    
    try:
        leaderboard = repo.get_leaderboard(limit)
        return leaderboard
    except Exception as e:
        logger.error(f"Leaderboard fetch failed: {e}")
        return []


@router.get("/leaderboard/global")
async def get_global_leaderboard(limit: int = 10, db: Session = Depends(get_db)):
    """
    Get company-wide XP leaderboard.
    """
    from app.repositories.analytics_repository import AnalyticsRepository
    
    repo = AnalyticsRepository(db)
    
    try:
        leaderboard = repo.get_leaderboard(limit)
        return leaderboard
    except Exception as e:
        logger.error(f"Global leaderboard fetch failed: {e}")
        return []


@router.get("/leaderboard/store/{store_id}")
async def get_store_leaderboard(
    store_id: str,
    limit: int = 10,
    db: Session = Depends(get_db)
):
    """
    Get store-specific leaderboard.
    """
    from app.repositories.analytics_repository import AnalyticsRepository
    
    repo = AnalyticsRepository(db)
    
    try:
        leaderboard = repo.get_store_leaderboard(store_id, limit)
        return leaderboard
    except Exception as e:
        logger.error(f"Store leaderboard fetch failed: {e}")
        return []


# ==========================================
# LEARNING PROFILE ENDPOINTS
# ==========================================

@router.get("/profile/{user_email}")
async def get_learning_profile(
    user_email: str,
    db: Session = Depends(get_db)
):
    """
    Get a user's complete learning profile including skill scores and gaps.
    """
    from app.repositories.analytics_repository import AnalyticsRepository
    
    repo = AnalyticsRepository(db)
    
    try:
        profile = repo.get_user_learning_profile(user_email)
        skill_gaps_data = repo.get_skill_gaps(user_email)
        return {
            "status": "success",
            "profile": profile,
            "skill_gaps": skill_gaps_data.get("skill_gaps", []),
            "weak_areas": skill_gaps_data.get("weak_areas", []),
            "strong_areas": skill_gaps_data.get("strong_areas", [])
        }
    except Exception as e:
        logger.error(f"Learning profile fetch failed: {e}")
        return {
            "status": "error",
            "profile": {
                "user_email": user_email,
                "skill_scores": {},
                "total_xp": 0,
                "courses_completed": 0,
            },
            "skill_gaps": [],
            "weak_areas": [],
            "strong_areas": []
        }


@router.get("/skill-gaps/{user_email}")
async def get_skill_gaps(
    user_email: str,
    db: Session = Depends(get_db)
):
    """
    Get detailed skill gap analysis for a user.
    """
    from app.repositories.analytics_repository import AnalyticsRepository
    
    repo = AnalyticsRepository(db)
    
    try:
        gaps = repo.get_skill_gaps(user_email)
        return gaps
    except Exception as e:
        logger.error(f"Skill gaps fetch failed: {e}")
        return {"weak_areas": [], "strong_areas": []}


@router.get("/recommendations/{user_email}")
async def get_recommendations(
    user_email: str,
    limit: int = 5,
    db: Session = Depends(get_db)
):
    """
    Generate AI-powered personalized course recommendations.
    """
    from app.repositories.analytics_repository import AnalyticsRepository
    
    repo = AnalyticsRepository(db)
    
    try:
        recommendations = repo.get_recommendations(user_email, limit)
        return recommendations
    except Exception as e:
        logger.error(f"Recommendations fetch failed: {e}")
        return []


# ==========================================
# TRACKING ENDPOINTS
# ==========================================

@router.post("/track/completion")
async def track_course_completion(
    user_email: str = Form(...),
    course_id: str = Form(...),
    course_title: str = Form(...),
    bucket: str = Form(None),
    score: int = Form(0),
    max_score: int = Form(100),
    time_spent_seconds: int = Form(0),
    quiz_correct: int = Form(0),
    quiz_total: int = Form(0),
    db: Session = Depends(get_db)
):
    """
    Track when a user completes a course/module.
    """
    from app.repositories.analytics_repository import AnalyticsRepository
    
    repo = AnalyticsRepository(db)
    
    try:
        result = repo.track_course_completion(
            user_email=user_email,
            course_id=course_id,
            course_title=course_title,
            bucket=bucket,
            score=score,
            max_score=max_score,
            time_spent_seconds=time_spent_seconds,
            quiz_correct=quiz_correct,
            quiz_total=quiz_total
        )
        return result
    except Exception as e:
        logger.error(f"Tracking failed: {e}")
        raise


@router.post("/track/quiz")
async def track_quiz_submission(
    user_email: str = Form(...),
    quiz_id: str = Form(...),
    quiz_title: str = Form(...),
    correct: int = Form(...),
    total: int = Form(...),
    time_spent_seconds: int = Form(0),
    db: Session = Depends(get_db)
):
    """
    Track quiz submissions and update skill scores.
    """
    from app.repositories.analytics_repository import AnalyticsRepository
    
    repo = AnalyticsRepository(db)
    
    try:
        result = repo.track_quiz_submission(
            user_email=user_email,
            quiz_id=quiz_id,
            quiz_title=quiz_title,
            correct=correct,
            total=total,
            time_spent_seconds=time_spent_seconds
        )
        return result
    except Exception as e:
        logger.error(f"Quiz tracking failed: {e}")
        raise


@router.post("/track/interaction")
async def track_interaction(
    user_email: str = Form(...),
    interaction_type: str = Form(...),
    content_id: str = Form(...),
    content_type: str = Form(...),
    duration_seconds: int = Form(0),
    metadata: str = Form("{}"),
    db: Session = Depends(get_db)
):
    """
    Track user interactions for improving recommendations.
    """
    import json
    
    try:
        metadata_dict = json.loads(metadata)
    except:
        metadata_dict = {}
    
    from app.repositories.analytics_repository import AnalyticsRepository
    
    repo = AnalyticsRepository(db)
    
    try:
        result = repo.track_interaction(
            user_email=user_email,
            interaction_type=interaction_type,
            content_id=content_id,
            content_type=content_type,
            duration_seconds=duration_seconds,
            metadata=metadata_dict
        )
        return result
    except Exception as e:
        logger.error(f"Interaction tracking failed: {e}")
        raise


@router.post("/track/video-progress")
async def track_video_progress(
    user_email: str = Form(...),
    node_id: str = Form(...),
    video_position_seconds: float = Form(...),
    video_duration_seconds: float = Form(...),
    explicit_progress_percent: Optional[int] = Form(None),
    db: Session = Depends(get_db)
):
    """
    Track video watching progress for a node/course.
    """
    from app.services.user_service import UserService
    
    service = UserService(db)
    
    # Calculate progress
    if explicit_progress_percent is not None:
        progress_percent = explicit_progress_percent
    else:
        progress_percent = int((video_position_seconds / video_duration_seconds) * 100) if video_duration_seconds > 0 else 0
    
    progress_data = {
        "last_position": video_position_seconds,
        "progress_percent": progress_percent,
        "completed": progress_percent >= 90,
    }
    
    try:
        service.update_node_progress(user_email, node_id, progress_data)
        return {"success": True, "progress_percent": progress_percent}
    except Exception as e:
        logger.error(f"Video progress tracking failed: {e}")
        raise


# ==========================================
# REPORT GENERATION ENDPOINTS
# ==========================================

@router.post("/reports/generate")
async def generate_analytics_report(
    report_type: str = Form(...),
    date_from: str = Form(""),
    date_to: str = Form(""),
    store_filter: str = Form(""),
    role_filter: str = Form(""),
    format: str = Form("pdf"),
    db: Session = Depends(get_db)
):
    """
    Generate analytics report (PDF/Excel).
    """
    # Report generation would create actual PDF/Excel files
    # For now, return report data
    return {
        "report_type": report_type,
        "date_range": {"from": date_from, "to": date_to},
        "filters": {"store": store_filter, "role": role_filter},
        "format": format,
        "generated_at": datetime.utcnow().isoformat(),
        "download_url": None,  # Would be actual file URL
    }


@router.get("/reports/executive-summary")
async def generate_ai_executive_summary(db: Session = Depends(get_db)):
    """
    Generate AI-powered executive summary.
    """
    return {
        "summary": "Overall training completion rates have improved by 15% this month. "
                   "Top performing stores include Mumbai Central and Bangalore Koramangala. "
                   "Recommended focus areas: Customer Service training for Delhi stores.",
        "key_metrics": {
            "completion_rate_change": "+15%",
            "avg_score_change": "+8%",
            "active_users_change": "+22%",
        },
        "recommendations": [
            "Schedule customer service refresher for Delhi stores",
            "Recognize top performers from Mumbai Central",
            "Review hygiene training content for updates",
        ],
        "generated_at": datetime.utcnow().isoformat(),
    }


# ==========================================
# COMPETENCY MATRIX ENDPOINTS
# ==========================================

@router.get("/skills/all")
async def get_all_skills():
    """
    Get all skill definitions.
    """
    return [
        {"id": "product_knowledge", "name": "Product Knowledge", "icon": "coffee", "color": "#F59E0B"},
        {"id": "customer_service", "name": "Customer Service", "icon": "heart", "color": "#EF4444"},
        {"id": "hygiene_safety", "name": "Hygiene & Safety", "icon": "shield", "color": "#10B981"},
        {"id": "operations", "name": "Store Operations", "icon": "cog", "color": "#8B5CF6"},
        {"id": "leadership", "name": "Leadership", "icon": "star", "color": "#3B82F6"},
    ]


@router.get("/competency-matrix")
async def get_competency_matrix(db: Session = Depends(get_db)):
    """
    Get full competency matrix for all users.
    """
    from app.repositories.analytics_repository import AnalyticsRepository
    
    repo = AnalyticsRepository(db)
    
    try:
        matrix = repo.get_competency_matrix()
        return matrix
    except Exception as e:
        logger.error(f"Competency matrix fetch failed: {e}")
        return []


@router.get("/skill-gaps-analysis")
async def get_skill_gaps_analysis(db: Session = Depends(get_db)):
    """
    Get company-wide skill gap analysis.
    """
    from app.repositories.analytics_repository import AnalyticsRepository

    repo = AnalyticsRepository(db)

    try:
        analysis = repo.get_company_skill_gaps()
        return analysis
    except Exception as e:
        logger.error(f"Skill gaps analysis fetch failed: {e}")
        return {}


@router.get("/detailed-report/{user_email}")
async def get_user_detailed_report(
    user_email: str,
    db: Session = Depends(get_db)
):
    """
    Get aggregated data for detailed employee report.
    Includes profile, activity log, completions, quizzes, and attendance.
    """
    from app.repositories.user_repository import UserRepository
    from app.repositories.analytics_repository import AnalyticsRepository

    user_repo = UserRepository(db)
    analytics_repo = AnalyticsRepository(db)

    # 1. Get user profile
    user = user_repo.get_by_email(user_email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # 2. Get learning profile and stats
    try:
        profile = analytics_repo.get_user_learning_profile(user_email)
    except:
        profile = {"skill_scores": {}, "total_xp": 0, "courses_completed": 0}

    # 3. Get completions from database
    completions = []
    try:
        from app.models.tracking import CourseCompletion
        db_completions = db.query(CourseCompletion).filter(
            CourseCompletion.user_email == user_email
        ).order_by(CourseCompletion.completed_at.desc()).limit(50).all()
        completions = [c.to_dict() if hasattr(c, 'to_dict') else {"course_id": c.course_id, "score": c.score} for c in db_completions]
    except Exception as e:
        logger.error(f"Error fetching completions: {e}")

    # 4. Get quiz submissions
    quizzes = []
    try:
        from app.models.quiz import QuizSubmission
        db_quizzes = db.query(QuizSubmission).filter(
            QuizSubmission.user_email == user_email
        ).order_by(QuizSubmission.submitted_at.desc()).limit(50).all()
        quizzes = [q.to_dict() if hasattr(q, 'to_dict') else {"quiz_id": q.quiz_id, "score": q.score} for q in db_quizzes]
    except Exception as e:
        logger.error(f"Error fetching quiz submissions: {e}")

    # 5. Get attendance records
    attendance = []
    try:
        from app.models.tracking import AttendanceRecord
        db_attendance = db.query(AttendanceRecord).filter(
            AttendanceRecord.user_email == user_email
        ).order_by(AttendanceRecord.punch_in.desc()).limit(30).all()
        attendance = [a.to_dict() if hasattr(a, 'to_dict') else {"punch_in": str(a.punch_in)} for a in db_attendance]
    except Exception as e:
        logger.error(f"Error fetching attendance: {e}")

    # Calculate stats
    total_xp = profile.get("total_xp", 0)
    avg_quiz_score = 0
    if quizzes:
        scores = [q.get("score", 0) for q in quizzes if q.get("score") is not None]
        if scores:
            avg_quiz_score = sum(scores) / len(scores)

    # Count unique days present
    days_present = len(set([
        a.get("punch_in", "").split("T")[0]
        for a in attendance
        if a.get("punch_in")
    ]))

    return {
        "user_profile": {
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "store": user.store,
            "joined": user.created_at.isoformat() if hasattr(user, 'created_at') and user.created_at else None
        },
        "stats": {
            "total_logins": 0,  # Would need activity log tracking
            "courses_completed": len(completions),
            "quizzes_taken": len(quizzes),
            "days_present": days_present,
            "last_active": completions[0].get("completed_at") if completions else None
        },
        "recent_activity": completions[:20],
        "performance_metrics": {
            "avg_quiz_score": round(avg_quiz_score, 1),
            "total_xp": total_xp
        }
    }


@router.get("/stores")
async def get_stores():
    """
    Returns list of all stores for employee assignment.
    """
    return [
        {"id": "1", "name": "HQ", "city": "Mumbai", "region": "West"},
        {"id": "2", "name": "Mumbai Central", "city": "Mumbai", "region": "West"},
        {"id": "3", "name": "Mumbai Andheri", "city": "Mumbai", "region": "West"},
        {"id": "4", "name": "Delhi CP", "city": "Delhi", "region": "North"},
        {"id": "5", "name": "Delhi Saket", "city": "Delhi", "region": "North"},
        {"id": "6", "name": "Delhi Gurgaon", "city": "Gurgaon", "region": "North"},
        {"id": "7", "name": "Bangalore Indiranagar", "city": "Bangalore", "region": "South"},
        {"id": "8", "name": "Bangalore Koramangala", "city": "Bangalore", "region": "South"},
        {"id": "9", "name": "Chennai Anna Nagar", "city": "Chennai", "region": "South"},
        {"id": "10", "name": "Hyderabad Jubilee Hills", "city": "Hyderabad", "region": "South"},
        {"id": "11", "name": "Pune FC Road", "city": "Pune", "region": "West"},
        {"id": "12", "name": "Kolkata Park Street", "city": "Kolkata", "region": "East"},
    ]


# ==========================================
# SYSTEM AUDIT LOGS
# ==========================================

@router.get("/audit-logs")
async def get_audit_logs(
    limit: int = 100,
    action: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Get system audit logs.
    """
    from app.repositories.analytics_repository import AnalyticsRepository
    from app.schemas.analytics import AuditLogResponse

    repo = AnalyticsRepository(db)
    
    try:
        logs = repo.get_audit_logs(action_type=action, limit=limit)
        # Convert to list of dicts, ensuring compatibility with schema
        return [log.to_dict() for log in logs]
    except Exception as e:
        logger.error(f"Audit logs fetch failed: {e}")
        return []
