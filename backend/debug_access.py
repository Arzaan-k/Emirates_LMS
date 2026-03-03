from app.config.database import SessionLocal
from app.services.access_control_service import AccessControlService
from app.models.user import User
from app.core.access_filter import get_access_filter_context

db = SessionLocal()
users = db.query(User).filter(User.email.like('%aditya%')).all()
for u in users:
    print(f"User: {u.email}, Name: {u.name}, SuperAdmin: {u.is_superadmin}, Role: {u.role}")
    ctx = get_access_filter_context(db, u.to_dict())
    print("Is SuperAdmin:", ctx['is_superadmin'])
    if ctx['accessible_emails'] is not None:
        print("Accessible count:", len(ctx['accessible_emails']))
        if len(ctx['accessible_emails']) < 10:
            print("Accessible:", ctx['accessible_emails'])
    else:
        print("Accessible emails is None (Superadmin)")
    print("-" * 40)
