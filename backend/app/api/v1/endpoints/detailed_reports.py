"""
Detailed Reports - Niche granular reports organized by category
All reports support Excel (XLSX) download
Categories: Participants, Learning, Training, Career Progression, Assessments & Exams, Rewards & Recognition
"""
import logging, io
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta, date
from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_, desc, distinct, case, extract

from app.config.database import get_db
from app.models.user import User, UserNodeProgress, UserLearningProfile, UserInteraction
from app.models.content import Content, CourseBucket, Resource, ProgressionLevel
from app.models.assessment import AssessmentSubmission, ScheduledExam, ExamAttendance
from app.models.quiz import Quiz, QuizSubmission, LiveQuiz
from app.models.tracking import CourseCompletion, AttendanceRecord, LocationTracking
from app.models.simulation import Simulation, SimulationProgress
from app.models.analytics import AuditLog
from app.models.video_progress import VideoProgress

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/reports/detailed", tags=["Detailed Reports"])


def _excel(data, filename, sheet="Report"):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    wb = Workbook(); ws = wb.active; ws.title = sheet
    if not data:
        ws.append(["No data available"])
    else:
        hf = Font(name='Calibri', bold=True, color='FFFFFF', size=11)
        hfill = PatternFill(start_color='F59E0B', end_color='D97706', fill_type='solid')
        ha = Alignment(horizontal='center', vertical='center', wrap_text=True)
        bd = Border(left=Side(style='thin',color='E5E7EB'),right=Side(style='thin',color='E5E7EB'),
                    top=Side(style='thin',color='E5E7EB'),bottom=Side(style='thin',color='E5E7EB'))
        headers = list(data[0].keys())
        for ci, h in enumerate(headers, 1):
            c = ws.cell(row=1, column=ci, value=h.replace('_',' ').title())
            c.font=hf; c.fill=hfill; c.alignment=ha; c.border=bd
        af = PatternFill(start_color='F9FAFB', end_color='F9FAFB', fill_type='solid')
        df = Font(name='Calibri', size=10)
        for ri, rd in enumerate(data, 2):
            for ci, h in enumerate(headers, 1):
                c = ws.cell(row=ri, column=ci, value=rd.get(h,''))
                c.font=df; c.border=bd
                if ri%2==0: c.fill=af
        for ci, h in enumerate(headers, 1):
            ml = max(len(h)+4, 12)
            ws.column_dimensions[ws.cell(row=1,column=ci).column_letter].width = min(ml, 40)
        ws.freeze_panes = 'A2'
    buf = io.BytesIO(); wb.save(buf); buf.seek(0)
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": f"attachment; filename={filename}"})


# ============================================================
# PARTICIPANTS CATEGORY
# ============================================================

@router.get("/participants/user-login")
async def user_login_report(db: Session = Depends(get_db)):
    """User login activity report - last active, login frequency."""
    users = db.query(User).filter(User.category != 'Admin').all()
    data = []
    for u in users:
        interactions = db.query(func.count(UserInteraction.id)).filter(
            UserInteraction.user_email == u.email, UserInteraction.interaction_type == 'login'
        ).scalar() or 0
        data.append({
            "name": u.name, "email": u.email, "role": u.role or "N/A",
            "store": u.store or "Unassigned", "category": u.category or "N/A",
            "last_active": u.last_active.strftime('%Y-%m-%d %H:%M') if u.last_active else "Never",
            "login_count": interactions,
            "status": "Active" if u.last_active and (datetime.utcnow() - u.last_active).days < 30 else "Inactive",
            "created_at": u.created_at.strftime('%Y-%m-%d') if u.created_at else "N/A",
        })
    return {"report_name": "User Login Report", "data": data, "total": len(data)}

@router.get("/participants/user-login/excel")
async def user_login_excel(db: Session = Depends(get_db)):
    r = await user_login_report(db)
    return _excel(r["data"], "user_login_report.xlsx", "User Login")

