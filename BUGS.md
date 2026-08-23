# Bugs

Working log for issues found in manual testing. Not a substitute for
`CHANGELOG.md` — entries here get folded into a changelog entry once fixed,
then removed from this file.

## Open

### No regression test for the tag-cloud/project-block itemType fix

**Found**: 2026-08-22, while fixing "tag filter shows nothing for a project
with only non-todo synced items" (see `CHANGELOG.md` [0.47.2]).

**Issue**: The fix (scoping `renderProjects`' synced-item pill count to
`itemType === "todo" || "bug"`, matching `buildProjectBlocks(["todo",
"bug"])`) shipped with no regression test. `renderProjects` and
`buildProjectBlocks` are private methods on `TodoSidebarView`, an
`ItemView` subclass with no test harness — unlike the Projects tab, whose
display/grouping logic was deliberately pulled into `ProjectsSidebarView.ts`
so it's unit-testable without an `ItemView`.

**Why it matters**: the same class of bug (tag cloud and the list it
filters disagreeing on what counts as "active") has recurred at least once
before — see `structuredFileParser.test.ts`'s frozen fixture for "Tag cloud
shows pills with zero matching TODOs," fixed in `CHANGELOG.md` [0.35.0].
Nothing currently stops a third recurrence.

**Fix**: extract the pill-count and project-block-building logic into a
plain-function module (same pattern as `ProjectsSidebarView.ts`) so both
sides of the "does this project have active work" question can be tested
against the same fixtures directly, not just eyeballed.

**Files**: `src/SidebarView.ts` (`renderProjects`, `buildProjectBlocks`)
