import logging
from datetime import datetime
from sqlalchemy import text
from app.config.database import SessionLocal
from app.models.assessment import ScheduledExam, ProcturedAssessment, ExamAttendance
from app.models.meeting import Meeting
from app.models.quiz import LiveQuiz

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def clean_database():
    db = SessionLocal()

    try:
        logger.info("Starting cleanup of upcoming/live data...")

        # 1. Upcoming Scheduled Exams
        # Delete exams that are scheduled or in the future
        logger.info("Deleting upcoming Scheduled Exams...")
        exams_to_delete = db.query(ScheduledExam).filter(
            (ScheduledExam.status == 'scheduled') | 
            (ScheduledExam.exam_datetime > datetime.utcnow())
        ).all()
        
        exam_ids = [e.id for e in exams_to_delete]
        if exam_ids:
            # Delete related attendance records first
            db.query(ExamAttendance).filter(ExamAttendance.exam_id.in_(exam_ids)).delete(synchronize_session=False)
            
            # Delete the exams
            deleted_exams = db.query(ScheduledExam).filter(ScheduledExam.id.in_(exam_ids)).delete(synchronize_session=False)
            logger.info(f"Deleted {deleted_exams} scheduled exams.")
        else:
            logger.info("No upcoming scheduled exams found.")

        # 2. Upcoming Meetings
        # Delete meetings that are scheduled or in the future
        logger.info("Deleting upcoming Meetings...")
        meetings_to_delete = db.query(Meeting).filter(
            (Meeting.status == 'scheduled') | 
            (Meeting.scheduled_at > datetime.utcnow())
        ).delete(synchronize_session=False)
        logger.info(f"Deleted {meetings_to_delete} upcoming meetings.")

        # 3. Live Assessments (Active Proctored Assessments)
        # Deleting active assessments (definitions)
        logger.info("Deleting active Proctored Assessments...")
        assessments_to_delete = db.query(ProcturedAssessment).filter(
            ProcturedAssessment.active == True
        ).delete(synchronize_session=False)
        logger.info(f"Deleted {assessments_to_delete} active proctored assessments.")

        # 4. Live Quizzes (Active/Scheduled)
        logger.info("Deleting active/scheduled Live Quizzes...")
        live_quizzes_to_delete = db.query(LiveQuiz).filter(
            (LiveQuiz.is_active == True) |
            (LiveQuiz.status.in_(['scheduled', 'live']))
        ).delete(synchronize_session=False)
        logger.info(f"Deleted {live_quizzes_to_delete} live quizzes.")

        db.commit()
        logger.info("Cleanup completed successfully.")

    except Exception as e:
        logger.error(f"Error during cleanup: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    clean_database()
