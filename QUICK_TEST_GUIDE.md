# Quick Test Guide - PIN Check-in Feature

## ✅ Pre-Test Verification

### 1. Check Backend is Running
```bash
# Should show "Started server process" and no errors
# Backend running on port 8000
```

### 2. Check Frontend is Running
```bash
# Should be accessible at http://localhost:8081 or your expo URL
```

### 3. Verify Database Migration
```sql
-- Run this query to verify new columns exist:
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'exam_attendance'
  AND column_name IN ('check_in_time', 'check_in_method', 'override_reason');

-- Should return 3 rows
```

---

## 🧪 Test Scenario 1: Admin Generates PIN Manually

### Steps:
1. **Login as Admin/Supervisor**
2. **Create a Test Exam**:
   - Title: "PIN Test Exam"
   - Date: Today
   - Time: 30 minutes from now
   - Enable PIN Check-in ✓
   - Set PIN Generation: 5 minutes before
   - Set PIN Validity: 30 minutes
   - (Optional) Enable Geofencing

3. **Generate PIN Manually**:
   - Go to exam list (scheduled exams)
   - Find "PIN Test Exam"
   - Click "Edit" button
   - Click "Generate PIN Now"
   - **Expected**: Modal shows large 4-digit PIN (e.g., 5847)

4. **Verify in Database**:
```sql
SELECT id, title, generated_pin, pin_generated_at, pin_enabled
FROM scheduled_exams
WHERE title = 'PIN Test Exam';
```
**Expected**: generated_pin and pin_generated_at should have values

---

## 🧪 Test Scenario 2: Student Enters PIN (No Geofencing)

### Setup:
- Use exam from Test 1 (with geofencing DISABLED)
- Note the PIN from Admin view

### Steps:
1. **Login as Student** (assigned to the exam)
2. **View Upcoming Exams**:
   - Should see "PIN Test Exam" card
   - Button should show: "Enter PIN to Check-in" (Purple color)
   - Button should be ENABLED (not disabled)

3. **Enter PIN**:
   - Tap "Enter PIN to Check-in" button
   - Enter the correct 4-digit PIN
   - **Expected**: Success alert "Check-in Successful! You can now start the exam"
   - Tap "Start Exam"

4. **Verify Button Changes**:
   - After refresh, button should change to "Start Exam Now" (Green)
   - Button text changed from "Enter PIN" to "Start Exam"

5. **Verify in Database**:
```sql
SELECT user_email, marked_present, check_in_time, check_in_method
FROM exam_attendance
WHERE exam_id = '[your-exam-id]';
```
**Expected**:
- marked_present = TRUE
- check_in_method = 'PIN'
- check_in_time = current timestamp

---

## 🧪 Test Scenario 3: Student Enters PIN WITH Geofencing (Success)

### Setup:
- Create new exam with BOTH PIN + Geofencing enabled
- Set geofencing coordinates to your CURRENT location:
  1. In ScheduleExamModal, enable Geofencing
  2. Edit batch settings
  3. Click "Use Current Location" button
  4. Set radius: 100 meters
- Generate PIN

### Steps:
1. **Login as Student** (stay at same location)
2. **Tap "Enter PIN to Check-in"**
3. **Allow Location Permission** when prompted
4. **Enter Correct PIN**
5. **Expected**:
   - Success message
   - Marked present
   - Can start exam

6. **Check Console Logs**:
```
[PIN+Geo] Getting user location for combined validation...
[PIN+Geo] Location obtained, validating...
[PIN] Validation result: {valid: true, marked_present: true, location_valid: true}
```

---

## 🧪 Test Scenario 4: Location Check Failure

