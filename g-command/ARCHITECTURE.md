# Architecture: g-command

g-command has two components today, with a third planned:

1. **MCP server** (`src/gdrive/`) — gives Claude Code read access to Google Drive via rclone subprocesses. Currently named `gdrive`; planned to become `vault` (a unified Obsidian knowledge server). See Phase 4.
2. **Obsidian plugin** (root `g-command/`) — gives Obsidian a Drive browser sidebar and a sync command.
3. **Shared conversion module** (planned, `src/convert/`) — turndown, frontmatter, format mapping. Used by both plugin and MCP server.

Both components use rclone for all Drive access. Auth is shared — configured once via `rclone config` or `./setup.sh`.

---

## MCP server (existing)

See `src/gdrive/index.ts`. Single-file TypeScript MCP server. Exposes:
- `ListResources` — lists Drive files via `rclone lsjson`
- `ReadResource` — downloads a file via `rclone cat`
- `search` tool — filename search via `rclone lsjson --include`

Phase 4 expands this into a unified `vault` MCP server with vault file access, structured search, and a `pull` tool.

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
    ├── SyncManager.ts            # Sync orchestration (imports from convert/)
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

## Phase 4: Vault MCP — unified knowledge server

### Problem

Claude Code can search Drive filenames and read raw text via the MCP server, but it can't:
- Convert Google Docs to markdown (turndown lives in the plugin, not the MCP server)
- Read vault files with structured metadata (frontmatter, tags)
- Pull Drive docs into the vault in one step
- Search across both vault content and Drive files

The MCP server is named `gdrive` and scoped to Drive only. But the real value is giving Claude a **unified knowledge surface**: vault notes and Drive docs through one interface, with the vault as the centre.

### Architecture: `vault` MCP server

Rename the MCP server from `gdrive` to `vault`. It becomes an Obsidian knowledge server with two data sources (vault filesystem and Google Drive) and shared conversion code.

```
vault MCP server
  │
  ├── Vault provider (new)
  │   ├── list vault files
  │   ├── read with parsed frontmatter
  │   └── search vault content
  │
  ├── Drive provider (existing, extended)
  │   ├── search Drive filenames
  │   ├── read Drive files (raw)
  │   └── pull: search + download + convert + write to vault + update syncState
  │
  └── Shared convert module (extracted from plugin)
      ├── turndown (HTML → markdown)
      ├── frontmatter (build + parse)
      └── format mapping (MIME → export format + extension)
```

### Vault discovery

The MCP server discovers vaults by reading Obsidian's registry at:

```
~/Library/Application Support/obsidian/obsidian.json
```

This file maps vault IDs to filesystem paths:

```json
{
  "vaults": {
    "7f9a45f1": { "path": "/Users/bruce/notes", "ts": 1768532469, "open": true },
    "03ad36ff": { "path": "/Users/bruce/me/dev-notes", "ts": 1774995052 }
  }
}
```

**Multi-vault support.** All registered vaults are accessible. Resources use the vault's folder name as a namespace:

```
vault://notes/daily/2026-04-03.md
vault://dev-notes/projects/g-command.md
```

The MCP server derives the vault name from the last path segment (e.g. `/Users/bruce/notes` → `notes`). If two vaults share a folder name, the server appends a suffix.

**Platform note.** The registry path is macOS-specific (`~/Library/Application Support/obsidian/`). Linux uses `~/.config/obsidian/`. Windows uses `%APPDATA%/obsidian/`. The server should check the platform and use the correct path.

### Resources

#### `vault://` — vault files

```
vault://{vault-name}/{path}
```

Returns file content with structured metadata:

```json
{
  "content": "# Brief\nThe project aims to...",
  "frontmatter": {
    "gdrive_id": "abc123",
    "tags": ["project", "q2"]
  },
  "path": "projects/brief.md",
  "vault": "notes",
  "modified": "2026-04-03T10:30:00Z"
}
```

Frontmatter is parsed from the `---` delimited YAML block at the top of `.md` files. A simple line-based parser (not a YAML library) extracts key-value pairs. Non-markdown files return content with no frontmatter.

**ListResources** returns files from all vaults, or from a specific vault via cursor pagination (cursor = vault name).

#### `gdrive://` — Drive files (existing, unchanged)

```
gdrive:///{drive-path}
```

Returns raw file content as today. No conversion — `ReadResource` stays simple. Conversion happens in the `pull` tool.

### Tools

#### `search` (extended)

Adds a `scope` parameter to search across vault, Drive, or both.

```
Input:  { query: string, scope?: "vault" | "drive" | "both" }
```

- `scope: "drive"` (default, backwards compatible): filename match via `rclone lsjson --include`
- `scope: "vault"`: content search across vault files via simple grep/match on file contents
- `scope: "both"`: returns results from both, labelled by source

