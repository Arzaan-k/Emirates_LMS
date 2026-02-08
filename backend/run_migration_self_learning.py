"""
Migration: Self-Learning Enhancement
Adds new columns to content and course_buckets tables,
creates course_feedback table.
Also adds notification targeting columns.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text, inspect
from app.config.database import engine

def run_migration():
    """Run the self-learning enhancement migration."""
    
    with engine.connect() as conn:
        inspector = inspect(engine)
        
        # ============================================
        # 1. Content table - new columns
        # ============================================
        content_cols = [c['name'] for c in inspector.get_columns('content')]
        
        new_content_cols = {
            'allow_fast_forward': "ALTER TABLE content ADD COLUMN allow_fast_forward BOOLEAN DEFAULT TRUE",
            'enable_feedback': "ALTER TABLE content ADD COLUMN enable_feedback BOOLEAN DEFAULT FALSE",
            'enable_certificate': "ALTER TABLE content ADD COLUMN enable_certificate BOOLEAN DEFAULT FALSE",
            'scheduled_at': "ALTER TABLE content ADD COLUMN scheduled_at TIMESTAMP",
            'is_published': "ALTER TABLE content ADD COLUMN is_published BOOLEAN DEFAULT TRUE",
        }
        
        for col_name, sql in new_content_cols.items():
            if col_name not in content_cols:
                conn.execute(text(sql))
                print(f"  ✓ Added content.{col_name}")
            else:
                print(f"  - content.{col_name} already exists")
        
        # ============================================
        # 2. Course Buckets table - new columns
        # ============================================
        bucket_cols = [c['name'] for c in inspector.get_columns('course_buckets')]
        
        new_bucket_cols = {
            'thumbnail': "ALTER TABLE course_buckets ADD COLUMN thumbnail VARCHAR(1000)",
            'is_linear': "ALTER TABLE course_buckets ADD COLUMN is_linear BOOLEAN DEFAULT FALSE",
            'assigned_users': "ALTER TABLE course_buckets ADD COLUMN assigned_users JSON DEFAULT '[]'",
        }
        
        for col_name, sql in new_bucket_cols.items():
            if col_name not in bucket_cols:
                conn.execute(text(sql))
                print(f"  ✓ Added course_buckets.{col_name}")
            else:
                print(f"  - course_buckets.{col_name} already exists")
        
        # ============================================
        # 3. Notifications table - new columns
        # ============================================
        if 'notifications' in inspector.get_table_names():
            notif_cols = [c['name'] for c in inspector.get_columns('notifications')]
            
            new_notif_cols = {
                'target_categories': "ALTER TABLE notifications ADD COLUMN target_categories JSON DEFAULT '[]'",
                'source_bucket_id': "ALTER TABLE notifications ADD COLUMN source_bucket_id VARCHAR(255)",
                'source_course_id': "ALTER TABLE notifications ADD COLUMN source_course_id VARCHAR(255)",
            }
            
            for col_name, sql in new_notif_cols.items():
                if col_name not in notif_cols:
                    conn.execute(text(sql))
                    print(f"  ✓ Added notifications.{col_name}")
                else:
                    print(f"  - notifications.{col_name} already exists")
        
        # ============================================
        # 4. Create course_feedback table
        # ============================================
        if 'course_feedback' not in inspector.get_table_names():
            conn.execute(text("""
                CREATE TABLE course_feedback (
                    id VARCHAR(255) PRIMARY KEY,
                    user_email VARCHAR(255) NOT NULL,
                    course_id VARCHAR(255) NOT NULL,
                    course_title VARCHAR(500),
                    bucket VARCHAR(255),
                    rating INTEGER NOT NULL,
                    comment TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """))
            conn.execute(text("CREATE INDEX idx_feedback_user ON course_feedback(user_email)"))
            conn.execute(text("CREATE INDEX idx_feedback_course ON course_feedback(course_id)"))
            conn.execute(text("CREATE INDEX idx_feedback_rating ON course_feedback(rating)"))
            conn.execute(text("CREATE INDEX idx_feedback_created ON course_feedback(created_at)"))
            print("  ✓ Created course_feedback table with indexes")
        else:
            print("  - course_feedback table already exists")
        
        conn.commit()
        print("\n✅ Self-learning enhancement migration complete!")


if __name__ == "__main__":
    print("=" * 50)
    print("Running Self-Learning Enhancement Migration")
    print("=" * 50)
    run_migration()