@router.get("/participants/headcount")
async def headcount_report(db: Session = Depends(get_db)):
    """Headcount by role, store, category."""
    users = db.query(User).filter(User.category != 'Admin').all()
    role_counts, store_counts, cat_counts = {}, {}, {}
    for u in users:
        role_counts[u.role or 'N/A'] = role_counts.get(u.role or 'N/A', 0) + 1
        store_counts[u.store or 'Unassigned'] = store_counts.get(u.store or 'Unassigned', 0) + 1
        cat_counts[u.category or 'N/A'] = cat_counts.get(u.category or 'N/A', 0) + 1
    data = []
    for role, count in sorted(role_counts.items(), key=lambda x: -x[1]):
        data.append({"dimension": "Role", "value": role, "headcount": count,
                      "percentage": round(count/len(users)*100, 1) if users else 0})
    for store, count in sorted(store_counts.items(), key=lambda x: -x[1]):
        data.append({"dimension": "Store", "value": store, "headcount": count,
                      "percentage": round(count/len(users)*100, 1) if users else 0})
    for cat, count in sorted(cat_counts.items(), key=lambda x: -x[1]):
        data.append({"dimension": "Category", "value": cat, "headcount": count,
                      "percentage": round(count/len(users)*100, 1) if users else 0})
    return {"report_name": "Headcount Report", "data": data, "total_users": len(users)}

@router.get("/participants/headcount/excel")
async def headcount_excel(db: Session = Depends(get_db)):
    r = await headcount_report(db)
    return _excel(r["data"], "headcount_report.xlsx", "Headcount")

@router.get("/participants/new-joiners")
async def new_joiners_report(days: int = Query(90), db: Session = Depends(get_db)):
    """New joiners in last N days with gender ratio from profile_data."""
    cutoff = datetime.utcnow() - timedelta(days=days)
    users = db.query(User).filter(User.created_at >= cutoff, User.category != 'Admin').all()
    data = []
    for u in users:
        pd = u.profile_data or {}
        data.append({
            "name": u.name, "email": u.email, "role": u.role or "N/A",
            "store": u.store or "Unassigned", "gender": pd.get('Gender', 'Not Specified'),
            "joined_date": u.created_at.strftime('%Y-%m-%d') if u.created_at else "N/A",
            "state": pd.get('State', 'N/A'), "city": pd.get('City', 'N/A'),
        })
    return {"report_name": "New Joiners & Gender Ratio", "data": data, "total": len(data), "period_days": days}

@router.get("/participants/new-joiners/excel")
async def new_joiners_excel(days: int = Query(90), db: Session = Depends(get_db)):
    r = await new_joiners_report(days, db)
    return _excel(r["data"], "new_joiners_report.xlsx", "New Joiners")

@router.get("/participants/attrition")
async def attrition_report(days: int = Query(90), db: Session = Depends(get_db)):
    """Users inactive for extended periods (potential attrition)."""
    cutoff = datetime.utcnow() - timedelta(days=days)
    users = db.query(User).filter(
        or_(User.last_active < cutoff, User.last_active.is_(None)),
        User.category != 'Admin'
    ).all()
    data = []
    for u in users:
        inactive_days = (datetime.utcnow() - u.last_active).days if u.last_active else 999
        data.append({
            "name": u.name, "email": u.email, "role": u.role or "N/A",
            "store": u.store or "Unassigned",
            "last_active": u.last_active.strftime('%Y-%m-%d') if u.last_active else "Never",
            "inactive_days": inactive_days,
            "risk_level": "High" if inactive_days > 180 else "Medium" if inactive_days > 90 else "Low",
        })
    data.sort(key=lambda x: -x['inactive_days'])
    return {"report_name": "Attrition Report", "data": data, "total": len(data)}

@router.get("/participants/attrition/excel")
async def attrition_excel(days: int = Query(90), db: Session = Depends(get_db)):
    r = await attrition_report(days, db)
    return _excel(r["data"], "attrition_report.xlsx", "Attrition")

@router.get("/participants/stakeholder-mapping")
async def stakeholder_mapping(db: Session = Depends(get_db)):
    """Users grouped by store with their roles and completion stats."""
    users = db.query(User).filter(User.category != 'Admin').all()
    data = []
    for u in users:
        completions = db.query(func.count(CourseCompletion.id)).filter(CourseCompletion.user_email == u.email).scalar() or 0
        data.append({
            "name": u.name, "email": u.email, "role": u.role or "N/A",
            "store": u.store or "Unassigned", "category": u.category or "N/A",
            "courses_completed": completions, "xp_points": u.xp_points or 0,
            "is_external": "Yes" if u.is_external else "No",
        })
    return {"report_name": "Stakeholder Mapping Report", "data": data, "total": len(data)}

@router.get("/participants/stakeholder-mapping/excel")
async def stakeholder_excel(db: Session = Depends(get_db)):
    r = await stakeholder_mapping(db)
    return _excel(r["data"], "stakeholder_mapping.xlsx", "Stakeholders")

