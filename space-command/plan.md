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

## Phase 2: Content fingerprinting ✓ done

Add a `fingerprint` field to `TodoItem` (trimmed text minus dates and priority tags). Use line number as a fast-path hint at write time; fall back to nearby-line and full-file search if the hint is stale. Makes the plugin resilient to external file edits shifting line numbers.

## Phase 3: Metadata cache integration ✓ done

Use Obsidian's `metadataCache` to eliminate redundant work: double-scanning on every edit, and reading every file in the vault regardless of content. The scanner's line-by-line parser is kept intact — the cache is used as a filter and trigger mechanism, not a replacement.

### What the metadataCache provides (and doesn't)

`app.metadataCache.getFileCache(file)` returns a `CachedMetadata` object with:

| Field | Content |
|-------|---------|
| `tags` | `{ tag: string, position: {start: {line, col, offset}} }[]` — tags with line positions, **excluding tags inside code fences** |
| `headings` | `{ heading: string, level: number, position }[]` — heading text and positions |
| `listItems` | `{ task?: string, parent: number, position }[]` — list item positions; `parent` is the containing item's line number |

What it does NOT provide: full line text. The `tags` field gives tag strings and positions, headings give heading text, but the surrounding line content is absent. `vault.read()` is still required for display, fingerprinting, and write-back.

**This rules out a full scanner replacement.** The current line parser is kept; the cache is used before reaching it.

---

### 3a: Remove the redundant `vault.on("modify")` watcher

**Problem.** `watchFiles()` currently registers both `vault.on("modify")` and `metadataCache.on("changed")`. Both trigger `debouncedScanFile()`. The 100ms debounce collapses most pairs, but the first scan (on `modify`) runs against the file before Obsidian has finished parsing it — meaning the cache is stale at scan time. The second scan (on `metadataCache.changed`) is correct. The first is pure overhead.

**Fix.** Remove the `vault.on("modify")` registration. Keep `metadataCache.on("changed")` as the sole incremental update trigger. This event fires exactly once per file change, after parsing is complete.

`vault.on("create")` is kept: new files aren't in the cache yet and need a direct scan.

```typescript
watchFiles(): void {
  // Primary update trigger — fires after Obsidian finishes parsing the file
  this.app.metadataCache.on("changed", (file) => {
    if (file instanceof TFile && file.extension === "md") {
      this.debouncedScanFile(file);
    }
  });

  // New file creation — cache may not have indexed it yet
  this.app.vault.on("create", (file) => {
    if (file instanceof TFile && file.extension === "md") {
      this.debouncedScanFile(file);
    }
  });

  // Deletion and rename — same as current
  // ...
}
```

**Risk.** Low. The `metadataCache.on("changed")` event already handled the majority of updates; the debounce handles any residual timing edge cases.

---

### 3b: Pre-filter file reads during vault scan

**Problem.** `scanVault()` calls `vault.getMarkdownFiles()` and reads every `.md` file, even files with no todo tags at all. For a large vault (500–2000 files), most files are irrelevant. Each `vault.read()` is an async I/O call; reading everything serially is the main cost of startup scan time.

**Fix.** Before calling `vault.read(file)`, check `getFileCache().tags` for relevant tags. If absent, skip the file entirely. Also apply this check at the top of `scanFile()` to handle the case where all tags were removed from a file.

```typescript
private fileHasRelevantTags(file: TFile): boolean {
  const cache = this.app.metadataCache.getFileCache(file);
  if (!cache?.tags || cache.tags.length === 0) return false;
  return cache.tags.some(t => PLUGIN_TAGS.has(t.tag.toLowerCase()));
}
```

`PLUGIN_TAGS` is already defined in `utils.ts`. The method checks against it directly — no duplication.

In `scanVault()`:
```typescript
for (const file of files) {
  if (this.fileHasRelevantTags(file)) {
    await this.scanFile(file);
  } else {
    // Ensure stale cache entries are cleared for this file
    this.evictFile(file.path);
  }
}
```

