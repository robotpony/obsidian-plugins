# Design — notate-command

User-facing interfaces, interactions, and file format.

## Sidebar

### Layout

```
+-------------------------------+
| N⌘  Note command           ⠇  |  ← header: logo, title, kebab menu
++-----------------------------++
|| > Add a note...             ||  ← textarea (auto-grows, 2-4 lines)
|| ...                         ||
||                      [ ✉️ ] ||  ← send button (bottom-right of textarea)
++-----------------------------++
| Recent notes                  |  ← section label
|  ├─ 2026-04-02 (3)        →  |  ← grouped by file, count, click → open
|  ├─ 2026-04-01 (5)        →  |
|  └─ 2026-W13 (2)          →  |
|                               |
+-------------------------------+
```

### Interactions

| Action | Behaviour |
|--------|-----------|
| Type + click send | Append note to today's log file, clear textarea, show notice |
| Cmd+Enter in textarea | Same as clicking send |
| Click → arrow on history row | Open the log file in Obsidian, scroll to the header section |
| Click N⌘ logo | Show about info (version, description) |
| Kebab menu ⠇ | Settings, About |

### Textarea Behaviour

- Placeholder: "Add a note..."
- Multi-line by default (min 2 rows, grows to ~4)
- Cmd+Enter submits; plain Enter creates new line
- Clears after successful send
- Send button disabled when textarea is empty

### History List

- Grouped by log file path, sorted newest-first
- Each group shows: filename (without extension), note count in parentheses
- Arrow icon on each row opens the file and navigates to the header section
- Limited to `settings.recentNotesLimit` total entries
- Persisted across restarts via plugin `data.json`

## Commands

| Command ID | Name | Hotkey | Action |
|------------|------|--------|--------|
| `toggle-sidebar` | Toggle note sidebar | Mod+Shift+N | Toggle sidebar visibility |
| `quick-note` | Add quick note | None | Open input modal for note text, append to log |

### Ribbon Icon

- Icon: `pencil` (Lucide)
- Tooltip: "Open note sidebar"
- Action: Toggle sidebar

## Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| Note header | text | `Misc. notes #nc` | Markdown heading text for the notes section |
| Header level | dropdown | `2` (##) | Heading level (2-4) |
| Log mode | dropdown | `daily` | `daily` or `weekly` log file target |
| Log folder | text | *(empty)* | Fallback folder if Daily Notes plugin unavailable |
| Recent notes limit | number | `50` | Max entries to keep in history |

Settings tab includes the standard about section with N⌘ logo, version, and description.

## File Format

Notes are appended as bullet items under a markdown heading in the log file.

### Example: daily note after three captured notes

```markdown
# 2026-04-02

... existing daily note content ...

## Misc. notes #nc
- First note captured today
- Second note with **markdown** formatting
- A longer note that spans
  multiple lines in the original input
```

### Rules

1. Header is inserted at the end of the file if not found
2. New bullets are appended after the last bullet in the section
3. Multi-line input becomes a single bullet with continuation lines indented by 2 spaces
4. The plugin never modifies existing content outside its header section
5. If the log file doesn't exist, create it with just the header section

## Branding

| Element | Value |
|---------|-------|
| Logo text | N⌘ |
| Logo colour | `#8b5cf6` (purple) |
| CSS prefix | `notate-command-` |
| Notice prefix | N⌘ |
| Plugin ID | `notate-command` |
| Display name | Note Command |
