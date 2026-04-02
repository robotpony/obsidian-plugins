# Architecture: g-command

g-command has two components:

1. **MCP server** (`src/gdrive/`) — gives Claude Code read access to Google Drive via rclone subprocesses. Done.
2. **Obsidian plugin** (root `g-command/`) — gives Obsidian a Drive browser sidebar and a sync command. This document covers both, with emphasis on the plugin.

Both components use rclone for all Drive access. Auth is shared — configured once via `rclone config` or `./setup.sh`.

---

## MCP server (existing)

See `src/gdrive/index.ts`. Single-file TypeScript MCP server. Exposes:
- `ListResources` — lists Drive files via `rclone lsjson`
- `ReadResource` — downloads a file via `rclone cat`
- `search` tool — filename search via `rclone lsjson --include`

No changes needed to the MCP server for the plugin work.

---

## Obsidian plugin

### Component map

```
main.ts (Plugin)
├── GDriveSidebar (ItemView)       — sidebar tree UI, search, synced files pane
│   └── DriveProvider              — rclone subprocess calls
├── SyncManager (module)           — sync orchestration + format conversion
│   └── DriveProvider
└── SettingsTab (PluginSettingTab) — settings UI (inline in main.ts)
```

### Data flow

```
User checks a file in GDriveSidebar
  → selectedPaths updated in GCommandSettings
  → settings saved to .obsidian/plugins/g-command/data.json

User clicks Sync
  → GDriveSidebar.collectSelectedFiles()
    → expands folder selections via DriveProvider.listRecursive()
  → syncFiles(files, app, drive, settings, saveSettings, onLog)
    → for each file:
      → compare file.ModTime with settings.syncState[path].modTime
      → if same: skip (result.skipped++)
      → if newer:
          DriveProvider.download(path, exportFormat)
            — rclone copy --include <filename> from parent dir
          convertContent(raw)
            ↳ turndown(html) → markdown (strips CSS, handles nested lists)
          buildFrontmatter(file) + content
          writeToVault(app, vaultPath, content)
          settings.syncState[path] = { modTime, vaultPath, fileId, mimeType }
  → onLog reports per-file progress to sidebar sync log
```

---

## Plugin components

### `main.ts`

Entry point. Standard Obsidian `Plugin` subclass.

Responsibilities:
- Registers `GDriveSidebar` as a view
- Registers commands (`sync`, `open sidebar`)
- Loads/saves settings
- Passes settings and a `DriveProvider` instance to sidebar and sync manager

### `DriveProvider`

Wraps `child_process.execFile` calls to the `rclone` binary. All Drive I/O goes through this class.

```typescript
class DriveProvider {
  constructor(private remote: string) {}

  // Returns files/folders at path (one level deep)
  async list(drivePath: string): Promise<DriveFile[]>

  // Returns all files recursively under path
  async listRecursive(drivePath: string): Promise<DriveFile[]>

  // Downloads file content as string. Uses rclone copy --include from parent dir.
  // For Google Workspace exports, pass exportFormat (e.g. "html", "csv").
  async download(drivePath: string, exportFormat?: ExportFormat): Promise<string>

  // Verifies rclone is installed and remote is reachable.
  async check(): Promise<void>
}
```

rclone commands used:

| Method | rclone command |
|--------|---------------|
| `list` | `rclone lsjson remote:path --max-depth 1` |
| `listRecursive` | `rclone lsjson remote:path --recursive --files-only` |
| `download` | `rclone copy --include <filename> [--drive-export-formats fmt] remote:parent/ tmpDir` |
| `check` | `rclone lsjson remote: --max-depth 1 --files-only` |

The `download` method uses `--include` from the parent directory instead of addressing the file directly. This is required because rclone can't address Google Workspace virtual files (Size -1) by full path. Glob special characters in filenames are escaped before passing to `--include`.

### `GDriveSidebar`

Obsidian `ItemView` subclass. View type id: `g-command-drive`.

State:
- `rootNodes: TreeNode[]` — tree of `{ file: DriveFile, children: TreeNode[] | null, expanded: boolean }`
- `selectedPaths: Set<string>` — user checkbox selections (persisted)
- `allFiles: DriveFile[] | null` — cached recursive search results (session only)
- `syncStatus: "idle" | "syncing" | "error"` — tri-state status for log indicator
- `logEntries: LogEntry[]` — sync log with timestamps and levels

