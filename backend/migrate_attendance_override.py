"""
Migration script to add check-in and override fields to exam_attendance table
"""

import sys
import codecs
import psycopg2

# Set UTF-8 encoding for Windows console
if sys.platform == 'win32':
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

from app.config.settings import settings


def migrate():
    """Add check-in and override tracking fields to exam_attendance table"""
    conn = psycopg2.connect(settings.DATABASE_URL)
    cur = conn.cursor()

    try:
        print("🔄 Starting attendance override fields migration...")

        # Add new columns to exam_attendance table
        cur.execute("""
            ALTER TABLE exam_attendance
            ADD COLUMN IF NOT EXISTS check_in_time TIMESTAMP,
            ADD COLUMN IF NOT EXISTS check_in_method VARCHAR(50),
            ADD COLUMN IF NOT EXISTS override_reason TEXT;
        """)

        conn.commit()
        print("✅ Migration completed successfully!")
        print("   Added columns:")
        print("   - check_in_time (TIMESTAMP)")
        print("   - check_in_method (VARCHAR(50))")
        print("   - override_reason (TEXT)")

    except Exception as e:
        print(f"❌ Migration failed: {e}")
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    migrate()
