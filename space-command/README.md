# ⌥⌘ Space Command

An Obsidian plugin for managing TODOs and TODONEs across your vault with live embeds and interactive sidebar.

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Slash Commands & Quick Insert](#slash-commands--quick-insert)
- [Syntax](#syntax)
  - [Inline Syntax](#inline-syntax)
  - [Code Block Syntax](#code-block-syntax-recommended)
  - [Filters](#filters)
- [Usage](#usage)
  - [Creating TODOs](#creating-todos)
  - [Completing TODOs](#completing-todos)
  - [Keyboard Shortcuts](#keyboard-shortcuts)
- [Installation](#installation)
- [Settings](#settings)
- [Documentation](#documentation)
- [License](#license)

## Features

- **TODO Tracking**: Automatically detect and track all `#todo` items across your vault
- **Live Embeds**: Embed interactive TODO lists in any markdown file
- **Interactive Sidebar**: View and manage all TODOs from a dedicated sidebar
- **Copy Embed Syntax**: Click copy button in sidebar to copy embed syntax to clipboard
- **Auto-Sorting**: Embedded lists sort by priority then project (v0.5.0+)
- **Right-Click Menus**: Focus, Later, Snooze actions in both sidebar and embeds (v0.5.0+)
- **Muted Pill Styling**: Unified visual style for tags, counts, and dates (v0.5.0+)
- **Slash Commands**: `/todo`, `/callout`, `/today`, `/tomorrow` at start of line (v0.4.0+)
- **Quick Date Insert**: `@date`, `@today`, `@tomorrow`, `@yesterday` anywhere (v0.4.0+)
- **Code Block Syntax**: Works in both Reading Mode and Live Preview mode (v0.2.0+)
- **Flexible Filtering**: Filter TODOs by path, tags, or limit results (v0.2.1+)
- **Markdown Rendering**: TODO text renders **bold**, *italic*, `code`, and [links](url) (v0.2.1+)
- **Auto-Refresh**: Sidebar automatically updates when TODOs change
- **Line Highlighting**: Click `→` to jump to source with 1.5s highlight
- **Automatic Logging**: Completed TODOs logged with completion dates
- **Smart Code Filtering**: Automatically excludes TODOs in code blocks
- **Keyboard Shortcuts**: Quick commands for common actions

## Quick Start

1. **Create a TODO** - Add `#todo` to any line:
   ```markdown
   - [ ] Finish the report #todo
   ```

2. **Embed TODO list** - Use code blocks (works in Live Preview):
   ````markdown
   ```focus-todos
   ```
   ````

3. **Complete TODOs** - Click the checkbox in the embed or sidebar

That's it! See [Syntax](#syntax) for more options.

## Slash Commands & Quick Insert

Type `/` at the start of a line or `@` anywhere to quickly insert content.

### Slash Commands (at start of line)

| Command | Inserts |
|---------|---------|
| `/todo` | `- [ ] #todo ` - a new TODO item |
| `/today` | Today's date (e.g., `2026-01-08`) |
| `/tomorrow` | Tomorrow's date |
| `/callout` | Shows callout type menu, then inserts `> [!type]` block |

**Callout types:** info, tip, note, warning, danger, bug, example, quote, abstract, success, question, failure

### @date Quick Insert (anywhere)

| Trigger | Inserts |
|---------|---------|
| `@date` or `@d` | Today's date |
| `@today` or `@t` | Today's date |
| `@tomorrow` | Tomorrow's date |
| `@yesterday` | Yesterday's date |

Dates use your configured date format (default: `YYYY-MM-DD`).

## Syntax

### Inline Syntax

Works in **Reading Mode only** (Cmd+E):

```markdown
{{focus-todos}}
{{focus-todos | tags:#urgent}}
{{focus-todos: todos/done.md | path:projects/}}
```

### Code Block Syntax (Recommended)

Works in **both Reading Mode and Live Preview**:

````markdown
```focus-todos
```
````

With custom file:
````markdown
```focus-todos
todos/done.md
```
````

With filters (multi-line):
````markdown
```focus-todos
path:projects/
tags:#urgent
limit:10
```
````

Or single-line:
````markdown
```focus-todos
todos/done.md | path:projects/ tags:#urgent limit:10
```
````

Focus list:
````markdown
```focus-list
```
````

**When to use:**
- **Code blocks**: Recommended for daily use (works everywhere)
- **Inline `{{...}}`**: Quick embeds in Reading Mode only

### Filters

All filters work with both syntaxes:

| Filter | Syntax | Description |
|--------|--------|-------------|
| **Path** | `path:folder/subfolder/` | Show only TODOs from specific path |
| **Tags** | `tags:#tag1,#tag2` | Show only TODOs with ALL specified tags (AND logic) |
| **Limit** | `limit:N` | Limit to first N results |

**Examples:**

```markdown
{{focus-todos | tags:#urgent}}
{{focus-todos | path:projects/ limit:5}}
{{focus-todos | path:work/ tags:#urgent,#today}}
```

**v0.2.1 improvements:**
- ✅ Flexible syntax: `{{focus-todos | tags:#urgent}}` now works
- ✅ Both colon and pipe separators supported
- ✅ Markdown rendering in TODO text

## Usage

### Creating TODOs

Just add `#todo` to any line in your vault:

```markdown
- [ ] Finish the report #todo
Remember to call John #todo
- [ ] Review PR #urgent #todo
```

**Markdown support (v0.2.1+):**
TODOs can include **bold**, *italic*, `code`, and [links](url):

```markdown
- [ ] Review **urgent** PR #todo
- [ ] Call *John* about the report #todo
- [ ] See [design doc](link) for details #todo
```

**Smart filtering:**
TODOs in code blocks (triple backticks) or inline code (single backticks) are automatically excluded. See [docs/development/FILTERING.md](docs/development/FILTERING.md) for details.

### Completing TODOs

Click the checkbox in an embed or sidebar to complete a TODO. This will:
1. Change `#todo` to `#todone @2026-01-08` in the source file
2. Mark the checkbox `[x]` if present
3. Log the completed item to your TODONE file

### Keyboard Shortcuts

- `Cmd/Ctrl + Shift + T` - Toggle TODO Sidebar
- `Cmd/Ctrl + Shift + A` - Quick Add TODO at cursor

## Installation

### Manual Installation

1. Copy the plugin folder to `.obsidian/plugins/space-command/`
2. Install dependencies: `npm install`
3. Build the plugin: `npm run build`
4. Enable the plugin in Obsidian Settings → Community Plugins

### Development

```bash
npm install
npm run dev    # Watch mode
npm run build  # Production build
```

## Settings

Access via: Settings → Community Plugins → ⌥⌘ Space Command

- **Default TODONE file**: Path where completed TODOs are logged (default: `todos/done.md`)
- **Show sidebar by default**: Auto-show sidebar on startup
- **Date format**: Format for completion dates (using moment.js format)
- **Default projects folder**: Folder for project files (default: `projects/`)
- **Focus list limit**: Max projects in `{{focus-list}}` (default: 5)

## Documentation

- **[CHANGELOG.md](CHANGELOG.md)** - Version history and release notes

## Commands

Available via Command Palette (Cmd/Ctrl+P):

- **Toggle TODO Sidebar**: Show/hide the sidebar
- **Quick Add TODO**: Insert `#todo` at cursor position
- **Refresh TODOs**: Force rescan of all vault files

## Version History

- **v0.5.0** (2026-01-10) - Auto-sorting, right-click in embeds, muted pill styling
- **v0.4.0** (2026-01-08) - Slash commands, @date quick insert, priority sorting, context menus
- **v0.3.x** (2026-01-08) - Right-click context menus, priority tags (#p0-#p4, #focus, #future)
- **v0.2.x** (2026-01-08) - Code block syntax, bug fixes, markdown rendering
- **v0.1.0** (2026-01-07) - Initial release

See [CHANGELOG.md](CHANGELOG.md) for detailed release notes.

## License

MIT

---

**Made with ⌥⌘** by Bruce Alderson
