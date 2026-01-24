"""
Synchronization script to migrate all in-memory data to database
This ensures existing data is preserved when switching to database
Run this after database initialization
"""

import os
import sys
from dotenv import load_dotenv
from datetime import datetime

# Load environment variables
load_dotenv()

# Import server data structures (this will load all in-memory stores)
from server import (
    users_store, content_store, course_completions, quiz_store, quiz_submissions,
    notification_store, news_feed, live_quizzes, meetings_store, attendance_records,
    proctored_assessments, assessment_submissions, course_buckets
)

from database import SessionLocal
from models import (
    User, Content, CourseCompletion, Quiz, QuizSubmission, Notification,
    NewsFeed, Meeting, AttendanceRecord, ProcturedAssessment,
    AssessmentSubmission, CourseBucket
)

def sync_users(db):
    """Sync users from users_store to database"""
    print("\n[INFO] Syncing users...")
    synced = 0
    skipped = 0

    for email, user_data in users_store.items():
        # Check if user already exists
        existing = db.query(User).filter(User.email == email).first()
        if existing:
            skipped += 1
            continue

        # Create new user
        try:
            user = User(
                email=user_data.get("email"),
                name=user_data.get("name"),
                password=user_data.get("password"),
                role=user_data.get("role", "Waffler"),
                category=user_data.get("category", "Employee"),
                privileges=user_data.get("privileges", []),
                is_superadmin=user_data.get("is_superadmin", False),
                has_admin_access=user_data.get("has_admin_access", False),
                store=user_data.get("store", "Unassigned"),
                self_learning_completed=user_data.get("self_learning_completed", False)
            )
            db.add(user)
            synced += 1
        except Exception as e:
            print(f"   [ERROR] Failed to sync user {email}: {e}")

    db.commit()
    print(f"   [OK] Synced {synced} users, skipped {skipped} existing")


def sync_content(db):
    """Sync content from content_store to database"""
    print("\n[INFO] Syncing content...")
    synced = 0
    skipped = 0

    for content_data in content_store:
        content_id = content_data.get("id")
        if not content_id:
            continue

        # Check if content already exists
        existing = db.query(Content).filter(Content.id == content_id).first()
        if existing:
            skipped += 1
            continue

        # Create new content
        try:
            content = Content(
                id=content_id,
                title=content_data.get("title"),
                description=content_data.get("description"),
                bucket=content_data.get("bucket"),
                bucket_id=content_data.get("bucket_id"),
                resource_type=content_data.get("type"),
                video_url=content_data.get("videoUrl"),
                file_url=content_data.get("fileUrl"),
                thumbnail=content_data.get("thumbnail"),
                duration=content_data.get("duration"),
                timestamp=content_data.get("timestamp", datetime.utcnow()),
                is_path_node=content_data.get("isPathNode", False),
                learning_path_type=content_data.get("learning_path_type"),
                transcript=content_data.get("transcript"),
                quiz=content_data.get("quiz")
            )
            db.add(content)
            synced += 1
        except Exception as e:
            print(f"   [ERROR] Failed to sync content {content_id}: {e}")

    db.commit()
    print(f"   [OK] Synced {synced} content items, skipped {skipped} existing")


def sync_course_completions(db):
    """Sync course completions to database"""
    print("\n[INFO] Syncing course completions...")
    synced = 0

    for completion_data in course_completions:
        try:
            # Check if completion already exists
            completion_id = completion_data.get("id")
            if completion_id:
                existing = db.query(CourseCompletion).filter(
                    CourseCompletion.id == completion_id
                ).first()
                if existing:
                    continue

            completion = CourseCompletion(
                id=completion_data.get("id", str(__import__('uuid').uuid4())),
                user_email=completion_data.get("user_email"),
                course_id=completion_data.get("course_id"),
                course_title=completion_data.get("course_title"),
                bucket=completion_data.get("bucket"),
                score=completion_data.get("score"),
                time_spent_seconds=completion_data.get("time_spent_seconds"),
                quiz_answers=completion_data.get("quiz_answers"),
                quiz_correct=completion_data.get("quiz_correct"),
                quiz_total=completion_data.get("quiz_total")
            )
            db.add(completion)
            synced += 1
        except Exception as e:
            print(f"   [ERROR] Failed to sync completion: {e}")

    db.commit()
    print(f"   [OK] Synced {synced} course completions")


def sync_notifications(db):
    """Sync notifications to database"""
    print("\n[INFO] Syncing notifications...")
    synced = 0

    for notif_data in notification_store:
        try:
            notif_id = notif_data.get("id")
            if notif_id:
                existing = db.query(Notification).filter(Notification.id == notif_id).first()
                if existing:
                    continue

            notification = Notification(
                id=notif_data.get("id", str(__import__('uuid').uuid4())),
                title=notif_data.get("title"),
                message=notif_data.get("message"),
                notification_type=notif_data.get("type"),
                read_by=notif_data.get("read_by", []),
                target_users=notif_data.get("target_users", [])
            )
            db.add(notification)
            synced += 1
        except Exception as e:
            print(f"   [ERROR] Failed to sync notification: {e}")

    db.commit()
    print(f"   [OK] Synced {synced} notifications")


def sync_assessments(db):
    """Sync proctored assessments to database"""
    print("\n[INFO] Syncing proctored assessments...")
    synced = 0

    for assessment_data in proctored_assessments:
        try:
            assessment_id = assessment_data.get("id")
            if assessment_id:
                existing = db.query(ProcturedAssessment).filter(
                    ProcturedAssessment.id == assessment_id
                ).first()
                if existing:
                    continue

            assessment = ProcturedAssessment(
                id=assessment_id,
                title=assessment_data.get("title"),
                description=assessment_data.get("description"),
                questions=assessment_data.get("questions"),
                time_limit_minutes=assessment_data.get("time_limit_minutes", 30),
                passing_score=assessment_data.get("passing_score", 70),
                created_by=assessment_data.get("created_by"),
                active=assessment_data.get("active", True),
                total_questions=assessment_data.get("total_questions")
            )
            db.add(assessment)
            synced += 1
        except Exception as e:
            print(f"   [ERROR] Failed to sync assessment: {e}")

    db.commit()
    print(f"   [OK] Synced {synced} assessments")


def main():
    """Run all synchronization operations"""
    print("=" * 60)
    print("DATABASE SYNCHRONIZATION")
    print("=" * 60)

    db = SessionLocal()
    try:
        # Sync all data structures
        sync_users(db)
        sync_content(db)
        sync_course_completions(db)
        sync_notifications(db)
        sync_assessments(db)

        print("\n" + "=" * 60)
        print("[SUCCESS] All data synchronized to database!")
        print("=" * 60)
        return True

    except Exception as e:
        print(f"\n[ERROR] Synchronization failed: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
        return False
    finally:
        db.close()


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
