
import asyncio
import os
import sys

# Add backend directory to sys.path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from backend.app.db.session import async_session
from backend.app.models.user import User
from sqlalchemy import select, update

async def fix_admin_user():
    email = "arzaanalikhan12@gmail.com"
    print(f"Checking user: {email}")
    
    async with async_session() as session:
        # Find the user
        result = await session.execute(select(User).where(User.email == email))
        user = result.scalars().first()
        
        if not user:
            print(f"User {email} not found!")
            return

        print(f"User found: {user.name} | Role: {user.role} | SuperAdmin: {user.is_superadmin} | AdminAccess: {user.has_admin_access}")
        
        # Update flags
        user.is_superadmin = True
        user.has_admin_access = True
        user.role = "Super Admin" # Ensure exact string match
        
        await session.commit()
        print(f"SUCCESS: Updated {email} to Super Admin with full privileges.")
        
        # Verify
        await session.refresh(user)
        print(f"VERIFICATION: SuperAdmin={user.is_superadmin}, AdminAccess={user.has_admin_access}")

if __name__ == "__main__":
    asyncio.run(fix_admin_user())
