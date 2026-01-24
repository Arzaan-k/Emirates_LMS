"""
Data migration script
Migrates existing in-memory data from server.py to PostgreSQL database
Run this ONCE after initializing the database
"""

import os
import sys
from dotenv import load_dotenv
from datetime import datetime
import uuid

# Load environment variables
load_dotenv()

from database import SessionLocal
from models import User, CourseBucket

def migrate_default_users():
    """Migrate default users to database"""
    db = SessionLocal()
    try:
        print("\n[INFO] Migrating default users...")

        # Check if users already exist
        existing_count = db.query(User).count()
        if existing_count > 0:
            print(f"   [SKIP]  Found {existing_count} existing users, skipping...")
            return

        # Default users from server.py
        default_users = [
            {
                "email": "superadmin",
                "name": "Super Admin",
                "password": "superadmin@2025",
                "role": "Super Admin",
                "category": "Super Admin",
                "privileges": [],  # Will be filled from ALL_PRIVILEGES
                "is_superadmin": True,
                "has_admin_access": True,
                "store": "HQ",
                "self_learning_completed": True
            },
            {
                "email": "user",
                "name": "Aditya User",
                "password": "user@123",
                "role": "Waffler",
                "category": "Employee",
                "privileges": [],
                "is_superadmin": False,
                "has_admin_access": False,
                "store": "Mumbai Central",
                "self_learning_completed": True
            },
            {
                "email": "store.manager",
                "name": "Store Manager",
                "password": "bw_store@2025",
                "role": "Store Manager",
                "category": "Manager",
                "privileges": [
                    "team_list", "reports", "audits", "upload_training",
                    "post_news", "create_user", "live_tracking",
                    "send_notification", "schedule_meeting"
                ],
                "is_superadmin": False,
                "has_admin_access": True,
                "store": "Delhi CP",
                "self_learning_completed": True
            }
        ]

        for user_data in default_users:
            user = User(**user_data)
            db.add(user)

        db.commit()
        print(f"   [OK] Migrated {len(default_users)} default users")

    except Exception as e:
        print(f"   [ERROR] Error migrating users: {e}")
        db.rollback()
    finally:
        db.close()


def migrate_course_buckets():
    """Migrate course buckets to database"""
    db = SessionLocal()
    try:
        print("\n[INFO] Migrating course buckets...")

        # Check if buckets already exist
        existing_count = db.query(CourseBucket).count()
        if existing_count > 0:
            print(f"   [SKIP]  Found {existing_count} existing buckets, skipping...")
            return

        # Default buckets from server.py
        default_buckets = [
            {
                "id": "1",
                "name": "Onboarding",
                "description": "Essential training for new employees",
                "color": "#3B82F6",
                "icon": "account-plus"
            },
            {
                "id": "2",
                "name": "Product Training",
                "description": "Learn about our products and recipes",
                "color": "#10B981",
                "icon": "coffee"
            },
            {
                "id": "3",
                "name": "Safety & Hygiene",
                "description": "Workplace safety and hygiene protocols",
                "color": "#EF4444",
                "icon": "shield-check"
            },
            {
                "id": "4",
                "name": "Customer Service",
                "description": "Excellence in customer interactions",
                "color": "#F59E0B",
                "icon": "account-heart"
            },
            {
                "id": "5",
                "name": "Operations",
                "description": "Store operations and procedures",
                "color": "#8B5CF6",
                "icon": "cog"
            }
        ]

        for bucket_data in default_buckets:
            bucket = CourseBucket(**bucket_data)
            db.add(bucket)

        db.commit()
        print(f"   [OK] Migrated {len(default_buckets)} course buckets")

    except Exception as e:
        print(f"   [ERROR] Error migrating buckets: {e}")
        db.rollback()
    finally:
        db.close()


def main():
    """Run all migrations"""
    print("=" * 60)
    print("DATA MIGRATION")
    print("=" * 60)

    try:
        # Migrate core data
        migrate_default_users()
        migrate_course_buckets()

        print("\n" + "=" * 60)
        print("[SUCCESS] Migration completed successfully!")
        print("=" * 60)
        return True

    except Exception as e:
        print(f"\n[ERROR] Migration failed: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
