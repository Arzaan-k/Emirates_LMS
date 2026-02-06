# 🔄 Bulk Upload Data Flow Diagram

## Complete System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER INTERFACE                            │
│  Schedule Exam Modal - Step 2: Select Participants              │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  📤 Bulk Upload Users                                     │  │
│  ├───────────────────────────────────────────────────────────┤  │
│  │  Upload Excel or CSV file with employee codes             │  │
│  │                                                             │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │  [Choose File] or [Upload Another File]             │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  │                                                             │  │
│  │  ✅ employees.xlsx                                         │  │
│  │  12 users added to selection                              │  │
│  │                                                             │  │
│  │  💡 File should contain employee codes in first column    │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                   │
│  User clicks "Choose File"                                       │
│                ↓                                                 │
└─────────────────────────────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────────────────────────┐
│                    FILE PICKER (expo-document-picker)            │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Allowed Types:                                                  │
│  - application/vnd.openxmlformats-officedocument.spreadsheetml  │
│  - application/vnd.ms-excel                                      │
│  - text/csv                                                      │
│  - text/comma-separated-values                                   │
│                                                                   │
│  User selects: employees.xlsx                                    │
│                ↓                                                 │
└─────────────────────────────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────────────────────────┐
│                    FILE PARSING (Client-Side)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  IF CSV:                                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 1. Fetch file content as text                            │   │
│  │ 2. Split by newlines                                     │   │
│  │ 3. Detect header row (contains "employee" or "code")     │   │
│  │ 4. Extract first column from each row                    │   │
│  │ 5. Trim whitespace and remove quotes                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                   │
│  IF Excel (.xlsx/.xls):                                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 1. Fetch file as ArrayBuffer                             │   │
│  │ 2. Parse with XLSX.read()                                │   │
│  │ 3. Get first sheet                                       │   │
│  │ 4. Convert to JSON array                                 │   │
│  │ 5. Find "Employee Code" column or use first column       │   │
│  │ 6. Extract codes from identified column                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                   │
│  Result: ["BWCO-0028", "BWCO-0029", "BWCO-0030", ...]          │
│                ↓                                                 │
└─────────────────────────────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────────────────────────┐
│                    HTTP REQUEST TO BACKEND                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  POST /api/v1/users/validate-employee-codes                     │
│                                                                   │
│  Headers:                                                        │
│    Content-Type: application/json                                │
│                                                                   │
│  Body:                                                           │
│  {                                                               │
│    "employee_codes": [                                           │
│      "BWCO-0028",                                                │
│      "BWCO-0029",                                                │
│      "BWCO-0030",                                                │
│      "BWCO-0031",                                                │
│      ...                                                         │
│    ]                                                             │
│  }                                                               │
│                ↓                                                 │
└─────────────────────────────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND API SERVER (FastAPI)                  │
│  Endpoint: /api/v1/users/validate-employee-codes                │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Step 1: Validate Input                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ - Check employee_codes exists                            │   │
│  │ - Check array is not empty                               │   │
│  │ - Trim and normalize codes                               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                ↓                                                 │
│  Step 2: Query Database                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ all_users = db.query(User).all()                         │   │
│  │ # Get all users in single query                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                ↓                                                 │
│  Step 3: Match Employee Codes                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ For each code:                                            │   │
│  │   Try Strategy 1: Profile Data Match                     │   │
│  │     if profile_data.get("employee_code") == code:        │   │
│  │       matched_emails.append(user.email)                  │   │
│  │                                                           │   │
│  │   Try Strategy 2: Email Prefix Match                     │   │
│  │     if email.upper().startswith(code.upper()):           │   │
│  │       matched_emails.append(user.email)                  │   │
│  │                                                           │   │
│  │   Try Strategy 3: Name Match                             │   │
│  │     if code.upper() in name.upper():                     │   │
│  │       matched_emails.append(user.email)                  │   │
│  │                                                           │   │
│  │   If no match:                                            │   │
│  │     not_found_codes.append(code)                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                ↓                                                 │
│  Step 4: Remove Duplicates                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ matched_emails = list(dict.fromkeys(matched_emails))     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                ↓                                                 │
│  Step 5: Build Response                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ return {                                                  │   │
│  │   "matched": matched_emails,                             │   │
│  │   "not_found": not_found_codes,                          │   │
│  │   "matched_count": len(matched_emails),                  │   │
│  │   "not_found_count": len(not_found_codes),               │   │
│  │   "total_codes": len(employee_codes)                     │   │
│  │ }                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                ↓                                                 │
└─────────────────────────────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────────────────────────┐
│                    HTTP RESPONSE                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Status: 200 OK                                                  │
│                                                                   │
│  Body:                                                           │
│  {                                                               │
│    "matched": [                                                  │
│      "malekarroshan2@gmail.com",                                 │
│      "aditya@example.com",                                       │
│      "test@gmail.com",                                           │
│      "manager@store.com"                                         │
│    ],                                                            │
│    "not_found": ["BWCO-9999"],                                   │
│    "matched_count": 4,                                           │
│    "not_found_count": 1,                                         │
│    "total_codes": 5                                              │
│  }                                                               │
│                ↓                                                 │
└─────────────────────────────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND STATE UPDATE                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Step 1: Extract Matched Emails                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ const matchedEmails = data.matched                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                ↓                                                 │
│  Step 2: Merge with Existing Selection (Cumulative)             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ const newUsers = [                                        │   │
│  │   ...new Set([                                            │   │
│  │     ...selectedUsers,      // Existing selection         │   │
│  │     ...matchedEmails       // New matched users          │   │
│  │   ])                                                      │   │
│  │ ]                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                ↓                                                 │
│  Step 3: Update State                                           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ setSelectedUsers(newUsers)                               │   │
│  │ setUploadedFileName(file.name)                           │   │
│  │ setUploadedUsersCount(data.matched_count)                │   │
│  └─────────────────────────────────────────────────────────┘   │
│                ↓                                                 │
│  Step 4: Show Feedback                                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Alert.alert(                                              │   │
│  │   'Bulk Upload Success',                                 │   │
│  │   `✅ Matched ${matched_count} users\n` +                │   │
│  │   `⚠️ ${not_found_count} codes not found`               │   │
│  │ )                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                ↓                                                 │
└─────────────────────────────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────────────────────────┐
│                    UI RE-RENDER                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. Upload Success Box Appears:                                 │
│     ┌────────────────────────────────────────────────┐         │
│     │ ✅ employees.xlsx                              │ [X]     │
│     │ 4 users added to selection                     │         │
│     └────────────────────────────────────────────────┘         │
│                                                                   │
│  2. User Count Updates:                                          │
│     "12 users selected" → Updates dynamically                   │
│                                                                   │
│  3. User List Checkboxes Update:                                │
│     ☑️ Roshan Malekar (malekarroshan2@gmail.com)               │
│     ☑️ Aditya User (aditya@example.com)                        │
│     ☑️ Test User (test@gmail.com)                              │
│     ☑️ Store Manager (manager@store.com)                       │
│     ☐ Other User (other@example.com)                           │
│                                                                   │
│  4. Button Text Changes:                                         │
│     "Choose File" → "Upload Another File"                       │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📊 Data Flow Examples

