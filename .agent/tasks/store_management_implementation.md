# Store Management Implementation

## Overview
Added capabilities to create and delete stores directly from the "Create User" screen in the admin panel, matching the functionality of User Categories.

## Changes

### Backend: `backend/app/api/v1/endpoints/users.py`
- **Updated `STORES_LIST`**: Converted from a hardcoded constant to a mutable in-memory store `_stores_store`.
- **New Endpoint**: `POST /api/v1/users/stores`
  - Creates a new store with name, city, and region.
- **New Endpoint**: `DELETE /api/v1/users/stores/{store_id}`
  - Deletes a store by ID.
  - Prevents deletion of "HQ" (ID 1).

### Frontend: `Screens/CreateUser.js`
- **Updated State Management**: Added state for new store creation (`showNewStore`, `newStoreName`, `newStoreCity`).
- **Added Handlers**:
  - `handleCreateStore()`: Calls API to create a new store.
  - `handleDeleteStore(store)`: Calls API to delete a store with confirmation popup.
- **UI Enhancements**:
  - Added 'x' (delete) icon buttons to store chips (except HQ).
  - Added "+ New" button to the horizontal store list.
  - Added inline form for creating a new store (Name & City inputs).

## Usage
1. Open "Create User" modal.
2. Scroll to "Store Assignment".
3. **Delete**: Click the 'x' on a store chip (or long press) to delete it. Confirm the popup.
4. **Create**: Click "+ New", enter Store Name and City, then click checkmark to save.
