# 🎯 Implementation Progress & Next Steps

**Last Updated:** 2026-02-08

---

## ✅ Completed (Phase 1)

### 1. Start Exam Button Fix
- ✅ Added auto-refresh mechanism (10-second polling)
- ✅ File: `Components/UpcomingExamsCard.js`
- ✅ Result: Button now enables automatically after supervisor marks user present

### 2. Database Schema
- ✅ Created migration script: `backend/migrate_geofencing_pin.py`
- ✅ Added 9 new columns to `scheduled_exams` table:
  - Geofencing: `geofencing_enabled`, `geofencing_radius`, `geofencing_latitude`, `geofencing_longitude`
  - PIN: `pin_enabled`, `pin_generation_minutes`, `pin_validity_minutes`, `generated_pin`, `pin_generated_at`
- ✅ Migration executed successfully

### 3. Backend Model Updates
- ✅ Updated `backend/app/models/assessment.py`
- ✅ Added all 9 new fields to `ScheduledExam` model
- ✅ Updated `to_dict()` method with snake_case and camelCase versions
- ✅ Added proper type conversions (Decimal → float for coordinates)

---

## 🔄 In Progress (Phase 2)

### 4. Backend API Endpoints

Need to create 3 new endpoints in `backend/app/api/v1/endpoints/assessments.py`:

#### A. Validate Location (Geofencing)
```python
@router.post("/{exam_id}/validate-location")
async def validate_user_location(
    exam_id: str,
    user_email: str = Form(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
    db: Session = Depends(get_db)
):
    """
    Validate if user is within geofence radius
    Returns: {valid: bool, distance_meters: float, allowed_radius: int}
    """
    # Implementation needed
```

#### B. Generate PIN
```python
@router.post("/{exam_id}/generate-pin")
async def generate_exam_pin(
    exam_id: str,
    batch_number: int = Form(None),
    db: Session = Depends(get_db)
):
    """
    Generate 4-digit PIN for exam/batch
    Auto-called by scheduler X minutes before exam
    Returns: {pin: str, valid_until: datetime}
    """
    # Implementation needed
```

#### C. Validate PIN
```python
@router.post("/{exam_id}/validate-pin")
async def validate_exam_pin(
    exam_id: str,
    user_email: str = Form(...),
    pin: str = Form(...),
    batch_number: int = Form(None),
    db: Session = Depends(get_db)
):
    """
    Validate PIN and mark user as present
    Returns: {valid: bool, marked_present: bool}
    """
    # Implementation needed
```

---

## 📋 Remaining Tasks (Phase 3 - Frontend)

### 5. Admin UI - ScheduleExamModal.js

**Step 1 (Details) - Add Toggles:**
```javascript
// Add after Draft/Publish toggle

// Geofencing Toggle
const [geofencingEnabled, setGeofencingEnabled] = useState(false);
const [geofencingRadius, setGeofencingRadius] = useState('100');

<View style={styles.featureToggleContainer}>
  <View style={styles.toggleRow}>
    <Feather name="map-pin" size={20} color="#6366F1" />
    <Text style={styles.toggleLabel}>Enable Geofencing</Text>
    <Switch
      value={geofencingEnabled}
      onValueChange={setGeofencingEnabled}
    />
  </View>
  {geofencingEnabled && (
    <TextInput
      style={styles.input}
      placeholder="Radius (meters)"
      value={geofencingRadius}
      onChangeText={setGeofencingRadius}
      keyboardType="numeric"
    />
  )}
</View>

// PIN Toggle
const [pinEnabled, setPinEnabled] = useState(false);
const [pinGenerationMinutes, setPinGenerationMinutes] = useState('5');
const [pinValidityMinutes, setPinValidityMinutes] = useState('30');

<View style={styles.featureToggleContainer}>
  <View style={styles.toggleRow}>
    <Feather name="key" size={20} color="#6366F1" />
    <Text style={styles.toggleLabel}>Enable PIN Check-in</Text>
    <Switch
      value={pinEnabled}
      onValueChange={setPinEnabled}
    />
  </View>
  {pinEnabled && (
    <>
      <TextInput
        style={styles.input}
        placeholder="Generate PIN (minutes before exam)"
        value={pinGenerationMinutes}
        onChangeText={setPinGenerationMinutes}
        keyboardType="numeric"
      />
      <TextInput
        style={styles.input}
        placeholder="PIN validity (minutes)"
        value={pinValidityMinutes}
        onChangeText={setPinValidityMinutes}
        keyboardType="numeric"
      />
    </>
  )}
</View>
```