Vault search reads files from disk and matches against filename and content. For the first version, this is a simple substring match against filenames + file content. No indexing.

#### `pull` (new)

Searches Drive, downloads, converts to markdown, writes to vault, updates syncState. One tool call does the full pipeline.

```
Input: {
  query: string,        // doc name to search for
  path?: string,        // exact Drive path (skips search)
  vault?: string        // target vault name (default: first open vault)
}
```

**Behaviour:**
1. If `path` provided, use it directly. Otherwise search Drive for `query`.
2. If multiple matches, return the list with paths — Claude picks one and calls again with `path`.
3. Download the file via rclone (HTML export for Docs, CSV for Sheets).
4. Convert using the shared convert module (same turndown config as the plugin).
5. Write to vault at `{vaultRoot}/{drive-path}.md`.
6. Update the plugin's `data.json` syncState so the sidebar knows about it.
7. Return: `{ vaultPath, drivePath, driveUrl }`.

**`vaultRoot` and `data.json` resolution:** The server knows the vault's filesystem path from the registry. The plugin's `data.json` is at `{vaultPath}/.obsidian/plugins/g-command/data.json`. The server reads `vaultRoot` from this file (default: `"gdrive"`).

### Section filter

Large Google Docs (and multi-tab Docs) produce long markdown output. Both the `pull` tool and `vault://` reads support an optional `sections` parameter to extract specific parts of the document.

#### Selectors

`sections` accepts an array of heading names, numeric indices, or a mix:

```
{ sections: ["Budget", "Timeline"] }       // by heading name
{ sections: [0, 2] }                       // by position (0-indexed)
{ sections: ["Budget", 3] }                // mixed
```

**By heading name:** Extracts everything from the matched heading to the next heading at the same or higher level. Matching is case-insensitive. Multiple heading names return multiple sections in document order.

**By numeric index:** Sections are numbered 0-based by top-level heading. Index 0 is content before the first heading (preamble), index 1 is the first heading and its content, etc. This is useful for discovery ("what's in section 0?") and as a fallback when heading names change.

**No match behaviour:** If a heading name doesn't match, the response includes the requested name in a `not_found` list alongside the available headings. This lets Claude retry with the correct name or fall back to numeric.

```json
{
  "content": "## Budget\nLine items...",
  "sections_returned": ["Budget"],
  "not_found": ["Budgets"],
  "available_headings": [
    { "index": 0, "level": 1, "text": "Overview" },
    { "index": 1, "level": 1, "text": "Budget" },
    { "index": 2, "level": 1, "text": "Timeline" }
  ]
}
```

#### Where it applies

| Context | How sections is passed |
|---------|----------------------|
| `pull` tool | `sections` parameter on the tool input |
| `vault://` read | Query parameter: `vault://notes/brief.md?sections=Budget,Timeline` |
| `gdrive://` read | Not supported (returns raw content, no conversion) |

When `sections` is omitted, the full document is returned (current behaviour).

#### Google Docs tabs

Google Docs tabs export as separate top-level sections in HTML. After turndown conversion, each tab becomes a `#`-level heading. The section filter treats tabs the same as any other heading — select by tab name or by index.

**Prerequisite: heading hierarchy fidelity.** The section filter depends on turndown correctly preserving heading levels from Google Docs HTML. Google Docs uses `<h1>`–`<h6>` tags for headings (not CSS-styled `<p>` elements), so standard turndown handles them correctly. However, the mapping must be verified for:
- Tab titles (appear as top-level headings)
- Heading levels within tabs (must preserve relative hierarchy)
- Title and subtitle styles (Google Docs "Title" is `<p class="title">`, not `<h1>`)

Tests must cover these cases before the section filter is reliable.

#### Implementation: `extractSections()`

Lives in `src/convert/` alongside the other conversion functions. Pure function, no side effects.

```typescript
function extractSections(
  markdown: string,
  selectors: (string | number)[]
): {
  content: string;
  sections_returned: string[];
  not_found: string[];
  available_headings: { index: number; level: number; text: string }[];
}
```

Logic:
1. Parse markdown into a flat list of sections, each defined by its heading line and body text.
2. Build the `available_headings` index (always returned, regardless of selectors).
3. For each selector: match by heading text (case-insensitive) or numeric index.
4. Concatenate matched sections in document order.
5. Report unmatched selectors in `not_found`.

**syncState write risk:** Obsidian may also write `data.json`. Since the `pull` tool writes only after file creation and Obsidian isn't actively syncing during a Claude conversation, the risk of concurrent writes is low. Acceptable for v1.

#### `list-vaults` (new)

Returns all known vaults with their names and paths. Useful for Claude to discover available vaults.

```
Output: [{ name: "notes", path: "/Users/bruce/notes", open: true }, ...]
```

