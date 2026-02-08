"""
Quick database migration script to add batch columns to scheduled_exams table
Run: python run_migration.py
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
    """Add number_of_batches and batch_assignments columns to scheduled_exams"""

    print("=" * 60)
    print("DATABASE MIGRATION: Adding Batch Columns")
    print("=" * 60)

    conn = None
    try:
        # Connect to database
        print("\n[*] Connecting to database...")
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        print("[+] Connected successfully!")

        # Check if columns already exist
        print("\n[*] Checking if columns exist...")
        cursor.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'scheduled_exams'
            AND column_name IN ('number_of_batches', 'batch_assignments')
        """)
        existing_columns = [row[0] for row in cursor.fetchall()]

        if 'number_of_batches' in existing_columns and 'batch_assignments' in existing_columns:
            print("[+] Columns already exist! No migration needed.")
            conn.close()
            return

        # Add number_of_batches column
        if 'number_of_batches' not in existing_columns:
            print("\n[*] Adding 'number_of_batches' column...")
            cursor.execute("""
                ALTER TABLE scheduled_exams
                ADD COLUMN number_of_batches INTEGER DEFAULT 1
            """)
            print("[+] Added 'number_of_batches' column")
        else:
            print("[~] 'number_of_batches' already exists, skipping")

        # Add batch_assignments column
        if 'batch_assignments' not in existing_columns:
            print("\n[*] Adding 'batch_assignments' column...")
            cursor.execute("""
                ALTER TABLE scheduled_exams
                ADD COLUMN batch_assignments JSONB DEFAULT '[]'::jsonb
            """)
            print("[+] Added 'batch_assignments' column")
        else:
            print("[~] 'batch_assignments' already exists, skipping")

        # Update existing records
        print("\n[*] Updating existing records with default values...")
        cursor.execute("""
            UPDATE scheduled_exams
            SET number_of_batches = 1
            WHERE number_of_batches IS NULL
        """)
        rows_updated = cursor.rowcount
        print(f"[+] Updated {rows_updated} rows for 'number_of_batches'")

        cursor.execute("""
            UPDATE scheduled_exams
            SET batch_assignments = '[]'::jsonb
            WHERE batch_assignments IS NULL
        """)
        rows_updated = cursor.rowcount
        print(f"[+] Updated {rows_updated} rows for 'batch_assignments'")

        # Commit changes
        conn.commit()
        print("\n[+] Migration committed successfully!")

        # Verify the changes
        print("\n[*] Verifying migration...")
        cursor.execute("""
            SELECT column_name, data_type, column_default
            FROM information_schema.columns
            WHERE table_name = 'scheduled_exams'
            AND column_name IN ('number_of_batches', 'batch_assignments')
            ORDER BY column_name
        """)

        print("\nColumn Details:")
        print("-" * 60)
        for row in cursor.fetchall():
            print(f"  {row[0]:20s} | {row[1]:15s} | {row[2]}")
        print("-" * 60)

        # Count records
        cursor.execute("SELECT COUNT(*) FROM scheduled_exams")
        count = cursor.fetchone()[0]
        print(f"\n[*] Total scheduled exams: {count}")

        cursor.close()
        conn.close()

        print("\n" + "=" * 60)
        print("[SUCCESS] MIGRATION COMPLETED!")
        print("=" * 60)
        print("\nNext steps:")
        print("   1. Restart your backend server")
        print("   2. Test the Schedule Exams feature")
        print("   3. Batch system is now ready to use!")

    except Exception as e:
        print(f"\n[ERROR] Migration failed: {e}")
        print(f"\nError type: {type(e).__name__}")
        if conn:
            conn.rollback()
            conn.close()
        raise

if __name__ == "__main__":
    run_migration()
