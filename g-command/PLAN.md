# Plan

Scope: get the server running locally and registered with Claude Code. Read-only. No new features until the basics work.

Auth approach changed from direct GCP OAuth to rclone. See ARCHITECTURE.md for the rationale.

## Status

- [x] Step 1: Fork and extract the server — `src/gdrive/` added with `index.ts`, `package.json`, `tsconfig.json`, `Dockerfile`
- [x] Step 2: Switch auth approach — rclone replaces GCP OAuth
- [ ] Step 3: Install rclone and configure the Drive remote  ← **you need to run this**
- [x] Step 4: Rewrite `index.ts` to use rclone subprocesses
- [x] Step 5: Build — passes (`npm run build` clean) ← register with Claude Code after Step 3
- [ ] Step 6: Verify and smoke test
- [ ] Step 7: Lock down dependencies

---

## Step 1: Fork the repo ✓

Done. `src/gdrive/` was copied from `modelcontextprotocol/servers-archived` into this repo.

## Step 2: Auth approach ✓

Decision: use rclone instead of creating a GCP project. The original `index.ts` used `googleapis` + `@google-cloud/local-auth`, which required a GCP OAuth app (client_id, client_secret, consent screen setup). rclone ships its own OAuth credentials, so the user only needs `rclone config` — no Console steps.

See ARCHITECTURE.md for the full trade-off analysis.

## Step 3: Install rclone and configure Drive remote

```bash
brew install rclone
rclone config
```

In the config wizard:
1. `n` — new remote
2. Name: `gdrive` (must match — the MCP server will look for this remote name)
3. Type: `drive` (Google Drive)
4. Client ID: leave blank (uses rclone's built-in credentials)
5. Client secret: leave blank
6. Scope: `1` (full access) or `2` (read-only recommended)
7. Root folder ID: leave blank (accesses your entire Drive)
8. Service account file: leave blank
9. Advanced config: `n`
10. Auto config: `y` — browser opens, log in with your Google account, grant access
11. Team drive: `n` (unless needed)
12. Confirm: `y`

Verify it works:

```bash
rclone lsjson gdrive: --max-depth 1
```

You should see a JSON array of files and folders from your Drive root. If you get an error, re-run `rclone config` and check the remote name is exactly `gdrive`.

## Step 4: Rewrite `index.ts`

Replace the current `googleapis`-based implementation with rclone subprocess calls.

### Key changes

**Remove:**
- `import { authenticate } from "@google-cloud/local-auth"`
- `import { google } from "googleapis"`
- `authenticateAndSaveCredentials()` function
- `loadCredentialsAndRunServer()` credential loading

**Add:**
- `import { execFile } from "child_process"` (built-in, no new dep)
- `runRclone(args: string[]): Promise<string>` — wrapper that runs `rclone` and returns stdout
- Startup check: verify `rclone lsjson gdrive: --max-depth 0` succeeds, exit with a clear error if not

**ListResources handler:**
```typescript
const output = await runRclone(["lsjson", "gdrive:", "--max-depth", "1"]);
const files = JSON.parse(output);
return {
  resources: files.map((f: any) => ({
    uri: `gdrive:///${f.Path}`,
    mimeType: f.MimeType,
    name: f.Name,
  })),
};
```

**ReadResource handler:**
```typescript
const filePath = request.params.uri.replace("gdrive:///", "");
const mimeType = /* detect from extension or prior lsjson */;
const args = ["cat"];
if (filePath.endsWith(".gdoc")) args.push("--drive-export-formats", "txt");
if (filePath.endsWith(".gsheet")) args.push("--drive-export-formats", "csv");
args.push(`gdrive:${filePath}`);
const content = await runRclone(args);
return { contents: [{ uri: request.params.uri, mimeType: "text/plain", text: content }] };
```

**Search tool handler:**
```typescript
const term = request.params.arguments?.query as string;
const output = await runRclone([
  "lsjson", "gdrive:",
  "--include", `*${term}*`,
  "--recursive",
  "--files-only",
]);
const files = JSON.parse(output);
const list = files.map((f: any) => `${f.Path} (${f.MimeType})`).join("\n");
return { content: [{ type: "text", text: `Found ${files.length} files:\n${list}` }] };
```

### Update `package.json`

Remove:
```json
"@google-cloud/local-auth": "^3.0.1",
"googleapis": "^144.0.0"
```

Nothing new to add — `child_process` is built into Node.

### Build

```bash
cd g-command/src/gdrive
npm install
npm run build
```

## Step 5: Register with Claude Code

```bash
claude mcp add gdrive node /Users/mx/writing/obsidian-plugins/g-command/src/gdrive/dist/index.js
```

Or add manually to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "gdrive": {
      "command": "node",
      "args": ["/Users/mx/writing/obsidian-plugins/g-command/src/gdrive/dist/index.js"]
    }
  }
}
```

No env vars needed — rclone reads its token from `~/.config/rclone/rclone.conf` automatically.

## Step 6: Verify

In Claude Code:

```
/mcp
```

`gdrive` should appear as connected.

Smoke tests:
1. List resources — you should see Drive files in the response
2. Search for a known filename — confirm results come back
3. Read a Google Doc by path — confirm you get plain text content

## Step 7: Lock it down

- Pin `@modelcontextprotocol/sdk` to an exact version in `package.json`
- Run `npm audit` and resolve anything high or critical
- Confirm rclone scope is read-only (`drive.readonly`) — check during `rclone config` or re-run config to verify
- Ensure `dist/` is in `.gitignore` if it isn't already

## Risks

| Risk | Mitigation |
|------|------------|
| rclone not in PATH when Claude Code spawns the server | Add startup check; fail with clear message pointing to `brew install rclone` |
| rclone remote named differently | Make remote name configurable via `GDRIVE_RCLONE_REMOTE` env var, default to `gdrive` |
| rclone token expires | rclone handles refresh automatically — not a concern |
| Filename search misses files | Known limitation; document it and consider path browsing as the primary workflow |
| Google Workspace files look like stubs in local mount | Server uses rclone, not the local mount — not an issue |

## Nice-to-haves (post-MVP)

These are out of scope until the server is working reliably:

- **`.gdoc` resolver:** read a local Drive mount stub, extract `resource_id` from the JSON, fetch via rclone — no more typing file paths manually
- **`/gdoc-pull` skill:** Claude Code skill that takes a doc name, searches Drive, writes the text output into the Obsidian vault
- **Sheets workflow:** assess whether CSV output is useful enough to build around
- **Markdown export:** if plain text proves insufficient, reintroduce `googleapis` using the rclone token as the auth source (avoids GCP setup while regaining markdown export)
