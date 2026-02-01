# Database Quick Start Guide

## Running the Application

### Start the Server
```bash
cd backend
python -m uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

The server will:
1. Connect to Neon PostgreSQL database
2. Load all in-memory stores (backward compatibility)
3. Start accepting requests on port 8000

---

## Common Database Operations

### Check Database Connection
```python
from database import SessionLocal

db = SessionLocal()
try:
    # Test query
    from models import User
    users = db.query(User).all()
    print(f"Found {len(users)} users in database")
finally:
    db.close()
```

### Add a User Manually
```python
from database import SessionLocal
import db_operations as db_ops

db = SessionLocal()
try:
    user_data = {
        "email": "newuser@example.com",
        "name": "New User",
        "password": "password123",
        "role": "Waffler",
        "category": "Employee",
        "privileges": [],
        "is_superadmin": False,
        "has_admin_access": False,
        "store": "Mumbai Central",
        "self_learning_completed": False
    }
    user = db_ops.create_user(db, user_data)
    print(f"Created user: {user.email}")
finally:
    db.close()
```

### Query Content
```python
from database import SessionLocal
import db_operations as db_ops

db = SessionLocal()
try:
    # Get all content
    content = db_ops.get_all_content(db)
    print(f"Total content items: {len(content)}")

    # Get content by bucket
    onboarding = db_ops.get_all_content(db, bucket="Onboarding")
    print(f"Onboarding content: {len(onboarding)}")
finally:
    db.close()
```

### Check User Completions
```python
from database import SessionLocal
import db_operations as db_ops

db = SessionLocal()
try:
    completions = db_ops.get_user_completions(db, "user")
    print(f"User has completed {len(completions)} courses")

    for completion in completions:
        print(f"- {completion.course_title}: {completion.score_percent}%")
finally:
    db.close()
```

---

## Database Scripts

### Initialize Database Tables
```bash
cd backend
python init_db.py
```

Creates all 22 tables in the database.

### Migrate Default Data
```bash
cd backend
python migrate_data.py
```

Migrates:
- 3 default users (superadmin, user, store.manager)
- 5 course buckets

### Sync Existing Data
```bash
cd backend
python sync_to_db.py
```

Syncs all in-memory data to database:
- Users
- Content
- Course completions
- Notifications
- Assessments

---

## Viewing Database Data

### Option 1: Neon Console
1. Go to https://console.neon.tech
2. Select your database
3. Use SQL Editor to run queries:

```sql
-- View all users
SELECT email, name, role, store FROM users;

-- View content by bucket
SELECT title, bucket, resource_type FROM content WHERE bucket = 'Onboarding';

-- View recent completions
SELECT user_email, course_title, score_percent, completed_at
FROM course_completions
ORDER BY completed_at DESC
LIMIT 10;

-- View quiz submissions
SELECT user_name, quiz_title, score_percent, submitted_at
FROM quiz_submissions
ORDER BY submitted_at DESC;

-- View audit logs
SELECT action, user_name, details, timestamp
FROM audit_logs
ORDER BY timestamp DESC
LIMIT 20;
```

### Option 2: Python Script
```python
from database import SessionLocal
from models import *

db = SessionLocal()
try:
    print("\n=== USERS ===")
    users = db.query(User).all()
    for u in users:
        print(f"{u.email} - {u.name} ({u.role})")

    print("\n=== CONTENT ===")
    content = db.query(Content).all()
    for c in content:
        print(f"{c.title} - {c.bucket}")

    print("\n=== COMPLETIONS ===")
    completions = db.query(CourseCompletion).all()
    for comp in completions:
        print(f"{comp.user_email}: {comp.course_title} - {comp.score_percent}%")

    print("\n=== AUDIT LOGS ===")
    logs = db.query(AuditLog).order_by(AuditLog.timestamp.desc()).limit(10).all()
    for log in logs:
        print(f"{log.timestamp}: {log.action} by {log.user_name}")
finally:
    db.close()
```

### Option 3: psql (PostgreSQL CLI)
```bash
# Get connection string from .env
export DATABASE_URL="postgresql://neondb_owner:npg_SH5IN3zLKUBE@ep-lucky-butterfly-ah2mu1lx-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require"

# Connect
psql $DATABASE_URL

# Run queries
SELECT * FROM users;
SELECT * FROM content;
\dt  # List all tables
\d users  # Describe users table
\q  # Quit
```

---

## Helper Functions Reference

### User Operations
```python
# Get user
user = db_ops.get_user_by_email(db, "user@example.com")

# Create user
user = db_ops.create_user(db, user_data)

# Update user
user = db_ops.update_user(db, "user@example.com", {"store": "Delhi CP"})

# Get all users
users = db_ops.get_all_users(db)
```

### Content Operations
```python
# Create content
content = db_ops.create_content(db, content_data)

# Get content
content = db_ops.get_content_by_id(db, "content-id")

# Get all content (with filters)
all_content = db_ops.get_all_content(db)
onboarding = db_ops.get_all_content(db, bucket="Onboarding")
path_nodes = db_ops.get_all_content(db, is_path_node=True)

# Update content
content = db_ops.update_content(db, "content-id", {"title": "New Title"})

# Delete content
success = db_ops.delete_content(db, "content-id")
```

### Course Completion Operations
```python
# Record completion
completion = db_ops.create_course_completion(db, completion_data)

