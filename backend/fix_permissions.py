
import sys
import os
import logging

# Ensure current directory (backend/) is in path
sys.path.append(os.getcwd())

from app.config.database import SessionLocal
from app.models.user import User
from sqlalchemy import select

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def fix_permissions():
    logger.info("Starting permission repair (Sync Mode)...")
    
    db = SessionLocal()
    try:
        # Find any user who has "Super Admin" role OR category "Super Admin"
        query = select(User).where(
            (User.role == "Super Admin") | (User.category == "Super Admin")
        )
        result = db.execute(query)
        users = result.scalars().all()
        
        fixed_count = 0
        for user in users:
            needs_fix = False
            
            # Check for inconsistencies
            if not user.is_superadmin:
                user.is_superadmin = True
                needs_fix = True
            if not user.has_admin_access:
                user.has_admin_access = True
                needs_fix = True
            
            # Also ensure role is normalized
            if user.role != "Super Admin":
                user.role = "Super Admin"
                needs_fix = True
                
            if needs_fix:
                logger.info(f"Fixing privileges for: {user.email} (Role: {user.role})")
                fixed_count += 1
        
        if fixed_count > 0:
            db.commit()
            logger.info(f"SUCCESS: Fixed permissions for {fixed_count} Super Admins.")
        else:
            logger.info("All Super Admins appear to have correct permissions.")
            
    except Exception as e:
        logger.error(f"Error during repair: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    fix_permissions()
