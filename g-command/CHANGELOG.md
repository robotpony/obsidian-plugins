# Changelog

## 1.6.0 — 2026-04-02

Drive tree caching — sidebar renders instantly from cache, refreshes in background (Phase 3).

**Problem**: The sidebar called `rclone lsjson` on every open and folder expand, causing 2-5 second delays on slow connections.

**Solution**: Cache folder listings in plugin settings. On sidebar open, render the cached tree immediately, then fetch fresh data in the background and update if changed.

- New `DriveTreeCache` type storing per-folder listings keyed by Drive path
- Cache-first `onOpen()`: if cache exists, build and render tree instantly, then background refresh
- `loadChildren()` uses cached subfolder listings immediately, fetches fresh in background
- Background refresh: fetches root listing, compares with cache, re-renders only if changed
- Pre-fetches parent folders of all synced files so their paths are visible without manual expansion
- Kebab menu "Refresh" clears cache and fetches fresh
- After sync, parent folders of synced files are refreshed in cache
- New exported `buildTreeFromCache()` and `syncedParentPaths()` pure functions
- 8 new tests for cache hydration and synced-parent extraction
- 109 tests total, all passing

---

## 1.5.0 — 2026-04-02

Add `google_document` URL to synced file frontmatter.

- Synced Google Docs, Sheets, and Slides now include a `google_document` field in YAML frontmatter with the full web URL (e.g. `https://docs.google.com/document/d/{id}`)
- Allows readers to click through to the source document on Google Drive for viewing or editing
- URL is constructed from the file ID and MIME type: Docs, Sheets, and Slides each get their correct web-app URL
- Controlled by the existing "Include Drive metadata in frontmatter" setting
- New `driveEditUrl()` helper with 7 tests
- 101 tests total, all passing

---

## 1.4.0 — 2026-04-02

Fix sync failure for filenames containing square brackets.

- Root cause: rclone's `--include` filter treats `[` and `]` as glob character-class delimiters. A file named `Report [CONFIDENTIAL].docx` would match single characters instead of the literal brackets, producing zero results.
- Fix: escape glob special characters (`[ ] * ? { }`) in the include filter before passing to rclone
- 1 new test for bracket escaping
- 95 tests total, all passing

---

## 1.3.0 — 2026-04-02

Sync log clear button always visible.

- The ✕ clear button on the Sync log header is now always visible (was hidden until hover)
- Clearing the log also resets the status indicator to idle (grey)

---

## 1.2.0 — 2026-04-02

Sync button and status indicator UX improvements.

- Sync button uses default icon colour instead of accent green when files are selected
- Sync status moved to a tri-state circle on the Sync log header line: grey (idle), green (syncing), red (error)
- Green and red states pulse to draw attention without dominating the UI
- Sync button still disables during sync and swaps to hourglass icon

---

## 1.1.0 — 2026-04-02

Sidebar typography and section headers aligned with Space Command.

- Section headers ("Synced files", "Drive") now use 14px/600 weight with bottom border, matching space-command's `todo-section-header` pattern
- Added "Drive" section header above the file tree
- Tree rows and synced rows use 13px font (was `var(--font-ui-small)` ~12px), matching space-command item sizing
- Row padding and gap increased slightly for consistent spacing

---

## 1.0.0 — 2026-04-02

Synced files pane, folder sync, and sidebar improvements.

**Synced files pane** — Fixed section above the file tree showing all previously synced files. Each row shows the vault filename and a resync button (↻) that appears on hover to re-download that single file.

**Folder recursive sync** — Folders now have checkboxes in the file tree. Checking a folder and syncing downloads all files inside it recursively via `rclone lsjson --recursive`.

**Sync log collapsed by default** — The log pane no longer auto-expands during sync. Open it manually if needed.

**Schema: mimeType stored in sync state** — `SyncRecord` now persists the file's MIME type so resync correctly exports Google Docs as HTML (previously stubs had empty MimeType, falling through to native-file handling).

- 94 tests, all passing

---

## 0.9.0 — 2026-04-02

Preserve nested list structure from Google Docs in converted markdown.

- Google Docs HTML exports encode list nesting via CSS classes (`li-bullet-0`, `li-bullet-1`, …) instead of nested `<ol>`/`<ul>` elements. Turndown treated them all as top-level, flattening sub-lists.
- Custom turndown rule reads `li-bullet-N` class to determine depth and applies `4 × N` spaces of markdown indentation
- Ordered list numbering respects the `start` attribute on each `<ol>` element
- Works for both ordered and unordered Google Docs lists
- Non-Google-Docs HTML (no `li-bullet` classes) is unaffected — depth defaults to 0
- 3 new tests for nested list indentation (ordered, unordered, standard HTML)
- 94 tests total, all passing

---

## 0.8.0 — 2026-04-02

Configurable frontmatter and human-readable sync dates.

