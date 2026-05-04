# Space Command: Focus Mode redesign

> **Status:** All phases complete (v0.10.0 → v0.12.1). Kept as a delivery archive. The shipped behaviour is documented in [`../DESIGN.md`](../DESIGN.md) under "Immersive Focus Mode".

Replace the existing focus filter (eye-icon toggle that hides non-`#focus` items) with an immersive single-task Focus Mode. See [`focus-mode-IDEAS.md`](focus-mode-IDEAS.md) and [`focus-mode-OUTLINE.md`](focus-mode-OUTLINE.md) for the design rationale and full spec. This plan maps the spec to implementation phases.

## Summary of behavior change

- Toggling Focus Mode on **replaces sidebar content** with a single focus card showing the next task in detail.
- Queue is built from `#focus`-tagged TODOs; falls back to top-priority TODOs if none exist (with a hint).
- **Done** completes the TODO and advances. **Skip** rotates the current item to the back of the queue.
- When the curated queue exhausts, a friendly completion state offers **Exit** or **Continue with next priority task**.
- Mode state **persists across sessions**.

## File touchpoints

| File | Changes |
|---|---|
| `src/types.ts` | Settings additions/removals; new `FocusQueueState` type |
| `main.ts` | Settings tab rows, default settings, persistence wiring |
| `src/SidebarView.ts` | Replace filter logic with focus-mode rendering branch; new `renderFocusCard()` path |
| `src/utils.ts` | New `buildFocusQueue()`, possibly `getItemDate()` helper |
| `styles.css` | New `.sidebar-focus-mode-active` and `.focus-card-*` classes; hide chrome rules |
| `DESIGN.md` | Soften "`#focus` is a visibility filter" language; document priority fallback |
| `README.md` | Update Focus Mode section |
| `CHANGELOG.md` | New version entry, behavior change note |
| `manifest.json`, `package.json` | Version bump |

---

## Phase 1: Data layer (settings, state, queue computation) ✓ done

Establish the data foundation before touching the view.

**Status:** Completed in v0.10.0. New settings and helpers landed; existing filter behaviour untouched. One scope deviation: `focusModeIncludeProjects` was kept (not removed) because `SidebarView` still references it for the legacy filter. It will be removed in Phase 3 alongside the filter logic to avoid a broken intermediate build.

### 1a. Settings additions and removals

In `types.ts` `SpaceCommandSettings`:

- **Add** `focusQueueLimit: number` (default 1, range 1–5).
- **Add** `focusModePersist: boolean` (default true).
- **Add** `focusModeActive: boolean` (default false) — the persisted on/off state. Replaces the runtime-only `focusModeEnabled` field on `TodoSidebarView`.
- **Remove** `focusModeIncludeProjects` (no longer meaningful — focus mode no longer filters).

In `main.ts` settings tab:

- Remove the `focusModeIncludeProjects` row.
- Add rows for `focusQueueLimit` (slider or number input, 1–5) and `focusModePersist`.
- Keep `focusListLimit` and `activeTodosLimit` unchanged.

### 1b. Queue computation helper

Add `buildFocusQueue(todos: TodoItem[], limit: number): { items: TodoItem[]; source: 'focus-tagged' | 'priority-fallback' | 'empty' }` to `utils.ts`.

```
1. Filter active TODOs (not #todone, not snoozed) by has_tag('#focus').
2. Sort by existing priority rules (existing sortTodos logic).
3. Take first `limit` items. If non-empty, return source='focus-tagged'.
4. Otherwise, take top `limit` priority items from active TODOs.
5. If still empty, return source='empty'. Else source='priority-fallback'.
```

For header TODOs with focused children: treat the header as a single queue entry (existing `effectiveFocus` semantics — header is "focused" if any active child has `#focus`). The header's child list is rendered inside the card later.

### 1c. Queue runtime state

Add a `FocusQueueState` to `SidebarView.ts`:

```typescript
interface FocusQueueState {
  items: TodoItem[];           // current queue, head is active
  source: 'focus-tagged' | 'priority-fallback' | 'empty';
  inContinueMode: boolean;     // true after user pressed "Continue with next priority"
}
```

Skip rotates `items` (head → tail, re-render). Done removes head, refreshes from scanner, re-renders. When `items` becomes empty: if `source === 'focus-tagged'`, transition to completion state; else (priority-fallback or continue) transition to empty/all-done state.

### 1d. Date resolution helper

Add `getItemDate(todo: TodoItem, app: App): { kind: 'tag' | 'modified' | 'none'; iso: string | null }` to `utils.ts`.

- If the TODO line contains `@YYYY-MM-DD`, parse and return `kind='tag'`.
- Else read source file via `vault.getAbstractFileByPath(todo.filePath)` and return its `stat.mtime` formatted as ISO date, `kind='modified'`.
- If the file is missing, return `kind='none'`.

This is rendered later by the card with format hints (e.g. trailing "(modified)" for the mtime fallback).

---

## Phase 2: View layer (focus card, states, CSS) ✓ done

Render the focus card and its three states. No persistence wiring yet — toggle is still runtime-only at the end of this phase.

