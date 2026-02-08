# 🔧 Database Migration Fix - Batch Columns

## Issue

The Schedule Exams feature was failing with error:
```
psycopg2.errors.UndefinedColumn: column scheduled_exams.number_of_batches does not exist
```

**Root Cause:** The SQLAlchemy model (`ScheduledExam`) was updated to include batch system columns, but the database table was never migrated to add these columns.

---

## Solution

### Columns Added:

1. **`number_of_batches`**
   - Type: `INTEGER`
   - Default: `1`
   - Purpose: Track how many batches the exam is split into

2. **`batch_assignments`**
   - Type: `JSONB`
   - Default: `[]`
   - Purpose: Store batch details (batch number, start/end time, max users, assigned users)

---

## Migration Executed

**File:** `backend/run_migration.py`

**SQL Commands:**
```sql
ALTER TABLE scheduled_exams
ADD COLUMN number_of_batches INTEGER DEFAULT 1;

ALTER TABLE scheduled_exams
ADD COLUMN batch_assignments JSONB DEFAULT '[]'::jsonb;

UPDATE scheduled_exams
SET number_of_batches = 1
WHERE number_of_batches IS NULL;

UPDATE scheduled_exams
SET batch_assignments = '[]'::jsonb
WHERE batch_assignments IS NULL;
```

---

## Migration Results

```
[+] Connected successfully!
[+] Added 'number_of_batches' column
[+] Added 'batch_assignments' column
[+] Updated 0 rows for 'number_of_batches'
[+] Updated 0 rows for 'batch_assignments'
[+] Migration committed successfully!

Column Details:
------------------------------------------------------------
batch_assignments    | jsonb           | '[]'::jsonb
number_of_batches    | integer         | 1
------------------------------------------------------------

Total scheduled exams: 2
```

---

## Verification

To verify the migration:

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'scheduled_exams'
AND column_name IN ('number_of_batches', 'batch_assignments');
```

Expected output:
```
batch_assignments    | jsonb   | '[]'::jsonb
number_of_batches    | integer | 1
```

---

## Next Steps

1. ✅ **Migration completed**
2. ✅ **Columns added to database**
3. 🔄 **Restart backend server** (if running)
4. ✅ **Test Schedule Exams feature**

---

## Files Created

1. **`run_migration.py`** - Python script to run migration
2. **`add_batch_columns.sql`** - Raw SQL migration (alternative method)
3. **`DATABASE_MIGRATION_FIX.md`** - This documentation

---

## How to Run Migration Again (if needed)

```bash
cd backend
python run_migration.py
```

The script is **idempotent** - safe to run multiple times. It checks if columns exist before adding them.

---

## Related Features

This migration enables:
- ✅ Bulk user upload for exams
- ✅ Employee code validation
- ✅ Smart user categorization
- ✅ Batch system (future feature)

---

## Database Schema

### Before:
```
scheduled_exams:
  - id
  - title
  - description
  - exam_date
  - exam_time
  - location
  - shift
  - supervisor_email
  - assigned_users (JSON)
  - questions (JSON)
  ...
```

### After:
```
scheduled_exams:
  - id
  - title
  - description
  - exam_date
  - exam_time
  - location
  - shift
  - number_of_batches (INTEGER) ← NEW
  - batch_assignments (JSONB) ← NEW
  - supervisor_email
  - assigned_users (JSON)
  - questions (JSON)
  ...
```

---

## Troubleshooting

### If migration fails:

1. **Check database connection:**
   ```python
   import psycopg2
   import os
   from dotenv import load_dotenv
   load_dotenv()
   conn = psycopg2.connect(os.getenv("DATABASE_URL"))
   print("Connected!")
   ```

2. **Check if columns already exist:**
   ```sql
   SELECT column_name FROM information_schema.columns
   WHERE table_name = 'scheduled_exams';
   ```

3. **Manual migration (psql):**
   ```bash
   psql "DATABASE_URL" -f add_batch_columns.sql
   ```

4. **Rollback (if needed):**
   ```sql
   ALTER TABLE scheduled_exams DROP COLUMN IF EXISTS number_of_batches;
   ALTER TABLE scheduled_exams DROP COLUMN IF EXISTS batch_assignments;
   ```

---

## Status

**✅ MIGRATION SUCCESSFUL**

- Database updated
- Columns added
- Default values set
- Feature ready to use

---

**Date:** 2026-02-07
**Version:** 1.0.0
**Status:** Complete
