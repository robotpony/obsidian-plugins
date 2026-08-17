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
| `#future` / `#snooze`     | Snoozed — an ordinary tag; still shows in the active list and tag cloud, just excluded from Focus Mode's queue |

Items sort by: focus → priority → tag count (more tags = more context = higher).

**Project tags** group TODOs in the sidebar's tag cloud. Any tag that isn't a priority, lifecycle, or type tag becomes a project:

```markdown
- [ ] Write endpoint docs #todo #api #focus
- [ ] Update welcome email #todo #onboarding
```

Click a tag in the cloud to filter the list. Click again to clear. The cloud only shows tags with at least one active TODO — empty tags are hidden so you can always click and see results. Pinned `#focus` and `#p0` lead the cloud when they're in use.

The Ideas tab has its own tag cloud built from items in that tab (no `#focus` / `#p0` pinning — those are TODO concepts). The active filter persists across tabs, so clicking `#api` on TODOs and switching to Ideas keeps you on the same label.

Right-click any TODO row for quick actions: Focus, Later, Snooze, Copy, Move to.

## Focus mode

Click the eye icon next to the TODOs tab to enter immersive Focus Mode. The sidebar shows a single focus card — the source heading with a link icon, a checkbox beside the task, faded tag chiclets, and a friendly date.

- **Complete** finishes the task (or just check the box)
- **Skip** rotates the current item to the back of the queue
- **Exit focus mode →** link at the bottom returns to the normal sidebar

The header stays visible when focus mode is on, and the title reads "Focus." The eye icon turns amber to signal the active state; clicking it again exits focus mode without moving the mouse. The other tab buttons stay clickable — clicking one exits focus and switches straight to that tab, same as switching between any two tabs normally.

The queue is built from `#focus`-tagged TODOs first; if none exist, it falls back to your top-priority items. When the queue empties, you can choose **Continue with next priority task** to keep going.

Mode state persists across sessions by default; configure via the `focusQueueLimit` (1–5, default 1) and `focusModePersist` settings.

## Two tabs

The sidebar has two tabs:

| Tab     | Shows                                                                                  |
|---------|----------------------------------------------------------------------------------------|
| TODOs   | Active `#todo` items, grouped by header where applicable. Default tab.                |
| Ideas   | Active `#idea` / `#ideas` / `#ideation` items                                          |

Snoozed items (`#future` / `#snooze` / `#snoozed`) show up in both tabs like any other tag — right-click a row to Snooze/Unsnooze it. The only place snoozed items are excluded is Focus Mode's queue.

Below the lists, the **Summary** section shows priority breakdown, completion velocity (today / week / month), top backlogs, and a link to your TODONE log file.

## Mentions and delegation

Assign TODOs to people with `@handle`:

```markdown
- [ ] Review the API spec #todo @eric.m
- [ ] Update onboarding docs #todo @me
```

Mentions appear as subdued badges next to topic tags. `@me` resolves to your handle from the team file. The tag cloud shows assignee pills alongside project tags (`@me` first, then other handles with active TODOs, then `@unassigned`). Click a pill to filter by that person; click again to clear.

### Team file

Create `team.md` in your vault root (or configure the path in Settings):

```markdown
- @bruce — Bruce Alderson (me)
- @eric.m — Eric Mitchell
- @dana — Dana Park
```

Mark yourself with `(me)`. The plugin auto-creates this file from Settings if it doesn't exist and auto-adds unknown handles encountered in TODOs.

## Header TODOs

Tag a heading with `#todo` (or `#todos`) and the list items underneath become children of that heading. It's the most useful style for sprints, meeting follow-ups, or any block of related tasks that belongs in one place.

```markdown
## Sprint 12 #todos #api
- [ ] Fix auth bug #p0
- [ ] Update docs
- [ ] Investigate flaky test

**Diagnostics (P0)**
- [ ] Add structured logging
- [ ] Wire OpenTelemetry traces
```

**In the sidebar**, the heading renders as a single block:

- The header row shows the heading text, the source filename, and a `→` link that opens the file with the entire block (header through last child) selected.
- Children render indented underneath, each with its own checkbox.
- Bold lines like `**Diagnostics (P0)**` carry through as in-block subheadings, so you can label sections without breaking the parent relationship.
- The header itself has no checkbox — completing a block used to cascade to all children, and it was too easy to do by accident.

