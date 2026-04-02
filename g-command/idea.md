Prototype project for #gdrive-mcp 

Read-only access to Google Docs, Sheets, and other Drive files from Claude Code, using the archived Anthropic reference MCP server.

## gdrive mcp #todo #p0 #focus 

- [ ] Create project and plan an approach + scope 
	- scope: read only
	- use case: use obsidian to think and ideate, using google docs as a source
	- write is not planned (or desired)


## Why

Google Docs files on the local Drive mount (`.gdoc`, `.gsheet`) are just JSON pointers — the content is only accessible via the API. This MCP server bridges that gap so Claude Code can read Google Docs as markdown, Sheets as CSV, and other files natively. Eliminates the manual File → Download → Markdown export step when pulling docs into obsidian.

## What the server does

- **Language:** TypeScript / Node.js
- **Source:** [modelcontextprotocol/servers-archived/src/gdrive](https://github.com/modelcontextprotocol/servers-archived/tree/main/src/gdrive)
- **Scope:** `drive.readonly` (read-only, no write access)
- **Tools exposed:** `search` (find files by query)
- **Resources exposed:** `gdrive:///<file_id>` — auto-converts:
  - Google Docs → Markdown
  - Google Sheets → CSV
  - Google Slides → plain text
  - Google Drawings → PNG
  - Other files → native format
- **Auth:** OAuth 2.0 via browser flow, credentials stored locally as `.gdrive-server-credentials.json`

## Steps

### 1. Fork the repo (Bruce, GitHub)

- Fork [modelcontextprotocol/servers-archived](https://github.com/modelcontextprotocol/servers-archived) to your GitHub account
- Or: just clone it locally and extract the `src/gdrive` directory into its own repo (cleaner, since you only need one server from the archive)

### 2. Create a GCP OAuth project (Bruce, Google Cloud Console)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (e.g., `claude-gdrive-mcp`)
3. Enable the **Google Drive API** under APIs & Services
4. Configure the **OAuth consent screen**
   - User type: Internal (if using a Workspace account) or External
   - App name: something like "Claude Drive Reader"
   - Scopes: add `https://www.googleapis.com/auth/drive.readonly`
5. Create **OAuth 2.0 Client ID** credentials
   - Application type: Desktop app
   - Download the JSON credentials file
6. Save the credentials file somewhere safe (e.g., `~/.config/gdrive-mcp/gcp-oauth.json`)

### 3. Build and test the server locally (Bruce, terminal)

```bash
# Clone your fork / extract the gdrive directory
cd ~/Projects  # or wherever you keep tools
git clone <your-fork-url> gdrive-mcp
cd gdrive-mcp/src/gdrive

# Install dependencies
npm install

# Build
npm run build

# Authenticate (opens browser for OAuth flow)
# Set environment variables for your OAuth credentials first:
export GDRIVE_OAUTH_PATH=~/.config/gdrive-mcp/gcp-oauth.json
node dist/index.js auth

# Credentials saved to .gdrive-server-credentials.json
```

### 4. Register with Claude Code (Bruce, terminal)

```bash
claude mcp add gdrive node /path/to/gdrive-mcp/src/gdrive/dist/index.js
```

Or add to `.claude/settings.json` manually:

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

### 5. Verify in Claude Code

```
/mcp
```

Should show `gdrive` as a connected server. Then test:
- Search: use the `search` tool to find a known doc
- Read: fetch a doc by ID and confirm it returns markdown

### 6. Lock it down

- **Pin dependencies** in `package.json` to prevent supply chain issues on future `npm install`
- **Review the code** — `index.ts` is a single file, should be quick to audit
- **Scope check:** confirm the OAuth token only has `drive.readonly`
- **Credential hygiene:** add `.gdrive-server-credentials.json` to `.gitignore` if not already there

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Archived / unmaintained code | Single-file server, easy to maintain yourself. Pin deps. |
| OAuth token stored on disk | `drive.readonly` scope limits blast radius. Standard for GCP desktop apps. |
| Dependency vulnerabilities | Run `npm audit` after install. Pin versions. |
| Server could be modified upstream | Fork it — you control the code. |

## Nice-to-haves (later)

- **`.gdoc` resolver:** read local Drive mount stubs, extract `resource_id`, sync that specific file — closing the loop without browsing
- **`/gdoc-pull` skill:** Claude Code skill that takes a doc name, searches Drive via MCP server, writes markdown into the vault
- **Sheets workflow:** render CSV as a table preview in an Obsidian leaf
- **Open in browser:** right-click synced file → open source Doc in browser using `google_document` frontmatter field

## References

- [Archived server source](https://github.com/modelcontextprotocol/servers-archived/tree/main/src/gdrive)
- [Google Drive API docs](https://developers.google.com/drive/api/guides/about-sdk)
- [GCP OAuth setup guide](https://developers.google.com/identity/protocols/oauth2)
- [Claude Code MCP setup](https://docs.anthropic.com/en/docs/claude-code/mcp)
