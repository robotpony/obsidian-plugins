# TODONE Deduplication

## The Problem

When TODOs are completed, they get logged to the TODONE file (e.g., `todos/done.md`). This created a duplicate problem:

**Before the fix:**
1. User completes a TODO in `project.md`
2. TODO changes to `#todone` in `project.md`
3. TODO gets logged to `todos/done.md`
4. **Recent TODONEs shows the same item twice:**
   - Once from `project.md`
   - Once from `todos/done.md`

This made the "Recent TODONEs" section cluttered and confusing.

## The Solution

The plugin now **excludes the TODONE log file** from the "Recent TODONEs" section by default.

**After the fix:**
1. User completes a TODO in `project.md`
2. TODO changes to `#todone` in `project.md`
3. TODO gets logged to `todos/done.md`
4. **Recent TODONEs shows the item once:**
   - From `project.md` only
   - The log file is excluded

## How It Works

### Exclude List

The `TodoScanner` maintains an exclude list:

```typescript
private excludeFromTodones: Set<string> = new Set();

setExcludeFromTodones(filePaths: string[]): void {
  this.excludeFromTodones = new Set(filePaths);
}
```

### Filtering in getTodones()

When getting TODONEs, files in the exclude list are skipped:

```typescript
getTodones(limit?: number): TodoItem[] {
  const allTodones: TodoItem[] = [];
  for (const [filePath, todones] of this.todonesCache.entries()) {
    // Skip files that are in the exclude list
    if (this.excludeFromTodones.has(filePath)) {
      continue;
    }
    allTodones.push(...todones);
  }
  // ...
}
```

### Configuration

On plugin load, the TODONE file is added to the exclude list:

```typescript
// Configure scanner to exclude TODONE log file from Recent TODONEs
if (this.settings.excludeTodoneFilesFromRecent) {
  this.scanner.setExcludeFromTodones([this.settings.defaultTodoneFile]);
}
```

## Settings

A new setting controls this behavior:

- **Name**: `excludeTodoneFilesFromRecent`
- **Default**: `true` (exclude the log file)
- **Type**: `boolean`

This setting is enabled by default, which means the TODONE log file won't appear in "Recent TODONEs".

## Why Exclude by Default?

The TODONE log file is meant to be an **archive**, not a source of active items. Its purpose is:

1. **Historical record** - Keep a chronological log of completions
2. **Audit trail** - Track when things were done
3. **Backup** - Preserve completed TODOs even if source files are deleted

It's not meant to be displayed in the "Recent TODONEs" section because:
- It would duplicate items from source files
- It would clutter the UI
- The source file location is more meaningful

## What Shows in Recent TODONEs?

**Now shows:**
- TODONEs from source files where they were originally created
- E.g., `project.md`, `meeting-notes.md`, etc.

**Now excludes:**
- The TODONE log file (e.g., `todos/done.md`)
- Any other files you might add to the exclude list

## Future Enhancements

This architecture allows for future improvements:

1. **Multiple exclude files** - Exclude multiple log files
2. **Pattern matching** - Exclude files by pattern (e.g., `**/done.md`)
3. **UI setting** - Toggle exclusion from settings panel
4. **Per-embed exclusion** - Different exclusion rules per embed

## Example Scenario

### User Workflow

1. **Create TODO:**
   ```markdown
   # Project Notes
   - [ ] Implement feature X #todo
   ```

2. **Complete TODO:**
   - Click checkbox in sidebar
   - `project.md` updates to: `- [x] Implement feature X #todone @2026-01-07`
   - `todos/done.md` gets: `- [x] Implement feature X #todone @2026-01-07`

3. **Recent TODONEs shows:**
   ```
   ▼ Recent TODONEs (1)
     ☑ Implement feature X → [to project.md]
   ```

   **Not:**
   ```
   ▼ Recent TODONEs (2)
     ☑ Implement feature X → [to project.md]
     ☑ Implement feature X → [to todos/done.md]  ← EXCLUDED!
   ```

## Technical Details

- **File paths are normalized** for consistent matching
- **Exclude list is a Set** for O(1) lookup performance
- **Configured on plugin load** and updated when settings change
- **Works with custom TODONE file paths** via settings

## Compatibility

This change is:
- ✅ **Backwards compatible** - Existing vaults work without changes
- ✅ **Non-breaking** - Default behavior prevents duplicates
- ✅ **Configurable** - Can be disabled if needed
- ✅ **Performant** - Set-based exclusion is fast
