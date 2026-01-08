# Weekly Log Helpers Plugin - Implementation Plan

## Core Requirements Summary

### TODO/TODONE System
- **Detection**: Scan vault for any line with `#todo` tag
- **Sorting**: By date created (track file modified time, folder, tags internally)
- **Completion**: Change `#todo` → `#todone @YYYY-MM-DD`, mark checkbox `[x]` if present
- **Logging**: Append to TODONE file (create if doesn't exist)

### Embed Syntax
```
{{focus-todos: todos/done.md}}
{{focus-todos: done.md | path:projects/ tags:#work limit:10}}
```
- Works in any markdown file
- Supports filters: `path:`, `tags:`, `limit:`
- Renders interactive checklist with `→` links to source:line

### Sidebar
- Visible by default (can be toggled)
- Two sections: **Active TODOs** | **Recent TODONEs**
- Interactive checkboxes
- Click `→` to jump to source

### Commands & Shortcuts
- Toggle sidebar
- Quick-add TODO
- (More as needed)

---

## Plugin Architecture

### Project Structure
```
_plugins/weekly-log-helpers/
├── manifest.json          # Plugin metadata
├── main.ts               # Entry point
├── styles.css            # Plugin styles
├── package.json          # Dependencies
├── tsconfig.json         # TypeScript config
├── esbuild.config.mjs    # Build config
└── src/
    ├── TodoScanner.ts     # Vault scanning & TODO detection
    ├── TodoProcessor.ts   # Completion & file updates
    ├── EmbedRenderer.ts   # {{focus-todos}} rendering
    ├── FilterParser.ts    # Parse filter parameters
    ├── SidebarView.ts     # Sidebar UI component
    ├── types.ts           # Shared interfaces
    └── utils.ts           # Helper functions
```

### Data Model
```typescript
interface TodoItem {
  file: TFile;
  filePath: string;
  folder: string;
  lineNumber: number;
  text: string;
  hasCheckbox: boolean;
  tags: string[];        // All tags on the line
  dateCreated: number;   // File mtime as proxy
}
```

---

## Component Specifications

### 1. TodoScanner
**Responsibilities:**
- Scan all markdown files for `#todo` and `#todone`
- Cache results for performance
- Listen for file changes and update cache
- Sort TODOs by date created

**Key Methods:**
- `scanVault()` - Initial scan on plugin load
- `scanFile(file)` - Scan single file for TODOs
- `getTodos()` - Return sorted active TODOs
- `getTodones(limit?)` - Return recent TODONEs
- `watchFiles()` - Set up file change listeners

### 2. FilterParser
**Responsibilities:**
- Parse filter syntax from embed parameters
- Apply filters to TODO list

**Syntax:**
- `path:folder/subfolder/` - Match files in path
- `tags:#tag1,#tag2` - Match additional tags
- `limit:N` - Limit results

**Example:**
```typescript
const filters = FilterParser.parse("path:projects/ tags:#urgent,#work limit:5");
// Returns: { path: "projects/", tags: ["#urgent", "#work"], limit: 5 }
```

### 3. TodoProcessor
**Responsibilities:**
- Handle TODO completion
- Update source files
- Log to TODONE file

**Flow:**
1. User checks TODO in embed/sidebar
2. Read source file
3. Update line: `#todo` → `#todone @2026-01-07`
4. If checkbox exists, mark `[x]`
5. Append to TODONE log file (create if needed)
6. Emit event to refresh UI

### 4. EmbedRenderer
**Responsibilities:**
- Detect `{{focus-todos: ...}}` syntax
- Parse parameters
- Render interactive checklist
- Handle checkbox clicks

**Implementation:**
- Use `registerMarkdownCodeBlockProcessor()` or custom post-processor
- Render checkboxes with click handlers
- Add `→` links with `app.workspace.openLinkText()` to line number
- Re-render on TODO updates

### 5. SidebarView
**Responsibilities:**
- Display Active TODOs section
- Display Recent TODONEs section (collapsible)
- Handle interactions

**Layout:**
```
┌─────────────────────────────┐
│ Weekly Log Helpers          │
├─────────────────────────────┤
│ ▼ Active TODOs (12)         │
│   □ Task 1 →                │
│   □ Task 2 →                │
│   □ Task 3 →                │
├─────────────────────────────┤
│ ▶ Recent TODONEs (5)        │
└─────────────────────────────┘
```

---

## Commands & Keyboard Shortcuts

| Command | Default Shortcut | Action |
|---------|-----------------|--------|
| Toggle TODO Sidebar | `Ctrl/Cmd+Shift+T` | Show/hide sidebar |
| Quick Add TODO | `Ctrl/Cmd+Shift+A` | Insert `#todo` at cursor |
| Refresh TODOs | - | Force rescan vault |

---

## Development Steps

1. **Setup** - Initialize plugin structure, manifest.json, build config
2. **TodoScanner** - Core TODO detection and tracking
3. **FilterParser** - Parse embed filter syntax
4. **TodoProcessor** - Handle completion logic
5. **EmbedRenderer** - Render {{focus-todos}} blocks
6. **SidebarView** - Build sidebar UI
7. **Commands** - Add keyboard shortcuts
8. **Polish** - Styling, error handling, edge cases
9. **Testing** - Test in actual vault with real TODOs

---

## Technical Considerations

- **Performance**: Cache TODO scan results, only rescan on file changes
- **File Safety**: Always backup before modifying source files
- **Line Numbers**: Account for lines being added/removed between scans
- **Obsidian API**: Use official APIs (`app.vault`, `app.workspace`, `registerView`)
- **Live Preview**: Ensure embeds work in both reading and live preview modes

---

## User Preferences from Discussion

- **Embed scope**: Any markdown file in the vault
- **Source update behavior**: Add [x] checkbox and change tag when completing
- **Log format**: Simple chronological append
- **Sidebar layout**: Separate sections (Active TODOs / Recent TODONEs)
- **No checkbox handling**: Leave as plain text, just change tag
- **Link target**: Link to specific line
- **Filtering**: Support basic filters (path, tags, limit)
- **Plugin structure**: Single 'Weekly Log Helpers' plugin
- **Sorting**: Initially by date, track file/folder/tags for future filtering
- **TODONE file**: Create if doesn't exist
- **Sidebar visibility**: Visible by default, toggleable
- **Keyboard shortcuts**: Yes
