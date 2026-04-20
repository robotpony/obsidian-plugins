# Plan: @mention Attribution Tags

Phased implementation plan. Each phase is independently shippable.

## Phase 1: Team File + TeamManager

**Goal**: Establish the team data source. No visible changes to TODO behaviour yet.

### Tasks

1. **Define TeamMember interface** in `src/types.ts`
   - `handle: string`, `name: string`, `isMe: boolean`
   - Add `teamFilePath: string` to `SpaceCommandSettings` (default: `"team.md"`)
   - Add to `DEFAULT_SETTINGS`

2. **Build TeamManager** (`src/TeamManager.ts`)
   - Parse team.md list format: `- @handle — Display Name (me)`
   - Expose `getTeam()`, `resolveMe()`, `resolveHandle()`
   - `addMember(handle: string)` appends unknown handle to file
   - Watch file for changes, re-parse on modify
   - Handle missing file gracefully (empty team, no errors)

3. **Add settings UI** in `main.ts` settings tab
   - "Team" section with file path field
   - Open/Create buttons
   - Read-only team member display

4. **Wire TeamManager into plugin lifecycle** in `main.ts`
   - Instantiate in `onload()`, pass vault reference
   - Clean up file watcher in `onunload()`

### Acceptance
- Settings shows team section
- Create button generates valid team.md
- Open button opens it in the editor
- Editing team.md updates the settings display live

---

## Phase 2: Parsing + TodoItem Integration

**Goal**: Scanner extracts @mentions from TODO lines and stores them on TodoItem.

### Tasks

1. **Add `mentions: string[]` to TodoItem** in `src/types.ts`
   - Initialize as empty array in scanner

2. **Extract mentions in TodoScanner**
   - New `extractMentions(text: string): string[]` in `src/utils.ts`
   - Regex: `@([\w][\w.-]*)` applied after stripping inline code
   - Filter out date keywords (`date`, `today`, `tomorrow`, `yesterday`)
   - Filter out date patterns (match against configured date format)
   - Store result on `TodoItem.mentions`

3. **Auto-add unknown handles**
   - After extraction, check each mention against TeamManager
   - Unknown handles: call `TeamManager.addMember(handle)`
   - Debounce to avoid rapid file writes during vault scan

4. **Resolve `@me` at query time**
   - Don't resolve in the scanner (keep raw text)
   - Provide `resolveMentions(item: TodoItem): string[]` utility
   - Replaces `"me"` with the actual handle for filtering/sorting

### Acceptance
- TODOs with @mentions have populated `mentions[]` on TodoItem
- Unknown handles appear in team.md after first scan
- `@me` stays as raw text in markdown but resolves for filtering

---

## Phase 3: Sidebar Integration

**Goal**: Assignee filter chip and summary stats in the sidebar.

### Tasks

1. **Assignee filter chip** in SidebarView
   - Dropdown in Active TODOs header
   - Options populated from TeamManager: "Everyone", each member, "Unassigned"
   - Filter applied before rendering the TODO list
   - Combines with existing Focus Mode filter

2. **Summary stats row**
   - Per-assignee counts in the Summary section
   - Only visible when at least one TODO has an @mention
   - Format: `@handle: N` for each assignee with items

3. **Mention badge rendering**
   - Render @mentions as styled badges in TODO item rows
   - New CSS classes: `.sc-mention`, `.sc-mention-me`
   - Tooltip shows display name on hover
   - Badge colour distinct from tag badges

4. **Sort boost for @me**
   - Modify sort comparator in `src/utils.ts`
   - Within same priority tier, @me items sort before others
   - Soft boost only (does not override priority)

### Acceptance
- Filter chip filters TODO list by assignee
- Summary shows per-person counts
- @mention badges render with correct styling
- @me items sort higher within their priority tier

---

## Phase 4: Embed Filters

**Goal**: `assignee:` filter key works in code blocks and inline embeds.

### Tasks

1. **Extend TodoFilters** in `src/types.ts`
   - Add `assignee?: string` field

2. **Parse `assignee:` in FilterParser**
   - Key format: `assignee:@handle`
   - Strip the `@` prefix, store bare handle
   - Resolve `@me` via TeamManager at filter time

