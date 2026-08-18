# Focus Canvas: plan

A canvas-based reimagining of Focus Mode. Centre holds the current focus
area's curated item list (project or selected tag); up to 8 related lists
ring it, filled top row left-to-right, then the two side slots, then
bottom row left-to-right, ranked by priority.

Prototyped today (2026-08-17) as a standalone script,
[`prototype/focus-canvas.mjs`](prototype/focus-canvas.mjs), that reads a
vault on disk and writes a `.canvas` file to open by hand. Not wired into
the plugin yet.

## Decided today

- **Layout: uniform 3x3 grid.** Centre and all 8 satellites are the same
  size (`620×460`), spaced evenly (`80`px gap) in every direction. Started
  as centre-big/satellites-small; changed after review.
- **No edges.** Canvas ships with only a `nodes` array, no lines/arrows
  connecting centre to satellites.
- **Colour: centre only.** The centre node carries the highlight colour
  (`color: "1"`); satellites omit `color` entirely and fall back to
  Obsidian's default node styling. Tried priority-weighted colour per
  satellite first; dropped it because most items in real use won't carry
  explicit priority tags, so it collapsed to one colour for almost
  everything anyway.
- **Headers are de-hashed.** `# 🎯 Alpha`, not `# 🎯 #alpha` — a raw
  `#tag` in a heading renders as its own pill in Obsidian, duplicating the
  pill each item already shows for that tag.
- **Overflow guard exists but content is a placeholder.** Satellites cap
  at 3 items / 65 chars each with a `_+N more_` line when truncated; centre
  caps at 8 items / 90 chars. Tuned against fake data — not meaningful
  once real prioritized TODO lists are the content (see below).
- **Satellite selection**: other tracked projects, ranked the same way
  `ProjectManager.getFocusProjects` already ranks them (focus tier →
  priority → count). The prototype re-implements a minimal version of that
  ranking standalone so it can run outside Obsidian.

## Queued for tomorrow

**Design the content.** Today's item lists are a placeholder (`buildCuratedList`,
a minimal stand-in for `buildFocusQueue`). Real content is prioritized
TODO lists pulled in per project/tag. Needs deciding:

- Item count and truncation once real data is flowing, current 3/65 and
  8/90 were tuned against synthetic fixtures, not representative content.
- Whether satellite boxes show the same curation logic as the centre
  (`#focus`-tagged first, priority fallback) or something simpler, since
  they're peripheral, not the active focus.
- What happens when a satellite has zero eligible items — currently prints
  `No active items`. Worth deciding if empty satellites should be skipped
  (ring shrinks below 8) or shown as-is (ring always fills 8 if 8+ other
  projects exist).

**Remaining project-related work:**

- Swap the standalone re-implementation for the real thing: wire this into
  the plugin as a command using the live `ProjectManager`/`buildFocusQueue`
  instances, writing and opening the `.canvas` file via the Obsidian vault
  API. Retires the standalone scanner in `prototype/focus-canvas.mjs`.
- Decide how "current focus area" is determined at generation time, from
  the active project in the Projects sidebar, the active tag filter in the
  TODO sidebar, or an explicit picker.
- Path toward the actually-interactive version (live-view canvas, not just
  generate-and-open) — parked from the original conversation, not
  reconsidered yet. File-level generation is stable/documented (JSON
  Canvas); live-view control means undocumented Obsidian internals (see
  how `Advanced Canvas` does it) — that trade-off still needs a decision.

## Not in scope here

Sidebar changes are a separate, parallel track — not part of this plan.

## Reference

- Script: [`prototype/focus-canvas.mjs`](prototype/focus-canvas.mjs)
- Ranking mirrors: `ProjectManager.getFocusProjects` (`src/ProjectManager.ts`),
  `buildFocusQueue` (`src/utils.ts`)
