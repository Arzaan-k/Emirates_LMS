
"""
Tracking Schema Migration Script
Adds missing columns to attendance_records table.
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
    sys.exit(1)

def migrate():
    print("Running tracking schema migration...")
    
    with engine.connect() as conn:
        migrations = [
            "ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active'",
            "ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS punch_in_notes TEXT",
            "ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS punch_out_notes TEXT",
            "ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS overtime_minutes INTEGER DEFAULT 0",
            "ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS break_duration_minutes INTEGER DEFAULT 0",
        ]
        
        for migration in migrations:
            try:
                conn.execute(text(migration))
                print(f"  [OK] {migration}")
            except Exception as e:
                print(f"  [ERROR] Failed: {e}")
        
        try:
            conn.commit()
            print("Changes committed.")
        except Exception as e:
            print(f"Commit failed: {e}")
    
    print("\nMigration complete!")

if __name__ == "__main__":
    migrate()
