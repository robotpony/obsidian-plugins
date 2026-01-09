# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Context

This is an **Obsidian plugin development directory** within a personal Obsidian vault at `/Users/brucealderson/notes`. The vault contains personal notes, project ideas, writing, and daily/weekly logs.

The parent vault structure:
- `_plugins/` - This directory for custom Obsidian plugins
- `_templates/` - Obsidian templates (e.g., weekly log template)
- `log/` - Daily and weekly logs with embedded focus lists
- `ideas/` - Notes about application, game, tool, and Obsidian workflow ideas
- `projects/` - Project documentation and planning
- `writing/` - Essays and stories
- `thoughts/` - General thoughts and principles
- `todo/` - TODO tracking directory
- `.obsidian/` - Obsidian configuration (ignored in git)

## Plugin Development Goals

Based on [README.md](README.md), the primary goal is to create **⌥⌘ Space Command** (where "⌥⌘" is shorthand for "Space Command" using macOS modifier key symbols) - a comprehensive plugin for managing workflows across the vault.

### ⌥⌘ TODOs - The TODO/TODONE System
- **TODOs**: Tasks tagged with `#todo` anywhere in the vault
- **TODONEs**: Completed tasks tagged with `#todone`
- Plugin should provide live embeds of TODOs as interactive checklists
- Example syntax: `{{focus-todos: todos/done.md}}`
- Checklist items format: `- [ ] task text #todo →` (with link to source file)
- When checked off, tag updates to `#todone` and completion date is logged
- Completed TODOs logged to a file (default: TODONEs.md) with format: `- [x] task #todone @2025/10/24`
- Optional sidebar showing interactive TODOs/TODONEs

## Obsidian Plugin Architecture

When developing Obsidian plugins:
- Plugins are TypeScript/JavaScript modules that hook into Obsidian's API
- Main entry point extends the `Plugin` class from `obsidian` module
- Access to vault files via `this.app.vault` API
- UI components: modals, views, status bar items, ribbons
- Register commands, events, and editor extensions
- Use `manifest.json` to declare plugin metadata

## Workflow and Templates

The vault uses:
- **Weekly templates**: Located in `_templates/Week of {{date}}.md`, contains `![[focus-list]]` embed
- **Focus list**: [log/focus-list.md](../log/focus-list.md) - central focus tracking
- **Tag-based organization**: Projects use tags like `#MFA`, `#SFO`, `#AaN`

## Development Philosophy

Per [ideas/Obsidian Workflows.md](../ideas/Obsidian%20Workflows.md), there are extensive ideas for:
1. Tag summarization and embedding
2. Template-based automation (release notes, Slack threads)
3. Smart TODO systems with filtering and dashboards
4. Project tracking and metrics
5. External integrations (e.g., ClickUp)

Start with the TODO/TODONE system described in the README before expanding to other features.

## Important Notes

- This is a **personal vault** - respect privacy and don't commit actual note content
- The `.obsidian` directory is gitignored and should remain so
- When creating plugins, follow Obsidian's plugin development best practices
- Test plugins thoroughly to avoid data loss in the vault
- When clarifying requirements or approach, use AskUserQuestion
