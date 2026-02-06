
import asyncio
import io
import sys
import os
import logging
from datetime import datetime, timedelta

# Setup path
sys.path.append(os.getcwd())

from app.config.database import SessionLocal
from app.models.report import ReportSubscription
from app.models.user import User
from app.api.v1.endpoints.reports import (
    get_user_analytics,
    get_training_effectiveness,
    get_quiz_performance,
    generate_pdf_report,
    generate_csv_buffer,
    get_reports_overview
)
from app.utils.email import EmailService

# Configure Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def generate_and_send_reports():
    logger.info("Starting Custom Schedule Report Generation...")
    
    db = SessionLocal()
    email_service = EmailService()
    
    try:
        now = datetime.now() # Use Local System Time (matches user expectation on local deployment)
        
        current_day = now.strftime('%A') # Monday, Tuesday...
        current_time_str = now.strftime('%H:%M')
        current_hour = now.hour
        
        logger.info(f"Local System Time: {current_day} {current_time_str}")

        # Get all active subscriptions for TODAY
        # We check if day matches. 
        # For time, we check if the stored time is within the current hour window e.g. "09:xx" matches current hour 9.
        # This assumes the script runs hourly.
        
        subscriptions = db.query(ReportSubscription).filter(
            ReportSubscription.is_active == True,
            ReportSubscription.day_of_week == current_day
        ).all()
        
        if not subscriptions:
            logger.info(f"No active subscriptions found for {current_day}.")
            return

        # Group by User to batch emails
        user_subs = {}
        for sub in subscriptions:
            # Check time match (simple hour match)
            # sub.time_of_day format "HH:mm"
            if not sub.time_of_day:
                continue
                
            try:
                sub_hour = int(sub.time_of_day.split(':')[0])
                if sub_hour != current_hour:
                    continue # Not this hour
            except:
                continue
            
            # Check cooldown (don't send multiple times in same hour)
            if sub.last_sent_at:
                diff = now - sub.last_sent_at
                if diff.total_seconds() < 3600: # 1 hour
                    continue

            if sub.user_id not in user_subs:
                user_subs[sub.user_id] = []
            user_subs[sub.user_id].append(sub)
        
        if not user_subs:
             logger.info(f"No reports due for this hour ({current_hour}:00).")
             return

        # Process each user
        for user_id, subs in user_subs.items():
            user = db.query(User).filter(User.id == user_id).first()
            if not user or not user.email:
                continue
                
            logger.info(f"Processing {len(subs)} reports for {user.email}...")
            
            attachments = []
            
            for sub in subs:
                try:
                    report_name = f"{sub.report_type}_{datetime.utcnow().strftime('%Y-%m-%d')}"
                    pdf_buffer = None
                    csv_buffer = None
                    
                    # FETCH DATA & GENERATE REPORTS
                    if sub.report_type == 'users':
                        data = await get_user_analytics(db=db)
                        # Generate PDF
                        pdf_buffer = generate_pdf_report(
                            "users", "User Analytics Report", data.get("summary", {}), data.get("users", []),
                            [{"key": "name", "label": "Name"}, {"key": "role", "label": "Role"}, {"key": "courses_completed", "label": "Courses"}, {"key": "avg_course_score", "label": "Avg Score"}],
                            ["Automated scheduled report"]
                        )
                        # Generate CSV
                        csv_buffer = generate_csv_buffer(data.get("users", []))
                        
                    elif sub.report_type == 'training':
                        data = await get_training_effectiveness(db=db)
                        pdf_buffer = generate_pdf_report(
                            "training", "Training Effectiveness Report", data.get("summary", {}), data.get("courses", []),
                            [{"key": "title", "label": "Course"}, {"key": "total_completions", "label": "Completions"}, {"key": "avg_score_percent", "label": "Score %"}, {"key": "pass_rate", "label": "Pass Rate"}],
                            ["Automated scheduled report"]
                        )
                        csv_buffer = generate_csv_buffer(data.get("courses", []))
                        
                    elif sub.report_type == 'quizzes':
                        data = await get_quiz_performance(db=db)
                        pdf_buffer = generate_pdf_report(
                            "quizzes", "Quiz Performance Report", data.get("summary", {}), data.get("quizzes", []),
                            [{"key": "topic", "label": "Quiz"}, {"key": "total_attempts", "label": "Attempts"}, {"key": "avg_score", "label": "Avg Score"}, {"key": "pass_rate", "label": "Pass Rate"}],
                            ["Automated scheduled report"]
                        )
                        csv_buffer = generate_csv_buffer(data.get("quizzes", []))
                        
                    elif sub.report_type == 'overview':
                        data = await get_reports_overview(db=db)
                        summary_items = [{"metric": k, "value": v} for k, v in data.get("summary", {}).items()]
                        pdf_buffer = generate_pdf_report(
                            "overview", "Executive Overview", data.get("summary", {}), summary_items,
                            [{"key": "metric", "label": "Metric"}, {"key": "value", "label": "Value"}],
                            ["Automated scheduled report"]
                        )
                        csv_buffer = generate_csv_buffer(summary_items)

                    # Add PDF Attachment
                    if pdf_buffer:
                        attachments.append({
                            "filename": f"{report_name}.pdf",
                            "content": pdf_buffer.getvalue(),
                            "content_type": "application/pdf"
                        })
                    
                    # Add CSV Attachment (Requested: "receive pdf and excel both")
                    if csv_buffer:
                        attachments.append({
                            "filename": f"{report_name}.csv",
                            "content": csv_buffer.getvalue(),
                            "content_type": "text/csv"
                        })
                        
                        # Update last sent
                        sub.last_sent_at = datetime.utcnow()
                
                except Exception as e:
                    logger.error(f"Failed to generate {sub.report_type}: {e}")

            # SEND EMAIL IF ATTACHMENTS EXIST
            if attachments:
                logger.info(f"Sending email to {user.email}...")
                send_email_with_attachments(
                    email_service,
                    user.email,
                    "Your Scheduled Reports - BWC LMS",
                    "<p>Hello,<br><br>Please find your scheduled reports attached.<br><br>Best,<br>BWC LMS Team</p>",
                    attachments
                )
                
        db.commit()
        logger.info("Custom schedule report process completed.")
        
    except Exception as e:
        logger.error(f"Global error in report generation: {e}")
    finally:
        db.close()

def send_email_with_attachments(service, to_email, subject, html_content, attachments):
    import smtplib
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText
    from email.mime.application import MIMEApplication
    
    if not service.username or not service.password:
        logger.warning(f"Skipping email to {to_email} (No credentials)")
        return

    msg = MIMEMultipart()
    msg["Subject"] = subject
    msg["From"] = f"{service.from_name} <{service.from_email}>"
    msg["To"] = to_email

    msg.attach(MIMEText(html_content, "html"))

    for att in attachments:
        part = MIMEApplication(att["content"], Name=att["filename"])
        part['Content-Disposition'] = f'attachment; filename="{att["filename"]}"'
        msg.attach(part)

    try:
        server = service._get_connection()
        if server:
            server.sendmail(service.from_email, to_email, msg.as_string())
            server.quit()
            logger.info(f"Sent email to {to_email}")
    except Exception as e:
        logger.error(f"Failed to send email: {e}")

if __name__ == "__main__":
    if os.name == 'nt':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(generate_and_send_reports())
