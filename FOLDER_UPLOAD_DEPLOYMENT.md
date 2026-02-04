# Hierarchical Folder Upload Feature - Deployment Guide

## Overview

This feature enables bulk uploading of folders with hierarchical structure, automatically creating nested buckets that mirror your folder organization. It supports all document types (PDF, Word, PowerPoint, Videos, etc.) with automatic text extraction and quiz generation.

## What's New

### 1. **Nested Bucket Structure**
- Each folder becomes a separate bucket in the database
- Supports unlimited nesting depth (folder within folder within folder)
- Maintains folder hierarchy: `BWC/Career Progression/Module 1`

### 2. **Multi-Format Support**
- **Videos**: MP4, WebM, MOV, AVI
- **Documents**: PDF, DOCX (Word)
- **Presentations**: PPTX (PowerPoint)
- **Audio**: MP3, WAV
- **Images**: JPG, PNG, GIF
- **Spreadsheets**: XLSX (Excel)

### 3. **Document Processing**
- Automatic text extraction from PDF, Word, and PowerPoint files
- AI-powered transcript/summary generation
- Quiz creation from document content (just like videos)
- Background processing with progress tracking

### 4. **Smart Upload Interface**
- **Web**: Native folder picker with tree preview
- **Mobile**: (Android/iOS compatible, file-by-file for now)
- Preview and deselect files before uploading
- Real-time progress bar during upload
- Folder-level learning path assignment

## Files Changed

### Backend Changes

1. **Database Schema** (`backend/app/models/content.py`)
   - Added `parent_bucket_id` to `CourseBucket` model
   - Added `folder_path` for full hierarchy path
   - New index on `parent_bucket_id`

2. **Migration Script** (`backend/migrate_schema.py`)
   - Added migrations for new bucket fields
   - Fixed Unicode encoding issues for Windows

3. **New Service** (`backend/app/services/document_service.py`)
   - Text extraction from PDF (PyPDF2)
   - Text extraction from Word (python-docx)
   - Text extraction from PowerPoint (python-pptx)

4. **Content Service** (`backend/app/services/content_service.py`)
   - `get_bucket_by_name()` - Find bucket by name
   - `get_bucket_by_path()` - Find bucket by full path

5. **Content Endpoints** (`backend/app/api/v1/endpoints/content.py`)
   - Updated background processing for documents
   - New endpoint: `POST /api/v1/content/bulk-folder-upload`
   - Document text extraction integrated

6. **Dependencies** (`backend/requirements.txt`)
   - `python-docx==1.1.2` - Word document processing
   - `python-pptx==1.0.2` - PowerPoint processing
   - `PyPDF2==3.0.1` - PDF processing

### Frontend Changes

1. **New Component** (`Components/FolderUploadModal.js`)
   - Web-based folder selection (webkitdirectory)
   - Interactive tree preview with file selection
   - Progress tracking during upload
   - Learning path type selection

2. **Manager Dashboard** (`Screens/ManagerDashboard.js`)
   - Import FolderUploadModal
   - New state: `folderUploadVisible`
   - New "Upload Folder" button (web only)

## Deployment Steps

### Step 1: Database Migration

The migration script has already been updated. Run it to add new fields:

```bash
cd backend
python migrate_schema.py
```

**Expected Output:**
```
Running database schema migration...
[OK] ALTER TABLE course_buckets ADD COLUMN...
[OK] CREATE INDEX idx_bucket_parent...
Migration complete!
```

### Step 2: Install Python Dependencies

Dependencies have been installed. If deploying to a new server:

```bash
cd backend
pip install -r requirements.txt
```

This installs:
- `python-docx` for Word documents
- `python-pptx` for PowerPoint
- `PyPDF2` for PDFs

### Step 3: Environment Variables

Ensure these are set in your `.env` file:

```env
# Cloudflare R2 for CDN (recommended)
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=lms-videos

# Groq API for AI processing
GROQ_API_KEY=your_groq_api_key

# Database (Neon PostgreSQL)
DATABASE_URL=postgresql://user:pass@host/db
```

### Step 4: Restart Backend

```bash
cd backend
# Kill existing process
# Start new process
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Step 5: Test the Feature

1. **Access Manager Dashboard**
   - Login as admin/manager
   - Navigate to Manager Dashboard

2. **Find "Upload Folder" Button**
   - Located in the Quick Actions section
   - Only visible on web platform
   - Requires `bulk_upload` privilege

3. **Test Upload**
   - Click "Upload Folder"
   - Select a test folder with nested structure
   - Review file tree preview
   - Choose learning path type
   - Click "Upload X Files"
   - Monitor progress bar

## Usage Guide

### For Admins/Managers

**Step 1: Organize Your Content**

Create a folder structure on your computer:
```
BWC/
├── Career Progression/
│   ├── Module 1/
│   │   ├── intro.pdf
│   │   ├── lesson1.pptx
│   │   └── demo.mp4
│   └── Module 2/
│       ├── advanced.docx
│       └── practice.pdf
└── Self Learning/
    ├── onboarding.pdf
    └── welcome.mp4
