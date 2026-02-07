
import asyncio
import sys
import os
import logging
from datetime import datetime

# Setup path
sys.path.append(os.getcwd())

from app.config.database import SessionLocal
from app.models.report import ReportSubscription
from app.models.user import User
from app.api.v1.endpoints.reports import get_user_analytics, generate_pdf_report, generate_csv_buffer
from app.utils.email import EmailService
from send_weekly_reports import send_email_with_attachments

# Configure Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def debug_report_sending(target_email):
    logger.info(f"--- Starting Report Debug for {target_email} ---")
    
    db = SessionLocal()
    email_service = EmailService()
    
    try:
        # 1. Check User (Just for logging)
        user = db.query(User).filter(User.email == target_email).first()
        if user:
            logger.info(f"User found: ID {user.id}")

        # 3. Force Send a Test Report (User Analytics)
        logger.info("Generating TEST User Analytics report...")
        data = await get_user_analytics(None, None, None, None, db=db)
        
        pdf_buffer = generate_pdf_report(
            "users",
            "TEST REPORT: User Analytics",
            data.get("summary", {}),
            data.get("users", []),
            [
                {"key": "name", "label": "Name"},
                {"key": "role", "label": "Role"},
                {"key": "courses_completed", "label": "Courses"},
                {"key": "avg_course_score", "label": "Avg Score"},
            ],
            ["This is a forced debug report sent by the developer."]
        )
        
        csv_buffer = generate_csv_buffer(data.get("users", []))
        
        if pdf_buffer and csv_buffer:
            logger.info("Reports generated successfully.")
            
            attachments = [
                {
                    "filename": f"TEST_users_{datetime.utcnow().strftime('%Y%m%d')}.pdf",
                    "content": pdf_buffer.getvalue(),
                    "content_type": "application/pdf"
                },
                {
                    "filename": f"TEST_users_{datetime.utcnow().strftime('%Y%m%d')}.csv",
                    "content": csv_buffer.getvalue(),
                    "content_type": "text/csv"
                }
            ]
            
            logger.info(f"Attempting to send email to {target_email} with {len(attachments)} attachments...")
            send_email_with_attachments(
                email_service,
                target_email,
                "Debug Test Report - BWC LMS",
                "<p>This is a test report to verify email functionality (PDF + CSV).</p>",
                attachments
            )
            logger.info("Email send function called.")
        else:
            logger.error("Generation failed.")

    except Exception as e:
        logger.error(f"Debug failed: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    if os.name == 'nt':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    
    # Run the debug
    asyncio.run(debug_report_sending("arzaanalikhan12@gmail.com"))
