"""
Database Schema Migration Script
Adds missing columns to make new modular backend compatible with existing database.
"""

import sys
sys.path.insert(0, '.')

from app.config.database import engine
from sqlalchemy import text

def migrate():
    print("Running database schema migration...")
    
    conn = engine.connect()
    
    # Migrations for news_feed table
    migrations = [
        # news_feed table
        "ALTER TABLE news_feed ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP",
        "ALTER TABLE news_feed ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false",
        "ALTER TABLE news_feed ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT true",
        "ALTER TABLE news_feed ADD COLUMN IF NOT EXISTS likes TEXT",
        "ALTER TABLE news_feed ADD COLUMN IF NOT EXISTS comments TEXT",
        
        # live_quizzes table - check if it exists
        # The old backend may have used different table names
    ]
    
    for migration in migrations:
        try:
            conn.execute(text(migration))
            print(f"  ✓ {migration[:50]}...")
        except Exception as e:
            print(f"  ⚠ {migration[:50]}... - {str(e)[:50]}")
    
    conn.commit()
    conn.close()
    
    print("\nMigration complete!")

if __name__ == "__main__":
    migrate()
