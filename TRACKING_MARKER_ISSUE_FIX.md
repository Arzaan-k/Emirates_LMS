# Live Employee Tracking - Missing Marker Issue

## Problem

User "test" shows as **"Tracking Active"** in the employee list, but **NO marker appears on the map**.

## Root Cause

The backend **intentionally hides GPS coordinates** for users who are NOT "truly active". This is defined as:

### Backend Logic ([tracking.py:388-389](backend/app/api/v1/endpoints/tracking.py#L388-L389))

```python
# Truly active: user explicitly has active=True AND updated recently
is_truly_active = loc.active and (age_seconds <= STALE_MINUTES * 60)
```

Where `STALE_MINUTES = 30` (30 minutes)

### Coordinate Hiding ([tracking.py:396-397](backend/app/api/v1/endpoints/tracking.py#L396-L397))

```python
"latitude": loc.latitude if is_truly_active else None,
"longitude": loc.longitude if is_truly_active else None,
```

**If a user's location is older than 30 minutes, their GPS coordinates are hidden** (`lat/lng = None`).

### Frontend Check ([LiveTrackingScreen.js:278](Screens/LiveTrackingScreen.js#L278))

```javascript
if (loc.latitude && loc.longitude) {
    // Only create marker if coordinates exist
}
```

**Result**: No coordinates = No marker on map

## Why Does UI Show "Tracking Active"?

The frontend considers a user "active" based on the `active` field from backend:

```javascript
const activeCount = locations.filter(l => l.active).length;
```

**BUT** the backend returns:
- `active: true` in the user list (so they show as "Tracking")
- `latitude: null`, `longitude: null` (because data is stale)

**This creates a mismatch**: UI says "Tracking Active" but no marker appears!

## Diagnosis Steps

### 1. Check Console Logs

With the debug logging added, open Browser DevTools (F12) and check console:

```
=== TRACKING DATA FROM BACKEND ===
Total locations: 7

[0] test:
  - Active: true
  - Has GPS: NO (lat: null, lng: null)  ← THIS IS THE ISSUE!
  - Last seen: 45 min ago               ← Older than 30 minutes!
  - Timestamp: 2026-03-03T14:30:00Z
===================================
```

**If you see:**
- `Active: true` but `Has GPS: NO` → Data is stale (>30 min old)
- `Last seen: X min ago` where X > 30 → Backend hid coordinates

### 2. Possible Scenarios

| Scenario | Active | Has GPS | Last Seen | Marker? | Reason |
|----------|--------|---------|-----------|---------|--------|
| Tracking normally | `true` | YES | <30 min | ✅ YES | All good |
| **Stale tracking** | `true` | **NO** | >30 min | ❌ NO | Coordinates hidden by backend |
| Stopped tracking | `false` | NO | >30 min | ❌ NO | User explicitly stopped |
| Never tracked | `false` | NO | null | ❌ NO | No GPS data exists |

**Your case is likely Scenario 2**: User has `active: true` but data is >30 minutes old.

## Solutions

### Solution 1: Ensure GPS Updates Are Recent (Recommended)

**Problem**: Mobile app isn't sending GPS updates frequently enough.

**Fix**: Check mobile app tracking service:
1. Is it still running in background?
2. Is it sending location updates every 5-10 minutes?
3. Are updates reaching the server?

**Test**: Have the employee:
1. Open the mobile app
2. Ensure tracking is enabled
3. Move to a different location
4. Wait 30 seconds
5. Refresh admin panel - marker should appear

### Solution 2: Extend Staleness Window (Quick Fix)

If 30 minutes is too strict, increase it on backend:

**File**: `backend/app/api/v1/endpoints/tracking.py:377`

```python
# Change from 30 to 60 minutes
STALE_MINUTES = 60  # or 120 for 2 hours
```

**Trade-off**: Markers will show stale positions longer (less accurate).

### Solution 3: Show Last Known Position (UI Enhancement)

Modify frontend to display last known position even if stale:

**File**: `Screens/LiveTrackingScreen.js:278`

