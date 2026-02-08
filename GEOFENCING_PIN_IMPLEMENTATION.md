# 🎯 Geofencing & PIN Features Implementation Plan

**Date:** 2026-02-08
**Status:** In Progress

---

## 📋 Three Features to Implement

### 1. ✅ Fix: Start Exam Button Not Enabling
**Problem:** Even after supervisor marks user present, button stays disabled
**Root Cause:** Frontend doesn't auto-refresh exam data after check-in
**Solution:** Add polling mechanism to refresh exams every 10 seconds when user has pending exams

### 2. 🗺️ Geofencing Feature
**Purpose:** Ensure users are physically at exam location before starting
**Behavior:** Optional per-exam, per-batch configuration

### 3. 🔢 PIN-Based Auto Check-in
**Purpose:** Reduce manual supervisor work via PIN entry
**Behavior:** Auto-generate 4-digit PIN before exam, users enter to mark present

---

## 🗄️ Database Schema Changes

### New Columns for `scheduled_exams` Table

```sql
-- Geofencing Fields
geofencing_enabled BOOLEAN DEFAULT FALSE
geofencing_radius INTEGER DEFAULT 100  -- meters
geofencing_latitude DECIMAL(10, 8)
geofencing_longitude DECIMAL(11, 8)

-- PIN Generation Fields
pin_enabled BOOLEAN DEFAULT FALSE
pin_generation_minutes INTEGER DEFAULT 5  -- minutes before exam
pin_validity_minutes INTEGER DEFAULT 30  -- how long PIN is valid
generated_pin VARCHAR(4)
pin_generated_at TIMESTAMP
```

### New JSON Structure for `batch_assignments`

Each batch object will now include:

```json
{
  "batchNumber": 1,
  "startTime": "10:00",
  "endTime": "11:00",
  "date": "2026-02-10",
  "location": "Room 101",
  "supervisorEmail": "supervisor@example.com",
  "supervisorName": "John Doe",
  "maxUsers": 10,
  "users": [...],

  // NEW FIELDS
  "geofencing": {
    "enabled": true,
    "latitude": 18.5204,
    "longitude": 73.8567,
    "radius": 200  // meters
  },
  "pinSettings": {
    "enabled": true,
    "generationMinutes": 5,
    "validityMinutes": 30,
    "generatedPin": "4321",  // auto-generated
    "pinGeneratedAt": "2026-02-10T09:55:00Z"
  }
}
```

---

## 🔧 Backend API Changes

### 1. Migration Script

**File:** `backend/migrate_geofencing_pin.py`

```python
"""
Add geofencing and PIN fields to scheduled_exams table
"""
import psycopg2
from app.config.database import get_db_url

def migrate():
    conn = psycopg2.connect(get_db_url())
    cur = conn.cursor()

    # Add geofencing fields
    cur.execute("""
        ALTER TABLE scheduled_exams
        ADD COLUMN IF NOT EXISTS geofencing_enabled BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS geofencing_radius INTEGER DEFAULT 100,
        ADD COLUMN IF NOT EXISTS geofencing_latitude DECIMAL(10, 8),
        ADD COLUMN IF NOT EXISTS geofencing_longitude DECIMAL(11, 8),

        -- PIN fields
        ADD COLUMN IF NOT EXISTS pin_enabled BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS pin_generation_minutes INTEGER DEFAULT 5,
        ADD COLUMN IF NOT EXISTS pin_validity_minutes INTEGER DEFAULT 30,
        ADD COLUMN IF NOT EXISTS generated_pin VARCHAR(4),
        ADD COLUMN IF NOT EXISTS pin_generated_at TIMESTAMP;
    """)

    conn.commit()
    print("✅ Migration complete!")
```

### 2. Model Updates

**File:** `backend/app/models/assessment.py`

Add new fields to `ScheduledExam` model:

```python
geofencing_enabled = Column(Boolean, default=False)
geofencing_radius = Column(Integer, default=100)
geofencing_latitude = Column(Numeric(10, 8))
geofencing_longitude = Column(Numeric(11, 8))

pin_enabled = Column(Boolean, default=False)
pin_generation_minutes = Column(Integer, default=5)
pin_validity_minutes = Column(Integer, default=30)
generated_pin = Column(String(4))
pin_generated_at = Column(DateTime)
```

### 3. New API Endpoints

#### A. Validate User Location
**POST** `/api/v1/assessments/scheduled/{exam_id}/validate-location`

```json
{
  "user_email": "user@example.com",
  "latitude": 18.5204,
  "longitude": 73.8567
}
```

