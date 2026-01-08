# Obsidian plugins (README)

This is a set of plugins and helpers for Obsidian, for my personal and work workflows.

## ⌥⌘ Space Command

**⌥⌘ Space Command** (where "⌥⌘" is shorthand for "Space Command" using macOS modifier key symbols) is a comprehensive plugin for managing workflows across your Obsidian vault.

### ⌥⌘ TODOs

The **⌥⌘ TODOs** feature provides live embed TODOs in documents and a sidebar based on tag (`#todo`) as an unordered list with links to their source files.

Definitions:
- A TODO or TODOs are tasks that are lines of text identified with the tag `#todo`
- A TODONE (or TODONE) are tasks that are done 

Example:

```
{{focus-todos}}                     // Uses default from settings
{{focus-todos: todos/done.md}}      // Uses specific file
{{focus-todos | path:projects/}}    // Default file with filters
```

Produces a list that looks like:

```
- [ ] This is a todo →
```

Parameters:
- location of `#todone` file (optional - uses settings default if omitted)
- filters: `path:`, `tags:`, `limit:` (optional)

The list:
- UL as checlist items (`- [ ] item text #todo →`)
  - Populated with any line in any file in this vault including a `#todo` label
  - Each line links to the source file using the text `→`
  - When a TODO is checked off, the tag is also updated to `#todone`
  - item can be checked off by clicking or changing the tag to `#todone` in the source or embedded text
- TODOs that are "completed" in any file are no longer included
- Completed TODOs are logged to a file with the date added (default name of TODONEs.md)
  - e.g., `- [x] This is a todo #todone @2025/10/24
- there is an optional sidebar that shows the same set of TODOs and TODONs that are also interactive

### ⌥⌘ Projects

The **⌥⌘ Projects** feature automatically detects and manages projects based on tags in your TODOs.

**How it works:**
- Projects are automatically detected from any tags on lines with `#todo` (excluding `#todo` and `#todone` themselves)
- For example: `- [ ] File taxes #todo #taxes #rush` creates two projects: `#taxes` and `#rush`
- Each project tracks the number of active TODOs and most recent activity

**Projects Sidebar:**
- A "Projects" section appears at the top of the sidebar above "Active TODOs"
- Shows each project with its TODO count: `#taxes (3) →`
- Click the `→` link to open (or auto-create) the project file in your projects folder
- Click the star icon to pin/unpin projects as focus items

**Focus List Embed:**

Use `{{focus-list}}` to embed your focus projects in any note:

```
{{focus-list}}
```

The focus list shows:
- Pinned projects (starred) appear first
- Most active projects (by TODO count)
- Most recent projects (by activity timestamp)
- Configurable limit (default: 5 projects)

Example output:
```
- #taxes (3) ★ →
- #rush (2) →
- #writing (1) →
```

**Settings:**
- **Default projects folder**: Where project files are created (default: `projects/`)
- **Focus list limit**: Maximum projects shown in `{{focus-list}}` (default: 5)

**Project Files:**
When you click a project's `→` link, the plugin will:
1. Check if `projects/taxes.md` exists (based on tag `#taxes`)
2. If not, automatically create it with a basic template
3. Open the file for editing

## Future helpers

- Command to append daily summary to weekly log
- Pull in tickets (titles, links, assignees) by date and status