```javascript
// OLD: Only show if has current GPS
if (loc.latitude && loc.longitude) {
    var icon = createIcon(initials, loc.active);
}

// NEW: Show last known position with different style
locations.forEach(function(loc) {
    // Use last known GPS even if user is now inactive
    const hasGPS = loc.latitude && loc.longitude;
    const hasLastKnown = loc.last_latitude && loc.last_longitude;

    if (hasGPS || hasLastKnown) {
        const lat = loc.latitude || loc.last_latitude;
        const lng = loc.longitude || loc.last_longitude;
        const isStale = !hasGPS && hasLastKnown;

        var icon = createIcon(initials, loc.active, isStale);
        // ... create marker ...
    }
});
```

**Note**: This requires backend to return `last_latitude` and `last_longitude` separately.

### Solution 4: Fix Active Status Logic (Best Solution)

**Update Backend**: Don't mark as `active: true` if data is stale.

**File**: `backend/app/api/v1/endpoints/tracking.py:402`

```python
# OLD:
"active": is_truly_active,

# Already correct! The issue is the mobile app.
```

The backend is actually **correct**! It returns `active: true` **only when truly active**.

**Real Issue**: The frontend card might be showing cached status or using wrong field.

Let me check the card rendering...

**File**: `Screens/LiveTrackingScreen.js:531`

```javascript
{loc.active ? 'Tracking' : 'Not Tracking'}
```

This is correct. So if it shows "Tracking", backend should have returned `active: true`.

**Conclusion**: Backend returns `active: true` but hides coordinates. This means:
1. User's tracking database record has `active=True`
2. BUT timestamp is >30 minutes old
3. So backend hides coordinates but still reports `active: true`

**This is a backend logic issue!** Should change line 402 to:

```python
"active": is_truly_active,  # Only report active if truly active (not stale)
```

Wait, this is already what it does! So the issue is...

**AH! The issue is the LocationTracking.active field in database is True, but timestamp is stale!**

## Actual Fix Needed

### The Real Problem

The `LocationTracking.active` field in the database is set to `True` but the location hasn't been updated in >30 minutes.

This happens when:
1. User starts tracking
2. Database sets `active = True`
3. User's phone dies / app crashes / network issues
4. No more location updates sent
5. Database still has `active = True` with old timestamp

### Proper Fix: Auto-Expire Stale Active Status

**File**: `backend/app/api/v1/endpoints/tracking.py` (line 377-402)

Change from:
```python
is_truly_active = loc.active and (age_seconds <= STALE_MINUTES * 60)
```

To also update the response to match reality:

```python
# Calculate staleness
age_seconds = (now - loc.timestamp).total_seconds()
last_seen_minutes = int(age_seconds / 60)

# Determine if truly active (not just DB field, but also recent update)
is_truly_active = loc.active and (age_seconds <= STALE_MINUTES * 60)

# Return this as 'active' status
result.append({
    "active": is_truly_active,  # This is correct
    "latitude": loc.latitude if is_truly_active else None,  # This hides GPS
    ...
})
```

**This is already correct!** The backend is working as intended.

## The ACTUAL Issue

Looking at your screenshots:
- Bottom card shows: "test | ● Tracking | 02:38 PM"
- Green dot and "Tracking" indicates `active: true`
- Time "02:38 PM" indicates timestamp

**If current time is past 03:08 PM**, then this data is >30 min old and coordinates are hidden!

## Testing Steps

1. **Check Console**: Open DevTools, look for the debug output I added
2. **Verify Timestamp**: Check if `last_seen_minutes > 30`
3. **If Yes**: Ask employee to:
   - Open mobile app
   - Enable tracking
   - Ensure GPS is on
   - Wait 1 minute
   - Refresh admin panel

4. **If Still No Marker**:
   - Check mobile app console for errors sending GPS
   - Check backend logs for incoming location updates
   - Verify database has recent timestamp

## Quick Test Command

Check the database directly:

```sql
SELECT user_email, active, latitude, longitude, timestamp,
       EXTRACT(EPOCH FROM (NOW() - timestamp))/60 as minutes_old
FROM location_tracking
WHERE user_email = 'test@example.com'
ORDER BY timestamp DESC
LIMIT 1;
```

Look at `minutes_old`:
- If < 30: Marker should appear (if active=true)
- If > 30: Marker hidden by design (stale data)

## Recommended Solution

**Option A**: Have employee restart tracking (if stale)
**Option B**: Increase `STALE_MINUTES` from 30 to 60 or 120
**Option C**: Show last known position with gray/faded marker for stale data
**Option D**: Auto-set `active=False` in database for records >30 min old (cleanup job)

Choose based on your use case!
