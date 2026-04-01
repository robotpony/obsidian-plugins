# Architecture

## Overview

g-command is an MCP server that gives Claude Code read access to Google Drive. It exposes Drive files as MCP resources and a filename-search tool.

```
Claude Code
    │
    │  MCP (stdio)
    ▼
g-command (Node.js process)
    │
    │  child_process.execFile
    ▼
rclone binary
    │
    │  Google Drive API (HTTPS + OAuth2)
    ▼
Google Drive
```

The server runs as a local subprocess. Claude Code spawns it on startup and communicates over stdio using the MCP protocol. All Drive access goes through rclone subprocesses. The server itself holds no credentials and no state between calls.

## Auth approach: rclone instead of GCP OAuth

### Why rclone

The original approach used `googleapis` + `@google-cloud/local-auth`, which requires creating a GCP project and configuring an OAuth consent screen to obtain a `client_id` and `client_secret`. That is roughly six steps in the Google Cloud Console.

rclone ships with its own registered OAuth credentials for Google Drive. Running `rclone config` is a single terminal command that handles the browser auth flow and stores a token. No GCP Console, no OAuth app registration.

### Trade-offs

| Capability | Direct GCP | rclone (current) |
|-----------|-----------|--------|
| Full-text content search | Yes | No (filename matching only) |
| Google Docs export to markdown | Yes | No (plain text) |
| Setup time | ~15 min (console) | ~3 min (terminal) |
| Runtime dependencies | `googleapis` npm package | `rclone` binary |
| Token storage | `.gdrive-server-credentials.json` | `~/.config/rclone/rclone.conf` |

Full-text search and markdown export are acceptable losses. The primary use case is listing documents and reading their content. Plain text is sufficient for Claude to work with Google Docs.

### Auth lifecycle

```
One-time setup:
  brew install rclone
  rclone config  →  creates [gdrive] remote in ~/.config/rclone/rclone.conf

Runtime (each MCP call):
  rclone reads token from rclone.conf
  rclone refreshes token automatically if expired
  rclone makes Drive API call, returns result to stdout
```

Token refresh is handled entirely by rclone. The MCP server does not manage credentials.

## Components

### Server process (`index.ts`)

Single-file TypeScript server. Responsibilities:

- Implements the MCP `resources` interface — exposes Drive files at `gdrive:///path/to/file`
- Implements the MCP `tools` interface — exposes one tool: `search`
- Executes rclone subprocesses and maps output to MCP response format

### rclone subprocess layer

All Drive operations are rclone CLI calls via `child_process.execFile`. No npm Drive library is used at runtime.

| Operation | rclone command |
|-----------|---------------|
| List root | `rclone lsjson gdrive: --max-depth 1` |
| List folder | `rclone lsjson "gdrive:Folder" --max-depth 1` |
| Search by filename | `rclone lsjson gdrive: --include "*term*" --recursive --files-only` |
| Read Google Doc | `rclone cat --drive-export-formats txt "gdrive:Doc.gdoc"` |
| Read Google Sheet | `rclone cat --drive-export-formats csv "gdrive:Sheet.gsheet"` |
| Read regular file | `rclone cat "gdrive:path/to/file"` |

### Format conversion

| Drive type | Export format | Notes |
|------------|--------------|-------|
| Google Docs | `txt` (plain text) | Formatting lost, content preserved |
| Google Sheets | `csv` | Full fidelity |
| Google Slides | `txt` | Plain text |
| Binary files | native | Raw bytes, base64-encoded in MCP response |

## MCP interface

### Tool: `search`

Finds files in Drive whose names match a query string. Returns file names and paths. Filename matching only — does not search document contents.

### Resource: `gdrive:///path/to/file`

Fetches and converts a file by its Drive path. Claude Code can read any file it discovers via `search` or `ListResources` using this URI scheme.

## Resource URI scheme

```
gdrive:///path/to/file
```

Maps to rclone remote path: `gdrive:path/to/file`

Path is relative to the Drive root. Spaces are preserved; the server handles quoting when constructing rclone commands.

## Dependencies

**Removed:**
- `@google-cloud/local-auth` — handled by rclone config
- `googleapis` — replaced by rclone subprocesses

**Kept:**
- `@modelcontextprotocol/sdk` — MCP transport and protocol
- Node.js built-in `child_process` — subprocess execution

**New system dependency:**
- `rclone` binary (installed via Homebrew, not bundled)

## Scope

rclone is configured with `drive.readonly` scope during `rclone config`. This allows listing and reading files but no write, delete, or share operations.

## Known limitations

1. **Filename search only.** The `search` tool matches filenames using glob patterns. It cannot search document contents.

2. **Plain text export for Docs.** Formatting (headings, bold, lists) is lost. Content is preserved.

3. **rclone must be installed and configured.** The server fails with a clear error if `rclone` is not in PATH or if the `gdrive` remote is not configured.

4. **No Drive File Stream integration.** Even though Drive for Desktop is mounted at `~/Library/CloudStorage/`, the server uses rclone for all operations. The local mount is not used (Google Workspace stubs don't contain document content).

5. **Concurrent calls.** Each MCP call spawns a rclone subprocess. For interactive use this is not a concern.

## Future extension points

1. **`.gdoc` resolver:** read local Drive mount stubs, extract the embedded `resource_id`, and auto-fetch via the MCP server — closing the loop without knowing file paths manually
2. **`/gdoc-pull` skill:** a Claude Code skill that takes a document name, searches Drive, and saves the result as markdown to the Obsidian vault
3. **Upgrade to direct API:** if markdown export becomes necessary, reintroduce `googleapis` with rclone config as the token source (read `~/.config/rclone/rclone.conf` for the stored token + rclone's client credentials)
