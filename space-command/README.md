# ⌥⌘ Space Command

Focus on the right next task. Simple TODOs and tags in your markdown, surfaced when you need them.

## Why Space Command?

Your notes are full of TODOs—action items from meetings, tasks buried in project docs, ideas scattered across daily logs. Space Command surfaces them without moving them.

**Principles:**

- **Markdown-native** — Just `#todo` tags. Works with grep, git, scripts, whatever you use.
- **Work in your notes** — TODOs stay in context, not a separate app.
- **No lock-in** — Plain text. Stop using the plugin anytime; your notes stay unchanged.
- **One vault, one focus** — This is your working list, not your life system.

Space Command isn't Todoist or Jira. It's for the TODOs that live in your notes. It surfaces them so you can focus, then gets out of your way.

## Quick Start

1. **Add a TODO** — Put `#todo` on any line:
   ```markdown
   - [ ] Review the API spec #todo
   ```

2. **See your TODOs** — Open the sidebar (Cmd/Ctrl+Shift+T) or embed a list:
   ````markdown
   ```focus-todos
   ```
   ````

3. **Complete it** — Click the checkbox. It becomes `#todone @YYYY-MM-DD` with a log entry.

That's it. Everything else is optional.

## Prioritize

Use tags to surface what matters:

| Tag | Purpose |
|-----|---------|
| `#focus` | The one thing to do next (highlighted) |
| `#p0` – `#p4` | Priority levels (0 = highest) |
| `#future` | Snoozed—hidden from active list |

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
- `/todo` — New TODO item
- `/todos` — TODOs heading with a blank item
- `/today`, `/tomorrow` — Insert date
- `/callout` — Insert callout block (info, tip, warning, etc.)

**Date insert** (anywhere):
- `@today`, `@tomorrow`, `@yesterday`, `@date`

## Works With Other Tools

- **Slack** — Cmd/Ctrl+Shift+C copies selection as Slack markdown
- **Plain text** — `#todo` and `#todone` tags work with grep, scripts, CI checks
- **Git-friendly** — No database, just your markdown files

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

### Header TODOs

Add `#todo` to a header—all list items below become children:

```markdown
## Sprint 12 Tasks #todo
- Fix auth bug
- Update docs
- Deploy to staging
```

Completing the header completes all children.

### Settings

| Setting | Default |
|---------|---------|
| TODONE log file | `todos/done.md` |
| Date format | `YYYY-MM-DD` |
| Priority tags | `#p0,#p1,#p2,#p3,#p4` |
| Recent TODONEs shown | 5 |
| Show sidebar on startup | On |

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd/Ctrl+Shift+T | Toggle sidebar |
| Cmd/Ctrl+Shift+A | Add TODO at cursor |
| Cmd/Ctrl+Shift+C | Copy as Slack markdown |

## Installation

**Manual:**
1. Copy to `.obsidian/plugins/space-command/`
2. `npm install && npm run build`
3. Enable in Settings → Community Plugins

**Development:** `npm run dev` for watch mode.

## License

MIT — Made by Bruce Alderson
