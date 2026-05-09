# Architecture: @mention Attribution Tags

## Summary

Add @mention syntax for attributing TODOs to team members. Mentions reference a vault-local `team.md` file that defines known users. The feature integrates with the existing tag system: parsed alongside #tags, surfaced in sidebar filters and summary stats, filterable in embeds, and autocompleted in the editor.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Syntax | `@handle` (single @) | Familiar, consistent with existing `@date` prefix. Disambiguate by pattern. |
| Team source | `team.md` in vault root | Obsidian-native, human-editable, readable by both plugin and CLAUDE.md |
| File format | Markdown list (no frontmatter) | Simplest format; easy to hand-edit without YAML knowledge |
| Identity resolution | Auto-detect with `(me)` suffix | `@me` resolves to the team member marked `(me)` in team.md |
| Unknown handles | Auto-add to team file | First use of an unrecognized @mention appends to team.md, reducing friction |
| Sort behaviour | `@me` items get soft boost | Full integration: affects sort, enables "My TODOs" filter, appears in summary |

## Data Flow

```
team.md (vault root)
    │
    ▼
TeamManager                       (new component)
    │  Parses team.md on load
    │  Watches for file changes
    │  Resolves @me → handle
    │  Auto-adds unknown handles
    │
    ├──▶ TodoScanner               (modified)
    │      Extracts @mentions alongside #tags
    │      Stores mentions[] on TodoItem
    │      Disambiguates @date vs @user
    │
    ├──▶ DateSuggest / MentionSuggest
    │      DateSuggest: yields to MentionSuggest when
    │        query doesn't match date keywords
    │      MentionSuggest: new EditorSuggest
    │        suggesting handles from TeamManager
    │
    ├──▶ FilterParser              (modified)
    │      New `assignee:` filter key
    │      @me resolved via TeamManager
    │
    ├──▶ SidebarView               (modified)
    │      Assignee filter chip in Active TODOs
    │      Per-person counts in Summary section
    │
    └──▶ Settings Tab              (modified)
           Shows team file path
           Button to open/create team.md
```

## @mention Disambiguation

The `@` prefix is shared between dates and mentions. Resolution order:

1. Check if the token after `@` matches a **date keyword**: `date`, `today`, `tomorrow`, `yesterday`
2. Check if the token matches a **date pattern**: `YYYY-MM-DD` (or configured format)
3. Otherwise, treat as a **user mention**

This applies in both the parser (TodoScanner) and autocomplete (DateSuggest yields to MentionSuggest).

```
@2026-04-20     → date (pattern match)
@today          → date (keyword match)
@bruce          → mention (no date match)
@me             → mention (resolved to configured identity)
@eric.m         → mention (dots allowed in handles)
```

## Component Changes

### New: TeamManager (src/TeamManager.ts)

Responsibilities:
- Parse `team.md` on plugin load
- Watch file for changes (re-parse on modify)
- Expose `getTeam(): TeamMember[]`
- Expose `resolveMe(): string | null`
- Expose `resolveHandle(raw: string): TeamMember | null`
- Auto-add unknown handles (append line to team.md)
- Create team.md from settings if it doesn't exist

```typescript
interface TeamMember {
  handle: string;       // e.g., "bruce"
  name: string;         // e.g., "Bruce Alderson"
  isMe: boolean;        // true for the vault owner
}
```

Parse format:
```
- @handle — Display Name
- @handle — Display Name (me)
```

The `(me)` suffix on any entry marks that member as the current user. Only one entry should have it.

### New: MentionSuggest (src/MentionSuggest.ts)

An `EditorSuggest<TeamMember>` that:
- Triggers on `@` followed by word chars (same trigger as DateSuggest)
- Filters out date keywords and date patterns first
- Suggests matching team members from TeamManager
- Inserts `@handle` on selection
- Includes `@me` as a virtual suggestion that resolves to the user's handle display

### Modified: DateSuggest → merged into AtSuggest

Recommend merging DateSuggest and MentionSuggest into a single `AtSuggest` class (src/AtSuggest.ts) since they share the `@` trigger character. Obsidian's EditorSuggest uses first-match-wins, so two separate suggesters on the same trigger creates ordering fragility. The merged class returns date options for date-matching queries and team member options otherwise.

### Modified: TodoScanner (src/TodoScanner.ts)

- Extract `@mentions` from todo lines alongside tags
- New regex: `@([\w][\w.-]*)` applied after date extraction
- Store on `TodoItem.mentions: string[]`
- Exclude known date patterns from mention extraction

### Modified: TodoItem (src/types.ts)

```typescript
interface TodoItem {
  // ... existing fields
  mentions: string[];   // ["bruce", "eric.m"] — handles without @
}
```

### Modified: FilterParser (src/FilterParser.ts)

New filter key:
```
assignee:@bruce        → filter to items mentioning bruce
assignee:@me           → resolved via TeamManager to vault owner's handle
```

```typescript
interface TodoFilters {
  // ... existing fields
  assignee?: string;    // handle to filter by (without @)
}
```

### Modified: SidebarView (src/SidebarView.ts)

- **Assignee filter chip**: dropdown in Active TODOs header, populated from TeamManager
  - Options: "All", "@me", each known team member
  - Selection filters the displayed TODO list
- **Summary stats**: add per-assignee counts row
  - Format: `@bruce: 5  @eric.m: 3  unassigned: 12`
- **Mention badges**: render @mentions as styled badges alongside #tag badges

### Modified: Settings Tab (main.ts)

New "Team" section:
- **Team file path**: text field (default: `team.md`)
- **Open team file**: button that opens team.md in the editor
- **Create team file**: button that creates a starter team.md if none exists

## Tag Extraction Changes

Current tag extraction in utils.ts:
```typescript
const tagRegex = /#[\w-]+/g;
```

New mention extraction (alongside, not replacing):
```typescript
const mentionRegex = /@([\w][\w.-]*)/g;
```

The mention regex is applied **after** stripping:
1. Inline code spans (`` `...` ``)
2. Known date patterns (`@YYYY-MM-DD`)
3. Known date keywords (`@date`, `@today`, `@tomorrow`, `@yesterday`)

## Sorting Integration

@me items receive a sort boost. In the existing priority hierarchy:

1. Focus tier (`#focus` items first)
2. **@me boost** (within same priority tier, @me items sort before others)
3. Priority value (`#p0` through `#p4`)
4. Tag count (tertiary tie-breaker)

This is a **soft boost**, not a priority override. A `#p2 @eric.m` item still sorts below a `#p1` item regardless of assignee.

## Team File Lifecycle

1. **No team.md exists**: Plugin works normally; @mentions are parsed but unresolved. Settings shows "Create team file" button.
2. **User creates via settings**: Generates starter file with `@me` entry (handle auto-detected from OS username).
3. **Unknown @mention encountered**: TeamManager appends `- @handle — handle` to team.md. User can edit the display name later.
4. **User edits team.md manually**: File watcher triggers re-parse; all views update.

## CSS Classes

New classes for mention rendering:

```css
.sc-mention              /* Base mention badge */
.sc-mention-me           /* Highlighted for @me items */
.sc-mention-new          /* Briefly shown for auto-added handles not yet in team.md */
.sc-assignee-filter      /* Filter chip in sidebar */
.sc-assignee-stats       /* Summary stats row */
```