### Example 1: Successful Upload

```
USER ACTION:
  Upload file: employees.xlsx
  Contains: BWCO-0028, BWCO-0029, BWCO-0030

FILE PARSING:
  ✅ Read 3 employee codes

API REQUEST:
  POST /validate-employee-codes
  Body: {"employee_codes": ["BWCO-0028", "BWCO-0029", "BWCO-0030"]}

DATABASE MATCHING:
  BWCO-0028 → malekarroshan2@gmail.com ✅
  BWCO-0029 → aditya@example.com ✅
  BWCO-0030 → test@gmail.com ✅

API RESPONSE:
  {
    "matched": ["malekarroshan2@gmail.com", "aditya@example.com", "test@gmail.com"],
    "not_found": [],
    "matched_count": 3,
    "not_found_count": 0
  }

UI UPDATE:
  ✅ 3 users auto-selected
  ✅ Success box shows: "employees.xlsx - 3 users added"
  ✅ User list checkboxes updated
```

---

### Example 2: Partial Match

```
USER ACTION:
  Upload file: mixed_codes.csv
  Contains: BWCO-0028, INVALID-999, BWCO-0029

FILE PARSING:
  ✅ Read 3 employee codes

API REQUEST:
  POST /validate-employee-codes
  Body: {"employee_codes": ["BWCO-0028", "INVALID-999", "BWCO-0029"]}

DATABASE MATCHING:
  BWCO-0028 → malekarroshan2@gmail.com ✅
  INVALID-999 → No match ❌
  BWCO-0029 → aditya@example.com ✅

API RESPONSE:
  {
    "matched": ["malekarroshan2@gmail.com", "aditya@example.com"],
    "not_found": ["INVALID-999"],
    "matched_count": 2,
    "not_found_count": 1
  }

UI UPDATE:
  ✅ 2 users auto-selected
  ⚠️ Alert shows: "Successfully matched 2 users\n1 employee code not found"
  ✅ Success box shows: "mixed_codes.csv - 2 users added"
```

