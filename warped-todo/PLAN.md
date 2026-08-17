# Projects: implementation plan

Phased build order for the Projects capability. Spec in
[OUTLINE.md](OUTLINE.md), architecture in [DESIGN.md](DESIGN.md), rationale
in [IDEAS.md](IDEAS.md). Each phase should land as its own PR with passing
`npm run build` and `npm test` before starting the next; phase 1 gates
everything else.

## Phase 1: mutation-routing spike

**Goal**: prove `TodoItem.sourceFile` write-back works before building
anything that depends on it.

- Add `sourceFile?: string` to `TodoItem` (`types.ts`).
- In `TodoProcessor`, branch each mutation (complete, edit, priority
  change) on whether `sourceFile` is set: vault API as today, or
  `fs.readFileSync`/`writeFileSync` against the external path when set.
  Reuse the existing line-number mutation algorithm; only the I/O layer
  changes.
- Test: a synthetic external `.md` file (in the scratchpad, not a real
  repo), mutate a line via the new path, confirm the file on disk changed
  and line numbers of unrelated lines stayed correct.
- Test: two mutations in quick succession against the same external file,
  confirm no lost update (write-then-reread, not a stale in-memory line
  number).
- **Explicitly not tackled here**: the delimited-sync-block overwrite race
  from OUTLINE.md's open questions. That's a product decision (make the
  block read-only vs. build a write-back path), not something this spike
  needs to resolve — it only needs to confirm the `sourceFile` I/O path
  itself is sound.

**Exit criteria**: `sourceFile` mutations are as reliable as vault
mutations in tests. If they're not, the sync model in OUTLINE.md needs
revisiting before Phase 2 starts.

## Phase 2: ProjectScanner

**Goal**: given a base folder, produce a list of repos with git facts.

- New `ProjectScanner.ts`: recursive walk, depth cap (default 3,
  configurable), default excludes (`node_modules`, `dist`, `build`,
  configurable).
- Project test: directory counts as a project only on a `.git`
  **directory**; a `.git` **file** (submodule/worktree) is skipped as a
  project but the walk still recurses past it.
- Per project: `execFile('git', ['branch', '--show-current'], ...)`,
  `execFile('git', ['status', '--porcelain'], ...)`, `execFile('git',
  ['remote', 'get-url', 'origin'], ...)` — handle the no-remote case
  (blank, not an error).
- Settings tab: base folder path, exclude list, scan depth.
- Tests: fixture directory tree in the scratchpad with nested repos, a
  submodule, and an excluded folder; assert the scanner finds the right
  set at the right depth.

**Exit criteria**: `ProjectScanner.scan()` returns accurate repo facts for
a real base folder, verified by hand against `git status`/`git branch` in
a couple of actual repos.

## Phase 3: structured-file parser — done

**Goal**: turn a repo's `BUGS.md`/`TODO.md`/etc. into project items.

**Deviation from the original plan**: built as a standalone
`StructuredFileParser.ts` producing a new `ParsedProjectItem` type, not an
extension of `TodoScanner` producing `TodoItem[]` as originally written
above. Reason: `TodoItem.file` is a required `TFile`, and a real Obsidian
`TFile` can't be legitimately constructed for a file outside the vault —
`file` is read at 38 call sites across the codebase (`SidebarView.ts`,
`ContextMenuHandler.ts`, etc.), so making it optional now would force a
change at every one of those sites before anything actually consumes an
external item, which is premature. `ParsedProjectItem` sidesteps the
question for now. Phase 4 doesn't need it resolved either — rendering
items into the sync block is pure markdown generation from
`ParsedProjectItem[]`, no `TodoItem` required. It only becomes a real
decision in Phase 5, when the Projects sidebar needs to let you act on an
item — most likely resolved there with dedicated `TodoProcessor` methods
keyed on `ParsedProjectItem` directly (mirroring how `modifyExternalFileLine`
already needs nothing but a path, line number, and fingerprint), rather
than forcing every `TodoItem.file` call site to null-check.

- `StructuredFileParser.ts`: `parseStructuredFile(filename, content,
  sourceFile) => ParsedProjectItem[]`. Filename → default type table
  (`BUGS.md`/`ISSUES.md` → bug, `TODO.md`/`TODOS.md` → todo, `IDEAS.md` →
  idea); explicit `#todo`/`#idea`/`#bug` tag on a line or block always
  overrides the default.
