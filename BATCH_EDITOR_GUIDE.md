# 📋 Batch Editor - Complete User Guide

**Version:** 2.0.0
**Status:** ✅ Fully Implemented
**Date:** 2026-02-07

---

## 🎯 Overview

The Batch Editor allows you to create and manage exam batches with complete control over:
- **Per-batch dates** - Different exam dates for each batch
- **Per-batch times** - Different time windows
- **Per-batch locations** - Different exam centers/rooms
- **Per-batch supervisors** - Different supervisors
- **Manual user assignment** - Add/remove users freely
- **Capacity management** - Set max users per batch

---

## 📱 How to Use

### Step 1: Access Batch Configuration

1. Open **Schedule Exam** modal
2. Navigate to **Step 2: Select Participants**
3. You'll see the **Batch Configuration** section

### Step 2: Configure Batches

**Set Number of Batches:**
- Click the "Batches" dropdown
- Select 1-10 batches

**Auto-Distribute Users:**
- Click "Auto" button to automatically distribute selected users across batches
- Or set "Users/Batch" to a specific number

**Result:** Batch cards appear showing each batch

---

### Step 3: View Batch Cards

Each batch card displays:

```
┌─────────────────────────────────────┐
│ Batch 1              6/10    [Edit] │
├─────────────────────────────────────┤
│ 📅 2026-02-10                       │
│ 🕐 09:00 - 10:00                    │
│ 📍 Mumbai Training Center           │
│ 👤 Rajesh Kumar                     │
├─────────────────────────────────────┤
│ Amit | Priya | Ravi | +3 more      │
└─────────────────────────────────────┘
```

**Card Shows:**
- Batch number
- Assigned/Max users count
- **Edit button** - Opens full editor
- Date
- Time window
- Location
- Supervisor name
- User preview (first 5 + count)

---

### Step 4: Edit Batch Details

**Click "Edit"** on any batch card to open the **Batch Editor**

---

## 🔧 Batch Editor Features

### 📅 Date & Time Section

**Change Exam Date:**
- Web: HTML5 date picker
- Mobile: Native date picker
- Can set different date for each batch

**Set Time:**
- Start time: Manual input (HH:MM format)
- End time: Auto-calculated based on exam duration

**Example:**
```
Date: 2026-02-10
Start: 09:00
End: 10:00 (auto-calculated)
```

---

### 📍 Location Section

**Custom Location per Batch:**
- Type any location
- Default: Inherits from main exam location
- Can override for each batch

**Examples:**
- "Mumbai Training Center - Room 101"
- "Delhi Office - 2nd Floor"
- "Bangalore Hub - Conference Room A"

---

### 👤 Supervisor Section

**Assign Supervisor:**
- Horizontal scrollable list
- Shows all managers/supervisors
- Visual chips with avatars
- Click to select
- Each batch can have different supervisor

**Appears as:**
```
[👤 Rajesh Kumar] [👤 Priya Sharma] [👤 Arun Reddy]
       Active          Available        Available
```

---

### 👥 Capacity Management

**Set Max Users:**
- Input maximum number of users for this batch
- Prevents over-assignment
- Shows current: `6/10` (6 assigned, 10 max)

---

### 👤 Assigned Users Section

**View All Users in This Batch:**

```
┌─────────────────────────────────────┐
│ Assigned Users (6/10)               │
├─────────────────────────────────────┤
│ A  Amit Kumar               [❌]    │
│    amit@example.com                 │
├─────────────────────────────────────┤
│ P  Priya Sharma             [❌]    │
│    priya@example.com                │
├─────────────────────────────────────┤
│ R  Ravi Patel               [❌]    │
│    ravi@example.com                 │
└─────────────────────────────────────┘
```

**Features:**
- See all assigned users
- View name and email
- **Remove user:** Click ❌ icon
- Changes apply immediately

---

### ➕ Add Users Section

**Manually Add Users:**

```
┌─────────────────────────────────────┐
│ ➕ Add Users from Selection         │
├─────────────────────────────────────┤
│ S  Sanjay Gupta             [➕]    │
│    sanjay@example.com               │
├─────────────────────────────────────┤
│ N  Neha Agarwal             [➕]    │
│    neha@example.com                 │
└─────────────────────────────────────┘
```

**How it Works:**
- Shows all selected users NOT in this batch
- Click ➕ to add user to batch
- Grayed out if batch is full
- Alert if trying to exceed capacity

