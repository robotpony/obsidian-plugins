# Repo split: plan

Splits this mono-repo into three standalone repos, one per plugin. Runs
after the four sidebar bugs (fixed and pushed 2026-08-17) in what was
`warped-todo/BUGS.md`, now `BUGS.md` at the repo root post-Phase-1a. The
split itself is a pure move-and-rename with no behaviour change riding
along.

**Phase 1a is done** (2026-08-17) — see its section below for what
actually happened, including two conflicts surfaced and resolved during
execution that aren't reflected in the original plan text above.

## Decisions

Resolved through review — nothing below is still open:

- **`obsidian-plugins`** (this repo) narrows to just the TODO/Projects
  plugin. GitHub repo, npm package, and Obsidian's manifest display name
  all rename to **`warped-command`** / **"Warped Command"**.
  `manifest.json`'s **`id` stays `"warped-todo"`** — Obsidian keys
  installed-plugin state (settings, enabled state) off `id`, and changing
  it would orphan existing installs. The rename is everywhere *except*
  that one field.
- **`warped-hugo`** moves to its own repo, same name, unchanged in scope —
  still an Obsidian plugin, just no longer sharing a repo with the other
  two. No rename: its scope isn't changing, unlike the other two.
- **`warped-reference`**'s repo and npm package rename to
  **`warped-gdrive`** now (Phase 3). Its Obsidian `manifest.json`
  (`id: "warped-reference"`, display name `"Warped Reference"`) stays
  exactly as-is through Phase 3 — renaming a plugin surface that Phase 4
  might remove entirely would be wasted work. The CLI/MCP-first product
  conversion (dropping the Obsidian plugin, or not) is scoped separately
  in Phase 4, not assumed here.
- **`␣⌘ Space Command` branding stays untouched** — CHANGELOG.md's intro
  line, DESIGN.md's title, and the About modal keep referring to Space
  Command. That's the product's internal nickname, separate from
  `manifest.json`'s formal `name` field.
- **Repo layout: flat.** Plugin files (`main.ts`, `src/`, `manifest.json`,
  etc.) live at each new repo's root, not nested in a subdirectory —
  standard for a single-purpose Obsidian plugin repo, and consistent
  across all three.
- **Versions continue, they don't reset.** `warped-command` starts at
  `0.35.0` (or the next bump when Phase 1 actually ships), `warped-hugo`
  stays at `0.8.0`, `warped-gdrive` stays at `1.14.0`. The split is a
  move, not a restart.
- **Hosting**: same GitHub account as today, `robotpony`, for all three
  repos.
- **Registry**: none of the three are listed in Obsidian's community
  plugin registry — confirmed, so repo renames/moves have no
  update-mechanism fallout. All installs are manual, via `install.sh`.
- **Shared code** (`shared/`) is duplicated into each new repo rather than
  extracted into a package or submodule. Revisit only if drift becomes a
  real maintenance cost.
