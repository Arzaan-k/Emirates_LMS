"""
Reports Generation Endpoints
Comprehensive analytics reports with real data - CSV/Excel and PDF export support
Based on 25+ years of business analytics experience
"""

import logging
import csv
import io
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta, date
from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_, desc

from app.config.database import get_db
from app.models.user import User, UserNodeProgress, UserLearningProfile, UserInteraction
from app.models.content import Content, CourseBucket, Resource
from app.models.assessment import AssessmentSubmission, ScheduledExam, ExamAttendance
from app.models.quiz import Quiz, QuizSubmission, LiveQuiz
from app.models.tracking import CourseCompletion, AttendanceRecord, LocationTracking
from app.models.simulation import Simulation, SimulationProgress
from app.models.analytics import AuditLog

# PDF Generation imports
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib.units import inch
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/reports", tags=["Reports"])


# ==========================================
# HELPER FUNCTIONS
# ==========================================

def generate_csv_buffer(data: List[Dict]) -> io.StringIO:
    """Generate a CSV buffer from data list."""
    output = io.StringIO()
    if not data:
        output.write("No data available")
    else:
        writer = csv.DictWriter(output, fieldnames=data[0].keys())
        writer.writeheader()
        writer.writerows(data)
    output.seek(0)
    return output

def generate_csv_response(data: List[Dict], filename: str) -> StreamingResponse:
    """Generate a CSV file response for download."""
    output = generate_csv_buffer(data)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


def generate_pdf_report(
    report_type: str,
    title: str,
    summary: Dict[str, Any],
    data: List[Dict],
    columns: List[Dict],
    insights: List[str] = None,
    additional_sections: List[Dict] = None
) -> io.BytesIO:
    """
    Generate a professional PDF report with summary, insights, and data table.
    
    Args:
        report_type: Type of report (e.g., 'users', 'training')
        title: Report title
        summary: Summary metrics dictionary
        data: List of data rows
        columns: Column definitions with 'key' and 'label'
        insights: List of insight strings
        additional_sections: Additional sections to include
    
    Returns:
        BytesIO buffer containing the PDF
    """
    buffer = io.BytesIO()
    
    # Use landscape for reports with many columns
    page_size = landscape(letter) if len(columns) > 5 else letter
    doc = SimpleDocTemplate(buffer, pagesize=page_size, topMargin=0.5*inch, bottomMargin=0.5*inch)
    
    # Styles
    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        spaceAfter=20,
        textColor=colors.HexColor('#F59E0B'),
        alignment=TA_CENTER
    )
    
    subtitle_style = ParagraphStyle(
        'CustomSubtitle',
        parent=styles['Normal'],
        fontSize=12,
        textColor=colors.HexColor('#6B7280'),
        alignment=TA_CENTER,
        spaceAfter=30
    )
    
    section_style = ParagraphStyle(
        'SectionTitle',
        parent=styles['Heading2'],
        fontSize=16,
        textColor=colors.HexColor('#111827'),
        spaceBefore=20,
        spaceAfter=10
    )
    
    insight_style = ParagraphStyle(
        'Insight',
        parent=styles['Normal'],
        fontSize=11,
        textColor=colors.HexColor('#4338CA'),
        leftIndent=20,
        spaceBefore=5,
        spaceAfter=5
    )
    
    normal_style = ParagraphStyle(
        'CustomNormal',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.HexColor('#374151')
    )
    
    elements = []
    
    # Title
    elements.append(Paragraph(f"📊 {title}", title_style))
    elements.append(Paragraph(
        f"Generated on {datetime.utcnow().strftime('%B %d, %Y at %I:%M %p UTC')}",
        subtitle_style
    ))
    elements.append(Spacer(1, 10))
    
    # Summary Section
    if summary:
        elements.append(Paragraph("📈 Summary Metrics", section_style))
        
        # Filter out items with long text values (over 50 chars) to prevent overflow
        filtered_items = []
        for key, value in summary.items():
            val_str = f"{value:,}" if isinstance(value, (int, float)) else str(value)
            # Skip very long values or nested objects
            if len(val_str) <= 50 and not isinstance(value, dict):
                filtered_items.append((key, val_str))
        
        # Create summary table (2 columns layout)
        summary_rows = []
        
        # Style for table cells with wrapping
        cell_label_style = ParagraphStyle(
            'CellLabel',
            parent=styles['Normal'],
            fontSize=10,
            textColor=colors.HexColor('#374151')
        )
        cell_value_style = ParagraphStyle(
            'CellValue',
            parent=styles['Normal'],
            fontSize=12,
            textColor=colors.HexColor('#F59E0B'),
            fontName='Helvetica-Bold',
            alignment=TA_RIGHT
        )
        
        for i in range(0, len(filtered_items), 2):
            row = []
            for j in range(2):
                if i + j < len(filtered_items):
                    key, val_str = filtered_items[i + j]
                    label = key.replace('_', ' ').title()
                    row.append(Paragraph(label, cell_label_style))
                    row.append(Paragraph(val_str, cell_value_style))
                else:
                    row.extend(["", ""])
            summary_rows.append(row)
        
        if summary_rows:
            summary_table = Table(summary_rows, colWidths=[2*inch, 1.5*inch, 2*inch, 1.5*inch])
            summary_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F9FAFB')),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
                ('TOPPADDING', (0, 0), (-1, -1), 10),
                ('LEFTPADDING', (0, 0), (-1, -1), 8),
                ('RIGHTPADDING', (0, 0), (-1, -1), 8),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E5E7EB')),
            ]))
            elements.append(summary_table)
            elements.append(Spacer(1, 20))
    
    # Insights Section
    if insights:
        elements.append(Paragraph("💡 Key Insights", section_style))
        for insight in insights:
            elements.append(Paragraph(f"• {insight}", insight_style))
        elements.append(Spacer(1, 20))
    
    # Data Table
    if data and columns:
        elements.append(Paragraph("📋 Detailed Data", section_style))
        
        # Prepare table data
        header_row = [col['label'] for col in columns]
        table_data = [header_row]
        
        # Limit to 50 rows for PDF
        for row in data[:50]:
            table_row = []
            for col in columns:
                val = row.get(col['key'], '-')
                if val is None:
                    val = '-'
                elif isinstance(val, float):
                    val = f"{val:.1f}"
                else:
                    val = str(val)[:30]  # Truncate long values
                table_row.append(val)
            table_data.append(table_row)
        
        # Calculate column widths
        available_width = page_size[0] - inch
        col_width = available_width / len(columns)
        
        data_table = Table(table_data, colWidths=[col_width] * len(columns))
        data_table.setStyle(TableStyle([
            # Header styling
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#F59E0B')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('TOPPADDING', (0, 0), (-1, 0), 12),
            
            # Body styling
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
            ('ALIGN', (0, 1), (-1, -1), 'LEFT'),
            ('BOTTOMPADDING', (0, 1), (-1, -1), 8),
            ('TOPPADDING', (0, 1), (-1, -1), 8),
            
            # Alternate row colors
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F9FAFB')]),
            
            # Grid
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E5E7EB')),
        ]))
        elements.append(data_table)
        
        if len(data) > 50:
            elements.append(Spacer(1, 10))
            elements.append(Paragraph(
                f"Showing 50 of {len(data)} records. Download CSV for full data.",
                normal_style
            ))
    
    # Footer
    elements.append(Spacer(1, 30))
    footer_style = ParagraphStyle(
        'Footer',
        parent=styles['Normal'],
        fontSize=9,
        textColor=colors.HexColor('#9CA3AF'),
        alignment=TA_CENTER
    )
    elements.append(Paragraph(
        f"Report generated by BWC LMS Analytics • {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}",
        footer_style
    ))
    
    doc.build(elements)
    buffer.seek(0)
    return buffer


