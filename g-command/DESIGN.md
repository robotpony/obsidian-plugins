# Design: g-command Obsidian Plugin

## Overview

g-command adds a Google Drive browser to Obsidian's sidebar. Users browse their Drive, check files and folders to track, and press Sync to pull them into the vault as markdown, CSV, or native formats.

---

## Sidebar

The primary interface. Registered as an Obsidian `ItemView` in the right or left sidebar.

```
┌─ Google Drive ─────────────────── [↻ Sync] ─┐
│ Synced 3 files · 2 min ago                   │
├──────────────────────────────────────────────┤
│ ▼ ☑  My Drive                               │
│   ▶ □  Archive                              │
│   ▼ ☑  Work                                 │
│     ▶ ⊟  Projects                           │
│       □  Project A                          │
│       ☑  Project Brief.gdoc     ✓ synced    │
│     □  Meeting Notes.gdoc                   │
│   ☑  Reading List.gdoc          ✓ synced    │
│   □  2025 Budget.gsheet                     │
└──────────────────────────────────────────────┘
```

### Tree behaviour

- **Expand/collapse** — click the ▶/▼ arrow to load and show children. Children are loaded lazily (one rclone call per expand).
- **Checkbox states** — three states, following standard tree select patterns:
  - ☑ Selected — this item and all children will be synced
  - □ Unselected — not synced
  - ⊟ Partial — some (not all) children are selected; clicking toggles to ☑
- **Folder selection** — checking a folder syncs everything inside it, including files added later.
- **Sync status badge** — files that have been synced show a small ✓ and the relative time.

### Sync button

- Located top-right of the sidebar header
- Clicking starts a sync of all checked items
- During sync: button becomes a spinner, status line shows "Syncing…"
- After sync: status line updates to "Synced N files · just now" or "Up to date · just now"
- Errors appear as Obsidian notices (red) with the failing file path

### Loading states

- First open: show "Loading…" while the root is fetched
- Folder expand: show a spinner row while children load
- rclone not found: show an error banner with a link to setup instructions

---

## Settings

Accessible via Obsidian Settings → g-command.

```
┌─ g-command ──────────────────────────────────────────────────┐
│                                                               │
│  rclone remote                                                │
│  ┌────────────────────────────┐                               │
│  │ gdrive                     │                               │
│  └────────────────────────────┘                               │
│  Name of the rclone remote to use. Must match the name        │
│  created during setup (default: gdrive).                      │
│                                                               │
│  Vault sync root                                              │
│  ┌────────────────────────────┐                               │
│  │ gdrive                     │                               │
│  └────────────────────────────┘                               │
│  Folder in this vault where synced files will be written.     │
│  Drive structure is mirrored under this folder.               │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

Selected paths are not shown in settings — they are managed entirely through the sidebar checkboxes and persisted automatically.

---

## Format conversion

| Drive file type | rclone export format | Vault file extension | Notes |
|----------------|---------------------|---------------------|-------|
| Google Doc | HTML | `.md` | HTML → markdown via turndown; frontmatter added |
| Google Sheet | CSV | `.csv` | Passthrough; no frontmatter |
| Google Slides | plain text | `.md` | Formatting not preserved; frontmatter added |
| Google Form | plain text | `.md` | Frontmatter added |
| PDF | native | `.pdf` | Binary passthrough |
| Image (PNG, JPG…) | native | original ext | Binary passthrough |
| Text / code | native | original ext | Passthrough |
| Other binary | native | original ext | Passthrough |

### File naming

Drive files have names like `Project Brief.gdoc`. The `.gdoc`, `.gsheet`, `.gslides` extensions are rclone's internal notation — they are stripped in the vault. `Project Brief.gdoc` → `Project Brief.md`.

Path mapping example:

```
Drive:  Work/Projects/Project Brief.gdoc
Vault:  gdrive/Work/Projects/Project Brief.md
```

Intermediate folders are created if they don't exist.

---

## Frontmatter

Added to all text files (`.md`) at sync time. Placed before the document content.

```yaml
---
gdrive_id: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
gdrive_path: "Work/Projects/Project Brief.gdoc"
google_document: "https://docs.google.com/document/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
synced: "2026-04-02 14:22"
---
```

On subsequent syncs, the frontmatter block is replaced in-place. Document content below it is overwritten.

The `gdrive_id` and `gdrive_path` fields enable future features (e.g. resolving `.gdoc` stub files from the local Drive mount). The `google_document` URL lets readers click through to the source on Google Drive. All three fields are controlled by the "Include Drive metadata in frontmatter" setting.

---

## Sync logic

```
Sync triggered
  for each selected path (file or folder):
    fetch Drive metadata (ModTime, ID, MimeType) via rclone lsjson
    if folder:
      recurse — fetch all children
    for each file:
      look up stored ModTime in plugin settings
      if Drive ModTime > stored ModTime (or no record):
        download via rclone cat
        convert to target format
        write to vault (creating folders as needed)
        update stored ModTime
      else:
        skip
  show result notice: "Synced N files, N up to date"
```

**What "skip if unchanged" means:** the Drive file's last-modified timestamp is stored after each sync. On the next sync, if Drive reports the same timestamp, the file is not downloaded or overwritten. Local edits to the vault copy are silently overwritten if the Drive file changes — this is a read-only sync tool, not a two-way sync.

---

## Commands

Available via Obsidian's command palette (Cmd+P):

| Command | Action |
|---------|--------|
| `g-command: Open Drive browser` | Open / reveal the sidebar |
| `g-command: Sync Drive files` | Run sync (same as sidebar button) |

---

## Error states

| Condition | User-facing message |
|-----------|-------------------|
| rclone not in PATH | Banner in sidebar: "rclone not found — run setup.sh" |
| Remote not configured | Banner: "Drive remote 'gdrive' not found — run rclone config" |
| File download failed | Obsidian notice: "Sync failed: Work/Brief.gdoc — [error]" |
| Vault write failed | Obsidian notice: "Could not write gdrive/Work/Brief.md — [error]" |
| Partial sync failure | Notice lists failed files; successful files are still written |
