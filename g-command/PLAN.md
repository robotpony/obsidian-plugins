# G Command — Plan

## Completed

### Phase 1: MCP server for Claude Code

Replaced the archived `googleapis`-based MCP server with rclone subprocess calls. Claude Code can search and read Drive files via the `gdrive` MCP server. No GCP project required; rclone handles OAuth.

### Phase 2: Obsidian plugin — Drive browser and sync

Full sidebar Drive browser with file tree, checkbox selection, and sync pipeline. Google Docs convert to markdown via turndown, Sheets to CSV. Mirrors Drive folder structure under a configurable vault root.

What shipped:
- DriveProvider wrapping rclone (list, listRecursive, cat, check)
- GDriveSidebar with lazy-loading folder tree and tri-state checkboxes
- SyncManager with skip-if-unchanged (ModTime comparison), per-file progress
- HTML-to-markdown converter with GFM tables, nested list indentation
- Frontmatter injection (gdrive_id, gdrive_url, gdrive_path, synced timestamp)
- File search with recursive Drive fetch
- Synced files pane with per-file resync
- Folder recursive sync, collapsible sync log
- Configurable rclone binary path
- Command palette commands (Sync, Open Drive browser)

### Phase 3: Drive tree caching

Instant sidebar render from cached tree data, with background refresh. Cache stores flat per-folder listings in plugin settings. Pre-fetches parent folders of synced files so they appear in context without manual expansion.

### Phase 4: Vault MCP — unified knowledge server

Renamed the MCP server from `gdrive` to `vault`. Expanded it into an Obsidian knowledge server that exposes vault files and Drive docs through one interface, with shared conversion code.

What shipped:
- Shared conversion module (`src/convert/`): turndown, frontmatter, format mapping, section extraction
- Vault provider: vault discovery, file listing, frontmatter parsing, fuzzy search (fuse.js)
- Pull pipeline: search Drive → download → convert → write vault → update syncState
- `vault://` resource scheme with section filtering
- Cross-source search (drive/vault/both scopes)
- `/gdoc-pull` Claude Code skill
- Renamed and re-registered as `vault`

### Phase 5: One-click rclone setup

Replaced the 10-step `rclone config` wizard with a single "Connect" button. Uses rclone's non-interactive `config create` with preset answers — the only user action is clicking "Allow" in Google's OAuth consent screen.

What shipped:
- `setupRemote()` on DriveProvider — runs `rclone config create` with read-only scope, 120s timeout, returns typed result
- Connection status section at top of settings tab (checking/connected/idle/connecting/error/binary-missing states)
- Sidebar error banner: Connect button for remote setup, platform-specific install instructions for binary-missing
- `getRcloneInstallInstructions()` helper — platform-aware install commands (macOS/Linux/Windows)
- 8 new tests for setupRemote (156 total)

---

## Phase 6: Read-only synced files (planned)

Mark synced Drive files as read-only in Obsidian's editor. These files are overwritten on every sync (Drive is source of truth), so editing them locally is misleading.

### Approach

Register a CodeMirror 6 extension via the plugin that checks whether the open file is in `syncState`. If yes, set `EditorState.readOnly` and `EditorView.editable` to disable editing, and show a banner at the top of the editor.

### Banner

> For reference only (read only). To edit, [visit this document](google_document_url).

The link comes from the `google_document` frontmatter field already written during sync. If the field is missing (non-Google-Workspace file, or frontmatter fields disabled), the banner omits the link.

### Steps

- [ ] Step 1: Register a CodeMirror extension that sets `readOnly` and `editable` to false when the file's path matches a `syncState` entry
- [ ] Step 2: Add a banner widget (CodeMirror `Decoration.widget`) at the top of the editor with the reference-only message and Drive link
- [ ] Step 3: Parse `google_document` URL from the file's frontmatter cache for the banner link
- [ ] Step 4: Tests — verify read-only activates for synced files, does not activate for non-synced files, banner renders with and without Drive link

---

## Future candidates

- **`.gdoc` resolver** — Read local Drive mount stubs, extract `resource_id`, sync that specific file without browsing
- **Sheets table preview** — Render synced CSV as a table in an Obsidian leaf
- **Open in browser** — Right-click synced file, open source Doc in browser using `gdrive_url` frontmatter
