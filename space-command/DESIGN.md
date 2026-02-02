# Space Command Architecture

Space Command is a task management plugin that scans markdown files for tagged items (`#todo`, `#todone`, `#idea`, `#principle`) and provides interactive views for managing them. The architecture follows an event-driven pattern with clear separation between data scanning, mutation, and rendering layers.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    SpaceCommandPlugin (main.ts)                 │
│                    Entry point & component wiring               │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        │                         │                         │
        ▼                         ▼                         ▼
┌───────────────┐       ┌─────────────────┐       ┌─────────────────┐
│  TodoScanner  │       │  TodoProcessor  │       │ ProjectManager  │
│  (Data Layer) │◀─────▶│ (Mutation Layer)│       │ (Aggregation)   │
└───────┬───────┘       └────────┬────────┘       └─────────────────┘
        │                        │
        │ todos-updated          │ triggers rescan
        │ event                  │
        ▼                        ▼
┌───────────────────────────────────────────────────────────────────┐
│                        Rendering Layer                            │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │EmbedRenderer │  │ SidebarView  │  │ CodeBlockProcessor     │  │
│  │({{focus-*}}) │  │ (Sidebar UI) │  │ (```focus-* blocks)    │  │
│  └──────────────┘  └──────────────┘  └────────────────────────┘  │
└───────────────────────────────────────────────────────────────────┘
```

## Core Components

### TodoScanner (`src/TodoScanner.ts`)

The scanner is the single source of truth for vault state. It:

- Scans markdown files for tagged items
- Maintains four separate caches (todos, todones, ideas, principles)
- Tracks header-child relationships for hierarchical TODOs
- Watches file system changes with 100ms debouncing
- Emits `todos-updated` events for reactive UI updates
- Skips code blocks and inline code to avoid false positives

**Key data structures:**
```typescript
private todosCache: Map<string, TodoItem[]>
private todonesCache: Map<string, TodoItem[]>
private ideasCache: Map<string, TodoItem[]>
private principlesCache: Map<string, TodoItem[]>
```

### TodoProcessor (`src/TodoProcessor.ts`)

Handles all file mutations:

- Complete/uncomplete TODOs (replace tags, mark checkboxes, log to TODONE file)
- Complete header TODOs with their child items
- Convert ideas to TODOs
- Manage priority tags (#p0-#p4, #focus, #future)
- Batch operations for project-level actions

After each mutation, the processor triggers a rescan to keep the cache consistent.

### ProjectManager (`src/ProjectManager.ts`)

Groups TODOs by project tags:

- Extracts project tags (all tags except reserved ones like #todo, #focus, priorities)
- Falls back to inferred file tags when no explicit tags exist
- Calculates per-project statistics (count, last activity, highest priority)
- Sorts projects by activity score

### EmbedRenderer (`src/EmbedRenderer.ts`)

Renders interactive TODO lists in markdown embeds:

- Parses `{{focus-todos}}`, `{{focus-ideas}}`, `{{focus-list}}` syntax
- Supports filter syntax: `path:`, `tags:`, `limit:`, `todone:`
- Renders checkboxes with click handlers
- Listens to `todos-updated` for automatic refresh
- Uses DOM methods (not innerHTML) for XSS safety

### SidebarView (`src/SidebarView.ts`)

Custom Obsidian sidebar panel:

- Two tabs: TODOs and IDEAS
- TODOs tab: Active items, projects list, recent completions
- IDEAS tab: Focused ideas, active ideas, principles
- Interactive list items with context menus
- Project filtering

### ContextMenuHandler (`src/ContextMenuHandler.ts`)

Manages right-click menus:

- TODO menu: Focus/Later/Snooze/Copy actions
- Idea menu: Convert to TODO, Focus, Copy
- Principle menu: Copy only
- Project menu: Batch operations on all items with tag

## Data Flow

### TODO Completion

```
1. User clicks checkbox
2. Handler calls processor.completeTodo()
3. Processor reads file, updates line (#todo → #todone @date)
4. Marks checkbox [x]
5. Appends to TODONE file
6. Triggers rescan
7. Scanner emits todos-updated
8. UI components re-render
```

### Priority Change

```
1. User right-clicks → "Focus"
2. ContextMenuHandler shows menu
3. Click calls processor.setPriorityTag()
4. Processor removes old priority, adds new one
5. Rescans file
6. Scanner emits todos-updated
7. Items reorder by new priority
```

## Data Model

```typescript
interface TodoItem {
  file: TFile;
  filePath: string;
  folder: string;
  lineNumber: number;           // 0-indexed line in file
  text: string;                 // Full line text
  hasCheckbox: boolean;
  tags: string[];
  dateCreated: number;
  isHeader?: boolean;
  headerLevel?: number;
  parentLineNumber?: number;    // If this is a child item
  childLineNumbers?: number[];  // If this is a header with children
  itemType?: 'todo' | 'todone' | 'idea' | 'principle';
  inferredFileTag?: string;
}
```

## Priority System

Priority is encoded numerically for sorting (lower value = higher priority):

| Tag              | Value | Meaning                              |
|------------------|-------|--------------------------------------|
| `#today`         | 1     | Time-sensitive, due today            |
| `#p0`            | 2     | Highest priority                     |
| `#p1`            | 3     | High priority                        |
| `#p2`            | 4     | Medium-high priority                 |
| `#p3`            | 5     | Medium-low priority                  |
| `#p4`            | 6     | Low priority                         |
| `#focus` (alone) | 7     | Focused but no explicit priority     |
| No priority      | 8     | Unmarked items                       |
| `#future`/`#snooze` | 9  | Snoozed/deferred items               |

### Key behaviours

**`#focus` is a visibility filter, not a priority level.** The `#focus` tag marks items for focus mode filtering—it shows what you want to work on now, not necessarily what's most important. If an item has both `#focus` and a priority tag (e.g., `#focus #p0`), the priority tag determines sort order.

**Header TODOs sort by average child priority.** A header like `## Project #todo` with children sorts based on the average priority of its active child items, not the tags on the header line. This prevents high-priority standalone items from being buried below low-priority header blocks.

**Unprioritized items sort low.** Items without any priority tag sort after `#p4` but before snoozed items. This encourages explicit prioritization.

### Priority in projects

Projects track two priority-related fields:
- `highestPriority`: The best (lowest) priority value among all items in the project
- `hasFocusItems`: Whether any item in the project has the `#focus` tag

In focus mode, projects filter to show only those with `hasFocusItems = true`.

## Filter Syntax

Embeds support filtering:

```markdown
{{focus-todos | path:projects/ tags:#api,#urgent limit:10 todone:show}}
```

- `path:` - Match files in path
- `tags:` - Match items with ALL specified tags (AND logic)
- `limit:` - Maximum items to display
- `todone:` - Show or hide completed items

## Event System

The scanner extends Obsidian's `Events` class and acts as the event bus:

```typescript
// Scanner emits
this.trigger('todos-updated');

// Components listen
scanner.on('todos-updated', () => this.render());
```

This decouples components—the scanner doesn't know about the sidebar, and the sidebar doesn't know about embeds.

## Editor Suggestions

Two suggester classes provide inline editing assistance:

- **SlashCommandSuggest**: `/todo`, `/today`, `/callout` commands at line start
- **DateSuggest**: `@date`, `@today`, `@tomorrow` date insertion

## File Organization

```
space-command/
├── main.ts              # Plugin entry, initialization
├── src/
│   ├── TodoScanner.ts   # Vault scanning & caching
│   ├── TodoProcessor.ts # File mutations
│   ├── ProjectManager.ts # Project grouping
│   ├── EmbedRenderer.ts # Embed rendering
│   ├── SidebarView.ts   # Sidebar UI
│   ├── CodeBlockProcessor.ts # Code block rendering
│   ├── ContextMenuHandler.ts # Right-click menus
│   ├── FilterParser.ts  # Filter syntax parsing
│   ├── SlashCommandSuggest.ts # / commands
│   ├── DateSuggest.ts   # @ date suggestions
│   ├── SlackConverter.ts # Markdown → Slack mrkdwn
│   └── types.ts         # Interfaces & types
├── styles.css           # Plugin styles
└── manifest.json        # Obsidian plugin manifest
```

## Design Decisions

### Event-Driven Updates

Rather than a centralized state management library, components communicate through events. This keeps the codebase simple and leverages Obsidian's built-in event system.

### Line-Number Based Mutations

Items store their exact line numbers for precise file updates. After any mutation, the file is rescanned to maintain accuracy (line numbers can shift).

### Debounced Scanning

File watching uses 100ms debouncing to prevent cascading scans when files change rapidly.

### DOM-Based Rendering

All rendering uses DOM methods (`createEl`, `appendText`) rather than innerHTML to prevent XSS vulnerabilities.

### Header-Child Relationships

Header TODOs (e.g., `## Task Name #todo`) can have child list items. Completing the header completes all children.

## Extension Points

The architecture supports extension through:

1. **New item types**: Add to scanner parsing, processor methods, and UI rendering
2. **Custom filters**: Extend FilterParser
3. **New slash commands**: Add to SlashCommandSuggest
4. **Context menu actions**: Extend ContextMenuHandler
5. **New embed types**: Create renderers following EmbedRenderer patterns
