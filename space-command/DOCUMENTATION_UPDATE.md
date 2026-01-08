# Documentation Update Summary

## Changes Made

Updated all documentation to accurately reflect current features and make the TODONE file parameter properly optional.

## Key Updates

### 1. Optional TODONE File Parameter

**Before:**
- File path was required in embed syntax
- Documentation didn't clarify it was optional

**After:**
- File path is now truly optional in code
- Uses settings default when omitted
- Documentation clearly shows both forms

### 2. Embed Syntax Examples

**New supported formats:**
```markdown
{{focus-todos: todos/done.md}}      // Explicit file
{{focus-todos}}                     // Uses settings default
{{focus-todos | path:projects/}}    // Default file + filters
```

### 3. Code Changes

**EmbedRenderer** ([src/EmbedRenderer.ts](weekly-log-helpers/src/EmbedRenderer.ts)):
- Added `defaultTodoneFile` parameter to constructor
- Updated regex to make file parameter optional: `/\{\{focus-todos:?\s*([^|}\s]*)(?:\s*\|\s*(.+))?\}\}/`
- Falls back to default: `match[1]?.trim() || this.defaultTodoneFile`

**Main Plugin** ([main.ts](weekly-log-helpers/main.ts)):
- Passes `settings.defaultTodoneFile` to EmbedRenderer

### 4. Documentation Files Updated

| File | Changes |
|------|---------|
| [README.md](weekly-log-helpers/README.md) | Added all syntax variations with clear examples |
| [QUICK_REFERENCE.md](weekly-log-helpers/QUICK_REFERENCE.md) | Added `{{focus-todos}}` example and note about optional parameter |
| [_plugins/README.md](README.md) | Updated to show both forms and note parameter is optional |

## Feature Summary

### Current Features (Documented)

✅ **TODO/TODONE System**
- Smart code block filtering (excludes backtick code)
- TODONE deduplication (excludes log file from Recent TODONEs)
- Auto-refresh sidebar
- Line highlighting (1.5s flash on jump to source)

✅ **Embed Syntax**
- Optional TODONE file parameter
- Filters: `path:`, `tags:`, `limit:`
- Works in any markdown file

✅ **UI Features**
- Interactive sidebar with refresh button
- Keyboard shortcuts (Cmd/Ctrl+Shift+T, Cmd/Ctrl+Shift+A)
- Collapsible sections

✅ **Settings**
- Default TODONE file path
- Show sidebar by default
- Date format
- Exclude TODONE files from recent (enabled by default)

## Examples in Documentation

### Basic Usage
```markdown
{{focus-todos}}
```
Uses `todos/done.md` (or whatever is set in settings)

### With Custom File
```markdown
{{focus-todos: work/done.md}}
```

### With Filters
```markdown
{{focus-todos | path:projects/}}
{{focus-todos: done.md | tags:#urgent limit:5}}
```

## Benefits

1. **Flexibility** - Users can choose per-embed or use global default
2. **Convenience** - Most users can just use `{{focus-todos}}`
3. **Clarity** - Documentation now matches implementation
4. **Consistency** - All docs show the same patterns

## Testing Checklist

To verify documentation accuracy:

- [x] Code supports optional file parameter
- [x] README shows all syntax variations
- [x] QUICK_REFERENCE shows optional usage
- [x] _plugins/README updated
- [x] Examples are clear and correct
- [x] Build successful

## Next Steps

Documentation is now complete and accurate. Users can:

1. Use `{{focus-todos}}` for simple cases
2. Use `{{focus-todos: file.md}}` for custom log files
3. Add filters with `|` separator
4. Configure defaults in settings

All documentation files are consistent and up-to-date.