- Item boundary detection, selected by `###` heading presence (checked
  first — see OUTLINE.md for why this changed from the original "no
  top-level list items" rule during testing against the real `BUGS.md`):
  header-per-item under a `## Open`/`## Fixed`-style status section when
  any `###` heading exists, otherwise flat bullet/checkbox lists. Neither
  shape matching means zero items from that file, not a guess.
- Completion detection: checkbox state (`[ ]`/`[x]`) or a leading `✓`
  marker when present, else the nearest enclosing section heading's
  vocabulary (open: Open/Todo/Active/Future/Enhancement; closed:
  Fixed/Resolved/Completed/Done/Closed), else open by default.
- Fenced code blocks are excluded from heading/bullet/tag detection, so
  example text inside a repro snippet doesn't get parsed as structure.
- Tests (18 new, all passing): filename defaults, the flat-list shape
  (modeled on `peep/TODO.md`, including its non-checkbox `✓` convention),
  the header-report shape (modeled on this repo's own `BUGS.md`, including
  its incidental `-` bullets inside a body paragraph — the case that broke
  the original tier-selection rule), explicit-tag override at both line
  and block level, fenced-code-block safety, and neither-shape-matches.

**Exit criteria — met**: parsing this repo's actual `warped-todo/BUGS.md`
(read live, not a fixture copy, for this one test) finds the tag-cloud bug
documented there, typed `bug` with no tag required, `completed: false`
under `## Open`.

## Phase 4: ProjectSyncManager — done

**Goal**: keep a project's vault note in sync with scanner + parser output.

**Deviations from the original plan**:

- Did **not** extend `ProjectManager.createProjectFile()`. That method is
  coupled to an interactive create-confirmation modal (`openProjectFile` →
  `confirmCreateProjectFile` → `createProjectFile`), built for the
  click-a-tag-pill flow. A background sync running on a timer or a file
  watcher firing a modal at you is a bad experience and not what "always
  in sync" was asking for. Instead, extracted the trivial path-join logic
  into a standalone `projectFilePath()` function in `ProjectManager.ts`
  (used by both `getProjectFilePath()` and `ProjectSyncManager`), and gave
  `ProjectSyncManager` its own non-interactive `vault.create()` call.
- `fs.watch` is a single recursive watcher on the base folder, not one
  per project's structured files plus one for the base folder. Node's
  recursive `fs.watch` (macOS/Windows only, which matches the already-
  accepted macOS-only scope) catches new/removed repos and structured-file
  edits in one watcher, debounced 300ms — simpler than tracking a
  watcher per file across a changing project list, no behavioural gap.
- The manual "Sync projects" command itself isn't registered yet —
  `syncAll()` is the entry point a command will call; `main.ts` wiring is
  Phase 5's job, as originally scoped there.
- `onSynced` fires once per `syncAll()` batch, not once per project inside
  it — avoids a re-render storm when many projects sync at once. The
  actual `todos-updated` trigger is wired in Phase 5, alongside the
  sidebar that listens for it.

**What was built**:

- `ProjectSyncManager.syncAll(options)`: scans, reads each project's
  structured files off disk, parses them, syncs each note.
- `ProjectSyncManager.syncProject(scanned, items, projectsFolder)`: the
  core merge — creates the note (frontmatter + template body + sync
  block) if missing; otherwise merges frontmatter (sync-owned keys
  overwritten, everything else preserved in original order) and rewrites
  only the delimited block, appending fresh markers if a previously
  tag-only note doesn't have them yet.
- Item rendering: grouped as `### TODOs` / `### Ideas` / `### Bugs` (fixed
  order, empty groups omitted), checkboxes on todo/bug items reflecting
  `completed`, no checkbox on idea items, each line tagged
  `#<itemType> #<projectName>`.
- `startWatching()`/`stopWatching()`: lifecycle only is tested
  automatically (starts, stops, stops-when-already-stopped, handles a
  nonexistent base folder) — real event-driven behavior is deliberately
  not asserted in the suite via timing-based waits, to avoid a flaky test;
  it's the kind of thing to verify by hand against a real vault instead.
- Tests (11 new): note creation content, frontmatter-merge preserving a
  hand-added key and `## Overview`, missing-markers append, idempotency
  (same items/frontmatter across two syncs, `lastSynced` aside), item
  grouping/ordering/checkbox rendering, and a `syncAll` integration test
  against a real git fixture with a real `BUGS.md`.

**Exit criteria — met**: syncing a project twice with a hand-edited
`## Overview` and a custom frontmatter key present shows both survive
unchanged, while the sync block and sync-owned frontmatter keys update.

## Between Phase 4 and Phase 5: dry-run findings — fixed

Before starting Phase 5, ran `syncAll` against `~/projects` for real (via a
temporary throwaway test using the `FakeVault` stub, deleted after use — no
real vault was touched). All 178 automated tests were passing at the time;
the dry run still found three real bugs the synthetic fixtures didn't
catch, confirming the value of testing against messy real data before
building the UI on top of it:

1. **`StructuredFileParser.ts`** — `peep/ISSUES.md` uses `## Issue: <title>`
   per issue with `### <field>` subsections (Problem Description, Root
   Cause, etc.) *inside* each issue, not as separate items. The original
   `###`-under-status-`##` rule got this right for files like this repo's
   `BUGS.md`, but a `##` heading that happens to mention its own status
   (`## Issue: ... ✅ RESOLVED`) was misread as a pure status *section*
   (open/closed vocabulary matched via substring), letting its own `###`
   children leak through as fake top-level items — one issue exploded into
   8 bogus "bugs." Fixed with a stricter check: a pure section heading is
   little more than the status word itself; if a real title remains after
   stripping the matched word and decoration, it's an item heading, not a
   section. Added `isStatusSectionHeading()` alongside the original loose
   `classifySectionHeading()`, which item-level completion detection still
   uses (correctly loose there — "RESOLVED" anywhere in an item's own
   heading should count).
2. **`ProjectScanner.ts`** — real project folders have archived/deployed
   copies of the same repo (this machine has several, under `archive/` and
   `sites/`), which produced duplicate-named projects. Two fixes: added
   `"archive"` to the default exclude list (matches `p`'s own convention),
   and added `dedupeByName()` to `ProjectSyncManager.syncAll()` as a safety
   net for the general case — exclude lists can't catch every duplicate
   pattern, and a silent overwrite of one repo's note with another's data
   is a correctness bug, not just noise. Keeps the shallowest path per
   name, logs the rest via `console.warn`.
3. **`ProjectSyncManager.ts`** — item rendering used `item.fingerprint` as
   display text. Fingerprint strips inline code spans entirely for
   match-stability (correct for its actual job, stale-line recovery), which
   reads fine there but mangled real content for display — e.g. `` `--csv` ``
   in a real TODO.md item became just stray punctuation. Added a separate
   `cleanItemText()` for rendering: strips only structural markers (bullet,
   checkbox, header hashes) and existing tags, keeps inline code/bold/links
   intact.

All three are covered by new regression tests using the same real-file
shapes that exposed them (`structuredFileParser.test.ts`,
`projectSyncManager.test.ts`), not just the dry-run script. 182 tests pass.

## Phase 5: Projects sidebar, settings, desktop-only — done

**Goal**: user-facing surface and packaging.

**Design pass** (see DESIGN.md's `ProjectsSidebarView` entry for the full
sketch and rationale): flat list, sorted projects-with-tracked-items
first — not grouped/collapsed sections — since real data showed only 2 of
26 repos had anything tracked; a flat sort with the busy ones on top reads
fine without extra collapse-state UI. Rows with tracked items get two
lines (name/branch/status, then a per-type `4 todo · 3 idea · 2 bug`
breakdown + relative sync time); rows with nothing tracked collapse to one
line. Empty state (no base folder configured) is an inline prompt with an
"Open settings" button, not a blank list.

- New `ProjectsSidebarView.ts`: the list view above, filter box (name
  only), click-to-open-note, `[⟳ Sync]` calling `ProjectSyncManager.syncAll()`.
- **Detail view** (see DESIGN.md's "Detail view" subsection for the full
  design): replaces sidebar content on selection, same pattern as Focus
  Mode; auto-follows the active file like core Backlinks/Outline; explicit
  back control. Pinned frontmatter fields (branch+status, remote link,
  last-synced, reveal-in-Finder). Frontmatter hidden in the note itself
  via a CSS class, for repo-matched notes only.
- Item list = two concatenated sources: synced items (from the last
  `ParsedProjectItem[]`, grouped by `itemType` directly — no rescanning)
  and hand-typed items (vault-scanned via `TodoScanner`, skipping the sync
  block's line range, for real section labels). No reverse-mapping.
- Context menu: full TODOs-sidebar parity (priority/focus/snooze/complete)
  for both sources, **no "move"** — dropped from this view entirely, for
  both sources, not just synced items (see DESIGN.md for why a half-measure
  was rejected).
- `ProjectSyncManager`'s sync-block rewrite gains fingerprint-matching
  against the previous block: tags beyond the sync-owned set survive
  resync, same principle as the existing frontmatter merge.
- Completion, by source-line shape: has a checkbox → toggle (Phase 1's
  path, unchanged); no checkbox/no tag → add a checkbox and check it in
  one edit; header-report (`###`) item → **no complete action yet**, see
  Phase 6.
- `main.ts`: register `ProjectScanner`, `ProjectSyncManager`,
  `ProjectsSidebarView`; wire settings and the manual sync command.
- `ProjectManager.getProjects()`: merge tag-derived and repo-derived
  `ProjectInfo` by name.
- `manifest.json`: `isDesktopOnly: true`.
- Update `CLAUDE.md` (this plugin's) and `README.md` per the release
  checklist; bump version in `manifest.json`/`package.json`/`CHANGELOG.md`.
- Tests: `ProjectManager.getProjects()` merge logic (tag-only, repo-only,
  and both-matching cases); sidebar renders without a base folder
  configured (empty state, not an error); list/detail view transitions;
  two-source item merge (no double-counting, correct header labels);
  tag-preservation across resync; the three completion paths above.

**Exit criteria — met**: verified against a real base folder (`~/projects`,
26 repos) via a temporary dry-run script (deleted after use, same pattern
as the Phase 3/4 dry runs) — projects sync correctly, `#focus` added to a
synced item survives a resync, `cssclasses` is set, item shapes route to
the right completion mechanism.

**Deviations from the original plan**:

- **`itemCounts()`/list-view counts read `ProjectSyncManager.getCachedItems()`**,
  a new cache of the last `syncAll()` pass's items per `localPath` — not
  originally planned. Needed because the list view has to show per-type
  counts for every project on every render without re-reading every
  project's structured files each time; `syncProject()` now also updates
  this cache directly (not just `syncAll()`'s loop), so a single-project
  resync after a mutation keeps it fresh too.
- **`getSyncBlockLineRange()`** (exported from `ProjectSyncManager.ts`) and
  **`ProjectSyncManager.getProjectItems()`** (public wrapper around the
  previously-private `readProjectItems`) were added to give the detail
  view what it needs — the sync block's current line range (to exclude
  when scanning for hand-typed items) and fresh items for one project on
  demand — without it reimplementing `syncAll`'s orchestration.
- **`ContextMenuHandler.showTodoMenu()` gained an `includeMove` parameter**
  (default `true`, preserving existing TODOs-sidebar behaviour) rather than
  forking a separate menu just to drop "Move to..." for hand-typed items in
  the Projects detail view. Smooths the way for the separate move-removal
  task too.
- **Priority/tag mutations for synced items live in `ProjectItemMutator.ts`**
  (`setProjectItemPriority`, `addProjectItemTag`, `removeProjectItemTag`),
  mirroring `TodoProcessor`'s vault-item methods exactly but targeting
  `sourceFile` via `modifyExternalFileLine`. This is the resolution Phase 3
  flagged as likely back when `ParsedProjectItem` was first split off from
  `TodoItem` — dedicated methods keyed on the shape, not a forced bridge
  into `TodoProcessor`'s `TodoItem`-shaped API.
- Fixed one real bug found while building the detail view, before it ever
  ran against real data: the sync-block line range cache was only being
  populated *after* a mutation, not on initial render — meaning the first
  time you opened a project's detail view, every synced item would also
  show up a second time as a "hand-typed" item. Fixed by loading the range
  before every transition into detail view (`loadSyncBlockRange()`), not
  just after mutations.

## Phase 6: header-report completion — done

**Goal**: let completing a header-report item (Phase 5 leaves these
read-only) actually do something, without the risk of the naive version
(silent data loss in a file that might not even be open in Obsidian, so
there's no app-level undo for it).

Splits into two genuinely different mechanisms, because the two header
shapes `StructuredFileParser.ts` already distinguishes have different
answers to "what does completing this mean":

### Case 1: `###` nested under a `##` status section (this repo's `BUGS.md`)

The real new risk: completing means cutting the `###` block (heading
through the line before the next `##`/`###`, or EOF — the same span
`buildHeaderItem` already computes) and reinserting it under a
closed-vocabulary `##` section, removing it from its current one.

- **Target section, deterministic, no guessing beyond one rule**: if the
  file has one or more `##` sections matching the closed vocabulary
  (Fixed/Resolved/Completed/Done/Closed), use whichever appears first in
  the file. If none exist, create a `## Fixed` section at the end of the
  file. The move never asks "which did you mean" or invents structure
  beyond that one rule.
- **Safety net: require a clean git working tree for the target file.**
  Before performing the move, `git status --porcelain -- <file>` must be
  empty for that specific file (uncommitted changes elsewhere in the repo
  don't block it). Refuse with a clear error otherwise — "commit or stash
  changes to BUGS.md before completing this item." Guarantees a bad move
  is always recoverable via `git checkout -- <file>`, without inventing a
  custom backup mechanism; these are always git repos, so this leans on
  infrastructure that already exists.
- **Reversible, symmetric with `uncompleteTodo`**: an "uncomplete" action
  moves the block back, using the same primitive with the target
  reversed — open-vocabulary section, first match in file order, or a new
  `## Open` section created at the top of the file (after any file-level
  title/intro, before other content) if none exists. Mirrors the
  Fixed-section rule exactly, just inverted and placed at the top instead
  of the bottom, matching where an "Open" section conventionally sits.
- **Content untouched beyond relocation** — no date/timestamp added to
  the moved block. The move only relocates it; deciding a dating
  convention for a file format this plugin doesn't own wasn't worth the
  extra content edit, and the eventual git commit already timestamps it.
- **Rescan after every move**: like every other mutation in this system,
  a successful move triggers an immediate resync of that project so
  cached line numbers/fingerprints across the rest of the file are fresh
  — never relies on stale in-memory positions after content shifts.

**New primitive needed**: a multi-line cut/reinsert operation on an
external file, distinct from `modifyExternalFileLine`'s single-line
model. Doesn't yet exist; this is the actual new code Phase 6 adds.

### Case 2: standalone `##` item heading (`peep/ISSUES.md`'s `## Issue: ...`) — done

Not a move at all — no new risky code needed. Built alongside Phase 5 as
`applyResolvedMarkerToggle()` in `ProjectItemMutator.ts`: appends
`" ✅ RESOLVED"` to the item's own heading line on complete, strips a
trailing resolved-marker variant (`RESOLVED`, `**RESOLVED**`, with or
without the emoji) on uncomplete, both via `modifyExternalFileLine` exactly
as Phase 1 built it. Idempotent — completing an already-resolved heading
doesn't duplicate the marker. The parser already recognizes "resolved" as
closed-vocabulary text (that's precisely the `isStatusSectionHeading` vs.
item-heading distinction Phase 3's dry-run fix relies on), so this isn't a
new convention — it's consistent with what `classifySectionHeading` already
reads on the way in. Routed automatically via `ParsedProjectItem.shape ===
"headerStandalone"` in `setProjectItemCompletion()`.

### Resolved during the build

The three items this section originally deferred, all settled while
building `HeaderBlockMover.ts`:

- **git-porcelain invocation**: `git status --porcelain -- <file>` via
  `ProjectScanner.isFileClean()` (new method, reuses the scanner's existing
  git-path resolution). Notice text: "Commit or stash changes to `<file>`
  before completing this item." No settings override to force through a
  dirty tree — kept the safety net absolute rather than adding an escape
  hatch nobody asked for.
- **Insertion point within the target section**: at the end (after any
  existing items there, before the next `##`), so newly-moved items read
  in roughly chronological order alongside ones already there.
- **Blank-line normalization**: a global pass collapsing any run of 2+
  consecutive blank lines to 1, applied once after the cut and insert are
  both done, rather than trying to track exact boundaries through the edit.

**What was built**: `HeaderBlockMover.ts`'s `moveHeaderBlock()` — git-clean
check, block extraction (reusing `resolveLineNumber` for stale-position
recovery, same as every other mutation in this system), target-section
search via the exported `isStatusSectionHeading`, insertion or new-section
creation, blank-line cleanup. Wired into `ProjectItemMutator.ts`'s
`setProjectItemCompletion()` via a new optional `context: { repoPath,
scanner }` parameter — required for `headerNested`, ignored by every other
shape; omitting it refuses cleanly rather than moving a block with no
safety net. `ProjectsSidebarView` supplies the context from the project
already being viewed (`project.localPath` + the sidebar's own, previously
unused, `ProjectScanner` instance).

**Tests** (11 new in `headerBlockMover.test.ts`, 3 more in
`projectItemMutator.test.ts`): section placement (existing Fixed section,
new Fixed section created, first-match-wins with multiple closed sections,
reverse move to Open with a new Open section at the top), re-parse
round-trip (moved item shows up correctly under its new section),
blank-line normalization, non-`headerNested`/stale-fingerprint refusals,
and the git-clean safety net against real repos (clean → proceeds, target
file dirty → refuses without writing, a *different* dirty file in the same
repo → still proceeds). Verified once more against this repo's own real
`BUGS.md` content (copied into a throwaway git repo, real file never
touched) — the tag-cloud bug's full write-up, code spans and all, moved
cleanly into a newly-created `## Fixed` section with nothing altered but
its position.

## Found via live testing, round 2: detail-view correctness and interaction bugs — fixed

Screenshots comparing the Projects detail view against the TODOs sidebar
surfaced one real correctness bug (not just style) and one real interaction
bug, plus the style gaps tracked separately below.

**Header-TODO items rendered wrong.** A hand-typed `### heading #todo` block
(TodoScanner's "header TODO" — one item with children, matching the TODOs
sidebar's own convention) was treated as a flat list of independent
items: the header itself rendered as its own checkbox row showing raw,
uncleaned markdown (`### bugs #todo #obsidian-plugins` printed literally),
and its children fell into an "Untitled section" bucket instead of
grouping under it — because children of a header don't get a
`sectionLabel` (reserved for true orphans, by TodoScanner's own design).
Fixed by extracting the grouping logic the TODOs sidebar already has:
`groupHandTypedItems()` (a standalone function in `ProjectsSidebarView.ts`,
factored out specifically so it's unit-testable without an `ItemView`) —
a header with children becomes one group labelled with its own cleaned
text, its children file underneath, and the header itself is never
rendered as a row (mirrors `isHeaderWithChildren`, the same rule
`TodoProcessor.completeTodo` already uses to refuse completing a header
directly). True orphans still group by `sectionLabel`, falling back to
"Notes" rather than "Untitled section". 7 new tests reproduce the exact
real note content from the bug report.

**Selecting a project (and "< Back") needed multiple clicks.** Two
compounding causes: `openProject()` awaited the file-open round trip
*before* setting sidebar state, racing against the very `file-open` event
that same call triggers — the auto-follow handler could fire mid-await and
redundantly re-derive the same state. And `handleActiveFileChange()` had no
way to tell "the active file genuinely changed" from "some workspace event
fired for the same still-open file" (Obsidian fires these often, for
reasons unrelated to navigation) — so clicking "< Back" (which only changes
sidebar mode, not what's open in the main pane) could be silently reverted
by the next such event, since the note was still technically active. Fixed:
`openProject()` sets state and renders immediately, before awaiting
`openFile()`; a new `lastKnownActiveFilePath` guard makes
`handleActiveFileChange()` a no-op unless the active file's path actually
changed. Tradeoff: manually re-opening the *same* project note right after
clicking Back won't re-enter detail mode (the path comparison sees no
change) — judged an acceptable, minor edge case against fixing the much
more common multi-click failure.

**Style fixes**, all reusing the TODOs sidebar's own CSS classes rather
than parallel ones (so this view matches by construction, not by
hand-tuning colours/weights that turned out not to match):
- Group headings and item rows now use `.todo-orphan-section*`,
  `.todo-item`, `.todo-checkbox*`, `.todo-text` directly.
- Item groups get the same card-style `background-secondary` grouping the
  TODOs sidebar uses for same-source sections.
- `remote`/`reveal` links get their own class and real Obsidian icons
  (`setIcon`) instead of raw emoji — previously unclassed `<a>` elements
  fell back to the vault theme's default external-link styling.
- Frontmatter hiding gains a second rule: Live Preview's Properties widget
  responds to plain `display: none` on `.metadata-container`; Reading view
  apparently needs the `--metadata-display-reading` CSS custom property
  instead — the original CSS only covered the first.

**Branding and header layout — done**, after asking rather than guessing.
`renderHeader()` is now shared by list and detail view, matching
`SidebarView.ts`'s actual structure: `.sidebar-header` → `.sidebar-title`
(clickable `␣⌘` logo, opens the same About modal as the TODOs sidebar,
wired via a new `onShowAbout` constructor param) → `.sidebar-tab-nav`
(a back-chevron `clickable-icon` button in detail view only, then a kebab
`.sidebar-menu-btn` holding "Sync" — the same treatment `SidebarView.ts`
gives "Refresh", not a standalone always-visible button). The old
`.warped-todo-projects-header`/`-title`/`-sync-btn`/`-back-btn` CSS is gone
entirely — this reuses the TODOs sidebar's own classes, so it matches by
construction. Also removed a second, now-redundant `<h4>` project-name
title that used to render below the header (the header itself already
shows it).

"Missing useful information, think about IA in sidebar carefully" is still
tracked as its own future design task, not addressed here.

## Found via live testing, round 3: #todo/#todone tag-convention collision — fixed

Screenshots of an embedded synced section showed `#todo` tags appearing and
disappearing between renders, on a loop — a genuine content-flicker, not
just a cosmetic issue, and a very plausible second source of the
already-partially-fixed notice flood (this one via a completely different
write path than the `lastSynced` bump fixed in round 1).

**Root cause**: `TodoScanner.ts` — the plugin's existing, vault-wide
scanner, unrelated to Projects — has always auto-corrected a checked `[x]`
box carrying a lingering `#todo` tag by rewriting it to `#todone`, and the
reverse when unchecked. `ProjectSyncManager.renderItemLine()` rendered
every `todo`-type item as `#todo` regardless of completion state, so a
completed synced item came out as `- [x] ... #todo #peep`. TodoScanner
"corrected" that to `#todone` on its next scan. Since `#todone` wasn't in
sync's owned-tag exclusion list, the tag-preservation logic (built for
`#focus`/`#p0` context-menu additions) treated it as a foreign tag worth
carrying forward — so the next resync rendered `#todo` again *and*
preserved the `#todone` TodoScanner had just added, giving both.
TodoScanner corrected it again. Repeat.

**Fix**: a completed `todo`-type item now renders `#todone`, not `#todo`
(`typeTag()` in `ProjectSyncManager.ts`) — the same tag TodoScanner itself
converges on, so there's nothing left for it to correct. `#todone` was
also added to the owned-tag exclusion list, so it's recognized as sync's
own rather than re-preserved as a foreign addition. Verified against
`TodoScanner.ts`'s exact correction conditions (read from source, not
guessed) that both the open (`#todo`, unchecked) and completed (`#todone`,
checked) rendered forms are now genuine fixed points — neither of
TodoScanner's two correction branches can fire on either.

**Ideas and bugs are unaffected**: idea items never render with a checkbox
at all (`checkbox: false` in `ITEM_GROUPS`), so TodoScanner's separate
idea-completion correction (which also exists, and strips `#idea` outright
rather than converting it) never finds a checked box to act on. `#bug` has
no vault-wide convention at all for TodoScanner to know about.

**Tests** (2 new, plus one existing test's assertion updated to match the
corrected behavior): open vs. completed rendering produce `#todo`/`#todone`
respectively and never both on one line; resyncing a completed item twice
doesn't double up `#todone` by mistakenly re-preserving it as a foreign tag.

## Found via live testing: notice flood while editing a project note — fixed

First bug found by actually running the plugin in Obsidian, rather than
tests or dry-run scripts — automated tests only exercise a `FakeVault`, so
this specific failure mode (Obsidian's own file-conflict UI, triggered by
the plugin writing to an open note) couldn't have shown up there.

**Symptom**: editing a project note produced a rapid stack of Obsidian's
built-in `"<file>" has been modified externally, merging changes
automatically` notices — not one of this plugin's own notices, but a sign
the plugin was writing to that note far more often than it should.

**Root cause, three compounding factors**:

1. `syncProject()` bumped `lastSynced` on every sync unconditionally, so
   the rendered content differed from what was on disk almost every pass
   even when nothing about the repo had actually changed — every sync was
   a write, whether or not there was anything real to sync.
2. `startWatching()`'s single recursive `fs.watch` on the whole base
   folder can plausibly retrigger itself: a plain `git status` (run per
   repo, every sync, via `ProjectScanner`) is known to rewrite
   `.git/index`'s mtime with no real change, and that write sits inside
   the watched tree.
3. The watcher didn't apply the exclude list `ProjectScanner.scan()`
   already uses — only the directory *walk* skipped `node_modules`/`dist`/
   `build`/`archive`; the raw watch saw activity anywhere in the tree.

**Fixes**, all applied to `ProjectSyncManager.ts`:

1. **Skip the write when only `lastSynced` would differ.** Compare the
   freshly-merged frontmatter against a version stamped with the
   *previous* `lastSynced` value before deciding whether to call
   `vault.modify()`; if that's the only difference, don't write at all —
   `lastSynced` stays stale until a sync finds something real to change.
   This is the fix that actually closes the bug; the other two are
   hardening against the contributing factors.
2. **Exclude-list-aware watching**: `isUnderExcludedDir()` checks the
   `filename` `fs.watch`'s callback reports (relative path, macOS
   supports this) against the same exclude set the scan already uses;
   matching events are ignored before scheduling a resync.
3. **Post-sync cooldown**: watch events within `WATCH_COOLDOWN_MS` (1500ms)
   of the last completed `syncAll()` are ignored — absorbs the
   `.git/index`-touch case without needing to special-case git internals
   directly.

**Tests** (7 new): a `vault.modify` spy proving a genuinely-unchanged
second sync writes nothing, and a real change still writes despite
`lastSynced` also changing; `isUnderExcludedDir()` directly (including a
substring-vs-path-segment false-positive check — `"redistribute"` must not
match the `"dist"` exclude); the debounce+cooldown logic via fake timers
and direct access to the private `scheduleSyncAll()` (same reasoning as
"watch lifecycle"'s existing tests for not asserting on real-time fs event
delivery). Re-verified against real data: `~/projects` (26 real projects)
synced twice in a row, `vault.modify` called zero times on the second pass.

## Found via live testing, round 4: runaway sync loop crashed Obsidian; in-doc listing removed — fixed

**Symptom**: a project note's `lastSynced` frontmatter value was updating
roughly every 200ms (visible in Obsidian's Properties panel), making the
note unusable while open. Left running, it crashed Obsidian outright — each
of those ~200ms passes was re-appending the rendered item block into the
document rather than cleanly replacing it, so the note's content grew by a
full copy of the sync block on every single pass; at thousands of passes
this bloated the note (and Obsidian's editor state for it) enough to bring
the app down. The stacking was a symptom of the loop's *speed*, not a
separate bug: `replaceSyncBlock()`'s marker-based replace is correct in
isolation, but overlapping/interleaved `syncAll()` calls firing faster than
a single sync-and-write round trip could reliably complete raced each
other's reads and writes of the same note.

**Root cause**: `main.ts` wired `ProjectSyncManager`'s `onSynced` callback
to `SidebarManager.refresh()`, which calls the Projects sidebar's
`reload()` if the view is open. `reload()` itself calls `syncAll()` to get
fresh data — so `syncAll()` completing triggered another `syncAll()`,
unbounded, limited only by how fast one full scan-and-sync pass over the
configured base folder could finish.

**Fix, two parts**:

1. **Broke the loop.** `onSynced` now passes the fresh `ScannedProject[]`
   directly to the sidebar via a new `applySyncResult()` method that only
   stores the data and re-renders — it must never call back into
   `syncAll()`/`reload()`. See `ProjectsSidebarView.applySyncResult()`'s doc
   comment.
2. **Removed the in-doc item listing entirely**, per explicit direction —
   the delimited `<!-- warped-todo:sync:start -->` block is gone. Two
   independent problems pointed at the same fix: the crash above (any write
   to the note body on every sync is a much larger blast radius for a
   runaway loop than a frontmatter-only write, which is small, idempotent,
   and skipped entirely when nothing changed — see the round-3 entry below
   for the *other* problem this block caused, a genuine `#todo`/`#todone`
   content-flicker independent of this loop). Project notes now carry
   frontmatter only; every synced item is read from
   `ProjectSyncManager`'s in-memory cache (`getCachedItems()`), populated
   straight from each repo's structured files, never from the note. See
   DESIGN.md's "Item list" section for the sidebar-side details.

**Tests**: `projectSyncManager.test.ts` reworked — all rendering/tag-
preservation tests removed (nothing left to render), replaced with tests
for `getCachedItems()`/`updateCachedItems()` and confirming `syncProject()`
never writes when only the item list changes. `onSynced`'s signature change
(passing `scanned` directly rather than firing bare) is exercised via the
existing "calls onSynced once per syncAll batch" test, now asserting on the
payload too.

## Found via live testing, round 5: detail-view UI review — fixed

Screenshot review of the detail view surfaced four issues, all cosmetic/IA,
no data-flow changes:

1. **"peep" rendered three times**: Obsidian's native file-title, the
   plugin's own `# peep` body heading, and the sidebar header's title. Fix:
   sidebar header always reads "Projects" (`renderDetail` now calls
   `renderHeader(container, "Projects", true)`, not the project name); new
   notes drop the `# name` heading from their template
   (`ProjectSyncManager.syncProject`'s create branch). Existing notes keep
   their heading — sync never rewrites the body, so this is a going-forward
   fix, not a migration.
2. **Detail view's top framing didn't match the list row it came from.**
   Extracted `renderProjectSummary()` out of `renderProjectRow()` (which now
   just adds an `is-clickable` class + click handler around the shared
   summary) and reused it, unclickable, at the top of `renderDetail()` in
   place of a separately hand-styled branch/status line.
3. **Remote/Reveal actions showed generic labels** ("Remote", "Reveal in
   Finder") instead of the actual value. Now show `browsableUrl(remote)`
   with the protocol stripped (`github.com/owner/repo`) and
   `homeRelativePath(localPath)` (`~/projects/peep`) respectively — full
   value still on hover via `title`.
4. **Synced item group headings had no file hint or open-file arrow** —
   present for hand-typed groups (via the main TODOs sidebar's
   `.header-filename` + `→` pattern) but never wired up for synced groups.
   `renderGroupHeading()`'s signature changed from `(file?: TFile,
   lineNumber?: number)` to a generic `fileHint?: { displayName, path,
   onOpen }`, so both a vault `TFile` (hand-typed, via `openFileAtLine`) and
   a plain external filesystem path (synced, via
   `electron.shell.openPath` — these aren't necessarily vault files) can
   supply the same hint shape. A synced group only gets a hint when every
   item in it shares one `sourceFile` (the common case); silently omitted,
   not guessed, when a group spans more than one file.

**Tests** (7 new, `projectsSidebarDisplay.test.ts`): `browsableUrl` (SSH and
already-https remotes), the https-stripped display form, and
`homeRelativePath` (home-dir prefix, the bare home dir itself, a path
outside the home dir, and the sibling-directory-prefix false-positive case —
`/Users/mxavier` must not be treated as inside `/Users/mx`).

## Separate, unrelated task: remove the plugin-wide move feature

Not part of Projects. Confirmed during the Phase 5 design pass (a Projects-
specific question — "move" doesn't make sense for a synced item — surfaced
that the feature has the same conceptual problem generally), but it's a
deletion of established, working, unrelated functionality:
`MoveTargetModal.ts`, `TodoProcessor.moveTodo()`, the move history setting
(`moveHistory` in `WarpedTodoSettings`), and the move entry in
`ContextMenuHandler.ts`. Tracked here as a reminder, not scheduled into a
Projects phase — do as its own scoped change (dead-code removal, settings
migration for existing `moveHistory` values, doc/version updates per the
release checklist) whenever it's picked up.

## Cross-cutting

- Every phase's tests live in `src/__tests__/`, run via `npm test`
  (vitest), matching the existing convention.
- `npm run build` (tsc + esbuild) must pass at the end of every phase.
- Two of OUTLINE.md's open questions are explicitly deferred past all five
  phases: exclude/depth-cap tuning against a real base folder, and
  header-report parsing against more than the two fixtures used in
  Phase 3. Both are "run it and see" items, not design blockers.