In `scanFile()`, add an early exit at the top:
```typescript
async scanFile(file: TFile): Promise<void> {
  if (!this.fileHasRelevantTags(file)) {
    this.evictFile(file.path);
    this.trigger("todos-updated");
    return;
  }
  // ... existing scan logic unchanged
}
```

Extract the four-cache delete into a private `evictFile(path: string)` helper to remove the repetition.

**Expected impact.** If 10% of files have relevant tags, vault scan I/O drops by ~90%. The speedup is proportional to vault size and tag density.

**Risk.** Low-medium. One edge case: if the metadataCache hasn't indexed a file yet (very new file, or cache in a degraded state), `getFileCache()` returns null → `fileHasRelevantTags()` returns false → the file is skipped. Mitigation: the `vault.on("create")` watcher will trigger a `debouncedScanFile()` for new files regardless, and the `metadataCache.on("changed")` watcher will catch it once the cache catches up.

---

### 3c: Handle startup cache readiness

**Problem.** `scanVault()` is called in `onload()`, which can execute before Obsidian's initial file indexing is complete. With Phase 3b, this race is more consequential: `getFileCache()` returns null for unindexed files, causing them to be skipped during the initial scan. The user opens the plugin to an empty sidebar.

**Fix.** In `onload()`, check whether the cache has finished its initial pass before running the vault scan. Obsidian fires `metadataCache.on("resolved")` when initial indexing is complete.

```typescript
// In main.ts onload():
const startScan = async () => { await this.scanner.scanVault(); };

if ((this.app.metadataCache as any).initialized) {
  // Cache already ready (plugin loaded after startup)
  await startScan();
} else {
  // Wait for initial indexing to complete
  this.registerEvent(
    this.app.metadataCache.on("resolved", startScan)
  );
}
```

The `initialized` field is not in Obsidian's public TypeScript types but is reliably present at runtime. An alternative (more conservative) approach is to always wait for `"resolved"` and trigger the scan from there, accepting that in the already-resolved case there's a small delay before the sidebar populates.

**Risk.** Low. This is strictly a startup improvement. The existing behaviour (scan immediately in onload) already has this race; the fix makes it explicit.

---

### 3d: Code block exclusion cleanup (minor)

**Side benefit.** The custom scanner tracks code block state with a boolean toggle on triple backtick (`inCodeBlock = !inCodeBlock`). Since the metadataCache already handles code block exclusion correctly for the pre-filter (3b), any file that appears relevant via the cache check is guaranteed to have at least one non-code-block tag. The existing inCodeBlock tracking in the line parser is still needed for the `text` field accuracy, but it no longer needs to be the primary guard against false positives.

This doesn't require a code change — it's a clarification of the existing logic's role.

---

### What Phase 3 explicitly does NOT do

- **Replace the line-by-line parser**: The cache lacks line text. The parser is still needed for `text`, `fingerprint`, parent-child detection, and mutation cleanup.
- **Use `listItems.parent` for parent-child detection**: Would add API coupling without eliminating the `vault.read()` call.
- **Use `metadataCache` for write-back**: All mutations still go through `modifyFileLine()` with `vault.read()` + `vault.modify()`.
- **Remove `vault.on("create")`**: New files may not be indexed yet; direct scanning is still needed.

---

### Implementation order

1. **3a** — remove `vault.on("modify")`, two-line change in `watchFiles()`
2. **3c** — fix startup race, change to `onload()` in `main.ts`
3. **3b** — add `fileHasRelevantTags()`, extract `evictFile()`, update `scanVault()` and `scanFile()`

Start with 3a and 3c since they're low-risk and self-contained. Do 3b last since it's the one that has the pre-filter dependency on the cache being ready (which 3c solves first).

### Testing approach

- **3a**: Manual test — edit a todo file, confirm sidebar updates once (not twice). Console log count of `scanFile` calls to verify.
- **3b**: Manual test with a large vault — measure sidebar load time before and after. Add a counter to verify only tagged files are read.
- **3c**: Test by disabling and re-enabling the plugin while the vault is open. Sidebar should populate immediately without a blank state.
- Unit tests: `fileHasRelevantTags()` can be unit tested by mocking `getFileCache()` return values — covers null cache, empty tags, relevant tag present, only irrelevant tags.
