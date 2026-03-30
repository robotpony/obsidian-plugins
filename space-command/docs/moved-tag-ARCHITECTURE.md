# Architecture: `#moved` Tag Feature

## Summary

Add `#moved` as a system tag for tracking TODO provenance when items are relocated between files. Source lines get `#todo` replaced with `#moved @date`, keeping an audit trail. The scanner excludes `#moved` items from all views, eliminating duplicates.

## Data Flow

```
User triggers "Move to..." on a TODO in file A
        │
        ▼
┌──────────────────────────────┐
│ TodoProcessor.moveTodo()     │
│                              │
│ 1. Read destination file     │
│ 2. Append TODO text to dest  │
│    (as fresh #todo item)     │
│ 3. Update source line:       │
│    #todo → #moved @date      │
│    checkbox stays [ ]        │
│ 4. If header: move children  │
│ 5. Rescan both files         │
│ 6. Update move history       │
└──────────────────────────────┘
        │
        ▼
┌──────────────────────────────┐
│ TodoScanner                  │
│                              │
│ - #moved lines are scanned   │
│   but NOT added to any cache │
│   (todosCache, todonesCache, │
│    ideasCache, etc.)         │
│                              │
│ - hasCachedRelevantTags()    │
│   includes #moved so files   │
│   with only #moved items     │
│   are still scanned (for     │
│   future provenance queries) │
└──────────────────────────────┘
```

## Components Modified

### `utils.ts`

- Add `#moved` to `PLUGIN_TAGS` set (for tag colouring and system tag identification)
- Add `replaceTodoWithMoved(text, date)` utility (mirrors `replaceTodoWithTodone`)
- `hasCachedRelevantTags()` already works via `PLUGIN_TAGS`; no change needed beyond the set addition

### `TodoScanner.ts`

- During line classification: lines with `#moved` tag are **skipped** (not added to any cache)
- This is the single point of deduplication: if a line has `#moved`, it doesn't exist in the TODO/TODONE world
- No new cache needed; `#moved` items are invisible to all downstream consumers
- **Auto-stamp**: If a `#moved` line has no `@date`, queue a line mutation to append one (same pattern as the existing checkbox-sync that adds `#todone @date` to checked items). Fallback chain for the date:
  1. Existing `@YYYY-MM-DD` on the line → use it (already stamped)
  2. Filename date pattern (e.g. `2026-03-30.md`) → use it (log file context)
  3. Today's date → last resort

### `TodoProcessor.ts`

New method: `moveTodo(todo: TodoItem, destinationPath: string): Promise<boolean>`

Responsibilities:
1. Read destination file content
2. Format the TODO for the destination (strip `#moved`, keep other tags, ensure `#todo` present)
3. If header TODO: collect all child lines as a block
4. Append block to destination file
5. Update source lines: `#todo` → `#moved @date` on each line
6. Rescan both source and destination files
7. Record destination in move history (for recent targets list)
8. Fire completion callback

### `ContextMenuHandler.ts`

- Add "Move to..." menu item for TODO items
- On click: open `MoveTargetModal` to select destination
- Wire result to `TodoProcessor.moveTodo()`

### New: `MoveTargetModal.ts`

A `SuggestModal<TFile>` subclass that shows:
1. **Pinned files** (from `app.workspace` starred/bookmarked files)
2. **Recently moved-to files** (from plugin data store, last N unique destinations)
3. **All markdown files** (as fallback, filtered by typing)

The modal ranks suggestions: pinned first, then recent, then alphabetical. User types to filter.

### `types.ts`

- Add `moveHistory: string[]` to `SpaceCommandSettings` (persisted list of recent move targets, max 10)

### `main.ts`

- Register the "Move to..." command (available from command palette too, operates on cursor line)
- Pass move history to the modal

## Decisions

| Decision | Rationale |
|----------|-----------|
| `#moved` replaces `#todo`, not added alongside | Consistent with `#todone` pattern. One system tag per line. Scanner only needs to check for `#moved` to exclude. |
| Checkbox stays `[ ]` | Distinguishes moved from completed visually. The item wasn't done, it relocated. |
| Date stamp `@YYYY-MM-DD` | Consistent with `#todone @date` pattern. Shows when the move happened. |
| No back-reference in destination | Keeps destination clean. The source file's `#moved` line is the audit record. Tags + dates provide enough history for grep/search. |
| Scanner excludes at scan time | Simplest dedup. No filter logic needed. `#moved` items simply don't enter any cache. |
| Move history in settings | Small data (10 strings), persists across sessions, no separate storage needed. |
| Header moves include children | Matches completion behaviour. Headers are logical groups. |

## Edge Cases

| Case | Handling |
|------|----------|
| Moving to same file | Blocked. Show notice: "Cannot move to the same file." |
| Destination doesn't exist | Create the file (same pattern as TODONE file creation). |
| TODO has children, some already `#todone` | Move all children as-is. Completed children stay completed in destination. |
| Line has `#moved` AND `#todo` | `#moved` wins. Scanner skips the line. (Same precedence as `#todone` over `#todo`.) |
| User manually types `#moved` | Works fine. Scanner treats it identically to programmatic moves. |
| `#moved` without `@date` | Scanner auto-stamps a date via line mutation (filename date → today fallback). User never needs to type the date manually. |
| Moving an idea or principle | Out of scope for v1. Context menu only shows "Move to..." for `#todo` items. |
