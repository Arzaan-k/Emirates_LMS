"""
Add Database Indexes for Performance Optimization
Run this script once to add indexes to PostgreSQL tables

Usage: python add_indexes.py
"""

import os
from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import text
from database import engine
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("AddIndexes")

# All indexes to create for optimal query performance
INDEXES = [
    # Course Completions - heavily used in analytics
    ("idx_cc_user_email", "course_completions", "user_email"),
    ("idx_cc_course_id", "course_completions", "course_id"),
    ("idx_cc_completed_at", "course_completions", "completed_at"),
    ("idx_cc_bucket", "course_completions", "bucket"),

    # Quiz Submissions
    ("idx_qs_user_email", "quiz_submissions", "user_email"),
    ("idx_qs_quiz_id", "quiz_submissions", "quiz_id"),
    ("idx_qs_submitted_at", "quiz_submissions", "submitted_at"),

    # Assessment Submissions
    ("idx_as_user_email", "assessment_submissions", "user_email"),
    ("idx_as_assessment_id", "assessment_submissions", "assessment_id"),
    ("idx_as_passed", "assessment_submissions", "passed"),

    # Users
    ("idx_users_store", "users", "store"),
    ("idx_users_role", "users", "role"),
    ("idx_users_category", "users", "category"),

    # Content
    ("idx_content_bucket", "content", "bucket"),
    ("idx_content_path_node", "content", "is_path_node"),
    ("idx_content_learning_type", "content", "learning_path_type"),

    # CRM Tickets
    ("idx_crm_status", "crm_tickets", "status"),
    ("idx_crm_assigned", "crm_tickets", "assigned_to"),

    # Attendance Records
    ("idx_att_user_email", "attendance_records", "user_email"),
    ("idx_att_punch_in", "attendance_records", "punch_in"),

    # Notifications
    ("idx_notif_created", "notifications", "created_at"),
    ("idx_notif_type", "notifications", "notification_type"),

    # News Feed
    ("idx_news_created", "news_feed", "created_at"),

    # Meetings
    ("idx_meet_scheduled", "meetings", "scheduled_at"),
    ("idx_meet_host", "meetings", "host_email"),

    # Location Tracking
    ("idx_loc_user", "location_tracking", "user_email"),
    ("idx_loc_active", "location_tracking", "active"),

    # Audit Logs
    ("idx_audit_user", "audit_logs", "user_email"),
    ("idx_audit_action", "audit_logs", "action"),
    ("idx_audit_timestamp", "audit_logs", "timestamp"),

    # Scheduled Exams
    ("idx_exam_created", "scheduled_exams", "created_at"),

    # Exam Attendance
    ("idx_exam_att_exam", "exam_attendance", "exam_id"),
    ("idx_exam_att_user", "exam_attendance", "user_email"),

    # Resources
    ("idx_res_category", "resources", "category"),
]

# Composite indexes for common query patterns
COMPOSITE_INDEXES = [
    # User completions lookup
    ("idx_cc_user_course", "course_completions", ["user_email", "course_id"]),

    # Content filtering
    ("idx_content_path_type", "content", ["is_path_node", "learning_path_type"]),

    # CRM ticket availability
    ("idx_crm_status_assigned", "crm_tickets", ["status", "assigned_to"]),

    # Quiz submission lookup
    ("idx_qs_quiz_user", "quiz_submissions", ["quiz_id", "user_email"]),

    # Assessment submission lookup
    ("idx_as_assessment_user", "assessment_submissions", ["assessment_id", "user_email"]),
]


def create_index(conn, index_name, table_name, column):
    """Create a single-column index if it doesn't exist."""
    try:
        conn.execute(text(f"""
            CREATE INDEX IF NOT EXISTS {index_name}
            ON {table_name} ({column})
        """))
        logger.info(f"Created index: {index_name} on {table_name}({column})")
        return True
    except Exception as e:
        logger.warning(f"Could not create index {index_name}: {e}")
        return False


def create_composite_index(conn, index_name, table_name, columns):
    """Create a composite index if it doesn't exist."""
    cols_str = ", ".join(columns)
    try:
        conn.execute(text(f"""
            CREATE INDEX IF NOT EXISTS {index_name}
            ON {table_name} ({cols_str})
        """))
        logger.info(f"Created composite index: {index_name} on {table_name}({cols_str})")
        return True
    except Exception as e:
        logger.warning(f"Could not create composite index {index_name}: {e}")
        return False


def main():
    """Create all indexes."""
    logger.info("=" * 60)
    logger.info("ADDING DATABASE INDEXES FOR PERFORMANCE")
    logger.info("=" * 60)

    created = 0
    failed = 0

    with engine.connect() as conn:
        # Single column indexes
        logger.info("\nCreating single-column indexes...")
        for index_name, table_name, column in INDEXES:
            if create_index(conn, index_name, table_name, column):
                created += 1
            else:
                failed += 1

        # Composite indexes
        logger.info("\nCreating composite indexes...")
        for index_name, table_name, columns in COMPOSITE_INDEXES:
            if create_composite_index(conn, index_name, table_name, columns):
                created += 1
            else:
                failed += 1

        conn.commit()

    logger.info("\n" + "=" * 60)
    logger.info(f"INDEXING COMPLETE: {created} created, {failed} failed")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