- **Git history**: `warped-command` keeps this repo's existing history
  (it's a rename-in-place, not a fresh clone). `warped-hugo` and
  `warped-gdrive` start fresh in their new repos (single import commit) —
  their old history stays browsable here if ever needed.
- **`install.sh`** simplifies to single-plugin once only `warped-command`
  remains here — drops the plugin picker (nothing left to pick between)
  but keeps vault discovery/caching and the copy-to-vault step, since that
  convenience still matters with one plugin.

## Execution order

Phase 1 is split into two parts because part of it (deleting the other
two plugins' directories) is only safe once their replacements exist.
Real order: **1a → 2 → 3 → 1b**. Phase 4 is unscoped and comes whenever
you're ready to design it — no dependency on 1b beyond `warped-gdrive`
existing as a repo.

## Phase 1a: rename this repo to warped-command — done (2026-08-17)

**Goal**: this repo's own plugin is fully renamed and cleaned up. Doesn't
touch `warped-reference/` or `warped-hugo/` yet — safe to run anytime,
independent of Phases 2/3.

**Two conflicts surfaced during execution, both resolved before touching
any files** (not anticipated by the plan text above):

1. An untracked root `package.json` (`name: "warped-command"`, swept into
   the "Bug fixes." commit by `git add`) and — much more substantially —
   the existing root `README.md`, titled "Warped Command" since commit
   `87711c6` (May 9, 2026), framed the whole three-plugin mono-repo as one
   suite under that name. Both predated this plan and directly conflicted
   with "warped-command" becoming just the TODO plugin's new identity.
   Resolved: drop the umbrella-brand framing entirely: `warped-command`
   becomes the TODO/Projects plugin as planned, and the suite-level
   README content (feature write-ups for Hugo and Reference) isn't
   preserved elsewhere — each plugin's own README already covers its own
   features.
2. `tsconfig.json`'s `include` (`**/*.ts`) and `vitest.config.mjs`'s
   default test discovery, once `warped-todo/*` moved to the repo root,
   started also picking up `warped-hugo/` and (worse) silently running
   `warped-reference/`'s 6-file test suite under this repo's vitest
   config rather than its own. Fixed with explicit `exclude` entries for
   `warped-hugo`/`warped-reference` in both configs — **temporary**,
   remove them as part of Phase 1b once those directories are deleted.

**What was done**:

- GitHub repo `obsidian-plugins` → `warped-command` (via `gh repo rename`;
  local `origin` remote updated automatically). Repo description updated
  to match.
- `package.json` `name` → `warped-command`; `manifest.json` `name` →
  `"Warped Command"` (`id` stayed `"warped-todo"`); `authorUrl` updated to
  the new repo URL.
- `warped-todo/*` moved to the repo root via `git mv` (preserved as
  renames in history, not delete+add) — flat layout, as decided.
- `shared/` copied into `src/shared/`; `main.ts` and `src/utils.ts`'s
  relative imports updated (`../shared`/`../../shared` → `./src/shared`/
  `./shared`); `vitest.config.mjs`'s test-stub alias updated to match.
- `install.sh` simplified: dropped plugin selection/discovery entirely
  (reads the one plugin's `id`/`name` straight from `manifest.json` now,
  rather than deriving a name from a directory listing); kept vault
  discovery, `-p`/`--previous` caching, and the build+copy steps.
  Verified against 4 real cached vaults — builds, installs correctly to
  `.obsidian/plugins/warped-todo/` (the unchanged `id`), display name
  shows "Warped Command".
- `CLAUDE.md`: merged (root's mono-repo version retired, the plugin's own
  promoted in its place); added back the `install.sh` usage block the old
  root version had; fixed two pre-existing stale references unrelated to
  this split (`SpaceCommandSettings`/`SpaceCommandSettingTab` → the
  actual current names, `WarpedTodoSettings`/`WarpedTodoSettingTab` — a
  historical rename, per `CHANGELOG.md`, that this file never picked up);
  re-added the `plugin-conventions.md` link.
- `plugin-conventions.md`: kept (507 lines of still-useful sidebar/CSS/TS
  convention reference), lightly edited — dropped the cross-plugin
  branding-colour registry (`hugo-command`, `notate-command` rows) and
  reframed the intro as single-plugin-scoped rather than "all plugins in
  this repo."
- Not done, out of scope for this phase: renaming internal TypeScript
  identifiers (`WarpedTodoPlugin`, `WarpedTodoSettingTab`,
  `WarpedTodoSettings`) to match `WarpedCommand*`. Purely internal, not
  user-visible, touches many files — a separate cleanup task if wanted,
  not implied by "rename everywhere" (which was scoped to what users see
  and the repo/package identity).
- `npm run build` and `npm test` both pass (239 tests).

**Exit criteria — met**: this repo builds, tests pass, and installs
cleanly as `warped-command` with the old `warped-todo` plugin id
preserved (verified against 4 real vaults). `warped-reference/` and
`warped-hugo/` still exist here, untouched, pending Phases 2/3.

## Phase 2: warped-hugo → new repo

**Goal**: `warped-hugo` exists as a standalone repo, functionally
unchanged.

- New repo `robotpony/warped-hugo`, flat layout.
- Copy `warped-hugo/*` in as the repo root; copy `shared/` into its own
  source tree, update imports.
- Single "initial import" commit; no history migration. Version stays
  `0.8.0`.
- Update `manifest.json`/`package.json`/README/CHANGELOG to drop any
  mono-repo-relative references (e.g. links back to root `CLAUDE.md` or
  `plugin-conventions.md` that no longer resolve).
- Verify: `npm run build` passes; a real vault install behaves
  identically to the copy still in this repo, before this repo's copy is
  deleted in Phase 1b.

**Exit criteria**: new repo builds and installs standalone; nothing in it
still points back at `obsidian-plugins`.

## Phase 3: warped-reference → warped-gdrive, mechanical move only

**Goal**: `warped-reference` exists as a standalone repo named
`warped-gdrive`, functionally unchanged — the Obsidian plugin ships
as-is. CLI/MCP-first product scoping is explicitly **not** part of this
phase; see Phase 4.

- New repo `robotpony/warped-gdrive`, flat layout.
- Rename `package.json` `name` → `warped-gdrive`. **Leave
  `manifest.json` untouched** (`id: "warped-reference"`, `name: "Warped
  Reference"`) — Phase 4 decides whether/how that changes.
- Copy `warped-reference/*` in as the repo root; copy `shared/` into its
  own source tree only if the code actually still imports from it after
  the move (`Notice`/`SidebarManager` are Obsidian-specific — likely
  nothing survives the cut for the MCP server half; confirm rather than
  assume when doing this step).
- Single "initial import" commit; no history migration. Version stays
  `1.14.0`.
- Update README/CHANGELOG to drop mono-repo-relative references, but
  don't rewrite the README's framing yet — that's Phase 4's job.
- Verify: `npm run build`/`npm test` pass; the MCP server still runs
  standalone; the Obsidian plugin half still installs and works exactly
  as it does in this repo today.

**Exit criteria**: `warped-gdrive` repo builds, tests pass, and both
halves (Obsidian plugin + MCP server) work exactly as they did in
`obsidian-plugins/warped-reference/` — no functional change, just a new
home and a new repo/package name.

## Phase 4: CLI/MCP-first conversion for warped-gdrive (unscoped)

**Goal**: not yet designed. Placeholder so this plan stays a complete map
of the work, even though the phase itself needs its own scoping pass
before it can be planned like Phases 1-3.

**What it needs to answer**, at minimum:
- What happens to `warped-gdrive`'s vault-facing features (Drive→vault
  sync, `gdrive://`/`vault://` resources) that currently assume a running
  Obsidian instance — ported to work headless, dropped, or kept
  Obsidian-only while the CLI/MCP server becomes the primary documented
  surface alongside it?
- Does the Obsidian plugin get removed, kept as a secondary feature, or
  something in between?
- Does `manifest.json`'s `id`/`name` change at that point (from
  `warped-reference`/"Warped Reference" to something matching
  `warped-gdrive`), and if the plugin is being removed entirely, does
  that question even still apply?
- README rewrite to lead with the CLI/MCP server, once the above is
  settled.

Not scheduled — scope this in its own session when it's time to pick it
up.

## Cross-cutting

- Do 1a, 2, 3, and 1b as separate commits/PRs, not one giant change —
  each has its own exit criteria and should be verifiable independently.
- `shared/` duplication means a future fix to, say, `createNoticeFactory`
  has to be applied in up to three places by hand. Worth a one-line note
  in each new repo's CLAUDE.md pointing at the other two, so a future you
  remembers where the siblings live.
