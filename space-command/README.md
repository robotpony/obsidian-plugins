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

Items sort by: focus → priority → tag count (more tags = more context = higher).

**Focus mode**: Click the eye icon in the sidebar header to filter everything to `#focus` items only. When "Focus mode includes project TODOs" is enabled in Settings, Ideas and Principles from focused projects also appear.

**Project tags** group TODOs in the sidebar's Focus section. Any tag that isn't a priority or type tag becomes a project:

```markdown
- [ ] Write endpoint docs #todo #api #focus
- [ ] Update welcome email #todo #onboarding
```

The Focus section shows your top 5 projects by default. The DONE section links to your done file. Both limits are configurable in Settings.

Right-click any TODO for quick actions: Focus, Later, Snooze, Copy, Move to.

### Moving TODOs between files

Use "Move to..." (right-click menu or command palette) to relocate a TODO to another file. The source line becomes `#moved @date`, and a fresh copy appears in the destination. Header TODOs move with all their children.

Moved lines are dimmed in both Reading mode and Live Preview, so they stay visible as an audit trail without cluttering your active view. You can also type `#moved` manually—the plugin auto-stamps the date.

## Ideas and Principles

Capture ideas separately from actionable TODOs. The sidebar has two tabs—TODOs and Ideas.

| Tag                              | Purpose                                   |
|----------------------------------|-------------------------------------------|
| `#idea` / `#ideas` / `#ideation` | Something to capture (not yet actionable) |
| `#principle`                     | A guiding principle (reference only)      |

Click an idea's checkbox to dismiss it. Right-click to promote it to a TODO.

## Header TODOs

Add `#todo` to a heading—all list items below become children:

```markdown
## Sprint 12 #todo
- Fix auth bug
- Update docs
```

Completing the header completes all children. Sort buttons appear inline to re-sort children by priority tag.

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

## Automatic File Tags

TODOs in your projects folder without explicit project tags are grouped by filename:

```markdown
<!-- In projects/api-tasks.md -->
- [ ] Fix rate limiting #todo       → grouped under #api-tasks
- [ ] Add caching #todo #backend    → grouped under #backend (explicit wins)
```

Add an explicit project tag to override. Files outside the projects folder don't get inferred tags. Configure excluded folders (like `log`) in Settings.

## Editor Shortcuts

### Slash commands

Type `/` at the start of a line:

| Command | Inserts |
|---------|---------|
| `/todo` | `- [ ] #todo ` (ready to type) |
| `/callout` | Obsidian callout block |
| `/today` | Today's date |
| `/tomorrow` | Tomorrow's date |

### Date suggestions

Type `@` anywhere to insert dates: `@today`, `@tomorrow`, `@yesterday`. Format is configurable (default: `YYYY-MM-DD`).

### Copy for other tools

Select text and right-click, or use the keyboard shortcuts:

- **Copy as Slack** (`Cmd/Ctrl+Shift+C`): Converts markdown to Slack's mrkdwn format (headings become bold, adjusted emphasis markers).
- **Copy as Notion** (`Cmd/Ctrl+Shift+N`): Strips Obsidian-specific syntax (wiki links become plain text, embeds removed, callouts become blockquotes, plugin tags stripped). Standard markdown is preserved.

## Sidebar Features

### Stats and triage

Click the chart icon in the sidebar header to see counts of active TODOs, focused items, snoozed items, ideas, and principles.

When you have too many snoozed or active items (configurable thresholds), a triage alert appears. Click it to process items one by one: Snooze, Clear, Convert (TODO ↔ Idea), Focus, Skip.

### Clickable links

Links in TODOs, ideas, and principles are clickable in both sidebar and embeds. Wiki links (`[[page]]`) navigate within Obsidian; external links open in a browser. Disable in Settings → "Make links clickable in lists."

### Tab lock

Keep documents open while navigating. Enable in Settings → "Show tab lock buttons," then click the padlock icon on any tab header. Links clicked from a locked tab open in new tabs instead of replacing the current view. Uses Obsidian's native pinning.

## Installation

From the repo root, run `./install.sh` and follow the prompts to select vaults.

Or manually: copy `main.js`, `manifest.json`, and `styles.css` to `.obsidian/plugins/space-command/` in your vault, then enable in Settings.

## License

MIT