---

## 💡 Use Cases

### Use Case 1: Multi-City Exam

**Scenario:** Same exam, 3 cities, different dates/supervisors

**Batch 1: Mumbai**
- Date: Feb 10, 2026
- Time: 09:00 - 10:00
- Location: Mumbai Training Center
- Supervisor: Rajesh Kumar
- Users: 8 Mumbai employees (manually selected)

**Batch 2: Delhi**
- Date: Feb 10, 2026
- Time: 14:00 - 15:00
- Location: Delhi Office - Room 202
- Supervisor: Priya Sharma
- Users: 6 Delhi employees (manually selected)

**Batch 3: Bangalore**
- Date: Feb 11, 2026  ← Different date!
- Time: 11:00 - 12:00
- Location: Bangalore Hub
- Supervisor: Arun Reddy
- Users: 10 Bangalore employees (manually selected)

---

### Use Case 2: VIP vs Regular Batches

**Batch 1: VIP Batch**
- Date: Feb 10, 2026
- Time: 09:00 - 10:00
- Location: Executive Conference Room
- Supervisor: Senior Manager
- Users: 5 managers (hand-picked)
- Max: 5

**Batch 2: Regular Batch**
- Date: Feb 10, 2026
- Time: 14:00 - 15:00
- Location: Training Hall
- Supervisor: Regular Supervisor
- Users: 20 employees
- Max: 25

---

### Use Case 3: Staggered Scheduling

**Batch 1: Morning**
- Time: 09:00 - 10:00
- Users: 10 early birds

**Batch 2: Afternoon**
- Time: 14:00 - 15:00
- Users: 10 regular schedule

**Batch 3: Evening**
- Time: 18:00 - 19:00
- Users: 10 late shift workers

All same date, location, supervisor - just different times!

---

## 🎨 Visual Guide

### Main Batch Cards

```
╔═══════════════════════════════════════════════════╗
║  Batch Configuration                              ║
╠═══════════════════════════════════════════════════╣
║                                                   ║
║  Batches: [3 ▼]    Users/Batch: [Auto]  [Auto]  ║
║                                                   ║
║  ┌──────────────────────────────────────────┐   ║
║  │ Batch 1            6/10        [Edit]    │   ║
║  │ 📅 2026-02-10                            │   ║
║  │ 🕐 09:00 - 10:00                         │   ║
║  │ 📍 Mumbai Training Center                │   ║
║  │ 👤 Rajesh Kumar                          │   ║
║  │ Amit | Priya | Ravi | +3                │   ║
║  └──────────────────────────────────────────┘   ║
║                                                   ║
║  ┌──────────────────────────────────────────┐   ║
║  │ Batch 2            6/10        [Edit]    │   ║
║  │ 📅 2026-02-11                            │   ║
║  │ 🕐 14:00 - 15:00                         │   ║
║  │ 📍 Delhi Office                          │   ║
║  │ 👤 Priya Sharma                          │   ║
║  │ Sanjay | Neha | +4                      │   ║
║  └──────────────────────────────────────────┘   ║
║                                                   ║
╚═══════════════════════════════════════════════════╝
```

---

### Batch Editor Modal

```
╔═══════════════════════════════════════════════════╗
║  ✏️  Edit Batch 1                          [X]   ║
╠═══════════════════════════════════════════════════╣
║                                                   ║
║  📅 Date & Time                                   ║
║  ┌──────────────────┐                            ║
║  │ Date: 2026-02-10 │                            ║
║  └──────────────────┘                            ║
║  Start: [09:00]    End: [10:00] (auto)          ║
║                                                   ║
║  📍 Location                                      ║
║  ┌─────────────────────────────────────────┐    ║
║  │ Mumbai Training Center                  │    ║
║  └─────────────────────────────────────────┘    ║
║                                                   ║
║  👤 Supervisor                                    ║
║  [👤 Rajesh] [👤 Priya] [👤 Arun]              ║
║     Active     Available  Available             ║
║                                                   ║
║  👥 Capacity                                      ║
║  Max Users: [10]                                 ║
║                                                   ║
║  👤 Assigned Users (6/10)                        ║
║  ┌────────────────────────────────────────┐     ║
║  │ A  Amit Kumar               [❌]       │     ║
║  │    amit@example.com                    │     ║
║  ├────────────────────────────────────────┤     ║
║  │ P  Priya Sharma             [❌]       │     ║
║  │    priya@example.com                   │     ║
║  └────────────────────────────────────────┘     ║
║                                                   ║
║  ➕ Add Users from Selection                     ║
║  ┌────────────────────────────────────────┐     ║
║  │ S  Sanjay Gupta             [➕]       │     ║
║  │    sanjay@example.com                  │     ║
║  └────────────────────────────────────────┘     ║
║                                                   ║
╠═══════════════════════════════════════════════════╣
║              [✓ Done]                             ║
╚═══════════════════════════════════════════════════╝
```

