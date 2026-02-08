"""
Test script for enhanced batch system API
Verifies that all new fields are properly stored and retrieved
"""

import sys
import codecs

# Set UTF-8 encoding for Windows console
if sys.platform == 'win32':
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

import requests
import json
from datetime import datetime, timedelta

# Backend URL
API_URL = "http://localhost:8000/api/v1"

def test_create_scheduled_exam():
    """Test creating a scheduled exam with all enhanced features"""

    print("=" * 70)
    print("TEST: Create Scheduled Exam with Enhanced Batch System")
    print("=" * 70)

    # Prepare test data
    scheduled_publish_at = (datetime.utcnow() + timedelta(minutes=5)).isoformat()

    form_data = {
        "title": "Enhanced Batch Test Exam",
        "description": "Testing enhanced batch system with all new features",
        "exam_date": "2026-02-10",
        "exam_time": "10:00",
        "location": "Main Campus",
        "supervisor_email": "supervisor@test.com",
        "supervisor_name": "Test Supervisor",
        "time_limit_minutes": 60,
        "passing_score": 75,
        "created_by": "API Test",

        # Batch system
        "number_of_batches": 2,
        "batch_assignments": json.dumps([
            {
                "batchNumber": 1,
                "startTime": "10:00",
                "endTime": "11:00",
                "maxUsers": 5,
                "date": "2026-02-10",
                "location": "Room 101",
                "supervisorEmail": "supervisor1@test.com",
                "supervisorName": "Supervisor One",
                "users": ["user1@test.com", "user2@test.com"]
            },
            {
                "batchNumber": 2,
                "startTime": "14:00",
                "endTime": "15:00",
                "maxUsers": 5,
                "date": "2026-02-11",
                "location": "Room 202",
                "supervisorEmail": "supervisor2@test.com",
                "supervisorName": "Supervisor Two",
                "users": ["user3@test.com", "user4@test.com"]
            }
        ]),

        # Questions
        "questions": json.dumps([
            {
                "id": "q1",
                "question": "What is 2+2?",
                "options": ["3", "4", "5", "6"],
                "correct_answer": 1,
                "difficulty": "easy"
            },
            {
                "id": "q2",
                "question": "What is the capital of France?",
                "options": ["London", "Berlin", "Paris", "Rome"],
                "correct_answer": 2,
                "difficulty": "medium"
            }
        ]),

        "assigned_users": json.dumps([
            "user1@test.com", "user2@test.com", "user3@test.com", "user4@test.com"
        ]),

        # Enhanced features
        "exam_status": "published",
        "scheduled_publish_at": scheduled_publish_at,
        "allow_different_questions_per_batch": "false",
        "randomize_question_order": "true",
        "randomize_option_order": "true"
    }

    try:
        print("\n[*] Creating exam with enhanced features...")
        response = requests.post(
            f"{API_URL}/assessments/scheduled",
            data=form_data
        )

        if response.status_code == 200 or response.status_code == 201:
            exam = response.json()
            print("[+] Exam created successfully!")
            print(f"\n    Exam ID: {exam.get('id')}")
            print(f"    Title: {exam.get('title')}")
            print(f"    Status: {exam.get('exam_status', exam.get('examStatus'))}")
            print(f"    Batches: {exam.get('number_of_batches', exam.get('numberOfBatches'))}")
            print(f"    Randomize Questions: {exam.get('randomize_question_order', exam.get('randomizeQuestionOrder'))}")
            print(f"    Randomize Options: {exam.get('randomize_option_order', exam.get('randomizeOptionOrder'))}")
            print(f"    Allow Different Questions: {exam.get('allow_different_questions_per_batch', exam.get('allowDifferentQuestionsPerBatch'))}")
            print(f"    Scheduled Publish: {exam.get('scheduled_publish_at', exam.get('scheduledPublishAt'))}")

            # Test batch assignments
            batch_assignments = exam.get('batch_assignments', exam.get('batchAssignments', []))
            if batch_assignments:
                print(f"\n    Batch Details:")
                for batch in batch_assignments:
                    print(f"      - Batch {batch.get('batchNumber')}: {batch.get('date')} at {batch.get('startTime')}")
                    print(f"        Location: {batch.get('location')}")
                    print(f"        Supervisor: {batch.get('supervisorName')}")
                    print(f"        Users: {len(batch.get('users', []))}")

            return exam.get('id')
        else:
            print(f"[!] Failed to create exam: {response.status_code}")
            print(f"    Response: {response.text}")
            return None

    except Exception as e:
        print(f"[!] Error: {e}")
        return None


