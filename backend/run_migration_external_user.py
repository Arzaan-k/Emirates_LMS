"""
Database migration script to add is_external and joined_at_level columns to users table.
Run: python run_migration_external_user.py
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
    """Add is_external and joined_at_level columns to users table"""

    print("=" * 60)
    print("DATABASE MIGRATION: External User Columns")
    print("=" * 60)

    conn = None
    try:
        print("\n[*] Connecting to database...")
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        print("[+] Connected successfully!")

        # Check if is_external column already exists
        print("\n[*] Checking if is_external column exists...")
        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.columns 
                WHERE table_name = 'users' AND column_name = 'is_external'
            )
        """)
        col_exists = cursor.fetchone()[0]

        if col_exists:
            print("[+] Column 'is_external' already exists!")
        else:
            print("[*] Adding 'is_external' column...")
            cursor.execute("""
                ALTER TABLE users 
                ADD COLUMN is_external BOOLEAN DEFAULT FALSE
            """)
            print("[+] Column 'is_external' added successfully!")

        # Check if joined_at_level column already exists
        print("\n[*] Checking if joined_at_level column exists...")
        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.columns 
                WHERE table_name = 'users' AND column_name = 'joined_at_level'
            )
        """)
        col_exists = cursor.fetchone()[0]

        if col_exists:
            print("[+] Column 'joined_at_level' already exists!")
        else:
            print("[*] Adding 'joined_at_level' column...")
            cursor.execute("""
                ALTER TABLE users 
                ADD COLUMN joined_at_level VARCHAR(100) DEFAULT NULL
            """)
            print("[+] Column 'joined_at_level' added successfully!")

        # Add index for is_external for efficient filtering
        print("\n[*] Adding index for is_external...")
        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM pg_indexes 
                WHERE tablename = 'users' AND indexname = 'idx_user_is_external'
            )
        """)
        idx_exists = cursor.fetchone()[0]

        if idx_exists:
            print("[+] Index 'idx_user_is_external' already exists!")
        else:
            cursor.execute("""
                CREATE INDEX idx_user_is_external ON users (is_external)
            """)
            print("[+] Index 'idx_user_is_external' created!")

        conn.commit()
        print("\n" + "=" * 60)
        print("MIGRATION COMPLETED SUCCESSFULLY!")
        print("=" * 60)

    except Exception as e:
        print(f"\n[!] Migration failed: {e}")
        if conn:
            conn.rollback()
        raise
    finally:
        if conn:
            conn.close()
            print("\n[*] Database connection closed.")


if __name__ == "__main__":
    run_migration()