**Status:** Completed in v0.11.0. Focus card reachable via the sidebar's hamburger menu → "Enter focus mode" entry (Phase 3 will repurpose the eye icon). All three states render: active item, completion (Exit / Continue), empty (with separate copy for in-continue-mode exhaustion). Skip rotates in memory; Done uses the existing completeTodo path; the `todos-updated` listener now invalidates the cached focus queue so it's rebuilt fresh on data change. CSS lives at the end of styles.css under the new `.sidebar-focus-mode-active` and `.focus-card-*` classes.

### 2a. `renderFocusCard()` in `SidebarView.ts`

New private method called from the existing `renderSidebar()` when `settings.focusModeActive === true`. Replaces the entire rendered content of the sidebar root:

```
renderSidebar():
  if (settings.focusModeActive) {
    root.classList.add('sidebar-focus-mode-active');
    renderFocusCard(root);
    return;
  }
  root.classList.remove('sidebar-focus-mode-active');
  // existing tab/summary/list rendering
```

`renderFocusCard()` handles three sub-states based on `FocusQueueState`:

1. **Active item** (queue non-empty): card with title, badges, date, source link, Done/Skip, Exit link. If `source === 'priority-fallback'`, render `.focus-card-hint` above the title.
2. **Completion state** (focus-tagged queue just emptied): friendly message + Exit / Continue buttons.
3. **Empty state** (no items at all in the vault, or priority-fallback queue exhausted in continue mode): friendly empty message + Exit button.

### 2b. Focus card markup and classes

Single container `.focus-card` with children:

- `.focus-card-counter` — "FOCUS (1 of N)" line.
- `.focus-card-hint` — priority-fallback notice (only when source='priority-fallback').
- `.focus-card-title` — TODO text rendered with existing inline markdown helpers.
- `.focus-card-tags` — badge list (project, priority, custom tags). Cap at 6 visible badges with "+N more" if needed.
- `.focus-card-date` — date row, formatted per `getItemDate()`.
- `.focus-card-source` — file link; click opens via `app.workspace.openLinkText(filePath, '', false)` and scrolls to the line.
- `.focus-card-actions` — Done and Skip buttons. Skip disabled when queue length is 1.
- `.focus-card-exit` — "Exit focus mode" text link below the actions.

Header TODO entries render the parent line in `.focus-card-title` and a child list in a sub-block beneath it (reuse existing child rendering helpers).

### 2c. CSS

Add to `styles.css`:

```css
.sidebar-focus-mode-active .todo-tabs,
.sidebar-focus-mode-active .summary-section,
.sidebar-focus-mode-active .projects-section,
.sidebar-focus-mode-active .focus-mode-toggle-btn {
  display: none;
}

.sidebar-focus-mode-active {
  font-size: 1.4em;
}

.focus-card { ... }
.focus-card-counter { ... }
.focus-card-hint { ... }
.focus-card-title { ... }
.focus-card-tags { ... }   /* badge styling */
.focus-card-date { ... }
.focus-card-source { ... }
.focus-card-actions { ... }
.focus-card-exit { ... }   /* small text-link styling */
.focus-card-empty,
.focus-card-complete { ... }
```

Existing `.todo-focus` and `.project-focus` background tinting stays — those classes still indicate `#focus` items in *normal* mode.

### 2d. Done and Skip handlers

- **Done** → call existing `TodoProcessor.completeTodo()` with the head item. The scanner will emit `todos-updated`; the sidebar listener rebuilds the queue and re-renders.
- **Skip** → rotate `state.items` left in memory and re-render. No file I/O.
- **Exit (link or button)** → set `settings.focusModeActive = false`, save, re-render normally.
- **Continue with next priority task** → set `state.inContinueMode = true`, rebuild queue from priority fallback regardless of `#focus` tags, re-render.

---

## Phase 3: Wire up persistence and replace the old filter ✓ done

This phase makes the toggle live and removes the old filter UI/code paths.

**Status:** Completed in v0.12.0. The legacy `focusModeEnabled` runtime flag and `focusModeIncludeProjects` setting are gone, along with ~10 filter branches across `renderActiveTodos`, `renderProjects`, `renderPrinciples`, `renderActiveIdeas`, and the Ideas tab header. The eye-icon button on the Projects section now enters immersive Focus Mode directly via `handleFocusEnter` (no toggle state). The Phase 2 hamburger menu entry was removed as redundant. The Ideas-tab eye icon is gone (focus mode is now TODO-centric). Persistence is wired via a `setFocusModeActive` callback passed into the view; main.ts saves to settings on every change. `focusModePersist=false` resets `focusModeActive` to false on plugin load. Exit restores the prior tab and scroll position. DESIGN.md and README.md updated to describe the new behaviour.

### 3a. Persistence

- The eye-icon toggle button (now in the *normal* sidebar header) toggles `settings.focusModeActive` and calls `saveSettings()`.
- On `onload()` and on settings reload, the sidebar reads `settings.focusModeActive` and renders accordingly.
- On exit (in-card link or button), same toggle path: write to settings, re-render.

