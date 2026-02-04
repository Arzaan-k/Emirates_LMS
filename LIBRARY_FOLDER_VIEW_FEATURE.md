# Content Library - Hierarchical Folder View

## Overview

The Content Library in the admin panel now features a desktop-like folder structure where buckets appear as collapsible folders. Users can click folders to expand/collapse them, revealing the content inside - just like navigating files on a desktop computer.

## What Changed

### User Experience

**Before**:
- All buckets shown expanded by default
- All content visible at once
- No folder metaphor
- Flat category listing

**After**:
- Buckets appear as closed folders initially
- Click folder to expand and see contents
- Desktop-like folder icons (closed/open states)
- Hierarchical nesting with visual indentation
- Expand/collapse arrows for navigation
- Item count badges on each folder

## Features

### 1. Collapsible Folder Structure

**Visual Design**:
- 📁 Closed folder icon when collapsed
- 📂 Open folder icon when expanded
- ▶ Chevron-right when collapsed
- ▼ Chevron-down when expanded

**Behavior**:
- Click anywhere on folder header to toggle
- Smooth expand/collapse animation
- State persists during search
- Independent folder states (one open doesn't affect others)

### 2. Hierarchical Nesting

**Parent Buckets**:
- Main folders at root level
- Prominent styling with larger icons
- Color-coded based on bucket configuration
- Item count badge shows total files

**Child Buckets** (Nested Folders):
- Indented 24px from parent
- Lighter styling to show hierarchy
- Can also be expanded/collapsed
- Support unlimited nesting depth

**Content Items**:
- Further indented based on nesting level
- Level 1: 24px indent (direct in bucket)
- Level 2: 48px indent (in nested bucket)
- Level N: N * 24px indent

### 3. Smart Content Type Icons

Icons automatically detected from resource type:

| Content Type | Icon | Color |
|-------------|------|-------|
| Video | `play-circle` | Purple (#8B5CF6) |
| PDF | `file-pdf-box` | Red (#EF4444) |
| Presentation (PPT) | `file-powerpoint` | Orange (#F59E0B) |
| Document (Word) | `file-word` | Blue (#2B579A) |
| Excel | `file-excel` | Green (#10B981) |
| Audio | `volume-high` | Pink (#EC4899) |
| Other | `file-document-outline` | Gray (#6B7280) |

### 4. Enhanced Metadata Display

Each content item now shows:
- **Resource Type Tag**: Small icon + type name (e.g., "📄 PDF")
- **Category/Bucket**: Which folder it belongs to
- **Date**: When it was added (if available)

## Implementation Details

### File Modified

**Components/ContentLibraryModal.js**

#### 1. Added Folder State Management (Lines 31-32)

```javascript
// Folder/Bucket collapse state (tracks which folders are expanded)
const [expandedFolders, setExpandedFolders] = useState(new Set());
```

- Uses `Set` for O(1) lookup performance
- Stores IDs of currently expanded folders
- Empty Set = all folders collapsed initially

#### 2. Added Toggle Function (Lines 196-206)

```javascript
// Toggle folder expansion (like clicking folder in file explorer)
const toggleFolder = (folderId) => {
    setExpandedFolders(prev => {
        const newSet = new Set(prev);
        if (newSet.has(folderId)) {
            newSet.delete(folderId); // Collapse
        } else {
            newSet.add(folderId); // Expand
        }
        return newSet;
    });
};
```

- Immutable state updates
- Toggle pattern (add if not present, remove if present)
- Works with nested folders independently

#### 3. Updated Content Item Renderer (Lines 210-256)

**Before**:
```javascript
const renderContentItem = (item) => {
    // Fixed icon logic
    // No indentation support
    // Basic metadata
}
```

**After**:
```javascript
const renderContentItem = (item, indentLevel = 0) => {
    // Smart resource type detection
    const resourceType = item.resource_type || item.resourceType || item.type;

    // Dynamic icon selection for all content types
    if (resourceType === 'PDF' || item.title.endsWith('.pdf')) { ... }
    else if (resourceType === 'Video' || item.videoUrl) { ... }
    else if (resourceType === 'Presentation' || ...) { ... }

    // Calculate indentation for nested content
    const indentWidth = indentLevel * 24;

    // Enhanced metadata with resource type
    <MaterialCommunityIcons name="tag" size={12} color="#9CA3AF" />
    <Text style={styles.itemResourceType}>{resourceType}</Text>
}
```

**Key Features**:
- `indentLevel` parameter for nesting support
- Multiple fallbacks for resource type detection
- All document formats recognized
- Visual indentation calculation

#### 4. Replaced Folder Rendering (Lines 324-397)

**Old Structure**:
```javascript
displayCategories.map(category => (
    <View key={category.id} style={styles.categorySection}>
        <View style={styles.categoryHeader}>
            <MaterialCommunityIcons name="folder" />
            <Text>{category.name}</Text>
            <View style={styles.badge}>{category.items.length}</View>
        </View>
        {category.items.map(item => renderContentItem(item))}
    </View>
))
```

**New Structure**:
```javascript
displayCategories.map(category => {
    const isExpanded = expandedFolders.has(category.id);
    const hasNestedBuckets = category.children && category.children.length > 0;

    return (
        <View key={category.id} style={styles.folderContainer}>
            {/* Clickable Folder Header */}
            <TouchableOpacity onPress={() => toggleFolder(category.id)}>
                {/* Expand/Collapse Arrow */}
                <MaterialCommunityIcons
                    name={isExpanded ? "chevron-down" : "chevron-right"}
                />

                {/* Folder Icon (changes when opened) */}
                <MaterialCommunityIcons
                    name={isExpanded ? "folder-open" : "folder"}
                />

                {/* Folder Name + Count */}
                <Text>{category.name}</Text>
                <View style={styles.folderBadge}>{category.items.length}</View>
            </TouchableOpacity>

            {/* Contents (only shown when expanded) */}
            {isExpanded && (
                <View style={styles.folderContents}>
                    {/* Nested buckets first */}
                    {hasNestedBuckets && category.children.map(childBucket => (
                        <View style={styles.nestedFolder}>
                            {/* Recursive folder structure */}
                        </View>
                    ))}

                    {/* Then content items */}
                    {category.items.map(item => renderContentItem(item, 1))}
                </View>
            )}
        </View>
    );
})
```

**Key Improvements**:
- Conditional rendering based on expand state
- Support for nested buckets (children)
- Recursive structure for unlimited nesting
- Visual hierarchy with indentation
- Folder state icons (open/closed)

#### 5. Added New Styles (Lines 563-627)

```javascript
folderContainer: {
    marginBottom: 8,
},
folderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 12,
    marginBottom: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
},
expandIconContainer: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
},
folderIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
},
// ... more folder-specific styles
```

**Design Principles**:
- Clean, modern folder aesthetic
- Subtle shadows for depth
- Color-coded folder icons
- Responsive touch targets (minimum 44x44)
- Consistent spacing and alignment

## User Workflows

### Opening a Folder

1. **User sees collapsed folder**:
   ```
   ▶ 📁 Safety Training (12)
   ```

2. **User taps anywhere on folder header**

3. **Folder expands with animation**:
   ```
   ▼ 📂 Safety Training (12)
     ├─ 📄 Safety Manual.pdf
     ├─ 🎬 Safety Procedures.mp4
     ├─ 📊 Safety Checklist.pptx
     └─ ...
   ```

### Navigating Nested Folders

1. **Parent folder expanded**:
   ```
   ▼ 📂 BWC Training (25)
     ▶ 📁 Career Progression (10)
     ▶ 📁 Self Learning (15)
   ```

2. **User clicks nested folder "Career Progression"**:
   ```
   ▼ 📂 BWC Training (25)
     ▼ 📂 Career Progression (10)
       ├─ 📄 Module 1.pdf
       ├─ 📄 Module 2.pdf
       └─ ...
     ▶ 📁 Self Learning (15)
   ```

### Editing Content in Folder

1. Expand folder to see contents
2. Click edit icon (pencil) on content item
3. Modal opens with editable fields
4. Save changes
5. Content updates in folder view

### Moving Content Between Folders

1. Click folder icon on content item
2. Category modal opens
3. Select new bucket/folder
4. Content moves to new location
5. Refresh shows content in new folder

## Backend Integration

### API Response Format

The library expects buckets with this structure:

```json
{
  "categories": [
    {
      "id": "bucket_safety",
      "name": "Safety Training",
      "icon": "shield-check",
      "color": "#EF4444",
      "parent_bucket_id": null,
      "folder_path": "Safety Training",
      "items": [
        {
          "id": "content_123",
          "title": "Safety Manual.pdf",
          "description": "Comprehensive safety guidelines",
          "resource_type": "PDF",
          "bucket": "Safety Training",
          "category": "Safety Training",
          "date": "2024-01-15",
          "videoUrl": null,
          "fileUrl": "https://cdn.example.com/safety-manual.pdf"
        }
      ],
      "children": [
        {
          "id": "bucket_safety_advanced",
          "name": "Advanced Safety",
          "icon": "shield-star",
          "color": "#DC2626",
          "parent_bucket_id": "bucket_safety",
          "folder_path": "Safety Training/Advanced Safety",
          "items": [...]
        }
      ]
    }
  ]
}
```

**Key Fields**:
- `parent_bucket_id`: Links to parent bucket for nesting
- `folder_path`: Full path from root (for breadcrumbs/display)
- `children`: Array of nested buckets
- `items`: Array of content in this bucket

### Fetching Content

**Endpoint**: `GET /api/v1/content/library/all`

Current implementation fetches buckets with items. For full hierarchical support, the backend should:

1. Return buckets with `parent_bucket_id` populated
2. Group child buckets under `children` array
3. Include full `folder_path` for each bucket
4. Support recursive nesting

### Example Backend Query Logic

```python
def get_library_hierarchy():
    # Get all buckets
    buckets = db.query(CourseBucket).all()

    # Build hierarchy
    bucket_map = {b.id: {**b.to_dict(), 'items': [], 'children': []} for b in buckets}

    # Assign children to parents
    root_buckets = []
    for bucket_id, bucket_data in bucket_map.items():
        parent_id = bucket_data.get('parent_bucket_id')
        if parent_id and parent_id in bucket_map:
            bucket_map[parent_id]['children'].append(bucket_data)
        else:
            root_buckets.append(bucket_data)

    # Get content for each bucket
    contents = db.query(Content).all()
    for content in contents:
        bucket_id = content.bucket_id
        if bucket_id in bucket_map:
            bucket_map[bucket_id]['items'].append(content.to_dict())

    return {'categories': root_buckets}
```

## Benefits

### For Admins/Managers

✅ **Organized View**: Content organized like desktop file system
✅ **Quick Navigation**: Expand only folders you need to see
✅ **Less Clutter**: Collapsed folders hide content until needed
✅ **Visual Hierarchy**: Nested folders show content relationships
✅ **Familiar Interface**: Works like Windows Explorer or macOS Finder

### For Content Management

✅ **Easy Organization**: Group related content in folders/sub-folders
✅ **Scalable**: Handles thousands of items without overwhelming UI
✅ **Clear Structure**: Folder hierarchy mirrors content organization
✅ **Quick Access**: Expand folder → see contents → act on item

### Technical Benefits

✅ **Performance**: Only expanded folders render their contents
✅ **Backward Compatible**: Existing content library still works
✅ **Flexible**: Supports any nesting depth
✅ **Maintainable**: Clean separation of folder/content logic
✅ **Extensible**: Easy to add features (drag-drop, breadcrumbs, etc.)

## Testing Checklist

### Basic Functionality

- [ ] Folders appear collapsed by default
- [ ] Clicking folder toggles expand/collapse
- [ ] Chevron icon changes direction (right → down)
- [ ] Folder icon changes (closed → open)
- [ ] Item count badge shows correct number
- [ ] Content items appear when folder expanded
- [ ] Content items hide when folder collapsed

### Hierarchical Nesting

- [ ] Nested buckets render under parent
- [ ] Nested buckets have proper indentation
- [ ] Nested buckets can be expanded/collapsed independently
- [ ] Multiple levels of nesting work correctly
- [ ] Visual hierarchy is clear (indents, colors, sizes)

### Content Display

- [ ] All content types show correct icons
- [ ] Resource type tags display properly
- [ ] Metadata shows (type, category, date)
- [ ] Edit, Move, Delete actions work
- [ ] Indentation increases for nested items

### Search & Filter

- [ ] Search maintains folder structure
- [ ] Filtered folders only show matching content
- [ ] Empty folders hide when no matches
- [ ] Tab filtering works with folder view
- [ ] Clearing search restores all folders

### Performance

- [ ] No lag when expanding large folders (100+ items)
- [ ] Smooth animations on expand/collapse
- [ ] Quick state updates
- [ ] No memory leaks on repeated open/close

## Future Enhancements

### 1. Breadcrumb Navigation

Show current location in hierarchy:
```
Home > BWC Training > Career Progression > Module 1
```

### 2. Expand/Collapse All

Buttons to:
- Expand all folders at once
- Collapse all folders at once
- Expand to specific depth level

### 3. Drag & Drop

- Drag content from one folder to another
- Drag folders to reorganize hierarchy
- Visual drop zones with hover effects

### 4. Folder Context Menu

Right-click folder to:
- Rename folder
- Delete folder (move contents to parent)
- Create new sub-folder
- Bulk actions on all contents

### 5. Folder Metadata

Show additional info on folders:
- Total file size
- Last modified date
- Owner/creator
- Description/notes

### 6. Keyboard Navigation

- Arrow keys to navigate folders
- Enter to expand/collapse
- Space to select
- Tab to move between items

### 7. Persist Expand State

Remember which folders were expanded:
- Store in localStorage
- Restore on next visit
- Per-user preferences

## Troubleshooting

### Issue 1: Folders not expanding

**Cause**: State management issue or event handler not triggering

**Solution**:
```javascript
// Check if toggleFolder is being called
const toggleFolder = (folderId) => {
    console.log('Toggling folder:', folderId);
    setExpandedFolders(prev => {
        const newSet = new Set(prev);
        if (newSet.has(folderId)) {
            newSet.delete(folderId);
        } else {
            newSet.add(folderId);
        }
        return newSet;
    });
};
```

### Issue 2: Nested buckets not showing

**Cause**: Backend not returning `children` array

**Solution**:
```javascript
// Check API response in console
console.log('Categories:', displayCategories);

// Should have structure:
// { id, name, items: [...], children: [...] }

// If children missing, update backend or add fallback:
const hasNestedBuckets = category.children && category.children.length > 0;
```

### Issue 3: Icons not changing

**Cause**: Conditional rendering not detecting expand state

**Solution**:
```javascript
// Ensure isExpanded is correctly computed
const isExpanded = expandedFolders.has(category.id);
console.log(`Folder ${category.id} expanded:`, isExpanded);

// Check icon name
<MaterialCommunityIcons
    name={isExpanded ? "folder-open" : "folder"}
    // Should change based on isExpanded
/>
```

### Issue 4: Indentation not working

**Cause**: `indentLevel` not passed correctly

**Solution**:
```javascript
// Ensure indentLevel is passed to renderContentItem
{category.items.map(item => renderContentItem(item, 1))} // Level 1
{childBucket.items.map(item => renderContentItem(item, 2))} // Level 2

// Check style application
const indentWidth = indentLevel * 24;
<View style={[styles.contentItem, { marginLeft: indentWidth }]}>
```

## Summary

The Content Library now features a desktop-like folder interface:

✅ **Collapsible Folders**: Click to expand/collapse
✅ **Hierarchical Nesting**: Support unlimited folder depth
✅ **Visual Hierarchy**: Indentation shows structure
✅ **Smart Icons**: Content type auto-detection
✅ **Desktop-Like UX**: Familiar file explorer feel
✅ **Performance**: Only render expanded folders
✅ **Backward Compatible**: No breaking changes

Admins can now organize content in a clean, intuitive folder structure - just like managing files on their desktop!