Layout (top to bottom):
1. Header bar (logo, sync button, kebab menu)
2. Search bar with clear button
3. Status line (file count, connection status)
4. Synced files pane (if syncState has entries) — fixed section with per-file resync buttons
5. "Drive" section header
6. File tree (lazy-loading folders, checkboxes on files and folders)
7. Sync log (collapsible, tri-state status dot, clear button)

Behaviour:
- Checkbox click: toggle selection, persist to settings
- Folder expand: call `DriveProvider.list()`, lazy-load children
- Folder checkbox: selecting a folder syncs all files recursively via `listRecursive()`
- Sync button: collect selected files/folders → `syncFiles()` → per-file progress in log
- Search: filter loaded tree; "Search all of Drive" fetches recursive listing
- Resync: per-file resync from synced files pane, builds DriveFile stub from SyncRecord
- Error state: error banner with setup instructions and copy button

### `SyncManager` (module)

Exported functions in `src/SyncManager.ts`. No class — stateless functions that accept dependencies as parameters.

```typescript
// Main sync entry point
function syncFiles(
  files: DriveFile[], app: App, drive: DriveProvider,
  settings: GCommandSettings, saveSettings: () => Promise<void>,
  onLog?: SyncLogFn
): Promise<SyncResult>

// Format detection: MIME type + Size → export format, vault extension, conversion strategy
function getFormatMapping(file: DriveFile): FormatMapping

// HTML → markdown conversion via turndown (strips CSS, handles Google Docs nested lists)
function convertContent(raw: string): string

// YAML frontmatter block (gdrive_id, gdrive_path, synced timestamp)
function buildFrontmatter(file: DriveFile, includeGdriveFields?: boolean): string
```

`syncFiles` iterates each file, compares `file.ModTime` against `syncState`, downloads if changed, converts, prepends frontmatter, and writes to vault. Reports per-file progress via `onLog` callback.

Format mapping by MIME type:

| MIME type | Export | Vault ext | Convert |
|-----------|--------|-----------|---------|
| Google Docs (native or Office MIME, Size -1) | HTML | `.md` | turndown + frontmatter |
| Google Sheets (native or Office MIME, Size -1) | CSV | `.csv` | passthrough |
| Google Slides (native or Office MIME, Size -1) | TXT | `.md` | frontmatter only |
| Real uploaded files (Size > 0) | native | original | passthrough |

Turndown config: ATX headings, fenced code blocks. Custom rules strip `<style>`, `<script>`, `<meta>`, `<link>` elements and decode Google Docs CSS-encoded list nesting (`lst-kix_*-N` classes on `<ol>` parents).

### `SettingsTab`

`GCommandSettingTab` class defined inline in `main.ts`. Four settings:

- **rclone remote** (text, default `"gdrive"`) — must match the name used in `rclone config`. Debounced connectivity check.
- **rclone path** (text, default empty = auto-detect) — explicit path for non-standard installs
- **Vault sync root** (text, default `"gdrive"`) — folder created at vault root; "Show in Finder" button
- **Include Drive metadata in frontmatter** (toggle, default on) — controls gdrive_id/gdrive_path fields

Selected paths and sync state are managed internally and not exposed in the settings tab.

---

## Settings schema

Stored in `.obsidian/plugins/g-command/data.json` via `plugin.saveData()`.

```typescript
interface GCommandSettings {
  rcloneRemote: string;                       // default: "gdrive"
  rclonePath: string;                         // explicit rclone binary path; empty = auto-detect
  vaultRoot: string;                          // default: "gdrive"
  selectedPaths: string[];                    // Drive paths the user has checked
  syncState: Record<string, SyncRecord>;      // Drive path → last sync record
  frontmatterGdriveFields: boolean;           // include gdrive_id/gdrive_path in frontmatter
  driveCache: DriveTreeCache | null;          // (Phase 3) Cached folder listings for instant load
}

interface SyncRecord {
  modTime: string;    // Drive ModTime at last sync (ISO 8601)
  vaultPath: string;  // Relative vault path where file was written
  fileId: string;     // Drive file ID
  mimeType?: string;  // Drive MIME type (for correct export format on resync)
}

// Phase 3
interface DriveTreeCache {
  lastRefresh: string;                    // ISO timestamp of last successful background refresh
  folders: Record<string, DriveFile[]>;   // folder path → rclone lsjson result ("" = root)
}
```

---

## Frontmatter

Injected at the top of every `.md` file written during sync.

```yaml
---
gdrive_id: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
gdrive_path: "Work/Projects/Project Brief.gdoc"
synced: "2026-04-02 14:22"
---
```

