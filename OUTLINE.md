# Projects: outline

Spec for a Projects capability added to warped-todo. See
[IDEAS.md](IDEAS.md) for the options considered and why we landed here.

> **Superseded in one respect**: this outline (and its mockups below)
> describe items rendered into a delimited `<!-- warped-todo:sync:start -->`
> block inside the project note. That was built, then removed after live
> testing found it caused a content-flicker loop and, combined with a
> separate runaway-sync bug, crashed Obsidian — see PLAN.md's round-4
> write-up. Items now live only in the Projects sidebar, read from an
> in-memory cache; the note carries frontmatter only. Left as-is below for
> the historical record of the original design; DESIGN.md reflects what's
> actually built.

## Summary

warped-todo gets a second sidebar, Projects, alongside the existing TODOs
sidebar. Point it at a base folder of git repos; it finds every repo, keeps
a synced vault note per project (repo facts plus `#todo`/`#idea`/`#bug`
items pulled from each repo's structured files, explicit tags or a
filename-based default), and keeps that note live as the repo changes on
disk. TODOs and ideas from project notes show up in the existing TODOs
sidebar too, using the same rules already applied to vault-native items.
Desktop only.

## Problem

Work in progress lives in two disconnected places: task tags scattered
across git repos on disk (`BUGS.md`, `TODO.md`, `IDEAS.md`), and vault notes
in Obsidian. There's no single place to see what's open across every
project, and no way to act on a repo's TODO from inside Obsidian without
opening a terminal or editor pointed at that repo.

## Solution

### Platform

The whole plugin becomes `isDesktopOnly: true` in `manifest.json` (it's
currently `false`). `ProjectScanner` and `ProjectSyncManager` need Node
`fs`/`child_process`, which don't exist on mobile; development tooling in
this repo is already desktop-only, so there's no need for a
`Platform.isDesktopApp` feature gate to keep a mobile-compatible subset
alive.

### Reconciled with the existing ProjectManager

warped-todo already has a `ProjectManager`: tag-based project grouping (any
non-lifecycle hashtag), each with its own vault note
(`projectsFolder + tag + ".md"`, created on demand via `openProjectFile`,
no frontmatter, no delimited sections). This predates the git-repo concept
and would collide with it on name and file location if left unreconciled.

A repo's folder name becomes its project tag. `ProjectManager.getProjects()`
merges tag-derived `ProjectInfo` (today's behaviour, unchanged for projects
with no matching repo) with `ProjectScanner` output for any tag that
matches a detected repo. The synced note is the *same file*
`ProjectManager` already owns and creates, reusing the existing
`projectsFolder` setting, not a new location.

Sync only owns two parts of that file: the frontmatter keys it manages
(`project`, `repo`, `remote`, `branch`, `gitStatus`, `lastSynced`,
merged into whatever frontmatter already exists rather than replacing it
wholesale) and a delimited block
(`<!-- warped-todo:sync:start -->` … `<!-- warped-todo:sync:end -->`)
holding the parsed items. Everything else in the file, including the
`## Overview` section from today's template, is left untouched on every
sync. `createProjectFile`'s template gains frontmatter and the delimited
block, guarded so plain tag-only projects (no matching repo) still get
today's simpler template.

### New components (`src/`, `warped-todo/src/` before Phase 1a flattened this repo)