**Completion is per-child.** Tick children as you finish them. When the last live child is done, the whole header block disappears from the active list automatically. No "mark the header done" step.

**Filtering keeps headers visible.** Click a tag like `#api` in the cloud and the header stays in view even if only its children carry the tag — you see the matching work in its original context, not stripped of its parent.

**Inline controls on the header row:**

- **Sort buttons** re-order children by priority tag (`#p0` → `#p4`).
- **Right-click → Move to…** (or the command palette) relocates the entire block — header plus all children — to another file in one move.

The same pattern works for `#idea` / `#ideas` headings, with children rendered the same way in the Ideas tab.

## Ideas and principles

Capture ideas separately from actionable TODOs:

| Tag                              | Purpose                                       |
|----------------------------------|-----------------------------------------------|
| `#idea` / `#ideas` / `#ideation` | Something to capture (not yet actionable)     |
| `#principle`                     | A guiding principle (reference only)          |

Click an idea's checkbox to dismiss it. Right-click to promote it to a TODO.

`#principle` items aren't surfaced in the Ideas tab anymore — they appear in the project-info popup for any project they're tagged with, and the Stats modal still counts them.

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
| Toggle Projects sidebar        | —                    | Show or hide the Projects sidebar                       |
| Sync Projects                  | —                    | Re-scan every repo under the configured base folder and update their notes |

The ribbon icon toggles the sidebar; right-click in the sidebar's header gear menu for **Stats**, **Refresh**, and other utilities.

## Sidebar utilities

- **Stats** — chart icon (or right-click menu) opens a modal showing counts of active TODOs, focused items, snoozed items, ideas, and principles.
- **Clickable links** — wiki links (`[[page]]`) and external links in TODOs, ideas, and principles are clickable in the sidebar. Disable in Settings → "Make links clickable in lists."
- **Tab lock** — enable in Settings → "Show tab lock buttons." Click the padlock icon on any tab header; locked tabs force links to open in new tabs instead of replacing the current view.

## Projects

A second sidebar, separate from the TODOs one, for tracking work across a
folder of git repos rather than vault notes.

Point it at a folder in Settings → Projects → "Projects base folder" (e.g.
`/Users/you/projects`). It finds every git repo underneath (skipping
`node_modules`, `dist`, `build`, `archive`, and anything else you add to
"Projects exclude directories"), and for each one:

- Creates or updates a vault note with the repo's branch, git status,
  remote, and last-synced time in the frontmatter.
- Pulls in `#todo`/`#idea`/`#bug` items from the repo's `BUGS.md`,
  `TODO.md`, `TODOS.md`, `IDEAS.md`, or `ISSUES.md` — tagged explicitly or
  not (an untagged line in `BUGS.md` is assumed to be a bug, in `TODO.md` a
  todo, and so on).

Click a project in the list to open its note and see a detail view: repo
facts pinned at the top, and every tracked item grouped by type. Completing
an item there writes back to the actual file in the repo, not just the
vault note — the same familiar focus/snooze/priority actions from the
TODOs sidebar work here too (no "move," since moving a synced item
elsewhere would just have it reappear in its original note on the next
sync).

Prose-style bug write-ups (a `### Title` under a `## Open`/`## Fixed`
heading, rather than a flat checklist) complete the same way: the whole
write-up moves to the first section that reads as "done" (creating one if
the file doesn't have one yet), and moves back just as easily if you
uncheck it. This refuses if the file has changes it hasn't committed yet —
commit or stash first — so a mistake is always one `git checkout` away
from undone.

Structured files stay in sync automatically (a background watcher picks up
changes on disk), or trigger a sync manually with the sidebar's **Sync**
button or the "Sync Projects" command. Requires the plugin's desktop build
(`git` and filesystem access aren't available on mobile).

Frontmatter is hidden in the note's editor view for these project notes —
the sidebar already shows the fields that matter, so the raw YAML would
just be noise. Note content you write by hand (an `## Overview` section,
your own notes) is never touched by syncing.

## Installation

From the repo root:

```bash
./install.sh
```

Follow the prompts to select vaults. Subsequent installs can use `./install.sh -p` to reuse cached vault paths.

Manually: copy `main.js`, `manifest.json`, and `styles.css` to `<vault>/.obsidian/plugins/space-command/`, then enable in Settings → Community plugins.

## License

MIT — see [LICENSE](../LICENSE).
