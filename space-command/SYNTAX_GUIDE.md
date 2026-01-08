# Space Command Syntax Guide

Complete reference for embedding TODO lists and project focus lists in your Obsidian vault.

## Overview

Space Command supports two syntax styles for embedding TODO lists:

1. **Inline syntax** (`{{focus-todos}}`) - Works in Reading Mode only
2. **Code block syntax** (````focus-todos````) - Works in both Reading Mode and Live Preview

Both produce identical interactive TODO lists with checkboxes and source links.

## When to Use Each Syntax

### Use Inline Syntax When:
- Quick, simple embeds
- You primarily work in Reading Mode
- Single-line embeds inline with text
- Backward compatibility with existing notes

### Use Code Block Syntax When:
- Working in Live Preview mode (recommended)
- Complex filter combinations (multi-line is clearer)
- You want embeds to render while editing
- Creating new notes and embeds

**Recommendation:** Use code blocks for new notes. They provide a better experience by working in both modes.

---

## Inline Syntax Reference

### Basic Inline Syntax

```markdown
{{focus-todos}}
```
Uses default TODONE file from settings.

### Custom TODONE File

```markdown
{{focus-todos: todos/done.md}}
```

### With Filters

```markdown
{{focus-todos | path:projects/ tags:#urgent limit:10}}
```

### Combined File and Filters

```markdown
{{focus-todos: todos/done.md | path:projects/ tags:#urgent limit:10}}
```

### Focus List

```markdown
{{focus-list}}
```
Shows top projects by TODO count. No parameters supported.

---

## Code Block Syntax Reference

### Basic Code Block

Empty block uses all defaults:
````markdown
```focus-todos
```
````

### File Path Specification

First line is TODONE file path:
````markdown
```focus-todos
todos/work-done.md
```
````

### Filter Syntax

#### Single-Line Filters
````markdown
```focus-todos
path:projects/ tags:#urgent limit:5
```
````

#### Multi-Line Filters (Recommended for Clarity)
````markdown
```focus-todos
todos/done.md
path:projects/work/
tags:#urgent,#today
limit:10
```
````

#### Combined Single-Line Format
Matches inline syntax for consistency:
````markdown
```focus-todos
todos/done.md | path:projects/ tags:#urgent limit:10
```
````

### Focus List

No parameters supported:
````markdown
```focus-list
```
````

---

## Filter Reference

All filters work identically in both inline and code block syntax.

### path: Filter

**Syntax:** `path:folder/subfolder/`

**Behavior:**
- Case-insensitive prefix match
- Matches any TODO whose file path starts with the specified path
- Trailing slash optional but recommended for clarity

**Examples:**
- `path:projects/` - Matches all TODOs in `projects/` and subfolders
- `path:work/urgent/` - Matches `work/urgent/task.md` but not `work/todo.md`
- `path:log/2024/` - Matches all TODOs in 2024 log entries

### tags: Filter

**Syntax:** `tags:#tag1,#tag2`

