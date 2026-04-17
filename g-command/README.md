# g-command

Google Drive browser and sync for Obsidian, plus an MCP server for Claude Code.

Two components in one package:

1. **Obsidian plugin** — sidebar Drive browser that syncs Docs (→ markdown), Sheets (→ CSV), and other files into your vault
2. **MCP server** — lets Claude Code search Drive, read vault notes, and pull Drive files into the vault

Google Drive files on a local mount (`.gdoc`, `.gsheet`) are JSON pointers — the actual content lives behind the API. Both components bridge that gap using rclone.

## What it does

- **Search** Drive by filename, vault by content (fuzzy), or both
- **Read** any Drive file or vault note via `gdrive://` and `vault://` resources
- **Pull** Drive files into the vault — download, convert (Docs → markdown, Sheets → CSV), and update sync state in one call
- **Section filter** — extract specific document sections by heading name or index
- **Discover vaults** — auto-detects all Obsidian vaults registered on the machine
- **Scope:** `drive.readonly` — no write access to Google Drive

## Prerequisites

- Node.js 18+
- [rclone](https://rclone.org/) (replaces GCP OAuth setup)
- Claude Code

## Setup

### Obsidian plugin

1. Install [rclone](https://rclone.org/install/) (`brew install rclone` on macOS)
2. Install the plugin in Obsidian
3. Open the g-command settings tab and click **Connect**
4. Sign in with Google in the browser window that opens

That's it. The plugin creates a read-only rclone remote and verifies the connection.

### MCP server (for Claude Code)

```bash
./setup.sh
```

The script builds the MCP server and registers it with Claude Code. If rclone isn't configured yet, it walks you through authentication.

If your rclone remote is already named something other than `gdrive`:

```bash
GDRIVE_RCLONE_REMOTE=my-remote ./setup.sh
```

### Manual MCP setup

1. `brew install rclone` (if not installed)
2. `cd src/gdrive && npm install && npm run build`
3. `claude mcp add vault node /absolute/path/to/src/gdrive/dist/index.js`

### Verify

Run `/mcp` in Claude Code — `vault` should appear as connected. Then try searching for a document by filename.

## Security notes

- No credentials are stored by this server — auth is managed entirely by rclone
- rclone token is stored at `~/.config/rclone/rclone.conf`
- `drive.readonly` scope limits blast radius if the token is compromised
- Server is a single auditable TypeScript file

## Configuration

| Env var | Default | Purpose |
|---------|---------|---------|
| `GDRIVE_RCLONE_REMOTE` | `gdrive` | rclone remote name to use |

## References

- [rclone Google Drive docs](https://rclone.org/drive/)
- [Claude Code MCP setup](https://docs.anthropic.com/en/docs/claude-code/mcp)
