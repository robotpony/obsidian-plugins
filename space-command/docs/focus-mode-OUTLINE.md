# Focus Mode redesign — OUTLINE

> **Status:** Shipped in v0.10.0 – v0.12.1. Kept as a design archive. Cross-refs: [`focus-mode-IDEAS.md`](focus-mode-IDEAS.md), [`focus-mode-PLAN.md`](focus-mode-PLAN.md).

## Summary

Replace the existing focus filter with an immersive single-task Focus Mode. When toggled on, the sidebar replaces its content with one focus card showing the next task in detail. Completing or skipping advances a queue. When the queue empties, a friendly completion state offers exit or continuation into the priority queue.

## Motivation

The current focus filter narrows the list but doesn't change engagement. A real focus surface should cut noise, surface one task at a time, show enough context to act on it, and provide a frictionless path through the queue.

## Requirements

### Functional

- **F1.** Toggling Focus Mode on replaces the entire sidebar content with a single focus card. No tabs, summary, project list, or other TODOs are visible.
- **F2.** The Exit control MUST be visible at all times. It lives at the bottom of the focus card, below the Done/Skip actions, as a small text link or button (e.g., "Exit focus mode"). The existing eye-icon toggle in the sidebar header is hidden along with the rest of the sidebar chrome when focus mode is active; exit is via this in-card link.
- **F3.** The focus queue is built as follows:
  - Primary: all active TODOs tagged `#focus`, sorted by existing priority rules (today, p0..p4, then by tag count).
  - Fallback: when no `#focus` items exist on entry, the queue is filled by the highest-priority active TODOs. Always on — no setting.
  - The focus card MUST indicate visually when the current item came from priority fallback (subtle "No focus items — showing top priority" hint).
- **F4.** Only one focus item is shown at a time by default. Setting `focusQueueLimit` (range 1–5, default 1) caps the *visible* queue. With limit > 1, the card MAY show next-up previews beneath the active item.
- **F5.** Each focus item displays:
  - Title (full TODO text, large, ~1.4x default font scale).
  - Tags & categories rendered as visible badges (project tag, priority tag, custom tags).
  - Date: prefer `@YYYY-MM-DD` from the TODO line; fall back to source file modified time. Format MUST be unambiguous (e.g., "2026-05-04" or "May 4, 2026 (modified)").
  - Source file: filename and a click-to-open link that opens the source note at the TODO line.
- **F6.** Each focus item exposes two actions:
  - **Done**: marks the TODO complete (existing `completeTodo` flow), advances queue.
  - **Skip**: rotates the current item to the back of the queue without modifying the underlying TODO. The `#focus` tag is preserved.
- **F7.** When the curated focus queue is exhausted (last `#focus` item completed), show a completion state.
  - Friendly message (e.g., "All focus tasks done.").
  - Two buttons: **Exit focus mode** (toggles mode off, restores normal sidebar) and **Continue with next priority task** (pulls the next-highest-priority TODO into the card; subsequent Done/Skip continues advancing through the priority queue).
- **F8.** Focus Mode state MUST persist across Obsidian sessions. Stored in plugin settings or a dedicated state field.
- **F9.** Toggling Focus Mode off MUST restore the sidebar to its prior tab and scroll position where feasible.

### Non-functional

- **NF1.** No data model changes. `#focus` remains a markdown tag; queue is computed at render time.
- **NF2.** Performance: queue computation MUST run within the existing scan/render cycle. No additional file I/O on Done/Skip beyond what `completeTodo` already does.
- **NF3.** Accessibility: Done, Skip, and Exit MUST be reachable via standard tab order and activated by Enter/Space (default browser behavior for buttons). Custom keyboard shortcuts are deferred (see "Out of scope (v1)").
- **NF4.** No new external dependencies.

## Behavior specification

### State machine

```
[off] -- toggle on, #focus items exist --> [active, focus-tagged queue]
[off] -- toggle on, no #focus items, priority items exist --> [active, priority-fallback queue]
[off] -- toggle on, no active TODOs at all --> [active, empty state]
[active, focus-tagged] -- Done on last #focus item --> [active, completion state]
[active, completion state] -- Exit --> [off]
[active, completion state] -- Continue --> [active, priority queue]
[active, priority-fallback] -- Done on last item --> [active, empty state]
[active, *] -- toggle off / Exit --> [off]
```

### Queue computation

```
queue = active_todos
  .filter(t => has_tag(t, '#focus'))
  .sort(existing_priority_sort)
  .slice(0, focusQueueLimit)

if queue.empty:
  queue = active_todos
    .filter(t => not_complete(t))
    .sort(existing_priority_sort)
    .slice(0, focusQueueLimit)
  source = 'priority-fallback'
else:
  source = 'focus-tagged'
```

Priority fallback is always on; there is no setting to disable it. The card displays the "No focus items — showing top priority" hint whenever `source === 'priority-fallback'`.

