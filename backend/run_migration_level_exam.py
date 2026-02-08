"""
Database migration script to create level_exam_questions table
Run: python run_migration_level_exam.py
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
    """Create level_exam_questions table for admin-editable level advancement exam questions"""

    print("=" * 60)
    print("DATABASE MIGRATION: Level Exam Questions Table")
    print("=" * 60)

    conn = None
    try:
        # Connect to database
        print("\n[*] Connecting to database...")
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        print("[+] Connected successfully!")

        # Check if table already exists
        print("\n[*] Checking if table exists...")
        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'level_exam_questions'
            )
        """)
        table_exists = cursor.fetchone()[0]

        if table_exists:
            print("[+] Table 'level_exam_questions' already exists! No migration needed.")
            conn.close()
            return

        # Create the table
        print("\n[*] Creating 'level_exam_questions' table...")
        cursor.execute("""
            CREATE TABLE level_exam_questions (
                id VARCHAR(255) PRIMARY KEY,
                level_name VARCHAR(255) NOT NULL,
                questions JSONB NOT NULL DEFAULT '[]'::jsonb,
                source VARCHAR(100) DEFAULT 'ai_generated',
                generated_from_content TEXT,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                updated_by VARCHAR(255)
            )
        """)
        print("[+] Table created!")

        # Create unique index on level_name
        print("\n[*] Creating index on level_name...")
        cursor.execute("""
            CREATE UNIQUE INDEX idx_level_exam_level 
            ON level_exam_questions (level_name)
        """)
        print("[+] Index created!")

        # Commit changes
        conn.commit()
        print("\n[+] Migration committed successfully!")

        # Verify
        print("\n[*] Verifying migration...")
        cursor.execute("""
            SELECT column_name, data_type, column_default
            FROM information_schema.columns
            WHERE table_name = 'level_exam_questions'
            ORDER BY ordinal_position
        """)

        print("\nColumn Details:")
        print("-" * 60)
        for row in cursor.fetchall():
            print(f"  {row[0]:25s} | {row[1]:15s} | {str(row[2] or '')[:30]}")
        print("-" * 60)

        cursor.close()
        conn.close()

        print("\n" + "=" * 60)
        print("[SUCCESS] MIGRATION COMPLETED!")
        print("=" * 60)
        print("\nThe level_exam_questions table is now ready.")
        print("Admins can manage level advancement quiz questions from the admin panel.")

    except Exception as e:
        print(f"\n[ERROR] Migration failed: {e}")
        print(f"\nError type: {type(e).__name__}")
        if conn:
            conn.rollback()
            conn.close()
        raise

if __name__ == "__main__":
    run_migration()
