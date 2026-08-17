# Projects feature: brainstorm and decision log

Working notes from scoping a Projects capability for warped-todo. Captures
the options considered and why we landed where we did. See
[OUTLINE.md](OUTLINE.md) for the resulting spec.

## Starting point

The original ask: a plugin that understands a folder of git repos as
"projects," surfaces their tagged `#todo`/`#idea`/`#bug` items, keeps an
Obsidian-side project note in sync with the repo on disk, and lets you find
a project quickly from within Obsidian. Open question going in: new plugin,
or an extension of warped-todo.

## Decisions

### Scope: extend warped-todo, don't fork a new plugin

Considered three options: a standalone `warped-projects` plugin, folding
this directly into warped-todo, or a new plugin that depends on
warped-todo's scanner.

**Decision**: extend warped-todo. It becomes a plugin with two sidebars,
TODOs (existing) and Projects (new). The Projects sidebar owns project
config and per-project rollups; the TODOs sidebar keeps listing every
`#todo`/`#idea` in the vault, including the ones now living in synced
project notes, using the same rules it already has.

**Why**: the tag-scanning and mutation machinery (`TodoScanner`,
`TodoProcessor`) is exactly what item-level tracking needs. A dependent
plugin would just re-import that code with extra packaging overhead for no
real isolation benefit, since both features live in one person's vault
workflow.

### Project detection: any git repo, one base folder, recursive

**Decision**: one configured base folder; any directory under it containing
a `.git` **directory** (not a `.git` file) is a project, found via
recursive scan capped at depth 3 by default (configurable). A `.git` file
instead of a directory marks a submodule or worktree checkout; those are
skipped as projects, but the scanner still recurses past them to find real
repos nested deeper.

**Why**: matches "given a base folder" from the original ask, and recursive
scan handles nested groupings (e.g. `~/projects/peeps/p`) without needing
multiple configured roots. The directory-vs-file `.git` check is the
cheapest correct way to exclude submodules: it needs no `.gitmodules`
parsing and can't misfire on a submodule that happens to also look like an
independent repo. Default excludes (`node_modules`, `dist`, `build`) plus
the depth cap keep the scan out of dependency trees.

### Sync model: generated vault note, bidirectional item edits

Three shapes were on the table: point Obsidian straight at the repo folder
(no copying), a one-way read-only mirror into the vault, or a full
bidirectional mirror.

**Decision**: the plugin generates a vault note per project. Frontmatter
holds repo facts (local path, git remote, branch, status, last-synced
time). A delimited block in the body holds the `#todo`/`#idea`/`#bug`
items pulled from the repo's structured files. Editing or completing an
item from the sidebar writes back to the source line in the repo file,
same mutation model `TodoProcessor` already uses for vault-native items.

**Why**: "point Obsidian at the repo folder directly" doesn't work cleanly
since repos live outside the vault and Obsidian's editor assumes vault
membership. A read-only mirror was tempting for simplicity, but the whole
point of surfacing these items in Obsidian is to act on them there;
read-only would just mean a second place to notice a TODO without being
able to close it out.

### Reconciled with the existing ProjectManager

warped-todo already has a `ProjectManager`: tag-based project grouping (any
non-lifecycle hashtag), each with its own vault note
(`projectsFolder + tag + ".md"`, created on demand, no frontmatter). This
predates the git-repo concept from this pass and would collide with it on
name and file location if left unreconciled — a repo named `peep` and a
hand-used `#peep` tag elsewhere in the vault would otherwise fight over
the same filename.

**Decision**: unify. A repo's folder name is its project tag.
`ProjectManager.getProjects()` merges tag-derived and repo-derived
`ProjectInfo` by name. The synced note is the same file `ProjectManager`
already creates via `openProjectFile`/`createProjectFile`, reusing the
existing `projectsFolder` setting, not a new location.

**Why**: two parallel "project" concepts in the same plugin, with separate
files and separate mental models, is more confusing than useful for
something that's fundamentally the same idea (work grouped by a name).
Keeping them separate was considered and rejected for that reason.

**Sync ownership**: sync only owns the frontmatter keys it manages and a
delimited block (`<!-- warped-todo:sync:start -->` … `<!-- warped-todo:sync:end -->`)
for parsed items. Everything else in the note, including the existing
template's `## Overview` section, is left alone on every resync.

**Why delimited over full regenerate**: a full-file regenerate is simpler
to implement, but it would silently discard anything written outside the
synced items, including the `## Overview` section the current template
already creates. That's an unacceptable cost for a small amount of extra
parsing work.

### Content scope: structured files only, contextual defaults