- New setting: "Include Drive metadata in frontmatter" (toggle, default on). When off, `gdrive_id` and `gdrive_path` are omitted from synced markdown files. The `synced` timestamp is always included.
- Sync date now uses `YYYY-MM-DD HH:mm` local time instead of ISO 8601 (`2026-04-02T10:51:04.123Z` → `2026-04-02 10:51`)
- 3 new tests: frontmatter without gdrive fields, date format validation, convertContent with gdrive fields disabled
- 91 tests total, all passing

---

## 0.7.2 — 2026-04-02

Strip Google Docs CSS and metadata from HTML before markdown conversion.

- Google Docs HTML export includes `<style>` blocks with CSS (`@import`, counter-reset rules, font declarations) that turndown passed through as raw text into the markdown output
- Turndown now strips `<style>`, `<script>`, `<meta>`, and `<link>` elements before conversion
- 2 new tests for CSS/metadata stripping
- 88 tests total, all passing

---

## 0.7.1 — 2026-04-02

Adds diagnostic logging to trace markdown conversion failures.

- Console now logs: rclone tmpDir file list, raw content preview (first 200 chars), converted content preview, and file size at each pipeline stage
- Download errors now include the include filter and export format in the message
- Conversion errors are caught separately with raw content dump (first 500 chars) for debugging
- Sync detail log includes `size` and `convert` strategy alongside existing MIME/export info

**How to use**: Open Obsidian dev console (Cmd+Opt+I), filter for `[G Command]`, trigger a sync. The logs show:
1. `Sync:` — file metadata, MIME type, Size, export format, convert strategy
2. `download args:` — exact rclone command
3. `download tmpDir contents:` — what rclone produced (filename tells you if export worked)
4. `download result:` — file size and first 200 chars (HTML tags = good, binary = export didn't work)
5. `Raw content:` — confirms what enters the converter
6. `Converted content:` — confirms what comes out
7. If conversion throws: `Conversion failed` with raw content dump

---

## 0.7.0 — 2026-04-01

Synced Google Workspace files now save with correct vault extensions (.md, .csv).

- Root cause: `toVaultPath()` relied on `stripVirtualExt()` to remove rclone's virtual extensions (.gdoc, .gsheet), but rclone presents Google Docs with Office extensions (.docx, .xlsx, .pptx). Since `.docx` isn't a virtual extension, the original filename was kept as-is.
- Fix: `toVaultPath()` now checks `mapping.exportFormat` first. When a file is a Google Workspace export (any MIME type), the current extension is always stripped and replaced with the target extension (.md for Docs, .csv for Sheets).
- 3 new tests for Office MIME vault path mapping (.docx→.md, .xlsx→.csv, real .docx kept)
- 86 tests total, all passing

---

## 0.6.3 — 2026-04-01

Fixes Google Workspace file download — rclone can't address virtual files by path.

- Root cause: rclone's `cat`, `copy`, and `copyto` all fail with "directory not found" when given the full path to a Google Workspace virtual file (Size -1). These files can only be downloaded via directory listing.
- Fix: `download()` now uses `rclone copy --include <filename>` from the parent directory. rclone lists the parent, finds the matching file, and copies it to a temp dir.
- For Google Workspace exports, the `--include` filter uses the **target** extension (e.g. `.html` not `.docx`) since `--drive-export-formats` changes the virtual filename.
- Verified working: Google Doc exported as 1.6 MB HTML, converted to Markdown via Turndown.
- 12 tests for `download()` covering: include filter construction, extension swap, parent dir extraction, root-level files, cleanup on success/failure, empty output.
- 83 tests total, all passing.

---

## 0.6.2 — 2026-04-01

(Superseded by 0.6.3 — `copyto` also fails for virtual files.)

---

## 0.6.1 — 2026-04-01

Adds "Clear sync cache" to the kebab menu.

- Previous failed sync attempts left stale `syncState` entries, causing files to show "unchanged" on resync even though they never downloaded successfully
- Kebab menu → "Clear sync cache" resets all sync state so every file re-downloads on next sync
- Only visible when sync state has entries (same as "Resync all")

---

## 0.6.0 — 2026-04-01

Fixes Google Workspace file export by replacing `rclone cat` with `rclone copy`.

Two root causes behind the persistent "directory not found" failures:

1. **Relative paths**: rclone `lsjson` returns `Path` relative to the listed folder, not the remote root. Files inside subfolders were synced with just the filename. `loadChildren()` now prefixes each child's `Path` with the parent folder path.

2. **Extension manipulation**: `rclone cat` with `--drive-export-formats` required matching the filename extension to the target format, which varied by remote configuration. Replaced with `rclone copy` to a temp directory — uses the original listed path with no extension manipulation. rclone handles export naming internally.

- New `DriveProvider.download()` method: copies file to temp dir via `rclone copy`, reads result, cleans up
- Removed `DriveProvider.cat()` and all extension-stripping logic
- 10 new/updated tests for `download()` (temp dir creation, cleanup on success/failure, empty output)
- 81 tests total, all passing

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
