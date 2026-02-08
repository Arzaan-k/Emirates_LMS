# Admin Reports Filter Enhancement

## Overview
Replaced free-text inputs for "Role" and "Store" filters in the Reports & Analytics screen with selectable dropdowns (modal pickers) populated with real data from the backend.

## Changes

### Frontend: `Screens/AdminReports.js`
- **New State**: Added `availableRoles` and `availableStores` to store fetched options.
- **Data Fetching**: Added `fetchFilterOptions` to retrieve roles from `/api/v1/levels/` and stores from `/api/v1/users/stores/all` on component mount.
- **UI Update**:
  - Replaced `TextInput` for "Role" and "Store" with `TouchableOpacity` buttons that mimic dropdowns.
  - Implemented `renderPickerModal`: A reusable modal component containing a searchable `FlatList` of options.
  - Added new styles for `selectBtn`, `pickerModal`, and related elements.

## Usage
1. Go to "Reports & Analytics".
2. Click "Filters".
3. Tap on "Select Role" or "Select Store".
4. A modal appears with a list of available options.
5. Select an option to apply it to the filter.
6. Click "Apply Filters" to refresh the report data.

## Completed Subtasks
- [x] Integrate Date Picker for date range.
- [x] Add Data Headers filters (Search, Min Score).
- [x] Update Filter Application Logic (Frontend & Backend).
- [x] Refine UI/UX (Styles fixed).
- [x] Implement New Filters in UI (Region, City, Country, User Type)
- [x] Backend Integration for New Filters
- [x] Data Model Considerations (Using profile_data)
- [x] Update Download CSV/PDF logic
- [x] Compact UI Design

## Status
Completed
