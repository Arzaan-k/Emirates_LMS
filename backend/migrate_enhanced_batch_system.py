"""
Enhanced Batch System Migration
Adds support for:
- Per-batch date, location, supervisor, questions
- Draft/Published status
- Scheduled publish date/time
- Exam visibility control

Run: python migrate_enhanced_batch_system.py
"""

import psycopg2
import os
import sys
from dotenv import load_dotenv

# Set UTF-8 encoding for Windows console
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

# Load environment variables
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

def run_migration():
    """Add enhanced batch system fields to scheduled_exams table"""

    print("=" * 70)
    print("ENHANCED BATCH SYSTEM MIGRATION")
    print("=" * 70)

    conn = None
    try:
        # Connect to database
        print("\n[*] Connecting to database...")
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        print("[+] Connected successfully!")

        # Check existing columns
        print("\n[*] Checking existing columns...")
        cursor.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'scheduled_exams'
        """)
        existing_columns = [row[0] for row in cursor.fetchall()]
        print(f"[+] Found {len(existing_columns)} existing columns")

        migrations_run = []

        # Migration 1: Add exam_status column (draft/published)
        if 'exam_status' not in existing_columns:
            print("\n[*] Adding 'exam_status' column...")
            cursor.execute("""
                ALTER TABLE scheduled_exams
                ADD COLUMN exam_status VARCHAR(20) DEFAULT 'published'
            """)
            cursor.execute("""
                COMMENT ON COLUMN scheduled_exams.exam_status IS
                'Exam visibility status: draft (hidden) or published (visible to users)'
            """)
            migrations_run.append("exam_status")
            print("[+] Added 'exam_status' column")
        else:
            print("[~] 'exam_status' already exists")

        # Migration 2: Add scheduled_publish_at column
        if 'scheduled_publish_at' not in existing_columns:
            print("\n[*] Adding 'scheduled_publish_at' column...")
            cursor.execute("""
                ALTER TABLE scheduled_exams
                ADD COLUMN scheduled_publish_at TIMESTAMP NULL
            """)
            cursor.execute("""
                COMMENT ON COLUMN scheduled_exams.scheduled_publish_at IS
                'Optional: Auto-publish exam at this date/time. NULL means publish immediately when status=published'
            """)
            migrations_run.append("scheduled_publish_at")
            print("[+] Added 'scheduled_publish_at' column")
        else:
            print("[~] 'scheduled_publish_at' already exists")

        # Migration 3: Add allow_different_questions_per_batch flag
        if 'allow_different_questions_per_batch' not in existing_columns:
            print("\n[*] Adding 'allow_different_questions_per_batch' column...")
            cursor.execute("""
                ALTER TABLE scheduled_exams
                ADD COLUMN allow_different_questions_per_batch BOOLEAN DEFAULT FALSE
            """)
            cursor.execute("""
                COMMENT ON COLUMN scheduled_exams.allow_different_questions_per_batch IS
                'If true, each batch can have different questions stored in batch_assignments'
            """)
            migrations_run.append("allow_different_questions_per_batch")
            print("[+] Added 'allow_different_questions_per_batch' column")
        else:
            print("[~] 'allow_different_questions_per_batch' already exists")

        # Update existing records
        if migrations_run:
            print("\n[*] Updating existing records with default values...")

            cursor.execute("""
                UPDATE scheduled_exams
                SET exam_status = 'published'
                WHERE exam_status IS NULL
            """)
            print(f"[+] Set exam_status='published' for {cursor.rowcount} existing exams")

            cursor.execute("""
                UPDATE scheduled_exams
                SET allow_different_questions_per_batch = FALSE
                WHERE allow_different_questions_per_batch IS NULL
            """)
            print(f"[+] Set allow_different_questions_per_batch=FALSE for {cursor.rowcount} exams")

        # Commit all changes
        conn.commit()
        print("\n[+] Migration committed successfully!")

        # Verify the changes
        print("\n[*] Verifying new columns...")
        cursor.execute("""
            SELECT column_name, data_type, column_default
            FROM information_schema.columns
            WHERE table_name = 'scheduled_exams'
            AND column_name IN ('exam_status', 'scheduled_publish_at', 'allow_different_questions_per_batch')
            ORDER BY column_name
        """)

        print("\nNew Column Details:")
        print("-" * 70)
        for row in cursor.fetchall():
            print(f"  {row[0]:40s} | {row[1]:20s} | {row[2]}")
        print("-" * 70)

        # Show batch_assignments structure explanation
        print("\n[*] Enhanced batch_assignments structure:")
        print("-" * 70)
        print("  Each batch can now have:")
        print("    - batchNumber: int")
        print("    - startTime: string")
        print("    - endTime: string")
        print("    - examDate: string (NEW - optional per-batch date)")
        print("    - location: string (NEW - optional per-batch location)")
        print("    - supervisorEmail: string (NEW - optional per-batch supervisor)")
        print("    - supervisorName: string (NEW)")
        print("    - maxUsers: int")
        print("    - users: array of emails")
        print("    - questions: array (NEW - optional if allow_different_questions_per_batch=true)")
        print("-" * 70)

        # Count records
        cursor.execute("SELECT COUNT(*) FROM scheduled_exams")
        count = cursor.fetchone()[0]
        print(f"\n[*] Total scheduled exams: {count}")

        cursor.execute("""
            SELECT exam_status, COUNT(*)
            FROM scheduled_exams
            GROUP BY exam_status
        """)
        print("\nExams by status:")
        for row in cursor.fetchall():
            print(f"  {row[0]}: {row[1]} exams")

        cursor.close()
        conn.close()

        print("\n" + "=" * 70)
        print("[SUCCESS] ENHANCED BATCH SYSTEM MIGRATION COMPLETED!")
        print("=" * 70)
        print("\nNew Features Enabled:")
        print("  1. Draft/Published exam status")
        print("  2. Scheduled auto-publish")
        print("  3. Per-batch date configuration")
        print("  4. Per-batch location configuration")
        print("  5. Per-batch supervisor assignment")
        print("  6. Optional different questions per batch")
        print("\nNext Steps:")
        print("  1. Restart backend server")
        print("  2. Update frontend to use new features")
        print("  3. Test batch configuration in Schedule Exam modal")

    except Exception as e:
        print(f"\n[ERROR] Migration failed: {e}")
        print(f"\nError type: {type(e).__name__}")
        if conn:
            conn.rollback()
            conn.close()
        raise

if __name__ == "__main__":
    run_migration()