@router.get("/participants/export-users")
async def export_users_report(db: Session = Depends(get_db)):
    """Full user export with all profile fields."""
    users = db.query(User).filter(User.category != 'Admin').all()
    data = []
    for u in users:
        pd = u.profile_data or {}
        data.append({
            "name": u.name, "email": u.email, "role": u.role or "N/A",
            "store": u.store or "Unassigned", "category": u.category or "N/A",
            "state": pd.get('State',''), "city": pd.get('City',''),
            "region": pd.get('Region',''), "country": pd.get('Country',''),
            "gender": pd.get('Gender',''), "xp_points": u.xp_points or 0,
            "is_external": "Yes" if u.is_external else "No",
            "created_at": u.created_at.strftime('%Y-%m-%d') if u.created_at else "",
            "last_active": u.last_active.strftime('%Y-%m-%d %H:%M') if u.last_active else "",
        })
    return {"report_name": "Export Users", "data": data, "total": len(data)}

@router.get("/participants/export-users/excel")
async def export_users_excel(db: Session = Depends(get_db)):
    r = await export_users_report(db)
    return _excel(r["data"], "export_users.xlsx", "Users")

@router.get("/participants/user-deactivation")
async def user_deactivation_report(db: Session = Depends(get_db)):
    """Users never logged in or inactive >180 days."""
    users = db.query(User).filter(User.category != 'Admin').all()
    data = []
    for u in users:
        if u.last_active is None or (datetime.utcnow() - u.last_active).days > 180:
            data.append({
                "name": u.name, "email": u.email, "role": u.role or "N/A",
                "store": u.store or "Unassigned",
                "last_active": u.last_active.strftime('%Y-%m-%d') if u.last_active else "Never",
                "days_inactive": (datetime.utcnow() - u.last_active).days if u.last_active else 999,
                "recommendation": "Deactivate" if (u.last_active is None or (datetime.utcnow() - u.last_active).days > 365) else "Review",
            })
    return {"report_name": "User Deactivation Report", "data": data, "total": len(data)}

@router.get("/participants/user-deactivation/excel")
async def user_deactivation_excel(db: Session = Depends(get_db)):
    r = await user_deactivation_report(db)
    return _excel(r["data"], "user_deactivation.xlsx", "Deactivation")


# ============================================================
# LEARNING CATEGORY
# ============================================================

@router.get("/learning/completion-overview")
async def completion_overview(db: Session = Depends(get_db)):
    """Overall completion stats across all courses."""
    completions = db.query(CourseCompletion).all()
    data = []
    course_groups = {}
    for c in completions:
        cid = c.course_id
        if cid not in course_groups:
            course_groups[cid] = {"title": c.course_title or cid, "bucket": c.bucket or "N/A",
                                   "users": 0, "total_score": 0, "passed": 0}
        course_groups[cid]["users"] += 1
        course_groups[cid]["total_score"] += (c.score or 0)
        if (c.score_percent or 0) >= 70:
            course_groups[cid]["passed"] += 1
    for cid, g in course_groups.items():
        data.append({
            "course_id": cid, "course_title": g["title"], "bucket": g["bucket"],
            "total_completions": g["users"],
            "avg_score": round(g["total_score"]/g["users"], 1) if g["users"] else 0,
            "pass_count": g["passed"],
            "pass_rate": round(g["passed"]/g["users"]*100, 1) if g["users"] else 0,
        })
    data.sort(key=lambda x: -x["total_completions"])
    return {"report_name": "Completion Overview Report", "data": data, "total": len(data)}

@router.get("/learning/completion-overview/excel")
async def completion_overview_excel(db: Session = Depends(get_db)):
    r = await completion_overview(db)
    return _excel(r["data"], "completion_overview.xlsx", "Completions")

@router.get("/learning/assessment-results")
async def assessment_results(db: Session = Depends(get_db)):
    """Detailed assessment submission results per user."""
    subs = db.query(AssessmentSubmission).order_by(desc(AssessmentSubmission.submitted_at)).all()
    data = [{
        "user_name": s.user_name or s.user_email, "user_email": s.user_email,
        "assessment_title": s.assessment_title or s.assessment_id,
        "score_percent": round(s.score_percent or 0, 1), "passed": "Yes" if s.passed else "No",
        "violations": s.violations or 0, "integrity_status": s.integrity_status or "N/A",
        "submitted_at": s.submitted_at.strftime('%Y-%m-%d %H:%M') if s.submitted_at else "",
    } for s in subs]
    return {"report_name": "Assessment Results", "data": data, "total": len(data)}

@router.get("/learning/assessment-results/excel")
async def assessment_results_excel(db: Session = Depends(get_db)):
    r = await assessment_results(db)
    return _excel(r["data"], "assessment_results.xlsx", "Assessment Results")

