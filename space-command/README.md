# ␣⌘ Space Command for Obsidian

Focus on the right next task. Plain `#todo` tags in your markdown, surfaced in a sidebar when you need them.

## Why Space Command?

Your notes are full of TODOs — action items from meetings, tasks buried in project docs, ideas scattered across daily logs. Space Command surfaces them without moving them.

**Principles:**

- **Markdown-native**: Just `#todo` tags. Works with grep, git, scripts.
- **In-context**: TODOs stay where you wrote them.
- **No lock-in**: Plain text. Stop using the plugin anytime.
- **One vault, one focus**: Your working list, not your life system.

## Quick start

1. **Add a TODO**: put `#todo` on any line:

   ```markdown
   - [ ] Review the API spec #todo
   ```

2. **See your TODOs**: open the sidebar with `Cmd/Ctrl+Shift+T`.

3. **Complete it**: click the checkbox. The line becomes `#todone @YYYY-MM-DD` and is appended to your TODONE log file.

That's it. Everything below is optional.

## Organize with tags

**Priority tags** control sort order:

| Tag                       | Purpose                                              |
|---------------------------|------------------------------------------------------|
| `#focus`                  | The one thing to do next (highlighted, always first) |
| `#p0` – `#p4`             | Priority levels (`#p0` is highest)                   |
| `#future` / `#snooze`     | Snoozed — hidden from active list, lives in Snoozed tab |

Items sort by: focus → priority → tag count (more tags = more context = higher).

**Project tags** group TODOs in the sidebar's tag cloud. Any tag that isn't a priority, lifecycle, or type tag becomes a project:

```markdown
- [ ] Write endpoint docs #todo #api #focus
- [ ] Update welcome email #todo #onboarding
```

Click a tag in the cloud to filter the list. Click again to clear. The cloud only shows tags with at least one active TODO — empty tags are hidden so you can always click and see results. Pinned `#focus` and `#p0` lead the cloud when they're in use.

Right-click any TODO row for quick actions: Focus, Later, Snooze, Copy, Move to.

## Focus mode

Click the eye icon in the Focus section header to enter immersive Focus Mode. The sidebar replaces its content with a single focus card — the source heading with a link icon, a checkbox beside the task, faded tag chiclets, and a friendly date.

- **Complete** finishes the task (or just check the box)
- **Skip** rotates the current item to the back of the queue
- **Exit focus mode →** returns to the normal sidebar

The queue is built from `#focus`-tagged TODOs first; if none exist, it falls back to your top-priority items. When the queue empties, you can choose **Continue with next priority task** to keep going.

Mode state persists across sessions by default; configure via the `focusQueueLimit` (1–5, default 1) and `focusModePersist` settings.

## Three tabs

The sidebar has three tabs:

| Tab     | Shows                                                                                  |
|---------|----------------------------------------------------------------------------------------|
| TODOs   | Active (non-snoozed) `#todo` items, grouped by header where applicable. Default tab.   |
| Ideas   | Active `#idea` / `#ideas` / `#ideation` items + `#principle` references                |
| Snoozed | `#future` / `#snooze` / `#snoozed` TODOs and Ideas — review and unsnooze when ready    |

Below the lists, the **Summary** section shows priority breakdown, completion velocity (today / week / month), top backlogs, and a link to your TODONE log file.

## Mentions and delegation

Assign TODOs to people with `@handle`:

```markdown
- [ ] Review the API spec #todo @eric.m
- [ ] Update onboarding docs #todo @me
```

Mentions appear as subdued badges next to topic tags. `@me` resolves to your handle from the team file. The sidebar has an assignee dropdown to filter by person.

### Team file

Create `team.md` in your vault root (or configure the path in Settings):

```markdown
- @bruce — Bruce Alderson (me)
- @eric.m — Eric Mitchell
- @dana — Dana Park
```

Mark yourself with `(me)`. The plugin auto-creates this file from Settings if it doesn't exist and auto-adds unknown handles encountered in TODOs.

## Header TODOs

Add `#todo` to a heading — list items below become children:

```markdown
## Sprint 12 #todo
- Fix auth bug
- Update docs
```

Children are completed individually. Header TODOs with children don't get a checkbox in the sidebar so you can't accidentally bulk-complete a whole block. Sort buttons appear inline to re-sort children by priority tag.

