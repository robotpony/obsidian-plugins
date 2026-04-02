# Plan

## Phase 1: MCP server for Claude Code — Complete ✓

All steps done. Claude Code can search and read Drive files via the `gdrive` MCP server.

### Status

- [x] Step 1: Fork and extract the server
- [x] Step 2: Switch auth approach — rclone replaces GCP OAuth
- [x] Step 3: Install rclone and configure the Drive remote
- [x] Step 4: Rewrite `index.ts` to use rclone subprocesses
- [x] Step 5: Build
- [x] Step 6: Verify and smoke test
- [x] Step 7: Lock down dependencies

---

## Phase 2: Obsidian plugin — Drive browser and sync

Adds a sidebar Drive browser to Obsidian. Users check files and folders to track, press Sync to pull them into the vault. Google Docs → markdown, Sheets → CSV. Mirrors Drive folder structure under a configurable vault root. See ARCHITECTURE.md and DESIGN.md for full detail.

### Status — Complete ✓

- [x] Step 1: Plugin scaffold
- [x] Step 2: DriveProvider — list, download, check via rclone
- [x] Step 3: GDriveSidebar — file tree with lazy-loading folders
- [x] Step 4: Checkbox selection (files + folders) and settings persistence
- [x] Step 5: SyncManager — sync pipeline with per-file progress
- [x] Step 6: HTML → markdown via turndown, CSS stripping, nested list handling
- [x] Step 7: Skip-if-unchanged (ModTime comparison against syncState)
- [x] Step 8: Frontmatter injection (configurable gdrive fields, human-readable dates)
- [x] Step 9: Polish — sync button states, status line, error banner, command palette, sync log

Additional features shipped beyond original plan:
- File search with "Search all of Drive" recursive fetch
- Synced files pane with per-file resync
- Folder recursive sync via listRecursive
- Collapsible sync log with live per-file progress
- Tri-state sync status indicator (idle/syncing/error)
- Google Docs nested list indentation preservation
- Glob character escaping in rclone include filters
- Configurable rclone binary path for non-standard installs

---

## Step 1: Fork the repo ✓

Done. `src/gdrive/` was copied from `modelcontextprotocol/servers-archived` into this repo.

## Step 2: Auth approach ✓

Decision: use rclone instead of creating a GCP project. The original `index.ts` used `googleapis` + `@google-cloud/local-auth`, which required a GCP OAuth app (client_id, client_secret, consent screen setup). rclone ships its own OAuth credentials, so the user only needs `rclone config` — no Console steps.

See ARCHITECTURE.md for the full trade-off analysis.

## Step 3: Install rclone and configure Drive remote

```bash
brew install rclone
rclone config
```

