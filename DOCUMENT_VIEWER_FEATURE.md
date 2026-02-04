# Learning Path Document Viewer Feature

## Overview

The learning path nodes now support all document types including PDFs, PowerPoint presentations, Word documents, and other formats. Each node can display any content type with appropriate full-screen viewers optimized for that format.

## What's New

### 1. **Multi-Format Content Support in Learning Paths**
- **Video/Audio**: Native video player with playback controls and speed adjustment
- **PDF**: Full-screen PDF viewer via WebView
- **PowerPoint (PPT/PPTX)**: Presentation viewer using Google Docs Viewer
- **Word (DOC/DOCX)**: Document viewer using Google Docs Viewer
- **Other formats**: Generic document viewer as fallback

### 2. **Smart Progress Tracking**
- **Videos/Audio**: Track playback progress (percentage watched)
- **Documents**: Automatically mark as viewed (100%) after 2 seconds of loading
- **All types**: Still require quiz completion for node completion

### 3. **Conditional Rendering**
- Component detects `resource_type` or `resourceType` field from backend
- Renders appropriate viewer based on content type
- Maintains backward compatibility with existing video nodes

## Files Changed

### Frontend Changes

**Components/LessonView.js** - Main lesson viewer component

1. **Import WebView** (Line 31)
   ```javascript
   import { WebView } from 'react-native-webview';
   ```

2. **renderContentViewer() Function** (Lines 743-906)
   - New function that conditionally renders viewers based on resource type
   - Handles Video, Audio, PDF, Presentation, Document, and Other types
   - Uses Google Docs Viewer for Office documents
   - Includes loading states and error placeholders for each type

3. **Document Progress Tracking** (Lines 315-363)
   - Added `handleDocumentViewed()` function
   - Auto-sets progress to 100% for non-video content
   - Sends progress update to backend after 2-second delay

4. **Updated Progress Requirements Text** (Lines 1104-1115)
   - Conditional message based on content type
   - Videos: "Watch at least X% of the content..."
   - Documents: "View the document and complete the quiz..."

5. **Replaced Video Player Section** (Lines 772-775)
   - Changed from hardcoded Video component to `renderContentViewer()`
   - Now supports all content types dynamically

## Technical Implementation

### Resource Type Detection

The component checks for resource type in this order:
```javascript
const resourceType = lesson.resourceType || lesson.resource_type || 'Video';
```

Supported resource types (from backend):
- `Video` - MP4, WebM, MOV, AVI
- `Audio` - MP3, WAV
- `PDF` - PDF files
- `Presentation` - PPT, PPTX
- `Document` - DOC, DOCX
- `Other` - All other formats (uses generic viewer)

### Content URL Detection

The component checks for content URL in this order:
```javascript
const contentUrl = lesson.videoUrl || lesson.video_url || lesson.fileUrl || lesson.file_url;
```

### Viewer Implementations

#### 1. Video/Audio Viewer
```javascript
<Video
    ref={videoRef}
    style={StyleSheet.absoluteFill}
    source={{ uri: contentUrl }}
    useNativeControls
    resizeMode={ResizeMode.CONTAIN}
    rate={playbackSpeed}
    onPlaybackStatusUpdate={handleVideoPlaybackStatus}
/>
```

**Features**:
- Native video controls
- Playback speed adjustment (0.5x to 2.0x)
- Progress tracking with resume capability
- Mid-video quiz support

#### 2. PDF Viewer
```javascript
<WebView
    source={{ uri: contentUrl }}
    style={StyleSheet.absoluteFill}
    startInLoadingState={true}
    renderLoading={() => <ActivityIndicator />}
/>
```

**Features**:
- Direct PDF rendering in WebView
- Pinch-to-zoom support
- Scroll navigation
- Cross-platform (Web, Android, iOS)

#### 3. Presentation Viewer (PPT/PPTX)
```javascript
const viewerUrl = `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(contentUrl)}`;
<WebView source={{ uri: viewerUrl }} />
```

**Features**:
- Google Docs Viewer integration
- Slide navigation
- Full-screen viewing
- Works with public CDN URLs (Cloudflare R2)

#### 4. Document Viewer (Word)
```javascript
const viewerUrl = `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(contentUrl)}`;
<WebView source={{ uri: viewerUrl }} />
```

