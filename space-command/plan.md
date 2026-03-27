# Space Command: Block Tagging Fixes

## Context

The block tagging mechanism uses inline markdown tags (`#todo`, `#todone`, etc.) and identifies items by file path + line number. A review found several bugs and design weaknesses.

## Phase 1: Concurrent write and correctness bugs (this phase)

Fix the immediate correctness problems in `TodoScanner` and `TodoProcessor`.

### 1a. Extract shared read-modify-write helper

Create a `modifyFileLine(file, lineNumber, transform)` helper in `utils.ts` that:
- Reads the file
- Checks line number bounds
- Applies a transform function to the line
- Writes back in a single `vault.modify()` call

Replaces the ~10 repeated read-split-modify-join-write patterns in `TodoProcessor`.

### 1b. Fix missing `await` and multiple writes in `scanFile()`

`scanFile()` calls `cleanupDuplicateTags`, `syncCheckedCheckboxes`, and `removeIdeaTags` without `await`. These fire three concurrent `vault.modify()` calls and emit `todos-updated` before any write completes.

Fix: accumulate all line mutations from all three passes and write once, awaited, before emitting the event.

### 1c. Fix `addTag()` substring deduplication check

`line.includes(tag)` incorrectly matches `#todone` when checking for `#todo`. Replace with a word-boundary regex check.

### 1d. Fix `getTodos()` missing `excludeFiles` guard

`getTodones()`, `getIdeas()`, and `getPrinciples()` all skip excluded files (e.g. the archive). `getTodos()` does not. Add the same guard.

### 1e. Fix `setPriorityTagSilent()` child item handling

The batch-operation version of `setPriorityTag()` checks `!line.includes("#todo")` and silently returns false for child items (which inherit todo status from a parent header). Mirror the `isChildItem` logic from the public `setPriorityTag()`.

### 1f. Fix `todone:show|hide` filter not being applied

`FilterParser.parse()` stores `filters.todone` but `applyFilters()` never uses it. Add the filter logic to `applyFilters()`.

### 1g. Fix `hasContent()` missing `+` list marker

The method strips `[-*]` but not `+`, causing false positives for lines like `+ #todo`. Add `+` to the list marker strip.

### 1h. Fix `#today` not removed by `setPriorityTag()`

When setting a new priority, `#today` is not removed along with `#p0-#p4` and `#future`. Add `#today` to the cleanup pattern.

---

## Phase 2: Content fingerprinting (future)

Add a `fingerprint` field to `TodoItem` (trimmed text minus dates and priority tags). Use line number as a fast-path hint at write time; fall back to nearby-line and full-file search if the hint is stale. Makes the plugin resilient to external file edits shifting line numbers.

## Phase 3: Metadata cache for scanning (future, optional)

Replace the custom scanner with queries against Obsidian's `metadataCache` for the parse phase. Reduces duplicate work and keeps the plugin consistent with Obsidian's own view of the vault.