@router.get("/learning/learning-history")
async def learning_history(db: Session = Depends(get_db)):
    """Per-user learning history with all completions."""
    completions = db.query(CourseCompletion).order_by(desc(CourseCompletion.completed_at)).all()
    data = [{
        "user_email": c.user_email, "course_title": c.course_title or c.course_id,
        "bucket": c.bucket or "N/A", "learning_path": c.learning_path_type or "N/A",
        "score": round(c.score or 0, 1), "score_percent": round(c.score_percent or 0, 1),
        "time_spent_mins": round((c.time_spent_seconds or 0)/60, 1),
        "xp_earned": c.xp_earned or 0,
        "completed_at": c.completed_at.strftime('%Y-%m-%d %H:%M') if c.completed_at else "",
    } for c in completions]
    return {"report_name": "Learning History Report", "data": data, "total": len(data)}

@router.get("/learning/learning-history/excel")
async def learning_history_excel(db: Session = Depends(get_db)):
    r = await learning_history(db)
    return _excel(r["data"], "learning_history.xlsx", "Learning History")

@router.get("/learning/course-status")
async def course_status_report(db: Session = Depends(get_db)):
    """Status of all courses - completions, active learners."""
    contents = db.query(Content).all()
    data = []
    for c in contents:
        total_comp = db.query(func.count(CourseCompletion.id)).filter(CourseCompletion.course_id == str(c.id)).scalar() or 0
        in_progress = db.query(func.count(VideoProgress.id)).filter(
            VideoProgress.node_id == str(c.id), VideoProgress.completed == False
        ).scalar() or 0
        data.append({
            "course_title": c.title, "course_id": str(c.id),
            "resource_type": c.resource_type or "N/A", "bucket": c.bucket or "N/A",
            "completed_users": total_comp, "in_progress_users": in_progress,
            "is_published": "Yes" if c.is_published else "No",
            "created_at": c.created_at.strftime('%Y-%m-%d') if c.created_at else "",
        })
    return {"report_name": "Course Status Report", "data": data, "total": len(data)}

@router.get("/learning/course-status/excel")
async def course_status_excel(db: Session = Depends(get_db)):
    r = await course_status_report(db)
    return _excel(r["data"], "course_status.xlsx", "Course Status")

@router.get("/learning/course-completion")
async def course_completion_report(db: Session = Depends(get_db)):
    """Detailed course completion records."""
    comps = db.query(CourseCompletion).order_by(desc(CourseCompletion.completed_at)).limit(2000).all()
    data = [{
        "user_email": c.user_email, "course_title": c.course_title or c.course_id,
        "bucket": c.bucket or "N/A", "score": round(c.score or 0, 1),
        "quiz_correct": c.quiz_correct or 0, "quiz_total": c.quiz_total or 0,
        "time_spent_mins": round((c.time_spent_seconds or 0)/60, 1),
        "xp_earned": c.xp_earned or 0,
        "certificate_issued": "Yes" if c.certificate_issued else "No",
        "completed_at": c.completed_at.strftime('%Y-%m-%d %H:%M') if c.completed_at else "",
    } for c in comps]
    return {"report_name": "Course Completion Report", "data": data, "total": len(data)}

@router.get("/learning/course-completion/excel")
async def course_completion_excel(db: Session = Depends(get_db)):
    r = await course_completion_report(db)
    return _excel(r["data"], "course_completion.xlsx", "Course Completion")

@router.get("/learning/course-structure")
async def course_structure_report(db: Session = Depends(get_db)):
    """Course catalog structure with buckets and content types."""
    contents = db.query(Content).order_by(Content.bucket, Content.order_index).all()
    data = [{
        "course_title": c.title, "course_id": str(c.id), "bucket": c.bucket or "N/A",
        "resource_type": c.resource_type or "N/A", "duration": c.duration or "N/A",
        "is_path_node": "Yes" if c.is_path_node else "No",
        "learning_path_type": c.learning_path_type or "N/A",
        "xp_value": c.xp or 0, "order_index": c.order_index or 0,
        "skippable": "Yes" if c.skippable else "No",
    } for c in contents]
    return {"report_name": "Course Structure Report", "data": data, "total": len(data)}

@router.get("/learning/course-structure/excel")
async def course_structure_excel(db: Session = Depends(get_db)):
    r = await course_structure_report(db)
    return _excel(r["data"], "course_structure.xlsx", "Course Structure")