| File | Purpose |
|------|---------|
| `ProjectScanner.ts` | Recursively walks the configured base folder for git repos. A directory counts as a project when it has a `.git` **directory** (not a `.git` file, which marks a submodule or worktree checkout — those are skipped as projects, but the scanner keeps recursing past them to find real repos nested deeper). Once a directory-`.git` repo is found, the walk stops recursing into it — a repo's own working tree isn't scanned for further nested projects, so an incidental clone vendored inside one repo doesn't surface as a top-level project of its own. For each project, shells to `git` (`child_process`, via `execFile` — same pattern `DriveProvider.ts` already uses for `rclone`) for branch, status, and remote URL. Applies default excludes (`node_modules`, `dist`, `build`) and a configurable depth cap (default 3). |
| `ProjectSyncManager.ts` | For each detected project: ensures a vault note exists at `projectFilePath()` (extracted from `ProjectManager`, not the interactive `createProjectFile()` — see PLAN.md's Phase 4 notes), merges frontmatter and rewrites the delimited sync block from `ProjectScanner` output and parsed items, leaving the rest of the file alone. Owns a single recursive `fs.watch` on the base folder (macOS/Windows support recursive watch natively; catches new/removed repos and structured-file edits in one watcher rather than one per file) and exposes `syncAll()` as the manual "Sync projects" entry point. |
| `ProjectsSidebarView.ts` | New `ItemView`: project list with filter box, git status indicator, open/total counts per item type, link to the vault note. |

### Extended components

| File | Change |
|------|--------|
| `TodoScanner.ts` | Item scanning extended to also run against each project's structured files (`BUGS.md`, `TODO.md`, `TODOS.md`, `IDEAS.md`, `ISSUES.md`), using the contextual-default parsing described below rather than requiring explicit tags on every line. |
| `TodoProcessor.ts` | `TodoItem` gains an optional `sourceFile` (absolute path outside the vault). When set, mutations (complete, edit, priority change) write to that file via Node `fs` instead of the Obsidian vault API. **Spike this first** (see Implementation order) to confirm line-anchored writes stay stable across concurrent edits, e.g. a commit landing mid-mutation. |
| `ProjectManager.ts` | `getProjects()` merges tag-derived and repo-derived `ProjectInfo`. `createProjectFile()` gains the frontmatter + delimited-block template for repo-matched projects. |
| `types.ts` | `TodoItem.sourceFile?: string`. `ProjectInfo` gains `localPath`, `remote`, `branch`, `gitStatus`, `lastSynced` (all optional — absent for tag-only projects with no matching repo). |
| `main.ts` | Registers `ProjectScanner`, `ProjectSyncManager`, `ProjectsSidebarView`; adds Projects-related settings and commands. |
| Settings tab | Base folder path (external filesystem path, distinct from the vault's `projectsFolder`), exclude list, scan depth (default 3). No new vault-side folder/filename setting — reuses `projectsFolder` already exposed for `ProjectManager`. |

### Structured-file parsing (contextual defaults)

Requiring every line in every repo's `BUGS.md`/`TODO.md`/`IDEAS.md` to
already carry an explicit `#todo`/`#idea`/`#bug` tag before the plugin
finds anything is a bad first-run experience; almost no existing file
qualifies, including this repo's own `BUGS.md` (`warped-todo/BUGS.md`
before Phase 1a). Instead, each
recognized filename carries a default item type, and untagged content is
attributed to that default. An explicit tag on a line always wins over the
filename default (e.g. an `#idea` noted inline in `BUGS.md` stays an idea).

**Filename → default type:**

| Filename | Default type |
|----------|---------------|
| `BUGS.md`, `ISSUES.md` | `bug` |
| `TODO.md`, `TODOS.md` | `todo` |
| `IDEAS.md` | `idea` |

**Item boundaries** — two shapes, selected by whether the file has any `###` headings (checked first, since it's the less ambiguous signal — see below):

1. **Header-per-item reports**: if the file has any `###` heading, each one nested under a recognized `##` status section is one item, and flat-list parsing is skipped entirely for the whole file. A `##` counts as a pure status section only if it's little more than the status word itself (`Open`, `Completed ✓`); a `##` with a real title that happens to mention its own status (`## Issue: widget crashes ✅ RESOLVED`) is an item in its own right instead, and its `###` children are body text, not further items — needed once real data (`peep/ISSUES.md`) showed the loose version exploding one issue into 8 fake items. Recognized status words: `Open`/`Todo`/`Active`/`Future`/`Enhancement` → open, `Fixed`/`Resolved`/`Completed`/`Done`/`Closed` → closed. Covers files like this repo's own `BUGS.md`, where each bug is a prose write-up under `## Open`.
2. **Flat list items**: only used when the file has no `###` headings at all. Top-level bullet or checkbox lines (`- ...`, `- [ ] ...`), one item per line, default-typed by filename unless the line already has an explicit tag. This covers files like `peep/TODO.md`.

`###` presence decides first rather than "no top-level list items exist" (the original rule): a prose write-up can easily contain an incidental `-` list inside one item's body (a root-cause breakdown, for instance — this repo's actual `BUGS.md` does exactly that) without being a flat-list file. Checking for bullets first would silently misparse the whole file as a couple of random bullet fragments instead of the real `###` items. Found during Phase 3 implementation testing against the real file — see PLAN.md.

If neither shape matches, the file contributes nothing; it's not silently
guessed at line-by-line.

### Data flow

1. **Discover**: `ProjectScanner` walks the base folder, finds repos, reads git facts per repo.
2. **Parse**: `TodoScanner` reads each repo's structured files for tagged items, same as it reads vault files today.
3. **Sync**: `ProjectSyncManager` finds or creates the vault note via `ProjectManager.getProjectFilePath()`, merges frontmatter keys from step 1, and rewrites only the `<!-- warped-todo:sync:start/end -->` block with the item list from step 2. Content outside frontmatter and that block is untouched. Emits the same `todos-updated` event the vault scanner uses, so both sidebars re-render.
4. **Watch**: `fs.watch` on structured files and the base folder triggers re-sync of the affected project only. A "Sync projects" command forces a full rescan.
5. **Mutate**: completing/editing an item in the Projects sidebar calls `TodoProcessor`, which writes back to the `sourceFile` line in the repo, not just the vault copy. Editing a synced item directly inside the vault note's delimited block (rather than through the sidebar) is a known rough edge — see Open questions.

### Project note shape

```markdown
---
project: peep
repo: /Users/mx/projects/peep
remote: https://github.com/robotpony/peep
branch: main
gitStatus: M
lastSynced: 2026-08-14T15:30:00Z
---

# peep

#peep

## Overview

Notes you write here survive every sync untouched.

<!-- warped-todo:sync:start -->
### TODOs
- [ ] Add caching for git operations #todo #peep

### Ideas
- Add YAML export #idea #peep

### Bugs
- [ ] Table width miscalculates on narrow terminals #bug #peep
<!-- warped-todo:sync:end -->
```

## Success criteria

- Every git repo under the configured base folder appears in the Projects sidebar after the initial sync, with no manual per-repo setup.
- Editing a `#todo` tag in a project note updates the corresponding line in the repo's source file (`BUGS.md`/`TODO.md`/etc.) without opening a terminal.
- A repo's structured files change on disk (new commit, hand-edited `BUGS.md`); the vault project note reflects that change without a manual sync command, within the debounce window `fs.watch` allows.
- Typing a repo name into Obsidian's Quick Switcher finds its project note, no custom integration required.
- Hand-written content in a project note (an `## Overview` paragraph, notes outside the sync block) survives repeated syncs unchanged.
- A project tag that predates this feature (no matching repo) keeps behaving exactly as it does today.

## Scope

**In**:
- Single base folder, recursive git-repo detection (directory-`.git` only; submodules/worktrees skipped as projects but not as recursion paths), default depth cap of 3, configurable excludes and depth.
- Native `git` calls (branch, status, remote URL) via `child_process`, no external tool dependency.
- Structured-file scanning (`BUGS.md`, `TODO.md`, `TODOS.md`, `IDEAS.md`, `ISSUES.md`) for `#todo`/`#idea`/`#bug` items, root of each repo only, using explicit tags where present and a filename-based default type otherwise (see Structured-file parsing above).
- Vault note per project reuses `ProjectManager`'s existing `projectsFolder`/file-per-tag convention; sync owns frontmatter keys and a delimited block only, leaving manual content untouched; bidirectional item sync for sync-owned items.
- Live `fs.watch`-based sync plus a manual "Sync projects" command. macOS only for now; `fs.watch`'s cross-platform quirks (duplicate/missed events on some filesystems) are a known issue but out of scope until there's a Windows or Linux machine to test against.
- Projects sidebar with filter box; TODOs sidebar shows project-sourced items under existing rules.
- `manifest.json` set to `isDesktopOnly: true`.

**Out** (this pass):
- Multiple base folders.
- Tech-stack detection, health/importance scoring (`p`'s territory; revisit only if needed).
- Source-code comment scanning (`TODO:`/`FIXME:` in source files).
- Non-git sources (macOS Reminders, Gmail, etc.) — noted as a future direction; the project-note shape should stay generic enough to host them later, but no integration work now.
- Structured-file scanning in subfolders (root-only for v1).
- Windows/Linux `fs.watch` hardening.

## Implementation order

1. **Spike**: `TodoItem.sourceFile` mutation routing in `TodoProcessor` — write-back to an absolute path outside the vault, checked for stability under concurrent edits. Everything else depends on this working.
2. `ProjectScanner`: repo detection (depth cap, submodule skip), `git` fact-gathering.
3. Structured-file parser: filename defaults, flat-list and header-report item boundaries.
4. `ProjectSyncManager`: vault note generation/update, `fs.watch` watchers, manual sync command.
5. `ProjectsSidebarView`, settings tab additions, `manifest.json` desktop-only flag.

## Open questions

- **Exclude list and depth cap defaults**: default depth 3 and excluding `node_modules`/`dist`/`build` is a starting point, untested against this machine's actual base folder. May need tuning once run for real.
- **Header-report parsing edge cases**: the `###`-under-`##`-status-section heuristic (for files like this repo's `BUGS.md`) hasn't been tested against real variation in how different repos title their status sections. Worth checking against a handful of actual `BUGS.md`/`ISSUES.md` files before locking the section-name list.
- **Hand-editing inside the delimited sync block**: sync regenerates that block from repo state on every resync. If someone edits a synced item directly in the vault note (rather than through the sidebar) right before a resync fires, that edit can be silently overwritten. The sidebar is the intended interaction surface for v1; whether the delimited block should be read-only in the editor, or whether in-block edits need their own write-back path, is unresolved. Covered by the mutation-routing spike, not solved by it.
