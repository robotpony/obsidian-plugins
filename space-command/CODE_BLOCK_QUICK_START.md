# Code Block Syntax - Quick Start

## The Problem We Solved

**Before v0.2.0:** Inline syntax `{{focus-todos}}` only worked in Reading Mode.
**Now in v0.2.0:** Code block syntax works in **BOTH** Reading Mode and Live Preview!

## Quick Comparison

### Inline Syntax (Still Supported)
```markdown
{{focus-todos: todos/done.md | path:projects/ tags:#urgent limit:10}}
```
- ✓ Reading Mode
- ✗ Live Preview

### Code Block Syntax (NEW!)
````markdown
```focus-todos
todos/done.md
path:projects/
tags:#urgent
limit:10
```
````
- ✓ Reading Mode
- ✓ Live Preview ← **This is the advantage!**

## Quick Examples

### Basic (Uses defaults from settings)
````markdown
```focus-todos
```
````

### With Custom File
````markdown
```focus-todos
todos/work-done.md
```
````

### With Filters (Multi-line - Recommended)
````markdown
```focus-todos
path:projects/MFA/
tags:#urgent
limit:5
```
````

### Single-Line (Works too!)
````markdown
```focus-todos
todos/done.md | path:projects/ tags:#urgent limit:5
```
````

### Focus List
````markdown
```focus-list
```
````

## Testing Your Plugin

1. **Reload Obsidian:** Cmd/Ctrl+R
2. **Open test file:** [test-code-blocks.md](~/notes/test-code-blocks.md)
3. **Stay in Live Preview** - code blocks should render!
4. **Try clicking checkboxes** - should mark TODOs complete
5. **Click → links** - should jump to source with highlight

## When to Use Each

| Use Case | Recommendation |
|----------|----------------|
| New embeds | ✅ Code blocks |
| Existing embeds | Keep inline (no need to change) |
| Live Preview workflow | ✅ Code blocks |
| Reading Mode only | Either works |
| Complex filters | ✅ Code blocks (multi-line) |
| Quick inline embed | Inline is fine |

## All Available Filters

```markdown
path:folder/subfolder/    # Only TODOs from this path
tags:#tag1,#tag2          # Must have ALL listed tags (AND logic)
limit:10                  # Show max 10 results
```

**Combine them:**
````markdown
```focus-todos
path:projects/work/
tags:#urgent,#today
limit:5
```
````

## What Makes This Work?

- **Inline syntax** uses `registerMarkdownPostProcessor` (Reading Mode only)
- **Code block syntax** uses `registerMarkdownCodeBlockProcessor` (both modes!)
- Both use the same rendering engine → identical output

## Documentation Files

- **README.md** - Overview and quick start
- **QUICK_REFERENCE.md** - Cheat sheet
- **SYNTAX_GUIDE.md** - 300+ line comprehensive guide
- **CHANGELOG.md** - What's new in v0.2.0
- **This file** - Quick start for code blocks

## Troubleshooting

**Code block not rendering?**
1. Check spelling: must be exactly `focus-todos` or `focus-list`
2. Reload Obsidian: Cmd/Ctrl+R
3. Check plugin is enabled: Settings → Community Plugins

**Shows "No active TODOs"?**
- Remove filters to see all TODOs
- Run "Refresh TODOs" command (Cmd/Ctrl+P)
- Check files have `#todo` tags (not just `#todone`)

**Inline syntax stopped working?**
- It still works! Just switch to Reading Mode (Cmd/Ctrl+E)
- Or migrate to code blocks for better experience

---

**Version:** 0.2.0  
**Status:** ✅ Ready to use  
**Tested:** ✅ Build successful

Start using code blocks today for a better editing experience! 🚀