**Response:**
```json
{
  "valid": true,
  "distance_meters": 45,
  "allowed_radius": 100
}
```

#### B. Generate PIN for Batch
**POST** `/api/v1/assessments/scheduled/{exam_id}/generate-pin`

```json
{
  "batch_number": 1
}
```

**Response:**
```json
{
  "pin": "4321",
  "valid_until": "2026-02-10T10:25:00Z"
}
```

#### C. Validate PIN Entry
**POST** `/api/v1/assessments/scheduled/{exam_id}/validate-pin`

```json
{
  "user_email": "user@example.com",
  "pin": "4321",
  "batch_number": 1
}
```

**Response:**
```json
{
  "valid": true,
  "marked_present": true
}
```

---

## 🎨 Frontend UI Changes

### 1. Fix Start Exam Button (UpcomingExamsCard.js)

**Changes:**
- Add auto-refresh every 10 seconds
- Check if exam time window has been reached
- Refresh after marking present

```javascript
useEffect(() => {
    if (userEmail && exams.length > 0) {
        const interval = setInterval(() => {
            fetchExams(); // Refresh every 10 seconds
        }, 10000);

        return () => clearInterval(interval);
    }
}, [userEmail, exams.length]);
```

### 2. Admin Configuration UI (ScheduleExamModal.js)

#### Step 1: Add Geofencing Toggle

```javascript
// In Step 1 - Details section
<View style={styles.geofencingContainer}>
  <View style={styles.toggleRow}>
    <Text style={styles.toggleLabel}>Enable Geofencing</Text>
    <Switch
      value={geofencingEnabled}
      onValueChange={setGeofencingEnabled}
    />
  </View>

  {geofencingEnabled && (
    <>
      <TextInput
        placeholder="Radius (meters)"
        value={geofencingRadius}
        onChangeText={setGeofencingRadius}
        keyboardType="numeric"
      />
      <Text style={styles.helpText}>
        Users must be within this radius to start exam
      </Text>
    </>
  )}
</View>
```

#### Step 2: Add PIN Toggle

```javascript
<View style={styles.pinContainer}>
  <View style={styles.toggleRow}>
    <Text style={styles.toggleLabel}>Enable PIN Check-in</Text>
    <Switch
      value={pinEnabled}
      onValueChange={setPinEnabled}
    />
  </View>

  {pinEnabled && (
    <>
      <TextInput
        placeholder="Generate PIN (minutes before exam)"
        value={pinGenerationMinutes}
        onChangeText={setPinGenerationMinutes}
        keyboardType="numeric"
      />
      <TextInput
        placeholder="PIN validity (minutes)"
        value={pinValidityMinutes}
        onChangeText={setPinValidityMinutes}
        keyboardType="numeric"
      />
      <Text style={styles.helpText}>
        PIN will be auto-generated 5 minutes before exam start
      </Text>
    </>
  )}
</View>
```

#### Step 3: Per-Batch Configuration

In Batch Edit Modal, add geofencing coordinates:

```javascript
<Text style={styles.sectionTitle}>📍 Geofencing (Optional)</Text>
<View style={styles.toggleRow}>
  <Text>Enable for this batch</Text>
  <Switch
    value={batchAssignments[editingBatchIndex].geofencing.enabled}
    onValueChange={(val) => {
      const updated = [...batchAssignments];
      updated[editingBatchIndex].geofencing.enabled = val;
      setBatchAssignments(updated);
    }}
  />
</View>

{batchAssignments[editingBatchIndex].geofencing.enabled && (
  <>
    <TextInput
      placeholder="Latitude"
      value={String(batchAssignments[editingBatchIndex].geofencing.latitude || '')}
      onChangeText={(val) => {
        const updated = [...batchAssignments];
        updated[editingBatchIndex].geofencing.latitude = parseFloat(val);
        setBatchAssignments(updated);
      }}
      keyboardType="decimal-pad"
    />
    <TextInput
      placeholder="Longitude"
      value={String(batchAssignments[editingBatchIndex].geofencing.longitude || '')}
      onChangeText={(val) => {
        const updated = [...batchAssignments];
        updated[editingBatchIndex].geofencing.longitude = parseFloat(val);
        setBatchAssignments(updated);
      }}
      keyboardType="decimal-pad"
    />
    <TextInput
      placeholder="Radius (meters)"
      value={String(batchAssignments[editingBatchIndex].geofencing.radius || '')}
      onChangeText={(val) => {
        const updated = [...batchAssignments];
        updated[editingBatchIndex].geofencing.radius = parseInt(val);
        setBatchAssignments(updated);
      }}
      keyboardType="numeric"
    />
    <TouchableOpacity
      style={styles.getCurrentLocationBtn}
      onPress={async () => {
        const { coords } = await Location.getCurrentPositionAsync({});
        const updated = [...batchAssignments];
        updated[editingBatchIndex].geofencing.latitude = coords.latitude;
        updated[editingBatchIndex].geofencing.longitude = coords.longitude;
        setBatchAssignments(updated);
        Alert.alert('Location Set', `Lat: ${coords.latitude}, Long: ${coords.longitude}`);
      }}
    >
      <Text>📍 Use Current Location</Text>
    </TouchableOpacity>
  </>
)}
```

