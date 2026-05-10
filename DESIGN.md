# Design: Claude Helpers

User-facing interface design for the Claude Helpers feature in `warped-reference`.

---

## Settings tab (warped-reference)

A new "Claude Helpers" section appears at the bottom of the warped-reference settings tab.

```
Claude Helpers                                        [Sync now]

  Last synced: never

  Skills
    ☑  warped-review    Review a post against configured criteria
    ☑  warped-enhance   Add questions and suggestions to a document outline
    ☑  warped-write     Rewrite, expand, or summarize selected text
    ☑  warped-todo      Review and triage TODO items across the vault
    ☑  warped-pull      Pull a Google Drive doc into the vault

  Content review criteria
  [input: vault path to criteria file, e.g. .claude/content-criteria.md]

  Writing style guide
  [input: vault path to style guide, e.g. .claude/style-guide.md]

  ─────────────────────────────────────────────────────────
  Vault overrides: place custom skill files at
  <vault>/.claude/skills/<name>.md to override any bundled skill.
```

The "Sync now" button runs `ClaudeHelpersManager.sync()` and shows a notice with the result (X written, Y unchanged). The button is disabled while sync is running and shows "Syncing..." during the operation.

Last synced time updates after each successful sync.

---

## Command palette

One new Obsidian command:

| Command | Description |
|---------|-------------|
| `Sync Claude Helpers` | Copies configured skills and rules to ~/.claude |

---

## Notices

| Event | Notice |
|-------|--------|
| Sync complete | `g⌘ Synced 5 files, 2 unchanged` |
| Sync complete, nothing changed | `g⌘ All helpers up to date` |
| Sync error (can't write to ~/.claude) | `g⌘ Sync failed: [error message]` |
| Style guide file not found | `g⌘ Style guide not found: [path] — skipped` |

---

## Vault override convention

Users who want to customise a skill create a file in their vault:

```
<vault>/
  .claude/
    skills/
      warped-review.md     overrides the bundled review skill
      warped-enhance.md    overrides the bundled enhance skill
    rules/
      warped-writing.md    overrides the bundled writing rule
```

The Obsidian command "Sync Claude Helpers" reads these files and copies them to `~/.claude/` instead of the bundled defaults. The settings tab shows "(custom)" next to any skill that has a vault override.

---

## Skill invocation (user's terminal)

After sync, users invoke skills in any Claude Code session:

| Skill | Invocation | What it does |
|-------|-----------|--------------|
| warped-review | `/warped-review [file]` | Reviews the file against configured criteria; returns a pass/fail checklist |
| warped-enhance | `/warped-enhance [file]` | Adds inline HTML comment suggestions to a document outline |
| warped-write | `/warped-write [instruction]` | Applies a writing instruction to selected text or the current file |
| warped-todo | `/warped-todo` | Lists and triages TODO items across the vault; suggests priorities |
| warped-pull | `/warped-pull [query]` | Searches Drive, downloads, converts, and writes to vault |

Skills use the `vault` MCP server for file access. Users who have not run `warped-reference/setup.sh` will see instructions in the terminal output to complete MCP setup.

---

## Bundled skill content (illustrative)

### `warped-review`

```markdown
---
description: Review a Hugo post against your configured content criteria
---

Review the file provided as an argument.

1. Read warped-obsidian to find the vault path and review criteria file.
2. Use the vault MCP server to read both files.
3. Evaluate the post against each criterion. For each:
   - State: pass or fail
   - One-sentence note explaining why
4. Return a summary: X/Y criteria passed.

If no criteria file is configured in warped-obsidian, report that and
suggest the user configure contentCriteriaPath in plugin settings.
```

### `warped-enhance`

```markdown
---
description: Add inline questions and suggestions to a document outline
---

Enhance the outline of the file provided as an argument.

1. Read warped-obsidian for vault context and style guide path.
2. Read the target file via the vault MCP server.
3. Read the style guide (if configured) via the vault MCP server.
4. For each section heading, add:
   - A question (if the section purpose is unclear)
   - A suggestion (if the section could be strengthened)
   - A style note (if a style guide rule applies)
   Format: <!-- Q: question --> or <!-- Suggest: suggestion -->
5. Return the modified document. Ask before writing it back to the file.
```

### `warped-todo`

```markdown
---
description: Review and triage TODO items across the Obsidian vault
---

Review TODO items in the vault.

1. Read warped-obsidian for vault path and TODO conventions.
2. Search vault files for lines containing #todo via the vault MCP server.
3. Group by: #focus items, #p0–#p4 by priority, untagged.
4. Identify: items with no priority, items tagged #focus with no deadline,
   items that look stale (no recent context in surrounding lines).
5. Return a triage report. Ask before making any changes to vault files.
```

### `warped-pull`

```markdown
---
description: Pull a Google Drive doc into the Obsidian vault
---

Pull a Drive document into the vault.

1. Use the vault MCP `pull` tool with the provided query or Drive path.
2. If multiple matches are found, list them and ask the user to pick one.
3. Report: vault path where the file was written, Drive source, sync timestamp.

Requires: vault MCP server (warped-reference setup.sh) with rclone configured.
```

---

## Skill file on disk

After sync, `~/.claude/skills/warped-review.md` is exactly the bundled content above (or the vault override if present). There is no post-processing — files are copied verbatim.

---

## Generated context file on disk

`~/.claude/rules/warped-obsidian.md` is written fresh on every sync. Example output:

```markdown
---
name: warped-obsidian
description: Obsidian vault context for this workspace
type: reference
---

# Obsidian Vault Context

Vault path: /Users/bruce/writing/notes
MCP server: vault (use vault MCP tools to read vault files)
Content paths: content/posts, content/notes

## Warped Todo conventions
- Tasks tagged with #todo in any markdown file
- Priority: #focus > #p0 > #p1 > #p2 > #p3 > #p4
- Completed: tag becomes #todone @YYYY-MM-DD, logged to TODONE.md
- Snoozed: #future or #snooze

## Hugo content conventions
- Draft: draft: true in frontmatter
- Publish: draft: false or field absent

## Content review criteria
Path: /Users/bruce/writing/notes/.claude/content-criteria.md
```

Fields only appear if the corresponding plugin is installed and configured. A vault with only warped-todo (no warped-hugo) would omit the Hugo section.

The MCP section always appears. If `warped-reference/setup.sh` has not been run, it shows:

```markdown
## MCP server
Status: not configured
To enable vault file access for skills, run: warped-reference/setup.sh
```

If configured:

```markdown
## MCP server
Status: configured (vault)
Skills use vault MCP tools to read and search vault files.
```
