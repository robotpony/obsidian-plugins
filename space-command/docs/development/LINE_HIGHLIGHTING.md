# Line Highlighting Feature

When you click the `→` link from the sidebar or an embed, the target line is now **highlighted** to make it easy to spot.

## How It Works

### Visual Feedback

When you click `→`:

1. **File opens** - The source file opens in the editor
2. **Scrolls to line** - The view scrolls to show the TODO line
3. **Line highlights** - The entire line is selected/highlighted
4. **Auto-clears** - After 1.5 seconds, the highlight clears

### User Experience

**Before (no highlighting):**
- Click `→` to open file
- File opens and scrolls to line
- User must visually search for the TODO
- Easy to lose track of which line it was

**After (with highlighting):**
- Click `→` to open file
- File opens and scrolls to line
- **Line is highlighted immediately** ✨
- User knows exactly where to look
- Highlight fades after 1.5 seconds

## Examples

### From Sidebar

```
┌─────────────────────────────┐
│ ▼ Active TODOs (3)          │
│   □ Fix the bug →           │  ← Click here
│   □ Write tests →           │
│   □ Update docs →           │
└─────────────────────────────┘

                ↓

┌─────────────────────────────┐
│ bug-fix.md                  │
├─────────────────────────────┤
│ 1  # Bug Fix                │
│ 2                           │
│ 3  - [ ] Fix the bug #todo  │  ← This line is highlighted!
│ 4                           │
└─────────────────────────────┘
```

### From Embed

```
{{focus-todos: todos/done.md}}

- [ ] Fix the bug →           ← Click here
- [ ] Write tests →

                ↓

Opens file with line highlighted!
```

## Implementation Details

### Selection-Based Highlighting

The feature uses editor selection to create the highlight effect:

1. **Get line text** - Retrieve the line content
2. **Calculate length** - Get the full line length
3. **Select line** - Use `editor.setSelection()` to select from start to end
4. **Auto-clear** - After 1500ms, move cursor back to start

### Why Selection?

- Uses Obsidian's native selection highlighting
- No custom CSS needed
- Works with all themes automatically
- Consistent with Obsidian's UX patterns

### Timing

The 1.5 second duration is chosen because:
- Long enough to draw user's attention
- Short enough not to be annoying
- Similar to other IDE "flash" features
- User can start editing immediately if needed

## Code

Both `SidebarView` and `EmbedRenderer` use the same highlighting logic:

```typescript
private highlightLine(editor: any, line: number): void {
  // Get the line length
  const lineText = editor.getLine(line);
  const lineLength = lineText.length;

  // Select the entire line
  editor.setSelection(
    { line, ch: 0 },
    { line, ch: lineLength }
  );

  // Clear the selection after a delay
  setTimeout(() => {
    editor.setCursor({ line, ch: 0 });
  }, 1500);
}
```

## Benefits

1. **Instant Visual Feedback** - User immediately sees where the TODO is
2. **Better UX** - No searching required
3. **Theme Compatible** - Works with all Obsidian themes
4. **Non-Intrusive** - Auto-clears so you can keep working
5. **Consistent** - Same behavior in sidebar and embeds

## Customization

If you want to change the highlight duration, modify the timeout in both files:

- `src/SidebarView.ts:255`
- `src/EmbedRenderer.ts:151`

```typescript
setTimeout(() => {
  editor.setCursor({ line, ch: 0 });
}, 1500);  // Change this value (in milliseconds)
```

Examples:
- `500` - Quick flash (0.5 seconds)
- `1000` - Medium flash (1 second)
- `2000` - Long flash (2 seconds)
- `3000` - Very long flash (3 seconds)

## Accessibility

The selection-based approach is accessible because:
- Uses native editor selection (screen reader friendly)
- Visual highlight for sighted users
- Cursor position indicates location for keyboard users
- Works with high contrast themes

## Future Enhancements

Possible improvements:
- Make duration configurable in settings
- Add option to disable auto-clear
- Custom highlight color (would require CSS)
- Flash animation instead of static selection