In the config wizard:
1. `n` — new remote
2. Name: `gdrive` (must match — the MCP server will look for this remote name)
3. Type: `drive` (Google Drive)
4. Client ID: leave blank (uses rclone's built-in credentials)
5. Client secret: leave blank
6. Scope: `1` (full access) or `2` (read-only recommended)
7. Root folder ID: leave blank (accesses your entire Drive)
8. Service account file: leave blank
9. Advanced config: `n`
10. Auto config: `y` — browser opens, log in with your Google account, grant access
11. Team drive: `n` (unless needed)
12. Confirm: `y`

Verify it works:

```bash
rclone lsjson gdrive: --max-depth 1
```

You should see a JSON array of files and folders from your Drive root. If you get an error, re-run `rclone config` and check the remote name is exactly `gdrive`.

## Step 4: Rewrite `index.ts`

Replace the current `googleapis`-based implementation with rclone subprocess calls.

### Key changes

**Remove:**
- `import { authenticate } from "@google-cloud/local-auth"`
- `import { google } from "googleapis"`
- `authenticateAndSaveCredentials()` function
- `loadCredentialsAndRunServer()` credential loading

**Add:**
- `import { execFile } from "child_process"` (built-in, no new dep)
- `runRclone(args: string[]): Promise<string>` — wrapper that runs `rclone` and returns stdout
- Startup check: verify `rclone lsjson gdrive: --max-depth 0` succeeds, exit with a clear error if not

**ListResources handler:**
```typescript
const output = await runRclone(["lsjson", "gdrive:", "--max-depth", "1"]);
const files = JSON.parse(output);
return {
  resources: files.map((f: any) => ({
    uri: `gdrive:///${f.Path}`,
    mimeType: f.MimeType,
    name: f.Name,
  })),
};
```

**ReadResource handler:**
```typescript
const filePath = request.params.uri.replace("gdrive:///", "");
const mimeType = /* detect from extension or prior lsjson */;
const args = ["cat"];
if (filePath.endsWith(".gdoc")) args.push("--drive-export-formats", "txt");
if (filePath.endsWith(".gsheet")) args.push("--drive-export-formats", "csv");
args.push(`gdrive:${filePath}`);
const content = await runRclone(args);
return { contents: [{ uri: request.params.uri, mimeType: "text/plain", text: content }] };
```

**Search tool handler:**
```typescript
const term = request.params.arguments?.query as string;
const output = await runRclone([
  "lsjson", "gdrive:",
  "--include", `*${term}*`,
  "--recursive",
  "--files-only",
]);
const files = JSON.parse(output);
const list = files.map((f: any) => `${f.Path} (${f.MimeType})`).join("\n");
return { content: [{ type: "text", text: `Found ${files.length} files:\n${list}` }] };
```

### Update `package.json`

Remove:
```json
"@google-cloud/local-auth": "^3.0.1",
"googleapis": "^144.0.0"
```

Nothing new to add — `child_process` is built into Node.

### Build

```bash
cd g-command/src/gdrive
npm install
npm run build
```

## Step 5: Register with Claude Code

```bash
claude mcp add gdrive node /Users/mx/writing/obsidian-plugins/g-command/src/gdrive/dist/index.js
```

Or add manually to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "gdrive": {
      "command": "node",
      "args": ["/Users/mx/writing/obsidian-plugins/g-command/src/gdrive/dist/index.js"]
    }
  }
}
```

No env vars needed — rclone reads its token from `~/.config/rclone/rclone.conf` automatically.

## Step 6: Verify

In Claude Code:

```
/mcp
```

`gdrive` should appear as connected.

Smoke tests:
1. List resources — you should see Drive files in the response
2. Search for a known filename — confirm results come back
3. Read a Google Doc by path — confirm you get plain text content

## Step 7: Lock it down

- Pin `@modelcontextprotocol/sdk` to an exact version in `package.json`
- Run `npm audit` and resolve anything high or critical
- Confirm rclone scope is read-only (`drive.readonly`) — check during `rclone config` or re-run config to verify
- Ensure `dist/` is in `.gitignore` if it isn't already

## Risks

| Risk | Mitigation |
|------|------------|
| rclone not in PATH when Claude Code spawns the server | Add startup check; fail with clear message pointing to `brew install rclone` |
| rclone remote named differently | Make remote name configurable via `GDRIVE_RCLONE_REMOTE` env var, default to `gdrive` |
| rclone token expires | rclone handles refresh automatically — not a concern |
| Filename search misses files | Known limitation; document it and consider path browsing as the primary workflow |
| Google Workspace files look like stubs in local mount | Server uses rclone, not the local mount — not an issue |

---

## Phase 2 step detail

### Step 1: Plugin scaffold

Create the Obsidian plugin skeleton at `g-command/` root level. The plugin coexists with the MCP server at `src/gdrive/`.

Files to create:
- `manifest.json` — Obsidian plugin manifest (id: `g-command`, name: `g-command`)
- `package.json` — esbuild + TypeScript build, depends on `obsidian`, `turndown`, `turndown-plugin-gfm`
- `esbuild.config.mjs` — standard Obsidian esbuild config
- `tsconfig.json` — targets ES2018, bundler module resolution
- `styles.css` — minimal sidebar styles
- `main.ts` — `Plugin` subclass with empty `onload()`/`onunload()`
- `src/types.ts` — `DriveFile`, `SyncRecord`, `GCommandSettings` interfaces

Verify: plugin appears in Obsidian's community plugins list and loads without error.

