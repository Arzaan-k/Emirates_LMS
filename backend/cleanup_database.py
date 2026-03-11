"""
Database Cleanup Script for Emirates LMS
Removes all data except superadmin and Aditya's user
"""

from sqlalchemy import create_engine, text
from app.config.settings import settings

def cleanup_database():
    """
    Clean up all tables while preserving:
    - Superadmin user: bwc552 (Rohit Panicker)
    - Aditya's user: user (Aditya User)
    """

    engine = create_engine(settings.DATABASE_URL)

    # Users to preserve
    preserve_users = ['user', 'bwc552']
    preserve_users_str = "', '".join(preserve_users)

    print("=" * 80)
    print("EMIRATES LMS DATABASE CLEANUP")
    print("=" * 80)
    print(f"\nPreserving users: {preserve_users}")
    print("\nStarting cleanup process...\n")

    with engine.begin() as conn:
        # Track deleted counts
        deleted_counts = {}

        # 1. assessment_submissions - Clear all
        print("1. Cleaning assessment_submissions...")
        result = conn.execute(text("SELECT COUNT(*) FROM assessment_submissions"))
        count = result.fetchone()[0]
        conn.execute(text("DELETE FROM assessment_submissions"))
        deleted_counts['assessment_submissions'] = count
        print(f"   Deleted {count} records")

        # 2. attendance_records - Clear all
        print("2. Cleaning attendance_records...")
        result = conn.execute(text("SELECT COUNT(*) FROM attendance_records"))
        count = result.fetchone()[0]
        conn.execute(text("DELETE FROM attendance_records"))
        deleted_counts['attendance_records'] = count
        print(f"   Deleted {count} records")

        # 3. audit_assignments - Clear all
        print("3. Cleaning audit_assignments...")
        result = conn.execute(text("SELECT COUNT(*) FROM audit_assignments"))
        count = result.fetchone()[0]
        conn.execute(text("DELETE FROM audit_assignments"))
        deleted_counts['audit_assignments'] = count
        print(f"   Deleted {count} records")

        # 4. audit_logs - Clear all
        print("4. Cleaning audit_logs...")
        result = conn.execute(text("SELECT COUNT(*) FROM audit_logs"))
        count = result.fetchone()[0]
        conn.execute(text("DELETE FROM audit_logs"))
        deleted_counts['audit_logs'] = count
        print(f"   Deleted {count} records")

        # 5. audit_submissions - Clear all
        print("5. Cleaning audit_submissions...")
        result = conn.execute(text("SELECT COUNT(*) FROM audit_submissions"))
        count = result.fetchone()[0]
        conn.execute(text("DELETE FROM audit_submissions"))
        deleted_counts['audit_submissions'] = count
        print(f"   Deleted {count} records")

        # 6. audit_templates - Clear all
        print("6. Cleaning audit_templates...")
        result = conn.execute(text("SELECT COUNT(*) FROM audit_templates"))
        count = result.fetchone()[0]
        conn.execute(text("DELETE FROM audit_templates"))
        deleted_counts['audit_templates'] = count
        print(f"   Deleted {count} records")

        # 7. content - Clear all
        print("7. Cleaning content...")
        result = conn.execute(text("SELECT COUNT(*) FROM content"))
        count = result.fetchone()[0]
        conn.execute(text("DELETE FROM content"))
        deleted_counts['content'] = count
        print(f"   Deleted {count} records")

        # 8. course_buckets - Clear all
        print("8. Cleaning course_buckets...")
        result = conn.execute(text("SELECT COUNT(*) FROM course_buckets"))
        count = result.fetchone()[0]
        conn.execute(text("DELETE FROM course_buckets"))
        deleted_counts['course_buckets'] = count
        print(f"   Deleted {count} records")

        # 9. course_completions - Clear all
        print("9. Cleaning course_completions...")
        result = conn.execute(text("SELECT COUNT(*) FROM course_completions"))
        count = result.fetchone()[0]
        conn.execute(text("DELETE FROM course_completions"))
        deleted_counts['course_completions'] = count
        print(f"   Deleted {count} records")

        # 10. course_feedback - Clear all
        print("10. Cleaning course_feedback...")
        result = conn.execute(text("SELECT COUNT(*) FROM course_feedback"))
        count = result.fetchone()[0]
        conn.execute(text("DELETE FROM course_feedback"))
        deleted_counts['course_feedback'] = count
        print(f"   Deleted {count} records")

        # 11. course_surveys - Clear all
        print("11. Cleaning course_surveys...")
        result = conn.execute(text("SELECT COUNT(*) FROM course_surveys"))
        count = result.fetchone()[0]
        conn.execute(text("DELETE FROM course_surveys"))
        deleted_counts['course_surveys'] = count
        print(f"   Deleted {count} records")

        # 12. crm_task_assignments - Clear all
        print("12. Cleaning crm_task_assignments...")
        result = conn.execute(text("SELECT COUNT(*) FROM crm_task_assignments"))
        count = result.fetchone()[0]
        conn.execute(text("DELETE FROM crm_task_assignments"))
        deleted_counts['crm_task_assignments'] = count
        print(f"   Deleted {count} records")

        # 13. crm_tickets - Clear all
        print("13. Cleaning crm_tickets...")
        result = conn.execute(text("SELECT COUNT(*) FROM crm_tickets"))
        count = result.fetchone()[0]
        conn.execute(text("DELETE FROM crm_tickets"))
        deleted_counts['crm_tickets'] = count
        print(f"   Deleted {count} records")

        # 14. daily_quiz_responses - Clear all
        print("14. Cleaning daily_quiz_responses...")
        result = conn.execute(text("SELECT COUNT(*) FROM daily_quiz_responses"))
        count = result.fetchone()[0]
        conn.execute(text("DELETE FROM daily_quiz_responses"))
        deleted_counts['daily_quiz_responses'] = count
        print(f"   Deleted {count} records")

        # 15. daily_quizzes - Clear all
        print("15. Cleaning daily_quizzes...")
        result = conn.execute(text("SELECT COUNT(*) FROM daily_quizzes"))
        count = result.fetchone()[0]
        conn.execute(text("DELETE FROM daily_quizzes"))
        deleted_counts['daily_quizzes'] = count
        print(f"   Deleted {count} records")

        # 16. exam_attendance - Clear all
        print("16. Cleaning exam_attendance...")
        result = conn.execute(text("SELECT COUNT(*) FROM exam_attendance"))
        count = result.fetchone()[0]
        conn.execute(text("DELETE FROM exam_attendance"))
        deleted_counts['exam_attendance'] = count
        print(f"   Deleted {count} records")

        # 17. level_exam_questions - Clear all
        print("17. Cleaning level_exam_questions...")
        result = conn.execute(text("SELECT COUNT(*) FROM level_exam_questions"))
        count = result.fetchone()[0]
        conn.execute(text("DELETE FROM level_exam_questions"))
        deleted_counts['level_exam_questions'] = count
        print(f"   Deleted {count} records")

        # 18. live_quizzes - Clear all
        print("18. Cleaning live_quizzes...")
        result = conn.execute(text("SELECT COUNT(*) FROM live_quizzes"))
        count = result.fetchone()[0]
        conn.execute(text("DELETE FROM live_quizzes"))
        deleted_counts['live_quizzes'] = count
        print(f"   Deleted {count} records")

        # 19. location_tracking - Clear all
        print("19. Cleaning location_tracking...")
        result = conn.execute(text("SELECT COUNT(*) FROM location_tracking"))
        count = result.fetchone()[0]
        conn.execute(text("DELETE FROM location_tracking"))
        deleted_counts['location_tracking'] = count
        print(f"   Deleted {count} records")

        # 20. meetings - Clear all
        print("20. Cleaning meetings...")
        result = conn.execute(text("SELECT COUNT(*) FROM meetings"))
        count = result.fetchone()[0]
        conn.execute(text("DELETE FROM meetings"))
        deleted_counts['meetings'] = count
        print(f"   Deleted {count} records")

        # 21. mid_video_quiz_attempts - Clear all
        print("21. Cleaning mid_video_quiz_attempts...")
        result = conn.execute(text("SELECT COUNT(*) FROM mid_video_quiz_attempts"))
        count = result.fetchone()[0]
        conn.execute(text("DELETE FROM mid_video_quiz_attempts"))
        deleted_counts['mid_video_quiz_attempts'] = count
        print(f"   Deleted {count} records")

        # 22. mid_video_quizzes - Clear all
        print("22. Cleaning mid_video_quizzes...")
        result = conn.execute(text("SELECT COUNT(*) FROM mid_video_quizzes"))
        count = result.fetchone()[0]
        conn.execute(text("DELETE FROM mid_video_quizzes"))
        deleted_counts['mid_video_quizzes'] = count
        print(f"   Deleted {count} records")

        # 23. news_feed - Clear all
        print("23. Cleaning news_feed...")
        result = conn.execute(text("SELECT COUNT(*) FROM news_feed"))
        count = result.fetchone()[0]
        conn.execute(text("DELETE FROM news_feed"))
        deleted_counts['news_feed'] = count
        print(f"   Deleted {count} records")

        # 24. notifications - Clear all
        print("24. Cleaning notifications...")
        result = conn.execute(text("SELECT COUNT(*) FROM notifications"))
        count = result.fetchone()[0]
        conn.execute(text("DELETE FROM notifications"))
        deleted_counts['notifications'] = count
        print(f"   Deleted {count} records")

        # 25. proctored_assessments - Clear all
        print("25. Cleaning proctored_assessments...")
        result = conn.execute(text("SELECT COUNT(*) FROM proctored_assessments"))
        count = result.fetchone()[0]
        conn.execute(text("DELETE FROM proctored_assessments"))
        deleted_counts['proctored_assessments'] = count
        print(f"   Deleted {count} records")

        # 26. quiz_submissions - Clear all
        print("26. Cleaning quiz_submissions...")
        result = conn.execute(text("SELECT COUNT(*) FROM quiz_submissions"))
        count = result.fetchone()[0]
        conn.execute(text("DELETE FROM quiz_submissions"))
        deleted_counts['quiz_submissions'] = count
        print(f"   Deleted {count} records")

        # 27. quizzes - Clear all
        print("27. Cleaning quizzes...")
        result = conn.execute(text("SELECT COUNT(*) FROM quizzes"))
        count = result.fetchone()[0]
        conn.execute(text("DELETE FROM quizzes"))
        deleted_counts['quizzes'] = count
        print(f"   Deleted {count} records")

        # 28. report_subscriptions - Clear all
        print("28. Cleaning report_subscriptions...")
        result = conn.execute(text("SELECT COUNT(*) FROM report_subscriptions"))
        count = result.fetchone()[0]
        conn.execute(text("DELETE FROM report_subscriptions"))
        deleted_counts['report_subscriptions'] = count
        print(f"   Deleted {count} records")

        # 29. resources - Clear all
        print("29. Cleaning resources...")
        result = conn.execute(text("SELECT COUNT(*) FROM resources"))
        count = result.fetchone()[0]
        conn.execute(text("DELETE FROM resources"))
        deleted_counts['resources'] = count
        print(f"   Deleted {count} records")

        # 30. scheduled_exams - Clear all
        print("30. Cleaning scheduled_exams...")
        result = conn.execute(text("SELECT COUNT(*) FROM scheduled_exams"))
        count = result.fetchone()[0]
        conn.execute(text("DELETE FROM scheduled_exams"))
        deleted_counts['scheduled_exams'] = count
        print(f"   Deleted {count} records")

        # 31. simulation_analytics_snapshots - Clear all
        print("31. Cleaning simulation_analytics_snapshots...")
        result = conn.execute(text("SELECT COUNT(*) FROM simulation_analytics_snapshots"))
        count = result.fetchone()[0]
        conn.execute(text("DELETE FROM simulation_analytics_snapshots"))
        deleted_counts['simulation_analytics_snapshots'] = count
        print(f"   Deleted {count} records")

        # 32. simulation_progress - Clear all
        print("32. Cleaning simulation_progress...")
        result = conn.execute(text("SELECT COUNT(*) FROM simulation_progress"))
        count = result.fetchone()[0]
        conn.execute(text("DELETE FROM simulation_progress"))
        deleted_counts['simulation_progress'] = count
        print(f"   Deleted {count} records")

        # 33. simulations - Clear all
        print("33. Cleaning simulations...")
        result = conn.execute(text("SELECT COUNT(*) FROM simulations"))
        count = result.fetchone()[0]
        conn.execute(text("DELETE FROM simulations"))
        deleted_counts['simulations'] = count
        print(f"   Deleted {count} records")

        # 34. survey_responses - Clear all
        print("34. Cleaning survey_responses...")
        result = conn.execute(text("SELECT COUNT(*) FROM survey_responses"))
        count = result.fetchone()[0]
        conn.execute(text("DELETE FROM survey_responses"))
        deleted_counts['survey_responses'] = count
        print(f"   Deleted {count} records")

        # 35. user_access_assignments - Delete for non-preserved users
        print("35. Cleaning user_access_assignments...")
        result = conn.execute(text("SELECT COUNT(*) FROM user_access_assignments"))
        count = result.fetchone()[0]
        conn.execute(text(f"""
            DELETE FROM user_access_assignments
            WHERE assignee_email NOT IN ('{preserve_users_str}')
        """))
        deleted_counts['user_access_assignments'] = count
        print(f"   Deleted records (kept for preserved users)")

        # 36. user_access_grants - Delete for non-preserved users
        print("36. Cleaning user_access_grants...")
        result = conn.execute(text("SELECT COUNT(*) FROM user_access_grants"))
        count = result.fetchone()[0]
        conn.execute(text(f"""
            DELETE FROM user_access_grants
            WHERE grantee_email NOT IN ('{preserve_users_str}')
        """))
        deleted_counts['user_access_grants'] = count
        print(f"   Deleted records (kept for preserved users)")

        # 37. user_interactions - Delete for non-preserved users
        print("37. Cleaning user_interactions...")
        result = conn.execute(text("SELECT COUNT(*) FROM user_interactions"))
        count = result.fetchone()[0]
        conn.execute(text(f"""
            DELETE FROM user_interactions
            WHERE user_email NOT IN ('{preserve_users_str}')
        """))
        deleted_counts['user_interactions'] = count
        print(f"   Deleted records (kept for preserved users)")

        # 38. user_learning_profiles - Delete for non-preserved users
        print("38. Cleaning user_learning_profiles...")
        result = conn.execute(text("SELECT COUNT(*) FROM user_learning_profiles"))
        count = result.fetchone()[0]
        conn.execute(text(f"""
            DELETE FROM user_learning_profiles
            WHERE user_email NOT IN ('{preserve_users_str}')
        """))
        deleted_counts['user_learning_profiles'] = count
        print(f"   Deleted records (kept for preserved users)")

        # 39. user_node_progress - Delete for non-preserved users
        print("39. Cleaning user_node_progress...")
        result = conn.execute(text("SELECT COUNT(*) FROM user_node_progress"))
        count = result.fetchone()[0]
        conn.execute(text(f"""
            DELETE FROM user_node_progress
            WHERE user_email NOT IN ('{preserve_users_str}')
        """))
        deleted_counts['user_node_progress'] = count
        print(f"   Deleted records (kept for preserved users)")

        # 40. video_progress - Delete for non-preserved users
        print("40. Cleaning video_progress...")
        result = conn.execute(text("SELECT COUNT(*) FROM video_progress"))
        count = result.fetchone()[0]
        conn.execute(text(f"""
            DELETE FROM video_progress
            WHERE user_email NOT IN ('{preserve_users_str}')
        """))
        deleted_counts['video_progress'] = count
        print(f"   Deleted records (kept for preserved users)")

        # 41. users - Delete all except preserved users
        print("41. Cleaning users table...")
        result = conn.execute(text("SELECT COUNT(*) FROM users"))
        total_users = result.fetchone()[0]
        conn.execute(text(f"""
            DELETE FROM users
            WHERE email NOT IN ('{preserve_users_str}')
        """))
        result = conn.execute(text("SELECT COUNT(*) FROM users"))
        remaining_users = result.fetchone()[0]
        deleted_users = total_users - remaining_users
        deleted_counts['users'] = deleted_users
        print(f"   Deleted {deleted_users} users (kept {remaining_users})")

        print("\n" + "=" * 80)
        print("CLEANUP SUMMARY")
        print("=" * 80)

        total_deleted = sum(deleted_counts.values())
        print(f"\nTotal records deleted: {total_deleted:,}")
        print(f"\nUsers preserved: {remaining_users}")

        # Show preserved users
        result = conn.execute(text(f"""
            SELECT email, name, role
            FROM users
            WHERE email IN ('{preserve_users_str}')
        """))
        preserved = result.fetchall()
        print("\nPreserved users:")
        for user in preserved:
            print(f"  - {user[0]} ({user[1]}) - {user[2]}")

        print("\n" + "=" * 80)
        print("DATABASE CLEANUP COMPLETED SUCCESSFULLY!")
        print("=" * 80)


if __name__ == "__main__":
    cleanup_database()
