# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
npm install          # Install dependencies
npm run dev          # Watch mode (rebuilds on file changes)
npm run build        # Production build (runs tsc + esbuild)
```

The build output is `main.js` in the project root. For testing, copy `main.js`, `manifest.json`, and `styles.css` to `.obsidian/plugins/space-command/` in an Obsidian vault.

## Architecture Overview

This is **Space Command** (`space-command`), an Obsidian plugin for tracking TODOs/TODONEs across a vault.

### Entry Point and Core Flow

[main.ts](main.ts) - Plugin entry point extending `Plugin`. Initializes all components and registers:
- Markdown post-processors for `{{focus-todos}}` inline syntax (Reading Mode only)
- Code block processors for `` ```focus-todos `` and `` ```focus-list `` (works in Live Preview)
- Editor suggesters for `/` slash commands and `@date` quick insert
- Commands, ribbon icon, settings tab, and sidebar view

### Key Components (src/)

| Component | Purpose |
|-----------|---------|
| [TodoScanner.ts](src/TodoScanner.ts) | Scans vault for `#todo`/`#todone` tags, maintains cache, watches file changes. Extends `Events` for reactive updates. |
| [TodoProcessor.ts](src/TodoProcessor.ts) | Handles TODO completion: updates source file (`#todo` → `#todone @date`), appends to TODONE log file. Also handles priority tag changes. |
| [EmbedRenderer.ts](src/EmbedRenderer.ts) | Renders TODO lists in embeds. Handles inline markdown parsing (bold, italic, code, links) with XSS-safe DOM methods. |
| [CodeBlockProcessor.ts](src/CodeBlockProcessor.ts) | Processes `` ```focus-todos `` and `` ```focus-list `` code blocks for Live Preview support. |
| [FilterParser.ts](src/FilterParser.ts) | Parses filter syntax: `path:folder/`, `tags:#tag1,#tag2`, `limit:N` |
| [SidebarView.ts](src/SidebarView.ts) | Custom sidebar view showing Active TODOs, Projects, Recent TODONEs |
| [ProjectManager.ts](src/ProjectManager.ts) | Groups TODOs by project tags (excludes priority tags like #p0-#p4) |
| [ContextMenuHandler.ts](src/ContextMenuHandler.ts) | Right-click context menu for priority actions (Focus, Later, Snooze) |
| [SlashCommandSuggest.ts](src/SlashCommandSuggest.ts) | EditorSuggest for `/` commands at column 0: `/todo`, `/callout`, `/today`, `/tomorrow` |
| [DateSuggest.ts](src/DateSuggest.ts) | EditorSuggest for `@date`, `@today`, `@tomorrow`, `@yesterday` quick insert |
| [types.ts](src/types.ts) | TypeScript interfaces: `TodoItem`, `TodoFilters`, `ProjectInfo`, `SpaceCommandSettings` |

### Data Flow

1. **Scan**: `TodoScanner` reads all markdown files, extracts lines with `#todo`/`#todone` (skipping code blocks)
2. **Cache**: Results stored in `Map<filePath, TodoItem[]>`, emits `todos-updated` event on changes
3. **Render**: `EmbedRenderer`/`CodeBlockProcessor` query scanner, apply filters, render interactive checkboxes
4. **Complete**: Checkbox click → `TodoProcessor.completeTodo()` → updates source + appends to TODONE file
5. **Refresh**: File watchers trigger rescan, events propagate to UI

### Embed Syntax

- Inline (Reading Mode only): `{{focus-todos}}`, `{{focus-todos: file.md | path:x/ tags:#y}}`
- Code blocks (Live Preview): `` ```focus-todos `` with optional file/filters on separate lines

## Key Patterns

- **Event-driven updates**: Scanner extends `Events`, sidebar/embeds listen for `todos-updated`
- **Priority system**: Tags #p0 (highest) → #p4 (lowest), #focus for top priority, #future for snoozed
- **Safe markdown rendering**: `EmbedRenderer.renderInlineMarkdown()` uses DOM methods to avoid XSS
- **Code block detection**: Scanner tracks triple-backtick state and checks for inline backticks to exclude code examples

## Changelog

Update [CHANGELOG.md](CHANGELOG.md) with each release following the existing format.

## Other rules

- When clarifying requirements or approach, use AskUserQuestion