### 3. User Exam Start Flow (UpcomingExamsCard.js)

**Enhanced `handleStartExam` function:**

```javascript
const handleStartExam = async (exam) => {
  // Step 1: Check if marked present
  if (!exam.can_start) {
    // Check if PIN is enabled
    if (exam.pin_enabled) {
      showPINDialog(exam);
      return;
    }

    Alert.alert(
      'Cannot Start Yet',
      'You need to be marked present by the supervisor...'
    );
    return;
  }

  // Step 2: Check geofencing
  if (exam.geofencing_enabled) {
    const locationValid = await checkGeofencing(exam);
    if (!locationValid) {
      return; // Error shown in checkGeofencing
    }
  }

  // Step 3: Start exam
  proceedToStartExam(exam);
};

const checkGeofencing = async (exam) => {
  try {
    const { coords } = await Location.getCurrentPositionAsync({});

    const res = await fetch(
      `${API_URL}/api/v1/assessments/scheduled/${exam.id}/validate-location`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_email: userEmail,
          latitude: coords.latitude,
          longitude: coords.longitude
        })
      }
    );

    const data = await res.json();

    if (!data.valid) {
      Alert.alert(
        'Location Check Failed',
        `You are ${data.distance_meters}m away from the exam center. You must be within ${data.allowed_radius}m to start.`
      );
      return false;
    }

    return true;
  } catch (error) {
    Alert.alert('Location Error', 'Unable to get your location. Please enable GPS.');
    return false;
  }
};

const showPINDialog = (exam) => {
  Alert.prompt(
    'Enter Exam PIN',
    'Please enter the 4-digit PIN provided by your supervisor',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Submit',
        onPress: async (pin) => {
          if (pin && pin.length === 4) {
            await validatePIN(exam, pin);
          } else {
            Alert.alert('Invalid PIN', 'Please enter a 4-digit PIN');
          }
        }
      }
    ],
    'plain-text',
    '',
    'number-pad'
  );
};

const validatePIN = async (exam, pin) => {
  try {
    const res = await fetch(
      `${API_URL}/api/v1/assessments/scheduled/${exam.id}/validate-pin`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_email: userEmail,
          pin: pin,
          batch_number: exam.batch_number
        })
      }
    );

    const data = await res.json();

    if (data.valid && data.marked_present) {
      Alert.alert('Success', 'You have been marked present!');
      fetchExams(); // Refresh to update can_start
    } else {
      Alert.alert('Invalid PIN', 'The PIN you entered is incorrect or expired.');
    }
  } catch (error) {
    Alert.alert('Error', 'Failed to validate PIN');
  }
};
```

---

## 🧪 Testing Checklist

### Feature 1: Start Exam Button Fix
- [ ] Supervisor marks user present
- [ ] User's exam list auto-refreshes within 10 seconds
- [ ] Button changes from disabled to enabled
- [ ] User can start exam

### Feature 2: Geofencing
- [ ] Admin enables geofencing for exam
- [ ] Admin sets location coordinates and radius
- [ ] User within radius → can start exam
- [ ] User outside radius → sees distance error
- [ ] User without GPS → sees appropriate message

### Feature 3: PIN Check-in
- [ ] Admin enables PIN feature
- [ ] PIN auto-generates 5 minutes before exam
- [ ] Supervisor can view PIN
- [ ] User enters correct PIN → marked present
- [ ] User enters wrong PIN → error message
- [ ] Expired PIN → rejected
- [ ] Rate limiting prevents spam

---

## 📦 Implementation Order

1. ✅ Create this documentation
2. ⏳ Fix Start Exam button with auto-refresh
3. ⏳ Create database migration script
4. ⏳ Update backend models
5. ⏳ Implement geofencing API endpoints
6. ⏳ Implement PIN generation API endpoints
7. ⏳ Add frontend UI for admin configuration
8. ⏳ Add frontend logic for user validation
9. ⏳ Test all features end-to-end
10. ⏳ Document usage for admins/supervisors

---

**Next Step:** Start with fixing the Start Exam button issue
