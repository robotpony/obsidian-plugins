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

### 1. Install rclone

```bash
brew install rclone
```

### 2. Configure a Google Drive remote

```bash
rclone config
```

In the wizard:
1. `n` — new remote
2. Name: `gdrive` (must match — the server looks for this name)
3. Type: `drive`
4. Client ID / secret: leave blank (uses rclone's built-in credentials)
5. Scope: `2` (read-only)
6. Root folder ID, service account: leave blank
7. Advanced config: `n`
8. Auto config: `y` — browser opens, log in and grant access
9. Team drive: `n`

Verify it works:

```bash
rclone lsjson gdrive: --max-depth 1
```

You should see a JSON array of your Drive contents.

### 3. Build the server

```bash
cd src/gdrive
npm install
npm run build
```

### 4. Register with Claude Code

```bash
claude mcp add gdrive node /Users/you/writing/obsidian-plugins/g-command/src/gdrive/dist/index.js
```

Or add to `~/.claude/settings.json` (use absolute paths):

```json
{
  "mcpServers": {
    "gdrive": {
      "command": "node",
      "args": ["/Users/you/writing/obsidian-plugins/g-command/src/gdrive/dist/index.js"]
    }
  }
}
```

If your rclone remote is named something other than `gdrive`, set:

```json
"env": { "GDRIVE_RCLONE_REMOTE": "your-remote-name" }
```

### 5. Verify

Run `/mcp` in Claude Code. The `gdrive` server should appear as connected. Use the `search` tool to find a known document, then fetch it by path to confirm output.

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
