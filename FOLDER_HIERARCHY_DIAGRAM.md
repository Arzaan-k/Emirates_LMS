# 📊 Folder Hierarchy - Visual Diagrams

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   BULK FOLDER UPLOAD                             │
│  Admin uploads: Career/Module1/Week1/video.mp4                  │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                   DATABASE STORAGE                               │
├─────────────────────────────────────────────────────────────────┤
│  course_buckets:                                                 │
│                                                                   │
│  1. id: "career", name: "Career", parent_id: NULL               │
│  2. id: "module1", name: "Module1", parent_id: "career"         │
│  3. id: "week1", name: "Week1", parent_id: "module1"            │
│                                                                   │
│  content:                                                        │
│  1. id: "vid1", title: "video.mp4", bucket_id: "week1"         │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│               BACKEND TREE BUILDING                              │
│  GET /api/v1/content/library/all                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  build_bucket_tree("career"):                                    │
│    ├─ Get bucket "career"                                        │
│    ├─ Find children: ["module1"]                                │
│    ├─ Recurse: build_bucket_tree("module1")                     │
│    │   ├─ Get bucket "module1"                                   │
│    │   ├─ Find children: ["week1"]                              │
│    │   ├─ Recurse: build_bucket_tree("week1")                   │
│    │   │   ├─ Get bucket "week1"                                │
│    │   │   ├─ Find children: []                                 │
│    │   │   ├─ Get items: ["vid1"]                               │
│    │   │   └─ Return: {id, name, items: [vid1], children: []}  │
│    │   └─ Return: {id, name, items: [], children: [week1]}     │
│    └─ Return: {id, name, items: [], children: [module1]}       │
│                                                                   │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                   API RESPONSE                                   │
├─────────────────────────────────────────────────────────────────┤
│  [                                                               │
│    {                                                             │
│      "id": "career",                                             │
│      "name": "Career",                                           │
│      "items": [],                                                │
│      "children": [                                               │
│        {                                                         │
│          "id": "module1",                                        │
│          "name": "Module1",                                      │
│          "items": [],                                            │
│          "children": [                                           │
│            {                                                     │
│              "id": "week1",                                      │
│              "name": "Week1",                                    │
│              "items": [{...video...}],                           │
│              "children": []                                      │
│            }                                                     │
│          ]                                                       │
│        }                                                         │
│      ]                                                           │
│    }                                                             │
│  ]                                                               │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│              FRONTEND RECURSIVE RENDERING                        │
│  Components/ContentLibraryModal.js                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  renderFolderTree(career, depth=0):                             │
│    ├─ Render folder header with indent: 0px                     │
│    ├─ IF expanded:                                               │
│    │   ├─ For each child in children:                           │
│    │   │   └─ renderFolderTree(module1, depth=1)                │
│    │   │       ├─ Render folder header with indent: 20px        │
│    │   │       ├─ IF expanded:                                   │
│    │   │       │   └─ renderFolderTree(week1, depth=2)          │
│    │   │       │       ├─ Render folder header: indent 40px     │
│    │   │       │       └─ Render items: [video.mp4]             │
│    │   │       └─ ...                                            │
│    │   └─ Render items in this folder                           │
│    └─ ...                                                        │
│                                                                   │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                   UI DISPLAY                                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  📁 Career Progression (25)          ← depth 0, indent 0px      │
│    📁 Module 1 (15)                  ← depth 1, indent 20px     │
│      📁 Week 1 (8)                   ← depth 2, indent 40px     │
│        📄 video.mp4                  ← depth 3, indent 60px     │
│        📄 quiz.json                                              │
│      📁 Week 2 (7)                                               │
│    📁 Module 2 (10)                                              │
│  📁 Self Learning (12)                                           │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Flow - Detailed

### Upload → Storage → Display

