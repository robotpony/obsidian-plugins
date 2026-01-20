# ␣⌘ Space Command for Obsidian

Focus on the right next task. Simple TODOs and tags in your markdown, surfaced when you need them.

## Why Space Command?

Your notes are full of TODOs—action items from meetings, tasks buried in project docs, ideas scattered across daily logs. Space Command surfaces them without moving them.

**Principles:**

- **Markdown-native**: Just `#todo` tags. Works with grep, git, scripts.
- **In-context**: TODOs stay where you wrote them.
- **No lock-in**: Plain text. Stop using the plugin anytime.
- **One vault, one focus**: Your working list, not your life system.

## Quick Start

1. **Add a TODO**: Put `#todo` on any line:
    ```markdown
    - [ ] Review the API spec #todo
    ```

2. **See your TODOs**: Open the sidebar (`Cmd/Ctrl+Shift+T`) or embed a list:
   ````markdown
   ```focus-todos
   ```
   ````

3. **Complete it**: Click the checkbox. It becomes `#todone @YYYY-MM-DD`.

That's it. Everything else is optional.

## Organize with Tags

**Priority tags** control sort order:

| Tag | Purpose |
|-----|---------|
| `#focus` | The one thing to do next (highlighted) |
| `#p0` – `#p4` | Priority levels (0 = highest) |
| `#future` | Snoozed—hidden from active list |

**Project tags** group TODOs in the sidebar's Focus section. Any tag that isn't a priority or type tag becomes a project:

```markdown
- [ ] Write endpoint docs #todo #api #focus
- [ ] Update welcome email #todo #onboarding
```

**Automatic file tags**: TODOs without explicit project tags are automatically grouped by filename. A TODO in `api-tasks.md` appears under `#api-tasks` in the Focus section. Explicit tags always win—add a project tag to override the automatic grouping.

Right-click any TODO for quick actions: Focus, Later, Snooze.

## Ideas Tab

Capture ideas separately from actionable TODOs. The sidebar has two tabs—TODOs and Ideas.

| Tag          | Purpose                                   |
|--------------|-------------------------------------------|
| `#idea`      | Something to capture (not yet actionable) |
| `#principle` | A guiding principle (reference only)      |

Click an idea's checkbox to dismiss it. Right-click to promote it to a TODO.

## Embed and Filter

Embed TODO lists anywhere:

````markdown
```focus-todos
path:projects/
tags:#urgent
limit:5
```
````

Filters: `path:` (folder), `tags:` (require tags), `limit:` (cap list), `todone:hide` (hide completed).

## Header TODOs

Add `#todo` to a heading—all list items below become children:

```markdown
## Sprint 12 #todo
- Fix auth bug
- Update docs
```

Completing the header completes all children.

## Installation

Copy to `.obsidian/plugins/space-command/`, run `npm install && npm run build`, enable in Settings.

## License

MIT
