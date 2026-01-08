# Code Block Filtering

The plugin now intelligently filters out `#todo` and `#todone` tags that appear in code blocks or inline code, treating them as examples rather than actual TODOs.

## What Gets Filtered Out

### Triple Backtick Code Blocks

TODOs inside fenced code blocks are ignored:

````markdown
```javascript
// This is example code
const task = "Remember #todo tag"; // NOT tracked
```
````

```markdown
This #todo IS tracked
```

### Inline Code

TODOs within backticks are ignored:

```markdown
Use the `#todo` tag to mark tasks  <- NOT tracked
Remember to call John #todo         <- IS tracked
```

## Examples

### ✅ These WILL be tracked:

```markdown
- [ ] Finish the report #todo
Remember to email the team #todo
- [ ] Review PR #urgent #todo
```

### ❌ These will NOT be tracked:

````markdown
Here's how to use it: `#todo`

```markdown
Example:
- [ ] Sample task #todo
```

Use the syntax `#todo` in your notes.
````

### 🔀 Mixed Content:

```markdown
Add `#todo` tags to mark tasks #todo

This line has both - the inline code `#todo` is ignored,
but the actual #todo at the end IS tracked!
```

Only the second `#todo` (not in backticks) will be tracked.

## Implementation Details

### Triple Backtick Blocks
- Tracks whether we're inside a ``` code block
- Toggles state when encountering ``` on a line
- Skips all lines while inside a code block

### Inline Code
- Finds all backtick positions in the line
- Pairs them up (first with second, third with fourth, etc.)
- Checks if `#todo` or `#todone` falls between any pair
- If any tag is in inline code, the entire line is skipped

### Edge Cases
- Lines with odd number of backticks are processed normally (conservative approach)
- Multiple inline code spans on one line are handled correctly
- Code blocks can be nested in lists and other markdown structures

## Testing

Create a test note with:

````markdown
# Test TODO Filtering

Regular TODO: #todo

Inline code: `#todo`

Code block:
```
This is a code example #todo
```

Mixed: Use `#todo` tags for tasks #todo
````

Expected results:
- Line 3: ✅ Tracked (1 TODO)
- Line 5: ❌ Not tracked
- Line 9: ❌ Not tracked
- Line 12: ✅ Tracked (1 TODO, the one after "tasks")

Total: 2 TODOs should appear in your sidebar/embeds.
