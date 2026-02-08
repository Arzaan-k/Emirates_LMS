
import sys
import codecs
import psycopg2
from psycopg2 import sql

# Set UTF-8 encoding for Windows console
if sys.platform == 'win32':
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

# Add parent directory to path for imports
sys.path.insert(0, '..')

from app.config.settings import settings

def migrate():
    """Add active_pins JSON column to scheduled_exams table"""

    print("\n" + "="*70)
    print(" "*15 + "ACTIVE PINS MIGRATION")
    print("="*70 + "\n")

    try:
        # Connect to database
        conn = psycopg2.connect(settings.DATABASE_URL)
        cur = conn.cursor()

        print("[*] Connected to database")

        # Add column
        print("\n[*] Adding active_pins column...")

        cur.execute("""
            ALTER TABLE scheduled_exams
            ADD COLUMN IF NOT EXISTS active_pins JSONB DEFAULT '[]'::jsonb;
        """)

        conn.commit()
        print("✅ Successfully added column:")
        print("   - active_pins (JSONB)")

        cur.close()
        conn.close()

        print("\n" + "="*70)
        print("✅ MIGRATION COMPLETED SUCCESSFULLY")
        print("="*70 + "\n")

        return True

    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        if conn:
            conn.rollback()
            conn.close()
        return False

if __name__ == "__main__":
    success = migrate()
    sys.exit(0 if success else 1)