### Skip semantics

```
on_skip(item):
  queue = queue.rotate_left()  # move head to tail
  render(queue.head)
```

If the queue has only one item, Skip is a no-op visually (item remains shown). UI MAY disable the Skip button in this case.

### Header TODOs

A header TODO with focused children is a single queue entry — the header is rendered with its child list inside the focus card. Done on a header completes the header and all active children (existing behavior). Skip rotates the header. (No multi-entry mode in v1.)

## UI specification

### Layout (focus card replacing sidebar content)

```
  FOCUS  (1 of 3)

  Big task title goes here in large
  text, wrapping naturally as needed.

  Tags
    #project   #p1   #strategy

  Date
    @2026-05-04

  Source
    notes/2026/05/work-notes.md  [open]

  [Done]                          [Skip]

  Exit focus mode
```

### Empty/completion state

```
  All focus tasks done.

  Nice work.

  [Exit focus mode]
  [Continue with next priority task]
```

### Priority-fallback hint

When the active item came from priority fallback, render a small hint above the title:

```
  No focus items — showing top priority.

  FOCUS  (1 of 1)
  ...
```

## Settings

| Setting | Type | Default | Range | Purpose |
|---|---|---|---|---|
| `focusQueueLimit` | number | 1 | 1–5 | Max items shown in focus queue at once. With value > 1, next-up previews appear beneath the active card. |
| `focusModePersist` | boolean | true | — | Whether focus mode state survives session restart. |

### Settings to remove or repurpose

- `focusModeIncludeProjects` — **remove**. Behavior no longer makes sense (focus mode no longer filters; queue is explicit).
- `focusListLimit` — **keep, scope clarified**. Continues to govern the `{{focus-list}}` embed. Decoupled from the new sidebar focus mode.
- `activeTodosLimit` — **keep**. Unrelated to focus mode.

## CSS / styling

- Add `.sidebar-focus-mode-active` class on the sidebar root when active. Use it to:
  - Hide tabs, summary, project list (`display: none`).
  - Apply enlarged font scale (~1.4x) to focus card descendants.
- New classes for the card:
  - `.focus-card` — main container.
  - `.focus-card-title`, `.focus-card-tags`, `.focus-card-date`, `.focus-card-source`.
  - `.focus-card-actions` — Done/Skip buttons.
  - `.focus-card-empty`, `.focus-card-complete` — empty and completion states.
  - `.focus-card-hint` — priority-fallback hint.
- Existing `.focus-mode-toggle-btn` styling kept; on-state now signals immersive mode rather than filter.
- Existing `.todo-focus` / `.project-focus` background tinting kept *for normal mode only* — these classes still indicate which items carry `#focus` when not in focus mode.

## Migration / compatibility

- No data migration required. `#focus` tag semantics unchanged.
- Existing users with focus mode toggled on (runtime state only today) will see the new immersive view next session. No setting to flip.
- Update DESIGN.md to soften "`#focus` is a visibility filter, not a priority level" language — with priority fallback, `#focus` becomes a preference, with priority filling in.
- Note in CHANGELOG.md as a behavior change, not a breaking change (no API or data shape).

## Open questions

1. **Animations**: none in v1. Revisit if motion would help reinforce queue progression.

## Out of scope (v1)

- **Custom keyboard shortcuts** for Done / Skip / Exit. Standard tab+Enter/Space works; bespoke bindings are a future enhancement.
- **Multi-entry mode for header TODOs.** Header with focused children is one queue entry in v1.

## Resolved (formerly open)

- Header TODOs with focused children → one queue entry (header + children).
- `{{focus-list}}` embed → unchanged by this work.
- Exit toggle location → text link below Done/Skip in the focus card.
- IDEAS and Snoozed tabs → hidden when focus mode is active; restored on exit.
- Priority fallback → always on, no setting. Hint shown when active.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Users feel "trapped" in focus mode and can't find the exit | Always-visible Exit button in card header; persistent eye toggle in sidebar header strip |
| Priority fallback dilutes the meaning of `#focus` | Distinct hint when fallback is in effect; setting to disable fallback for purists |
| Persistence creates surprise on next session | Toggle is one click; state visible immediately on sidebar open |
| Tag/badge density makes the card crowded for TODOs with many tags | Cap visible badges at, say, 6, with "+N more" affordance |

## Success criteria

- Toggling Focus Mode on shows exactly one TODO with full detail, no other sidebar content.
- Done advances; Skip rotates; queue exhaustion shows the completion state with two clear actions.
- Source-file links open the underlying note at the correct location.
- Setting `focusQueueLimit` to 3 shows the active card plus two previews.
- Quitting and reopening Obsidian preserves Focus Mode on/off state.
- No regressions in normal sidebar behavior, the `{{focus-list}}` embed, or the `#focus` context-menu toggle.