def generate_pdf_response(buffer: io.BytesIO, filename: str) -> StreamingResponse:
    """Generate a PDF file response for download."""
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# ==========================================
# OVERVIEW ENDPOINT
# ==========================================

@router.get("/overview")
async def get_reports_overview(db: Session = Depends(get_db)):
    """Get overview statistics for the main reports dashboard."""
    try:
        # Total users
        total_users = db.query(func.count(User.id)).scalar() or 0
        
        # Active users in last 30 days
        thirty_days_ago = datetime.utcnow() - timedelta(days=30)
        active_users = db.query(func.count(User.id)).filter(
            User.last_active >= thirty_days_ago
        ).scalar() or 0
        
        # Total course completions
        total_completions = db.query(func.count(CourseCompletion.id)).scalar() or 0
        
        # Completions this week
        week_ago = datetime.utcnow() - timedelta(days=7)
        weekly_completions = db.query(func.count(CourseCompletion.id)).filter(
            CourseCompletion.completed_at >= week_ago
        ).scalar() or 0
        
        # Average score
        avg_score = db.query(func.avg(CourseCompletion.score)).scalar() or 0
        
        # Total content items
        total_content = db.query(func.count(Content.id)).scalar() or 0
        
        # Total quizzes
        total_quizzes = db.query(func.count(Quiz.id)).scalar() or 0
        
        # Quiz submissions
        quiz_submissions = db.query(func.count(QuizSubmission.id)).scalar() or 0
        
        # Average quiz score
        avg_quiz_score = db.query(func.avg(QuizSubmission.score)).scalar() or 0
        
        # Assessments
        total_assessments = db.query(func.count(AssessmentSubmission.id)).scalar() or 0
        passed_count = db.query(func.count(AssessmentSubmission.id)).filter(
            AssessmentSubmission.passed == True
        ).scalar() or 0
        assessment_pass_rate = (passed_count / total_assessments) if total_assessments > 0 else 0
        
        # Today's attendance
        today = date.today()
        today_attendance = db.query(func.count(AttendanceRecord.id)).filter(
            func.date(AttendanceRecord.punch_in) == today
        ).scalar() or 0
        
        return {
            "summary": {
                "total_users": total_users,
                "active_users_30d": active_users,
                "total_completions": total_completions,
                "completions_this_week": weekly_completions,
                "avg_score": round(avg_score, 1) if avg_score else 0,
                "total_content": total_content,
                "total_quizzes": total_quizzes,
                "quiz_submissions": quiz_submissions,
                "avg_quiz_score": round(avg_quiz_score, 1) if avg_quiz_score else 0,
                "total_assessments": total_assessments,
                "assessment_pass_rate": round(assessment_pass_rate * 100, 1) if assessment_pass_rate else 0,
                "today_attendance": today_attendance,
            },
            "generated_at": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Error generating overview: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate overview")


# ==========================================
# USER ANALYTICS
# ==========================================

@router.get("/filters")
async def get_report_filters(db: Session = Depends(get_db)):
    """Get unique filter options for frontend dropdowns."""
    try:
        users = db.query(User).filter(User.category != 'Admin').all()
        
        roles = set()
        stores = set()
        categories = set()
        states = set()
        regions = set()
        cities = set()
        countries = set()
        
        for user in users:
            if user.role: roles.add(user.role)
            if user.store: stores.add(user.store)
            if user.category: categories.add(user.category)
            
            # Extract from profile_data
            if user.profile_data:
                if isinstance(user.profile_data, dict):
                    if user.profile_data.get('State'): states.add(user.profile_data['State'])
                    if user.profile_data.get('Region'): regions.add(user.profile_data['Region'])
                    if user.profile_data.get('City'): cities.add(user.profile_data['City'])
                    if user.profile_data.get('Country'): countries.add(user.profile_data['Country'])
        
        return {
            "roles": sorted(list(roles)),
            "stores": sorted(list(stores)),
            "categories": sorted(list(categories)),
            "states": sorted(list(states)),
            "regions": sorted(list(regions)),
            "cities": sorted(list(cities)),
            "countries": sorted(list(countries))
        }
    except Exception as e:
        logger.error(f"Error fetching filters: {e}")
        return {}


@router.get("/users")
async def get_user_analytics(
    role_filter: str = Query(None),
    store_filter: str = Query(None),
    date_from: str = Query(None),
    date_to: str = Query(None),
    search: str = Query(None),
    min_score: float = Query(None),
    state: str = Query(None),
    city: str = Query(None),
    region: str = Query(None),
    country: str = Query(None),
    category: str = Query(None),
    db: Session = Depends(get_db)
):
    """Get comprehensive user analytics with detailed filtering."""
    try:
        query = db.query(User).filter(User.category != 'Admin')

        if role_filter:
            query = query.filter(User.role == role_filter)
        if store_filter:
            query = query.filter(User.store == store_filter)
        if category:
            query = query.filter(User.category == category)
        
        # Search filter
        if search:
            query = query.filter(
                or_(
                    User.name.ilike(f"%{search}%"),
                    User.email.ilike(f"%{search}%")
                )
            )

        # Date range filter for user creation or last activity
        if date_from:
            date_from_dt = datetime.fromisoformat(date_from.replace('Z', '+00:00'))
            query = query.filter(
                or_(
                    User.created_at >= date_from_dt,
                    User.last_active >= date_from_dt
                )
            )
        if date_to:
            date_to_dt = datetime.fromisoformat(date_to.replace('Z', '+00:00'))
            query = query.filter(
                or_(
                    User.created_at <= date_to_dt,
                    User.last_active <= date_to_dt
                )
            )

        users = query.all()
        
        user_data = []
        for user in users:
            # Python-side filtering for JSON fields (safe for both Postgres/SQLite)
            p_data = user.profile_data or {}
            
            if state and p_data.get('State') != state: continue
            if city and p_data.get('City') != city: continue
            if region and p_data.get('Region') != region: continue
            if country and p_data.get('Country') != country: continue

            # Get course completions with date filter
            completions_query = db.query(CourseCompletion).filter(
                CourseCompletion.user_email == user.email
            )
            if date_from:
                date_from_dt = datetime.fromisoformat(date_from.replace('Z', '+00:00'))
                completions_query = completions_query.filter(CourseCompletion.completed_at >= date_from_dt)
            if date_to:
                date_to_dt = datetime.fromisoformat(date_to.replace('Z', '+00:00'))
                completions_query = completions_query.filter(CourseCompletion.completed_at <= date_to_dt)
            completions = completions_query.all()

            # Get quiz submissions with date filter
            quiz_subs_query = db.query(QuizSubmission).filter(
                QuizSubmission.user_email == user.email
            )
            if date_from:
                date_from_dt = datetime.fromisoformat(date_from.replace('Z', '+00:00'))
                quiz_subs_query = quiz_subs_query.filter(QuizSubmission.submitted_at >= date_from_dt)
            if date_to:
                date_to_dt = datetime.fromisoformat(date_to.replace('Z', '+00:00'))
                quiz_subs_query = quiz_subs_query.filter(QuizSubmission.submitted_at <= date_to_dt)
            quiz_subs = quiz_subs_query.all()
            
            avg_score = sum(c.score or 0 for c in completions) / len(completions) if completions else 0
            avg_quiz_score = sum(q.score or 0 for q in quiz_subs) / len(quiz_subs) if quiz_subs else 0
            
            # Min Score Filter
            if min_score is not None and avg_score < min_score:
                continue

            user_data.append({
                "name": user.name,
                "email": user.email,
                "role": user.role,
                "store": user.store or "Unassigned",
                "courses_completed": len(completions),
                "avg_course_score": round(avg_score, 1),
                "quizzes_taken": len(quiz_subs),
                "avg_quiz_score": round(avg_quiz_score, 1),
                "total_xp": user.xp_points or 0,
                "last_active": user.last_active.isoformat() if user.last_active else None,
            })
        
        # Summary
        total_users = len(user_data)
        active_users = sum(1 for u in user_data if u['courses_completed'] > 0)
        avg_completions = sum(u['courses_completed'] for u in user_data) / total_users if total_users else 0
        
        return {
            "summary": {
                "total_users": total_users,
                "active_users": active_users,
                "inactive_users": total_users - active_users,
                "avg_completions_per_user": round(avg_completions, 1),
            },
            "users": user_data,
            "generated_at": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Error generating user analytics: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate user analytics")


@router.get("/users/download")
async def download_user_analytics_csv(
    role_filter: str = Query(None),
    store_filter: str = Query(None),
    date_from: str = Query(None),
    date_to: str = Query(None),
    search: str = Query(None),
    min_score: float = Query(None),
    state: str = Query(None),
    city: str = Query(None),
    region: str = Query(None),
    category: str = Query(None),
    db: Session = Depends(get_db)
):
    """Download user analytics as CSV."""
    result = await get_user_analytics(
        role_filter, store_filter, date_from, date_to, 
        search, min_score, state, city, region, category, db
    )
    return generate_csv_response(
        result["users"],
        f"user_analytics_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
    )


@router.get("/users/pdf")
async def download_user_analytics_pdf(
    role_filter: str = Query(None),
    store_filter: str = Query(None),
    date_from: str = Query(None),
    date_to: str = Query(None),
    search: str = Query(None),
    min_score: float = Query(None),
    state: str = Query(None),
    city: str = Query(None),
    region: str = Query(None),
    category: str = Query(None),
    db: Session = Depends(get_db)
):
    """Download user analytics as PDF with insights."""
    result = await get_user_analytics(
        role_filter, store_filter, date_from, date_to, 
        search, min_score, state, city, region, category, db
    )
    
    users = result.get("users", [])
    summary = result.get("summary", {})
    
    # Generate insights
    insights = []
    if summary.get("total_users", 0) > 0:
        active_pct = (summary.get("active_users", 0) / summary.get("total_users", 1)) * 100
        insights.append(f"{active_pct:.0f}% of users have completed at least one course")
    
    if users:
        top_user = max(users, key=lambda x: x.get("courses_completed", 0))
        insights.append(f"Top performer: {top_user.get('name', 'Unknown')} with {top_user.get('courses_completed', 0)} courses completed")
        
        avg_xp = sum(u.get("total_xp", 0) for u in users) / len(users)
        insights.append(f"Average XP per user: {avg_xp:.0f} points")
    
    columns = [
        {"key": "name", "label": "Name"},
        {"key": "role", "label": "Role"},
        {"key": "store", "label": "Store"},
        {"key": "courses_completed", "label": "Courses"},
        {"key": "avg_course_score", "label": "Avg Score"},
        {"key": "total_xp", "label": "XP"},
    ]
    
    buffer = generate_pdf_report(
        "users",
        "User Analytics Report",
        summary,
        users,
        columns,
        insights
    )
    
    return generate_pdf_response(
        buffer,
        f"user_analytics_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.pdf"
    )


# ==========================================
# TRAINING EFFECTIVENESS
# ==========================================

@router.get("/training")
async def get_training_effectiveness(
    bucket_filter: str = Query(None),
    date_from: str = Query(None),
    date_to: str = Query(None),
    search: str = Query(None),
    min_score: float = Query(None),
    db: Session = Depends(get_db)
):
    """Get training effectiveness metrics with date range filtering."""
    try:
        query = db.query(Content)
        if bucket_filter:
            query = query.filter(Content.bucket_id == bucket_filter)
        
        if search:
            query = query.filter(Content.title.ilike(f"%{search}%"))

        content_items = query.all()

        course_data = []
        for content in content_items:
            completions_query = db.query(CourseCompletion).filter(
                CourseCompletion.course_id == str(content.id)
            )

            # Apply date filters
            if date_from:
                date_from_dt = datetime.fromisoformat(date_from.replace('Z', '+00:00'))
                completions_query = completions_query.filter(CourseCompletion.completed_at >= date_from_dt)
            if date_to:
                date_to_dt = datetime.fromisoformat(date_to.replace('Z', '+00:00'))
                completions_query = completions_query.filter(CourseCompletion.completed_at <= date_to_dt)

            completions = completions_query.all()
            
            total_completions = len(completions)
            avg_score = sum(c.score or 0 for c in completions) / total_completions if total_completions else 0
            
            # Min Score Filter
            if min_score is not None and avg_score < min_score:
                continue

            pass_count = sum(1 for c in completions if (c.score or 0) >= 70)
            pass_rate = (pass_count / total_completions * 100) if total_completions else 0
            
            bucket = db.query(CourseBucket).filter(CourseBucket.id == content.bucket_id).first()
            
            course_data.append({
                "id": str(content.id),
                "title": content.title,
                "bucket": bucket.name if bucket else "Uncategorized",
                "resource_type": content.resource_type,
                "total_completions": total_completions,
                "avg_score_percent": round(avg_score, 1),
                "pass_rate": round(pass_rate, 1),
            })
        
        # Summary
        total_courses = len(course_data)
        total_completions = sum(c["total_completions"] for c in course_data)
        avg_completion_rate = total_completions / total_courses if total_courses else 0
        
        return {
            "summary": {
                "total_courses": total_courses,
                "total_completions": total_completions,
                "avg_completions_per_course": round(avg_completion_rate, 1),
            },
            "courses": course_data,
            "generated_at": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Error generating training effectiveness: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate training report")


@router.get("/training/download")
async def download_training_csv(
    bucket_filter: str = Query(None),
    date_from: str = Query(None),
    date_to: str = Query(None),
    search: str = Query(None),
    min_score: float = Query(None),
    db: Session = Depends(get_db)
):
    """Download training effectiveness as CSV."""
    result = await get_training_effectiveness(bucket_filter, date_from, date_to, search, min_score, db)
    return generate_csv_response(
        result["courses"],
        f"training_effectiveness_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
    )


@router.get("/training/pdf")
async def download_training_pdf(
    bucket_filter: str = Query(None),
    date_from: str = Query(None),
    date_to: str = Query(None),
    search: str = Query(None),
    min_score: float = Query(None),
    db: Session = Depends(get_db)
):
    """Download training effectiveness as PDF with insights."""
    result = await get_training_effectiveness(bucket_filter, date_from, date_to, search, min_score, db)
    
    courses = result.get("courses", [])
    summary = result.get("summary", {})
    
    insights = []
    if courses:
        # Top performing course
        top_course = max(courses, key=lambda x: x.get("avg_score_percent", 0))
        insights.append(f"Highest scoring course: {top_course.get('title', 'Unknown')} ({top_course.get('avg_score_percent', 0)}% avg)")
        
        # Courses needing attention
        low_pass = [c for c in courses if c.get("pass_rate", 0) < 70 and c.get("total_completions", 0) > 0]
        if low_pass:
            insights.append(f"{len(low_pass)} course(s) have pass rates below 70% - may need review")
        
        # Most popular
        most_completed = max(courses, key=lambda x: x.get("total_completions", 0))
        if most_completed.get("total_completions", 0) > 0:
            insights.append(f"Most popular: {most_completed.get('title', 'Unknown')} ({most_completed.get('total_completions', 0)} completions)")
    
    columns = [
        {"key": "title", "label": "Course"},
        {"key": "bucket", "label": "Category"},
        {"key": "total_completions", "label": "Completions"},
        {"key": "avg_score_percent", "label": "Avg Score %"},
        {"key": "pass_rate", "label": "Pass Rate %"},
    ]
    
    buffer = generate_pdf_report(
        "training",
        "Training Effectiveness Report",
        summary,
        courses,
        columns,
        insights
    )
    
    return generate_pdf_response(
        buffer,
        f"training_effectiveness_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.pdf"
    )


# ==========================================
# QUIZ PERFORMANCE
# ==========================================

@router.get("/quizzes")
async def get_quiz_performance(
    date_from: str = Query(None),
    date_to: str = Query(None),
    search: str = Query(None),
    min_score: float = Query(None),
    db: Session = Depends(get_db)
):
    """Get quiz performance metrics with date range filtering."""
    try:
        query = db.query(Quiz)
        if search:
            query = query.filter(Quiz.topic.ilike(f"%{search}%"))
        quizzes = query.all()

        quiz_data = []
        for quiz in quizzes:
            submissions_query = db.query(QuizSubmission).filter(
                QuizSubmission.quiz_id == quiz.id
            )

            # Apply date filters
            if date_from:
                date_from_dt = datetime.fromisoformat(date_from.replace('Z', '+00:00'))
                submissions_query = submissions_query.filter(QuizSubmission.submitted_at >= date_from_dt)
            if date_to:
                date_to_dt = datetime.fromisoformat(date_to.replace('Z', '+00:00'))
                submissions_query = submissions_query.filter(QuizSubmission.submitted_at <= date_to_dt)

            submissions = submissions_query.all()
            
            total = len(submissions)
            avg_score = sum(s.score or 0 for s in submissions) / total if total else 0
            
            if min_score is not None and avg_score < min_score:
                continue

            passed = sum(1 for s in submissions if (s.score or 0) >= 70)
            pass_rate = (passed / total * 100) if total else 0
            
            quiz_data.append({
                "id": str(quiz.id),
                "topic": quiz.topic or quiz.title or "Untitled",
                "total_attempts": total,
                "avg_score": round(avg_score, 1),
                "pass_rate": round(pass_rate, 1),
                "highest_score": max((s.score or 0 for s in submissions), default=0),
            })
        
        # Top performers (apply date filter)
        all_submissions_query = db.query(QuizSubmission)
        if date_from:
            date_from_dt = datetime.fromisoformat(date_from.replace('Z', '+00:00'))
            all_submissions_query = all_submissions_query.filter(QuizSubmission.submitted_at >= date_from_dt)
        if date_to:
            date_to_dt = datetime.fromisoformat(date_to.replace('Z', '+00:00'))
            all_submissions_query = all_submissions_query.filter(QuizSubmission.submitted_at <= date_to_dt)

        all_submissions = all_submissions_query.all()
        user_scores = {}
        for sub in all_submissions:
            if sub.user_email not in user_scores:
                user_scores[sub.user_email] = {"scores": [], "count": 0}
            user_scores[sub.user_email]["scores"].append(sub.score or 0)
            user_scores[sub.user_email]["count"] += 1
        
        top_performers = []
        for email, data in user_scores.items():
            user = db.query(User).filter(User.email == email).first()
            if user and data["count"] > 0:
                top_performers.append({
                    "user_email": email,
                    "user_name": user.name,
                    "quizzes_taken": data["count"],
                    "avg_score": round(sum(data["scores"]) / len(data["scores"]), 1),
                })
        
        top_performers.sort(key=lambda x: x["avg_score"], reverse=True)
        
        return {
            "summary": {
                "total_quizzes": len(quizzes),
                "total_submissions": len(all_submissions),
                "avg_score": round(sum(q["avg_score"] for q in quiz_data) / len(quiz_data), 1) if quiz_data else 0,
            },
            "quizzes": quiz_data,
            "top_performers": top_performers[:10],
            "generated_at": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Error generating quiz performance: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate quiz report")


@router.get("/quizzes/download")
async def download_quiz_csv(
    date_from: str = Query(None),
    date_to: str = Query(None),
    search: str = Query(None),
    min_score: float = Query(None),
    db: Session = Depends(get_db)
):
    """Download quiz performance as CSV."""
    result = await get_quiz_performance(date_from, date_to, search, min_score, db)
    return generate_csv_response(
        result["quizzes"],
        f"quiz_performance_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
    )


@router.get("/quizzes/pdf")
async def download_quiz_pdf(
    date_from: str = Query(None),
    date_to: str = Query(None),
    search: str = Query(None),
    min_score: float = Query(None),
    db: Session = Depends(get_db)
):
    """Download quiz performance as PDF with insights."""
    result = await get_quiz_performance(date_from, date_to, search, min_score, db)
    
    quizzes = result.get("quizzes", [])
    summary = result.get("summary", {})
    top_performers = result.get("top_performers", [])
    
    insights = []
    if quizzes:
        insights.append(f"Total quiz submissions: {summary.get('total_submissions', 0)}")
        
        # Most attempted quiz
        most_attempted = max(quizzes, key=lambda x: x.get("total_attempts", 0))
        if most_attempted.get("total_attempts", 0) > 0:
            insights.append(f"Most attempted: {most_attempted.get('topic', 'Unknown')} ({most_attempted.get('total_attempts', 0)} attempts)")
        
        # Top performer
        if top_performers:
            top = top_performers[0]
            insights.append(f"Top performer: {top.get('user_name', 'Unknown')} with {top.get('avg_score', 0)}% average")
    
    columns = [
        {"key": "topic", "label": "Quiz Topic"},
        {"key": "total_attempts", "label": "Attempts"},
        {"key": "avg_score", "label": "Avg Score"},
        {"key": "pass_rate", "label": "Pass Rate %"},
        {"key": "highest_score", "label": "Highest"},
    ]
    
    buffer = generate_pdf_report(
        "quizzes",
        "Quiz Performance Report",
        summary,
        quizzes,
        columns,
        insights
    )
    
    return generate_pdf_response(
        buffer,
        f"quiz_performance_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.pdf"
    )


# ==========================================
# ASSESSMENT RESULTS
# ==========================================

@router.get("/assessments")
async def get_assessment_results(
    date_from: str = Query(None),
    date_to: str = Query(None),
    search: str = Query(None),
    min_score: float = Query(None),
    db: Session = Depends(get_db)
):
    """Get proctored assessment results with date range filtering."""
    try:
        query = db.query(ScheduledExam)
        if search:
            query = query.filter(ScheduledExam.title.ilike(f"%{search}%"))
        exams = query.all()

        assessment_data = []
        for exam in exams:
            submissions_query = db.query(AssessmentSubmission).filter(
                AssessmentSubmission.assessment_id == exam.id
            )

            # Apply date filters
            if date_from:
                date_from_dt = datetime.fromisoformat(date_from.replace('Z', '+00:00'))
                submissions_query = submissions_query.filter(AssessmentSubmission.submitted_at >= date_from_dt)
            if date_to:
                date_to_dt = datetime.fromisoformat(date_to.replace('Z', '+00:00'))
                submissions_query = submissions_query.filter(AssessmentSubmission.submitted_at <= date_to_dt)

            submissions = submissions_query.all()
            
            total = len(submissions)
            total = len(submissions)
            avg_score = sum(s.score_percent or 0 for s in submissions) / total if total else 0
            
            if min_score is not None and avg_score < min_score:
                continue

            passed = sum(1 for s in submissions if s.passed)
            pass_rate = (passed / total * 100) if total else 0

            # Integrity metrics
            breaches = sum(len(s.breach_log or []) for s in submissions)
            
            assessment_data.append({
                "id": str(exam.id),
                "title": exam.title,
                "total_attempts": total,
                "avg_score": round(avg_score, 1),
                "pass_rate": round(pass_rate, 1),
                "total_breaches": breaches,
                "integrity_score": round(100 - (breaches / total * 10), 1) if total else 100,
            })
        
        return {
            "summary": {
                "total_assessments": len(exams),
                "total_submissions": sum(a["total_attempts"] for a in assessment_data),
                "avg_pass_rate": round(sum(a["pass_rate"] for a in assessment_data) / len(assessment_data), 1) if assessment_data else 0,
            },
            "assessments": assessment_data,
            "generated_at": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Error generating assessment results: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate assessment report")


@router.get("/assessments/download")
async def download_assessments_csv(
    date_from: str = Query(None),
    date_to: str = Query(None),
    search: str = Query(None),
    min_score: float = Query(None),
    db: Session = Depends(get_db)
):
    """Download assessment results as CSV."""
    result = await get_assessment_results(date_from, date_to, search, min_score, db)
    return generate_csv_response(
        result["assessments"],
        f"assessment_results_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
    )


@router.get("/assessments/pdf")
async def download_assessments_pdf(
    date_from: str = Query(None),
    date_to: str = Query(None),
    search: str = Query(None),
    min_score: float = Query(None),
    db: Session = Depends(get_db)
):
    """Download assessment results as PDF with insights."""
    result = await get_assessment_results(date_from, date_to, search, min_score, db)
    
    assessments = result.get("assessments", [])
    summary = result.get("summary", {})
    
    insights = []
    if assessments:
        insights.append(f"Overall pass rate: {summary.get('avg_pass_rate', 0)}%")
        
        # Integrity analysis
        avg_integrity = sum(a.get("integrity_score", 100) for a in assessments) / len(assessments)
        insights.append(f"Average integrity score: {avg_integrity:.1f}%")
        
        # Best performing
        best = max(assessments, key=lambda x: x.get("pass_rate", 0))
        if best.get("total_attempts", 0) > 0:
            insights.append(f"Highest pass rate: {best.get('title', 'Unknown')} ({best.get('pass_rate', 0)}%)")
    
    columns = [
        {"key": "title", "label": "Assessment"},
        {"key": "total_attempts", "label": "Attempts"},
        {"key": "avg_score", "label": "Avg Score"},
        {"key": "pass_rate", "label": "Pass Rate %"},
        {"key": "integrity_score", "label": "Integrity %"},
    ]
    
    buffer = generate_pdf_report(
        "assessments",
        "Assessment Results Report",
        summary,
        assessments,
        columns,
        insights
    )
    
    return generate_pdf_response(
        buffer,
        f"assessment_results_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.pdf"
    )


# ==========================================
# ATTENDANCE & HOURS
# ==========================================

@router.get("/attendance")
async def get_attendance_report(
    date_from: str = Query(None),
    date_to: str = Query(None),
    db: Session = Depends(get_db)
):
    """Get attendance and learning hours report."""
    try:
        query = db.query(AttendanceRecord)

        if date_from:
            query = query.filter(AttendanceRecord.punch_in >= datetime.fromisoformat(date_from))
        if date_to:
            query = query.filter(AttendanceRecord.punch_in <= datetime.fromisoformat(date_to))

        records = query.all()

        # Group by user
        user_attendance = {}
        for record in records:
            email = record.user_email
            if email not in user_attendance:
                user = db.query(User).filter(User.email == email).first()
                user_attendance[email] = {
                    "user_email": email,
                    "user_name": user.name if user else email,
                    "store": user.store if user else "Unknown",
                    "total_sessions": 0,
                    "total_minutes": 0,
                }

            user_attendance[email]["total_sessions"] += 1
            if record.punch_out and record.punch_in:
                duration = (record.punch_out - record.punch_in).total_seconds() / 60
                user_attendance[email]["total_minutes"] += duration
        
        attendance_data = []
        for email, data in user_attendance.items():
            data["total_hours"] = round(data["total_minutes"] / 60, 1)
            data["avg_session_minutes"] = round(data["total_minutes"] / data["total_sessions"], 1) if data["total_sessions"] else 0
            del data["total_minutes"]
            attendance_data.append(data)
        
        attendance_data.sort(key=lambda x: x["total_hours"], reverse=True)
        
        return {
            "summary": {
                "total_records": len(records),
                "unique_users": len(user_attendance),
                "total_hours": round(sum(a["total_hours"] for a in attendance_data), 1),
            },
            "attendance": attendance_data,
            "generated_at": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Error generating attendance report: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate attendance report")


@router.get("/attendance/download")
async def download_attendance_csv(
    date_from: str = Query(None),
    date_to: str = Query(None),
    db: Session = Depends(get_db)
):
    """Download attendance as CSV."""
    result = await get_attendance_report(date_from, date_to, db)
    return generate_csv_response(
        result["attendance"],
        f"attendance_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
    )


@router.get("/attendance/pdf")
async def download_attendance_pdf(
    date_from: str = Query(None),
    date_to: str = Query(None),
    db: Session = Depends(get_db)
):
    """Download attendance as PDF with insights."""
    result = await get_attendance_report(date_from, date_to, db)
    
    attendance = result.get("attendance", [])
    summary = result.get("summary", {})
    
    insights = []
    if attendance:
        insights.append(f"Total learning hours logged: {summary.get('total_hours', 0)}")
        
        # Most active user
        top_user = max(attendance, key=lambda x: x.get("total_hours", 0))
        insights.append(f"Most active: {top_user.get('user_name', 'Unknown')} ({top_user.get('total_hours', 0)} hours)")
        
        avg_hours = summary.get('total_hours', 0) / len(attendance) if attendance else 0
        insights.append(f"Average hours per user: {avg_hours:.1f}")
    
    columns = [
        {"key": "user_name", "label": "User"},
        {"key": "store", "label": "Store"},
        {"key": "total_sessions", "label": "Sessions"},
        {"key": "total_hours", "label": "Hours"},
        {"key": "avg_session_minutes", "label": "Avg Session (min)"},
    ]
    
    buffer = generate_pdf_report(
        "attendance",
        "Attendance & Learning Hours Report",
        summary,
        attendance,
        columns,
        insights
    )
    
    return generate_pdf_response(
        buffer,
        f"attendance_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.pdf"
    )


# ==========================================
# STORE PERFORMANCE
# ==========================================

@router.get("/stores")
async def get_store_performance(
    store_filter: str = Query(None),
    date_from: str = Query(None),
    date_to: str = Query(None),
    db: Session = Depends(get_db)
):
    """Get store-wise performance metrics with filtering."""
    try:
        stores_query = db.query(User.store).distinct().filter(User.store.isnot(None))
        if store_filter:
            stores_query = stores_query.filter(User.store.ilike(f'%{store_filter}%'))
        stores = stores_query.all()

        store_data = []
        for (store_name,) in stores:
            if not store_name:
                continue

            users = db.query(User).filter(User.store == store_name).all()
            user_emails = [u.email for u in users]

            completions_query = db.query(CourseCompletion).filter(
                CourseCompletion.user_email.in_(user_emails)
            )

            # Apply date filters
            if date_from:
                date_from_dt = datetime.fromisoformat(date_from.replace('Z', '+00:00'))
                completions_query = completions_query.filter(CourseCompletion.completed_at >= date_from_dt)
            if date_to:
                date_to_dt = datetime.fromisoformat(date_to.replace('Z', '+00:00'))
                completions_query = completions_query.filter(CourseCompletion.completed_at <= date_to_dt)

            completions = completions_query.all()
            
            avg_score = sum(c.score or 0 for c in completions) / len(completions) if completions else 0
            
            store_data.append({
                "store_name": store_name,
                "total_users": len(users),
                "total_completions": len(completions),
                "avg_completions_per_user": round(len(completions) / len(users), 1) if users else 0,
                "avg_score": round(avg_score, 1),
            })
        
        store_data.sort(key=lambda x: x["total_completions"], reverse=True)
        
        return {
            "summary": {
                "total_stores": len(store_data),
                "total_users": sum(s["total_users"] for s in store_data),
                "total_completions": sum(s["total_completions"] for s in store_data),
            },
            "stores": store_data,
            "generated_at": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Error generating store performance: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate store report")


@router.get("/stores/download")
async def download_stores_csv(
    store_filter: str = Query(None),
    date_from: str = Query(None),
    date_to: str = Query(None),
    db: Session = Depends(get_db)
):
    """Download store performance as CSV."""
    result = await get_store_performance(store_filter, date_from, date_to, db)
    return generate_csv_response(
        result["stores"],
        f"store_performance_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
    )


@router.get("/stores/pdf")
async def download_stores_pdf(
    store_filter: str = Query(None),
    date_from: str = Query(None),
    date_to: str = Query(None),
    db: Session = Depends(get_db)
):
    """Download store performance as PDF with insights."""
    result = await get_store_performance(store_filter, date_from, date_to, db)
    
    stores = result.get("stores", [])
    summary = result.get("summary", {})
    
    insights = []
    if stores:
        # Top store
        top_store = max(stores, key=lambda x: x.get("total_completions", 0))
        insights.append(f"Top performing store: {top_store.get('store_name', 'Unknown')} ({top_store.get('total_completions', 0)} completions)")
        
        # Highest avg score
        best_score = max(stores, key=lambda x: x.get("avg_score", 0))
        insights.append(f"Highest avg score: {best_score.get('store_name', 'Unknown')} ({best_score.get('avg_score', 0)}%)")
        
        avg_per_store = summary.get('total_completions', 0) / len(stores) if stores else 0
        insights.append(f"Average completions per store: {avg_per_store:.1f}")
    
    columns = [
        {"key": "store_name", "label": "Store"},
        {"key": "total_users", "label": "Users"},
        {"key": "total_completions", "label": "Completions"},
        {"key": "avg_completions_per_user", "label": "Avg/User"},
        {"key": "avg_score", "label": "Avg Score %"},
    ]
    
    buffer = generate_pdf_report(
        "stores",
        "Store Performance Report",
        summary,
        stores,
        columns,
        insights
    )
    
    return generate_pdf_response(
        buffer,
        f"store_performance_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.pdf"
    )


# ==========================================
# SIMULATION PROGRESS
# ==========================================

@router.get("/simulations")
async def get_simulation_progress(
    date_from: str = Query(None),
    date_to: str = Query(None),
    db: Session = Depends(get_db)
):
    """Get simulation progress metrics with date range filtering."""
    try:
        simulations = db.query(Simulation).all()

        sim_data = []
        for sim in simulations:
            progress_query = db.query(SimulationProgress).filter(
                SimulationProgress.simulation_id == sim.id
            )

            # Apply date filters (assuming SimulationProgress has updated_at or similar field)
            if date_from:
                date_from_dt = datetime.fromisoformat(date_from.replace('Z', '+00:00'))
                if hasattr(SimulationProgress, 'updated_at'):
                    progress_query = progress_query.filter(SimulationProgress.updated_at >= date_from_dt)
            if date_to:
                date_to_dt = datetime.fromisoformat(date_to.replace('Z', '+00:00'))
                if hasattr(SimulationProgress, 'updated_at'):
                    progress_query = progress_query.filter(SimulationProgress.updated_at <= date_to_dt)

            progress = progress_query.all()
            
            total = len(progress)
            completed = sum(1 for p in progress if p.completed)
            avg_score = sum(p.score or 0 for p in progress) / total if total else 0
            
            sim_data.append({
                "id": str(sim.id),
                "title": sim.title,
                "total_attempts": total,
                "completed": completed,
                "completion_rate": round((completed / total * 100), 1) if total else 0,
                "avg_score": round(avg_score, 1),
            })
        
        return {
            "summary": {
                "total_simulations": len(simulations),
                "total_attempts": sum(s["total_attempts"] for s in sim_data),
                "total_completions": sum(s["completed"] for s in sim_data),
            },
            "simulations": sim_data,
            "generated_at": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Error generating simulation progress: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate simulation report")


@router.get("/simulations/download")
async def download_simulations_csv(
    date_from: str = Query(None),
    date_to: str = Query(None),
    db: Session = Depends(get_db)
):
    """Download simulation progress as CSV."""
    result = await get_simulation_progress(date_from, date_to, db)
    return generate_csv_response(
        result["simulations"],
        f"simulation_progress_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
    )


@router.get("/simulations/pdf")
async def download_simulations_pdf(
    date_from: str = Query(None),
    date_to: str = Query(None),
    db: Session = Depends(get_db)
):
    """Download simulation progress as PDF with insights."""
    result = await get_simulation_progress(date_from, date_to, db)
    
    simulations = result.get("simulations", [])
    summary = result.get("summary", {})
    
    insights = []
    if simulations:
        insights.append(f"Total simulation completions: {summary.get('total_completions', 0)}")
        
        # Most completed
        most_completed = max(simulations, key=lambda x: x.get("completed", 0))
        if most_completed.get("completed", 0) > 0:
            insights.append(f"Most popular: {most_completed.get('title', 'Unknown')} ({most_completed.get('completed', 0)} completions)")
        
        # Highest completion rate
        if any(s.get("total_attempts", 0) > 0 for s in simulations):
            best_rate = max([s for s in simulations if s.get("total_attempts", 0) > 0], key=lambda x: x.get("completion_rate", 0))
            insights.append(f"Highest completion rate: {best_rate.get('title', 'Unknown')} ({best_rate.get('completion_rate', 0)}%)")
    
    columns = [
        {"key": "title", "label": "Simulation"},
        {"key": "total_attempts", "label": "Attempts"},
        {"key": "completed", "label": "Completed"},
        {"key": "completion_rate", "label": "Rate %"},
        {"key": "avg_score", "label": "Avg Score"},
    ]
    
    buffer = generate_pdf_report(
        "simulations",
        "Simulation Progress Report",
        summary,
        simulations,
        columns,
        insights
    )
    
    return generate_pdf_response(
        buffer,
        f"simulation_progress_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.pdf"
    )


# ==========================================
# CONTENT ENGAGEMENT
# ==========================================

@router.get("/content")
async def get_content_engagement(
    bucket_filter: str = Query(None),
    date_from: str = Query(None),
    date_to: str = Query(None),
    search: str = Query(None),
    db: Session = Depends(get_db)
):
    """Get content engagement metrics with date range filtering."""
    try:
        query = db.query(Content)
        if bucket_filter:
            query = query.filter(Content.bucket_id == bucket_filter)
            
        if search:
            query = query.filter(Content.title.ilike(f"%{search}%"))

        content_items = query.all()

        content_data = []
        for content in content_items:
            # Get interactions with date filter
            views_query = db.query(UserInteraction).filter(
                UserInteraction.content_id == str(content.id),
                UserInteraction.interaction_type == 'view'
            )
            if date_from:
                date_from_dt = datetime.fromisoformat(date_from.replace('Z', '+00:00'))
                views_query = views_query.filter(UserInteraction.timestamp >= date_from_dt)
            if date_to:
                date_to_dt = datetime.fromisoformat(date_to.replace('Z', '+00:00'))
                views_query = views_query.filter(UserInteraction.timestamp <= date_to_dt)
            views = views_query.count()

            # Get watch progress
            from app.models.video_progress import VideoProgress
            watch_data = db.query(VideoProgress).filter(
                VideoProgress.node_id == str(content.id)
            ).all()

            avg_watch = sum(v.progress_percent or 0 for v in watch_data) / len(watch_data) if watch_data else 0

            # Get completions with date filter
            completions_query = db.query(CourseCompletion).filter(
                CourseCompletion.course_id == str(content.id)
            )
            if date_from:
                date_from_dt = datetime.fromisoformat(date_from.replace('Z', '+00:00'))
                completions_query = completions_query.filter(CourseCompletion.completed_at >= date_from_dt)
            if date_to:
                date_to_dt = datetime.fromisoformat(date_to.replace('Z', '+00:00'))
                completions_query = completions_query.filter(CourseCompletion.completed_at <= date_to_dt)
            completions = completions_query.count()
            
            bucket = db.query(CourseBucket).filter(CourseBucket.id == content.bucket_id).first()
            
            content_data.append({
                "id": str(content.id),
                "title": content.title,
                "bucket": bucket.name if bucket else "Uncategorized",
                "resource_type": content.resource_type,
                "total_views": views,
                "avg_watch_percent": round(avg_watch, 1),
                "total_course_completions": completions,
            })
        
        content_data.sort(key=lambda x: x["total_views"], reverse=True)
        
        return {
            "summary": {
                "total_content": len(content_data),
                "total_views": sum(c["total_views"] for c in content_data),
                "total_completions": sum(c["total_course_completions"] for c in content_data),
            },
            "content": content_data,
            "generated_at": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Error generating content engagement: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate content report")


@router.get("/content/download")
async def download_content_csv(
    bucket_filter: str = Query(None),
    date_from: str = Query(None),
    date_to: str = Query(None),
    search: str = Query(None),
    db: Session = Depends(get_db)
):
    """Download content engagement as CSV."""
    result = await get_content_engagement(bucket_filter, date_from, date_to, search, db)
    return generate_csv_response(
        result["content"],
        f"content_engagement_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
    )


@router.get("/content/pdf")
async def download_content_pdf(
    bucket_filter: str = Query(None),
    date_from: str = Query(None),
    date_to: str = Query(None),
    search: str = Query(None),
    db: Session = Depends(get_db)
):
    """Download content engagement as PDF with insights."""
    result = await get_content_engagement(bucket_filter, date_from, date_to, search, db)
    
    content = result.get("content", [])
    summary = result.get("summary", {})
    
    insights = []
    if content:
        insights.append(f"Total content views: {summary.get('total_views', 0)}")
        
        # Most viewed
        most_viewed = max(content, key=lambda x: x.get("total_views", 0))
        if most_viewed.get("total_views", 0) > 0:
            insights.append(f"Most viewed: {most_viewed.get('title', 'Unknown')} ({most_viewed.get('total_views', 0)} views)")
        
        # Best engagement (highest avg watch)
        best_engagement = max(content, key=lambda x: x.get("avg_watch_percent", 0))
        if best_engagement.get("avg_watch_percent", 0) > 0:
            insights.append(f"Highest engagement: {best_engagement.get('title', 'Unknown')} ({best_engagement.get('avg_watch_percent', 0)}% avg watch)")
    
    columns = [
        {"key": "title", "label": "Content"},
        {"key": "bucket", "label": "Category"},
        {"key": "resource_type", "label": "Type"},
        {"key": "total_views", "label": "Views"},
        {"key": "avg_watch_percent", "label": "Avg Watch %"},
        {"key": "total_course_completions", "label": "Completions"},
    ]
    
    buffer = generate_pdf_report(
        "content",
        "Content Engagement Report",
        summary,
        content,
        columns,
        insights
    )
    
    return generate_pdf_response(
        buffer,
        f"content_engagement_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.pdf"
    )


# ==========================================
# EXECUTIVE SUMMARY
# ==========================================

@router.get("/executive-summary")
async def get_executive_summary(
    date_from: str = Query(None),
    date_to: str = Query(None),
    db: Session = Depends(get_db)
):
    """Get AI-powered executive summary with recommendations and optional date filtering."""
    try:
        # Determine date range
        if date_from:
            start_date = datetime.fromisoformat(date_from.replace('Z', '+00:00'))
        else:
            start_date = datetime.utcnow() - timedelta(days=30)

        if date_to:
            end_date = datetime.fromisoformat(date_to.replace('Z', '+00:00'))
        else:
            end_date = datetime.utcnow()

        # Gather key metrics
        total_users = db.query(func.count(User.id)).scalar() or 0

        active_users = db.query(func.count(User.id)).filter(
            User.last_active >= start_date,
            User.last_active <= end_date
        ).scalar() or 0
        
        # Completions in the date range
        total_completions_query = db.query(func.count(CourseCompletion.id))
        total_completions_query = total_completions_query.filter(
            CourseCompletion.completed_at >= start_date,
            CourseCompletion.completed_at <= end_date
        )
        total_completions = total_completions_query.scalar() or 0

        # Calculate period for trend analysis
        period_days = (end_date - start_date).days
        half_period = period_days // 2
        mid_date = start_date + timedelta(days=half_period)

        weekly_completions = db.query(func.count(CourseCompletion.id)).filter(
            CourseCompletion.completed_at >= mid_date,
            CourseCompletion.completed_at <= end_date
        ).scalar() or 0

        prev_weekly = db.query(func.count(CourseCompletion.id)).filter(
            CourseCompletion.completed_at >= start_date,
            CourseCompletion.completed_at < mid_date
        ).scalar() or 0

        avg_score_query = db.query(func.avg(CourseCompletion.score)).filter(
            CourseCompletion.completed_at >= start_date,
            CourseCompletion.completed_at <= end_date
        )
        avg_score = avg_score_query.scalar() or 0

        total_quizzes = db.query(func.count(QuizSubmission.id)).filter(
            QuizSubmission.submitted_at >= start_date,
            QuizSubmission.submitted_at <= end_date
        ).scalar() or 0

        total_assessments = db.query(func.count(AssessmentSubmission.id)).filter(
            AssessmentSubmission.submitted_at >= start_date,
            AssessmentSubmission.submitted_at <= end_date
        ).scalar() or 0
        
        avg_quiz_score = db.query(func.avg(QuizSubmission.score)).scalar() or 0
        
        # Top performers in date range
        top_performers = db.query(
            User.name,
            User.store,
            func.count(CourseCompletion.id).label('completions')
        ).join(
            CourseCompletion, CourseCompletion.user_email == User.email
        ).filter(
            CourseCompletion.completed_at >= start_date,
            CourseCompletion.completed_at <= end_date
        ).group_by(User.name, User.store).order_by(
            desc('completions')
        ).limit(5).all()
        
        # Generate AI summary
        completion_trend = "up" if weekly_completions > prev_weekly else "down" if weekly_completions < prev_weekly else "stable"
        
        summary_text = f"This month, your organization has {total_users} total users with {active_users} active learners. "
        summary_text += f"Course completions are {completion_trend} with {weekly_completions} this week. "
        summary_text += f"Average score across all courses is {avg_score:.1f}%. "
        
        if avg_score >= 80:
            summary_text += "Performance is excellent - consider introducing more advanced content."
        elif avg_score >= 70:
            summary_text += "Performance is good but there's room for improvement in some areas."
        else:
            summary_text += "Some courses may need review or additional support resources."
        
        # Generate recommendations
        recommendations = []
        
        if active_users < total_users * 0.7:
            recommendations.append("Increase engagement - over 30% of users are inactive. Consider gamification or incentives.")
        
        if avg_score < 70:
            recommendations.append("Review courses with low pass rates and consider adding supplementary materials.")
        
        if weekly_completions < prev_weekly:
            recommendations.append("Completion rate is declining - schedule training reminders or manager follow-ups.")
        
        if total_assessments == 0:
            recommendations.append("No assessments completed this week - consider scheduling proctored exams.")
        
        recommendations.append("Continue tracking top performers and consider recognition programs.")
        
        return {
            "summary": summary_text,
            "key_metrics": {
                "total_users": total_users,
                "active_users_30d": active_users,
                "completions_this_week": weekly_completions,
                "quizzes_this_week": total_quizzes,
                "assessments_this_week": total_assessments,
                "avg_score": round(avg_score, 1),
                "completion_trend": completion_trend,
            },
            "top_performers": [
                {"name": p.name, "store": p.store or "HQ", "completions": p.completions}
                for p in top_performers
            ],
            "recommendations": recommendations,
            "generated_at": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Error generating executive summary: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate executive summary")


@router.get("/executive-summary/download")
async def download_executive_summary_csv(
    date_from: str = Query(None),
    date_to: str = Query(None),
    db: Session = Depends(get_db)
):
    """Download executive summary as CSV."""
    result = await get_executive_summary(date_from, date_to, db)
    
    # Flatten for CSV
    data = [result["key_metrics"]]
    
    return generate_csv_response(
        data,
        f"executive_summary_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
    )


@router.get("/executive-summary/pdf")
async def download_executive_summary_pdf(
    date_from: str = Query(None),
    date_to: str = Query(None),
    db: Session = Depends(get_db)
):
    """Download executive summary as PDF with all insights and recommendations."""
    result = await get_executive_summary(date_from, date_to, db)
    
    summary_text = result.get("summary", "")
    key_metrics = result.get("key_metrics", {})
    top_performers = result.get("top_performers", [])
    recommendations = result.get("recommendations", [])
    
    # Build insights from recommendations (add summary text as first insight)
    insights = []
    if summary_text:
        insights.append(f"AI Summary: {summary_text}")
    insights.extend(recommendations)
    
    columns = [
        {"key": "name", "label": "Name"},
        {"key": "store", "label": "Store"},
        {"key": "completions", "label": "Completions"},
    ]
    
    # Create summary dict from key_metrics ONLY (no long text)
    # This ensures the metrics table displays properly
    summary = key_metrics.copy() if key_metrics else {}
    
    buffer = generate_pdf_report(
        "executive",
        "Executive Summary Report",
        summary,
        top_performers,
        columns,
        insights
    )
    
    return generate_pdf_response(
        buffer,
        f"executive_summary_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.pdf"
    )


# ==========================================
# REPORT SUBSCRIPTIONS
# ==========================================

from app.models.report import ReportSubscription
from app.schemas.report import ReportSubscriptionResponse, SubscriptionListRequest

# Assuming get_current_user is available in deps or auth, checking imports...
# I'll use a direct dependency import for now to be safe, or check existing patterns.
# The user_service typically handles auth, but endpoints usually have `get_current_user`.
# Let's import it properly.

@router.get("/subscriptions", response_model=List[ReportSubscriptionResponse])
async def get_my_subscriptions(
    db: Session = Depends(get_db),
    # Inject user extraction manually if needed or import dependency
    # For now, I will extract from request or rely on a standard dependency if I can find it.
    # Looking at other endpoints... they don't seem to use `current_user`.
    # I will add query param `email` for now as a fallback or implemented simplistic auth retrieval.
    # User email is critical for linking.
    # Actually, let's assume valid token and extract user.
    # I will modify this to use `user_email` from query or similar for consistency with other open endpoints,
    # OR better, use the proper auth dependency if found.
    user_email: str = Query(..., description="Email of the user to get subscriptions for")
):
    """Get report subscriptions for a user."""
    user = db.query(User).filter(User.email == user_email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    subs = db.query(ReportSubscription).filter(ReportSubscription.user_id == user.id).all()
    return subs

@router.post("/subscriptions", response_model=List[ReportSubscriptionResponse])
async def update_subscriptions(
    data: SubscriptionListRequest,
    user_email: str = Query(..., description="Email of the user to update subscriptions for"),
    db: Session = Depends(get_db)
):
    """Update report subscriptions for a user."""
    user = db.query(User).filter(User.email == user_email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    # Clear existing subscriptions for this user to replace with new list (simplest approach)
    # Or upsert. Replacing is cleaner for a "settings" UI.
    db.query(ReportSubscription).filter(ReportSubscription.user_id == user.id).delete()
    
    new_subs = []
    for sub in data.subscriptions:
        if sub.is_active:
            new_sub = ReportSubscription(
                user_id=user.id,
                report_type=sub.report_type,
                frequency=sub.frequency,
                day_of_week=sub.day_of_week,
                time_of_day=sub.time_of_day,
                format=sub.format,
                is_active=True
            )
            db.add(new_sub)
            new_subs.append(new_sub)
            
    db.commit()
    
    # Refresh to get IDs
    for s in new_subs:
        db.refresh(s)
        
    return new_subs
