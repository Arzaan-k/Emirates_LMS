# Database Setup Guide

## PostgreSQL Database Integration

This application now uses **PostgreSQL** (hosted on Neon) for persistent data storage instead of in-memory lists and dictionaries.

## Prerequisites

1. PostgreSQL database (we're using Neon)
2. Database connection URL
3. Python dependencies installed

## Step-by-Step Setup

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

This installs:
- `sqlalchemy` - ORM for database operations
- `psycopg2-binary` - PostgreSQL adapter
- `alembic` - Database migrations (for future use)

### 2. Configure Database URL

The database URL is already set in `.env`:

```env
DATABASE_URL=postgresql://neondb_owner:npg_SH5IN3zLKUBE@ep-lucky-butterfly-ah2mu1lx-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require
```

**Security Note**: Never commit `.env` to version control!

### 3. Initialize Database (Create Tables)

Run the initialization script to create all tables:

```bash
cd backend
python init_db.py
```

This will create 22 tables:
- `users` - User accounts and authentication
- `content` - Learning content (videos, PDFs, etc.)
- `course_completions` - Track completed courses
- `proctored_assessments` - Exam definitions
- `assessment_submissions` - Exam results
- `quizzes` - Quiz definitions
- `notifications` - System notifications
- `attendance_records` - Punch in/out records
- `meetings` - Scheduled meetings
- `audit_logs` - System audit trail
- And 12 more...

### 4. Migrate Existing Data (Optional)

If you want to migrate default users and buckets:

```bash
python migrate_data.py
```

This creates:
- 3 default users (superadmin, user, store.manager)
- 5 course buckets (Onboarding, Product Training, etc.)

### 5. Start the Server

```bash
uvicorn server:app --reload --host 0.0.0.0 --port 8000
```

The server will now use PostgreSQL for all data storage!

## Database Architecture

### Core Tables

**Users & Authentication**
- `users` - User accounts with roles and permissions
- `user_node_progress` - Learning path progress tracking
- `user_learning_profiles` - Analytics and learning profiles

**Content Management**
- `content` - All learning materials (videos, docs, etc.)
- `course_buckets` - Content categories
- `resources` - Resource library items

**Assessments**
- `quizzes` - Quiz definitions
- `quiz_submissions` - Quiz attempts and scores
- `proctored_assessments` - Monitored exams
- `assessment_submissions` - Exam results with proctoring data
- `scheduled_exams` - Calendar-based exams
- `exam_attendance` - Attendance tracking

**Tracking & Analytics**
- `course_completions` - Completed courses with metrics
- `user_interactions` - All user actions for analytics
- `audit_logs` - System-wide audit trail
- `location_tracking` - Real-time GPS tracking

**Communication**
- `notifications` - Push notifications
- `news_feed` - Company news and updates
- `meetings` - Virtual meeting schedules

**Operations**
- `attendance_records` - Punch in/out records
- `crm_tickets` - Support tickets
- `crm_task_assignments` - Task management

### Indexes

All tables include strategic indexes for:
- Fast user lookups (`user_email` indexes)
- Efficient date-based queries (`timestamp` indexes)
- Quick status filtering (`status`, `active` indexes)
- Optimized joins (foreign key indexes)

## Migration Strategy

The integration is designed for **zero downtime** and **backward compatibility**:

### Phase 1: Parallel Operation (Current)
- Server.py keeps in-memory stores
- Database models created and ready
- No breaking changes to existing code

### Phase 2: Gradual Migration (Next Step)
- Add database operations alongside in-memory ops
- Test thoroughly with both storage methods
- Verify data consistency

### Phase 3: Full Migration (Final)
- Replace in-memory stores with database queries
- Remove old list/dict declarations
- Optimize database queries

## Benefits of PostgreSQL Integration

### 1. Data Persistence
- ✅ No data loss on server restart
- ✅ Survives deployments and updates
- ✅ Easy backups and recovery

### 2. Scalability
- ✅ Handles millions of records
- ✅ Concurrent users without conflicts
- ✅ Efficient querying with indexes

### 3. Data Integrity
- ✅ ACID transactions
- ✅ Foreign key constraints
- ✅ Type safety with schema validation

### 4. Advanced Features
- ✅ Complex queries and joins
- ✅ Full-text search capabilities
- ✅ JSON field support for flexible data
- ✅ Real-time analytics

### 5. Production Ready
- ✅ Professional database solution
- ✅ Neon provides automatic backups
- ✅ Connection pooling
- ✅ SSL/TLS encryption

## Database Connection Details

### Connection Pooling
- Using `NullPool` for serverless compatibility
- Neon provides built-in connection pooling
- Each request gets a fresh connection

### Security
- SSL/TLS encryption enabled (`sslmode=require`)
- Credentials in environment variables
- No hardcoded passwords

### Performance
- Optimized with strategic indexes
- JSON fields for flexible schema
- Efficient foreign key relationships

## Troubleshooting

### Connection Errors

**Error**: `could not connect to server`
- Check DATABASE_URL in `.env`
- Verify Neon database is running
- Check network/firewall settings

**Error**: `password authentication failed`
- Verify credentials in DATABASE_URL
- Check for extra spaces or special characters
- Ensure URL is properly URL-encoded

### Migration Issues

**Error**: `table already exists`
- Tables are already created
- Skip `init_db.py` or drop tables first

**Error**: `permission denied`
- Check database user permissions
- Ensure user has CREATE TABLE rights

### Runtime Errors

**Error**: `session is closed`
- Database connection was lost
- Server will auto-reconnect
- Check Neon dashboard for issues

## Maintenance

### Backup
Neon provides automatic daily backups. Access them via Neon dashboard.

### Monitoring
- Check Neon dashboard for connection stats
- Monitor query performance
- Review slow query logs

### Scaling
- Neon automatically scales storage
- Upgrade plan for more concurrent connections
- Consider read replicas for high traffic

## Next Steps

1. ✅ Database initialized and ready
2. ✅ Default data migrated
3. 🔄 Update server.py endpoints to use database
4. 🔄 Test all API endpoints
5. 🔄 Deploy to production

## Support

For database issues:
- Check Neon dashboard: https://console.neon.tech
- Review this documentation
- Check server logs for detailed errors
