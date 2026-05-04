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

**`#focus` is a preference for the focus queue.** The `#focus` tag marks items as candidates for the immersive Focus Mode card — it's what you want to work on now. If no `#focus` items exist, focus mode falls back to the highest-priority active TODOs (with a hint shown on the card). If an item has both `#focus` and a priority tag (e.g., `#focus #p0`), the priority tag determines order within the focus queue.

**Header TODOs sort by average child priority.** A header like `## Project #todo` with children sorts based on the average priority of its active child items, not the tags on the header line. This prevents high-priority standalone items from being buried below low-priority header blocks.

**Unprioritized items sort low.** Items without any priority tag sort after `#p4` but before snoozed items. This encourages explicit prioritization.

### Immersive Focus Mode

A sidebar-replacing single-task surface. When toggled on, the sidebar's normal content (tabs, summary, project list, TODO list) is hidden and replaced by a focus card showing one TODO at a time. Done advances the queue; Skip rotates the active item to the back of the queue; the in-card **Exit focus mode** link restores the sidebar.

#### Entry and exit

- **Entry:** Eye icon in the TODOs tab's Projects section header. Single-click flips `focusModeActive` and re-renders.
- **Exit:** "Exit focus mode" text link below the Done/Skip actions inside the focus card. Sets `focusModeActive` to `false`, restores the prior tab and scroll position.

The eye icon never appears in active state — when focus mode is on, the entire sidebar chrome (including the icon) is hidden. The icon is only visible from the normal sidebar, where it always means "enter focus mode."

#### Queue computation

Queue construction lives in `buildFocusQueue` (`src/utils.ts`). Pseudocode:

```
queue = activeTodos
  .filter(t => t.parentLineNumber === undefined && !isSnoozed(t.tags))

if queue.empty:
  return { items: [], source: 'empty' }

if not options.forceFallback:
  focused = queue.filter(t => isEffectivelyFocused(t, allTodos))
  if focused.nonEmpty:
    return {
      items: focused.sort(compareWithEffectivePriority).slice(0, limit),
      source: 'focus-tagged',
    }

return {
  items: queue.sort(comparePriorityOnly).slice(0, limit),
  source: 'priority-fallback',
}
```

Notes:

- Only top-level items are queue candidates — children of headers are never independent entries. A header TODO with focused children is one queue entry; the children render inline inside the card.
- Snoozed items (`#future`, `#snooze`, `#snoozed`) are excluded.
- `compareWithEffectivePriority` keeps `#focus` items above non-focused ones; `comparePriorityOnly` is focus-tier-agnostic and is used only by the priority-fallback path so `#focus`-tagged items don't dominate when continuing into priority.
- `forceFallback: true` skips the curated `#focus` filter entirely. Used by the "Continue with next priority task" path.

#### State machine

```
[off] -- toggle on, #focus items exist --> [active, focus-tagged queue]
[off] -- toggle on, no #focus items, priority items exist --> [active, priority-fallback queue]
[off] -- toggle on, no active TODOs at all --> [active, empty state]
[active, focus-tagged] -- Done on last #focus item --> [active, completion state]
[active, completion state] -- Exit --> [off]
[active, completion state] -- Continue --> [active, priority queue (forceFallback)]
[active, priority-fallback] -- Done on last item --> [active, empty state]
[active, *] -- Exit --> [off]
[active] -- Skip --> [active] (head rotates to tail; rotateQueue helper)
```

`FocusQueueState` (in `src/types.ts`) holds `{ items, source, inContinueMode }`. The state is rebuilt from scratch whenever the underlying TODO data changes (`todos-updated` event in the scanner invalidates `focusQueue` and re-renders). Skip is the only operation that mutates the in-memory queue without rebuilding.

#### Settings

| Setting | Default | Range | Purpose |
|---|---|---|---|
| `focusQueueLimit` | `1` | 1–5 | Max items shown at once. Slider in settings tab. |
| `focusModePersist` | `true` | — | Whether `focusModeActive` survives session restart. When `false`, `focusModeActive` is reset to `false` on plugin load. |
| `focusModeActive` | `false` | — | Persisted on/off state. Mutated by entry/exit handlers via the `setFocusModeActive` callback passed into the view. Not exposed as a user-facing setting. |

Priority fallback is always on (no setting). The hint "No focus items — showing top priority" is rendered on the card whenever the queue source is `priority-fallback`.

#### Class and file touchpoints

- `src/utils.ts`: `buildFocusQueue`, `getItemDate`, `comparePriorityOnly`, `rotateQueue`, `isEffectivelyFocused`.
- `src/types.ts`: `FocusQueueResult`, `FocusQueueSource`, `FocusQueueState`, `ItemDate`, `ItemDateKind`.
- `src/SidebarView.ts`: `renderFocusCard`, `renderFocusItem`, `renderFocusCompletion`, `renderFocusEmpty`, `getActiveTodosForFocus`, `rebuildFocusQueue`, `getFocusVisibleTags`, plus `handleFocusEnter` / `handleFocusExit` / `handleFocusSkip` / `handleFocusContinue` / `handleFocusDone`.
- `main.ts`: `setFocusModeActive` callback that writes to settings and saves; load-time reset for `focusModePersist=false`.
- `styles.css`: `.sidebar-focus-mode-active` (font scale + chrome hidden via not-rendered, not via CSS) and `.focus-card-*` classes.

#### Out of scope (v1)

- Custom keyboard shortcuts for Done/Skip/Exit (standard tab+Enter/Space works).
- Multi-entry mode for header TODOs (header + children = single entry).
- Animations on advance.
- Surrounding-context preview from the source file.
- Configurable font scale.

### Priority in projects

Projects track two priority-related fields:
- `highestPriority`: The best (lowest) priority value among all items in the project
- `hasFocusItems`: Whether any item in the project has the `#focus` tag

`hasFocusItems` is used as a sort tier — projects with focus items sort first.

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
