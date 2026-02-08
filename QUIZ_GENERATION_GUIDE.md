# Quiz/Question Generation & Bulk Upload Guide

## ✅ Features Available

### 1. AI Question Generation (Working!)
**Status**: ✅ **WORKING** (Backend tested successfully)

**Location**: Step 3 (Questions) in Schedule Exam Modal

**How to Use**:
1. Go to Step 3 (Questions)
2. Find the "🤖 Generate with AI" section at the top
3. Enter a topic (e.g., "Food Safety Standards")
4. Enter number of questions (e.g., 10)
5. Click "Generate" button
6. Wait 5-10 seconds
7. Questions will appear in the list below

**Powered By**: Groq API (Fast & Free)
- Model: llama-3.3-70b-versatile
- Generates high-quality multiple-choice questions
- Includes explanations for each answer

**Example**:
- **Topic**: "Food Safety"
- **Num Questions**: 5
- **Result**: 5 multiple-choice questions with 4 options each

**Backend Test (Successful)**:
```bash
curl -X POST "http://localhost:8000/api/v1/assessments/generate-questions" \
  -F "topic=Food Safety" \
  -F "num_questions=2" \
  -F "difficulty=easy"

# Response: ✅ Generated 2 questions about food safety
```

---

### 2. Bulk Upload (Excel Import) - Already Implemented!
**Status**: ✅ **WORKING**

**Location**: Step 3 (Questions) in Schedule Exam Modal

**How to Use**:
1. Go to Step 3 (Questions)
2. Click "ℹ️ View Format" to see Excel format guide
3. Click "📊 Import Excel" button
4. Select your Excel/CSV file
5. Questions automatically imported

**Supported Formats**:
- `.xlsx` (Excel 2007+)
- `.xls` (Excel 97-2003)
- `.csv` (Comma Separated Values)

**Excel Format**:

**Option A: With Headers** (Recommended)
```
| Question                  | Option1 | Option2 | Option3 | Option4 | CorrectAnswer |
|---------------------------|---------|---------|---------|---------|---------------|
| What is 2+2?              | 3       | 4       | 5       | 6       | 2             |
| Capital of France?        | London  | Paris   | Berlin  | Rome    | 2             |
```

**Option B: Without Headers**
```
| Col A              | Col B | Col C | Col D | Col E | Col F |
|--------------------|-------|-------|-------|-------|-------|
| What is 2+2?       | 3     | 4     | 5     | 6     | 1     |
| Capital of France? | London| Paris | Berlin| Rome  | 1     |
```

**Column Mapping**:
- Column 1: Question Text
- Column 2: Option 1
- Column 3: Option 2
- Column 4: Option 3
- Column 5: Option 4
- Column 6: Correct Option Index
  - **With headers**: 1-based index (1, 2, 3, 4)
  - **Without headers**: 0-based index (0, 1, 2, 3)

**Sample Excel Template**:

Download template: Create an Excel file with these questions:

```excel
Question,Option1,Option2,Option3,Option4,CorrectAnswer
What is the freezing point of water?,0°C,32°C,100°C,212°C,1
Which gas do plants absorb?,Oxygen,Nitrogen,Carbon Dioxide,Hydrogen,3
How many continents are there?,5,6,7,8,3
What is the largest ocean?,Atlantic,Indian,Arctic,Pacific,4
```

---

### 3. Load Sample Questions
**Status**: ✅ **WORKING**

**How to Use**:
1. Go to Step 3 (Questions)
2. Click "Load Sample" button
3. 5 sample questions about food safety loaded instantly

**Use Cases**:
- Quick testing
- Template for creating your own questions
- Demo purposes

---

## 🧪 Testing All Features

### Test 1: AI Generation
1. Open Schedule Exam Modal
2. Go to Step 3
3. Enter topic: "Customer Service"
4. Enter num questions: 3
5. Click "Generate"
6. **Expected**: 3 questions appear after 5-10 seconds
7. **Verify**: Each question has 4 options and one is marked correct

### Test 2: Excel Import
1. Create Excel file with format above
2. Save as `quiz_questions.xlsx`
3. Go to Step 3 in Schedule Exam Modal
4. Click "Import Excel"
5. Select your file
6. **Expected**: Success message "Imported X questions from Excel"
7. **Verify**: Questions appear in the list

### Test 3: Sample Questions
1. Go to Step 3
2. Click "Load Sample"
3. **Expected**: Immediate success message
4. **Verify**: 5 food safety questions added

---

## 🔧 Troubleshooting

### AI Generation Not Working?

**Issue**: "AI generation failed" error

**Solutions**:

1. **Check API Key**:
```bash
# In backend/.env
GROQ_API_KEY=gsk_...  # Should not be empty
```

2. **Check Backend Logs**:
```bash
# Look for errors in terminal
ERROR - Quiz generation error: ...
```

3. **Test Backend Directly**:
```bash
curl -X POST "http://localhost:8000/api/v1/assessments/generate-questions" \
  -F "topic=Test Topic" \
  -F "num_questions=2"
```

4. **Common Fixes**:
   - Backend not running → Start with `uvicorn app.main:app --reload`
   - API key expired → Get new key from groq.com
   - Rate limited → Wait 1 minute and try again

---

### Excel Import Not Working?

**Issue**: "Failed to parse Excel file"

