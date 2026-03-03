# Debug Guide: Tracking Markers Not Showing

## Steps to Debug

### 1. Open Browser Console

1. Open the **Live Employee Tracking** page
2. Press **F12** to open DevTools
3. Click on the **Console** tab
4. Refresh the page

### 2. Look for Debug Output

You should see detailed logging like this:

```
=== TRACKING DATA FROM BACKEND ===
Total locations: 7

[0] test:
  - Active: true
  - Has GPS: NO (lat: null, lng: null)  ← PROBLEM HERE!
  - Last seen: 45 min ago
  - Timestamp: 2026-03-03T14:30:00Z

[1] Anees Qureshi:
  - Active: false
  - Has GPS: NO (lat: null, lng: null)
  - Last seen: 300 min ago
===================================

Map ready: true
WebView ref: true
Updating markers in WebView, count: 7
Platform: web
Sending updateMarkers message to iframe...
Message sent to iframe

[MAP] updateMarkers called with 7 locations
[MAP] Removed 0 existing employee markers
[MAP] Processing location 0 : test - Active: true - GPS: null null
[MAP] ✗ Skipped test - No GPS coordinates (lat: null lng: null)
[MAP] Processing location 1 : Anees Qureshi - Active: false - GPS: null null
[MAP] ✗ Skipped Anees Qureshi - No GPS coordinates
[MAP] Markers update complete: Added 0 Skipped 7
[MAP] Total employee markers now: 0
```

### 3. Interpret the Output

#### Scenario A: No GPS Coordinates
```
[0] test:
  - Active: true
  - Has GPS: NO (lat: null, lng: null)  ← ISSUE!
  - Last seen: 45 min ago               ← TOO OLD (>30 min)
```

**Diagnosis**: Data is stale (>30 minutes old)
**Backend hid coordinates** because location update is too old

**Solution**: Have employee restart tracking in mobile app

#### Scenario B: Map Not Ready
```
Cannot update markers - Map ready: false WebView ref: true
```

**Diagnosis**: Map hasn't finished loading yet
**Solution**: Wait a few seconds, markers will appear when map loads

#### Scenario C: No Communication with Map
```
updateMarkersInWebView called with 7 locations
Sending updateMarkers message to iframe...
Message sent to iframe

(NO [MAP] logs appear)
```

**Diagnosis**: Iframe isn't receiving messages
**Solution**: Check for CORS issues or iframe loading errors

#### Scenario D: Has GPS but No Marker
```
[MAP] Processing location 0 : test - Active: true - GPS: 19.0760 72.8777
[MAP] ✓ Added marker for test at 19.0760 72.8777
[MAP] Total employee markers now: 1
```

**Diagnosis**: Marker was added successfully!
**Solution**: Zoom out on map - marker might be outside current view

### 4. Common Issues & Fixes

#### Issue: "Has GPS: NO" for Active Users

**Cause**: Location data is older than 30 minutes

**Backend Logic**:
- Tracks location updates with timestamps
- Marks data as "stale" if >30 minutes old
- Hides GPS coordinates for stale data
- But still shows user as "active" in list

**Fixes**:

**Option 1 - Employee Restarts Tracking (Recommended)**
```
1. Employee opens mobile app
2. Stops tracking (toggle OFF)
3. Waits 5 seconds
4. Starts tracking again (toggle ON)
5. Admin refreshes Live Tracking page
6. Marker should now appear
```

**Option 2 - Extend Staleness Window**
```python
# backend/app/api/v1/endpoints/tracking.py line 377
STALE_MINUTES = 60  # Change from 30 to 60 minutes
```

**Option 3 - Show Stale Positions**
Modify backend to return last known GPS even if stale (requires code changes)

#### Issue: Marker Added but Not Visible

**Check**: Are you zoomed in to the wrong area?

**Solution**: Click on employee card at bottom to center map on their location

#### Issue: No [MAP] Logs in Console

**Check**: Is map iframe loaded?

**Solution 1**: Refresh page
**Solution 2**: Check browser console for iframe errors
**Solution 3**: Clear cache and reload

### 5. Verify Backend Data Directly

Check what backend is returning:

**Using curl** (requires auth token):
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8081/api/v1/tracking/location/all
```

**Expected Response**:
```json
[
  {
    "user_email": "test@example.com",
    "user_name": "test",
    "active": true,
    "latitude": 19.0760,    // Should NOT be null for active users
    "longitude": 72.8777,   // Should NOT be null for active users
    "timestamp": "2026-03-03T15:30:00Z",
    "last_seen_minutes": 5  // Should be <30 for GPS to show
  }
]
```

**If latitude/longitude are null**: Data is stale or user stopped tracking

### 6. Check Mobile App

**Verify tracking is working**:

1. Open mobile app
2. Check tracking toggle is ON (green)
3. Check GPS/Location permission is granted
4. Check network connection
5. Wait 1 minute
6. Refresh admin panel

**Common Mobile Issues**:
- GPS disabled on phone
- Location permission denied
- App killed by battery saver
- Network timeout preventing updates
- Background location access restricted

### 7. Database Check (Advanced)

**Check location_tracking table**:

```sql
SELECT
  user_email,
  active,
  latitude,
  longitude,
  timestamp,
  EXTRACT(EPOCH FROM (NOW() - timestamp))/60 as age_minutes
FROM location_tracking
WHERE user_email = 'test@example.com'
ORDER BY timestamp DESC
LIMIT 5;
```

**Healthy Data**:
- `age_minutes < 30`
- `active = true`
- `latitude` and `longitude` have values

**Stale Data**:
- `age_minutes > 30` ← Backend will hide coordinates!
- `active = true` but old timestamp
- Coordinates exist in DB but hidden by API

## Quick Checklist

- [ ] Opened browser console (F12)
- [ ] Saw "=== TRACKING DATA FROM BACKEND ===" output
- [ ] Checked "Has GPS" status for user "test"
- [ ] Checked "Last seen" time (should be <30 min)
- [ ] Saw "[MAP] updateMarkers called" message
- [ ] Saw "[MAP] Processing location" for each user
- [ ] If GPS is NO: Employee needs to restart tracking
- [ ] If GPS is YES but no marker: Check zoom level or click employee card
- [ ] Verified mobile app is tracking and has GPS permission

## Expected Console Output (Healthy System)

```
=== TRACKING DATA FROM BACKEND ===
[0] test:
  - Active: true
  - Has GPS: YES (lat: 19.0760, lng: 72.8777)  ✓ GOOD!
  - Last seen: 2 min ago                        ✓ RECENT!
===================================

Updating markers in WebView, count: 7
[MAP] updateMarkers called with 7 locations
[MAP] Processing location 0 : test - Active: true - GPS: 19.0760 72.8777
[MAP] ✓ Added marker for test at 19.0760 72.8777  ✓ SUCCESS!
[MAP] Markers update complete: Added 1 Skipped 6
```

If you see this, markers should be visible on map!

## Still Not Working?

1. **Screenshot console output** and share
2. **Check if marker exists but is off-screen** - try clicking employee card
3. **Verify mobile app** is actually sending location updates
4. **Check backend logs** for incoming GPS updates
5. **Try with different employee** who recently updated location

## Contact Support

If issue persists, provide:
1. Full console output (copy/paste)
2. Screenshot of Live Tracking screen
3. Mobile app screenshot showing tracking status
4. Time when tracking was last started
