# Changelog

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
