# Changelog

## 1.0.0 — 2026-03-31

Initial release.

Replaced the original GCP OAuth approach (googleapis + @google-cloud/local-auth) with rclone as the auth and transport layer. No GCP project or OAuth consent screen required; users authenticate once via `rclone config`.

**Changes:**
- Rewrote `src/gdrive/index.ts` to use `child_process.execFile` rclone calls
- Removed `googleapis` and `@google-cloud/local-auth` dependencies
- Fixed `tsconfig.json` — made standalone (removed broken extends reference)
- Updated `package.json`: new name (`g-command-gdrive`), version `1.0.0`
- Added `setup.sh` — handles rclone install, Drive auth, build, and Claude Code registration
- Updated `README.md` and `ARCHITECTURE.md` to document rclone setup
- Upgraded `@modelcontextprotocol/sdk` 1.0.1 → 1.29.0 (fixes ReDoS + DNS rebinding vulns)
- Pinned all dependencies to exact versions; `npm audit` clean
- Added `g-command/src/gdrive/dist/` to root `.gitignore`
- Verified: server connects, Drive root lists 18 items, registered in Claude Code

**Limitations vs. original:**
- Filename search only (no full-text content search)
- Google Docs export as plain text, not markdown