@router.get("/learning/course-details")
async def course_details_report(db: Session = Depends(get_db)):
    """Detailed course info with settings."""
    contents = db.query(Content).all()
    data = [{
        "title": c.title, "id": str(c.id), "bucket": c.bucket or "N/A",
        "resource_type": c.resource_type or "N/A", "duration": c.duration or "N/A",
        "allow_fast_forward": "Yes" if c.allow_fast_forward else "No",
        "enable_feedback": "Yes" if c.enable_feedback else "No",
        "enable_certificate": "Yes" if c.enable_certificate else "No",
        "is_published": "Yes" if c.is_published else "No",
        "scheduled_at": c.scheduled_at.strftime('%Y-%m-%d') if c.scheduled_at else "Immediate",
    } for c in contents]
    return {"report_name": "Course Details Report", "data": data, "total": len(data)}

@router.get("/learning/course-details/excel")
async def course_details_excel(db: Session = Depends(get_db)):
    r = await course_details_report(db)
    return _excel(r["data"], "course_details.xlsx", "Course Details")


# ============================================================
# TRAINING CATEGORY
# ============================================================

@router.get("/training/training-coverage")
async def training_coverage(db: Session = Depends(get_db)):
    """Training coverage: % of users who completed each course."""
    total_users = db.query(func.count(User.id)).filter(User.category != 'Admin').scalar() or 1
    contents = db.query(Content).filter(Content.is_path_node == True).all()
    data = []
    for c in contents:
        comp_count = db.query(func.count(distinct(CourseCompletion.user_email))).filter(
            CourseCompletion.course_id == str(c.id)).scalar() or 0
        data.append({
            "course_title": c.title, "bucket": c.bucket or "N/A",
            "users_completed": comp_count, "total_users": total_users,
            "coverage_percent": round(comp_count/total_users*100, 1),
        })
    data.sort(key=lambda x: -x["coverage_percent"])
    return {"report_name": "Training Coverage", "data": data, "total": len(data)}

@router.get("/training/training-coverage/excel")
async def training_coverage_excel(db: Session = Depends(get_db)):
    r = await training_coverage(db)
    return _excel(r["data"], "training_coverage.xlsx", "Training Coverage")

@router.get("/training/attendance-tracker")
async def attendance_tracker(db: Session = Depends(get_db)):
    """Attendance punch-in/out records."""
    records = db.query(AttendanceRecord).order_by(desc(AttendanceRecord.punch_in)).limit(2000).all()
    data = [{
        "user_email": r.user_email, "user_name": r.user_name or r.user_email,
        "store": r.store or "N/A",
        "punch_in": r.punch_in.strftime('%Y-%m-%d %H:%M') if r.punch_in else "",
        "punch_out": r.punch_out.strftime('%Y-%m-%d %H:%M') if r.punch_out else "Still Active",
        "duration_minutes": r.duration_minutes or 0,
        "duration_hours": round((r.duration_minutes or 0)/60, 1),
    } for r in records]
    return {"report_name": "Attendance Tracker", "data": data, "total": len(data)}

@router.get("/training/attendance-tracker/excel")
async def attendance_tracker_excel(db: Session = Depends(get_db)):
    r = await attendance_tracker(db)
    return _excel(r["data"], "attendance_tracker.xlsx", "Attendance")

@router.get("/training/training-master")
async def training_master(db: Session = Depends(get_db)):
    """Master training report - users × courses matrix."""
    users = db.query(User).filter(User.category != 'Admin').all()
    data = []
    for u in users:
        comps = db.query(CourseCompletion).filter(CourseCompletion.user_email == u.email).all()
        total_time = sum(c.time_spent_seconds or 0 for c in comps)
        avg_score = sum(c.score or 0 for c in comps) / len(comps) if comps else 0
        quizzes = db.query(func.count(QuizSubmission.id)).filter(QuizSubmission.user_email == u.email).scalar() or 0
        data.append({
            "name": u.name, "email": u.email, "role": u.role or "N/A",
            "store": u.store or "Unassigned",
            "courses_completed": len(comps), "quizzes_taken": quizzes,
            "avg_score": round(avg_score, 1),
            "total_learning_hours": round(total_time/3600, 1),
            "xp_points": u.xp_points or 0,
        })
    data.sort(key=lambda x: -x["courses_completed"])
    return {"report_name": "Training Master Report", "data": data, "total": len(data)}

@router.get("/training/training-master/excel")
async def training_master_excel(db: Session = Depends(get_db)):
    r = await training_master(db)
    return _excel(r["data"], "training_master.xlsx", "Training Master")

