"""
Database Schema Migration Script
Adds missing columns to make new modular backend compatible with existing database.
"""

import os
import sys

# Ensure backend directory is in python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv()

try:
    from app.config.database import engine
    from sqlalchemy import text
except Exception as e:
    print(f"Error importing app modules: {e}")
    print("Ensure you are running this from the project root or backend directory.")
    sys.exit(1)

def migrate():
    print("Running database schema migration...")
    
    try:
        conn = engine.connect()
    except Exception as e:
        print(f"Failed to connect to database: {e}")
        return
    
    # Migrations for tables
    migrations = [
        # news_feed table
        "ALTER TABLE news_feed ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP",
        "ALTER TABLE news_feed ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false",
        "ALTER TABLE news_feed ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT true",
        "ALTER TABLE news_feed ADD COLUMN IF NOT EXISTS likes TEXT",
        "ALTER TABLE news_feed ADD COLUMN IF NOT EXISTS comments TEXT",

        # Users table - Add profile_data for extended employee info
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_data JSONB DEFAULT '{}'::jsonb",

        # course_buckets table - Add nested bucket support for folder hierarchy
        "ALTER TABLE course_buckets ADD COLUMN IF NOT EXISTS parent_bucket_id VARCHAR(100)",
        "ALTER TABLE course_buckets ADD COLUMN IF NOT EXISTS folder_path VARCHAR(1000)",
        "CREATE INDEX IF NOT EXISTS idx_bucket_parent ON course_buckets(parent_bucket_id)",

        # Progression Level - Exam Config
        "ALTER TABLE progression_levels ADD COLUMN IF NOT EXISTS exam_questions INTEGER DEFAULT 10",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active TIMESTAMP",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS xp_points INTEGER DEFAULT 0",
        "ALTER TABLE progression_levels ADD COLUMN IF NOT EXISTS exam_time_minutes INTEGER DEFAULT 15",
        "ALTER TABLE progression_levels ADD COLUMN IF NOT EXISTS pass_percent INTEGER DEFAULT 70",
        "ALTER TABLE progression_levels ADD COLUMN IF NOT EXISTS proctored BOOLEAN DEFAULT false",

        # Password Reset
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(100)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP",
    ]
    
    for migration in migrations:
        try:
            conn.execute(text(migration))
            print(f"  [OK] {migration.split('ADD COLUMN')[0]} ADD COLUMN...")
        except Exception as e:
            # Check if error is because column already exists or simple syntax error fallback
            if "duplicate column" in str(e).lower() or "already exists" in str(e).lower():
                print(f"  [SKIP] Column already exists (skipped)")
            elif "type \"jsonb\" does not exist" in str(e).lower():
                # Fallback for SQLite or non-Postgres
                print(f"  [WARN] JSONB not supported, trying partial fallback...")
                try:
                    fallback = migration.replace("JSONB DEFAULT '{}'::jsonb", "TEXT DEFAULT '{}'")
                    conn.execute(text(fallback))
                    print(f"  [OK] Fallback successful: {fallback}")
                except Exception as fe:
                    print(f"  [ERROR] Fallback failed: {fe}")
            else:
                print(f"  [WARN] Migration failed: {str(e)[:100]}...")
    
    try:
        conn.commit()
    except Exception as e:
         print(f"Commit failed: {e}")
         
    conn.close()
    
    print("\nMigration complete!")

if __name__ == "__main__":
    migrate()