**Decision**: scan a fixed set of filenames per project root (`BUGS.md`,
`TODO.md`, `TODOS.md`, `IDEAS.md`, `ISSUES.md`). An explicit
`#todo`/`#idea`/`#bug` tag on a line always wins; where a line has no tag,
it's attributed to a default type based on the filename it came from
(`BUGS.md`/`ISSUES.md` → bug, `TODO.md`/`TODOS.md` → todo, `IDEAS.md` →
idea). No whole-repo markdown scan, no source-code comment scanning
(`TODO:`/`FIXME:`).

**Why**: requiring explicit tags on every line was a bad first-run
experience, since almost no existing file qualifies, including this repo's
own `warped-todo/BUGS.md` (prose-style bug writeups, zero tags). A
filename-based default gets useful output on day one without retrofitting
every repo's files first, while still letting an explicit tag override the
default when a line genuinely is a different type (e.g. an idea noted
inline in `BUGS.md`).

Two item shapes are recognized: flat bullet/checkbox lists (one item per
line, like `peep/TODO.md`), and header-per-item reports (one item per
`###` heading nested under a `## Open`/`## Fixed`-style status section,
like this repo's own `BUGS.md`). A file that matches neither shape
contributes nothing rather than being guessed at. Full parsing spec in
OUTLINE.md.

Whole-repo scanning was rejected because it's noisy and would require every
README and doc file across every repo to be tag-clean. Source-comment
scanning is a fundamentally different parser (language-aware, no tag
convention) and a much bigger build than this pass calls for.

### Prior art: `~/projects/peep` (the `p` CLI)

`p` already does recursive project scanning, git status/branch/remote
detection, tech-stack detection, structured-file TODO/issue/idea counting,
and a health score, with JSON output. It was worth checking before building
any of this from scratch.

**Decision**: reimplement git-level facts (branch, status, remote) natively
in TypeScript via `child_process` + `git`, rather than shelling out to `p`.
Tech-stack detection and health scoring are out of scope for v1.

**Why**: shelling out to `p` would make the plugin depend on Python 3 and a
specific script being installed and on `PATH` on every machine the plugin
runs on. That's a fragile dependency for something distributed as an
Obsidian plugin. Native `git` calls only need `git` itself, which is a much
safer assumption. `p`'s scoring and stack-detection features are real, but
they're not part of what was asked for here; if wanted later, they're a
natural v2 addition and `p`'s config/scoring model (see its README and
`HEALTH.md`) is a good reference.

### Sync trigger: live file-watching

**Decision**: `fs.watch` on each project's structured files and on the base
folder itself (for repos appearing/disappearing), plus a manual "Sync
projects" command for the initial index and as a fallback. macOS only for
now; `fs.watch`'s cross-platform inconsistencies (duplicate or missed
events on some filesystems) are a known risk but there's no Windows or
Linux machine to test against currently, so hardening that is out of scope
until there is.

**Why**: the original ask was explicit that "projects and obsidian projects
are always in sync." Manual-only sync doesn't meet that; polling meets it
approximately. Live watching is the only option that matches the stated
requirement.

### Platform: desktop only

**Decision**: `manifest.json` moves from `isDesktopOnly: false` to `true`
for the whole plugin, not just a feature-gated subset.

**Why**: `ProjectScanner`/`ProjectSyncManager` need Node `fs` and
`child_process`, neither available on mobile. A `Platform.isDesktopApp`
guard could keep the TODOs sidebar alive on mobile while hiding Projects,
but the development tooling for this repo is already desktop-only, so
there's no real mobile workflow being protected by the extra complexity.

### Finding projects: sidebar + Quick Switcher, for free

**Decision**: the Projects sidebar gets a filter box, and since project
notes are ordinary vault markdown files, Obsidian's built-in Quick Switcher
already indexes them by filename. No custom quick-switcher integration
needed, just make sure filenames are distinctive (repo name).

## Rejected / deferred

- **Multiple base folders**: deferred. One recursive base folder covers the
  stated use case; multiple roots is a config-surface increase without a
  concrete need yet.
- **Tech-stack detection and health scoring**: deferred, `p` already solves
  this well for CLI use; revisit only if the vault-side view needs it.
- **Source-code comment scanning** (`TODO:`/`FIXME:` in `.ts`/`.py`/etc.):
  deferred, different parser entirely, not part of the original ask.
- **Non-git sources** (macOS Reminders, Gmail): explicitly future, out of
  scope for this pass. The project note's frontmatter/body shape should
  stay generic enough that a non-git source could populate the same note
  format later, but no integration work now.