@router.get("/training/ilt-report")
async def ilt_report(db: Session = Depends(get_db)):
    """Instructor-Led Training (scheduled exams as ILT proxy)."""
    exams = db.query(ScheduledExam).order_by(desc(ScheduledExam.created_at)).all()
    data = []
    for e in exams:
        att_count = db.query(func.count(ExamAttendance.id)).filter(
            ExamAttendance.exam_id == e.id, ExamAttendance.marked_present == True).scalar() or 0
        total_assigned = len(e.assigned_users or [])
        data.append({
            "title": e.title, "exam_date": e.exam_date or "N/A",
            "location": e.location or "N/A", "status": e.status or "N/A",
            "supervisor": e.supervisor_name or e.supervisor_email or "N/A",
            "assigned_users": total_assigned, "attended": att_count,
            "attendance_rate": round(att_count/total_assigned*100, 1) if total_assigned else 0,
            "passing_score": e.passing_score or 70,
        })
    return {"report_name": "ILT Report", "data": data, "total": len(data)}

@router.get("/training/ilt-report/excel")
async def ilt_report_excel(db: Session = Depends(get_db)):
    r = await ilt_report(db)
    return _excel(r["data"], "ilt_report.xlsx", "ILT Report")


# ============================================================
# CAREER PROGRESSION CATEGORY
# ============================================================

@router.get("/career/summary")
async def career_summary(db: Session = Depends(get_db)):
    """Career progression summary per user."""
    users = db.query(User).filter(User.category != 'Admin').all()
    data = []
    for u in users:
        cp_completions = db.query(func.count(CourseCompletion.id)).filter(
            CourseCompletion.user_email == u.email, CourseCompletion.learning_path_type == 'career_progression'
        ).scalar() or 0
        node_progress = db.query(func.count(UserNodeProgress.id)).filter(
            UserNodeProgress.user_email == u.email).scalar() or 0
        data.append({
            "name": u.name, "email": u.email, "current_role": u.role or "N/A",
            "store": u.store or "Unassigned",
            "career_modules_completed": cp_completions,
            "nodes_in_progress": node_progress, "xp_points": u.xp_points or 0,
        })
    data.sort(key=lambda x: -x["career_modules_completed"])
    return {"report_name": "Career Progression Summary", "data": data, "total": len(data)}

@router.get("/career/summary/excel")
async def career_summary_excel(db: Session = Depends(get_db)):
    r = await career_summary(db)
    return _excel(r["data"], "career_summary.xlsx", "Career Summary")

@router.get("/career/module-report")
async def module_report(db: Session = Depends(get_db)):
    """Career progression by module/bucket."""
    buckets = db.query(CourseBucket).filter(CourseBucket.learning_path_type == 'career_progression').all()
    data = []
    for b in buckets:
        contents = db.query(Content).filter(Content.bucket_id == b.id).all()
        total_comps = 0
        for c in contents:
            total_comps += db.query(func.count(CourseCompletion.id)).filter(
                CourseCompletion.course_id == str(c.id)).scalar() or 0
        data.append({
            "module_name": b.name, "module_id": b.id,
            "total_courses": len(contents), "total_completions": total_comps,
            "is_linear": "Yes" if b.is_linear else "No",
        })
    return {"report_name": "Module Report", "data": data, "total": len(data)}

@router.get("/career/module-report/excel")
async def module_report_excel(db: Session = Depends(get_db)):
    r = await module_report(db)
    return _excel(r["data"], "module_report.xlsx", "Modules")

@router.get("/career/node-progress")
async def node_progress_report(db: Session = Depends(get_db)):
    """Detailed node-level progress across all users."""
    progress = db.query(UserNodeProgress).order_by(desc(UserNodeProgress.last_accessed)).limit(2000).all()
    data = [{
        "user_email": p.user_email, "node_id": p.node_id,
        "completed": "Yes" if p.completed else "No",
        "progress_percent": round(p.progress_percent or 0, 1),
        "time_spent_mins": round((p.time_spent_seconds or 0)/60, 1),
        "quiz_best_score": round(p.quiz_best_score or 0, 1),
        "quiz_attempts": p.quiz_attempts or 0,
        "last_accessed": p.last_accessed.strftime('%Y-%m-%d %H:%M') if p.last_accessed else "",
    } for p in progress]
    return {"report_name": "Node Progress Report", "data": data, "total": len(data)}

@router.get("/career/node-progress/excel")
async def node_progress_excel(db: Session = Depends(get_db)):
    r = await node_progress_report(db)
    return _excel(r["data"], "node_progress.xlsx", "Node Progress")


# ============================================================
# ASSESSMENTS & EXAMS CATEGORY
# ============================================================