def test_get_user_exams(exam_id, user_email):
    """Test getting exams for a specific user"""

    print("\n" + "=" * 70)
    print(f"TEST: Get Exams for User: {user_email}")
    print("=" * 70)

    try:
        print(f"\n[*] Fetching exams for {user_email}...")
        response = requests.get(f"{API_URL}/assessments/scheduled/user/{user_email}")

        if response.status_code == 200:
            exams = response.json()
            print(f"[+] Retrieved {len(exams)} exam(s)")

            for exam in exams:
                if exam.get('id') == exam_id:
                    print(f"\n    Found Test Exam:")
                    print(f"    - Title: {exam.get('title')}")
                    print(f"    - Date: {exam.get('exam_date', exam.get('examDate'))}")
                    print(f"    - Time: {exam.get('exam_time', exam.get('examTime'))}")
                    print(f"    - Location: {exam.get('location')}")
                    print(f"    - Supervisor: {exam.get('supervisor_name', exam.get('supervisorName'))}")
                    print(f"    - Batch Number: {exam.get('batch_number', exam.get('batchNumber'))}")
                    print(f"    - Is Batch Exam: {exam.get('is_batch_exam', exam.get('isBatchExam'))}")

                    return True

            print(f"\n    [!] Test exam not found (may be filtered by status/publish time)")
            return False
        else:
            print(f"[!] Failed to get exams: {response.status_code}")
            print(f"    Response: {response.text}")
            return False

    except Exception as e:
        print(f"[!] Error: {e}")
        return False


def test_database_schema():
    """Verify database schema has all required columns"""

    print("\n" + "=" * 70)
    print("TEST: Database Schema Verification")
    print("=" * 70)

    try:
        import psycopg2
        import os
        from dotenv import load_dotenv

        load_dotenv()
        DATABASE_URL = os.getenv('DATABASE_URL')

        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()

        print("\n[*] Checking for enhanced batch columns...")
        cursor.execute("""
            SELECT column_name, data_type, column_default
            FROM information_schema.columns
            WHERE table_name = 'scheduled_exams'
            AND column_name IN (
                'exam_status',
                'scheduled_publish_at',
                'allow_different_questions_per_batch',
                'randomize_question_order',
                'randomize_option_order',
                'number_of_batches',
                'batch_assignments'
            )
            ORDER BY column_name;
        """)

        columns = cursor.fetchall()

        if len(columns) == 7:
            print("[+] All 7 enhanced columns found!")
            print("\n    Column Details:")
            for col in columns:
                print(f"    - {col[0]:40s} | {col[1]:20s} | {str(col[2])[:30]}")
            cursor.close()
            conn.close()
            return True
        else:
            print(f"[!] Missing columns! Found {len(columns)}/7")
            cursor.close()
            conn.close()
            return False

    except Exception as e:
        print(f"[!] Database check failed: {e}")
        return False


def main():
    """Run all tests"""

    print("\n")
    print("=" * 70)
    print(" " * 15 + "ENHANCED BATCH SYSTEM API TESTS")
    print("=" * 70)
    print()

    # Test 1: Database Schema
    schema_ok = test_database_schema()

    if not schema_ok:
        print("\n[!] Database schema incomplete. Please run migrations first.")
        return

    # Test 2: Create Exam
    exam_id = test_create_scheduled_exam()

    if not exam_id:
        print("\n[!] Exam creation failed. Check backend logs.")
        return

    # Test 3: Get Exam for Batch 1 User
    test_get_user_exams(exam_id, "user1@test.com")

    # Test 4: Get Exam for Batch 2 User
    test_get_user_exams(exam_id, "user3@test.com")

    # Summary
    print("\n" + "=" * 70)
    print("TEST SUMMARY")
    print("=" * 70)
    print("\n[+] All tests completed!")
    print("\nVerify:")
    print("  1. Exam created with all enhanced fields")
    print("  2. Batch 1 users see Batch 1 details (date, time, location, supervisor)")
    print("  3. Batch 2 users see Batch 2 details (date, time, location, supervisor)")
    print("  4. Randomization flags stored correctly")
    print("  5. Draft/publish status working")
    print("\n")


if __name__ == "__main__":
    main()
