# Warped Command

A set of Obsidian plugins for writers who work in plain markdown. Tasks stay in your notes. Content stays in your files. Nothing moves until you say so.

Three plugins, one workflow:

| Plugin | Badge | Focus |
|--------|-------|-------|
| [Warped Todo](#warped-todo) | `␣⌘` | Capture, prioritize, and focus on tasks |
| [Warped Hugo](#warped-hugo) | `H⌘` | Browse and manage Hugo content |
| [Warped Reference](#warped-reference) | `g⌘` | Sync Google Drive docs into your vault |

---

## Warped Todo

**Tag tasks in your notes. Work through them one at a time.**

Most task tools pull you away from your writing. Warped Todo doesn't. You tag items where you write them, and a sidebar surfaces what needs doing. No separate app, no migration, no lock-in.

### The basics

Add `#todo` to any line:

```markdown
- [ ] Review the intake form #todo
- [ ] Update onboarding copy #todo #content
- [ ] Call Dana about the deadline #todo @me
```

Open the sidebar (`Cmd+Shift+T`). Your TODOs appear sorted by priority, grouped by project tag. Click a checkbox and the item becomes `#todone @2026-05-09`, logged to your TODONE file.

That's the whole loop. Everything else is optional.

### Focus mode

The problem with task lists: you see everything at once. Focus mode fixes that.

Click the eye icon in the sidebar. The list disappears. One task card takes its place:

```
Sprint planning prep
in: work/projects.md > Sprint 12

[ ] Write the agenda #todo #focus #sprint

#sprint    @bruce

    Done        Skip    Exit focus mode →
```

**Done** completes the task and advances the queue. **Skip** rotates it to the back. When your `#focus` items are finished, you can continue with the next highest priority or stop.

The header stays in place during focus mode. The eye icon turns amber, and clicking it again exits focus without moving the mouse. Other tab buttons are faded and inert until focus is off.

Your most important TODOs are shown first, based on tags like `#focus` (meaning I want to focus on this task), and priority (like, `#p0`). If no priority is set, it falls back to your top-priority TODOs so the card is always useful.

### Priority tags

| Tag | Meaning |
|-----|---------|
| `#focus` | In the focus queue; shown first in the sidebar |
| `#p0` – `#p4` | Priority tiers (`#p0` is highest) |
| `#future` / `#snooze` | Parked; lives in the Snoozed tab |

Items sort: `#focus` first, then by priority tier, then by tag count. Right-click any row to change priority, snooze, copy, or move.

### Project tags

Any tag that isn't a priority or lifecycle tag becomes a project tag. The sidebar builds a tag cloud from your active TODOs:

```markdown
- [ ] Write the brief #todo #q2-campaign
- [ ] Review brand assets #todo #q2-campaign
- [ ] Fix nav bug #todo #site
```

Click `#q2-campaign` in the cloud to filter. Click again to clear. The cloud only shows tags with active items.

### Ideas tab

Not everything is a task. Capture ideas without cluttering your TODO list:

```markdown
- [ ] What if we rewrote the onboarding flow? #idea #product
```

Ideas get their own tab. Right-click to promote one to a TODO when it's ready to act on.

### Slash commands

Type `/` at the start of a line:

| Command | Inserts |
|---------|---------|
| `/todo` | `- [ ] #todo ` |
| `/idea` | `- [ ] #idea ` |
| `/today` | Today's formatted date |
| `/callout` | Obsidian callout block |

### Delegation

Assign items with `@handle`:

```markdown
- [ ] Review the API spec #todo @eric
- [ ] Update the FAQ #todo @me
```

Handles are resolved from `team.md` at your vault root. The tag cloud shows assignee pills alongside project tags (`@me` first, then other active handles, then `@unassigned`). Click to filter; click again to clear. Unknown handles are auto-added to the team file.

### Copy for other tools

| Command | Hotkey | What it does |
|---------|--------|-------------|
| Copy as Slack Markdown | `Cmd+Shift+C` | Converts selected text to Slack mrkdwn |
| Copy as Notion Markdown | `Cmd+Shift+N` | Strips Obsidian syntax for clean Notion paste |

---

## Warped Hugo

**Browse and manage your Hugo site content without leaving Obsidian.**

If you write for a Hugo site, Warped Hugo gives you a sidebar view of all your content: posts, drafts, and pages grouped by folder, with publish status at a glance.

Open it with `Cmd+Shift+H`.

### What you see

The sidebar groups content by top-level folder (`posts/`, `notes/`, etc.). Each item shows title, date, and draft status. Click any item to open it in the editor.

Filter by:
- **Status**: All, Published only, or Drafts only
- **Tags**: Frontmatter tags from your content
- **Folder**: Subfolder paths become filterable tags (`posts/tech/tutorials/` → filter by `tech` or `tutorials`)

### Creating content

Click `+` in the sidebar header:

1. Pick a folder from your content hierarchy
2. Enter a title
3. A new file is created with Hugo frontmatter (`title`, `date`, `draft: true`, empty `tags`)

---

## Warped Reference

**Pull Google Drive docs into your vault. Give Claude Code access to both.**

Warped Reference has two parts:

1. **Obsidian plugin**: A Drive browser sidebar that syncs Docs (to markdown) and Sheets (to CSV) into your vault
2. **MCP server**: Lets Claude Code search your Drive and read vault files through one interface

### Syncing Drive content

Open the sidebar. Browse your Drive tree, check files or folders, click Sync. Docs become markdown with frontmatter; Sheets become CSV. Drive is the source of truth; synced files update when the Drive version changes.

```yaml
---
gdrive_id: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
gdrive_path: "Work/Projects/Project Brief.gdoc"
synced: "2026-05-09 14:22"
---

# Project Brief

The project aims to...
```

### Claude Code integration

The MCP server registers as `vault` in Claude Code. Once set up, Claude can:

- **Search** Drive by filename or vault by content
- **Read** any Drive file or vault note
- **Pull** a Drive doc into the vault in one step (search, download, convert, write)
- **Extract sections** from large docs by heading name or index

```bash
./setup.sh   # builds the MCP server and registers it with Claude Code
```

Verify with `/mcp` in Claude Code. `vault` should appear as connected.

### Prerequisites

- [rclone](https://rclone.org/) (`brew install rclone` on macOS)
- Node.js 18+
- Claude Code

---

## Installation

From the repo root:

```bash
./install.sh           # pick plugins and vaults interactively
./install.sh -a        # all plugins (still prompts for vaults)
./install.sh -a -p     # all plugins to previously selected vaults
```

The installer builds each plugin and copies `main.js`, `manifest.json`, and `styles.css` to `.obsidian/plugins/<plugin-name>/` in your selected vaults.

Vault selections are cached in `.install-vaults`. Use `./install.sh -p` to reuse them.

---

## License

MIT
