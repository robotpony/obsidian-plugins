# Focus Mode redesign — IDEAS

## Summary

Today's "Focus Mode" is a filter: toggle the eye icon and the sidebar hides everything except `#focus` items. The proposal is to replace this with an immersive single-task mode: one TODO at a time, large, with rich detail, and a sequential progression as items are completed.

This document captures alternatives considered, tradeoffs, and the decisions that resulted from the ideation pass. The structured outcome lives in `OUTLINE.md`.

## Problem

The current focus filter is honest but shallow. It narrows the visible list, but it doesn't change *how* you engage with a task. Users who tag many things `#focus` end up with a focus list that looks like every other list, just shorter. Users who tag one thing `#focus` get a single-item view that still sits inside the same crowded sidebar chrome (tabs, headers, summary stats), with no extra context.

A real focus mode should:

1. Cut visual noise to near-zero.
2. Surface the one thing that matters now.
3. Show enough context (source, date, categories) to act on it without leaving the sidebar.
4. Provide a frictionless path through the focus queue: complete, advance, repeat.

## Solution direction

Replace the existing focus filter with a true mode. When toggled on, the sidebar replaces its normal content with a single focus card showing the next focus task in detail. Completing or skipping advances the queue. When the queue is empty, the user sees a friendly completion state with a choice: exit or continue into the priority queue.

Persistence is on: the mode survives Obsidian restarts. Font scale is bumped ~1.4x. Detail includes source file link, date (`@date` tag, else file mtime), and tags.

## Alternatives considered

### A. Keep filter, layer fade on top

The original prompt suggested "fade out everything, other than focus tasks." The most literal reading is: dim non-focus items in place but keep them visible.

**Pros:** Smaller behavioral change. Users can see what's behind the focus state.
**Cons:** Doesn't solve the noise problem. The sidebar chrome is still there. Doesn't enable richer per-item detail without making the card huge.

**Decision:** Rejected in favor of full replacement. Faded-but-visible non-focus content turns out to be a distraction, not a feature, when the goal is single-task attention.

### B. Modal/overlay over the dimmed sidebar

A centered card overlays a dimmed sidebar. ESC dismisses.

**Pros:** Dramatic, clearly modal.
**Cons:** Modal feel works against persistent focus. ESC-to-dismiss invites bouncing in and out. Also harder to fit in a narrow sidebar pane.

**Decision:** Rejected. A toggle, not a modal, matches the existing pattern.

### C. Truly replaces sidebar content (chosen)

Sidebar tabs, summary, projects, other TODOs all hidden. The focus card is the entire view.

**Pros:** Maximum quiet. Forces commitment. Lets the card use the full vertical space for context detail without crowding.
**Cons:** Feels like a different app for a moment. Users might feel "trapped" — must address with a clear, always-visible exit toggle.

**Decision:** Chosen. The clarity of a single-task surface is worth the slightly heavier shift.

### D. Queue source

When `#focus` items exist, the queue is them. The interesting case is what to do when no `#focus` items exist.

- **Empty state with prompt:** honest but unhelpful.
- **Top N by priority (chosen):** focus mode always has something to work on; `#focus` becomes a hint, not a hard requirement. The risk is that the boundary between "I tagged this" and "the system picked it" gets blurry.
- **Empty state with quick add:** more polished but more UI to design.

**Decision:** Top N by priority, with the focus card showing a subtle hint when the item came from priority fallback rather than `#focus`. Always on — no setting to turn it off. Reasoning: the alternative (strict `#focus`-only) makes the mode unusable until the user has manually tagged something, which is a discoverability cliff. The hint keeps the source transparent.

### E. Queue exhausted

When the last focus task is done:

- **Auto-continue with priority:** seamless but removes the moment of completion.
- **Auto-exit:** simple but abrupt.
- **Friendly message + user choice (chosen):** preserves the small dopamine hit of "you're done" and lets the user decide whether to keep going. Two buttons: "Exit focus mode" or "Continue with next priority task."

