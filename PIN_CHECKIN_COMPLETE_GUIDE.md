# PIN Check-in & Geofencing Complete Implementation Guide

## 🎯 Overview

This guide covers the complete implementation of PIN-based check-in with location validation for exams. The system allows:

1. **Admin/Supervisor Controls**: Generate and manage PINs from the exam list
2. **Auto-Generation**: Automatic PIN generation at configured time before exam
3. **Student Check-in**: Students enter PIN to mark themselves present
4. **Location Validation**: Optional geofencing validates student location when entering PIN
5. **Supervisor Override**: Supervisors can manually approve students who fail location checks

---

## 📋 Features Implemented

### 1. Admin/Supervisor PIN Management UI

**Location**: `Components/ScheduledExamsListModal.js`

**Features**:
- Edit button on each exam card (visible to admin/supervisor)
- Edit modal shows:
  - Current PIN (if generated)
  - Generate PIN button
  - Regenerate PIN button (if PIN exists)
  - Geofencing status
  - Auto-generation settings

**Usage**:
1. Admin/Supervisor opens exam list
2. Clicks "Edit" on an exam
3. Clicks "Generate PIN Now" button
4. PIN is displayed in large format for announcement
5. Can regenerate PIN if expired

### 2. Backend API Endpoints

**File**: `backend/app/api/v1/endpoints/assessments.py`

#### Endpoint 1: Generate PIN (Manual)
```
POST /api/v1/assessments/scheduled/{exam_id}/generate-pin
```
- Generates 4-digit random PIN
- Records generation timestamp
- Returns PIN and expiry time

#### Endpoint 2: Validate PIN (with Location Check)
```
POST /api/v1/assessments/scheduled/{exam_id}/validate-pin
Form Data:
  - user_email: string
  - pin: string
  - latitude: float (optional, required if geofencing enabled)
  - longitude: float (optional, required if geofencing enabled)
```
- Validates PIN correctness
- Checks PIN expiration
- If geofencing enabled: validates location using Haversine distance
- Marks user present if all checks pass
- Returns `requires_override: true` if location fails

#### Endpoint 3: Supervisor Override
```
POST /api/v1/assessments/scheduled/{exam_id}/supervisor-override
Form Data:
  - user_email: string
  - supervisor_email: string
  - override_reason: string (optional)
```
- Allows supervisor to manually mark user present
- Bypasses location check
- Records override in attendance with reason

### 3. Database Schema Updates

**File**: `backend/app/models/assessment.py`

**Table**: `exam_attendance`

New columns added:
```sql
- check_in_time TIMESTAMP        -- When user checked in
- check_in_method VARCHAR(50)     -- PIN, SUPERVISOR, SUPERVISOR_OVERRIDE
- override_reason TEXT            -- Reason for supervisor override
```

**Migration Script**: `backend/migrate_attendance_override.py`
- ✅ Already executed successfully

### 4. Student PIN Entry Flow

**File**: `Components/UpcomingExamsCard.js`

**User Experience**:
1. Student sees "Enter PIN to Check-in" button (purple color)
2. Taps button → PIN dialog appears
3. Enters 4-digit PIN
4. If geofencing enabled:
   - App requests location permission
   - Gets current GPS coordinates
   - Sends PIN + location to backend
5. Backend validates:
   - PIN correctness ✓
   - PIN not expired ✓
   - Location within radius ✓ (if geofencing enabled)
6. Results:
   - **Success**: "Check-in Successful! You can now start the exam"
   - **Location Failed**: "Location Check Failed - You are Xm away. Contact supervisor."
   - **Invalid PIN**: "Incorrect PIN" or "PIN has expired"

### 5. Auto-Generation System

**File**: `backend/auto_generate_pins.py`

**How it works**:
- Runs periodically (every 1-5 minutes via cron/scheduler)
- Checks all PIN-enabled exams
- For each exam:
  - Calculates generation time: `exam_time - pin_generation_minutes`
  - If current time >= generation time AND current time < exam_time:
    - Generates 4-digit PIN if not already generated or expired
    - Records generation timestamp

**Setup Cron Job (Linux/Mac)**:
```bash
# Edit crontab
crontab -e

# Add line to run every minute
* * * * * cd /path/to/backend && python auto_generate_pins.py >> /var/log/pin_generation.log 2>&1
```

**Setup Task Scheduler (Windows)**:
1. Open Task Scheduler
2. Create Basic Task
3. Trigger: Daily, Repeat every 1 minute
4. Action: Start program
   - Program: `python`
   - Arguments: `auto_generate_pins.py`
   - Start in: `c:\Users\Arzaan Ali Khan\OneDrive\Desktop\BWC Demo\newlms\backend`