### Setup:
- Use same exam as Test 3
- Set geofencing coordinates to DIFFERENT city (e.g., New York if you're in Mumbai)

### Steps:
1. **Generate new PIN**
2. **Student enters PIN from current location**
3. **Expected Error Message**:
```
📍 Location Check Failed
You are [X]m away from the exam location.
You must be within 100m to check-in.
Contact your supervisor if you believe this is an error.
```

4. **Verify in Database**:
```sql
SELECT * FROM exam_attendance WHERE exam_id = '[exam-id]';
```
**Expected**: No attendance record created (not marked present)

5. **Check Response Data**:
```javascript
{
  valid: true,  // PIN was correct
  marked_present: false,  // But not marked due to location
  location_valid: false,
  distance_meters: [large number],
  requires_override: true,
  message: "You are [X]m away..."
}
```

---

## 🧪 Test Scenario 5: Supervisor Override

### Setup:
- Use failed location scenario from Test 4
- Have supervisor email handy

### Steps:
1. **Call Override API** (using Postman/curl):
```bash
curl -X POST "http://localhost:8000/api/v1/assessments/scheduled/[exam-id]/supervisor-override" \
  -F "user_email=student@example.com" \
  -F "supervisor_email=supervisor@example.com" \
  -F "override_reason=GPS inaccuracy, student physically verified present"
```

2. **Expected Response**:
```json
{
  "success": true,
  "marked_present": true,
  "message": "User student@example.com has been manually marked present by supervisor",
  "check_in_time": "2026-02-08T14:30:00"
}
```

3. **Verify in Database**:
```sql
SELECT user_email, marked_present, check_in_method, override_reason
FROM exam_attendance
WHERE exam_id = '[exam-id]';
```
**Expected**:
- marked_present = TRUE
- check_in_method = 'SUPERVISOR_OVERRIDE'
- override_reason = 'GPS inaccuracy, student physically verified present'

4. **Student App**:
   - Refresh exams
   - Button should now show "Start Exam Now"

---

## 🧪 Test Scenario 6: Expired PIN

### Steps:
1. **Generate PIN**
2. **Manually expire it** in database:
```sql
UPDATE scheduled_exams
SET pin_generated_at = pin_generated_at - INTERVAL '1 hour'
WHERE id = '[exam-id]';
```

3. **Student tries to enter PIN**
4. **Expected Error**:
```
Invalid PIN
PIN has expired. Please ask supervisor for a new PIN.
```

5. **Admin regenerates PIN**:
   - Open Edit modal
   - Click "Regenerate PIN"
   - New PIN displayed

6. **Student enters new PIN**: Should work

---

## 🧪 Test Scenario 7: Auto-Generation

### Setup:
1. **Create exam with**:
   - Date: Tomorrow
   - Time: 10:00 AM
   - PIN Generation: 5 minutes before (so 9:55 AM)

2. **Manually set system time** to 9:55 AM (or wait until actual time)

3. **Run auto-generation script**:
```bash
cd backend
python auto_generate_pins.py
```

4. **Expected Output**:
```
🔍 Checking for exams needing PIN generation at 2026-02-09 09:55:00
📋 Found 1 PIN-enabled exams
✅ Generated PIN 1234 for exam 'Tomorrow Test Exam' (id)
   Exam time: 2026-02-09 10:00:00
   Valid until: 2026-02-09 10:25:00
🎉 Successfully generated 1 PIN(s)
```

5. **Verify in Database**: PIN should exist

6. **Admin checks Edit modal**: PIN should be visible

---

## 🔍 Common Issues & Solutions

### Issue: "Enter PIN" button is disabled
**Cause**: PIN not generated yet
**Fix**: Admin generates PIN manually from Edit modal

### Issue: "Location Permission Required" alert
**Cause**: Student hasn't granted location permission
**Fix**: Go to device Settings → App → Permissions → Enable Location

### Issue: Location check always fails
**Causes**:
1. Geofencing coordinates not set
2. Radius too small
3. GPS inaccurate

**Fixes**:
- Check coordinates in database: `geofencing_latitude`, `geofencing_longitude`
- Increase radius temporarily for testing (e.g., 500m)
- Use supervisor override

### Issue: PIN not auto-generating
**Causes**:
1. Cron job not running
2. Exam time format incorrect
3. Pin_enabled = FALSE

**Fixes**:
```sql
-- Check exam settings
SELECT id, title, exam_date, exam_time, pin_enabled, pin_generation_minutes
FROM scheduled_exams
WHERE id = '[exam-id]';

-- Ensure pin_enabled is TRUE
UPDATE scheduled_exams SET pin_enabled = TRUE WHERE id = '[exam-id]';
```

---

## ✅ Success Criteria

All tests passed if:
- ✅ Admin can generate PIN manually
- ✅ Admin can regenerate expired PIN
- ✅ Student can enter PIN successfully (no geofencing)
- ✅ Student location validated when geofencing enabled
- ✅ Location failures show detailed error with distance
- ✅ Expired PIN rejected with proper message
- ✅ Supervisor override works via API
- ✅ Auto-generation script generates PINs correctly
- ✅ Database records check_in_method correctly
- ✅ Button states change appropriately (purple → green)

---

## 📊 Database Verification Queries

### View All PINs:
```sql
SELECT id, title, exam_date, exam_time,
       generated_pin, pin_generated_at,
       pin_enabled, pin_validity_minutes
FROM scheduled_exams
WHERE pin_enabled = TRUE
ORDER BY exam_date DESC, exam_time DESC;
```

### View All Check-ins:
```sql
SELECT ea.exam_id, se.title, ea.user_email,
       ea.marked_present, ea.check_in_time,
       ea.check_in_method, ea.override_reason
FROM exam_attendance ea
JOIN scheduled_exams se ON ea.exam_id = se.id
ORDER BY ea.check_in_time DESC
LIMIT 20;
```

### View Failed Location Attempts:
(Check application logs for failed validation attempts with `requires_override: true`)

---

## 🎬 Demo Flow for Stakeholders

1. **Show Admin View**: Edit modal with PIN generation
2. **Generate PIN**: Large display for announcement
3. **Show Student View**: Purple "Enter PIN" button
4. **Enter PIN**: Success flow
5. **Show Location Check**: With distance validation
6. **Show Override**: Supervisor can approve
7. **Show Audit Trail**: Database records with check_in_method

---

**Last Updated**: February 8, 2026
**Status**: Ready for Testing
