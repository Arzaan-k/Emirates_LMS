"""
Detailed Reports - Niche granular reports organized by category
All reports support Excel (XLSX) download
Categories: Participants, Learning, Training, Career Progression, Assessments & Exams, Rewards & Recognition

All endpoints are filtered based on the current user's access grants.
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
from app.core.dependencies import get_current_user
from app.core.access_filter import get_access_filter_context, should_include_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/reports/detailed", tags=["Detailed Reports"])


def _get_accessible_filter(db: Session, current_user: dict):
    """
    Helper to get access filter info. Returns (is_superadmin, accessible_emails_set).
    If superadmin, accessible_emails will be None (meaning no filter needed).
    """
    access_context = get_access_filter_context(db, current_user)
    if access_context.get('is_superadmin'):
        return True, None
    accessible_emails = access_context.get('accessible_emails', set())
    if not accessible_emails:
        # No grants - user can only see themselves
        viewer_email = access_context.get('viewer_email')
        accessible_emails = {viewer_email} if viewer_email else set()
    return False, accessible_emails


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
async def user_login_report(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """User login activity report - last active, login frequency. Filtered by access grants."""
    is_superadmin, accessible_emails = _get_accessible_filter(db, current_user)

    login_sub = db.query(
        UserInteraction.user_email,
        func.count(UserInteraction.id).label('login_count')
    ).filter(
        UserInteraction.interaction_type == 'login'
    ).group_by(UserInteraction.user_email).subquery()

    query = db.query(
        User, login_sub.c.login_count
    ).outerjoin(
        login_sub, User.email == login_sub.c.user_email
    ).filter(User.category != 'Admin')

    if not is_superadmin and accessible_emails:
        query = query.filter(User.email.in_(accessible_emails))

    rows = query.all()

    now = datetime.utcnow()
    data = []
    for u, login_count in rows:
        data.append({
            "name": u.name, "email": u.email, "role": u.role or "N/A",
            "store": u.store or "Unassigned", "category": u.category or "N/A",
            "last_active": u.last_active.strftime('%Y-%m-%d %H:%M') if u.last_active else "Never",
            "login_count": login_count or 0,
            "status": "Active" if u.last_active and (now - u.last_active).days < 30 else "Inactive",
            "created_at": u.created_at.strftime('%Y-%m-%d') if u.created_at else "N/A",
        })
    return {"report_name": "User Login Report", "data": data, "total": len(data)}

@router.get("/participants/user-login/excel")
async def user_login_excel(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    r = await user_login_report(db, current_user)
    return _excel(r["data"], "user_login_report.xlsx", "User Login")

@router.get("/participants/headcount")
async def headcount_report(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """Headcount by role, store, category. Filtered by access grants."""
    is_superadmin, accessible_emails = _get_accessible_filter(db, current_user)

    base_filter = [User.category != 'Admin']
    if not is_superadmin and accessible_emails:
        base_filter.append(User.email.in_(accessible_emails))

    total_users = db.query(func.count(User.id)).filter(*base_filter).scalar() or 0

    role_rows = db.query(
        func.coalesce(User.role, 'N/A').label('value'),
        func.count(User.id).label('headcount')
    ).filter(*base_filter).group_by(
        func.coalesce(User.role, 'N/A')
    ).order_by(desc('headcount')).all()

    store_rows = db.query(
        func.coalesce(User.store, 'Unassigned').label('value'),
        func.count(User.id).label('headcount')
    ).filter(*base_filter).group_by(
        func.coalesce(User.store, 'Unassigned')
    ).order_by(desc('headcount')).all()

    cat_rows = db.query(
        func.coalesce(User.category, 'N/A').label('value'),
        func.count(User.id).label('headcount')
    ).filter(*base_filter).group_by(
        func.coalesce(User.category, 'N/A')
    ).order_by(desc('headcount')).all()

    data = []
    for value, count in role_rows:
        data.append({"dimension": "Role", "value": value, "headcount": count,
                      "percentage": round(count / total_users * 100, 1) if total_users else 0})
    for value, count in store_rows:
        data.append({"dimension": "Store", "value": value, "headcount": count,
                      "percentage": round(count / total_users * 100, 1) if total_users else 0})
    for value, count in cat_rows:
        data.append({"dimension": "Category", "value": value, "headcount": count,
                      "percentage": round(count / total_users * 100, 1) if total_users else 0})
    return {"report_name": "Headcount Report", "data": data, "total_users": total_users}

@router.get("/participants/headcount/excel")
async def headcount_excel(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    r = await headcount_report(db, current_user)
    return _excel(r["data"], "headcount_report.xlsx", "Headcount")

@router.get("/participants/new-joiners")
async def new_joiners_report(days: int = Query(90), db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """New joiners in last N days with gender ratio from profile_data. Filtered by access grants."""
    is_superadmin, accessible_emails = _get_accessible_filter(db, current_user)

    cutoff = datetime.utcnow() - timedelta(days=days)
    query = db.query(User).filter(User.created_at >= cutoff, User.category != 'Admin')
    if not is_superadmin and accessible_emails:
        query = query.filter(User.email.in_(accessible_emails))
    users = query.all()

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
async def new_joiners_excel(days: int = Query(90), db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    r = await new_joiners_report(days, db, current_user)
    return _excel(r["data"], "new_joiners_report.xlsx", "New Joiners")

@router.get("/participants/attrition")
async def attrition_report(days: int = Query(90), db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """Users inactive for extended periods (potential attrition). Filtered by access grants."""
    is_superadmin, accessible_emails = _get_accessible_filter(db, current_user)

    cutoff = datetime.utcnow() - timedelta(days=days)
    query = db.query(User).filter(
        or_(User.last_active < cutoff, User.last_active.is_(None)),
        User.category != 'Admin'
    )
    if not is_superadmin and accessible_emails:
        query = query.filter(User.email.in_(accessible_emails))
    users = query.all()

    now = datetime.utcnow()
    data = []
    for u in users:
        inactive_days = (now - u.last_active).days if u.last_active else 999
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
async def attrition_excel(days: int = Query(90), db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    r = await attrition_report(days, db, current_user)
    return _excel(r["data"], "attrition_report.xlsx", "Attrition")

@router.get("/participants/stakeholder-mapping")
async def stakeholder_mapping(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """Users grouped by store with their roles and completion stats. Filtered by access grants."""
    is_superadmin, accessible_emails = _get_accessible_filter(db, current_user)

    comp_sub = db.query(
        CourseCompletion.user_email,
        func.count(CourseCompletion.id).label('comp_count')
    ).group_by(CourseCompletion.user_email).subquery()

    query = db.query(
        User, comp_sub.c.comp_count
    ).outerjoin(
        comp_sub, User.email == comp_sub.c.user_email
    ).filter(User.category != 'Admin')

    if not is_superadmin and accessible_emails:
        query = query.filter(User.email.in_(accessible_emails))

    rows = query.all()

    data = []
    for u, comp_count in rows:
        data.append({
            "name": u.name, "email": u.email, "role": u.role or "N/A",
            "store": u.store or "Unassigned", "category": u.category or "N/A",
            "courses_completed": comp_count or 0, "xp_points": u.xp_points or 0,
            "is_external": "Yes" if u.is_external else "No",
        })
    return {"report_name": "Stakeholder Mapping Report", "data": data, "total": len(data)}

@router.get("/participants/stakeholder-mapping/excel")
async def stakeholder_excel(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    r = await stakeholder_mapping(db, current_user)
    return _excel(r["data"], "stakeholder_mapping.xlsx", "Stakeholders")

@router.get("/participants/export-users")
async def export_users_report(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """Full user export with all profile fields. Filtered by access grants."""
    is_superadmin, accessible_emails = _get_accessible_filter(db, current_user)

    query = db.query(User).filter(User.category != 'Admin')
    if not is_superadmin and accessible_emails:
        query = query.filter(User.email.in_(accessible_emails))
    users = query.all()

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
async def export_users_excel(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    r = await export_users_report(db, current_user)
    return _excel(r["data"], "export_users.xlsx", "Users")

@router.get("/participants/user-deactivation")
async def user_deactivation_report(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """Users never logged in or inactive >180 days. Filtered by access grants."""
    is_superadmin, accessible_emails = _get_accessible_filter(db, current_user)

    cutoff_180 = datetime.utcnow() - timedelta(days=180)
    query = db.query(User).filter(
        User.category != 'Admin',
        or_(User.last_active.is_(None), User.last_active < cutoff_180)
    )
    if not is_superadmin and accessible_emails:
        query = query.filter(User.email.in_(accessible_emails))
    users = query.all()

    now = datetime.utcnow()
    data = []
    for u in users:
        days_inactive = (now - u.last_active).days if u.last_active else 999
        data.append({
            "name": u.name, "email": u.email, "role": u.role or "N/A",
            "store": u.store or "Unassigned",
            "last_active": u.last_active.strftime('%Y-%m-%d') if u.last_active else "Never",
            "days_inactive": days_inactive,
            "recommendation": "Deactivate" if (u.last_active is None or (now - u.last_active).days > 365) else "Review",
        })
    return {"report_name": "User Deactivation Report", "data": data, "total": len(data)}

@router.get("/participants/user-deactivation/excel")
async def user_deactivation_excel(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    r = await user_deactivation_report(db, current_user)
    return _excel(r["data"], "user_deactivation.xlsx", "Deactivation")


# ============================================================
# LEARNING CATEGORY
# ============================================================

@router.get("/learning/completion-overview")
async def completion_overview(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """Overall completion stats across all courses. Filtered by access grants."""
    is_superadmin, accessible_emails = _get_accessible_filter(db, current_user)

    query = db.query(
        CourseCompletion.course_id,
        CourseCompletion.course_title,
        CourseCompletion.bucket,
        func.count(CourseCompletion.id).label('total_completions'),
        func.avg(CourseCompletion.score).label('avg_score'),
        func.sum(case(
            (CourseCompletion.score_percent >= 70, 1),
            else_=0
        )).label('pass_count')
    )

    if not is_superadmin and accessible_emails:
        query = query.filter(CourseCompletion.user_email.in_(accessible_emails))

    rows = query.group_by(
        CourseCompletion.course_id,
        CourseCompletion.course_title,
        CourseCompletion.bucket
    ).order_by(desc('total_completions')).all()

    data = []
    for course_id, course_title, bucket, total_completions, avg_score, pass_count in rows:
        tc = total_completions or 0
        pc = pass_count or 0
        data.append({
            "course_id": course_id,
            "course_title": course_title or course_id,
            "bucket": bucket or "N/A",
            "total_completions": tc,
            "avg_score": round(float(avg_score or 0), 1),
            "pass_count": pc,
            "pass_rate": round(pc / tc * 100, 1) if tc else 0,
        })
    return {"report_name": "Completion Overview Report", "data": data, "total": len(data)}

@router.get("/learning/completion-overview/excel")
async def completion_overview_excel(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    r = await completion_overview(db, current_user)
    return _excel(r["data"], "completion_overview.xlsx", "Completions")

@router.get("/learning/assessment-results")
async def assessment_results(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """Detailed assessment submission results per user. Filtered by access grants."""
    is_superadmin, accessible_emails = _get_accessible_filter(db, current_user)

    query = db.query(AssessmentSubmission).order_by(desc(AssessmentSubmission.submitted_at))
    if not is_superadmin and accessible_emails:
        query = query.filter(AssessmentSubmission.user_email.in_(accessible_emails))
    subs = query.all()

    data = [{
        "user_name": s.user_name or s.user_email, "user_email": s.user_email,
        "assessment_title": s.assessment_title or s.assessment_id,
        "score_percent": round(s.score_percent or 0, 1), "passed": "Yes" if s.passed else "No",
        "violations": s.violations or 0, "integrity_status": s.integrity_status or "N/A",
        "submitted_at": s.submitted_at.strftime('%Y-%m-%d %H:%M') if s.submitted_at else "",
    } for s in subs]
    return {"report_name": "Assessment Results", "data": data, "total": len(data)}

@router.get("/learning/assessment-results/excel")
async def assessment_results_excel(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    r = await assessment_results(db, current_user)
    return _excel(r["data"], "assessment_results.xlsx", "Assessment Results")

@router.get("/learning/learning-history")
async def learning_history(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """Per-user learning history with all completions. Filtered by access grants."""
    is_superadmin, accessible_emails = _get_accessible_filter(db, current_user)

    query = db.query(CourseCompletion).order_by(desc(CourseCompletion.completed_at))
    if not is_superadmin and accessible_emails:
        query = query.filter(CourseCompletion.user_email.in_(accessible_emails))
    completions = query.all()

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
async def learning_history_excel(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    r = await learning_history(db, current_user)
    return _excel(r["data"], "learning_history.xlsx", "Learning History")

@router.get("/learning/course-status")
async def course_status_report(db: Session = Depends(get_db)):
    """Status of all courses - completions, active learners."""
    comp_sub = db.query(
        CourseCompletion.course_id,
        func.count(CourseCompletion.id).label('completed_users')
    ).group_by(CourseCompletion.course_id).subquery()

    prog_sub = db.query(
        VideoProgress.node_id,
        func.count(VideoProgress.id).label('in_progress_users')
    ).filter(
        VideoProgress.completed == False
    ).group_by(VideoProgress.node_id).subquery()

    rows = db.query(
        Content,
        comp_sub.c.completed_users,
        prog_sub.c.in_progress_users
    ).outerjoin(
        comp_sub, Content.id == comp_sub.c.course_id
    ).outerjoin(
        prog_sub, Content.id == prog_sub.c.node_id
    ).all()

    data = []
    for c, completed_users, in_progress_users in rows:
        data.append({
            "course_title": c.title, "course_id": str(c.id),
            "resource_type": c.resource_type or "N/A", "bucket": c.bucket or "N/A",
            "completed_users": completed_users or 0, "in_progress_users": in_progress_users or 0,
            "is_published": "Yes" if c.is_published else "No",
            "created_at": c.created_at.strftime('%Y-%m-%d') if c.created_at else "",
        })
    return {"report_name": "Course Status Report", "data": data, "total": len(data)}

@router.get("/learning/course-status/excel")
async def course_status_excel(db: Session = Depends(get_db)):
    r = await course_status_report(db)
    return _excel(r["data"], "course_status.xlsx", "Course Status")

@router.get("/learning/course-completion")
async def course_completion_report(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """Detailed course completion records. Filtered by access grants."""
    is_superadmin, accessible_emails = _get_accessible_filter(db, current_user)

    query = db.query(CourseCompletion).order_by(desc(CourseCompletion.completed_at)).limit(2000)
    if not is_superadmin and accessible_emails:
        query = query.filter(CourseCompletion.user_email.in_(accessible_emails))
    comps = query.all()

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
async def course_completion_excel(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    r = await course_completion_report(db, current_user)
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
async def training_coverage(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """Training coverage: % of users who completed each course. Filtered by access grants."""
    is_superadmin, accessible_emails = _get_accessible_filter(db, current_user)

    user_filter = [User.category != 'Admin']
    if not is_superadmin and accessible_emails:
        user_filter.append(User.email.in_(accessible_emails))
    total_users = db.query(func.count(User.id)).filter(*user_filter).scalar() or 1

    comp_query = db.query(
        CourseCompletion.course_id,
        func.count(distinct(CourseCompletion.user_email)).label('users_completed')
    )
    if not is_superadmin and accessible_emails:
        comp_query = comp_query.filter(CourseCompletion.user_email.in_(accessible_emails))
    comp_sub = comp_query.group_by(CourseCompletion.course_id).subquery()

    rows = db.query(
        Content.title,
        Content.id,
        Content.bucket,
        comp_sub.c.users_completed
    ).outerjoin(
        comp_sub, Content.id == comp_sub.c.course_id
    ).filter(Content.is_path_node == True).all()

    data = []
    for title, content_id, bucket, users_completed in rows:
        uc = users_completed or 0
        data.append({
            "course_title": title, "bucket": bucket or "N/A",
            "users_completed": uc, "total_users": total_users,
            "coverage_percent": round(uc / total_users * 100, 1),
        })
    data.sort(key=lambda x: -x["coverage_percent"])
    return {"report_name": "Training Coverage", "data": data, "total": len(data)}

@router.get("/training/training-coverage/excel")
async def training_coverage_excel(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    r = await training_coverage(db, current_user)
    return _excel(r["data"], "training_coverage.xlsx", "Training Coverage")

@router.get("/training/attendance-tracker")
async def attendance_tracker(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """Attendance punch-in/out records. Filtered by access grants."""
    is_superadmin, accessible_emails = _get_accessible_filter(db, current_user)

    query = db.query(AttendanceRecord).order_by(desc(AttendanceRecord.punch_in)).limit(2000)
    if not is_superadmin and accessible_emails:
        query = query.filter(AttendanceRecord.user_email.in_(accessible_emails))
    records = query.all()

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
async def attendance_tracker_excel(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    r = await attendance_tracker(db, current_user)
    return _excel(r["data"], "attendance_tracker.xlsx", "Attendance")

@router.get("/training/training-master")
async def training_master(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """Master training report - users x courses matrix. Filtered by access grants."""
    is_superadmin, accessible_emails = _get_accessible_filter(db, current_user)

    comp_sub = db.query(
        CourseCompletion.user_email,
        func.count(CourseCompletion.id).label('courses_completed'),
        func.sum(func.coalesce(CourseCompletion.time_spent_seconds, 0)).label('total_time'),
        func.avg(CourseCompletion.score).label('avg_score')
    ).group_by(CourseCompletion.user_email).subquery()

    quiz_sub = db.query(
        QuizSubmission.user_email,
        func.count(QuizSubmission.id).label('quizzes_taken')
    ).group_by(QuizSubmission.user_email).subquery()

    query = db.query(
        User,
        comp_sub.c.courses_completed,
        comp_sub.c.total_time,
        comp_sub.c.avg_score,
        quiz_sub.c.quizzes_taken
    ).outerjoin(
        comp_sub, User.email == comp_sub.c.user_email
    ).outerjoin(
        quiz_sub, User.email == quiz_sub.c.user_email
    ).filter(User.category != 'Admin')

    if not is_superadmin and accessible_emails:
        query = query.filter(User.email.in_(accessible_emails))

    rows = query.all()

    data = []
    for u, courses_completed, total_time, avg_score, quizzes_taken in rows:
        cc = courses_completed or 0
        qt = quizzes_taken or 0
        tt = total_time or 0
        avs = float(avg_score) if avg_score else 0
        data.append({
            "name": u.name, "email": u.email, "role": u.role or "N/A",
            "store": u.store or "Unassigned",
            "courses_completed": cc, "quizzes_taken": qt,
            "avg_score": round(avs, 1),
            "total_learning_hours": round(tt / 3600, 1),
            "xp_points": u.xp_points or 0,
        })
    data.sort(key=lambda x: -x["courses_completed"])
    return {"report_name": "Training Master Report", "data": data, "total": len(data)}

@router.get("/training/training-master/excel")
async def training_master_excel(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    r = await training_master(db, current_user)
    return _excel(r["data"], "training_master.xlsx", "Training Master")

@router.get("/training/ilt-report")
async def ilt_report(db: Session = Depends(get_db)):
    """Instructor-Led Training (scheduled exams as ILT proxy)."""
    att_sub = db.query(
        ExamAttendance.exam_id,
        func.count(ExamAttendance.id).label('attended')
    ).filter(
        ExamAttendance.marked_present == True
    ).group_by(ExamAttendance.exam_id).subquery()

    rows = db.query(
        ScheduledExam, att_sub.c.attended
    ).outerjoin(
        att_sub, ScheduledExam.id == att_sub.c.exam_id
    ).order_by(desc(ScheduledExam.created_at)).all()

    data = []
    for e, att_count in rows:
        ac = att_count or 0
        total_assigned = len(e.assigned_users or [])
        data.append({
            "title": e.title, "exam_date": e.exam_date or "N/A",
            "location": e.location or "N/A", "status": e.status or "N/A",
            "supervisor": e.supervisor_name or e.supervisor_email or "N/A",
            "assigned_users": total_assigned, "attended": ac,
            "attendance_rate": round(ac / total_assigned * 100, 1) if total_assigned else 0,
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
async def career_summary(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """Career progression summary per user. Filtered by access grants."""
    is_superadmin, accessible_emails = _get_accessible_filter(db, current_user)

    cp_sub = db.query(
        CourseCompletion.user_email,
        func.count(CourseCompletion.id).label('career_modules_completed')
    ).filter(
        CourseCompletion.learning_path_type == 'career_progression'
    ).group_by(CourseCompletion.user_email).subquery()

    node_sub = db.query(
        UserNodeProgress.user_email,
        func.count(UserNodeProgress.id).label('nodes_in_progress')
    ).group_by(UserNodeProgress.user_email).subquery()

    query = db.query(
        User,
        cp_sub.c.career_modules_completed,
        node_sub.c.nodes_in_progress
    ).outerjoin(
        cp_sub, User.email == cp_sub.c.user_email
    ).outerjoin(
        node_sub, User.email == node_sub.c.user_email
    ).filter(User.category != 'Admin')

    if not is_superadmin and accessible_emails:
        query = query.filter(User.email.in_(accessible_emails))

    rows = query.all()

    data = []
    for u, career_modules, nodes in rows:
        data.append({
            "name": u.name, "email": u.email, "current_role": u.role or "N/A",
            "store": u.store or "Unassigned",
            "career_modules_completed": career_modules or 0,
            "nodes_in_progress": nodes or 0, "xp_points": u.xp_points or 0,
        })
    data.sort(key=lambda x: -x["career_modules_completed"])
    return {"report_name": "Career Progression Summary", "data": data, "total": len(data)}

@router.get("/career/summary/excel")
async def career_summary_excel(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    r = await career_summary(db, current_user)
    return _excel(r["data"], "career_summary.xlsx", "Career Summary")

@router.get("/career/module-report")
async def module_report(db: Session = Depends(get_db)):
    """Career progression by module/bucket."""
    # Single query: CourseBucket LEFT JOIN Content on bucket_id, LEFT JOIN CourseCompletion on course_id
    # GROUP BY bucket fields
    content_sub = db.query(
        Content.bucket_id,
        func.count(Content.id).label('total_courses')
    ).group_by(Content.bucket_id).subquery()

    # Completions for content items within each bucket
    comp_sub = db.query(
        Content.bucket_id,
        func.count(CourseCompletion.id).label('total_completions')
    ).join(
        CourseCompletion, CourseCompletion.course_id == Content.id
    ).group_by(Content.bucket_id).subquery()

    rows = db.query(
        CourseBucket.name,
        CourseBucket.id,
        CourseBucket.is_linear,
        content_sub.c.total_courses,
        comp_sub.c.total_completions
    ).outerjoin(
        content_sub, CourseBucket.id == content_sub.c.bucket_id
    ).outerjoin(
        comp_sub, CourseBucket.id == comp_sub.c.bucket_id
    ).filter(
        CourseBucket.learning_path_type == 'career_progression'
    ).all()

    data = []
    for name, bucket_id, is_linear, total_courses, total_completions in rows:
        data.append({
            "module_name": name, "module_id": bucket_id,
            "total_courses": total_courses or 0, "total_completions": total_completions or 0,
            "is_linear": "Yes" if is_linear else "No",
        })
    return {"report_name": "Module Report", "data": data, "total": len(data)}

@router.get("/career/module-report/excel")
async def module_report_excel(db: Session = Depends(get_db)):
    r = await module_report(db)
    return _excel(r["data"], "module_report.xlsx", "Modules")

@router.get("/career/node-progress")
async def node_progress_report(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """Detailed node-level progress across all users. Filtered by access grants."""
    is_superadmin, accessible_emails = _get_accessible_filter(db, current_user)

    query = db.query(UserNodeProgress).order_by(desc(UserNodeProgress.last_accessed)).limit(2000)
    if not is_superadmin and accessible_emails:
        query = query.filter(UserNodeProgress.user_email.in_(accessible_emails))
    progress = query.all()

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
async def node_progress_excel(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    r = await node_progress_report(db, current_user)
    return _excel(r["data"], "node_progress.xlsx", "Node Progress")


# ============================================================
# ASSESSMENTS & EXAMS CATEGORY
# ============================================================

@router.get("/exams/overview")
async def exams_overview(db: Session = Depends(get_db)):
    """All scheduled exams with stats."""
    sub_stats = db.query(
        AssessmentSubmission.assessment_id,
        func.count(AssessmentSubmission.id).label('total_submissions'),
        func.sum(case(
            (AssessmentSubmission.passed == True, 1),
            else_=0
        )).label('passed'),
        func.avg(AssessmentSubmission.score_percent).label('avg_score')
    ).group_by(AssessmentSubmission.assessment_id).subquery()

    rows = db.query(
        ScheduledExam, sub_stats.c.total_submissions, sub_stats.c.passed, sub_stats.c.avg_score
    ).outerjoin(
        sub_stats, ScheduledExam.id == sub_stats.c.assessment_id
    ).order_by(desc(ScheduledExam.created_at)).all()

    data = []
    for e, total_subs, passed, avg_score in rows:
        ts = total_subs or 0
        pc = passed or 0
        data.append({
            "title": e.title, "exam_date": e.exam_date or "N/A",
            "status": e.status or "N/A", "location": e.location or "N/A",
            "total_submissions": ts, "passed": pc,
            "pass_rate": round(pc / ts * 100, 1) if ts else 0,
            "avg_score": round(float(avg_score or 0), 1),
            "time_limit": e.time_limit_minutes or 30,
        })
    return {"report_name": "Exams Overview", "data": data, "total": len(data)}

@router.get("/exams/overview/excel")
async def exams_overview_excel(db: Session = Depends(get_db)):
    r = await exams_overview(db)
    return _excel(r["data"], "exams_overview.xlsx", "Exams Overview")

@router.get("/exams/quiz-results")
async def quiz_results(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """All quiz submission results. Filtered by access grants."""
    is_superadmin, accessible_emails = _get_accessible_filter(db, current_user)

    # QuizSubmission.passed is a @property, not a column.
    # We join with Quiz to get passing_score and compute passed in Python.
    query = db.query(
        QuizSubmission, Quiz.passing_score
    ).outerjoin(
        Quiz, QuizSubmission.quiz_id == Quiz.id
    ).order_by(desc(QuizSubmission.submitted_at)).limit(2000)

    if not is_superadmin and accessible_emails:
        query = query.filter(QuizSubmission.user_email.in_(accessible_emails))

    rows = query.all()

    data = [{
        "user_name": s.user_name, "user_email": s.user_email or "N/A",
        "quiz_id": s.quiz_id, "score": round(s.score or 0, 1),
        "passed": "Yes" if (s.score or 0) >= (passing_score if passing_score is not None else 70) else "No",
        "submitted_at": s.submitted_at.strftime('%Y-%m-%d %H:%M') if s.submitted_at else "",
    } for s, passing_score in rows]
    return {"report_name": "Quiz Results", "data": data, "total": len(data)}

@router.get("/exams/quiz-results/excel")
async def quiz_results_excel(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    r = await quiz_results(db, current_user)
    return _excel(r["data"], "quiz_results.xlsx", "Quiz Results")

@router.get("/exams/exam-attendance")
async def exam_attendance_report(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """Exam attendance per scheduled exam. Filtered by access grants."""
    is_superadmin, accessible_emails = _get_accessible_filter(db, current_user)

    query = db.query(
        ExamAttendance, ScheduledExam.title
    ).outerjoin(
        ScheduledExam, ExamAttendance.exam_id == ScheduledExam.id
    ).order_by(desc(ExamAttendance.marked_at))

    if not is_superadmin and accessible_emails:
        query = query.filter(ExamAttendance.user_email.in_(accessible_emails))

    rows = query.all()

    data = []
    for r, exam_title in rows:
        data.append({
            "exam_title": exam_title if exam_title else r.exam_id,
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
async def exam_attendance_excel(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    r = await exam_attendance_report(db, current_user)
    return _excel(r["data"], "exam_attendance.xlsx", "Exam Attendance")

@router.get("/exams/submission-history")
async def submission_history(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """Full assessment submission history with integrity data. Filtered by access grants."""
    is_superadmin, accessible_emails = _get_accessible_filter(db, current_user)

    query = db.query(AssessmentSubmission).order_by(desc(AssessmentSubmission.submitted_at)).limit(2000)
    if not is_superadmin and accessible_emails:
        query = query.filter(AssessmentSubmission.user_email.in_(accessible_emails))
    subs = query.all()

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
async def submission_history_excel(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    r = await submission_history(db, current_user)
    return _excel(r["data"], "submission_history.xlsx", "Submissions")


# ============================================================
# REWARDS & RECOGNITION CATEGORY
# ============================================================

@router.get("/rewards/points-overview")
async def points_overview(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """Points/XP overview across all users. Filtered by access grants."""
    is_superadmin, accessible_emails = _get_accessible_filter(db, current_user)

    comp_sub = db.query(
        CourseCompletion.user_email,
        func.count(CourseCompletion.id).label('courses_completed')
    ).group_by(CourseCompletion.user_email).subquery()

    query = db.query(
        User, comp_sub.c.courses_completed
    ).outerjoin(
        comp_sub, User.email == comp_sub.c.user_email
    ).filter(
        User.category != 'Admin', User.xp_points > 0
    ).order_by(desc(User.xp_points))

    if not is_superadmin and accessible_emails:
        query = query.filter(User.email.in_(accessible_emails))

    rows = query.all()

    data = [{
        "name": u.name, "email": u.email, "role": u.role or "N/A",
        "store": u.store or "Unassigned", "xp_points": u.xp_points or 0,
        "courses_completed": courses_completed or 0,
        "rank": idx + 1,
    } for idx, (u, courses_completed) in enumerate(rows)]
    return {"report_name": "Points Overview Report", "data": data, "total": len(data)}

@router.get("/rewards/points-overview/excel")
async def points_overview_excel(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    r = await points_overview(db, current_user)
    return _excel(r["data"], "points_overview.xlsx", "Points Overview")

@router.get("/rewards/points-earned")
async def points_earned(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """XP earned per course completion. Filtered by access grants."""
    is_superadmin, accessible_emails = _get_accessible_filter(db, current_user)

    query = db.query(CourseCompletion).filter(CourseCompletion.xp_earned > 0).order_by(
        desc(CourseCompletion.completed_at))
    if not is_superadmin and accessible_emails:
        query = query.filter(CourseCompletion.user_email.in_(accessible_emails))
    comps = query.all()

    data = [{
        "user_email": c.user_email, "course_title": c.course_title or c.course_id,
        "xp_earned": c.xp_earned or 0, "score": round(c.score or 0, 1),
        "completed_at": c.completed_at.strftime('%Y-%m-%d %H:%M') if c.completed_at else "",
    } for c in comps]
    return {"report_name": "Points Earned Report", "data": data, "total": len(data)}

@router.get("/rewards/points-earned/excel")
async def points_earned_excel(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    r = await points_earned(db, current_user)
    return _excel(r["data"], "points_earned.xlsx", "Points Earned")

@router.get("/rewards/leaderboard")
async def leaderboard_report(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """Full leaderboard ranking. Filtered by access grants."""
    is_superadmin, accessible_emails = _get_accessible_filter(db, current_user)

    comp_sub = db.query(
        CourseCompletion.user_email,
        func.count(CourseCompletion.id).label('courses_completed')
    ).group_by(CourseCompletion.user_email).subquery()

    quiz_sub = db.query(
        QuizSubmission.user_email,
        func.count(QuizSubmission.id).label('quizzes_taken')
    ).group_by(QuizSubmission.user_email).subquery()

    query = db.query(
        User,
        comp_sub.c.courses_completed,
        quiz_sub.c.quizzes_taken
    ).outerjoin(
        comp_sub, User.email == comp_sub.c.user_email
    ).outerjoin(
        quiz_sub, User.email == quiz_sub.c.user_email
    ).filter(User.category != 'Admin')

    if not is_superadmin and accessible_emails:
        query = query.filter(User.email.in_(accessible_emails))

    rows = query.all()

    board = []
    for u, courses_completed, quizzes_taken in rows:
        comps = courses_completed or 0
        quizzes = quizzes_taken or 0
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
async def leaderboard_excel(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    r = await leaderboard_report(db, current_user)
    return _excel(r["data"], "leaderboard.xlsx", "Leaderboard")

@router.get("/rewards/xp-summary")
async def xp_summary(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """XP distribution summary by role and store. Filtered by access grants."""
    is_superadmin, accessible_emails = _get_accessible_filter(db, current_user)

    base_filter = [User.category != 'Admin']
    if not is_superadmin and accessible_emails:
        base_filter.append(User.email.in_(accessible_emails))

    role_rows = db.query(
        func.coalesce(User.role, 'N/A').label('value'),
        func.sum(func.coalesce(User.xp_points, 0)).label('total_xp'),
        func.count(User.id).label('user_count')
    ).filter(*base_filter).group_by(
        func.coalesce(User.role, 'N/A')
    ).all()

    store_rows = db.query(
        func.coalesce(User.store, 'Unassigned').label('value'),
        func.sum(func.coalesce(User.xp_points, 0)).label('total_xp'),
        func.count(User.id).label('user_count')
    ).filter(*base_filter).group_by(
        func.coalesce(User.store, 'Unassigned')
    ).all()

    data = []
    for value, total_xp, user_count in role_rows:
        tx = int(total_xp or 0)
        uc = user_count or 0
        data.append({"dimension": "Role", "value": value, "total_xp": tx,
                      "user_count": uc, "avg_xp": round(tx / uc, 1) if uc else 0})
    for value, total_xp, user_count in store_rows:
        tx = int(total_xp or 0)
        uc = user_count or 0
        data.append({"dimension": "Store", "value": value, "total_xp": tx,
                      "user_count": uc, "avg_xp": round(tx / uc, 1) if uc else 0})
    return {"report_name": "XP Summary", "data": data, "total": len(data)}

@router.get("/rewards/xp-summary/excel")
async def xp_summary_excel(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    r = await xp_summary(db, current_user)
    return _excel(r["data"], "xp_summary.xlsx", "XP Summary")