---

## 🔄 Complete User Flow

### Admin Workflow

1. **Schedule Exam** (in ScheduleExamModal):
   - Enable "PIN Check-in" toggle
   - Set "Generate PIN X minutes before exam" (e.g., 5 minutes)
   - Set "PIN valid for Y minutes" (e.g., 30 minutes)
   - Optionally enable geofencing and set radius

2. **Before Exam**:
   - Auto-generation script generates PIN at configured time
   - OR Admin manually generates PIN from Edit modal

3. **Announce PIN**:
   - Admin/Supervisor opens Edit modal
   - Sees large PIN display
   - Announces PIN to physically present students

4. **Monitor Check-ins**:
   - View attendance list to see who checked in
   - Override location failures if needed

### Student Workflow

1. **Open App**:
   - See upcoming exam card
   - Button shows "Enter PIN to Check-in" (purple)

2. **Enter PIN**:
   - Tap button
   - Enter 4-digit PIN from supervisor

3. **Location Check** (if geofencing enabled):
   - App requests location permission (one-time)
   - Gets current GPS coordinates automatically
   - Sends to backend with PIN

4. **Result**:
   - **Success**: Marked present, can start exam
   - **Location Failed**: Error message, contact supervisor
   - **Invalid PIN**: Try again or ask supervisor

### Supervisor Override Workflow

**Scenario**: Student enters correct PIN but fails location check (e.g., GPS inaccurate)

**Solution**: (To be implemented in supervisor UI)
```
1. Supervisor sees "Student X failed location check" notification
2. Verifies student is physically present
3. Clicks "Override" button in attendance list
4. Student is marked present with "SUPERVISOR_OVERRIDE" method
```

---

## 🧪 Testing Guide

### Test 1: Manual PIN Generation

1. Create exam with PIN enabled
2. Admin opens exam list → clicks Edit
3. Clicks "Generate PIN Now"
4. Verify PIN displayed in modal
5. Check database: `generated_pin` and `pin_generated_at` should be set

### Test 2: Student PIN Check-in (No Geofencing)

1. Create exam with PIN enabled, geofencing disabled
2. Generate PIN
3. Student taps "Enter PIN to Check-in"
4. Enters correct PIN
5. Verify success message
6. Check database: `exam_attendance` record created with `check_in_method='PIN'`

### Test 3: PIN + Location Check (Success)

1. Create exam with PIN + geofencing enabled
2. Set geofencing coordinates to current location
3. Set radius to 100m
4. Generate PIN
5. Student enters PIN from nearby location
6. Verify success message
7. Check database: attendance marked present

### Test 4: PIN + Location Check (Failure)

1. Create exam with PIN + geofencing enabled
2. Set geofencing coordinates to distant location (different city)
3. Generate PIN
4. Student enters correct PIN from current location
5. Verify error: "You are Xm away from exam location"
6. Verify `requires_override: true` in response
7. Check database: attendance NOT created

### Test 5: Expired PIN

1. Generate PIN
2. Wait for validity period to expire (or manually update `pin_generated_at` in DB)
3. Student enters expired PIN
4. Verify error: "PIN has expired"

### Test 6: Auto-Generation

1. Create exam with PIN enabled
2. Set exam_time to 5 minutes from now
3. Set pin_generation_minutes to 2
4. Wait for current time to reach (exam_time - 2 minutes)
5. Run: `python auto_generate_pins.py`
6. Verify PIN generated in database
7. Check logs for generation confirmation

### Test 7: Supervisor Override

1. Student fails location check (Test 4 scenario)
2. Call supervisor override endpoint:
```bash
curl -X POST http://localhost:8000/api/v1/assessments/scheduled/{exam_id}/supervisor-override \
  -F "user_email=student@example.com" \
  -F "supervisor_email=supervisor@example.com" \
  -F "override_reason=GPS inaccuracy, student verified present"
```
3. Verify success response
4. Check database: attendance created with `check_in_method='SUPERVISOR_OVERRIDE'`

---

## 🔧 Configuration

### Exam-Level Settings

Set in ScheduleExamModal when creating exam:

```javascript
{
  pin_enabled: true,                    // Enable PIN feature
  pin_generation_minutes: 5,           // Generate PIN 5 min before exam
  pin_validity_minutes: 30,            // PIN valid for 30 minutes
  geofencing_enabled: true,            // Enable location checking
  geofencing_radius: 100,              // 100 meter radius
  geofencing_latitude: 40.7128,        // Exam location coordinates
  geofencing_longitude: -74.0060
}
```

### Auto-Generation Schedule

Recommended: Run every 1 minute
```
* * * * * python auto_generate_pins.py
```