---

### Example 3: Cumulative Upload

```
INITIAL STATE:
  selectedUsers = ["user1@example.com", "user2@example.com"]
  Count: 2 users

FIRST UPLOAD:
  File: batch1.xlsx
  Matched: ["user3@example.com", "user4@example.com"]
  New selection: ["user1", "user2", "user3", "user4"] → 4 users

SECOND UPLOAD:
  File: batch2.xlsx
  Matched: ["user5@example.com", "user3@example.com"]  // user3 is duplicate
  New selection: ["user1", "user2", "user3", "user4", "user5"] → 5 users
  Note: user3 not duplicated due to Set deduplication

RESULT:
  Total: 5 unique users selected
  Files uploaded: 2
  Total matched: 6 (1 duplicate removed)
```

---

### Example 4: Integration with Smart Categories

```
INITIAL STATE:
  selectedUsers = []
  Count: 0 users

STEP 1: Select Smart Category
  User clicks: "All Wafflers" category
  Matched: ["waffler1@ex.com", "waffler2@ex.com", "waffler3@ex.com"]
  Selection: 3 users

STEP 2: Bulk Upload
  Upload file: exam_candidates.xlsx
  Matched: ["waffler2@ex.com", "new1@ex.com", "new2@ex.com"]
  Merge: 3 existing + 2 new (waffler2 already selected)
  Selection: 5 users

STEP 3: Manual Selection
  User manually selects: "manual@ex.com"
  Selection: 6 users

FINAL STATE:
  Total: 6 unique users
  Sources:
    - Smart Category: 3 users
    - Bulk Upload: 2 new users
    - Manual: 1 user
```

---

## 🔐 Security Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    SECURITY CHECKPOINTS                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. File Type Validation (Client)                               │
│     ┌──────────────────────────────────────────────────────┐   │
│     │ Only allow: .xlsx, .xls, .csv                         │   │
│     │ Reject all other file types                           │   │
│     └──────────────────────────────────────────────────────┘   │
│                ↓                                                 │
│  2. Input Sanitization (Client)                                 │
│     ┌──────────────────────────────────────────────────────┐   │
│     │ Trim whitespace from codes                            │   │
│     │ Remove quotes and special characters                  │   │
│     │ Filter empty codes                                    │   │
│     └──────────────────────────────────────────────────────┘   │
│                ↓                                                 │
│  3. Request Validation (Server)                                 │
│     ┌──────────────────────────────────────────────────────┐   │
│     │ Check employee_codes array exists                     │   │
│     │ Check array is not empty                              │   │
│     │ Return 400 if invalid                                 │   │
│     └──────────────────────────────────────────────────────┘   │
│                ↓                                                 │
│  4. Database Query Safety (Server)                              │
│     ┌──────────────────────────────────────────────────────┐   │
│     │ Use SQLAlchemy ORM (prevents SQL injection)          │   │
│     │ Parameterized queries                                 │   │
│     │ No raw SQL                                            │   │
│     └──────────────────────────────────────────────────────┘   │
│                ↓                                                 │
│  5. No File Storage (Server)                                    │
│     ┌──────────────────────────────────────────────────────┐   │
│     │ Files never saved to disk                             │   │
│     │ Processed in memory only                              │   │
│     │ Automatic cleanup after processing                    │   │
│     └──────────────────────────────────────────────────────┘   │
│                ↓                                                 │
│  6. Error Message Safety (Server)                               │
│     ┌──────────────────────────────────────────────────────┐   │
│     │ Don't leak sensitive data in errors                   │   │
│     │ Generic error messages to client                      │   │
│     │ Detailed errors only in server logs                   │   │
│     └──────────────────────────────────────────────────────┘   │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## ⚡ Performance Optimization

