# Design: @mention Attribution Tags

User-facing interfaces for the @mention feature.

## Team File

**Location**: Vault root (configurable in settings, default `team.md`)

**Format**:
```markdown
# Team

- @bruce — Bruce Alderson (me)
- @eric.m — Eric M
- @sarah — Sarah K
```

**Rules**:
- One member per line
- Format: `- @handle — Display Name`
- Append `(me)` to mark the vault owner's identity
- Only one `(me)` entry allowed; if multiple exist, the first wins
- Handles allow word characters, dots, and hyphens: `[\w][\w.-]*`
- Lines that don't match the pattern are ignored (supports freeform notes)
- File is valid markdown and renderable as a normal Obsidian note

**Auto-generated starter** (from settings button):
```markdown
# Team

- @bruce — bruce (me)
```

The handle and display name default to the OS username. The user edits from there.

## TODO Syntax

Mentions appear inline alongside tags and dates:

```markdown
- [ ] Fix auth bug #todo @bruce @2026-04-20
- [ ] Review API spec #todo #api @eric.m #p1
- [ ] Check deployment logs #todo @me
- [ ] Update docs #todo @sarah #p2
- [ ] Unassigned task #todo #backend
```

**Parsing priority** for `@` tokens:
1. Date keywords: `@date`, `@today`, `@tomorrow`, `@yesterday` (consumed by DateSuggest)
2. Date patterns: `@YYYY-MM-DD` (consumed by date extraction)
3. Everything else: user mention

**`@me` resolution**: When displaying or filtering, `@me` resolves to the handle marked `(me)` in team.md. In the raw markdown, `@me` stays as-is (never rewritten to the actual handle). This keeps the file portable across vaults.

**Multiple assignees**: A single TODO can have multiple @mentions. All are stored and filterable.

## Editor Autocomplete

Typing `@` in the editor triggers a combined suggest:

```
@br|
  ┌──────────────────────────────┐
  │ 👤 @bruce — Bruce Alderson   │  ← from team.md
  │ 👤 @me — Bruce Alderson      │  ← virtual entry
  └──────────────────────────────┘

@t|
  ┌──────────────────────────────┐
  │ 📅 @today — 2026-04-20       │  ← date option
  │ 📅 @tomorrow — 2026-04-21    │  ← date option
  └──────────────────────────────┘

@e|
  ┌──────────────────────────────┐
  │ 👤 @eric.m — Eric M           │  ← from team.md
  └──────────────────────────────┘
```

**Behaviour**:
- Both date and user suggestions appear in one list, sorted by relevance
- Date suggestions use 📅 icon; user suggestions use 👤 icon
- Selecting a user inserts `@handle ` (with trailing space)
- Selecting a date inserts the formatted date (existing behaviour)
- DateSuggest and MentionSuggest merge into a single `AtSuggest` class, avoiding Obsidian's first-match-wins ambiguity on the shared `@` trigger.

**Trigger suppression**: The `@` trigger should NOT fire:
- Inside inline code spans
- When preceded by an alphanumeric character (email addresses)
- These rules already exist in DateSuggest

## Sidebar Changes

### Active TODOs: Assignee Filter

A filter chip appears in the Active TODOs section header:

```
Active TODOs                    [Assignee ▾]

  Assignee ▾
  ┌─────────────────────┐
  │ Everyone             │  ← default, no filter
  │ @me (Bruce)          │
  │ @eric.m (Eric)       │
  │ @sarah (Sarah)       │
  │ Unassigned           │  ← TODOs with no @mention
  └─────────────────────┘
```

**Behaviour**:
- Default: "Everyone" (show all, current behaviour)
- Selecting a person filters the list to TODOs mentioning that handle
- "Unassigned" shows TODOs with no @mentions
- Selection persists within the session (not saved to settings)
- Filter combines with existing Focus Mode (both apply simultaneously)

### Summary Section: Assignee Stats

The Summary section gains a row showing assignment distribution:

```
Summary
  Active: 20  Focused: 3  Snoozed: 5
  @bruce: 8  @eric.m: 5  @sarah: 3  unassigned: 4
  Completed this week: 12
```

Only shows assignee stats when at least one TODO has an @mention. Otherwise the row is hidden.

### Mention Badges in TODO Items

@mentions render as styled badges next to #tag badges:

```
  ☐ Fix auth bug  [#api] [@bruce] [#p1]
  ☐ Review spec   [#api] [@eric.m]
  ☐ Check logs    [@me]
```

**Styling**:
- Mention badges use a distinct colour (blue-ish) vs. tag badges (grey/priority colours)
- `@me` badges are highlighted (bolder or accent colour)
- Badge shows the handle, not the display name (keeps it compact)
- Hovering a mention badge shows the full display name as a tooltip

## Embed / Code Block Filters

New `assignee:` filter key in code blocks:

```markdown
```focus-todos
path:projects/
assignee:@me
limit:10
```
```

```markdown
```focus-todos
assignee:@eric.m
tags:#api
```
```

**Filter behaviour**:
- `assignee:@me` resolves via TeamManager, then filters to matching TODOs
- `assignee:@bruce` filters to TODOs containing `@bruce`
- Multiple assignees not supported in a single filter (use one `assignee:` per block)
- Omitting `assignee:` shows all TODOs (current behaviour, unchanged)

**Inline embed syntax** also supports it:
```markdown
{{focus-todos | assignee:@me | path:projects/}}
```

## Settings UI

New "Team" section in the settings tab:

```
Team
  Team file path .......... [team.md        ]
    Path to the team definition file in your vault.

  [Open team file]  [Create team file]

  Current team:
    @bruce — Bruce Alderson (me)
    @eric.m — Eric M
    @sarah — Sarah K
```

**Open team file**: Opens team.md in the editor (standard Obsidian `workspace.openLinkText`)

**Create team file**: Visible only when the configured path doesn't exist. Creates starter content with auto-detected OS username.

**Current team display**: Read-only list showing parsed team members. Confirms the file is being read correctly. Updates live when team.md changes.

## Context Menu

No changes to the right-click context menu in this phase. Future consideration: "Assign to..." action that appends `@handle` to a TODO line.

## Keyboard Shortcuts

No new keybindings. The `@` autocomplete is the primary interaction path.
