# ␣⌘ Warped Command for Obsidian

![License: MIT](https://img.shields.io/badge/license-MIT-green)
![Platform: Desktop only](https://img.shields.io/badge/platform-desktop--only-lightgrey)
![Obsidian: 0.15.0+](https://img.shields.io/badge/obsidian-0.15.0%2B-7c3aed)

Focus on the right next task. Plain `#todo` tags in your markdown, surfaced in a sidebar when you need them.

## Contents

- [␣⌘ Warped Command for Obsidian](#-warped-command-for-obsidian)
  - [Contents](#contents)
  - [What it solves](#what-it-solves)
  - [Quick start](#quick-start)
  - [Organize with tags](#organize-with-tags)
  - [Focus mode](#focus-mode)
  - [Tabs](#tabs)
  - [Mentions and delegation](#mentions-and-delegation)
    - [Team file](#team-file)
  - [Header TODOs](#header-todos)
  - [Ideas and principles](#ideas-and-principles)
  - [Moving TODOs between files](#moving-todos-between-files)
  - [Automatic file tags](#automatic-file-tags)
  - [Editor shortcuts](#editor-shortcuts)
    - [Slash commands](#slash-commands)
    - [@ suggestions](#-suggestions)
  - [Commands and hotkeys](#commands-and-hotkeys)
  - [Sidebar utilities](#sidebar-utilities)
  - [Projects](#projects)
  - [Installation](#installation)
    - [Option 1: install script (recommended)](#option-1-install-script-recommended)
    - [Option 2: manual build](#option-2-manual-build)
  - [Troubleshooting](#troubleshooting)
  - [Known limitations](#known-limitations)
  - [Releases and changelog](#releases-and-changelog)
  - [Contributing](#contributing)
  - [License](#license)

## What it solves

Action items get lost. A fix mentioned in a meeting note, an idea scattered in a project doc, a "we should really..." buried three paragraphs into a daily log: none of it resurfaces unless you go looking for it, and you only go looking once you've already forgotten it exists.

Warped Command's fix is one plain tag, `#todo`. Write it inline, wherever the thought happens. The plugin scans your vault, finds every tagged line, and surfaces it in a sidebar sorted by priority, so the fix you noted last Tuesday shows up again when you need it, not just when you happen to reopen that file.

Tag a single line for a one-off task. For a cluster of related tasks, tag the heading instead (`#todo` or `#todos`) and skip tagging each line:

```markdown
<!-- meetings/2026-08-14-standup.md -->
## Standup notes #todos
- [ ] Check token refresh logic @sarah #p1
- [ ] Write a regression test once the fix lands
```

Both items appear in the sidebar right away as one block under "Standup notes," sorted by priority, still living in the meeting note where the context is. Nothing moved to a separate app, nothing got retyped into a task manager. See [Header TODOs](#header-todos) for the full pattern, including sub-sections and moving the whole block at once.

Why this holds up over time:

- **Markdown native.** It's a tag on a line, so it works with grep, git blame, and every other tool you already use on your vault.
- **In context.** Tasks stay where you wrote them. There's no decision about which project the task "really" belongs to.
- **No lock-in.** It's plain text. Disable the plugin and your TODOs are still there, still readable.
- **One vault, one focus.** This is a working list, not a life-management system. It doesn't try to replace a full task manager, a calendar, or a wiki.

## Quick start

1. **Add a task**: put `#todo` on any line or header for a list of TODOs.

   ```markdown
   - [ ] Review the API spec #todo
   ```

2. **See your tasks**: open the sidebar with `Cmd/Ctrl+Shift+T`.

3. **Complete a task**: click the checkbox. The line becomes `#todone @YYYY-MM-DD` and is appended to your TODONE log file.

That's it. Everything below is optional, but if you've got several related tasks (a sprint, a meeting's action items).

## Organize with tags

**Priority tags** control sort order:

| Tag                       | Purpose                                              |
|---------------------------|------------------------------------------------------|
| `#focus`                  | The one thing to do next (highlighted, always first) |
| `#p0` – `#p4`             | Priority levels (`#p0` is highest)                   |
| `#future` / `#snooze`     | Snoozed, an ordinary tag; still shows in the active list and tag cloud, just excluded from Focus Mode's queue |

Items sort by: focus, then priority, then tag count (more tags means more context, so it sorts higher).

**Project tags** group TODOs in the sidebar's tag cloud. Any tag that isn't a priority, lifecycle, or type tag becomes a project:

```markdown
- [ ] Write endpoint docs #todo #api #focus
- [ ] Update welcome email #todo #onboarding
```

Click a tag in the cloud to filter the list. Click again to clear. The cloud only shows tags with at least one active TODO; empty tags are hidden so you can always click and see results. Pinned `#focus` and `#p0` lead the cloud when they're in use.

The Ideas tab has its own tag cloud built from items in that tab (no `#focus` / `#p0` pinning; those are TODO concepts). The active filter persists across tabs, so clicking `#api` on TODOs and switching to Ideas keeps you on the same label.

Right-click any TODO row for quick actions: Focus, Later, Snooze, Copy, Move to.

## Focus mode

Click the eye icon next to the TODOs tab to enter immersive Focus Mode. The sidebar shows a single focus card: the source heading with a link icon, a checkbox beside the task, faded tag chiclets, and a friendly date.

- **Complete** finishes the task (or just check the box).
- **Skip** rotates the current item to the back of the queue.
- **Exit focus mode →** link at the bottom returns to the normal sidebar.

The header stays visible when focus mode is on, and the title reads "Focus." The eye icon turns amber to signal the active state; clicking it again exits focus mode without moving the mouse. The other tab buttons stay clickable; clicking one exits focus and switches straight to that tab, same as switching between any two tabs normally.

The queue is built from `#focus`-tagged TODOs first; if none exist, it falls back to your top-priority items. When the queue empties, you can choose **Continue with next priority task** to keep going.

Mode state persists across sessions by default; configure via the `focusQueueLimit` (1–5, default 1) and `focusModePersist` settings.

## Tabs

The sidebar's header has four buttons, plus a kebab (⋯) menu:

| Button              | Shows                                                                                  |
|----------------------|----------------------------------------------------------------------------------------|
| TODOs                | Active `#todo` items, grouped by header where applicable. Default tab.                |
| Focus (eye icon)     | Toggles [Focus mode](#focus-mode), an immersive single-item queue. Not a fourth tab: the other three stay clickable while it's active, and clicking one exits focus and switches in one click. |
| Ideas                | Active `#idea` / `#ideas` / `#ideation` items                                          |
| Projects             | Git repos tracked from a folder on disk, not vault notes. See [Projects](#projects).   |

Snoozed items (`#future` / `#snooze` / `#snoozed`) show up in TODOs and Ideas like any other tag; right-click a row to Snooze/Unsnooze it. The only place snoozed items are excluded is Focus Mode's queue.

Below the TODOs list (not Ideas), the **Summary** section shows priority breakdown, completion velocity (today / week / month), top backlogs, and a link to your TODONE log file.

The kebab menu, next to the four buttons, covers Refresh, Stats, About, and Settings from any tab; it adds Sync when you're on the Projects tab. See [Sidebar utilities](#sidebar-utilities).

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
- The header itself has no checkbox; completing a block used to cascade to all children, and it was too easy to do by accident.

**Completion is per-child.** Tick children as you finish them. When the last live child is done, the whole header block disappears from the active list automatically. There's no "mark the header done" step.

**Filtering keeps headers visible.** Click a tag like `#api` in the cloud and the header stays in view even if only its children carry the tag, so you see the matching work in its original context instead of stripped of its parent.

**Inline controls on the header row:**

- **Sort buttons** re-order children by priority tag (`#p0` → `#p4`).
- **Right-click → Move to…** (or the command palette) relocates the entire block, header plus all children, to another file in one move.

The same pattern works for `#idea` / `#ideas` headings, with children rendered the same way in the Ideas tab.

## Ideas and principles

Capture ideas separately from actionable TODOs:

| Tag                              | Purpose                                       |
|-----------------------------------|-----------------------------------------------|
| `#idea` / `#ideas` / `#ideation`  | Something to capture (not yet actionable)     |
| `#principle`                      | A guiding principle (reference only)          |

Click an idea's checkbox to dismiss it. Right-click to promote it to a TODO.

`#principle` items don't appear in the Ideas tab; they show up in the project-info popup for any project they're tagged with, and the Stats modal still counts them.

## Moving TODOs between files

Use **Move TODO to another file** (right-click or command palette) to relocate a TODO. The source line becomes `#moved @date`, and a fresh copy appears in the destination.

Moved lines are dimmed in both Reading mode and Live Preview, so they stay visible as an audit trail without cluttering your active view. You can also type `#moved` manually; the plugin auto-stamps the date.

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
|--------------|---------------------------------------|
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
|--------------------------|-----------------------------------------------|
| `@today` / `@date`      | Today's formatted date                        |
| `@tomorrow`             | Tomorrow's date                               |
| `@yesterday`            | Yesterday's date                              |
| `@me` / `@handle`       | Attribution mention (from team file)          |

Date keywords take priority over user handles. Unknown handles are auto-added to your team file.

## Commands and hotkeys

| Command                        | Default hotkey       | What it does                                            |
|---------------------------------|-----------------------|----------------------------------------------------------|
| Toggle TODO sidebar            | `Cmd/Ctrl+Shift+T`   | Show or hide the sidebar                                |
| Quick Add TODO                 | `Cmd/Ctrl+Shift+A`   | Insert a new `#todo` at cursor or append to current line |
| Refresh TODOs                  | —                    | Re-scan the vault and refresh the sidebar               |
| Move TODO to another file      | —                    | Open the file picker; relocates the line at cursor      |
| Copy as Slack Markdown         | `Cmd/Ctrl+Shift+C`   | Converts selected text to Slack's mrkdwn (headings to bold, adjusted emphasis) |
| Copy as Notion Markdown        | `Cmd/Ctrl+Shift+N`   | Strips Obsidian-specific syntax (wiki links, embeds, plugin tags) for clean Notion paste |
| Toggle Projects sidebar        | —                    | Switch to the Projects tab (named for an earlier version, when Projects was a separate panel) |
| Sync Projects                  | —                    | Re-scan every repo under the configured base folder and update their notes |

The ribbon icon toggles the sidebar. The kebab (⋯) button at the right of the tab row opens the menu for **Stats**, **Refresh**, **About**, and **Settings**; **Sync** joins that list while you're on the Projects tab.

## Sidebar utilities

- **Stats**: kebab menu → Stats opens a modal showing counts of active TODOs, focused items, snoozed items, ideas, and principles.
- **Clickable links**: wiki links (`[[page]]`) and external links in TODOs, ideas, and principles are clickable in the sidebar. Disable in Settings → "Make links clickable in lists."
- **Tab lock**: enable in Settings → "Show tab lock buttons." Adds a padlock icon to Obsidian's own document tab headers (not the plugin's sidebar tabs); locking one forces links you click from the sidebar to open in a new tab instead of replacing what's there.

## Projects

The Projects tab tracks work across a folder of git repos on disk, instead of vault notes. It's the third tab in the sidebar, alongside TODOs and Ideas, not a separate panel; earlier versions of the plugin gave it its own sidebar, which is why a couple of settings and commands still say "Projects sidebar."

Point it at a folder in Settings → Projects → "Projects base folder" (e.g. `/Users/you/projects`). It finds every git repo underneath (skipping `node_modules`, `dist`, `build`, `archive`, and anything else you add to "Projects exclude directories"), and for each one:

- Creates or updates a vault note with the repo's branch, git status, remote, and last-synced time in the frontmatter.
- Pulls in `#todo`/`#idea`/`#bug` items from the repo's `BUGS.md`, `TODO.md`, `TODOS.md`, `IDEAS.md`, or `ISSUES.md`, tagged explicitly or not (an untagged line in `BUGS.md` is assumed to be a bug, in `TODO.md` a todo, and so on).

Click a project in the list to open its note and see a detail view: repo facts pinned at the top, the README's opening paragraph underneath (if it has one), and every tracked item grouped by type. Completing an item there writes back to the actual file in the repo, not just the vault note; the same familiar focus/snooze/priority actions from the TODOs tab work here too (no "move," since moving a synced item elsewhere would just have it reappear in its original note on the next sync).

Opening any project's note anywhere in the vault (Quick Switcher, a wikilink, clicking through from a project block on the TODOs/Ideas tab) jumps the sidebar straight to that project's detail view, whatever tab it was showing before; Back returns you there. Turn this off in Settings → Projects → "Auto-open Projects sidebar" if you'd rather the sidebar stay put until you switch tabs yourself.

Each project's detail view has its own **⋯** overflow menu (separate from the sidebar header's kebab menu) for the less-frequent actions: copy the repo's local path or remote URL, open it in a terminal or editor app (set which ones under Settings → Projects → "Terminal app"/"Editor app"; macOS only), or resync its tracked items on demand without waiting for the background watcher.

Prose-style bug write-ups (a `### Title` under a `## Open`/`## Fixed` heading, rather than a flat checklist) complete the same way: the whole write-up moves to the first section that reads as "done" (creating one if the file doesn't have one yet), and moves back just as easily if you uncheck it. This refuses if the file has changes it hasn't committed yet; commit or stash first, so a mistake is always one `git checkout` away from undone.

Structured files stay in sync automatically (a background watcher picks up changes on disk), or trigger a sync manually with **Sync** in the kebab menu (while on the Projects tab) or the "Sync Projects" command. Requires the plugin's desktop build (`git` and filesystem access aren't available on mobile).

Frontmatter is hidden in the note's editor view for these project notes; the sidebar already shows the fields that matter, so the raw YAML would just be noise. Note content you write by hand (an `## Overview` section, your own notes) is never touched by syncing.

## Installation

**Requirements:** Obsidian 0.15.0 or later, desktop only. The Projects tab additionally needs `git` installed and available on your system PATH.

Warped Command isn't in Obsidian's Community Plugins directory yet, and prebuilt files aren't published as GitHub releases yet either. For now, install from source.

### Option 1: install script (recommended)

```bash
git clone git@github.com:robotpony/warped-command.git
cd warped-command
npm install
./install.sh
```

`install.sh` builds the plugin and walks you through picking which vault(s) to install into. On later runs, `./install.sh -p` reinstalls to the same vaults without prompting; `./install.sh -d 8` deep-searches for nested vaults.

### Option 2: manual build

```bash
npm install
npm run build      # produces main.js at the repo root
```

Copy `main.js`, `manifest.json`, and `styles.css` into `<vault>/.obsidian/plugins/warped-todo/` (create the folder if it doesn't exist; `warped-todo` is the plugin's internal id, unrelated to the repo or display name). Then in Obsidian, go to Settings → Community plugins and enable "Warped Command."

## Troubleshooting

**Sidebar won't open.**
Run "Toggle TODO sidebar" from the command palette, or use the ribbon icon. Default hotkey is `Cmd/Ctrl+Shift+T`.

**A `#todo` I wrote isn't showing up.**
Check that it's not inside a code block or wrapped in backticks; the scanner skips both so documentation about the tag syntax doesn't get picked up as a real TODO. Also confirm the file isn't in an excluded folder (Settings → excluded folders).

**Projects tab is empty.**
Three common causes: no base folder is set (Settings → Projects → "Projects base folder"), `git` isn't installed or isn't on your PATH, or none of the folders under the base path are git repos with a top-level `.git` directory (submodules are skipped on purpose).

**Projects sync isn't picking up a change I made to `BUGS.md` or `TODO.md`.**
The background watcher should catch it automatically. If it doesn't, run the "Sync Projects" command or use **Sync** in the Projects tab's kebab menu to force a rescan.

**A prose-style bug write-up won't move to "Fixed."**
The mover refuses to relocate a block if the file has uncommitted changes, so a mistake can't strand your work partway through a move. Commit or stash first, then try again.

**Projects, or the whole plugin, doesn't load on mobile.**
That's expected. Projects needs Node's `fs` and `child_process`, so the entire plugin is marked desktop only (`isDesktopOnly: true`).

**Still stuck?**
[Open an issue](https://github.com/robotpony/warped-command/issues) with your plugin version (`manifest.json`), Obsidian version, and steps to reproduce.

## Known limitations

- **Desktop only.** The whole plugin, not just Projects, is unavailable on Obsidian mobile.
- **Not on the Community Plugins list yet.** Install from source (above) rather than through Obsidian's plugin browser.
- **Projects tracks folders on disk, not other vaults.** It's for git repos alongside your vault, not for linking two Obsidian vaults together.
- **Git submodules are skipped** when scanning for project repos.

## Releases and changelog

Every change is logged in [CHANGELOG.md](CHANGELOG.md), organized by version with Added/Changed/Fixed sections. There's no packaged release yet; build from source (see [Installation](#installation)) to get the current version.

Found a bug or have a feature request? [Open an issue](https://github.com/robotpony/warped-command/issues).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT, see [LICENSE](LICENSE).
