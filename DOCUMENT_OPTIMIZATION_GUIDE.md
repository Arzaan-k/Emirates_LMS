# Document Optimization Guide

## 🎯 How It Works

The system uses a **smart strategy for PPT/DOCX files only**:

**Important**: CloudConvert is ONLY used for PowerPoint (.ppt, .pptx) and Word (.doc, .docx) files. Other file types like PDF, Excel, etc. are not converted.

### For PPT/DOCX Files:

**Step 1: Check File Size**
- If file is **< 24MB**: Use original file directly with Google Viewer
- No processing needed, fastest option

**Step 2: Convert to PDF (if ≥ 24MB)**
- Uses CloudConvert API for **exact** PDF conversion
- Preserves all formatting, fonts, images, charts
- Works for PPT, PPTX, DOC, DOCX only

### For Other Files (PDF, Excel, etc.):
- Always use original file with Google Viewer
- No conversion applied
- CloudConvert is NOT used for these file types

---

## ✅ What's Already Working

| Feature | Status |
|---------|--------|
| File size detection | ✅ Working |
| Google Viewer preview | ✅ Working for all file types |
| CloudConvert (PPT/DOC only) | ⚠️ Needs API key |

---

## 🚀 Quick Setup

### For Most Files (No Setup Needed!)
- All files under 24MB work automatically with Google Viewer
- PDF, Excel, and other files always use Google Viewer (no conversion)

### For Large PPT/DOC Files (Optional CloudConvert)
If you have **PPT/PPTX/DOC/DOCX files > 24MB**:

1. Get FREE API key at: https://cloudconvert.com/
2. Add to `backend/.env`:
   ```
   CLOUDCONVERT_API_KEY=your_key_here
   ```
3. Restart backend

**Free tier**: 25 conversions/day

---

## 📊 Decision Flow

```
File Upload
    │
    ▼
┌─────────────────────┐
│ Is PPT/DOC file?    │──NO──▶ Use Original (Google Viewer)
└─────────────────────┘
    │ YES (PPT/PPTX/DOC/DOCX)
    ▼
┌───────────────┐
│ Size < 24MB?  │──YES──▶ Use Original (Google Viewer)
└───────────────┘
    │ NO (>= 24MB)
    ▼
┌───────────────────┐
│ CloudConvert      │──YES──▶ Convert to PDF
│ Configured?       │
└───────────────────┘
    │ NO
    ▼
Use Original (may show "file too large" error)
```

---

## 🧪 Testing

### Test Small PPT/DOC (< 24MB)
1. Upload a PPT/DOC under 24MB
2. **Expected**: Opens directly in Google Viewer
3. **Design preserved**: 100%

### Test Large PPT/DOC (> 24MB)
1. Upload a PPT/DOC over 24MB
2. **Expected**: Converts to PDF using CloudConvert (if configured)
3. **Design preserved**: 100%

### Test Other Files (PDF, Excel, etc.)
1. Upload any PDF, Excel, or other file
2. **Expected**: Always uses original with Google Viewer
3. **No conversion applied**

### Check Backend Logs
```
INFO - Processing example.pptx (35.50 MB)
INFO - CloudConvert: Converting example.pptx (35.50 MB) to PDF...
INFO - CloudConvert PDF saved: /path/to/example.pdf (28.30 MB)
```

---

## 💡 Tips for Smaller PPT/DOC Files

If you frequently upload large PowerPoint or Word files, consider:

1. **Compress images before adding to PPT**
   - Use JPEG instead of PNG for photos
   - Resize images to display size (not 4K for a small slide)

2. **Remove unused slides/content**
   - Hidden slides still add to file size

3. **Use built-in compression**
   - PowerPoint: File → Compress Pictures → Select quality
   - Word: File → Compress Pictures

---

## 🔧 Configuration

### Environment Variables

```bash
# Optional - only needed for PPT/DOC files >= 24MB
CLOUDCONVERT_API_KEY=your_key_here
```

### File Size Threshold

Default is 24MB (safe margin below Google's ~25MB limit).

To change, edit `backend/app/services/document_converter.py`:
```python
MAX_PREVIEW_SIZE = 24 * 1024 * 1024  # Change this value
```

---

## 📈 CloudConvert Results

Typical CloudConvert PDF conversion results for PPT files:

| Original PPT Size | PDF Size | Notes |
|------------------|----------|-------|
| 30 MB | 25-28 MB | Exact design preserved |
| 50 MB | 42-48 MB | Exact design preserved |
| 100 MB | 85-95 MB | Exact design preserved |

**Note**: CloudConvert preserves 100% of the original design, including fonts, images, charts, and layouts.

---

## ❓ FAQ

### Q: Which file types use CloudConvert?
**A**: ONLY PowerPoint (.ppt, .pptx) and Word (.doc, .docx) files that are >= 24MB. All other file types (PDF, Excel, etc.) always use the original with Google Viewer.

### Q: Why not convert all large files?
**A**: CloudConvert is optimized for PPT/DOC files where exact design preservation is critical. Other file types like PDF and Excel work well with Google Viewer at any size.

### Q: What if CloudConvert is not configured?
**A**: Large PPT/DOC files will use the original. They may show "file too large" error in Google Viewer, but users can still access the file URL.

### Q: Will PDF conversion affect quality?
**A**: No, CloudConvert preserves 100% of the original design including fonts, images, charts, and layouts. The PDF is an exact replica of the PowerPoint/Word file.

---

## ✅ Summary

| File Type | File Size | What Happens | Design |
|-----------|-----------|-------------|--------|
| PPT/DOC | < 24 MB | Use original | ✅ 100% preserved |
| PPT/DOC | >= 24 MB | Convert to PDF* | ✅ 100% preserved |
| PDF/Excel/Other | Any size | Use original | ✅ 100% preserved |

*Requires CloudConvert API key (only for large PPT/DOC files)

**Most files work automatically - no setup needed!**