**Step 2 (Batch Config) - Per-Batch Geofencing:**
```javascript
// In Batch Edit Modal, add geofencing section

<Text style={styles.sectionTitle}>📍 Geofencing (Optional)</Text>
<View style={styles.toggleRow}>
  <Text>Enable for this batch</Text>
  <Switch
    value={batch.geofencing?.enabled || false}
    onValueChange={(val) => {
      const updated = [...batchAssignments];
      if (!updated[editingBatchIndex].geofencing) {
        updated[editingBatchIndex].geofencing = {};
      }
      updated[editingBatchIndex].geofencing.enabled = val;
      setBatchAssignments(updated);
    }}
  />
</View>

{batch.geofencing?.enabled && (
  <>
    <TextInput
      placeholder="Latitude"
      value={String(batch.geofencing?.latitude || '')}
      keyboardType="decimal-pad"
    />
    <TextInput
      placeholder="Longitude"
      value={String(batch.geofencing?.longitude || '')}
      keyboardType="decimal-pad"
    />
    <TextInput
      placeholder="Radius (meters)"
      value={String(batch.geofencing?.radius || '100')}
      keyboardType="numeric"
    />
    <TouchableOpacity
      style={styles.getCurrentLocationBtn}
      onPress={async () => {
        // Request permission
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Denied', 'Location access required');
          return;
        }

        // Get current location
        const { coords } = await Location.getCurrentPositionAsync({});
        const updated = [...batchAssignments];
        if (!updated[editingBatchIndex].geofencing) {
          updated[editingBatchIndex].geofencing = {};
        }
        updated[editingBatchIndex].geofencing.latitude = coords.latitude;
        updated[editingBatchIndex].geofencing.longitude = coords.longitude;
        setBatchAssignments(updated);
        Alert.alert('Location Set', `Lat: ${coords.latitude.toFixed(6)}, Long: ${coords.longitude.toFixed(6)}`);
      }}
    >
      <Feather name="map-pin" size={16} color="#FFF" />
      <Text style={styles.getCurrentLocationText}>Use Current Location</Text>
    </TouchableOpacity>
  </>
)}
```

**Step 3 (Submission) - Update Form Data:**
```javascript
// In handleSubmit(), add new fields to formData

formData.append('geofencing_enabled', geofencingEnabled.toString());
formData.append('geofencing_radius', geofencingRadius);

formData.append('pin_enabled', pinEnabled.toString());
formData.append('pin_generation_minutes', pinGenerationMinutes);
formData.append('pin_validity_minutes', pinValidityMinutes);
```

### 6. User Flow - UpcomingExamsCard.js

**Install expo-location:**
```bash
npx expo install expo-location
```

**Import:**
```javascript
import * as Location from 'expo-location';
```