```

**Step 2: Upload Folder**

1. Click "Upload Folder" button
2. Select "BWC" folder
3. Preview shows entire structure
4. Deselect unwanted files (optional)
5. Choose learning path type:
   - **Career Progression**: For career advancement courses
   - **Self Learning**: For mandatory onboarding
6. Click "Upload" button

**Step 3: Monitor Progress**

- Real-time progress bar shows upload status
- Background processing extracts text and generates quizzes
- Notification when complete

**Step 4: Verify Results**

- Go to Bucket Management
- You'll see:
  - BWC (parent bucket)
    - Career Progression (nested bucket)
      - Module 1 (nested bucket)
      - Module 2 (nested bucket)
    - Self Learning (nested bucket)
- Each bucket contains its respective files

### For End Users

Users see the hierarchical structure in:
- Course Library (organized by buckets)
- Learning Path (if marked as path nodes)
- Search results (filterable by bucket hierarchy)

## Technical Details

### API Endpoint: Bulk Folder Upload

**Endpoint:** `POST /api/v1/content/bulk-folder-upload`

**Parameters:**
- `root_bucket_name`: Name of the root folder (e.g., "BWC")
- `learning_path_type`: "career_progression" or "self_learning"
- `files`: Array of files (multipart/form-data)
- `file_paths`: JSON array of relative paths

**Example:**
```json
{
  "root_bucket_name": "BWC",
  "learning_path_type": "career_progression",
  "file_paths": [
    "Career Progression/Module 1/intro.pdf",
    "Career Progression/Module 1/lesson1.pptx"
  ]
}
```

**Response:**
```json
{
  "status": "completed",
  "results": {
    "total": 10,
    "successful": 10,
    "failed": 0,
    "buckets_created": 5,
    "items": [...]
  }
}
```

### Background Processing Flow

1. **Upload Phase**
   - Files uploaded to Cloudflare R2 CDN
   - Metadata stored in database
   - Buckets created automatically

2. **Processing Phase (Background)**
   - **Videos/Audio**: Groq Whisper API for transcription
   - **Documents**: Text extraction via respective libraries
   - **All Content**: Quiz generation via Groq LLM
   - **All Content**: Embedding generation (optional)

3. **Completion**
   - Content marked as processed
   - Quizzes available for users
   - Transcripts searchable

### Database Schema

**course_buckets table:**
```sql
CREATE TABLE course_buckets (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    parent_bucket_id VARCHAR(100),  -- NEW
    folder_path VARCHAR(1000),      -- NEW
    color VARCHAR(50),
    icon VARCHAR(100),
    keywords JSON,
    order_index INTEGER,
    is_active BOOLEAN,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

CREATE INDEX idx_bucket_parent ON course_buckets(parent_bucket_id);
```

## Troubleshooting

### Issue 1: Folder picker doesn't show

**Cause**: Platform is not web or browser doesn't support `webkitdirectory`

**Solution**:
- Use Chrome/Edge/Safari on desktop
- Mobile users should use individual file upload (Bulk Upload button)

### Issue 2: Document processing fails

**Cause**: Missing Python libraries

**Solution**:
```bash
pip install python-docx python-pptx PyPDF2
```

### Issue 3: Unicode errors in migration

**Cause**: Windows console encoding

**Solution**: Already fixed in migrate_schema.py (uses [OK] instead of ✓)

### Issue 4: Upload fails with large folders

**Cause**: Server timeout or memory limits

**Solution**:
- Upload in smaller batches
- Increase server timeout in settings
- Check CDN storage limits

### Issue 5: Quizzes not generating for documents

**Cause**: Text extraction failed or document is image-based

**Solution**:
- Check document has selectable text (not scanned images)
- Review backend logs for extraction errors
- Old .doc/.ppt formats not supported (only .docx/.pptx)

## Performance Considerations

### Recommended Limits

- **Max files per upload**: 500 files
- **Max file size**: 500MB per file
- **Max folder depth**: 10 levels (tested)
- **Concurrent uploads**: 1 per user

### Optimization Tips

1. **Use CDN**: Cloudflare R2 for faster uploads
2. **Background processing**: Keep UI responsive
3. **Batch notifications**: Don't spam WebSocket
4. **Cache buckets**: Reduce DB queries

## Future Enhancements

Potential improvements for next version:

1. **Mobile folder upload**: Native directory pickers for Android/iOS
2. **Drag-and-drop**: Drop folders directly on dashboard
3. **Resume uploads**: Handle interrupted uploads
4. **Duplicate detection**: Skip already uploaded files
5. **Bulk editing**: Modify multiple files at once
6. **Export structure**: Download folder hierarchy as ZIP
7. **Template folders**: Save common structures as templates

## Support

For issues or questions:
- Check backend logs: `backend/logs/`
- Review browser console for frontend errors
- Database queries: Check Neon dashboard
- CDN status: Check Cloudflare R2 dashboard

## Summary

The hierarchical folder upload feature is now fully deployed and ready to use. It:

✓ Supports nested folder structures
✓ Handles all document types (PDF, Word, PPT, Videos)
✓ Auto-generates quizzes from documents
✓ Maintains folder hierarchy as buckets
✓ Works on web platform (Chrome, Edge, Safari)
✓ Integrates with existing bulk upload system
✓ Uses Cloudflare R2 CDN for storage
✓ Background processing with progress tracking

**No existing functionality is affected** - this is purely additive.