**Solutions**:

1. **Check File Format**:
   - Use `.xlsx` or `.xls` format
   - CSV should be comma-separated
   - No special characters in file name

2. **Check Column Names**:
   - With headers: Use exact names (Question, Option1-4, CorrectAnswer)
   - Without headers: Columns in correct order

3. **Check Correct Answer Format**:
   - Should be a number (1, 2, 3, or 4)
   - Not text like "Option B"
   - Not empty

4. **Check for Empty Rows**:
   - Remove any empty rows at the end
   - Each row must have all 6 columns filled

**Sample Working Excel**:
```
Question                | Option1 | Option2 | Option3 | Option4 | CorrectAnswer
What is 2+2?            | 3       | 4       | 5       | 6       | 2
What is the color of sky| Red     | Blue    | Green   | Yellow  | 2
```

---

### No Immediate Feedback?

**Issue**: Button click but nothing happens

**Solution**: Look for:
1. **Loading indicator**: Button shows spinner while processing
2. **Console logs**: Open Developer Tools → Console
3. **Error alerts**: Red alert boxes with error messages
4. **Success alerts**: Green success messages

**Add More Feedback** (If needed):
```javascript
// In generateQuestionsAI function:
console.log('[AI] Starting generation for topic:', aiTopic);
console.log('[AI] Response received:', data);
console.log('[AI] Questions generated:', qList.length);
```

---

## 📊 Comparison of Methods

| Feature | AI Generate | Excel Import | Sample Load |
|---------|------------|--------------|-------------|
| **Speed** | 5-10 seconds | Instant | Instant |
| **Quantity** | 1-50 questions | Unlimited | 5 questions |
| **Customization** | Topic-based | Full control | Fixed |
| **Quality** | High (AI) | Depends on input | High |
| **Effort** | Low | Medium | None |
| **Best For** | Quick content | Bulk upload | Testing |

---

## 💡 Best Practices

### For AI Generation:
1. **Be Specific**: "Food Safety in Restaurants" > "Food"
2. **Reasonable Quantity**: 5-20 questions at a time
3. **Review Generated**: Always review AI questions before using
4. **Edit if Needed**: Click question to edit any part

### For Excel Import:
1. **Use Template**: Create one good template, reuse it
2. **Validate First**: Check in Excel before importing
3. **Test Small**: Import 2-3 questions first to verify format
4. **Backup**: Keep original Excel files

### For Sample Questions:
1. **Edit to Fit**: Use as starting point, modify as needed
2. **Delete Unwanted**: Remove questions you don't need
3. **Add More**: Combine with AI or import more

---

## 🚀 Quick Start Guide

### Scenario 1: "I need 10 questions about a topic quickly"
**Use**: AI Generation
1. Topic: "Your Topic"
2. Num: 10
3. Click Generate
4. Review and done!

### Scenario 2: "I have 100 questions in Excel"
**Use**: Excel Import
1. Format Excel properly
2. Import
3. Done!

### Scenario 3: "I want to test the exam feature"
**Use**: Sample Questions
1. Click "Load Sample"
2. Done!

### Scenario 4: "I want 50 questions with specific wording"
**Use**: Combination
1. AI Generate 20 questions (base)
2. Excel Import 30 specific questions
3. Edit as needed
4. Total: 50 questions!

---

## 🎯 Success Criteria

✅ AI Generation Working:
- Enter topic → Click Generate → See questions in 5-10 seconds

✅ Excel Import Working:
- Select file → See "Imported X questions" → Questions appear

✅ Sample Load Working:
- Click button → Instant success → 5 questions added

---

## 📝 Excel Template

Create this file and save as `exam_questions_template.xlsx`:

```
Question,Option1,Option2,Option3,Option4,CorrectAnswer
What is 2+2?,3,4,5,6,2
What is the capital of France?,London,Paris,Berlin,Rome,2
How many days in a week?,5,6,7,8,3
What is the boiling point of water?,0°C,50°C,100°C,200°C,3
Which planet is closest to the sun?,Venus,Earth,Mercury,Mars,3
```

Save and import this to test!

---

## 🔍 Backend API Details

### Generate Questions Endpoint

**URL**: `POST /api/v1/assessments/generate-questions`

**Parameters**:
- `topic`: string (required) - Topic for questions
- `num_questions`: int (default: 10) - Number to generate
- `difficulty`: string (default: "medium") - easy/medium/hard

**Response**:
```json
{
  "questions": [
    {
      "question": "What is ...?",
      "options": ["A", "B", "C", "D"],
      "correctIndex": 1,
      "explanation": "Because ..."
    }
  ]
}
```

**Model**: Groq llama-3.3-70b-versatile
**Average Time**: 3-8 seconds
**Max Questions**: 50 per request

---

## ✅ Status Summary

| Feature | Status | Notes |
|---------|--------|-------|
| AI Generation | ✅ Working | Backend tested OK |
| Excel Import | ✅ Working | Fully implemented |
| Sample Load | ✅ Working | 5 questions |
| CSV Import | ✅ Working | Same as Excel |
| Manual Add | ✅ Working | Add one by one |
| Edit Questions | ✅ Working | Click to edit |
| Delete Questions | ✅ Working | Trash icon |

**All features are working!** 🎉

---

**Last Updated**: February 8, 2026
**Status**: All Features Operational
