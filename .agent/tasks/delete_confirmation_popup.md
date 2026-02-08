# Delete Confirmation Popup Implementation

## Overview
Ensured that a confirmation popup appears before deleting User Categories or Display Roles in the "Create User" screen, compatible with both Web and Mobile platforms.

## Changes

### Frontend: `Screens/CreateUser.js`
- **Added `showAlert` Helper**: Created a utility function that uses `window.confirm` on Web and `Alert.alert` on Mobile to display confirmation dialogs.
- **Updated `handleDeleteCategory`**: Replaced direct `Alert.alert` calls with `showAlert` to ensure web compatibility.
- **Updated `handleDeleteRole`**: Replaced direct `Alert.alert` calls with `showAlert` to ensure web compatibility.

## Usage
1. User clicks the 'x' icon on a Category or Role chip.
2. A popup asks "Are you sure you want to delete...?"
3. On Web: Browser confirmation dialog appears (OK/Cancel).
4. On Mobile: Native Alert dialog appears (Delete/Cancel).
5. Deletion proceeds only if confirmed.