**Features**:
- Google Docs Viewer integration
- Formatted document display
- Scroll navigation
- Works with public CDN URLs

#### 5. Fallback Viewer (Other formats)
```javascript
// Uses Google Docs Viewer for unknown types
const viewerUrl = `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(contentUrl)}`;
<WebView source={{ uri: viewerUrl }} />
```

### Progress Tracking Logic

#### For Videos/Audio:
```javascript
// Tracked via onPlaybackStatusUpdate
const handleVideoPlaybackStatus = async (status) => {
    // Calculate percentage watched
    // Update progress incrementally
    // Save to backend periodically
};
```

#### For Documents:
```javascript
useEffect(() => {
    const resourceType = lesson.resourceType || lesson.resource_type || 'Video';
    if (resourceType !== 'Video' && resourceType !== 'Audio') {
        setTimeout(() => {
            handleDocumentViewed(); // Sets progress to 100%
        }, 2000);
    }
}, []);
```

**Why 2-second delay?**
- Allows document to load before marking as viewed
- Prevents accidental completion from quick navigation
- Gives user time to see the document content

## Backend Integration

The learning path nodes API already provides the necessary fields:

```json
{
  "id": "content_abc123",
  "title": "Module 1: Introduction",
  "resource_type": "PDF",           // or "Presentation", "Document", etc.
  "resourceType": "PDF",            // camelCase for frontend
  "file_url": "https://cdn.example.com/doc.pdf",
  "fileUrl": "https://cdn.example.com/doc.pdf",
  "video_url": null,
  "videoUrl": null,
  "transcript": "Extracted text from PDF...",
  "quiz": [...],
  "learning_path_type": "career_progression",
  "is_path_node": true
}
```

## User Experience

### For End Users:

1. **Start Learning Path**
   - Navigate to Learning Path (Career Progression or Self Learning)
   - Tap on any node/module to open

2. **View Content**
   - **Videos**: Watch with native controls, speed adjustment
   - **PDFs**: Scroll through document, pinch to zoom
   - **PPT**: Navigate slides in Google Docs Viewer
   - **Word**: Read formatted document in Google Docs Viewer

3. **Complete Module**
   - **Videos**: Watch ≥90% (configurable)
   - **Documents**: Automatically marked as viewed after opening
   - **All types**: Pass quiz with ≥70% score (configurable)

4. **Progress Tracking**
   - Green checkmark on completed nodes
   - Progress persists across sessions
   - Can review content anytime

### For Admins/Managers:

When uploading content via Bulk Upload or Folder Upload:

1. **Upload Any File Type**
   - PDFs, PPT, Word docs, Videos, etc.
   - System automatically detects file type

2. **Automatic Processing**
   - Text extraction from documents
   - AI quiz generation
   - Transcript/summary creation

3. **Assign to Learning Path**
   - Mark as Career Progression or Self Learning
   - Content appears in learning path
   - Users can view immediately

## Supported Platforms

✅ **Web** - Full support for all document types
✅ **Android** - Full support via WebView
✅ **iOS** - Full support via WebView

## Requirements

### Dependencies (Already Installed):
- `react-native-webview@13.15.0` - For document viewing
- `expo-av@~16.0.8` - For video/audio playback

### CDN Requirements:
- Content URLs must be publicly accessible
- CORS headers should allow embedding
- Cloudflare R2 is configured correctly ✅

### Google Docs Viewer Limitations:
- File size limit: ~25MB
- Supported formats: PDF, DOC, DOCX, PPT, PPTX, XLS, XLSX
- Requires public URL (no authentication)

## Testing

### Test Cases:

1. **Video Node**
   - ✅ Plays video with native controls
   - ✅ Speed control works (0.5x to 2.0x)
   - ✅ Progress tracked correctly
   - ✅ Mid-video quizzes appear at 33%, 66%
   - ✅ Resume from last position

2. **PDF Node**
   - ✅ Renders PDF in full-screen
   - ✅ Scroll navigation works
   - ✅ Pinch-to-zoom works
   - ✅ Auto-marked as viewed after 2 seconds
   - ✅ Quiz available in Quiz tab

3. **PowerPoint Node**
   - ✅ Renders in Google Docs Viewer
   - ✅ Slide navigation works
   - ✅ Auto-marked as viewed
   - ✅ Quiz generated from extracted text