---

## ⚙️ Advanced Features

### Rebalancing Batches

**Scenario:** Batch 1 has 15 users, Batch 2 has 3

**Solution:**
1. Open Batch 1 editor
2. Remove 6 users (click ❌)
3. Open Batch 2 editor
4. Add those 6 users (click ➕)

**Result:** Batch 1: 9 users, Batch 2: 9 users ✅

---

### Swapping Users Between Batches

**Move User from Batch 1 to Batch 2:**

1. Open Batch 1 editor
2. Find user, click ❌ to remove
3. Click "Done"
4. Open Batch 2 editor
5. Find user in "Add Users" section
6. Click ➕ to add
7. Click "Done"

---

### Capacity Enforcement

**Batch Full Alert:**

If you try to add a user when batch is at max capacity:

```
╔════════════════════════════════╗
║  Batch Full                    ║
╠════════════════════════════════╣
║  This batch has reached its    ║
║  maximum capacity. Increase    ║
║  max users or remove someone   ║
║  first.                        ║
╠════════════════════════════════╣
║            [OK]                ║
╚════════════════════════════════╝
```

**Solution:**
- Increase max users, OR
- Remove someone first

---

## 🚀 Quick Tips

### Tip 1: Use Auto-Distribute First
Start with auto-distribution, then fine-tune manually

### Tip 2: Set Locations Early
Configure batch locations before assigning users so you know which batch is for which city

### Tip 3: Name Pattern
Use clear location names: "CityName - Room/Building"

### Tip 4: Check User Count
Always verify the assigned/max count matches your expectations

### Tip 5: Empty State
If a batch shows "No users assigned", it won't appear on their schedule

---

## ✅ Verification Checklist

Before scheduling the exam:

- [ ] All batches have assigned users
- [ ] No batch exceeds max capacity
- [ ] Each batch has correct date
- [ ] Each batch has correct time window
- [ ] Each batch has correct location
- [ ] Each batch has correct supervisor
- [ ] User distribution makes sense (no duplicates)
- [ ] Total users across all batches = total selected users

---

## 🔧 Troubleshooting

### Issue: Can't add user to batch
**Cause:** Batch is at max capacity
**Solution:** Increase max users or remove someone first

### Issue: User appears in multiple batches
**Cause:** Manual addition without removal
**Solution:** Remove from unwanted batches

### Issue: Batch shows "Not set" for supervisor
**Cause:** No supervisor selected for this batch
**Solution:** Open editor, select supervisor from list

### Issue: Can't see all users
**Cause:** List is scrollable
**Solution:** Scroll down in the assigned/available users list

---

## 📊 Data Flow

### What Gets Saved:

Each batch stores:
```json
{
  "batchNumber": 1,
  "startTime": "09:00",
  "endTime": "10:00",
  "date": "2026-02-10",
  "location": "Mumbai Training Center",
  "supervisorEmail": "rajesh@example.com",
  "supervisorName": "Rajesh Kumar",
  "maxUsers": 10,
  "users": [
    { "email": "amit@ex.com", "name": "Amit Kumar" },
    { "email": "priya@ex.com", "name": "Priya Sharma" }
  ]
}
```

### What Users See:

**Mumbai user (Batch 1):**
- Sees: Feb 10, 09:00, Mumbai Training Center, Rajesh Kumar

**Delhi user (Batch 2):**
- Sees: Feb 11, 14:00, Delhi Office, Priya Sharma

Each user sees ONLY their batch details! ✅

---

## 🎯 Best Practices

1. **Plan First** - Decide batch distribution before selecting users
2. **Consistent Naming** - Use clear, consistent location names
3. **Balanced Distribution** - Try to keep batches roughly equal sized
4. **Verify Before Submit** - Always review in Step 4 before scheduling
5. **Document Batches** - Keep a note of which batch is for which group

---

**All features are fully functional and ready to use!** 🎉