If `settings.focusModePersist === false`, treat `focusModeActive` as transient — reset to `false` on `onload()`.

### 3b. Remove old filter logic

In `SidebarView.ts`, the existing `focusModeEnabled` runtime flag was used to filter `Active TODOs` and the project list. Remove all filter branches gated on it. The eye icon is repurposed (same visual, new semantic — the on-state now means "immersive mode" rather than "filter").

In `ContextMenuHandler.ts`, the right-click "Focus" toggle on items still adds/removes `#focus` (unchanged — it's about the tag, not the mode).

The `{{focus-list}}` embed (`CodeBlockProcessor.ts`, `EmbedRenderer.ts`) is unchanged.

### 3c. State restore on toggle off

When the user exits, restore the sidebar's previous tab and (where feasible) scroll position. Implementation:

- Before activating focus mode, snapshot `activeTab` and the list scroll position into ephemeral fields on `TodoSidebarView`.
- On exit, apply them after the normal render completes.

If snapshotting proves messy, accept "always restore TODOs tab at top" as the v1 behavior.

---

## Phase 4: Docs and version ✓ done

Per-phase docs and version bumps landed at 0.10.0 (Phase 1), 0.11.0 (Phase 2), and 0.12.0 (Phase 3). The dedicated docs pass landed at 0.12.1: DESIGN.md gained a full Focus Mode subsection (state machine, queue computation, settings table, class touchpoints), and the design artifacts (`IDEAS.md`, `OUTLINE.md`, `plan.md`) were moved to `docs/` as a delivery archive matching the existing `mentions-*` and `moved-tag-*` naming convention.

### 4a. DESIGN.md

Soften the "`#focus` is a visibility filter, not a priority level" language. Replace with: `#focus` is a preference for the focus queue; priority fallback fills in when no `#focus` items exist.

Document the new mode: queue computation, state machine, settings.

### 4b. README.md

Update the Focus Mode section to describe the new behavior. Mention `focusQueueLimit` and `focusModePersist`.

### 4c. CHANGELOG.md

New version entry. Behavior change (not a breaking API change). Note removal of `focusModeIncludeProjects`.

### 4d. Version bump

Update `manifest.json`, `package.json`. Recommend a minor bump (e.g., 0.10.0) since this is a behavior change. CHANGELOG entry mirrors.

---

## Implementation order

1. **Phase 1** — data plumbing first. No visible change yet, but `buildFocusQueue` and settings are testable in isolation.
2. **Phase 2** — render the card. At this point you can manually flip `settings.focusModeActive` to test the view in all three sub-states.
3. **Phase 3** — wire the persistent toggle and remove the old filter. This is when the feature becomes user-facing.
4. **Phase 4** — docs and version. Last, after manual verification.

Phases 1 and 2 can be developed in branches and merged independently if useful. Phase 3 is the cutover and should land as a single commit so the eye icon never has ambiguous semantics in `main`.

---

## Testing approach

### Unit-testable (Phase 1)

- `buildFocusQueue()` — covers: only `#focus` items, no `#focus` items but priority items exist, no items at all, header with focused children, queue limit truncation.
- `getItemDate()` — covers: `@YYYY-MM-DD` tag present, no tag (mtime fallback), missing file.

### Manual verification (Phases 2–3)

- Toggle on with several `#focus` items — card shows highest-priority first; Done advances; Skip rotates.
- Toggle on with zero `#focus` items but other TODOs present — fallback queue with hint visible.
- Toggle on with zero TODOs at all — empty state visible.
- Complete the last `#focus` item — completion state appears; Continue pulls priority queue with hint.
- Exit via in-card link — sidebar restores normal view, prior tab.
- Quit and reopen Obsidian with focus mode on — mode is still on; current item is the new top of the freshly computed queue (queue is not itself persisted; only the on/off bit).
- Set `focusModePersist=false`, toggle on, restart — focus mode is off after restart.
- Set `focusQueueLimit=3` — card shows active item plus two next-up previews.

### Regression checks

- Normal mode rendering unchanged when `focusModeActive=false`.
- `{{focus-list}}` embed unchanged.
- Right-click → Focus on a TODO still toggles the `#focus` tag.
- `.todo-focus` / `.project-focus` tinting still appears in normal mode.

---

## Risks

| Risk | Mitigation |
|---|---|
| Users with `focusModeIncludeProjects` set lose configuration silently | CHANGELOG note; setting was niche. Consider migration that logs a one-time notice if the value was previously `true`. |
| Hidden sidebar chrome makes the exit link feel buried | In-card "Exit focus mode" link is always visible at card bottom; verify with manual test on narrow sidebar widths. |
| Header TODOs with many children make the card scrollable | Acceptable in v1; the card should scroll within itself, not the sidebar. |
| Persisted state stuck "on" after a crash with no items | Empty state is a recoverable surface; user can always press Exit. |

---

## Out of scope (v1)

- Custom keyboard shortcuts for Done / Skip / Exit (deferred — standard tab+Enter/Space works).
- Multi-entry mode for header TODOs (header + children = single entry).
- Animations on advance.
- Surrounding-context preview from the source file.
- Configurable font scale.
