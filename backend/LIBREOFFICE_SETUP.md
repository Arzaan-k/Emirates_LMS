# Document Conversion Setup Guide

## ✅ NO LibreOffice Required!

The system now uses **pure Python libraries** for document conversion. No external software installation needed!

---

## 🚀 Quick Setup (30 Seconds)

### Install Python Packages
```bash
cd backend
pip install python-pptx python-docx reportlab Pillow
```

**That's it!** The conversion system is ready to use.

---

## 📦 Required Packages

| Package | Purpose |
|---------|---------|
| `python-pptx` | Read PowerPoint files |
| `python-docx` | Read Word documents |
| `reportlab` | Generate PDF files |
| `Pillow` | Process images in slides |

### Install All at Once
```bash
pip install python-pptx python-docx reportlab Pillow
```

---

## 🧪 Verify Installation

```bash
cd backend
python -c "
from app.services.document_converter import get_converter
c = get_converter()
print('PPTX ready:', c.can_convert('test.pptx'))
print('DOCX ready:', c.can_convert('test.docx'))
"
```

**Expected Output:**
```
PPTX ready: True
DOCX ready: True
```

---

## 🎯 How It Works

### PowerPoint (.pptx) → PDF
1. Reads slides using `python-pptx`
2. Extracts text, images, and layouts
3. Renders to PDF using `reportlab`
4. Preserves text formatting and images

### Word (.docx) → PDF
1. Reads paragraphs using `python-docx`
2. Preserves headings, styles, tables
3. Generates formatted PDF with `reportlab`

---

## 📊 Comparison

| Method | Pros | Cons |
|--------|------|------|
| **Python Libraries** (Current) | No installation, fast, lightweight | May lose complex formatting |
| LibreOffice | Perfect formatting | Requires installation, slow startup |

**For most documents, Python libraries work great!**

---

## 🔧 Troubleshooting

### "Missing packages" error
```bash
pip install python-pptx python-docx reportlab Pillow
```

### "Module not found" error
Make sure you're in the backend virtual environment:
```bash
cd backend
source venv/bin/activate  # Linux/Mac
# or
.\venv\Scripts\activate   # Windows
pip install python-pptx python-docx reportlab Pillow
```

### Complex formatting not preserved
For presentations with complex animations, charts, or SmartArt:
- Text and images will be converted
- Complex graphics may be simplified
- This is normal for pure Python conversion

---

## ✅ Summary

**No LibreOffice needed!**

Just run:
```bash
pip install python-pptx python-docx reportlab Pillow
```

And your PPT/DOCX files will automatically convert to PDF for secure viewing.
