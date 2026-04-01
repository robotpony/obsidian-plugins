# Architecture

## Overview

g-command is a thin wrapper around the archived Anthropic MCP reference server for Google Drive. It sits between Claude Code and the Google Drive API, exposing Drive files as readable MCP resources.

```
Claude Code
    │
    │  MCP (stdio)
    ▼
g-command (Node.js process)
    │
    │  Google Drive API (HTTPS)
    ▼
Google Drive
```

The server runs as a local subprocess. Claude Code spawns it on startup and communicates over stdio using the MCP protocol.

## Components

### Server process (`index.ts`)

Single-file TypeScript server. Responsibilities:

- Implements the MCP `resources` interface — exposes Drive files at `gdrive:///<file_id>`
- Implements the MCP `tools` interface — exposes one tool: `search`
- Handles OAuth token loading and refresh
- Converts Drive export formats to Claude-readable formats

### Auth layer

OAuth 2.0 Desktop flow:

1. On first run (`node dist/index.js auth`), opens a browser to Google's consent screen
2. Exchanges the auth code for access + refresh tokens
3. Persists tokens to `.gdrive-server-credentials.json`
4. On subsequent runs, loads tokens from disk and refreshes as needed

Credentials file: `.gdrive-server-credentials.json` (gitignored)  
OAuth config file: `~/.config/gdrive-mcp/gcp-oauth.json` (downloaded from GCP Console)

### Format conversion

The Drive API exports files in different formats depending on type. The server handles this transparently:

| Drive type | Export MIME type | Output |
|------------|-----------------|--------|
| Google Docs | `text/markdown` | Markdown string |
| Google Sheets | `text/csv` | CSV string |
| Google Slides | `text/plain` | Plain text |
| Google Drawings | `image/png` | PNG bytes |
| Binary files | native | Raw bytes |

## MCP interface

**Tool: `search`**

Finds files in Drive matching a query string. Returns file names and IDs. Used to discover a file ID before reading it.

**Resource: `gdrive:///<file_id>`**

Fetches and converts a file by its Drive ID. Claude Code can read any file it discovers via `search` using this URI scheme.

## Scope

The server requests `https://www.googleapis.com/auth/drive.readonly`. This is the narrowest Drive scope — it allows listing and reading files but no write, delete, or share operations.

## What this is not

- Not a sync tool — no local cache, every read hits the API
- Not a write tool — no uploads, edits, or moves
- Not a watcher — no change notifications or polling

## Future extension points

The `idea.md` notes two potential additions:

1. **`.gdoc` resolver:** read local Drive mount files, extract the embedded `doc_id`, and auto-fetch via the MCP server — closing the loop without needing to know file IDs manually
2. **`/gdoc-pull` skill:** a Claude Code skill that takes a document name, searches Drive, and saves the result as markdown to the Obsidian vault