The `gdrive_id` and `gdrive_path` fields are optional (controlled by "Include Drive metadata in frontmatter" setting, default on). The `synced` timestamp uses human-readable `YYYY-MM-DD HH:mm` local time.

On re-sync, the frontmatter block is replaced and the document body is overwritten. The vault copy is not considered authoritative — Drive is the source of truth.

---

## File layout

The Obsidian plugin lives at the `g-command/` root level alongside the existing MCP server directory.

```
g-command/
├── main.ts                       # Plugin entry point + inline SettingsTab
├── manifest.json                 # Obsidian plugin manifest
├── package.json                  # Build config
├── styles.css                    # Sidebar and status CSS
├── esbuild.config.mjs
├── tsconfig.json
├── setup.sh                      # MCP server setup (existing)
├── ARCHITECTURE.md
├── CHANGELOG.md
├── PLAN.md
└── src/
    ├── types.ts                  # Shared interfaces (DriveFile, SyncRecord, GCommandSettings)
    ├── DriveProvider.ts          # rclone wrapper: list, listRecursive, download, check
    ├── DriveProvider.test.ts     # 25 tests
    ├── SyncManager.ts            # Sync orchestration + format conversion + frontmatter
    ├── SyncManager.test.ts       # 58 tests
    ├── GDriveSidebar.ts          # Sidebar view: tree, search, synced pane, sync log
    ├── GDriveSidebar.test.ts     # 12 tests
    └── gdrive/                   # MCP server (existing, unchanged)
        ├── index.ts
        ├── package.json
        └── ...
```

`install.sh` discovers plugins by looking for `manifest.json` in immediate subdirectories of the repo root. `g-command/manifest.json` is the Obsidian plugin manifest; the MCP server at `g-command/src/gdrive/` is built separately via `src/gdrive/package.json`.

---

## Dependencies

### Plugin (`g-command/package.json`)

| Package | Purpose |
|---------|---------|
| `obsidian` | Obsidian plugin API (dev dep) |
| `turndown` | HTML → markdown conversion |
| `turndown-plugin-gfm` | Adds GFM table support to turndown |
| `@types/turndown` | TypeScript types for turndown |
| `esbuild` | Bundler |
| `typescript` | Compiler |

`child_process` (built-in Node.js) is used for rclone calls — no additional dependency.

### Why turndown

The only JS HTML-to-markdown library with active maintenance, GFM table support, and zero runtime dependencies of its own. The GFM plugin is required for table conversion from Google Docs.

### Why not a Drive API client

All Drive access is via rclone subprocess calls. This reuses the auth configured during MCP server setup and adds no new OAuth credentials or API keys to manage. The trade-off is a runtime dependency on the rclone binary, which is already required by the MCP server.

---

## Key decisions

**rclone HTML export, not plain text**
Google Docs exported as HTML preserve headings, bold, italic, lists, and tables. Turndown converts these to markdown. Plain text loses all formatting. HTML export adds no complexity — it's one flag to rclone.

**Cached tree with background refresh**
The Drive tree is cached in plugin settings (`driveCache`) so the sidebar renders instantly on open. A background refresh fetches the current root listing and updates the cache silently. Parent folders of synced files are pre-fetched so those paths are visible without manual expansion. Folder expansions are also cached.

**Lazy tree loading (with cache)**
Children are fetched on first folder expand. Once fetched, the listing is saved to `driveCache.folders[path]` and served from cache on subsequent opens. Background refresh updates stale entries.

**Skip-if-unchanged by ModTime**
Drive's `ModTime` field is reliable and returned by `rclone lsjson`. Comparing it against a stored timestamp is cheap and avoids re-downloading unchanged files. No hashing or diffing needed.

**Download via copy --include, not cat**
Google Workspace virtual files (Size -1) can't be addressed by full path in rclone. The `download()` method uses `rclone copy --include <filename>` from the parent directory instead. Glob special characters in filenames are escaped. This approach also handles export format renaming (e.g. `.docx` → `.html`) correctly.

**Selected folders and files**
Users can check both individual files and entire folders. Folder selections are expanded via `listRecursive()` at sync time, so adding a file to a tracked Drive folder picks it up on the next sync without any user action.

**Drive is source of truth**
Sync is one-way: Drive → vault. Local edits to synced files are silently overwritten when the Drive file changes. This is intentional — the use case is pulling research docs, meeting notes, and reference material into Obsidian for reading and linking, not editing.