**Enhanced handleStartExam:**
```javascript
const handleStartExam = async (exam) => {
  // Step 1: Check if marked present OR PIN enabled
  if (!exam.can_start) {
    if (exam.pin_enabled || exam.pinEnabled) {
      showPINDialog(exam);
      return;
    }

    Alert.alert(
      'Cannot Start Yet',
      'You need to be marked present by the supervisor...'
    );
    return;
  }

  // Step 2: Geofencing check
  if (exam.geofencing_enabled || exam.geofencingEnabled) {
    setStarting(exam.id);
    const locationValid = await checkGeofencing(exam);
    setStarting(null);

    if (!locationValid) {
      return; // Error shown in checkGeofencing
    }
  }

  // Step 3: Proceed to start exam
  proceedToStartExam(exam);
};

const checkGeofencing = async (exam) => {
  try {
    // Request permission
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Location Required',
        'This exam requires location access. Please enable location services.'
      );
      return false;
    }

    // Get current location
    const { coords } = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High
    });

    // Validate with backend
    const formData = new FormData();
    formData.append('user_email', userEmail);
    formData.append('latitude', coords.latitude);
    formData.append('longitude', coords.longitude);

    const res = await fetch(
      `${API_URL}/api/v1/assessments/scheduled/${exam.id}/validate-location`,
      {
        method: 'POST',
        body: formData
      }
    );

    const data = await res.json();

    if (!data.valid) {
      Alert.alert(
        'Location Check Failed',
        `You are ${Math.round(data.distance_meters)}m away from the exam center.\n\nYou must be within ${data.allowed_radius}m to start the exam.`,
        [{ text: 'OK' }]
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error('[Geofencing] Error:', error);
    Alert.alert(
      'Location Error',
      'Unable to get your location. Please check your GPS settings.'
    );
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
          if (pin && pin.length === 4 && /^\d{4}$/.test(pin)) {
            await validatePIN(exam, pin);
          } else {
            Alert.alert('Invalid PIN', 'Please enter a valid 4-digit PIN');
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
    setStarting(exam.id);

    const formData = new FormData();
    formData.append('user_email', userEmail);
    formData.append('pin', pin);
    if (exam.batch_number) {
      formData.append('batch_number', exam.batch_number);
    }

    const res = await fetch(
      `${API_URL}/api/v1/assessments/scheduled/${exam.id}/validate-pin`,
      {
        method: 'POST',
        body: formData
      }
    );

    const data = await res.json();

    setStarting(null);

    if (data.valid && data.marked_present) {
      Alert.alert(
        'Success!',
        'You have been marked present. You can now start the exam.',
        [
          {
            text: 'Start Exam',
            onPress: () => {
              fetchExams(); // Refresh to update can_start
              // Will auto-enable button after refresh
            }
          }
        ]
      );
    } else {
      Alert.alert(
        'Invalid PIN',
        data.message || 'The PIN you entered is incorrect or has expired.'
      );
    }
  } catch (error) {
    setStarting(null);
    console.error('[PIN] Error:', error);
    Alert.alert('Error', 'Failed to validate PIN. Please try again.');
  }
};

const proceedToStartExam = async (exam) => {
  // Existing exam start logic
  setStarting(exam.id);
  try {
    const formData = new FormData();
    formData.append('user_email', userEmail);

    const res = await fetch(`${API_URL}/api/v1/assessments/scheduled/${exam.id}/start`, {
      method: 'POST',
      body: formData
    });

    const data = await res.json();

    if (res.ok && (data.started_exam || data.status === 'success')) {
      let examData = data.exam || exam;

      if (examData.randomize_question_order || examData.randomizeQuestionOrder ||
          examData.randomize_option_order || examData.randomizeOptionOrder) {
        console.log('[UpcomingExamsCard] Applying randomization for user:', userEmail);
        examData = randomizeExamQuestions(examData, userEmail);
      }

      if (onStartExam) {
        onStartExam(examData, data.start_time);
      }
    } else {
      Alert.alert('Error', data.detail || 'Failed to start exam');
    }
  } catch (e) {
    Alert.alert('Error', 'Network error. Please try again.');
  }
  setStarting(null);
};
```

---

## 🧪 Testing Checklist

### Start Exam Button Fix
- [ ] Supervisor marks user present
- [ ] User's screen auto-refreshes within 10 seconds
- [ ] Button changes from "Waiting for Supervisor" to "Start Exam Now"
- [ ] User can successfully start exam

### Geofencing
- [ ] Admin enables geofencing in exam creation
- [ ] Admin sets coordinates using "Use Current Location"
- [ ] Admin sets radius (e.g., 200m)
- [ ] User within radius → can start exam
- [ ] User outside radius → sees distance error with exact meters
- [ ] User denies location permission → sees permission error

### PIN Check-in
- [ ] Admin enables PIN feature
- [ ] System auto-generates PIN (backend scheduler needed)
- [ ] Supervisor can view generated PIN
- [ ] User enters correct PIN → marked present
- [ ] User enters wrong PIN → error message
- [ ] User enters expired PIN → rejected
- [ ] Multiple wrong attempts don't crash app

---

## 📦 Dependencies

**Frontend:**
```bash
npx expo install expo-location
```

**Backend:**
None (using existing dependencies)

---

## 🚀 Next Immediate Steps

1. **Create Backend API Endpoints** (30-45 minutes)
   - validate-location
   - generate-pin
   - validate-pin

2. **Update Frontend Admin UI** (45-60 minutes)
   - Add toggles and inputs
   - Update batch edit modal
   - Update submission

3. **Update Frontend User Flow** (30-45 minutes)
   - Add location check
   - Add PIN dialog
   - Handle all error cases

4. **Testing** (30 minutes)
   - Test each feature
   - Test error scenarios
   - Cross-platform check

**Total Estimated Time:** 2-3 hours remaining

---

**Status:** Phase 1 Complete (Database + Model) | Phase 2 In Progress (API) | Phase 3 Pending (Frontend)