@router.get("/exams/overview")
async def exams_overview(db: Session = Depends(get_db)):
    """All scheduled exams with stats."""
    exams = db.query(ScheduledExam).order_by(desc(ScheduledExam.created_at)).all()
    data = []
    for e in exams:
        subs = db.query(AssessmentSubmission).filter(AssessmentSubmission.assessment_id == e.id).all()
        passed = sum(1 for s in subs if s.passed)
        data.append({
            "title": e.title, "exam_date": e.exam_date or "N/A",
            "status": e.status or "N/A", "location": e.location or "N/A",
            "total_submissions": len(subs), "passed": passed,
            "pass_rate": round(passed/len(subs)*100, 1) if subs else 0,
            "avg_score": round(sum(s.score_percent or 0 for s in subs)/len(subs), 1) if subs else 0,
            "time_limit": e.time_limit_minutes or 30,
        })
    return {"report_name": "Exams Overview", "data": data, "total": len(data)}

@router.get("/exams/overview/excel")
async def exams_overview_excel(db: Session = Depends(get_db)):
    r = await exams_overview(db)
    return _excel(r["data"], "exams_overview.xlsx", "Exams Overview")

@router.get("/exams/quiz-results")
async def quiz_results(db: Session = Depends(get_db)):
    """All quiz submission results."""
    subs = db.query(QuizSubmission).order_by(desc(QuizSubmission.submitted_at)).limit(2000).all()
    data = [{
        "user_name": s.user_name, "user_email": s.user_email or "N/A",
        "quiz_id": s.quiz_id, "score": round(s.score or 0, 1),
        "passed": "Yes" if s.passed else "No",
        "submitted_at": s.submitted_at.strftime('%Y-%m-%d %H:%M') if s.submitted_at else "",
    } for s in subs]
    return {"report_name": "Quiz Results", "data": data, "total": len(data)}

@router.get("/exams/quiz-results/excel")
async def quiz_results_excel(db: Session = Depends(get_db)):
    r = await quiz_results(db)
    return _excel(r["data"], "quiz_results.xlsx", "Quiz Results")

@router.get("/exams/exam-attendance")
async def exam_attendance_report(db: Session = Depends(get_db)):
    """Exam attendance per scheduled exam."""
    records = db.query(ExamAttendance).order_by(desc(ExamAttendance.marked_at)).all()
    data = []
    for r in records:
        exam = db.query(ScheduledExam).filter(ScheduledExam.id == r.exam_id).first()
        data.append({
            "exam_title": exam.title if exam else r.exam_id,
            "user_name": r.user_name or r.user_email, "user_email": r.user_email,
            "present": "Yes" if r.marked_present else "No",
            "started_exam": "Yes" if r.started_exam else "No",
            "completed": "Yes" if r.completed else "No",
            "score": round(r.score or 0, 1) if r.score else "N/A",
            "passed": "Yes" if r.passed else ("No" if r.passed is not None else "N/A"),
            "check_in_method": r.check_in_method or "N/A",
        })
    return {"report_name": "Exam Attendance Report", "data": data, "total": len(data)}

@router.get("/exams/exam-attendance/excel")
async def exam_attendance_excel(db: Session = Depends(get_db)):
    r = await exam_attendance_report(db)
    return _excel(r["data"], "exam_attendance.xlsx", "Exam Attendance")

@router.get("/exams/submission-history")
async def submission_history(db: Session = Depends(get_db)):
    """Full assessment submission history with integrity data."""
    subs = db.query(AssessmentSubmission).order_by(desc(AssessmentSubmission.submitted_at)).limit(2000).all()
    data = [{
        "user_name": s.user_name or s.user_email, "user_email": s.user_email,
        "assessment": s.assessment_title or s.assessment_id,
        "score": round(s.score_percent or 0, 1), "passed": "Yes" if s.passed else "No",
        "violations": s.violations or 0,
        "critical_breaches": s.critical_breaches or 0,
        "warning_breaches": s.warning_breaches or 0,
        "integrity_score": round(s.integrity_score or 100, 1),
        "integrity_status": s.integrity_status or "N/A",
        "submitted_at": s.submitted_at.strftime('%Y-%m-%d %H:%M') if s.submitted_at else "",
    } for s in subs]
    return {"report_name": "Submission History", "data": data, "total": len(data)}

@router.get("/exams/submission-history/excel")
async def submission_history_excel(db: Session = Depends(get_db)):
    r = await submission_history(db)
    return _excel(r["data"], "submission_history.xlsx", "Submissions")


# ============================================================
# REWARDS & RECOGNITION CATEGORY
# ============================================================