**Decision:** Chosen. Worth the extra UI for the moment of acknowledgement.

### F. Skip behavior

- **Move to back, keep tag (chosen):** "I'll come back to this" is a real workflow. Item stays in queue.
- **Remove tag and advance:** stronger commitment but punishes hesitation.
- **No skip:** maximum discipline, minimum flexibility.

**Decision:** Move to back, keep `#focus`. Round-robin within the focus queue. If a single item keeps getting skipped, that's user feedback, not a system problem.

### G. Detail richness

Selected: source file & link, date metadata, tags & categories.
Rejected for now: surrounding context (a line or two from the source file).

**Reasoning:** Context preview adds parsing complexity (where to draw the boundary, how to handle headings, what about TODOs inside lists). The link-to-source already gets the user to the full context with one click. Revisit if users ask for it.

### H. Font sizing

- **Fixed bump (~1.4x, chosen):** opinionated and consistent.
- **Configurable scale:** flexibility, more settings to manage.
- **Keep current size:** doesn't reinforce the mode shift visually.

**Decision:** Fixed bump. If users ask for accessibility scaling, add it then.

### I. Persistence

- **Persist (chosen):** if you exit Obsidian mid-focus, you come back to the same state.
- **Runtime only (current):** clean slate every session.
- **Configurable:** another setting.

**Decision:** Persist by default. Focus mode is intentional — surviving a restart matches the discipline of staying in it.

## Tradeoffs accepted

1. **Less visibility into the rest of the sidebar.** Users can't glance at stats or the project list while focusing. Mitigation: toggle off is one click.
2. **Mode-switch overhead.** Toggling on and off feels heavier than the current filter. Mitigation: keyboard shortcut (Done/Skip), persistence keeps state.
3. **`#focus` semantics shift slightly.** Today `#focus` is a visibility filter. With priority fallback, it becomes "preferred" rather than required for focus mode to work. Worth flagging in DESIGN.md.
4. **No surrounding-context preview yet.** Card stays simple at v1.

## Open questions

1. **Animations / transitions between items?** A subtle slide or fade on Done/Skip would reinforce progression but adds complexity. Default to no animation, revisit.

## Resolved decisions

- **`focusListLimit`**: keeps current scope, governs the `{{focus-list}}` embed only. The new sidebar-focus-mode queue is governed by `focusQueueLimit`.
- **Header TODOs with focused children**: one queue entry (header rendered with its children inside the focus card). Multi-entry mode is out of scope for v1.
- **`{{focus-list}}` embed**: unchanged.
- **IDEAS and Snoozed tabs**: hidden while focus mode is active; restored on exit.
- **Exit control location**: text link below the Done/Skip buttons inside the focus card.
- **Keyboard shortcuts**: deferred to a future release. v1 relies on standard tab+Enter/Space.
- **Priority fallback**: always on. No setting. Hint shown on the card when fallback is in effect.

## Things explicitly out of scope

- Pomodoro-style timers.
- Cross-vault focus (multi-window).
- Mobile sidebar layout (covered by general sidebar work).
- Surrounding-context preview in the focus card.
- Configurable font scaling.

## Consistency notes vs. existing design

- **DESIGN.md** currently describes `#focus` as "a visibility filter, not a priority level." With priority fallback, this softens — `#focus` becomes a preference, and priority can fill in. Update DESIGN.md to reflect.
- The `focus-mode-toggle-btn` styling (styles.css ~979) survives but its on-state semantics change: the eye-off icon now means "immersive mode active," not "filter applied."
- `.todo-focus` / `.project-focus` background tinting (styles.css 943–996) is no longer needed in focus mode (everything visible *is* a focus item). Tinting may still be useful in normal mode to indicate which items are tagged. Decision: keep the tinting in normal mode, not used inside focus mode.
