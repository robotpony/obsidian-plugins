# Libraries: Claude Helpers

Claude Helpers adds no new npm dependencies. All required capabilities are available through Node.js built-ins and the existing Obsidian plugin API.

---

## Node.js built-ins used

| Module | Usage |
|--------|-------|
| `fs` / `fs/promises` | Write skill/rule files to `~/.claude/`, read vault overrides, read/write manifest |
| `path` | Construct `~/.claude/skills/<name>.md` paths platform-correctly |
| `os` | `os.homedir()` to resolve `~` without shell expansion |
| `crypto` | `crypto.createHash('sha256')` for content hashing in manifest (delta sync) |

All four are available in Node.js 18+ without installation. Obsidian (Electron-based) bundles Node.js 18.

---

## Existing dependencies (no change)

| Package | Already used for | Continues to serve |
|---------|-----------------|-------------------|
| `obsidian` | Plugin API, ItemView, settings | Commands, notices, app.vault.getRoot() |

---

## Why no new dependencies

**No markdown parser needed.** Skill files are written verbatim from string constants or vault files. No parsing is required on the write path.

**No YAML library needed.** The context file (`warped-obsidian.md`) is assembled from template strings, not serialized from a data structure. The frontmatter block is a fixed-format header.

**No file-watching library needed.** Sync is triggered explicitly by the user ("Sync Claude Helpers" command). There is no live file watcher.

**No template engine needed.** The context file has conditional sections (Hugo conventions appear only if warped-hugo is installed) handled with simple string concatenation and if-statements.

---

## Future dependency consideration

If vault override detection is later extended to watch `<vault>/.claude/` for changes and auto-sync, Obsidian's built-in `app.vault.on("modify", ...)` event is sufficient — no external watcher library needed.

If skill files grow complex enough to warrant a template language, `mustache` (1.6 kB minified, zero dependencies) would be the minimal choice. Not needed for v1.
