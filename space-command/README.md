# ⌥⌘ Space Command

An Obsidian plugin for managing TODOs across your vault with live embeds and interactive sidebar.

## Table of Contents

- [⌥⌘ Space Command](#-space-command)
  - [Table of Contents](#table-of-contents)
  - [Features](#features)
  - [Quick Start](#quick-start)
  - [Slash Commands \& Quick Insert](#slash-commands--quick-insert)
    - [Slash Commands (at start of line)](#slash-commands-at-start-of-line)
    - [@date Quick Insert (anywhere)](#date-quick-insert-anywhere)
  - [Syntax](#syntax)
    - [Inline Syntax](#inline-syntax)
    - [Code Block Syntax (Recommended)](#code-block-syntax-recommended)
    - [Filters](#filters)
  - [Usage](#usage)
    - [Creating TODOs](#creating-todos)
    - [Completing TODOs](#completing-todos)
    - [Un-completing TODONEs](#un-completing-todones)
    - [Priority System](#priority-system)
    - [Context Menus](#context-menus)
    - [Keyboard Shortcuts](#keyboard-shortcuts)
  - [Installation](#installation)
    - [Manual Installation](#manual-installation)
    - [Development](#development)
  - [Settings](#settings)
  - [Commands](#commands)
  - [License](#license)

## Features

- **TODO Tracking**: Automatically detect and track all `#todo` items across your vault
- **Header TODOs**: Headers with `#todo` treat list items below as child TODOs
- **Priority System**: Tags `#focus`, `#p0`-`#p4`, `#future` with automatic sorting
- **Focus Highlighting**: `#focus` items have accent background in sidebar
- **TODONE Toggle**: Show/hide completed items in embeds with button or filter
- **Live Embeds**: Embed interactive TODO lists in any markdown file
- **Interactive Sidebar**: View and manage all TODOs from a dedicated sidebar
- **Context Menus**: Right-click for Focus, Later, Snooze toggle actions
- **Slash Commands**: `/todo`, `/todos`, `/callout`, `/today`, `/tomorrow` at line start
- **Quick Date Insert**: `@date`, `@today`, `@tomorrow`, `@yesterday` anywhere
- **Code Block Syntax**: Works in both Reading Mode and Live Preview mode
- **Flexible Filtering**: Filter by path, tags, limit, or todone visibility
- **Markdown Rendering**: TODO text renders **bold**, *italic*, `code`, and [links](url)
- **Auto-Refresh**: Sidebar and embeds update automatically when TODOs change
- **Line Highlighting**: Click `→` to jump to source with 1.5s highlight
- **Automatic Logging**: Completed TODOs logged with completion dates
- **Smart Code Filtering**: Excludes TODOs in code blocks and inline code
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
| `/todos` | `## TODOs` heading with blank TODO item |
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
| **TODONE** | `todone:show` or `todone:hide` | Show or hide completed items (default: show) |

**Examples:**

```markdown
{{focus-todos | tags:#urgent}}
{{focus-todos | path:projects/ limit:5}}
{{focus-todos | path:work/ tags:#urgent,#today}}
{{focus-todos | todone:hide}}
```

## Usage

### Creating TODOs

Just add `#todo` to any line in your vault:

```markdown
- [ ] Finish the report #todo
Remember to call John #todo
- [ ] Review PR #urgent #todo
```

**Header TODOs:**
Add `#todo` to a header to treat all list items below as children:

```markdown
## My Project #todo
- Task 1
- Task 2
- Task 3

## Next Section
```

All three tasks become children of "My Project". Completing the header completes all children. The hierarchy ends at the next same-level or higher-level header.

**Markdown support:**
TODOs can include **bold**, *italic*, `code`, and [links](url):

```markdown
- [ ] Review **urgent** PR #todo
- [ ] Call *John* about the report #todo
- [ ] See [design doc](link) for details #todo
```

**Smart filtering:**
TODOs in code blocks (triple backticks) or inline code (single backticks) are automatically excluded.

### Completing TODOs

Click the checkbox in an embed or sidebar to complete a TODO. This will:
1. Change `#todo` to `#todone @2026-01-08` in the source file
2. Mark the checkbox `[x]` if present
3. Log the completed item to your TODONE file

### Un-completing TODONEs

Changed your mind? Click a completed item in the sidebar's DONE section to revert it:
1. Changes `#todone @date` back to `#todo`
2. Unchecks `[x]` to `[ ]` if checkbox exists
3. TODONE log file is preserved (keeps history)

### Priority System

Organize TODOs with priority tags. Items sort automatically by priority in sidebar and embeds.

**Priority tags** (highest to lowest):

| Tag | Purpose | Visibility |
|-----|---------|------------|
| `#focus` | Top priority, highlighted with accent color | Shown |
| `#p0` | Highest priority | Shown |
| `#p1` | High priority | Shown |
| `#p2` | Medium priority | Shown |
| *(none)* | Default priority (between #p2 and #p3) | Shown |
| `#p3` | Low priority | Shown |
| `#p4` | Lowest priority | Shown |
| `#future` | Snoozed/deferred | Hidden from Active TODOs |

**Sorting order:** `#focus` → `#p0` → `#p1` → `#p2` → (none) → `#p3` → `#p4` → `#future`

Items with `#focus` are highlighted with an accent background in the sidebar. Items with `#future` are hidden from the Active TODOs list but still tracked.

### Context Menus

Right-click any TODO in the sidebar or embedded lists to access quick actions:

| Action | Effect | Toggle behavior |
|--------|--------|-----------------|
| **Focus** ⚡ | Sets `#focus` + `#p0` for top priority | Removes `#focus` if already present |
| **Later** 🕐 | Sets `#p3` or `#p4` for lower priority | Removes priority tag if already low |
| **Snooze** 🌙 | Adds `#future` to defer the item | Removes `#future` if already snoozed |

All actions are toggles - clicking the same action again will undo it.

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

| Setting | Description | Default |
|---------|-------------|---------|
| **Default TODONE file** | Path where completed TODOs are logged | `todos/done.md` |
| **Show sidebar by default** | Auto-show sidebar on startup | On |
| **Date format** | Format for completion dates (moment.js) | `YYYY-MM-DD` |
| **Default projects folder** | Folder for project files | `projects/` |
| **Focus list limit** | Max projects in `{{focus-list}}` | 5 |
| **Priority tags** | Customizable priority tag list | `#p0,#p1,#p2,#p3,#p4` |
| **Recent TODONEs limit** | Max completed items shown in sidebar | 5 |
| **Exclude TODONE file from recent** | Prevent duplicates in Recent TODONEs | On |

## Commands

Available via Command Palette (Cmd/Ctrl+P):

| Command | Description |
|---------|-------------|
| **Toggle TODO Sidebar** | Show/hide the sidebar |
| **Quick Add TODO** | Insert `#todo` at cursor position |
| **Refresh TODOs** | Force rescan of all vault files |

See [CHANGELOG.md](CHANGELOG.md) for version history and release notes.

## License

MIT

---

**Made with ⌥⌘** by Bruce Alderson
