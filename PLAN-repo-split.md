# Repo split: plan

Splits this mono-repo into three standalone repos, one per plugin. Runs
after the four sidebar bugs in [warped-todo/BUGS.md](warped-todo/BUGS.md)
are fixed and shipped, so the split PR is a pure move-and-rename with no
behaviour change riding along.

## Decision

- **`obsidian-plugins`** (this repo) narrows to just the TODO/Projects
  plugin, renamed **`warped-command`**.
- **`warped-reference`** moves to its own repo and drops the Obsidian
  plugin surface, becoming a standalone CLI + MCP server. Its README
  already frames it as "two components in one package" (plugin + MCP
  server); this makes the MCP/CLI half the whole product.
- **`warped-hugo`** moves to its own repo, unchanged in scope — still an
  Obsidian plugin, just no longer sharing a repo with the other two.
- **Shared code** (`shared/`) is duplicated into each new repo rather than
  extracted into a package or submodule. Revisit only if drift becomes a
  real maintenance cost — for three small, single-maintainer plugins, a
  publish step or submodule sync is more process than the problem needs.
- **Git history starts fresh** in each new repo (single import commit).
  The old history stays browsable here if ever needed; `git filter-repo`
  per plugin is more setup than three personal-tooling repos justify.

## Open questions

- **`warped-command` plugin ID.** `manifest.json`'s `id` is currently
  `warped-todo`. Obsidian keys installed-plugin state (settings, enabled
  state) off that ID — changing it means existing installs see a new,
  disabled plugin rather than an upgrade, and old settings are orphaned.
  Decide: keep `id: "warped-todo"` internally and rename only the
  display name / repo / npm package to `warped-command` (no migration
  needed), or accept the migration cost for a clean rename. Recommend the
  former unless there's a reason the ID itself needs to change.
- **`warped-reference`'s CLI conversion is a product change, not a repo
  move.** Dropping the Obsidian plugin means deciding what happens to its
  vault-facing features (Drive→vault sync, `gdrive://`/`vault://`
  resources) that currently assume a running Obsidian instance. Worth its
  own scoping pass before or alongside the split, not something to design
  as a side effect of moving directories. Flagging here so it isn't
  silently bundled into "just a move."
- **New repo hosting**: same GitHub org/user (`robotpony`) as today,
  three new repos? Confirm before Phase 2 creates them.
- **Root-level tooling** (`install.sh`, root `CLAUDE.md`,
  `plugin-conventions.md`, root `README.md`) all assume a mono-repo with
  three plugin subdirectories. Once only `warped-command` remains,
  `install.sh`'s multi-plugin selection logic and vault-discovery flow
  either simplify to single-plugin or get removed in favour of a plain
  `npm run build`. Decide which during Phase 1.

## Phase 1: warped-command (this repo)

**Goal**: this repo ends up containing exactly one plugin, renamed, with
no leftover multi-plugin tooling.

- Resolve the plugin-ID open question above before touching `manifest.json`.
- Move `warped-todo/*` up to repo root (or keep the subdirectory if a
  single-plugin repo with a matching top-level structure reads better —
  match whatever `warped-hugo`'s new repo ends up looking like, for
  consistency across the three).
- Rename references: `manifest.json` `name`, `package.json` `name`,
  README, CHANGELOG header, GitHub repo name/description.
- Copy `shared/` into the plugin's own source tree; update relative
  imports (`../shared` → local path).
- Delete `warped-reference/` and `warped-hugo/` from this repo (their
  content lives on in the new repos created in Phases 2-3; nothing is
  lost, just not duplicated here).
- Simplify or remove `install.sh`'s multi-plugin/multi-vault selection
  logic per the open question above; update root `CLAUDE.md` to describe
  a single-plugin repo instead of a mono-repo.
- Verify: `npm run build` and `npm test` pass; a real Obsidian vault
  reinstall (uninstall old `warped-todo` folder, install renamed plugin)
  behaves identically to before the rename.

**Exit criteria**: this repo builds, tests pass, and installs cleanly as
`warped-command` with no dangling references to the two plugins that left.

## Phase 2: warped-hugo → new repo

**Goal**: `warped-hugo` exists as a standalone repo, functionally
unchanged.

- New repo (org/name per the open question above).
- Copy `warped-hugo/*` in as the repo root; copy `shared/` into its own
  source tree, update imports.
- Single "initial import" commit; no history migration.
- Update `manifest.json`/`package.json`/README/CHANGELOG to drop any
  mono-repo-relative references (e.g. links back to root `CLAUDE.md` or
  `plugin-conventions.md` that no longer resolve).
- Verify: `npm run build` passes; a real vault install behaves
  identically to the copy still in this repo, before this repo's copy is
  deleted in Phase 1.

**Exit criteria**: new repo builds and installs standalone; nothing in it
still points back at `obsidian-plugins`.

## Phase 3: warped-reference → new repo, CLI/MCP-first

**Goal**: `warped-reference` exists as a standalone repo. Scope for
"drops the Obsidian plugin" depends on the open question above being
resolved first — this phase is the mechanical move; the product scoping
is prerequisite work, not part of this phase's exit criteria.

- New repo (org/name per the open question above).
- Copy `warped-reference/*` in as the repo root; copy `shared/` into its
  own source tree if the CLI/MCP server still uses any of it (Notice/
  SidebarManager are Obsidian-specific — likely nothing survives the cut,
  worth confirming rather than assuming).
- Single "initial import" commit; no history migration.
- Apply whatever the CLI-conversion scoping decided (Obsidian plugin
  code removed or kept behind a flag, README rewritten to lead with the
  CLI/MCP server rather than the plugin).
- Verify: MCP server still runs standalone (`npm test` plus a manual
  Claude Code MCP connection check); any retained CLI commands work
  against a real Drive-mounted folder.

**Exit criteria**: new repo's primary documented entry point is the CLI/
MCP server, not an Obsidian plugin install step.

## Cross-cutting

- Do the three phases as separate PRs/commits in their respective repos,
  not one giant multi-repo commit — each phase has its own exit criteria
  and should be verifiable independently.
- `shared/` duplication means a future fix to, say, `createNoticeFactory`
  has to be applied in up to three places by hand. Worth a one-line note
  in each new repo's CLAUDE.md pointing at the other two, so a future you
  remembers where the siblings live.
