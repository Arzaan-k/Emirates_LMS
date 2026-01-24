"""
Database initialization script
Creates all tables in the PostgreSQL database
"""

import os
import sys
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Import database components
from database import Base, engine
from models import (
    User, UserNodeProgress, Content, CourseBucket, Quiz, QuizSubmission,
    ProcturedAssessment, AssessmentSubmission, CourseCompletion, Notification,
    AttendanceRecord, NewsFeed, Meeting, CRMTicket, CRMTaskAssignment,
    ScheduledExam, ExamAttendance, AuditLog, UserLearningProfile,
    UserInteraction, Resource, LocationTracking
)

def init_database():
    """Create all tables in the database"""
    print("=" * 60)
    print("DATABASE INITIALIZATION")
    print("=" * 60)

    try:
        # Check if database URL is set
        db_url = os.environ.get("DATABASE_URL")
        if not db_url:
            print("[ERROR] DATABASE_URL not found in environment variables")
            print("Please set DATABASE_URL in your .env file")
            return False

        print("[OK] Database URL configured")
        print(f"  Host: {db_url.split('@')[1].split('/')[0] if '@' in db_url else 'unknown'}")

        # Create all tables
        print("\n[INFO] Creating database tables...")
        Base.metadata.create_all(bind=engine)

        print("\n[SUCCESS] All tables created:")
        print("   • users")
        print("   • user_node_progress")
        print("   • content")
        print("   • course_buckets")
        print("   • quizzes")
        print("   • quiz_submissions")
        print("   • proctored_assessments")
        print("   • assessment_submissions")
        print("   • course_completions")
        print("   • notifications")
        print("   • attendance_records")
        print("   • news_feed")
        print("   • meetings")
        print("   • crm_tickets")
        print("   • crm_task_assignments")
        print("   • scheduled_exams")
        print("   • exam_attendance")
        print("   • audit_logs")
        print("   • user_learning_profiles")
        print("   • user_interactions")
        print("   • resources")
        print("   • location_tracking")

        print("\n" + "=" * 60)
        print("Database is ready! You can now start the server.")
        print("=" * 60)
        return True

    except Exception as e:
        print(f"\n[ERROR] Failed to initialize database")
        print(f"   {str(e)}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = init_database()
    sys.exit(0 if success else 1)