---

## 📊 Database Queries

### View All Check-ins for an Exam
```sql
SELECT
  user_email,
  marked_present,
  check_in_time,
  check_in_method,
  override_reason
FROM exam_attendance
WHERE exam_id = 'your-exam-id'
ORDER BY check_in_time DESC;
```

### View Overridden Attendances
```sql
SELECT * FROM exam_attendance
WHERE check_in_method = 'SUPERVISOR_OVERRIDE';
```

### View Current Active PINs
```sql
SELECT
  id,
  title,
  generated_pin,
  pin_generated_at,
  pin_generated_at + INTERVAL '1 minute' * pin_validity_minutes AS valid_until,
  NOW() < pin_generated_at + INTERVAL '1 minute' * pin_validity_minutes AS is_active
FROM scheduled_exams
WHERE pin_enabled = TRUE
  AND generated_pin IS NOT NULL
ORDER BY pin_generated_at DESC;
```

---

## 🚨 Troubleshooting

### Issue: PIN not generating automatically

**Check**:
1. Is cron job running? `crontab -l`
2. Check logs: `tail -f /var/log/pin_generation.log`
3. Verify exam_time is in correct format: `YYYY-MM-DD HH:MM`
4. Check pin_enabled is TRUE in database

**Fix**:
```sql
UPDATE scheduled_exams
SET pin_enabled = TRUE,
    pin_generation_minutes = 5
WHERE id = 'your-exam-id';
```

### Issue: Location check always fails

**Check**:
1. Geofencing coordinates set? Check `geofencing_latitude`, `geofencing_longitude`
2. Radius reasonable? Check `geofencing_radius` (100m typical)
3. Student granted location permission?

**Fix**:
- Test with larger radius temporarily
- Use supervisor override for GPS inaccuracies

### Issue: PIN expired too quickly

**Fix**:
```sql
UPDATE scheduled_exams
SET pin_validity_minutes = 60  -- Extend to 60 minutes
WHERE id = 'your-exam-id';
```

Then regenerate PIN.

### Issue: Student can't enter PIN

**Check**:
1. PIN generated? Check Edit modal or database
2. Exam time window? PIN only shows before exam starts
3. Already checked in? Check exam_attendance table

---

## 🔐 Security Considerations

1. **PIN Entropy**: 4 digits = 10,000 combinations
   - Low risk: Short validity window (30 min)
   - Physical presence required (announced in exam hall)

2. **Location Spoofing**: Students could fake GPS
   - Mitigation: Supervisor override for legitimate cases
   - Consider: Additional device fingerprinting (future enhancement)

3. **Supervisor Authorization**: Only assigned supervisor can override
   - Verified via `supervisor_email` match

4. **Audit Trail**: All check-ins logged with method and timestamp
   - Review overrides periodically

---

## 🎨 UI/UX Features

### Button States

**Student View** (`UpcomingExamsCard.js`):
- 🟣 Purple: "Enter PIN to Check-in" (PIN enabled, not checked in)
- 🟢 Green: "Start Exam Now" (checked in, can start)
- 🔵 Blue: "Waiting for Supervisor" (no PIN, not marked present)

### Admin View (`ScheduledExamsListModal.js`):
- Edit button on each exam card
- Large PIN display for easy announcement
- Generate/Regenerate buttons
- Visual indicators for geofencing status

---

## 📈 Future Enhancements

1. **Real-time PIN Display**: WebSocket updates for auto-generated PINs
2. **Attendance Dashboard**: Live view of check-ins during exam
3. **Bulk Override**: Approve multiple location failures at once
4. **PIN History**: View all generated PINs with usage stats
5. **QR Code Alternative**: Generate QR code containing PIN
6. **SMS Integration**: Auto-send PIN to registered students
7. **Biometric Verification**: Face/fingerprint verification on check-in

---

## ✅ Checklist for Deployment

- [x] Database migration executed (`migrate_attendance_override.py`)
- [x] Backend endpoints tested
- [x] Frontend UI tested
- [ ] Cron job configured for auto-generation
- [ ] Location permissions tested on mobile devices
- [ ] Supervisor override UI added to admin panel
- [ ] Documentation shared with admins/supervisors
- [ ] Test with real exam scenario
- [ ] Monitor logs for errors

---

## 📞 Support

For issues or questions:
1. Check logs: `backend/auto_generate_pins.py` output
2. Review database: `exam_attendance` and `scheduled_exams` tables
3. Test endpoints with curl/Postman
4. Check frontend console for errors

---

**Implementation Date**: February 8, 2026
**Version**: 1.0
**Status**: ✅ Complete and Ready for Testing
