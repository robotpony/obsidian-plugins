# Plan: `#moved` Tag Feature

## Phase 1: Scanner exclusion and tag infrastructure ✓

**Goal**: `#moved` items are recognized and excluded from all views.

1. **`utils.ts`**: Add `#moved` to `PLUGIN_TAGS` set
2. **`utils.ts`**: Add `replaceTodoWithMoved(text: string, date: string): string` — replaces `#todo(s)` with `#moved @date`
3. **`TodoScanner.ts`**: In the line classification logic (~line 199), add `#moved` check before `#todone` check. Lines with `#moved` are skipped entirely (no cache insertion)
4. **`TodoScanner.ts`**: Auto-stamp `#moved` lines missing `@date` — queue a line mutation (same pattern as checkbox-sync). Date fallback: existing `@date` on line → filename date pattern (e.g. `2026-03-30.md`) → today
5. **`utils.ts`**: Add `extractDateFromFilename(filename: string): string | null` — parse `YYYY-MM-DD` from filename
6. **Tests**: Add scanner test confirming `#moved` lines are excluded from caches, and auto-stamp adds date correctly

**Validates**: Manual `#moved` tag editing works for deduplication immediately.

## Phase 2: Move processor ✓

**Goal**: Programmatic move operation with source/destination file manipulation.

1. **`TodoProcessor.ts`**: Add `moveTodo(todo: TodoItem, destinationPath: string): Promise<boolean>`
   - Single-item move: update source line (`#todo` → `#moved @date`), append to destination as `#todo`
   - Header move: collect header + children as block, move together
   - Strip priority/focus tags from source (they travel with the destination copy)
   - Rescan both files after modification
2. **`types.ts`**: Add `moveHistory: string[]` to `SpaceCommandSettings` and `DEFAULT_SETTINGS`
3. **`TodoProcessor.ts`**: Add `recordMoveTarget(path: string)` — prepend to history, dedupe, cap at 10
4. **Tests**: Move operation correctly transforms source and destination files

## Phase 3: Move target modal ✓

**Goal**: User-friendly file picker for move destinations.

1. **New file `src/MoveTargetModal.ts`**: `SuggestModal<TFile>` subclass
   - `getSuggestions(query)`: merge three sources:
     - Pinned/bookmarked files from workspace (via `app.internalPlugins.getPluginById('bookmarks')`)
     - Move history from settings (last 10 destinations)
     - All markdown files (filtered by query)
   - Deduplicate and rank: pinned → recent → alphabetical
   - `renderSuggestion()`: show file path with source indicator (pin icon, clock icon, or none)
   - `onChooseSuggestion()`: return selected file path
2. **Tests**: Modal suggestion ranking logic (can unit test the merge/rank without UI)

## Phase 4: Context menu and command integration ✓

**Goal**: Wire everything together in the UI.

1. **`ContextMenuHandler.ts`**: Add "Move to..." item in `showTodoMenu()` — between "Copy" and "Focus"
2. **`main.ts`**: Register `space-command:move-todo` command (operates on TODO at cursor position)
3. **`main.ts`**: Wire modal → processor → scanner refresh chain
4. **Manual testing**: Full flow — right-click TODO → Move to → pick file → verify source has `#moved`, destination has `#todo`, sidebar updates

## Phase 5: Polish ✓

1. **`styles.css`**: Add subtle styling for `#moved` tag if it appears in raw markdown (grey/muted, similar to `#todone`)
2. **Notices**: "Moved to [[filename]]" success message, error notices for edge cases
3. **`CHANGELOG.md`**: Document the feature
4. **`README.md`**: Add `#moved` to the tag reference table

## Out of Scope (future consideration)

- Moving `#idea` or `#principle` items (different workflow, less need)
- Bulk move (move all items with a project tag at once)
- `{{focus-moved}}` embed syntax (no visibility requested)
- Undo move (user can manually edit `#moved` back to `#todo`)
