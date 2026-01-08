# ⌥⌘ Space Command - Quick Reference

## 🎯 Creating TODOs

Add `#todo` anywhere in your vault:

```markdown
- [ ] Finish the report #todo
- [ ] Review PR #urgent #todo
Remember to call John #todo
```

**Smart Filtering:** TODOs in code blocks or inline code (backticks) are automatically ignored.

## 📝 Embedding TODO Lists

Basic syntax:
```markdown
{{focus-todos: todos/done.md}}
{{focus-todos}}  // Uses default from settings
```

With filters:
```markdown
{{focus-todos: done.md | path:projects/}}
{{focus-todos | tags:#urgent}}
{{focus-todos | limit:10}}
{{focus-todos | path:work/ tags:#urgent,#today limit:5}}
```

**Note:** TODONE file path is optional - omit to use settings default.

## 📦 Code Block Syntax (Works in Live Preview!)

Code blocks render in **both Reading Mode and Live Preview**:

````markdown
```focus-todos
todos/done.md
```
````

With filters:
````markdown
```focus-todos
path:projects/
tags:#urgent
limit:10
```
````

Focus list:
````markdown
```focus-list
```
````

**Comparison:**

| Syntax | Reading Mode | Live Preview |
|--------|--------------|--------------|
| `{{focus-todos}}` | ✓ | ✗ |
| ` ```focus-todos ``` ` | ✓ | ✓ |

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + Shift + T` | Toggle TODO Sidebar |
| `Cmd/Ctrl + Shift + A` | Quick Add TODO |

## 🎛️ Commands

Open Command Palette (`Cmd/Ctrl + P`) and search:
- Toggle TODO Sidebar
- Quick Add TODO
- Refresh TODOs

## 📊 What Happens When You Complete a TODO

1. Source file updates: `#todo` → `#todone @2026-01-07`
2. Checkbox marked: `[ ]` → `[x]` (if present)
3. Entry logged to TODONE file
4. Removed from active TODO lists
5. Appears in "Recent TODONEs"

## 🔍 Filter Syntax

| Filter | Example | Description |
|--------|---------|-------------|
| `path:` | `path:projects/work/` | Only TODOs in this folder |
| `tags:` | `tags:#urgent,#today` | Only TODOs with these tags |
| `limit:` | `limit:10` | Show first 10 results |

## 🎨 UI Elements

- **`→`** - Click to jump to source file and line (with 1.5s highlight)
- **Checkbox** - Click to mark TODO complete
- **▼/▶** - Collapse/expand sections
- **🔄** - Manual refresh button (sidebar auto-refreshes automatically)

## ⚙️ Settings

Settings → Community Plugins → ⌥⌘ Space Command → Options

- **Default TODONE file** - Where completions are logged
- **Show sidebar by default** - Auto-open on startup
- **Date format** - Completion date format (moment.js)

## 💡 Tips

1. Use additional tags for filtering: `#todo #work #urgent`
2. Organize TODOs in project folders for `path:` filtering
3. Create multiple embeds with different filters
4. Use the sidebar for a global TODO view
5. The ribbon checkbox icon toggles the sidebar
