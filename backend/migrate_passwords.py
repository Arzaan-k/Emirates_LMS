"""
Password Migration Script
Migrates plaintext passwords to bcrypt hashed passwords

Run this ONCE after deploying the auth.py changes:
    python migrate_passwords.py

This script:
1. Connects to the database
2. Finds all users with unhashed passwords
3. Hashes their passwords using bcrypt
4. Updates the database

IMPORTANT: Back up your database before running this script!
"""

import os
import sys
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

from database import SessionLocal
from models import User
from auth import hash_password, is_password_hashed
import logging

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("PasswordMigration")


def migrate_passwords():
    """
    Migrate all plaintext passwords to bcrypt hashes.
    """
    db = SessionLocal()

    try:
        # Get all users
        users = db.query(User).all()
        total = len(users)
        migrated = 0
        skipped = 0

        logger.info(f"Found {total} users to check")

        for user in users:
            if not user.password:
                logger.warning(f"User {user.email} has no password, skipping")
                skipped += 1
                continue

            # Check if already hashed
            if is_password_hashed(user.password):
                logger.debug(f"User {user.email} already has hashed password")
                skipped += 1
                continue

            # Hash the password
            old_password = user.password
            user.password = hash_password(old_password)
            migrated += 1

            logger.info(f"Migrated password for user: {user.email}")

        # Commit all changes
        db.commit()

        logger.info("=" * 50)
        logger.info("Migration Complete!")
        logger.info(f"Total users: {total}")
        logger.info(f"Migrated: {migrated}")
        logger.info(f"Skipped (already hashed): {skipped}")
        logger.info("=" * 50)

    except Exception as e:
        db.rollback()
        logger.error(f"Migration failed: {e}")
        raise

    finally:
        db.close()


def verify_migration():
    """
    Verify that all passwords are now hashed.
    """
    db = SessionLocal()

    try:
        users = db.query(User).all()
        unhashed = []

        for user in users:
            if user.password and not is_password_hashed(user.password):
                unhashed.append(user.email)

        if unhashed:
            logger.warning(f"Found {len(unhashed)} users with unhashed passwords:")
            for email in unhashed:
                logger.warning(f"  - {email}")
            return False
        else:
            logger.info("All passwords are properly hashed!")
            return True

    finally:
        db.close()


if __name__ == "__main__":
    print("=" * 60)
    print("PASSWORD MIGRATION SCRIPT")
    print("=" * 60)
    print()
    print("This script will hash all plaintext passwords in the database.")
    print("IMPORTANT: Back up your database before proceeding!")
    print()

    if "--verify" in sys.argv:
        print("Running verification only...")
        verify_migration()
    elif "--force" in sys.argv:
        print("Running migration...")
        migrate_passwords()
        print()
        print("Running verification...")
        verify_migration()
    else:
        response = input("Do you want to proceed? (yes/no): ")
        if response.lower() == "yes":
            migrate_passwords()
            print()
            print("Running verification...")
            verify_migration()
        else:
            print("Migration cancelled.")
