"""
Direct DB test of the new get_all_locations logic (bypasses the running server).
"""
from app.config.database import SessionLocal
from app.models.user import User
from app.models.tracking import LocationTracking
from sqlalchemy import func
from datetime import datetime

db = SessionLocal()

STALE_MINUTES = 30
now = datetime.utcnow()

latest_ts_sq = (
    db.query(
        LocationTracking.user_email,
        func.max(LocationTracking.timestamp).label("max_ts")
    )
    .group_by(LocationTracking.user_email)
    .subquery()
)

rows = (
    db.query(LocationTracking, User.name, User.role)
    .outerjoin(User, LocationTracking.user_email == User.email)
    .join(
        latest_ts_sq,
        (LocationTracking.user_email == latest_ts_sq.c.user_email) &
        (LocationTracking.timestamp == latest_ts_sq.c.max_ts)
    )
    .order_by(LocationTracking.timestamp.desc())
    .all()
)

print(f"Total rows: {len(rows)}")
print(f"Current UTC time: {now.strftime('%H:%M')}\n")

for loc, user_name, user_role in rows:
    last_seen_minutes = None
    is_truly_active = False

    if loc.timestamp:
        age_seconds = (now - loc.timestamp).total_seconds()
        last_seen_minutes = int(age_seconds / 60)
        is_truly_active = bool(loc.active) and (age_seconds <= STALE_MINUTES * 60)

    status = "🟢 TRACKING" if is_truly_active else "🔴 NOT TRACKING"
    time_label = f"{last_seen_minutes}m ago" if last_seen_minutes is not None else "never"
    print(f"{status} | {loc.user_email} | name={user_name} | db.active={loc.active} | last_seen={time_label}")
