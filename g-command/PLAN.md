# Plan

Scope: get the server running locally and registered with Claude Code. Read-only. No new features until the basics work.

## Status

- [ ] Step 1: Fork and extract the server
- [ ] Step 2: Create GCP project and credentials
- [ ] Step 3: Build and authenticate locally
- [ ] Step 4: Register with Claude Code
- [ ] Step 5: Verify and smoke test
- [ ] Step 6: Lock down dependencies and credentials

---

## Step 1: Fork the repo

Options:

- **Fork** `modelcontextprotocol/servers-archived` to your GitHub account, then clone your fork
- **Or:** clone the original locally and copy `src/gdrive` into its own repo

The second option is cleaner — you only need one server from that archive and it avoids carrying the rest of the mono-repo. Either way, you control the code going forward (the original is archived and won't receive updates).

```bash
git clone <your-fork-or-copy> gdrive-mcp
```

## Step 2: Create a GCP OAuth project

Do this in [Google Cloud Console](https://console.cloud.google.com/).

1. Create a new project — name it something like `claude-gdrive-mcp`
2. Go to **APIs & Services → Library**, search for **Google Drive API**, enable it
3. Go to **APIs & Services → OAuth consent screen**
   - User type: **Internal** (Workspace) or **External** (personal account)
   - App name: `Claude Drive Reader` (or whatever)
   - Scopes: add `https://www.googleapis.com/auth/drive.readonly`
4. Go to **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
   - Application type: **Desktop app**
   - Download the JSON file
5. Save it:

```bash
mkdir -p ~/.config/gdrive-mcp
mv ~/Downloads/client_secret_*.json ~/.config/gdrive-mcp/gcp-oauth.json
```

## Step 3: Build and authenticate

```bash
cd gdrive-mcp/src/gdrive
npm install
npm run build

# Authenticate
export GDRIVE_OAUTH_PATH=~/.config/gdrive-mcp/gcp-oauth.json
node dist/index.js auth
```

The auth command opens a browser. Log in, grant access, and the token is saved to `.gdrive-server-credentials.json` in the current directory.

## Step 4: Register with Claude Code

```bash
claude mcp add gdrive node /absolute/path/to/gdrive-mcp/src/gdrive/dist/index.js
```

Use an absolute path — relative paths break when Claude Code is launched from a different directory.

Or add manually to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "gdrive": {
      "command": "node",
      "args": ["/absolute/path/to/gdrive-mcp/src/gdrive/dist/index.js"],
      "env": {
        "GDRIVE_OAUTH_PATH": "~/.config/gdrive-mcp/gcp-oauth.json"
      }
    }
  }
}
```

## Step 5: Verify

In Claude Code:

```
/mcp
```

`gdrive` should appear as connected. If it doesn't, check the server path and run the node command manually to see the error.

Smoke test:
1. Use the `search` tool with a query matching a known doc title — confirm you get results
2. Fetch the doc by ID — confirm you get markdown back, not a pointer or error

## Step 6: Lock it down

Before treating this as stable:

- **Pin dependencies:** update `package.json` to use exact versions (`1.2.3` not `^1.2.3`)
- **Audit:** run `npm audit` and resolve anything high or critical
- **Verify scope:** confirm the saved token only has `drive.readonly`
- **Gitignore:** ensure `.gdrive-server-credentials.json` is in `.gitignore`
- **Code review:** `index.ts` is a single file — worth a quick read to understand what it's doing

## Risks

| Risk | Mitigation |
|------|------------|
| Archived / unmaintained upstream | Fork it. Single file, easy to own. Pin deps. |
| OAuth token on disk | `drive.readonly` limits damage. Standard desktop app pattern. |
| Dependency vulnerabilities | `npm audit` after install. Pin versions. |
| Upstream modified before you fork | Fork early. Review `index.ts` before running. |

## Nice-to-haves (post-MVP)

These are out of scope until the server is working reliably:

- **`.gdoc` resolver:** read a local Drive mount file, extract `doc_id` from the JSON pointer, fetch via MCP — no more copy-pasting file IDs
- **`/gdoc-pull` skill:** Claude Code skill that takes a doc name, searches Drive, and writes the markdown into the Obsidian vault
- **Sheets workflow:** assess whether CSV output is useful enough to build around (e.g. pulling reference data into notes)