3. **Apply assignee filter** in `FilterParser.applyFilters()`
   - Check if any of `item.mentions` match the filter handle
   - Handle @me resolution

4. **Update embed/code block documentation**
   - Add `assignee:` to CLAUDE.md filter syntax section
   - Add to README if it documents embed syntax

### Acceptance
- Code blocks with `assignee:@me` show only the user's TODOs
- Code blocks with `assignee:@eric.m` filter correctly
- Inline embeds support the same syntax

---

## Phase 5: Editor Autocomplete

**Goal**: Typing `@` suggests team members alongside date options.

### Tasks

1. **Build AtSuggest** (`src/AtSuggest.ts`)
   - Merge DateSuggest and MentionSuggest into a single `EditorSuggest`
   - Same `@` trigger as current DateSuggest
   - Returns date options when query matches date keywords/patterns
   - Returns team member options otherwise (from TeamManager)
   - Includes virtual `@me` entry alongside real team members
   - Date selections insert formatted date (existing behaviour)
   - User selections insert `@handle ` with trailing space

2. **Remove DateSuggest** (`src/DateSuggest.ts`)
   - Delete file; all functionality absorbed into AtSuggest

3. **Register in main.ts**
   - Replace `DateSuggest` registration with `AtSuggest`
   - Pass both settings and TeamManager references

### Acceptance
- `@br` suggests `@bruce`
- `@t` suggests `@today`, `@tomorrow`
- `@me` appears as a suggestion with display name
- Selecting a user inserts `@handle`
- Date suggestions still work

---

## Phase 6: Polish + Documentation

**Goal**: CSS refinement, edge cases, documentation updates.

### Tasks

1. **CSS polish** in `styles.css`
   - Mention badge colours (distinct from priority/tag badges)
   - @me highlight styling
   - Filter chip styling consistent with existing sidebar controls
   - Mobile/responsive considerations

2. **Edge cases**
   - TODOs with only @mentions and no #tags (should still be tracked if they have #todo)
   - Team.md deleted while plugin is running
   - Very large team files (100+ members)
   - Handle collisions (same prefix: `@er` matching `@eric` and `@eric.m`)

3. **Documentation updates**
   - CLAUDE.md: add @mention to syntax docs, team file reference
   - README.md: user-facing feature docs
   - CHANGELOG.md: feature entry

4. **Version bump**
   - manifest.json, package.json, CHANGELOG.md

### Acceptance
- Visual polish matches existing plugin aesthetic
- Edge cases handled gracefully
- Documentation complete and accurate

---

## Dependencies Between Phases

```
Phase 1 (Team file)
    │
    ▼
Phase 2 (Parsing)
    │
    ├──▶ Phase 3 (Sidebar)
    │
    ├──▶ Phase 4 (Embeds)
    │
    └──▶ Phase 5 (Autocomplete)
             │
             ▼
         Phase 6 (Polish)
```

Phases 3, 4, and 5 can be built in parallel after Phase 2. Phase 6 waits for all others.

## Open Questions

1. **~~Merged vs. separate suggesters~~**: Resolved. Merging into `AtSuggest` avoids Obsidian's first-match-wins ambiguity on the shared `@` trigger.

2. **@me in todone log**: When a TODO is completed and moved to the todone file, should the @mention be preserved? Likely yes, for historical attribution.

3. **Context menu "Assign to"**: Future phase. Would append `@handle` to a TODO line via right-click. Not in initial scope but the architecture supports it cleanly.

## Estimated Complexity

| Phase | New files | Modified files | Effort |
|-------|-----------|----------------|--------|
| 1 | TeamManager.ts | types.ts, main.ts | Small |
| 2 | — | TodoScanner.ts, utils.ts, types.ts | Medium |
| 3 | — | SidebarView.ts, utils.ts, styles.css | Medium |
| 4 | — | FilterParser.ts, types.ts | Small |
| 5 | AtSuggest.ts | DateSuggest.ts (delete), main.ts | Medium |
| 6 | — | styles.css, CLAUDE.md, README.md, CHANGELOG.md | Small |
