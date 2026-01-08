# Auto-Refresh Feature

The sidebar now automatically refreshes whenever TODOs are updated, keeping your TODO list always current without manual intervention.

## How It Works

### Automatic Refresh Triggers

The sidebar automatically refreshes when:

1. **Files are modified** - Any change to markdown files triggers a re-scan
2. **Files are created** - New markdown files are scanned immediately
3. **Files are deleted** - TODOs from deleted files are removed
4. **Files are renamed** - Cache is updated with new file path
5. **TODOs are completed** - Completing a TODO triggers an immediate refresh

### Manual Refresh Button

A refresh button (🔄) is now located in the sidebar header next to the title:

```
┌─────────────────────────────┐
│ Weekly Log Helpers      🔄  │  ← Click to refresh
├─────────────────────────────┤
│ ▼ Active TODOs (12)         │
│   □ Task 1 →                │
```

**What it does:**
- Click to force a complete vault re-scan
- Shows a spinning animation during refresh
- Useful if you suspect the cache is out of sync

## Technical Implementation

### Event-Driven Architecture

1. **TodoScanner** extends `Events` class
   - Emits `"todos-updated"` event after each file scan
   - All listeners get notified of changes

2. **SidebarView** listens for updates
   - Registers event listener in `onOpen()`
   - Automatically calls `render()` when TODOs change
   - Cleans up listener in `onClose()`

3. **TodoProcessor** triggers refreshes
   - Calls callback after completing a TODO
   - File modification triggers scanner's file watcher
   - Workspace gets notified to update embeds

### Performance Optimization

- **Caching**: TODOs are cached by file path for fast lookups
- **Incremental updates**: Only modified files are re-scanned
- **Event debouncing**: File watcher naturally handles rapid changes
- **Efficient rendering**: Only affected views are updated

## User Experience

### Before (Manual Refresh Required)
1. Complete a TODO
2. Sidebar still shows old data
3. User must manually refresh or restart Obsidian

### After (Auto-Refresh)
1. Complete a TODO
2. Sidebar instantly updates ✨
3. No user action needed

## Refresh Button Use Cases

When to use the manual refresh button:

1. **Bulk operations**: After making many file changes at once
2. **External changes**: Files modified outside Obsidian
3. **Cache issues**: If display seems out of sync
4. **Peace of mind**: Quick verification that list is current

## Settings

No configuration needed - auto-refresh is always enabled for the best user experience.

## Embeds

Embeds (`{{focus-todos}}`) also benefit from automatic updates:
- Modified files trigger re-scan
- Workspace events refresh markdown views
- Completed TODOs disappear from embeds immediately

## Troubleshooting

**Sidebar not updating?**
1. Click the refresh button (🔄)
2. Check the console (Cmd/Ctrl+Shift+I) for errors
3. Try closing and reopening the sidebar

**Performance issues?**
- Auto-refresh is optimized for normal use
- Very large vaults (1000+ markdown files) may see slight delay
- Use filters to limit TODO scope if needed