```
STEP 1: ADMIN UPLOADS
─────────────────────
Uploads folder structure:

BWC/
├── Career/
│   ├── Module1/
│   │   ├── Week1/
│   │   │   ├── intro.mp4
│   │   │   └── quiz.json
│   │   └── Week2/
│   │       └── lesson.pdf
│   └── Module2/
│       └── assessment.mp4
└── Self-Learning/
    └── bonus.mp4


STEP 2: BACKEND PROCESSING
──────────────────────────
POST /api/v1/content/bulk-upload

For each file path:
  "Career/Module1/Week1/intro.mp4"

  Parse hierarchy:
    root: "Career"
    folders: ["Module1", "Week1"]
    file: "intro.mp4"

  Create buckets:
    1. Career (parent: NULL)
    2. Module1 (parent: Career)
    3. Week1 (parent: Module1)

  Store file:
    - Upload to S3
    - Create content record
    - Link to bucket: Week1


STEP 3: DATABASE STATE
──────────────────────
course_buckets:
┌────────┬────────┬──────────┬─────────────┐
│ id     │ name   │ parent   │ folder_path │
├────────┼────────┼──────────┼─────────────┤
│ bwc    │ BWC    │ NULL     │ BWC         │
│ career │ Career │ bwc      │ BWC/Career  │
│ mod1   │ Module1│ career   │ BWC/.../M1  │
│ week1  │ Week1  │ mod1     │ BWC/.../W1  │
│ week2  │ Week2  │ mod1     │ BWC/.../W2  │
│ mod2   │ Module2│ career   │ BWC/.../M2  │
│ self   │ Self   │ bwc      │ BWC/Self    │
└────────┴────────┴──────────┴─────────────┘

content:
┌────────┬────────────┬───────────┐
│ id     │ title      │ bucket_id │
├────────┼────────────┼───────────┤
│ v1     │ intro.mp4  │ week1     │
│ q1     │ quiz.json  │ week1     │
│ p1     │ lesson.pdf │ week2     │
│ v2     │ assess.mp4 │ mod2      │
│ v3     │ bonus.mp4  │ self      │
└────────┴────────────┴───────────┘


STEP 4: TREE BUILDING
─────────────────────
GET /api/v1/content/library/all

Algorithm:
  1. Fetch all buckets
  2. Fetch all content
  3. Build bucket_map: {id: bucket}
  4. Find roots: buckets with parent = NULL
  5. For each root:
       build_tree(root_id)

  build_tree(bucket_id):
    - Get bucket
    - Get items WHERE bucket_id = this.id
    - Get children WHERE parent_id = this.id
    - For each child:
        child_tree = build_tree(child.id)  # RECURSION
    - Return {id, name, items, children: [child_trees]}


Result:
{
  "bwc": {
    items: [],
    children: [
      {
        "career": {
          items: [],
          children: [
            {
              "mod1": {
                items: [],
                children: [
                  {"week1": {items: [intro, quiz], children: []}},
                  {"week2": {items: [lesson], children: []}}
                ]
              }
            },
            {"mod2": {items: [assess], children: []}}
          ]
        }
      },
      {"self": {items: [bonus], children: []}}
    ]
  }
}


STEP 5: FRONTEND RENDERING
──────────────────────────
renderFolderTree(bwc, 0):
  Render: 📁 BWC (indent: 0px)
  IF expanded:
    renderFolderTree(career, 1):
      Render: 📁 Career (indent: 20px)
      IF expanded:
        renderFolderTree(mod1, 2):
          Render: 📁 Module1 (indent: 40px)
          IF expanded:
            renderFolderTree(week1, 3):
              Render: 📁 Week1 (indent: 60px)
              IF expanded:
                renderItem(intro, 4)  → 📄 intro.mp4 (80px)
                renderItem(quiz, 4)   → 📄 quiz.json (80px)
            renderFolderTree(week2, 3):
              Render: 📁 Week2 (indent: 60px)
              IF expanded:
                renderItem(lesson, 4) → 📄 lesson.pdf (80px)
        renderFolderTree(mod2, 2):
          Render: 📁 Module2 (indent: 40px)
          ...
    renderFolderTree(self, 1):
      Render: 📁 Self (indent: 20px)
      ...


STEP 6: USER SEES
────────────────
📁 BWC (5)
  📁 Career Progression (4)
    📁 Module 1 (3)
      📁 Week 1 (2)
        📄 intro.mp4
        📄 quiz.json
      📁 Week 2 (1)
        📄 lesson.pdf
    📁 Module 2 (1)
      📄 assessment.mp4
  📁 Self Learning (1)
    📄 bonus.mp4
```

