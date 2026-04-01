# g-command

Read-only access to Google Docs, Sheets, and other Drive files from Claude Code.

Google Drive files on a local mount (`.gdoc`, `.gsheet`) are JSON pointers — the actual content lives behind the API. This MCP server bridges that gap: Claude Code can read a Google Doc or Sheet without a manual export step.

## What it does

- **Search** your Drive by filename (partial match)
- **Read** any Drive file, auto-converted:
  - Google Docs → plain text
  - Google Sheets → CSV
  - Google Slides → plain text
  - Everything else → native format
- **Scope:** `drive.readonly` — no write access

## Prerequisites

- Node.js 18+
- [rclone](https://rclone.org/) (replaces GCP OAuth setup)
- Claude Code

## Setup

```bash
./setup.sh
```

The script handles everything: installs rclone if needed, walks you through Google Drive authentication, builds the server, and registers it with Claude Code. You'll need to log into Google in a browser window — that's the only interactive step.

If your rclone remote is already named something other than `gdrive`:

```bash
GDRIVE_RCLONE_REMOTE=my-remote ./setup.sh
```

### Manual setup

If you prefer to do it step by step:

1. `brew install rclone`
2. `rclone config` — create a remote named `gdrive`, type `drive`, scope read-only
3. `cd src/gdrive && npm install && npm run build`
4. `claude mcp add gdrive node /absolute/path/to/src/gdrive/dist/index.js`

### Verify

Run `/mcp` in Claude Code — `gdrive` should appear as connected. Then try searching for a document by filename.

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