### Step 2: DriveProvider

`src/DriveProvider.ts`. Wraps rclone subprocess calls. No UI dependencies.

```typescript
class DriveProvider {
  list(drivePath: string): Promise<DriveFile[]>
  listRecursive(drivePath: string): Promise<DriveFile[]>
  cat(drivePath: string, exportFormat?: 'html' | 'csv' | 'txt'): Promise<Buffer>
  check(): Promise<void>  // throws if rclone missing or remote unreachable
}
```

Uses Node.js built-in `child_process.execFile` (available in Obsidian's Electron environment). Max buffer: 50 MB.

### Step 3: GDriveSidebar — file tree

`src/GDriveSidebar.ts`. Registered as view type `g-command-drive`.

Phase 3 scope (no selection yet):
- Loads Drive root on open via `DriveProvider.list("")`
- Renders a collapsible tree using Obsidian's standard DOM APIs
- Expand/collapse folders on click (lazy-loads children)
- Error banner if `DriveProvider.check()` fails

### Step 4: Checkbox selection and persistence

Extend `GDriveSidebar` with three-state checkboxes (☑ / □ / ⊟). 

- Checking a folder marks all loaded children as checked; further children inherit when loaded
- `selectedPaths` stored in plugin settings as `string[]`
- Settings saved after each checkbox change via `plugin.saveData()`
- On tree rebuild (re-open or post-sync), restore check states from `settings.selectedPaths`

### Step 5: SyncManager — basic sync

`src/SyncManager.ts`. First version: download and overwrite all selected files unconditionally.

```typescript
class SyncManager {
  async syncAll(selectedPaths: string[]): Promise<SyncResult>
}
```

- Expands folder paths via `DriveProvider.listRecursive`
- Downloads each file via `DriveProvider.cat`
- Writes to vault via `this.app.vault.adapter.write(path, content)`
- Creates intermediate folders via `this.app.vault.adapter.mkdir`
- Returns `{ synced: number, failed: string[] }`

At this step, all selected files are re-downloaded on every sync (no skip logic yet).

### Step 6: Converter

`src/Converter.ts`. Stateless conversion by MIME type.

```typescript
function convert(content: Buffer, file: DriveFile): { text: string; ext: string }
```

- Google Docs (`application/vnd.google-apps.document`): turndown(html) → markdown, ext `.md`
- Sheets (`application/vnd.google-apps.spreadsheet`): CSV passthrough, ext `.csv`
- Slides / Forms: plain text, ext `.md`
- Text types: UTF-8 string passthrough, original ext
- Binary: not converted at this step (write as-is to vault)

Turndown config: GFM plugin enabled (tables), headingStyle `atx`, bulletListMarker `-`.

Strip the rclone-added extension from the output filename: `Brief.gdoc` → `Brief.md`.

### Step 7: Skip-if-unchanged

Extend `SyncManager` to compare Drive `ModTime` against stored state before downloading.

- `settings.syncState` maps Drive path → `{ modTime, vaultPath, fileId }`
- If `file.ModTime === syncState[path].modTime`: skip
- After writing: update `syncState[path]` with new ModTime and vault path
- Sync result now reports `{ synced, skipped, failed }`

Notice text: `"Synced 3 files, 12 up to date"` or `"All files up to date"`.

### Step 8: Frontmatter injection

Extend `Converter` to prepend frontmatter to all `.md` output.

```yaml
---
gdrive_id: "..."
gdrive_url: "https://docs.google.com/..."
gdrive_path: "Work/Brief.gdoc"
gdrive_type: "application/vnd.google-apps.document"
synced: "2026-03-31T14:22:00.000Z"
---
```

On re-sync, detect existing frontmatter block (lines 1–N between `---` delimiters) and replace it. Use a regex or line scanner — do not use a YAML parser to avoid adding a dependency.

### Step 9: Polish

- **Sync button state** — spinner during sync, disabled to prevent double-trigger
- **Status line** — "Synced N · 2 min ago" shown below sidebar header; updates after sync
- **Partial folder selection** — ⊟ state for folders with mixed child selection
- **Error handling** — per-file failures shown as notices; partial sync still completes
- **Command palette** — register `g-command: Sync Drive files` and `g-command: Open Drive browser`
- **Refresh after sync** — reload modified tree nodes after sync so ✓ badges appear

---

## Phase 3: Drive tree caching

The sidebar currently calls `rclone lsjson` on every open and folder expand. On slow connections this means a 2-5 second delay before the tree renders. The goal: display cached tree instantly, refresh in the background.

### Cache scope

Cache the root-level listing plus any user-expanded folders. On load, also pre-fetch parent folders of all synced files (from `settings.syncState`) so those paths are visible without delay.

### Cache schema

```typescript
interface DriveTreeCache {
  /** ISO timestamp of last successful refresh */
  lastRefresh: string;
  /** Cached folder listings, keyed by Drive path ("" = root) */
  folders: Record<string, DriveFile[]>;
}
```

Stored in `settings.driveCache` via `saveData()`. Each folder entry is the raw `DriveFile[]` from `rclone lsjson`. The cache stores flat listings per folder, not a nested tree — the sidebar rebuilds `TreeNode[]` from cache on open.

### Data flow

```
onOpen()
  ├── if driveCache exists:
  │     build rootNodes from driveCache.folders[""]
  │     restore expanded folders from driveCache.folders[path]
  │     render() immediately (instant UI)
  │     start background refresh →
  │       drive.check()
  │       drive.list("") → compare with cache
  │       if changed: update cache, re-render
  │       refresh synced-file parent folders
  │
  └── if no cache:
        loadRoot() as today (loading spinner, fetch, render)
        save result to driveCache

loadChildren(node)
  ├── if driveCache.folders[path] exists:
  │     use cached children immediately
  │     fetch fresh in background → update if changed
  └── else:
        fetch, render, save to cache

After sync:
  refresh parent folders of synced files in cache
```

### Pre-fetching synced-file parents

On background refresh, extract unique parent folder paths from `settings.syncState` keys and fetch those folders. This ensures that when a user opens the sidebar, the tree can show the path to any previously synced file without waiting for manual folder expansion.

Example: if `syncState` has `Projects/Brief.md`, the cache pre-fetches `Projects/` listing.

### Steps

- [x] Step 1: Add `DriveTreeCache` type to `types.ts`, add `driveCache` to settings with default `null`
- [x] Step 2: On sidebar open, build tree from cache if available, render immediately
- [x] Step 3: Background refresh — fetch root listing after rendering cached tree, update cache + re-render if changed
- [x] Step 4: Cache folder expansions — save to `driveCache.folders[path]` after each `loadChildren`
- [x] Step 5: Pre-fetch synced-file parent folders during background refresh
- [x] Step 6: Cache invalidation — refresh button clears cache and fetches fresh; TTL optional later
- [x] Step 7: Tests for cache hydration, background refresh, and synced-parent pre-fetch

### Design decisions

**Why plugin settings, not a separate file**: `saveData()` is already used for syncState and selectedPaths. Adding the cache keeps everything in one persistence layer. Typical cache size is 50-200KB (root + 5-10 folders × ~50 files each).

**Why per-folder entries, not a nested tree**: Flat structure is simpler to update incrementally (replace one folder's listing without rebuilding the whole tree). Also matches rclone's output format directly.

**Why pre-fetch synced parents**: The primary use case is "open sidebar, see my synced files in context." Without this, the user would see root-level items but have to manually expand folders to see synced files deeper in the tree.

**No TTL for now**: Background refresh on every open is lightweight (one rclone call for root). Adding a configurable TTL would add complexity without clear benefit at this scale.

---

## Nice-to-haves (post-Phase 3)

- **`.gdoc` resolver:** read local Drive mount stubs, extract `resource_id`, sync that specific file — closing the loop without browsing
- **`/gdoc-pull` skill:** Claude Code skill that takes a doc name, searches Drive via MCP server, writes markdown into the vault
- **Sheets workflow:** render CSV as a table preview in a Obsidian leaf
- **Open in browser:** right-click synced file → open source Doc in browser using `gdrive_url` frontmatter field