@router.get("/rewards/points-overview")
async def points_overview(db: Session = Depends(get_db)):
    """Points/XP overview across all users."""
    users = db.query(User).filter(User.category != 'Admin', User.xp_points > 0).order_by(desc(User.xp_points)).all()
    data = [{
        "name": u.name, "email": u.email, "role": u.role or "N/A",
        "store": u.store or "Unassigned", "xp_points": u.xp_points or 0,
        "courses_completed": db.query(func.count(CourseCompletion.id)).filter(
            CourseCompletion.user_email == u.email).scalar() or 0,
        "rank": idx + 1,
    } for idx, u in enumerate(users)]
    return {"report_name": "Points Overview Report", "data": data, "total": len(data)}

@router.get("/rewards/points-overview/excel")
async def points_overview_excel(db: Session = Depends(get_db)):
    r = await points_overview(db)
    return _excel(r["data"], "points_overview.xlsx", "Points Overview")

@router.get("/rewards/points-earned")
async def points_earned(db: Session = Depends(get_db)):
    """XP earned per course completion."""
    comps = db.query(CourseCompletion).filter(CourseCompletion.xp_earned > 0).order_by(
        desc(CourseCompletion.completed_at)).all()
    data = [{
        "user_email": c.user_email, "course_title": c.course_title or c.course_id,
        "xp_earned": c.xp_earned or 0, "score": round(c.score or 0, 1),
        "completed_at": c.completed_at.strftime('%Y-%m-%d %H:%M') if c.completed_at else "",
    } for c in comps]
    return {"report_name": "Points Earned Report", "data": data, "total": len(data)}

@router.get("/rewards/points-earned/excel")
async def points_earned_excel(db: Session = Depends(get_db)):
    r = await points_earned(db)
    return _excel(r["data"], "points_earned.xlsx", "Points Earned")

@router.get("/rewards/leaderboard")
async def leaderboard_report(db: Session = Depends(get_db)):
    """Full leaderboard ranking."""
    users = db.query(User).filter(User.category != 'Admin').all()
    board = []
    for u in users:
        comps = db.query(func.count(CourseCompletion.id)).filter(CourseCompletion.user_email == u.email).scalar() or 0
        quizzes = db.query(func.count(QuizSubmission.id)).filter(QuizSubmission.user_email == u.email).scalar() or 0
        board.append({
            "name": u.name, "email": u.email, "role": u.role or "N/A",
            "store": u.store or "Unassigned",
            "xp_points": u.xp_points or 0, "courses_completed": comps,
            "quizzes_taken": quizzes,
            "total_score": (u.xp_points or 0) + comps * 10 + quizzes * 5,
        })
    board.sort(key=lambda x: -x["total_score"])
    for i, b in enumerate(board):
        b["rank"] = i + 1
    return {"report_name": "Leaderboard Report", "data": board, "total": len(board)}

@router.get("/rewards/leaderboard/excel")
async def leaderboard_excel(db: Session = Depends(get_db)):
    r = await leaderboard_report(db)
    return _excel(r["data"], "leaderboard.xlsx", "Leaderboard")

@router.get("/rewards/xp-summary")
async def xp_summary(db: Session = Depends(get_db)):
    """XP distribution summary by role and store."""
    users = db.query(User).filter(User.category != 'Admin').all()
    role_xp, store_xp = {}, {}
    for u in users:
        r = u.role or 'N/A'
        s = u.store or 'Unassigned'
        role_xp.setdefault(r, {"total_xp": 0, "count": 0})
        store_xp.setdefault(s, {"total_xp": 0, "count": 0})
        role_xp[r]["total_xp"] += u.xp_points or 0
        role_xp[r]["count"] += 1
        store_xp[s]["total_xp"] += u.xp_points or 0
        store_xp[s]["count"] += 1
    data = []
    for k, v in role_xp.items():
        data.append({"dimension": "Role", "value": k, "total_xp": v["total_xp"],
                      "user_count": v["count"], "avg_xp": round(v["total_xp"]/v["count"], 1) if v["count"] else 0})
    for k, v in store_xp.items():
        data.append({"dimension": "Store", "value": k, "total_xp": v["total_xp"],
                      "user_count": v["count"], "avg_xp": round(v["total_xp"]/v["count"], 1) if v["count"] else 0})
    return {"report_name": "XP Summary", "data": data, "total": len(data)}

@router.get("/rewards/xp-summary/excel")
async def xp_summary_excel(db: Session = Depends(get_db)):
    r = await xp_summary(db)
    return _excel(r["data"], "xp_summary.xlsx", "XP Summary")
