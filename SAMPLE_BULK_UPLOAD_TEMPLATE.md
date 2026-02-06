# 📋 Sample Bulk Upload Template

## How to Create Your Bulk Upload File

### Option 1: Excel File (.xlsx)

1. Open Microsoft Excel or Google Sheets
2. Create a new spreadsheet
3. Add the following structure:

```
|    A          |       B          |      C        |
|---------------|------------------|---------------|
| Employee Code | Name (Optional)  | Email (Opt.)  |
| BWCO-0028     | Roshan Malekar   | roshan@...    |
| BWCO-0029     | Aditya User      | aditya@...    |
| BWCO-0030     | Test User        | test@...      |
| BWCO-0031     | Store Manager    | manager@...   |
```

4. Save as: `bulk_exam_users.xlsx`

### Option 2: CSV File (.csv)

1. Open Notepad or any text editor
2. Add the following lines:

```csv
Employee Code,Name,Email
BWCO-0028,Roshan Malekar,roshan@example.com
BWCO-0029,Aditya User,aditya@example.com
BWCO-0030,Test User,test@example.com
BWCO-0031,Store Manager,manager@example.com
```

3. Save as: `bulk_exam_users.csv`

### Option 3: Minimal Format (Codes Only)

If you only have employee codes:

```
BWCO-0028
BWCO-0029
BWCO-0030
BWCO-0031
BWCO-0032
```

**No header needed!** Just one code per row in the first column.

---

## ✅ Best Practices

### DO:
- ✅ Put employee codes in the **first column**
- ✅ Use consistent formatting (e.g., BWCO-0028)
- ✅ Remove empty rows
- ✅ Keep file size under 10MB
- ✅ Test with a small sample first (5-10 codes)

### DON'T:
- ❌ Don't put codes in columns B, C, etc.
- ❌ Don't use merged cells
- ❌ Don't include special characters in codes (/, ?, *)
- ❌ Don't leave blank rows between codes
- ❌ Don't use multiple sheets (only first sheet is read)

---

## 🔍 Real Examples

### Example 1: Store-Wide Exam
```
Employee Code
BWCO-0028
BWCO-0029
BWCO-0030
BWCO-0031
BWCO-0032
BWCO-0033
BWCO-0034
BWCO-0035
```
**Result:** 8 users selected for exam

### Example 2: Department Specific
```
Employee Code,Department,Role
BWCO-0028,Operations,ASM
BWCO-0029,Operations,Waffler
BWCO-0030,Operations,Waffler
BWCO-0045,Sales,Manager
BWCO-0046,Sales,Supervisor
```
**Result:** 5 users from mixed departments

### Example 3: Training Batch
```
Employee Code,Batch,Training Date
BWCO-0100,Batch-1,2026-02-10
BWCO-0101,Batch-1,2026-02-10
BWCO-0102,Batch-1,2026-02-10
BWCO-0103,Batch-2,2026-02-15
BWCO-0104,Batch-2,2026-02-15
```
**Result:** 5 users across 2 batches

---

## 🎯 Quick Start Template

Copy-paste this into Excel:

```
Employee Code
BWCO-0028
BWCO-0029
BWCO-0030
```

Then:
1. Replace codes with your actual employee codes
2. Add more rows as needed
3. Save as .xlsx or .csv
4. Upload in Schedule Exam modal

---

## 💡 Tips

### From HR System Export
If you're exporting from another system:

1. **Export as CSV** from HR system
2. **Open in Excel**
3. **Move Employee Code column to position A** (first column)
4. **Save and upload**

### Multiple Locations
For users across multiple stores:

```
Employee Code,Store
BWCO-0028,Mumbai Central
BWCO-0029,Mumbai Central
BWCO-0030,Delhi CP
BWCO-0031,Delhi CP
```

System will match all codes regardless of store column.

### Case Sensitivity
Don't worry about case:
- `BWCO-0028` ✅
- `bwco-0028` ✅
- `Bwco-0028` ✅

All will match the same employee!

---

## ⚠️ Troubleshooting

### "No employee codes found"
**Problem:** Empty file or codes not in first column
**Fix:** Move codes to column A

### "None matched any users"
**Problem:** Employee codes don't exist in system
**Fix:** Verify codes with admin/HR

### "Only 3 out of 10 matched"
**Problem:** Some codes are incorrect or outdated
**Fix:** Check the "not found" list in the alert message

---

## 📥 Download Templates

While we don't have downloadable templates yet, you can create one by:

1. Copy the Quick Start Template above
2. Paste into Excel
3. Save as your template
4. Reuse for future exams

---

**Need Help?** Check the full documentation in `BULK_UPLOAD_FEATURE.md`