```
┌─────────────────────────────────────────────────────────────────┐
│                    PERFORMANCE STRATEGIES                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. Client-Side Parsing                                         │
│     ✅ Parse Excel/CSV on device                                │
│     ✅ Only send employee codes to server (not entire file)     │
│     ✅ Reduces network payload                                  │
│                                                                   │
│  2. Single Database Query                                        │
│     ✅ Fetch all users once: db.query(User).all()               │
│     ✅ No N+1 query problem                                     │
│     ✅ In-memory matching                                        │
│                                                                   │
│  3. Efficient Matching Algorithm                                │
│     ✅ O(n*m) worst case (n=codes, m=users)                     │
│     ✅ Early exit on first match                                │
│     ✅ Case-insensitive comparisons                             │
│                                                                   │
│  4. Duplicate Removal                                            │
│     ✅ Use Set for O(1) deduplication                           │
│     ✅ Preserve insertion order                                 │
│                                                                   │
│  5. UI Rate Limiting                                             │
│     ✅ Disable button during processing                         │
│     ✅ Show loading spinner                                     │
│     ✅ Prevent concurrent uploads                               │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘

ESTIMATED PERFORMANCE:
  - 100 codes: ~2 seconds
  - 500 codes: ~5 seconds
  - 1000 codes: ~10 seconds
  - 5000 codes: ~30 seconds
```

---

## 🎯 Error Handling Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    ERROR SCENARIOS                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ERROR 1: User Cancels File Picker                              │
│    ┌──────────────────────────────────────────────────────┐    │
│    │ result.canceled === true                              │    │
│    │ → Silently return, no error shown                     │    │
│    │ → setProcessingUpload(false)                          │    │
│    └──────────────────────────────────────────────────────┘    │
│                                                                   │
│  ERROR 2: Invalid File Format                                   │
│    ┌──────────────────────────────────────────────────────┐    │
│    │ File not .xlsx/.xls/.csv                              │    │
│    │ → Alert: "Please select Excel or CSV file"           │    │
│    │ → setProcessingUpload(false)                          │    │
│    └──────────────────────────────────────────────────────┘    │
│                                                                   │
│  ERROR 3: No Employee Codes Found                               │
│    ┌──────────────────────────────────────────────────────┐    │
│    │ employeeCodes.length === 0                            │    │
│    │ → Alert: "No employee codes found in file"           │    │
│    │ → setProcessingUpload(false)                          │    │
│    └──────────────────────────────────────────────────────┘    │
│                                                                   │
│  ERROR 4: Backend Connection Failed                             │
│    ┌──────────────────────────────────────────────────────┐    │
│    │ fetch() throws network error                          │    │
│    │ → Alert: "Failed to connect to server"               │    │
│    │ → setProcessingUpload(false)                          │    │
│    └──────────────────────────────────────────────────────┘    │
│                                                                   │
│  ERROR 5: Backend Validation Failed                             │
│    ┌──────────────────────────────────────────────────────┐    │
│    │ response.status !== 200                               │    │
│    │ → Alert: "Validation failed: {status}"               │    │
│    │ → setProcessingUpload(false)                          │    │
│    └──────────────────────────────────────────────────────┘    │
│                                                                   │
│  ERROR 6: No Matches Found                                      │
│    ┌──────────────────────────────────────────────────────┐    │
│    │ data.matched.length === 0                             │    │
│    │ → Alert: "None of the codes matched any users"       │    │
│    │ → No state update                                     │    │
│    │ → setProcessingUpload(false)                          │    │
│    └──────────────────────────────────────────────────────┘    │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

**Complete data flow documented! 📊**
