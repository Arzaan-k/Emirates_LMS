# CloudConvert Setup - Exact PPT/DOCX to PDF Conversion

## Why CloudConvert?

CloudConvert provides **EXACT** document conversion:
- ✅ Preserves ALL formatting, fonts, colors
- ✅ Preserves images, charts, SmartArt
- ✅ Preserves animations and transitions (as static)
- ✅ Works with complex presentations
- ✅ No local installation needed
- ✅ Works on any server (including Render, Heroku, etc.)

---

## 🚀 Setup (2 Minutes)

### Step 1: Get FREE API Key

1. Go to: https://cloudconvert.com/
2. Click "Sign Up" (free account)
3. Go to Dashboard → API → v2 Keys
4. Create new API key with these permissions:
   - ✅ tasks.read
   - ✅ tasks.write
5. Copy the API key

### Step 2: Add to .env

Open `backend/.env` and add your key:

```
CLOUDCONVERT_API_KEY=your_api_key_here
```

### Step 3: Restart Backend

```bash
cd backend
uvicorn app.main:app --reload
```

**Look for this log:**
```
INFO - CloudConvert API key configured - exact PDF conversion enabled
```

---

## 🆓 Free Tier Limits

CloudConvert free tier includes:
- **25 conversions per day** (resets daily)
- No credit card required
- Perfect for development and small teams

### Need More?
- $8/month for 500 conversions
- $15/month for 1000 conversions
- Pay-as-you-go: ~$0.02 per conversion

---

## 🧪 Test It

### Upload a PPT with complex design:
1. Go to Content Library
2. Upload a PowerPoint with:
   - Multiple fonts
   - Images
   - Charts
   - Custom backgrounds
   - Transitions
3. Open in lesson viewer
4. **Result**: Exact replica of your PPT as PDF!

### Check Backend Logs:
```
INFO - Converting example.pptx to PDF using CloudConvert (exact design preservation)...
INFO - Uploading example.pptx to CloudConvert...
INFO - File uploaded, waiting for conversion...
INFO - Conversion completed!
INFO - Downloading converted PDF...
INFO - PDF saved: /tmp/.../example.pdf (1234567 bytes)
```

---

## 📊 Comparison

| Feature | Python Libraries | CloudConvert |
|---------|-----------------|--------------|
| **Text** | ✅ | ✅ |
| **Basic Formatting** | ⚠️ Partial | ✅ Perfect |
| **Images** | ⚠️ Basic | ✅ Perfect |
| **Charts** | ❌ Lost | ✅ Perfect |
| **SmartArt** | ❌ Lost | ✅ Perfect |
| **Custom Fonts** | ❌ Lost | ✅ Perfect |
| **Backgrounds** | ❌ Lost | ✅ Perfect |
| **Animations** | ❌ N/A | ✅ As static |
| **Complex Layouts** | ❌ Broken | ✅ Perfect |
| **Installation** | None | None |
| **Cost** | Free | Free (25/day) |

---

## 🔧 Troubleshooting

### "API key not configured"
1. Add `CLOUDCONVERT_API_KEY=your_key` to `.env`
2. Restart backend

### "Conversion failed"
1. Check API key is valid
2. Check you haven't exceeded 25 conversions/day
3. Check file isn't corrupted

### "Timeout"
- Large files (50+ MB) may take longer
- Default timeout is 2 minutes
- Try smaller file first

### Check Your Usage
- Go to: https://cloudconvert.com/dashboard
- See remaining conversions today

---

## 🔒 Security

- Files are encrypted during transfer (HTTPS)
- CloudConvert deletes files after 24 hours
- GDPR compliant
- SOC 2 Type II certified

---

## ✅ Summary

1. **Sign up** at cloudconvert.com (free)
2. **Create API key** in dashboard
3. **Add to .env**: `CLOUDCONVERT_API_KEY=your_key`
4. **Restart backend**
5. **Upload PPT** - it will convert with EXACT design!

**25 free conversions per day - perfect for getting started!**
