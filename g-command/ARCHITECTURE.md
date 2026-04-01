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
├── GDriveSidebar (ItemView)       — sidebar tree UI
│   └── DriveProvider              — rclone subprocess calls
├── SyncManager                    — sync orchestration
│   ├── DriveProvider
│   └── Converter                  — format conversion
└── SettingsTab (PluginSettingTab) — settings UI
```

### Data flow

```
User checks a file in GDriveSidebar
  → selectedPaths updated in GCommandSettings
  → settings saved to .obsidian/plugins/g-command/data.json

User clicks Sync
  → SyncManager.syncAll(selectedPaths)
    → DriveProvider.list(path)      — rclone lsjson
      ↳ returns DriveFile[]
    → compare file.ModTime with settings.syncState[path].modTime
    → if newer:
        DriveProvider.cat(path, 'html')  — rclone cat --drive-export-formats html
        Converter.convert(html, file)
          ↳ turndown(html) → markdown
          ↳ prepend frontmatter
        vault.adapter.write(vaultPath, content)
        settings.syncState[path] = { modTime, vaultPath, fileId }
    → if same: skip
  → Notice("Synced N, skipped M")
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

  // Returns recursive listing for sync
  async listRecursive(drivePath: string): Promise<DriveFile[]>

  // Downloads file content. exportFormat only applies to Google Workspace types.
  async cat(drivePath: string, exportFormat?: ExportFormat): Promise<Buffer>

  // Verifies rclone is installed and remote is reachable.
  async check(): Promise<void>
}
```

rclone commands used:

| Method | rclone command |
|--------|---------------|
| `list` | `rclone lsjson remote:path --max-depth 1` |
| `listRecursive` | `rclone lsjson remote:path --recursive --files-only` |
| `cat` (Docs) | `rclone cat --drive-export-formats html remote:path` |
| `cat` (Sheets) | `rclone cat --drive-export-formats csv remote:path` |
| `cat` (binary) | `rclone cat remote:path` |
| `check` | `rclone lsjson remote: --max-depth 1 --files-only` |

### `GDriveSidebar`

Obsidian `ItemView` subclass. View type id: `g-command-drive`.

State:
- Tree of `DriveNode` objects (file or folder, with `checked: boolean | 'partial'`)
- Loaded lazily — children fetched on first expand
- Root loaded on view open and after each sync

Behaviour:
- Checkbox click: toggle selection, propagate to children, update parent to partial if needed
- Folder expand: call `DriveProvider.list()`, render children
- Sync button: delegate to `SyncManager.syncAll()`, show spinner, refresh tree after
- Error state: if `DriveProvider.check()` fails, render error banner instead of tree

Selected paths are stored as a `Set<string>` (Drive paths, e.g. `"Work/Projects/Brief.gdoc"`) in plugin settings. The tree is rebuilt from Drive on each open; checkbox states are restored from settings.

### `SyncManager`

Orchestrates the sync. No UI logic.

```typescript
class SyncManager {
  async syncAll(selectedPaths: Set<string>): Promise<SyncResult>
  async syncPath(drivePath: string): Promise<FileSyncResult>
  private vaultPath(drivePath: string): string
  private needsSync(file: DriveFile): boolean
}
```

`syncAll` expands any selected folders (via `DriveProvider.listRecursive`) before syncing, so folder selections are always resolved to individual files.

`needsSync` compares `file.ModTime` (ISO string from rclone) against the stored `modTime` in `settings.syncState`. If no record exists (first sync), the file is always downloaded.

### `Converter`

Stateless. Converts raw file content to a vault-ready string.

```typescript
function convert(
  content: Buffer,
  file: DriveFile,
  options: { vaultPath: string }
): ConvertResult
```

Conversion by MIME type:

| MIME type | Action |
|-----------|--------|
| `application/vnd.google-apps.document` | HTML → markdown via Turndown, + frontmatter |
| `application/vnd.google-apps.spreadsheet` | CSV passthrough, no frontmatter |
| `application/vnd.google-apps.presentation` | Plain text → .md, + frontmatter |
| `text/*` | String passthrough |
| `application/json` | String passthrough |
| anything else | Binary passthrough (returned as `Buffer`) |

Turndown is configured with GFM (GitHub Flavoured Markdown) tables enabled, which preserves Google Docs table structure.

### `SettingsTab`

Standard Obsidian `PluginSettingTab`. Two fields:

- **rclone remote** (text, default `"gdrive"`) — must match the name used in `rclone config`
- **Vault sync root** (text, default `"gdrive"`) — folder created at vault root; Drive structure mirrored inside

Selected paths and sync state are managed internally and not exposed in the settings tab.

---

## Settings schema

Stored in `.obsidian/plugins/g-command/data.json` via `plugin.saveData()`.

```typescript
interface GCommandSettings {
  rcloneRemote: string;           // default: "gdrive"
  vaultRoot: string;              // default: "gdrive"
  selectedPaths: string[];        // Drive paths (files or folders) the user has checked
  syncState: Record<string, SyncRecord>;
}

interface SyncRecord {
  modTime: string;    // Drive ModTime at last sync (ISO 8601)
  vaultPath: string;  // Relative vault path where file was written
  fileId: string;     // Drive file ID (for future URL construction)
}
```

---

## Frontmatter

Injected at the top of every `.md` file written during sync.

```yaml
---
gdrive_id: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
gdrive_url: "https://docs.google.com/document/d/1BxiMVs0.../edit"
gdrive_path: "Work/Projects/Project Brief.gdoc"
gdrive_type: "application/vnd.google-apps.document"
synced: "2026-03-31T14:22:00.000Z"
---
```

On re-sync, the frontmatter block is replaced and the document body is overwritten. The vault copy is not considered authoritative — Drive is the source of truth.

---

## File layout

The Obsidian plugin lives at the `g-command/` root level alongside the existing MCP server directory.

```
g-command/
├── main.ts                   # Plugin entry point
├── manifest.json             # Obsidian plugin manifest
├── package.json              # Build config
├── styles.css                # Sidebar and status CSS
├── esbuild.config.mjs
├── tsconfig.json
├── setup.sh                  # MCP server setup (existing)
└── src/
    ├── types.ts              # Shared interfaces (DriveFile, SyncRecord, etc.)
    ├── DriveProvider.ts
    ├── SyncManager.ts
    ├── Converter.ts
    ├── GDriveSidebar.ts
    ├── SettingsTab.ts
    └── gdrive/               # MCP server (existing, unchanged)
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

**Lazy tree loading**
Drive roots can have hundreds of files. Loading the full tree on sidebar open would be slow and make unnecessary API calls. Children are fetched only when a folder is expanded.

**Skip-if-unchanged by ModTime**
Drive's `ModTime` field is reliable and returned by `rclone lsjson`. Comparing it against a stored timestamp is cheap and avoids re-downloading unchanged files. No hashing or diffing needed.

**Selected folders, not files**
Users check folders, not individual files. This means adding a file to a tracked Drive folder picks it up on the next sync without any user action. Individual files can still be unchecked within an expanded folder.

**Drive is source of truth**
Sync is one-way: Drive → vault. Local edits to synced files are silently overwritten when the Drive file changes. This is intentional — the use case is pulling research docs, meeting notes, and reference material into Obsidian for reading and linking, not editing.