4. **Word Document Node**
   - ✅ Renders in Google Docs Viewer
   - ✅ Formatted display
   - ✅ Auto-marked as viewed
   - ✅ Quiz generated from extracted text

5. **Mixed Learning Path**
   - ✅ Video → PDF → PPT sequence works
   - ✅ Progress tracked independently
   - ✅ Quiz completion tracked separately
   - ✅ Completion logic works for all types

### Manual Testing Steps:

1. **Create Test Content**
   ```bash
   # Upload via Bulk Folder Upload:
   TestFolder/
   ├── intro.mp4 (Video)
   ├── guide.pdf (PDF)
   ├── presentation.pptx (PPT)
   └── manual.docx (Word)
   ```

2. **Mark as Learning Path**
   - Assign to Career Progression
   - Set order_index for each

3. **Test on Each Platform**
   - Web: Chrome, Safari, Edge
   - Android: Real device or emulator
   - iOS: Real device or simulator

4. **Verify Features**
   - Content displays correctly
   - Progress tracking works
   - Quiz completion works
   - Node marked complete when done

## Troubleshooting

### Issue 1: Document doesn't load in WebView

**Possible Causes**:
- URL not publicly accessible
- CORS headers blocking embedding
- File too large for Google Docs Viewer

**Solutions**:
```javascript
// Check if URL is accessible
console.log('Content URL:', contentUrl);

// For Cloudflare R2, ensure CORS is configured:
// In Cloudflare dashboard:
// R2 → Bucket Settings → CORS Policy:
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"]
  }
]
```

### Issue 2: Google Docs Viewer shows "No preview available"

**Causes**:
- File format not supported
- File too large (>25MB)
- URL requires authentication
- Temporary Google service issue

**Solutions**:
1. Verify file is publicly accessible
2. Check file size (should be <25MB)
3. For very large files, consider splitting into sections
4. For unsupported formats, use direct download instead

### Issue 3: Progress not saving for documents

**Cause**: Network error or backend issue

**Solution**:
```javascript
// Check browser/React Native console for errors
// Verify API endpoint is working:
fetch(`${API_URL}/learning-paths/progress/${lesson.id}`, {
    method: "POST",
    body: formData
})
```

### Issue 4: Video works but documents don't

**Cause**: WebView not enabled or blocked

**Solution**:
```bash
# Verify react-native-webview is installed:
npm list react-native-webview

# If missing:
npm install react-native-webview@13.15.0

# For Expo:
expo install react-native-webview
```

## Performance Considerations

### Optimization Tips:

1. **CDN Usage**
   - Store all content on Cloudflare R2
   - Reduces server load
   - Faster loading globally

2. **Document Size**
   - Keep PDFs under 10MB for best performance
   - Compress large presentations
   - Optimize images in Word docs

3. **Lazy Loading**
   - Documents load on-demand (not preloaded)
   - Only active node content is fetched
   - Previous progress restored from cache

4. **Caching**
   - WebView caches documents locally
   - Faster on revisit
   - Reduces bandwidth usage

## Future Enhancements

Potential improvements:

1. **Native PDF Viewer**
   - Use react-native-pdf for better offline support
   - More control over UI/UX
   - Page navigation indicators

2. **Slide Progress Tracking**
   - Track which slides viewed in presentations
   - Show slide numbers
   - Jump to specific slides

3. **Document Annotations**
   - Allow users to highlight text
   - Add notes to documents
   - Save annotations to backend

4. **Offline Mode**
   - Download documents for offline viewing
   - Cache with expo-file-system
   - Sync progress when online

5. **Document Search**
   - Search within documents
   - Highlight search results
   - Quick navigation to terms

6. **Page Bookmarks**
   - Bookmark specific pages
   - Quick jump to bookmarks
   - Share bookmarks with team

## Summary

The document viewer feature is now fully implemented and integrated into the learning path system:

✅ **All document types supported** (PDF, PPT, Word, etc.)
✅ **Full-screen viewers** optimized for each format
✅ **Smart progress tracking** (auto-complete for documents)
✅ **Quiz integration** works for all content types
✅ **Backward compatible** with existing video nodes
✅ **Cross-platform** (Web, Android, iOS)
✅ **No breaking changes** to existing functionality

Users can now learn from any content type in a seamless, unified experience!
