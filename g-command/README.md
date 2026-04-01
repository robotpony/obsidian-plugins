# g-command

Read-only access to Google Docs, Sheets, and other Drive files from Claude Code.

Google Drive files on a local mount (`.gdoc`, `.gsheet`) are JSON pointers — the actual content lives behind the API. This MCP server bridges that gap: Claude Code can read a Google Doc as markdown or a Sheet as CSV without a manual export step.

## What it does

- **Search** your Drive by query (file name, content, type)
- **Read** any Drive file, auto-converted to a usable format:
  - Google Docs → Markdown
  - Google Sheets → CSV
  - Google Slides → plain text
  - Google Drawings → PNG
  - Everything else → native format
- **Scope:** `drive.readonly` — no write access

## Prerequisites

- Node.js 18+
- A Google Cloud project with the Drive API enabled
- Claude Code

## Setup

### 1. Get the server code

```bash
git clone https://github.com/modelcontextprotocol/servers-archived gdrive-mcp
cd gdrive-mcp/src/gdrive
npm install
npm run build
```

Forking the repo first is recommended — the original is archived.

### 2. Create GCP credentials

1. Create a project at [Google Cloud Console](https://console.cloud.google.com/)
2. Enable the **Google Drive API**
3. Create an **OAuth 2.0 Client ID** (Desktop app type)
4. Download the JSON credentials file
5. Save it to `~/.config/gdrive-mcp/gcp-oauth.json`

See [PLAN.md](PLAN.md) for the full walkthrough.

### 3. Authenticate

```bash
export GDRIVE_OAUTH_PATH=~/.config/gdrive-mcp/gcp-oauth.json
node dist/index.js auth
```

This opens a browser OAuth flow and saves a token to `.gdrive-server-credentials.json`.

### 4. Register with Claude Code

```bash
claude mcp add gdrive node /path/to/gdrive-mcp/src/gdrive/dist/index.js
```

Or add to `.claude/settings.json`:

```json
{
  "mcpServers": {
    "gdrive": {
      "command": "node",
      "args": ["/path/to/gdrive-mcp/src/gdrive/dist/index.js"],
      "env": {
        "GDRIVE_OAUTH_PATH": "~/.config/gdrive-mcp/gcp-oauth.json"
      }
    }
  }
}
```

### 5. Verify

Run `/mcp` in Claude Code. The `gdrive` server should appear as connected. Use the `search` tool to find a known document, then fetch it by ID to confirm markdown output.

## Security notes

- OAuth token is stored at `.gdrive-server-credentials.json` — keep it out of version control
- `drive.readonly` scope limits blast radius if credentials are compromised
- Server is a single auditable TypeScript file
- Pin dependencies after install (`npm audit`; lock versions in `package.json`)

## References

- [Archived server source](https://github.com/modelcontextprotocol/servers-archived/tree/main/src/gdrive)
- [Google Drive API docs](https://developers.google.com/drive/api/guides/about-sdk)
- [Claude Code MCP setup](https://docs.anthropic.com/en/docs/claude-code/mcp)
