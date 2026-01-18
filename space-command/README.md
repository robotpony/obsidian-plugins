# ⌥⌘ Space Command for Obsidian

Focus on the right next task. Simple TODOs and tags in your markdown, surfaced when you need them.

## Why Space Command?

Your notes are full of TODOs—action items from meetings, tasks buried in project docs, ideas scattered across daily logs. Space Command surfaces them without moving them.

**Principles:**

- **Markdown-native**: Just `#todo` tags. Works with grep, git, scripts, whatever you use.
- **Work in your notes**: TODOs stay in context, not a separate app.
- **No lock-in**: Plain text. Stop using the plugin anytime; your notes stay unchanged.
- **One vault, one focus**: This is your working list, not your life system.

Space Command isn't Todoist or Jira. It's for the TODOs that live in your notes. It surfaces them so you can focus, then gets out of your way.

## Quick Start

1. **Add a TODO**: Put `#todo` on any line:
    ```markdown
    - [ ] Review the API spec #todo
    ```

2. **See your TODOs**: Open the sidebar (Cmd/Ctrl+Shift+T) or embed a list:
   ````markdown
   ```focus-todos
   ```
   ````

3. **Complete it**: Click the checkbox. It becomes `#todone @YYYY-MM-DD` with a log entry.

That's it. Everything else is optional.

## Ideas Tab

Capture ideas separately from actionable TODOs. The sidebar has two tabs:

- **TODOs** (checkmark): Your actionable task list
- **Ideas** (lightbulb): Ideas and guiding principles

**Idea tags:**

| Tag | Purpose |
|-----|---------|
| `#idea` | An idea to capture (not yet actionable) |
| `#principle` | A guiding principle (displayed in italics, no actions) |

```markdown
- What if we cached API responses? #idea #api
- Always validate at system boundaries #principle
```

**Idea actions:**
- **Checkbox**: Click to dismiss the idea (removes `#idea` tag)
- **Right-click → Add to TODOs**: Promotes `#idea` to `#todo`
- **Right-click → Focus**: Adds `#focus` for prioritization

Principles appear at the top in italics—reference items with no checkbox or actions.

## Organize

Use tags to prioritize and categorize:

**Priority tags** (control sort order):

| Tag | Purpose |
|-----|---------|
| `#focus` | The one thing to do next (highlighted) |
| `#p0` – `#p4` | Priority levels (0 = highest) |
| `#future` | Snoozed—hidden from active list |

**Project tags** (group in sidebar):

Any other tag becomes a project you can focus on. TODOs tagged `#api` or `#onboarding` (for example) are grouped under that project in the sidebar's Projects section.

```markdown
- [ ] Write endpoint docs #todo #api #focus
- [ ] Update welcome email #todo #onboarding
```

Right-click any TODO for quick actions: Focus, Later, Snooze.

## Filter and Embed

Embed TODO lists anywhere with filters:

````markdown
```focus-todos
path:projects/
tags:#urgent
limit:5
```
````

| Filter | Example | Effect |
|--------|---------|--------|
| `path:` | `path:work/` | TODOs from a folder |
| `tags:` | `tags:#urgent,#api` | TODOs with all specified tags |
| `limit:` | `limit:10` | Cap the list |
| `todone:` | `todone:hide` | Hide completed items |

## Capture Quickly

**Slash commands** (at line start):
- `/todo`: New TODO item
- `/todos`: TODOs heading with a blank item
- `/today`, `/tomorrow`: Insert date
- `/callout`: Insert callout block (info, tip, warning, etc.)

**Date insert** (anywhere):
- `@today`, `@tomorrow`, `@yesterday`, `@date`

## Works With Other Tools

- **Slack**: Cmd/Ctrl+Shift+C (and via the right-click menu) copies selection as Slack markdown
- **Plain text**: `#todo` and `#todone` tags work with grep, scripts, CI checks
- **Git-friendly**: No database, just your markdown files

## Reference

### Syntax

**Inline** (Reading Mode only):
```markdown
{{focus-todos}}
{{focus-todos | tags:#urgent}}
{{focus-todos: todos/done.md | path:projects/}}
```

**Code blocks** (Reading Mode + Live Preview):
````markdown
```focus-todos
path:projects/
tags:#urgent
limit:10
```
````

**Focus list** (shows projects with `#focus` items):
````markdown
```focus-list
```
````

### Header TODOs

Add `#todo` to a header; all list items below become children:

```markdown
## Sprint 12 Tasks #todo
- Fix auth bug
- Update docs
- Deploy to staging
```

Completing the header completes all children.

### Settings

| Setting | Default | Description |
|---------|---------|-------------|
| TODONE log file | `todos/done.md` | File where completed TODOs are logged |
| Date format | `YYYY-MM-DD` | Format for completion dates (moment.js) |
| Default projects folder | `projects/` | Folder where new project files are created |
| Focus list limit | `5` | Max projects shown in `{{focus-list}}` |
| Priority tags | `#p0,#p1,#p2,#p3,#p4` | Tags excluded from Projects grouping |
| Recent TODONEs shown | `5` | Max completed items in sidebar |
| Show sidebar on startup | On | Open TODO sidebar when Obsidian starts |

### Commands

| Command | Default Shortcut | Action |
|---------|------------------|--------|
| Toggle TODO Sidebar | Cmd/Ctrl+Shift+T | Show/hide the sidebar |
| Quick Add TODO | Cmd/Ctrl+Shift+A | Insert TODO at cursor |
| Copy as Slack Markdown | Cmd/Ctrl+Shift+C | Copy selection as Slack format |
| Refresh TODOs | — | Manually rescan vault |

## Installation

**Manual:**
1. Copy to `.obsidian/plugins/space-command/`
2. `npm install && npm run build`
3. Enable in Settings → Community Plugins

**Development:** `npm run dev` for watch mode.

## License

MIT: Made by Bruce Alderson
