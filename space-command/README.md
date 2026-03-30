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
| `#focus` | The one thing to do next (highlighted, always first) |
| `#p0` – `#p4` | Priority levels (0 = highest) |
| `#future` | Snoozed—hidden from active list |

Items sort by: focus → priority → tag count (more tags = more context = higher). Focus projects list shows top 5 by default; TODO list shows all. Configure limits in Settings. Click the eye icon in the Focus header to toggle focus mode—filters projects, TODOs, Ideas, and Principles to show only `#focus` items (or items from focused projects when that setting is enabled). The DONE section links to your done file.

**Project tags** group TODOs in the sidebar's Focus section. Any tag that isn't a priority or type tag becomes a project:

```markdown
- [ ] Write endpoint docs #todo #api #focus
- [ ] Update welcome email #todo #onboarding
```

Right-click any TODO for quick actions: Focus, Later, Snooze, Copy, Move to.

### Moving TODOs between files

Use "Move to..." (right-click menu or command palette) to relocate a TODO to another file. The source line becomes `#moved @date` (hidden from all views), and a fresh copy appears in the destination. Header TODOs move with all their children. You can also type `#moved` manually—the plugin auto-stamps the date.

## Ideas Tab

Capture ideas separately from actionable TODOs. The sidebar has two tabs—TODOs and Ideas.

| Tag                              | Purpose                                   |
|----------------------------------|-------------------------------------------|
| `#idea` / `#ideas` / `#ideation` | Something to capture (not yet actionable) |
| `#principle`                     | A guiding principle (reference only)      |

Click an idea's checkbox to dismiss it. Right-click to promote it to a TODO.

## Tab Lock

Keep documents open while navigating. When you click links from a locked tab, they open in new tabs instead of replacing the current view.

1. Enable in Settings → "Show tab lock buttons"
2. Click the padlock icon on any tab header to lock the tab
3. Locked tabs show a pushpin; click it to unlock

Uses Obsidian's native pinning, so locked tabs also stay open when closing other tabs.

## Clickable Links

Links in TODOs, ideas, and principles are clickable by default in both sidebar and embeds. Both wiki-style links (`[[page]]`, `[[page|alias]]`) and markdown links (`[text](url)`) work:

- **Wiki links** navigate to the page in Obsidian when clicked
- **External links** open in a new browser window
- **Disable in Settings** → "Make links clickable in lists" to show links as plain text instead

Example:
```markdown
- [ ] Review the [[API Spec|spec]] #todo
- [ ] Check [documentation](https://example.com) #todo
```

Both links will be clickable in the sidebar and embeds.

## Embed and Filter

Embed TODO or idea lists anywhere:

````markdown
```focus-todos
path:projects/
tags:#urgent
limit:5
```
````

````markdown
```focus-ideas
tags:#ux
```
````

Filters: `path:` (folder), `tags:` (require tags), `limit:` (cap list), `todone:hide` (hide completed).

**Inline syntax** (Reading Mode only):

```markdown
{{focus-todos}}
{{focus-ideas}}
{{focus-ideas | tags:#project path:notes/}}
```

## Header TODOs

Add `#todo` to a heading—all list items below become children:

```markdown
## Sprint 12 #todo
- Fix auth bug
- Update docs
```

Completing the header completes all children.

Header TODO sections also show sort buttons inline—click to re-sort children by priority tag.

## Automatic File Tags

TODOs in your projects folder without explicit project tags are grouped by filename:

```markdown
<!-- In projects/api-tasks.md -->
- [ ] Fix rate limiting #todo       → grouped under #api-tasks
- [ ] Add caching #todo #backend    → grouped under #backend (explicit wins)
```

Add an explicit project tag to override. Files outside the projects folder don't get inferred tags. Configure excluded folders (like `log`) in Settings.

## Slash Commands

Type `/` at the start of a line to see quick-insert options:

| Command | Inserts |
|---------|---------|
| `/todo` | `- [ ] #todo ` (ready to type) |
| `/callout` | Obsidian callout block |
| `/today` | Today's date |
| `/tomorrow` | Tomorrow's date |

## Date Suggestions

Type `@` anywhere to insert dates quickly:

- `@today` → current date
- `@tomorrow` → next day
- `@yesterday` → previous day

Dates use your configured format (default: `YYYY-MM-DD`).

## Stats and Triage

**Stats**: Click the chart icon in the sidebar header to see counts of active TODOs, focused items, snoozed items, ideas, and principles.

**Triage**: When you have too many snoozed or active items (configurable thresholds), a triage alert appears. Click it to process items one by one with quick actions: Snooze, Clear, Convert (TODO ↔ Idea), Focus, Skip.

## Copy as Slack

Select text and use `Cmd/Ctrl+Shift+C` or right-click → "Copy as Slack" to copy markdown formatted for Slack (bold, italic, links, lists).

## Copy as Notion

Select text and use `Cmd/Ctrl+Shift+N` or right-click → "Copy as Notion" to copy markdown formatted for Notion. Converts wiki links to plain text, strips embeds and plugin tags (#todo, #p0, etc.), and converts callouts to blockquotes. Standard markdown is preserved as-is.

## Installation

From the repo root, run `./install.sh` and follow the prompts to select vaults.

Or manually: copy `main.js`, `manifest.json`, and `styles.css` to `.obsidian/plugins/space-command/` in your vault, then enable in Settings.

## License

MIT