**Behavior:**
- AND logic - all specified tags must be present
- Case-insensitive matching
- Comma-separated for multiple tags
- Hash (#) required for each tag

**Examples:**
- `tags:#urgent` - Only TODOs with #urgent tag
- `tags:#urgent,#work` - TODOs with BOTH #urgent AND #work
- `tags:#MFA,#todo` - TODOs with both #MFA and #todo (redundant since all have #todo)

**Note:** To match TODOs with ANY of several tags (OR logic), create multiple embeds.

### limit: Filter

**Syntax:** `limit:N`

**Behavior:**
- Returns first N results after other filters applied
- Must be a positive integer
- Applied after path and tags filters

**Examples:**
- `limit:5` - Show maximum 5 TODOs
- `limit:1` - Show only the first TODO
- `limit:100` - Show up to 100 TODOs

### Combining Filters

Filters can be combined in any order:

**Inline:**
```markdown
{{focus-todos | path:projects/ tags:#urgent limit:5}}
```

**Code block (single-line):**
````markdown
```focus-todos
path:projects/ tags:#urgent limit:5
```
````

**Code block (multi-line):**
````markdown
```focus-todos
path:projects/
tags:#urgent
limit:5
```
````

All three produce identical results.

---

## Mode Compatibility Matrix

| Feature | Inline Syntax | Code Block Syntax |
|---------|---------------|-------------------|
| Reading Mode | ✓ | ✓ |
| Live Preview | ✗ | ✓ |
| Source Mode | ✗ | ✗ |
| Interactive Checkboxes | ✓ | ✓ |
| Source Links (→) | ✓ | ✓ |
| All Filters | ✓ | ✓ |
| Multi-line Filters | ✗ | ✓ |
| Inline with text | ✓ | ✗ |

**Key Limitation:** Inline syntax only renders in Reading Mode due to Obsidian's `registerMarkdownPostProcessor` API limitation. Code blocks use `registerMarkdownCodeBlockProcessor` which works in both modes.

---

## Migration Guide

### Converting Inline to Code Block

#### Simple Conversion

**Before (inline):**
```markdown
{{focus-todos}}
```

**After (code block):**
````markdown
```focus-todos
```
````

#### With Custom File

**Before (inline):**
```markdown
{{focus-todos: todos/done.md}}
```

**After (code block):**
````markdown
```focus-todos
todos/done.md
```
````

#### With Filters (Single-Line)

**Before (inline):**
```markdown
{{focus-todos: todos/done.md | path:projects/ tags:#urgent limit:10}}
```

**After (code block):**
````markdown
```focus-todos
todos/done.md | path:projects/ tags:#urgent limit:10
```
````

#### With Filters (Multi-Line - Recommended)

**Before (inline):**
```markdown
{{focus-todos: todos/done.md | path:projects/ tags:#urgent limit:10}}
```

**After (code block with improved readability):**
````markdown
```focus-todos
todos/done.md
path:projects/
tags:#urgent
limit:10
```
````

### Migration Strategy

**Option 1: Gradual Migration**
- Leave existing inline embeds as-is
- Use code blocks for new embeds
- Convert inline to code blocks when editing old notes

**Option 2: Batch Conversion**
- Search vault for `{{focus-todos` patterns
- Replace with code block equivalents
- Test each replacement

**Option 3: Hybrid Approach**
- Keep inline for simple embeds in Reading Mode workflows
- Use code blocks for complex filters and Live Preview workflows

---

## Examples

### Example 1: Daily Log with TODOs

Show all TODOs from today's log entry:

````markdown
# Daily Log - 2026-01-08

## TODOs for Today

```focus-todos
path:log/2026/01/08
limit:20
```
````

### Example 2: Project Dashboard

Show urgent TODOs from specific project:

````markdown
# Project MFA Dashboard

## Urgent Tasks

```focus-todos
path:projects/MFA/
tags:#urgent
limit:10
```

## All Project TODOs

```focus-todos
path:projects/MFA/
```
````

### Example 3: Work vs Personal

Separate embeds for different contexts:

````markdown
# TODO Dashboard

## Work TODOs

```focus-todos
todos/work-done.md
tags:#work
limit:15
```

## Personal TODOs

```focus-todos
todos/personal-done.md
tags:#personal
limit:10
```
````

### Example 4: Focus Projects

Show current focus areas:

````markdown
# Current Focus

```focus-list
```

*Projects are ranked by TODO count and recent activity.*
````

### Example 5: Multi-Tag Filtering

Show TODOs that are both urgent AND today:

````markdown
# Today's Urgent Items

```focus-todos
tags:#urgent,#today
```
````

---

## Tips and Best Practices

### 1. Organize with Folders
Use consistent folder structure for effective `path:` filtering:
```
projects/
  projectA/
  projectB/
work/
  urgent/
  routine/
personal/
```

### 2. Tag Strategically
Use tags for cross-cutting concerns:
- `#urgent` - High priority items
- `#today` - Due today
- `#waiting` - Blocked on someone else
- Project-specific: `#MFA`, `#SFO`, etc.

### 3. Limit Results for Focus
Use `limit:5` or `limit:10` to avoid overwhelming lists:
````markdown
```focus-todos
tags:#urgent
limit:5
```
````

### 4. Use Multi-Line for Complex Filters
More readable than single-line:
````markdown
```focus-todos
todos/work-done.md
path:projects/urgent/
tags:#MFA,#urgent
limit:10
```
````

### 5. Create Dedicated Dashboard Notes
Combine multiple embeds in a central TODO dashboard:
- Weekly planning note
- Project status page
- Daily focus list

### 6. Test in Both Modes
After creating embeds:
- ✓ View in Reading Mode (Cmd/Ctrl+E)
- ✓ View in Live Preview (default editing mode)
- Code blocks should render in both

---

## Troubleshooting

### Inline Embed Not Rendering

**Problem:** `{{focus-todos}}` appears as plain text

**Solution:** Switch to Reading Mode (Cmd/Ctrl+E). Inline embeds only work in Reading Mode.

**Better Solution:** Use code block syntax instead - works in both modes.

### Code Block Not Rendering

**Problem:** Code block shows as syntax-highlighted code, not interactive list

**Possible Causes:**
1. Plugin not enabled (Settings → Community Plugins)
2. Typo in language identifier (must be exactly `focus-todos` or `focus-list`)
3. Plugin needs reload (Cmd/Ctrl+R to reload Obsidian)

### Empty List

**Problem:** Embed renders but shows "No active TODOs"

**Possible Causes:**
1. No TODOs match the filters
2. All TODOs are in code blocks (filtered out automatically)
3. TODOs already completed (#todone instead of #todo)

**Solutions:**
- Remove filters to see all TODOs
- Check that TODOs have `#todo` tag
- Run "Refresh TODOs" command (Cmd/Ctrl+P)

### Filters Not Working

**Problem:** Filter seems ignored, shows all TODOs

**Check:**
- Correct syntax: `path:folder/` (with colon)
- Tags include hash: `tags:#urgent` not `tags:urgent`
- Case doesn't matter, but spelling does
- Comma-separated tags: `tags:#urgent,#today`

---

## Technical Details

### Why Two Syntaxes?

**Historical:** Plugin originally supported only inline syntax.

**Obsidian API Limitation:**
- `registerMarkdownPostProcessor` only works in Reading Mode
- `registerMarkdownCodeBlockProcessor` works in both modes
- Inline syntax maintained for backward compatibility

### Rendering Pipeline

Both syntaxes use the same rendering engine:

1. Parse syntax (inline or code block)
2. Extract TODONE file path and filters
3. Fetch TODOs from TodoScanner
4. Apply filters (path, tags, limit)
5. Render interactive list with checkboxes
6. Attach event handlers for completion and navigation

### Performance

- TODOs scanned once on startup
- File watcher updates on changes
- Rendering is instant (no async loading)
- Large vaults (1000+ notes) perform well

---

## Additional Resources

- [README.md](README.md) - Quick start guide
- [QUICK_REFERENCE.md](QUICK_REFERENCE.md) - Cheat sheet
- [FILTERING.md](FILTERING.md) - Code block filtering details
- [CHANGELOG.md](CHANGELOG.md) - Version history

---

## Version

This guide is for Space Command v0.2.0+

**Changelog:**
- v0.2.0: Added code block syntax support
- v0.1.0: Initial release with inline syntax
