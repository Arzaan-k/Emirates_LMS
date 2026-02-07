"""
Migration: Add Geofencing and PIN Check-in Fields
Adds columns for geofencing and PIN-based auto check-in features
"""

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
    """Add geofencing and PIN columns to scheduled_exams table"""

    print("\n" + "="*70)
    print(" "*15 + "GEOFENCING & PIN MIGRATION")
    print("="*70 + "\n")

    try:
        # Connect to database
        conn = psycopg2.connect(settings.DATABASE_URL)
        cur = conn.cursor()

        print("[*] Connected to database")

        # Add columns
        print("\n[*] Adding geofencing and PIN columns...")

        cur.execute("""
            ALTER TABLE scheduled_exams
            ADD COLUMN IF NOT EXISTS geofencing_enabled BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS geofencing_radius INTEGER DEFAULT 100,
            ADD COLUMN IF NOT EXISTS geofencing_latitude DECIMAL(10, 8),
            ADD COLUMN IF NOT EXISTS geofencing_longitude DECIMAL(11, 8),

            ADD COLUMN IF NOT EXISTS pin_enabled BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS pin_generation_minutes INTEGER DEFAULT 5,
            ADD COLUMN IF NOT EXISTS pin_validity_minutes INTEGER DEFAULT 30,
            ADD COLUMN IF NOT EXISTS generated_pin VARCHAR(4),
            ADD COLUMN IF NOT EXISTS pin_generated_at TIMESTAMP;
        """)

        conn.commit()
        print("✅ Successfully added geofencing columns:")
        print("   - geofencing_enabled (BOOLEAN)")
        print("   - geofencing_radius (INTEGER)")
        print("   - geofencing_latitude (DECIMAL)")
        print("   - geofencing_longitude (DECIMAL)")

        print("\n✅ Successfully added PIN columns:")
        print("   - pin_enabled (BOOLEAN)")
        print("   - pin_generation_minutes (INTEGER)")
        print("   - pin_validity_minutes (INTEGER)")
        print("   - generated_pin (VARCHAR)")
        print("   - pin_generated_at (TIMESTAMP)")

        # Verify columns exist
        print("\n[*] Verifying columns...")
        cur.execute("""
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = 'scheduled_exams'
            AND column_name IN (
                'geofencing_enabled', 'geofencing_radius', 'geofencing_latitude', 'geofencing_longitude',
                'pin_enabled', 'pin_generation_minutes', 'pin_validity_minutes', 'generated_pin', 'pin_generated_at'
            )
            ORDER BY column_name;
        """)

        columns = cur.fetchall()

        if len(columns) == 9:
            print("\n✅ All 9 columns verified in database:")
            for col in columns:
                print(f"   - {col[0]} ({col[1]})")
        else:
            print(f"\n⚠️  Warning: Expected 9 columns, found {len(columns)}")

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