---

## Recursive Algorithm Visualization

### Backend Tree Building

```
build_bucket_tree("career"):
│
├─ 1. Get bucket object: {id: "career", name: "Career", ...}
│
├─ 2. Get direct items:
│     content.filter(item => item.bucket_id === "career")
│     Result: []  (no items directly in Career folder)
│
├─ 3. Find child buckets:
│     buckets.filter(b => b.parent_id === "career")
│     Result: ["module1", "module2"]
│
├─ 4. Recursively build children:
│  ┌─────────────────────────────────────────┐
│  │ build_bucket_tree("module1"):           │
│  │ ├─ Get bucket                            │
│  │ ├─ Get items: []                         │
│  │ ├─ Find children: ["week1", "week2"]    │
│  │ ├─ Recurse:                              │
│  │ │  ┌──────────────────────────────────┐ │
│  │ │  │ build_bucket_tree("week1"):      │ │
│  │ │  │ ├─ Get bucket                     │ │
│  │ │  │ ├─ Get items: [intro, quiz]      │ │
│  │ │  │ ├─ Find children: []              │ │
│  │ │  │ └─ Return: {                      │ │
│  │ │  │      items: [intro, quiz],        │ │
│  │ │  │      children: [],                │ │
│  │ │  │      total_count: 2               │ │
│  │ │  │    }                               │ │
│  │ │  └──────────────────────────────────┘ │
│  │ │  ┌──────────────────────────────────┐ │
│  │ │  │ build_bucket_tree("week2"):      │ │
│  │ │  │ ├─ Get bucket                     │ │
│  │ │  │ ├─ Get items: [lesson]            │ │
│  │ │  │ ├─ Find children: []              │ │
│  │ │  │ └─ Return: {                      │ │
│  │ │  │      items: [lesson],             │ │
│  │ │  │      children: [],                │ │
│  │ │  │      total_count: 1               │ │
│  │ │  │    }                               │ │
│  │ │  └──────────────────────────────────┘ │
│  │ └─ Return: {                             │
│  │      items: [],                          │
│  │      children: [week1_tree, week2_tree], │
│  │      total_count: 3                      │
│  │    }                                      │
│  └─────────────────────────────────────────┘
│  ┌─────────────────────────────────────────┐
│  │ build_bucket_tree("module2"):           │
│  │ ├─ Get bucket                            │
│  │ ├─ Get items: [assessment]               │
│  │ ├─ Find children: []                     │
│  │ └─ Return: {                             │
│  │      items: [assessment],                │
│  │      children: [],                       │
│  │      total_count: 1                      │
│  │    }                                      │
│  └─────────────────────────────────────────┘
│
└─ 5. Return final tree:
   {
     id: "career",
     name: "Career",
     items: [],
     children: [module1_tree, module2_tree],
     total_count: 4  (3 + 1)
   }
```

### Frontend Recursive Rendering

