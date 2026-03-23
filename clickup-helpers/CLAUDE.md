# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is Bruce's personal Obsidian notes repository containing work notes, weekly logs, project documentation, and release notes. The repository is tracked with git.

## Repository Structure

- `log/[year]/` - Weekly work logs, one file per week (e.g., `log/2026/March 23, 2026.md`)
- `product planning/` - Product briefs, PRDs, and planning docs organized by quarter
- `projects/` - Project-specific documentation
- `stories and notes/` - Research notes, breakdowns, and topic-specific write-ups
- `tmp/` - Spikes, drafts, and working documents not yet ready for permanent home
- `discussions/` - Meeting notes and call summaries
- `1-1s/` - One-on-one meeting notes organized by person
- `release-notes/` - Release notes and product documentation
- `todos/` - Task tracking; `done.md` holds completed items with `#todone` dates
- `wiki/` - Reference documentation
- `images/` - Image attachments only (no markdown notes)
- `_templates/` - Note templates for Obsidian
- `.obsidian/` - Obsidian configuration (do not modify)

## Important Conventions

### File Naming
- Weekly logs: `[Month D, YYYY].md` — e.g. `March 23, 2026.md`
- Older logs (pre-March 2026) used `Week of [Month] [Day ordinal].md`
- Project and discussion notes use descriptive names with spaces

### Weekly Log Structure
Weekly logs use the template at `_templates/Week of @date.md`:
```
# Goals/TODOs

# Context

# Release notes

# Eng Log

## Friday
## Thursday
## Wednesday
## Tuesday
## Monday

## Other
```

- `# Goals/TODOs` — open tasks for the week, tagged `#todo`, priority `#p0`–`#p4`
- `# Context` — carry-forward themes and decisions from the previous week (not tasks)
- `# Release notes` — drafts or published notes for that week's releases
- `# Eng Log` — daily meeting notes with `### [Meeting name]` subheadings, reverse chronological
- Tags inline: `#todo`, `#p0`–`#p4`, project tags like `#mta`, `#sfo`, `#onboarding`

### Task Syntax
- Open tasks: `- [ ] Task description #tags`
- Completed tasks use `#todone @YYYY-MM-DD` to mark completion with date
- Tasks can include priority tags: `#p0` (highest) through `#p4` (lowest)
- Completed tasks get moved to `todos/done.md`

### Obsidian Integration
- Preserve wiki-link syntax: `[[Page Name]]`
- Image embeds: `![[image.png]]`
- Do not modify `.obsidian/` configuration unless explicitly requested

## Working with Notes

### Creating New Notes
- Weekly logs go in `log/[year]/` named `[Month D, YYYY].md`
- Spikes, drafts, and POC documents go in `tmp/` until they have a permanent home
- Call summaries and meeting notes go in `discussions/`
- Use templates from `_templates/` as starting points

### Task Hygiene
- When a task is done: mark `- [x]`, add `#todone @YYYY-MM-DD`
- Completed tasks should not have mismatched state (`- [ ]` with `#todone` is a bug)
- Open tasks in logs older than 2 weeks are considered stale — close, carry forward, or delete
- `todos/done.md` is an archive; don't edit it manually
