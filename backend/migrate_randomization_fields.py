"""
Add randomization fields to scheduled_exams
- randomize_question_order: Shuffle questions for each user
- randomize_option_order: Shuffle options (A,B,C,D) for each user

Run: python migrate_randomization_fields.py
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

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

def run_migration():
    print("=" * 60)
    print("RANDOMIZATION FIELDS MIGRATION")
    print("=" * 60)

    conn = None
    try:
        print("\n[*] Connecting to database...")
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        print("[+] Connected successfully!")

        # Check existing columns
        cursor.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'scheduled_exams'
            AND column_name IN ('randomize_question_order', 'randomize_option_order')
        """)
        existing = [row[0] for row in cursor.fetchall()]

        # Add randomize_question_order
        if 'randomize_question_order' not in existing:
            print("\n[*] Adding 'randomize_question_order' column...")
            cursor.execute("""
                ALTER TABLE scheduled_exams
                ADD COLUMN randomize_question_order BOOLEAN DEFAULT FALSE
            """)
            cursor.execute("""
                COMMENT ON COLUMN scheduled_exams.randomize_question_order IS
                'If true, each user gets questions in random order (shuffle questions)'
            """)
            print("[+] Added 'randomize_question_order'")
        else:
            print("[~] 'randomize_question_order' already exists")

        # Add randomize_option_order
        if 'randomize_option_order' not in existing:
            print("\n[*] Adding 'randomize_option_order' column...")
            cursor.execute("""
                ALTER TABLE scheduled_exams
                ADD COLUMN randomize_option_order BOOLEAN DEFAULT FALSE
            """)
            cursor.execute("""
                COMMENT ON COLUMN scheduled_exams.randomize_option_order IS
                'If true, each user gets options in random order (shuffle A,B,C,D)'
            """)
            print("[+] Added 'randomize_option_order'")
        else:
            print("[~] 'randomize_option_order' already exists")

        conn.commit()
        print("\n[+] Migration committed successfully!")

        # Verify
        cursor.execute("""
            SELECT column_name, data_type, column_default
            FROM information_schema.columns
            WHERE table_name = 'scheduled_exams'
            AND column_name IN ('randomize_question_order', 'randomize_option_order')
        """)

        print("\nNew Columns:")
        print("-" * 60)
        for row in cursor.fetchall():
            print(f"  {row[0]:30s} | {row[1]:15s} | {row[2]}")
        print("-" * 60)

        cursor.close()
        conn.close()

        print("\n" + "=" * 60)
        print("[SUCCESS] RANDOMIZATION FIELDS ADDED!")
        print("=" * 60)
        print("\nFeatures Enabled:")
        print("  1. Randomize question order per user")
        print("  2. Randomize option order (A,B,C,D shuffle)")

    except Exception as e:
        print(f"\n[ERROR] Migration failed: {e}")
        if conn:
            conn.rollback()
            conn.close()
        raise

if __name__ == "__main__":
    run_migration()
