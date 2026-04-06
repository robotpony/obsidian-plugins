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

---

## Phase 4: Vault MCP — unified knowledge server (planned)

Rename the MCP server from `gdrive` to `vault`. Expand it into an Obsidian knowledge server that exposes vault files and Drive docs through one interface, with shared conversion code.

See ARCHITECTURE.md "Phase 4: Vault MCP" for full design, gap analysis, and data flow.

### Phase 4a: Extract shared conversion module ✅

- [x] Step 1: Create `src/convert/` with `index.ts`, `format.ts`, `turndown.ts`, `types.ts`
- [x] Step 2: Move conversion functions from `SyncManager.ts` into `src/convert/`
- [x] Step 3: Update `SyncManager.ts` to import from `./convert` — verify all existing tests pass
- [x] Step 4: Add turndown + turndown-plugin-gfm to MCP server's `package.json`
- [x] Step 5: Update MCP server's `tsconfig.json` to include `../convert/`
- [x] Step 6: Heading hierarchy preservation verified — standard turndown ATX conversion handles Google Docs `<h1>`–`<h6>` correctly; nested list depth via `lst-kix` classes preserved in shared turndown rule
- [x] Step 7: Implement `extractSections()` in `src/convert/` — heading name + numeric index selectors, `not_found` reporting, `available_headings` index
- [x] Step 8: Tests for `extractSections()` — 14 tests covering multi-heading select, mixed name/index, case-insensitive match, preamble as index 0, sub-section inclusion, no-match fallback, edge cases

### 4b: Vault provider — read vault files via MCP

- [ ] Step 6: Add `vault-discovery.ts` — read `obsidian.json`, resolve vault paths, derive names
- [ ] Step 7: Add `vault-provider.ts` — list files, read with frontmatter parsing, content search
- [ ] Step 8: Add `list-vaults` tool
- [ ] Step 9: Add `vault://` resources (ListResources + ReadResource with parsed frontmatter)
- [ ] Step 10: Add vault scope to `search` tool (filename + content match)

### 4c: Pull — Drive to vault pipeline

- [ ] Step 11: Add `pull` tool — search Drive, download HTML, convert, write to vault, update syncState. Supports optional `sections` filter for partial document retrieval.
- [ ] Step 12: Add download logic to MCP server (port `copy --include` pattern from `DriveProvider`)
- [ ] Step 13: Create `/gdoc-pull` Claude Code skill (`~/.claude/commands/gdoc-pull.md`)

### 4d: Rename and register

- [ ] Step 14: Rename MCP server from `gdrive` to `vault` (package.json, server name, docs)
- [ ] Step 15: Update Claude Code MCP registration
- [ ] Step 16: End-to-end test: `/gdoc-pull "Q2 Brief"` → vault file + sidebar sync

### Resolved questions

- **Vault content search**: Fuzzy search (fuse.js or similar). Substring is too rigid for natural-language queries against note titles and content.
- **`pull` target path**: Mirror Drive/vault structure under `vaultRoot`. No user-specified overrides.
- **Platform support**: macOS first, then Linux/Windows. Ship macOS, add cross-platform vault discovery as a fast follow if complexity is low.

---

## Phase 5: One-click rclone setup (planned)

Replace the 10-step `rclone config` wizard with a single "Connect" button. Uses rclone's non-interactive `config create` with preset answers — the only user action is clicking "Allow" in Google's OAuth consent screen.

### Discovery

`rclone config create` supports `--non-interactive` mode and preset key-value pairs. This collapses the wizard to:

```bash
rclone config create gdrive drive scope=drive.readonly config_is_local=true config_change_team_drive=false
```

This opens a browser for Google OAuth, creates the remote, and exits. No wizard questions.

### Steps

- [ ] Step 1: Add `setupRemote()` to `DriveProvider` — runs the one-liner via `execFile`, returns success/error
- [ ] Step 2: Add "Connect Google Drive" button to settings tab — runs `setupRemote()`, shows spinner, reports result
- [ ] Step 3: Update sidebar error banner — replace "rclone config" instructions with a "Connect" button that calls the same `setupRemote()`
- [ ] Step 4: Add connection status indicator to settings — show "Connected" with checkmark, or "Not connected" with Connect button
- [ ] Step 5: Improve rclone-missing guidance — link to rclone.org/install with platform-specific instructions (Homebrew for macOS, package manager for Linux)

### UX flow

**Settings tab (happy path):**
1. User opens g-command settings
2. Sees "Google Drive: Not connected" with a [Connect] button
3. Clicks Connect → browser opens Google login
4. User clicks Allow → browser shows success page
5. Settings update to "Google Drive: Connected ✓"

**Sidebar error banner (discovery path):**
1. User opens sidebar, sees error: "Not connected to Google Drive"
2. Banner shows [Connect] button (instead of terminal commands)
3. Same flow as above

**rclone not installed:**
1. Settings/banner shows: "rclone is required" with install instructions
2. Links to rclone.org/install, mentions `brew install rclone` for macOS
3. After installing, user clicks Connect

### Design decisions

- **Read-only scope by default.** `scope=drive.readonly` is safer and sufficient for browsing and syncing. Users who need write access can reconfigure manually.
- **No auto-install of rclone.** Installing system binaries from an Obsidian plugin is unexpected. Clear instructions are better.
- **Reuse existing `DriveProvider`.** The setup logic lives alongside `check()` since it operates on the same rclone binary and remote.

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
