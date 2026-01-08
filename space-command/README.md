# Weekly Log Helpers

An Obsidian plugin for managing TODOs and TODONEs across your vault with live embeds and interactive sidebar.

## Features

- **TODO Tracking**: Automatically detect and track all `#todo` items across your vault
- **Live Embeds**: Embed interactive TODO lists in any markdown file
- **Interactive Sidebar**: View and manage all TODOs from a dedicated sidebar
- **Auto-Refresh**: Sidebar automatically updates when TODOs change, with manual refresh button
- **Line Highlighting**: Click `→` to jump to source with line highlighting (1.5s flash)
- **Automatic Logging**: Completed TODOs are automatically logged with completion dates
- **Filtering**: Filter TODOs by path, tags, or limit results
- **Smart Code Filtering**: Automatically excludes TODOs in code blocks
- **Keyboard Shortcuts**: Quick commands for common actions

## Usage

### Embed Syntax

**Basic syntax:**

```markdown
{{focus-todos: todos/done.md}}
```

**Using default TODONE file (from settings):**

```markdown
{{focus-todos}}
```

**With filters:**

```markdown
{{focus-todos: done.md | path:projects/ tags:#urgent limit:10}}
{{focus-todos | path:projects/}}
```

**Parameters:**
- **TODONE file path** (optional) - Where completed TODOs are logged. If omitted, uses the default from settings (default: `todos/done.md`)

**Available filters:**
- `path:folder/subfolder/` - Show only TODOs from specific path
- `tags:#tag1,#tag2` - Show only TODOs with specific tags
- `limit:N` - Limit to first N results

### Creating TODOs

Just add `#todo` to any line in your vault:

```markdown
- [ ] Finish the report #todo
Remember to call John #todo
- [ ] Review PR #urgent #todo
```

**Note:** TODOs in code blocks (triple backticks) or inline code (single backticks) are automatically filtered out and treated as examples. See [FILTERING.md](FILTERING.md) for details.

### Completing TODOs

Click the checkbox in an embed or sidebar to complete a TODO. This will:
1. Change `#todo` to `#todone @2026-01-07` in the source file
2. Mark the checkbox `[x]` if present
3. Log the completed item to your TODONE file

### Keyboard Shortcuts

- `Cmd/Ctrl + Shift + T` - Toggle TODO Sidebar
- `Cmd/Ctrl + Shift + A` - Quick Add TODO at cursor

## Installation

### Manual Installation

1. Copy the plugin folder to `.obsidian/plugins/weekly-log-helpers/`
2. Install dependencies: `npm install`
3. Build the plugin: `npm run build`
4. Enable the plugin in Obsidian Settings → Community Plugins

### Development

```bash
npm install
npm run dev
```

## Settings

- **Default TODONE file**: Path where completed TODOs are logged (default: `todos/done.md`)
- **Show sidebar by default**: Auto-show sidebar on startup
- **Date format**: Format for completion dates (using moment.js format)

## Commands

- **Toggle TODO Sidebar**: Show/hide the sidebar
- **Quick Add TODO**: Insert `#todo` at cursor position
- **Refresh TODOs**: Force rescan of all vault files

## License

MIT
