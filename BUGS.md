# Bugs

Working log for issues found in manual testing. Not a substitute for
`CHANGELOG.md`; the full write-up of a fix lives there.

Two sections. An entry starts under `## Open` with the full context
(found, issue, why it matters, fix idea, files). When it ships, it moves to
`## Fixed` and is trimmed to a one-line resolution: the date, the version
it went out in, and a sentence on what changed. Fixed entries stay here for
a while so the recent history is visible in one place; prune them once
they're a few versions old.

Section headings (`## Open` / `## Fixed`) double as completion markers for
the plugin's own structured-file parser, so keep the wording: an entry is
done when, and only when, it sits under `## Fixed`.

## Open

_None._

## Fixed

### Tag-cloud and project-block filters could drift on what counts as active

**Fixed**: 2026-09-01 in [0.48.3]. Pulled the "which of a project's synced
items count as active work" filter out of `SidebarView`'s `renderProjects`
and `buildProjectBlocks` into `activeSyncedItems` +
`TODO_TAB_SYNCED_ITEM_TYPES` in `ProjectsSidebarView.ts` (the
ItemView-independent helpers module), with `activeSyncedItems.test.ts` as
the regression guard.

Originally found 2026-08-22 while fixing the [0.47.2] pill-count bug (the
tag cloud counted `#idea` items the TODOs list would never render); that
fix shipped without a test, and the same class of disagreement had already
recurred once before ([0.35.0]).