```
renderFolderTree(career, depth=0):
│
├─ Calculate: indentLeft = 0 * 20 = 0px
├─ Calculate: iconSize = 22 - 0*2 = 22px
│
├─ Render Header:
│  ┌──────────────────────────────────┐
│  │ > 📁 Career Progression (4)     │  ← TouchableOpacity
│  └──────────────────────────────────┘
│
├─ IF expanded (expandedFolders.has("career")):
│  │
│  ├─ Render Children:
│  │  ┌─────────────────────────────────────────────┐
│  │  │ renderFolderTree(module1, depth=1):         │
│  │  │ ├─ indentLeft = 1 * 20 = 20px               │
│  │  │ ├─ iconSize = 22 - 1*2 = 20px               │
│  │  │ ├─ Render Header:                            │
│  │  │ │  ┌──────────────────────────────────┐     │
│  │  │ │  │   > 📁 Module 1 (3)              │     │
│  │  │ │  └──────────────────────────────────┘     │
│  │  │ ├─ IF expanded:                              │
│  │  │ │  │                                          │
│  │  │ │  ├─ Render Children:                       │
│  │  │ │  │  renderFolderTree(week1, depth=2):      │
│  │  │ │  │    indentLeft = 40px                    │
│  │  │ │  │    iconSize = 18px                      │
│  │  │ │  │    [Render header + items]              │
│  │  │ │  │                                          │
│  │  │ │  │  renderFolderTree(week2, depth=2):      │
│  │  │ │  │    indentLeft = 40px                    │
│  │  │ │  │    [Render header + items]              │
│  │  │ │  │                                          │
│  │  │ │  └─ Render Items: [] (none)                │
│  │  │ └─ ...                                        │
│  │  └─────────────────────────────────────────────┘
│  │  ┌─────────────────────────────────────────────┐
│  │  │ renderFolderTree(module2, depth=1):         │
│  │  │ [Similar recursion...]                       │
│  │  └─────────────────────────────────────────────┘
│  │
│  └─ Render Items: [] (none in root Career folder)
│
└─ Done
```

---

## State Management

### Expand/Collapse State

```
Initial State:
expandedFolders = new Set()  // Empty - all collapsed

User clicks "Career":
expandedFolders = new Set(["career"])

User clicks "Module 1":
expandedFolders = new Set(["career", "module1"])

User clicks "Week 1":
expandedFolders = new Set(["career", "module1", "week1"])

User clicks "Career" again (collapse):
expandedFolders = new Set(["module1", "week1"])
Note: Children stay expanded (independent state)

User clicks "Module 1" (collapse):
expandedFolders = new Set(["week1"])
```

### Search Filter State

```
Initial:
searchQuery = ""
displayCategories = [all folders with all items]

User types "intro":
searchQuery = "intro"

filterFolderTree(career):
  ├─ Filter items: [] (no "intro" at root)
  ├─ Filter children:
  │  └─ filterFolderTree(module1):
  │      ├─ Filter items: [] (no "intro" here)
  │      ├─ Filter children:
  │      │  └─ filterFolderTree(week1):
  │      │      ├─ Filter items: [intro.mp4] ✓ MATCH
  │      │      └─ Return: {items: [intro], children: [], total: 1}
  │      └─ Return: {items: [], children: [week1], total: 1}
  └─ Return: {items: [], children: [module1], total: 1}

displayCategories = [{
  id: "career",
  items: [],
  children: [{
    id: "module1",
    items: [],
    children: [{
      id: "week1",
      items: [intro.mp4],
      children: []
    }]
  }],
  total_count: 1
}]
```

---

## Comparison: Before vs After

### Before (Flat)

```
API Response:
[
  {id: "career", name: "Career", items: [intro, quiz, lesson, assess]},
  {id: "self", name: "Self", items: [bonus]}
]

UI Display:
📁 Career (4)
  📄 intro.mp4
  📄 quiz.json
  📄 lesson.pdf
  📄 assessment.mp4
📁 Self (1)
  📄 bonus.mp4

Problem: No folder structure visible!
```

### After (Hierarchical)

```
API Response:
[
  {
    id: "career",
    name: "Career",
    items: [],
    children: [
      {
        id: "module1",
        items: [],
        children: [
          {id: "week1", items: [intro, quiz], children: []},
          {id: "week2", items: [lesson], children: []}
        ]
      },
      {id: "module2", items: [assess], children: []}
    ]
  },
  {id: "self", name: "Self", items: [bonus], children: []}
]

UI Display:
📁 Career (4)
  📁 Module 1 (3)
    📁 Week 1 (2)
      📄 intro.mp4
      📄 quiz.json
    📁 Week 2 (1)
      📄 lesson.pdf
  📁 Module 2 (1)
    📄 assessment.mp4
📁 Self (1)
  📄 bonus.mp4

Solution: Full hierarchy preserved! ✅
```

---

**Perfect hierarchy visualization complete! 📊✨**