"Move to..." (right-click or command palette) relocates the entire block — header plus children — to another file.

## Ideas and principles

Capture ideas separately from actionable TODOs:

| Tag                              | Purpose                                       |
|----------------------------------|-----------------------------------------------|
| `#idea` / `#ideas` / `#ideation` | Something to capture (not yet actionable)     |
| `#principle`                     | A guiding principle (reference only)          |

Click an idea's checkbox to dismiss it. Right-click to promote it to a TODO.

## Moving TODOs between files

Use **Move TODO to another file** (right-click or command palette) to relocate a TODO. The source line becomes `#moved @date`, and a fresh copy appears in the destination.

Moved lines are dimmed in both Reading mode and Live Preview, so they stay visible as an audit trail without cluttering your active view. You can also type `#moved` manually — the plugin auto-stamps the date.

## Automatic file tags

TODOs in your projects folder without explicit project tags are grouped by filename:

```markdown
<!-- In projects/api-tasks.md -->
- [ ] Fix rate limiting #todo       → grouped under #api-tasks
- [ ] Add caching #todo #backend    → grouped under #backend (explicit wins)
```

Add an explicit project tag to override. Files outside the projects folder don't get inferred tags. Configure excluded folders (like `log`) in Settings.

## Editor shortcuts

### Slash commands

Type `/` at the start of a line:

| Command      | Inserts                              |
|--------------|--------------------------------------|
| `/todo`      | `- [ ] #todo ` (ready to type)       |
| `/todos`     | `- [ ] #todos ` heading + blank item |
| `/idea`      | `- [ ] #idea `                       |
| `/ideas`     | `- [ ] #ideas ` heading + blank item |
| `/today`     | Today's formatted date               |
| `/tomorrow`  | Tomorrow's formatted date            |
| `/callout`   | Obsidian callout block               |

### @ suggestions

Type `@` anywhere to get a combined suggestion popup:

| Suggestion              | Inserts                                       |
|-------------------------|-----------------------------------------------|
| `@today` / `@date`      | Today's formatted date                        |
| `@tomorrow`             | Tomorrow's date                               |
| `@yesterday`            | Yesterday's date                              |
| `@me` / `@handle`       | Attribution mention (from team file)          |

Date keywords take priority over user handles. Unknown handles are auto-added to your team file.

## Commands and hotkeys

| Command                        | Default hotkey       | What it does                                            |
|--------------------------------|----------------------|---------------------------------------------------------|
| Toggle TODO sidebar            | `Cmd/Ctrl+Shift+T`   | Show or hide the sidebar                                |
| Quick Add TODO                 | `Cmd/Ctrl+Shift+A`   | Insert a new `#todo` at cursor or append to current line |
| Refresh TODOs                  | —                    | Re-scan the vault and refresh the sidebar               |
| Move TODO to another file      | —                    | Open the file picker; relocates the line at cursor      |
| Copy as Slack Markdown         | `Cmd/Ctrl+Shift+C`   | Converts selected text to Slack's mrkdwn (headings → bold, adjusted emphasis) |
| Copy as Notion Markdown        | `Cmd/Ctrl+Shift+N`   | Strips Obsidian-specific syntax (wiki links, embeds, plugin tags) for clean Notion paste |

The ribbon icon toggles the sidebar; right-click in the sidebar's header gear menu for **Stats**, **Refresh**, and other utilities.

## Sidebar utilities

- **Stats** — chart icon (or right-click menu) opens a modal showing counts of active TODOs, focused items, snoozed items, ideas, and principles.
- **Clickable links** — wiki links (`[[page]]`) and external links in TODOs, ideas, and principles are clickable in the sidebar. Disable in Settings → "Make links clickable in lists."
- **Tab lock** — enable in Settings → "Show tab lock buttons." Click the padlock icon on any tab header; locked tabs force links to open in new tabs instead of replacing the current view.

## Installation

From the repo root:

```bash
./install.sh
```

Follow the prompts to select vaults. Subsequent installs can use `./install.sh -p` to reuse cached vault paths.

Manually: copy `main.js`, `manifest.json`, and `styles.css` to `<vault>/.obsidian/plugins/space-command/`, then enable in Settings → Community plugins.

## License

MIT — see [LICENSE](../LICENSE).
