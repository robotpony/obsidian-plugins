# Changelog

## 0.5.6 — 2026-04-01

Fixes sync of files inside Drive folders (not just root files).

- Root cause: rclone `lsjson` returns `Path` relative to the listed folder, not the remote root. Files inside subfolders (e.g. `Alderson Family Recipes/recipe.docx`) were being catted with just the filename (`recipe.docx`), causing "directory not found".
- `loadChildren()` now prefixes each child's `Path` with the parent folder path, so sync uses the full remote path (e.g. `Alderson Family Recipes/recipe.docx`)
- `DriveProvider.cat()` also swaps the virtual extension to the target export format (`.docx` → `.html`) since rclone resolves exported files by target extension

---

## 0.5.5 — 2026-04-01

Fixes sync for Google Docs presented as .docx by rclone.

- Root cause: rclone reports Google Docs with Office MIME types (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`) and `.docx` extension, but Size -1. Previously only `application/vnd.google-apps.document` was detected.
- `getFormatMapping()` now detects Google Workspace files by Office MIME type + Size -1, mapping them to the correct export format (HTML→MD for docs, CSV for sheets, TXT→MD for slides)
- Real uploaded .docx/.xlsx files (Size > 0) are still treated as native files
- 3 new tests for Office MIME detection

---

## 0.5.4 — 2026-04-01

Sync diagnostics now visible in the sidebar log pane.

- Per-file sync progress streams live to the sidebar log (MIME type, export format, success/failure)
- Error details include the full error message, not just the file path
- Console logs full file metadata JSON on failure for debugging
- `rclone cat` args logged to console so the exact command is visible

---

## 0.5.3 — 2026-04-01

Fixes Google Doc sync failure and improves sync diagnostics.

- Fixed "directory not found" when syncing Google Docs presented as `.docx`/`.xlsx`/`.pptx` — rclone cat now strips any virtual extension for Workspace exports, not just `.gdoc`
- Added diagnostic logging: file MIME type, export format, and rclone command logged to console during sync
- Sync log pane now has a dark background for better visual separation from the file tree

---

## 0.5.2 — 2026-04-01

Sync folder creation, Finder reveal, and sidebar sync log.

- Vault sync folder is now created automatically if it doesn't exist (recursive folder creation)
- "Show in Finder" button on the vault sync root setting reveals the sync folder in macOS Finder
- Collapsible sync log pane at the bottom of the Drive sidebar shows sync activity and errors
- Log pane auto-expands during sync, shows timestamps, and supports clear/collapse

---

## 0.5.1 — 2026-04-01

Fixes sync failures and improves settings UX.

- Debounced rclone remote name setting — no longer fires a connectivity check per keystroke
- Fixed "directory not found" when syncing Google Docs: virtual extensions (`.gdoc`, `.gsheet`, `.gslides`, `.gform`) are now stripped before calling `rclone cat`
- Filenames are sanitized for vault compatibility — `< > : " | ? * \` replaced with underscores, leading dots handled
- 10 new unit tests for filename sanitization

---

## 0.5.0 — 2026-04-01

Adds file sync from Drive sidebar to vault.

- Checkbox on each file row selects files for sync
- Sync button (↻) downloads selected files to the configured vault root
- Google Docs export as Markdown (HTML → turndown), Sheets as CSV, Slides as Markdown (plain text)
- YAML frontmatter (`gdrive_id`, `gdrive_path`, `synced`) added to synced `.md` files
- Synced files show ✓ badge in the sidebar
- Skip-if-unchanged: files with same Drive ModTime are not re-downloaded
- "Resync all" kebab menu item re-syncs all previously synced files
- `g-command: Sync Drive files` command palette entry (runs resync-all)
- New `SyncManager` module with 23 unit tests for format mapping, path conversion, frontmatter, and content conversion
- Virtual extensions (`.gdoc`, `.gsheet`, `.gslides`, `.gform`) stripped during sync

---

## 0.4.0 — 2026-04-01

Adds file search to the Drive sidebar.

- Search bar between header and status line filters the loaded tree by filename (case-insensitive, instant)
- "Search all of Drive" button triggers a recursive fetch via `rclone lsjson --recursive` for results beyond expanded folders
- Recursive results are cached until the next refresh or clear
- Clear button (✕) resets search and cache
- `filterTree()` and `flattenToNodes()` extracted as testable pure functions with 10 new unit tests
- Fixed DriveProvider tests broken by rclonePath guard (added `setPath` to test setup)

---

## 0.3.4 — 2026-04-01

Updated sidebar status line to clarify read-only access and export formats.

---

## 0.3.3 — 2026-04-01

Adds optional rclone path setting for non-standard installs.

- New "rclone path" setting: absolute path to the rclone binary
- When empty (default), auto-detection probes Homebrew and common locations
- When set, skips auto-detection and uses the configured path directly
- Changes take effect immediately (reloads sidebar on save)

---

## 0.3.2 — 2026-04-01

Fixes rclone not found in Obsidian (Electron PATH issue).

- Obsidian's Electron shell doesn't inherit the user's shell PATH, so Homebrew binaries like rclone are invisible via bare name
- DriveProvider now probes `/opt/homebrew/bin/rclone`, `/usr/local/bin/rclone`, `/usr/bin/rclone`, and bare `rclone` on each `check()` call
- Resolved path is cached and used for all subsequent `execFile` calls
- Console logs which path was found (or lists all paths tried on failure)
- Re-resolves on each check so mid-session installs are picked up

---

## 0.3.1 — 2026-04-01

Adds console diagnostics for rclone auth and connectivity failures.

- `[G Command]` prefixed logging to Obsidian dev console (matches repo convention)
- `checkBinary()` logs rclone version on success, full error on failure
- `checkRemote()` captures rclone stderr and includes it in both the console log and the error banner detail text — previously the banner only said "not reachable" with no reason
- `run()` logs stderr on any rclone subprocess failure
- `loadRoot()` and `loadChildren()` log caught errors before displaying them

---

## 0.3.0 — 2026-04-01

Fixes sidebar reconnection — refresh and reinstall now retry rclone connectivity.

- Sidebar refresh (kebab menu → Refresh) now re-checks rclone and reloads Drive root instead of re-rendering cached error state
- Changing the rclone remote name in settings immediately updates the provider and reloads the sidebar
- Added `reload()` to shared `RefreshableView` interface for sidebars that need data-level refresh
- Added `setRemote()` to `DriveProvider` so settings changes propagate without plugin restart

---

## 0.2.3 — 2026-04-01

Richer error banner when rclone is missing or Drive is unreachable.

- Error shows setup commands in a copyable code block instead of separate lines
- "Copy" button appears on hover to copy commands to clipboard
- "Setup instructions →" link opens the plugin's README directly in Obsidian
- Binary-missing error now reads "Install and authenticate with rclone:"
- DriveProvider errors are now typed (`DriveError` with `code` field) for structured rendering

---

## 0.2.2 — 2026-04-01

Clearer error messages when rclone is missing or Drive is unreachable.

- Error title is now "Authenticate with Google Drive" for both failure modes
- Detail lines explain the specific issue (binary missing vs. remote unreachable)
- References the g-command README for setup instructions

---

## 0.2.1 — 2026-04-01

Fixes three sidebar bugs from initial Step 3 implementation.

**Fixes:**
- Error banner now shows readable text instead of a solid red rectangle. Uses left-border accent with muted background, matching Obsidian's callout style
- Sidebar header now matches sibling plugins: `GC` logo badge, `<h4>` title, kebab menu with Refresh and Settings
- Plugin name corrected from "g-command" to "G Command" in manifest

---

## 0.2.0 — 2026-04-01

Drive browser sidebar — Phase 2, Step 3.

Adds a collapsible file tree sidebar that browses Google Drive via the existing DriveProvider. Folders lazy-load children on expand. The sidebar opens automatically on plugin load and is accessible via command palette and ribbon icon.

**New files:**
- `src/GDriveSidebar.ts` — `ItemView` subclass with lazy-loading tree, error banner, loading states
- `src/GDriveSidebar.test.ts` — 12 unit tests for tree node creation and sort logic

**Changes:**
- `main.ts` — registers sidebar view, adds SidebarManager, ribbon icon, and "Open Drive browser" command
- `styles.css` — tree row styles, expand/collapse arrows, loading spinner, empty/loading states

**Notes:**
- Sync button is present but disabled (wired in Step 5)
- No checkbox selection yet (Step 4)
- Folders sort before files; both sorted alphabetically

---

## 0.1.0 — 2026-03-31

Obsidian plugin scaffold — Phase 2, Steps 1–2.

Adds the g-command Obsidian plugin alongside the existing MCP server. Plugin loads in Obsidian, exposes a settings tab (rclone remote name, vault sync root), and provides a fully-tested `DriveProvider` class for all Drive I/O via rclone subprocesses.

**New files:**
- `main.ts` — Plugin entry point and settings tab
- `manifest.json`, `package.json`, `esbuild.config.mjs`, `tsconfig.json` — standard Obsidian build scaffold
- `styles.css` — sidebar container and status styles
- `src/types.ts` — `DriveFile`, `SyncRecord`, `GCommandSettings` interfaces
- `src/DriveProvider.ts` — rclone wrapper: `list()`, `listRecursive()`, `cat()`, `check()`
- `src/DriveProvider.test.ts` — 19 unit tests; all passing

**Notes:**
- `isDesktopOnly: true` — uses `child_process` (rclone), unavailable on mobile
- esbuild dev-server moderate vuln is a known issue shared across all plugins in this repo (dev-only dep, dev server not used)

---

## 1.0.0 — 2026-03-31

Initial release.

Replaced the original GCP OAuth approach (googleapis + @google-cloud/local-auth) with rclone as the auth and transport layer. No GCP project or OAuth consent screen required; users authenticate once via `rclone config`.

**Changes:**
- Rewrote `src/gdrive/index.ts` to use `child_process.execFile` rclone calls
- Removed `googleapis` and `@google-cloud/local-auth` dependencies
- Fixed `tsconfig.json` — made standalone (removed broken extends reference)
- Updated `package.json`: new name (`g-command-gdrive`), version `1.0.0`
- Added `setup.sh` — handles rclone install, Drive auth, build, and Claude Code registration
- Updated `README.md` and `ARCHITECTURE.md` to document rclone setup
- Upgraded `@modelcontextprotocol/sdk` 1.0.1 → 1.29.0 (fixes ReDoS + DNS rebinding vulns)
- Pinned all dependencies to exact versions; `npm audit` clean
- Added `g-command/src/gdrive/dist/` to root `.gitignore`
- Verified: server connects, Drive root lists 18 items, registered in Claude Code

**Limitations vs. original:**
- Filename search only (no full-text content search)
- Google Docs export as plain text, not markdown