### Shared conversion module: `src/convert/`

Extracted from `SyncManager.ts`. Zero Obsidian dependencies — pure TypeScript + turndown.

```
src/convert/
  index.ts       # convertContent(), buildFrontmatter(), parseFrontmatter()
  format.ts      # getFormatMapping(), stripVirtualExt(), sanitizeFilename(), toVaultPath()
  turndown.ts    # turndown instance + Google Docs custom rules
  types.ts       # FormatMapping, shared type subset (DriveFile shape for conversion)
```

Both the plugin and the MCP server import from this module:

- **Plugin** (`SyncManager.ts`): `import { convertContent, buildFrontmatter, getFormatMapping } from "./convert"`
- **MCP server** (`src/gdrive/index.ts`): `import { convertContent, buildFrontmatter, getFormatMapping } from "../convert"`

The MCP server's `tsconfig.json` needs its `rootDir` and `include` adjusted to reach `../convert/`. Since the MCP server compiles to `src/gdrive/dist/`, the convert module compiles alongside it.

**turndown dependency:** Added to the MCP server's `package.json` (`turndown`, `turndown-plugin-gfm`, `@types/turndown`). Both the plugin and MCP server bundle their own copy — no shared node_modules needed.

### File layout (updated)

```
g-command/
├── main.ts                       # Plugin entry point
├── manifest.json
├── package.json
├── styles.css
├── esbuild.config.mjs
├── tsconfig.json
└── src/
    ├── types.ts                  # Plugin-specific types (GCommandSettings, etc.)
    ├── DriveProvider.ts          # rclone wrapper (used by plugin)
    ├── SyncManager.ts            # Sync orchestration (imports from convert/)
    ├── GDriveSidebar.ts          # Sidebar UI
    ├── convert/                  # Shared conversion module (no Obsidian deps)
    │   ├── index.ts
    │   ├── format.ts
    │   ├── turndown.ts
    │   └── types.ts
    └── gdrive/                   # MCP server (directory name kept for provenance;
        ├── index.ts              #   MCP identity is "vault", not "gdrive")
        ├── vault-provider.ts     # Vault filesystem access + frontmatter parsing
        ├── vault-discovery.ts    # Reads obsidian.json, resolves vault paths
        ├── package.json
        ├── tsconfig.json
        └── dist/
```

**Directory naming note:** `src/gdrive/` retains its name because the code originated from the deprecated `modelcontextprotocol/servers-archived` repo. The MCP server registers as `vault` in Claude Code — the directory name is provenance, not identity.

### MCP registration (updated)

```json
{
  "mcpServers": {
    "vault": {
      "command": "node",
      "args": ["/path/to/g-command/src/gdrive/dist/index.js"]
    }
  }
}
```

No env vars needed. Vault paths are discovered from Obsidian's registry. rclone remote name defaults to `gdrive` (override via `GDRIVE_RCLONE_REMOTE` env var, same as before).

### Gaps from current state

| Gap | Current | Needed |
|-----|---------|--------|
| Conversion code coupled to plugin | `SyncManager.ts` contains turndown, frontmatter, format mapping | Extract to `src/convert/` |
| MCP server has no turndown | Only `@modelcontextprotocol/sdk` as dependency | Add turndown + turndown-plugin-gfm |
| MCP server can't read vault files | No vault awareness | Add `vault-provider.ts` + `vault-discovery.ts` |
| MCP exports Docs as txt | `exportArgs()` uses `txt` for `.gdoc` | `pull` tool uses HTML export (same as plugin) |
| MCP uses `cat` for downloads | `ReadResource` uses `rclone cat` | `pull` tool uses `copy --include` pattern from `DriveProvider.download()` |
| No vault search | Only Drive filename search | Add vault content search (simple substring for v1) |
| No `pull` tool | Only `search` tool exists | Add `pull` tool with full pipeline |
| No syncState integration | Plugin manages syncState internally | `pull` tool reads/writes plugin `data.json` |
| No multi-vault support | MCP server has no vault concept | Read Obsidian registry, namespace by vault name |
| MCP server named `gdrive` | Scoped to Drive only | Rename to `vault` |
| No `/gdoc-pull` skill | No Claude Code commands | Create skill that calls `pull` tool |
| MCP tsconfig scoped to `src/gdrive/` | Can't import from `../convert/` | Widen `rootDir`/`include` |

### Security and access considerations

- **Vault read access**: The MCP server runs as a Node process with the user's filesystem permissions. It can read any vault on disk. This is intentional — the user configures which MCP servers Claude Code can access.
- **Vault write access**: Only the `pull` tool writes to the vault (synced files + syncState). No general write tool is exposed.
- **Drive access**: Unchanged — read-only via rclone, using the user's configured remote.

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