# Get user's completions
completions = db_ops.get_user_completions(db, "user@example.com")

# Check specific completion
completion = db_ops.get_completion_by_course(db, "user@example.com", "course-id")
```

### Quiz Operations
```python
# Create quiz
quiz = db_ops.create_quiz(db, quiz_data)

# Get quiz
quiz = db_ops.get_quiz_by_id(db, "quiz-id")

# Get all quizzes
quizzes = db_ops.get_all_quizzes(db)

# Submit quiz
submission = db_ops.create_quiz_submission(db, submission_data)
```

### Assessment Operations
```python
# Create assessment
assessment = db_ops.create_assessment(db, assessment_data)

# Get assessment
assessment = db_ops.get_assessment_by_id(db, "assessment-id")

# Get all assessments
assessments = db_ops.get_all_assessments(db, active_only=True)

# Submit assessment
submission = db_ops.create_assessment_submission(db, submission_data)

# Get submissions
submissions = db_ops.get_assessment_submissions(db, "assessment-id")
```

### Notification Operations
```python
# Create notification
notif = db_ops.create_notification(db, notification_data)

# Get all notifications
notifs = db_ops.get_all_notifications(db, limit=50)

# Mark as read
success = db_ops.mark_notification_read(db, "notif-id", "user@example.com")
```

### Audit Log Operations
```python
# Create audit log (or use log_action() helper in server.py)
log = db_ops.create_audit_log(db, {
    "user_email": "admin@example.com",
    "user_name": "Admin",
    "action": "CREATE_USER",
    "details": "Created new employee account",
    "target": "newuser@example.com"
})

# Get audit logs
logs = db_ops.get_audit_logs(db, limit=100)
logs_by_user = db_ops.get_audit_logs(db, user_email="admin@example.com")
logs_by_action = db_ops.get_audit_logs(db, action="CREATE_USER")
```

---

## Troubleshooting

### "No module named 'database'"
```bash
# Make sure you're in the backend directory
cd backend
python init_db.py
```

### "Connection refused" or "Connection timeout"
```bash
# Check DATABASE_URL in .env file
cat .env | grep DATABASE_URL

# Test connection
python -c "from database import engine; print(engine.connect())"
```

### "Table already exists"
This is normal if tables were already created. You can:
```bash
# Option 1: Just use the existing tables
python migrate_data.py  # Will skip existing data

# Option 2: Drop and recreate (CAUTION: deletes all data)
python -c "from database import Base, engine; Base.metadata.drop_all(engine)"
python init_db.py
python migrate_data.py
```

### "OperationalError: too many clients"
The database has reached max connections:
```python
# Close unused connections
from database import engine
engine.dispose()

# Or restart the server
```

### Server won't start after migration
```bash
# Check for syntax errors
python -m py_compile server.py

# View error logs
python -m uvicorn server:app --host 0.0.0.0 --port 8000 2>&1 | tee error.log

# Rollback if needed
cp server_backup.py server.py
```

---

## Performance Tips

### 1. Use Connection Pooling (Already Configured)
SQLAlchemy automatically manages connection pools.

### 2. Batch Operations
Instead of:
```python
for user_data in users:
    db_ops.create_user(db, user_data)
```

Do:
```python
from models import User
db.bulk_insert_mappings(User, users)
db.commit()
```

### 3. Use Indexes
Already configured on:
- `users.email` (unique index)
- `content.id` (primary key)
- Foreign keys automatically indexed

### 4. Limit Large Queries
```python
# Instead of loading all
all_completions = db.query(CourseCompletion).all()

# Limit and paginate
recent = db.query(CourseCompletion).order_by(
    CourseCompletion.completed_at.desc()
).limit(100).all()
```

---

## Backup and Recovery

### Manual Backup (Neon Console)
1. Go to Neon Console
2. Select your database
3. Click "Backups"
4. Create point-in-time backup

### Restore from Backup
1. Go to Neon Console
2. Select backup
3. Click "Restore"
4. Choose restore point

### Export Data (SQL Dump)
```bash
pg_dump $DATABASE_URL > backup.sql
```

### Import Data
```bash
psql $DATABASE_URL < backup.sql
```

---

## Environment Setup Checklist

- [x] Python 3.11+ installed
- [x] Dependencies installed (`pip install -r requirements.txt`)
- [x] `.env` file configured with DATABASE_URL
- [x] Database tables created (`python init_db.py`)
- [x] Default data migrated (`python migrate_data.py`)
- [x] Neon database accessible (test connection)
- [x] Server starts without errors

---

## Next Steps After Migration

1. **Test Each Feature**:
   - Login/signup
   - Upload content
   - Create quiz
   - Take assessment
   - Send notification

2. **Monitor Performance**:
   - Check query times in logs
   - Monitor database connections
   - Watch for errors

3. **Plan Optimization**:
   - Add caching for frequently accessed data
   - Optimize slow queries
   - Consider read replicas for scaling

4. **Clean Up**:
   - After verification, remove in-memory stores
   - Remove backup file (`server_backup.py`)
   - Update documentation

---

*For detailed migration information, see [DATABASE_MIGRATION_COMPLETE.md](./DATABASE_MIGRATION_COMPLETE.md)*
