# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## Build commands

```bash
npm install          # install dependencies
npm run dev          # watch mode (rebuilds on file changes)
npm run build        # production build (tsc -noEmit + esbuild)
npm test             # run vitest test suite
```

Build output is `main.js` at the repo root. To test in Obsidian, copy `main.js`, `manifest.json`, and `styles.css` to `<vault>/.obsidian/plugins/warped-todo/` (the plugin's `id` — unchanged even though the repo, package, and display name are now "Warped Command"). `./install.sh` automates this:

```bash
./install.sh           # interactive: pick vaults, build, and install
./install.sh -p         # reinstall to previously selected (cached) vaults
./install.sh -d 8       # deep search for nested vaults
```

Vault selections are cached in `.install-vaults` for reuse with `--previous`.

## Architecture

Warped Command is an Obsidian plugin for tracking TODOs, Ideas, and Principles across a vault, plus a Projects sidebar that syncs vault notes with git repos on disk. Vault items are tagged in markdown files (`#todo`, `#idea`, `#principle`); the plugin scans the vault, indexes them, and surfaces them in a custom sidebar with priority/focus/snooze workflows. The Projects sidebar finds git repos under a configured base folder, syncs a note per project (frontmatter git facts + `#todo`/`#idea`/`#bug` items parsed from each repo's `BUGS.md`/`TODO.md`/etc.), and lets you act on those items from Obsidian, writing back to the repo file. Desktop only (`isDesktopOnly: true`) — Projects needs Node `fs`/`child_process`. Full Projects design: [OUTLINE.md](OUTLINE.md), [DESIGN.md](DESIGN.md), [PLAN.md](PLAN.md).

### Entry point

[main.ts](main.ts) extends Obsidian's `Plugin`. On load it:

- Initializes `TodoScanner` (vault scan + file watchers)
- Wires `TodoProcessor` for completion/priority mutations
- Builds `ProjectManager` for tag-based grouping, merged with repo-derived data
- Builds `ProjectScanner`/`ProjectSyncManager` and starts the Projects file watcher (if a base folder is configured)
- Registers both sidebar views (TODOs and Projects)
- Registers `SlashCommandSuggest` (`/todo`, `/idea`, etc.) and `AtSuggest` (`@today`, `@handle`)
- Registers CodeMirror extensions for header sort and checkbox/tag sync
- Registers commands and the settings tab

### Source files (`src/`)

| File | Purpose |
|------|---------|
| [TodoScanner.ts](src/TodoScanner.ts) | Scans vault for `#todo`/`#todone`/`#idea`/`#principle`. Maintains per-file caches, watches file changes, emits `todos-updated` events. |
| [TodoProcessor.ts](src/TodoProcessor.ts) | Mutations: complete TODO (`#todo` → `#todone @date`, append to TODONE log), change priority, snooze, move file. |
| [ProjectManager.ts](src/ProjectManager.ts) | Aggregates items by project tag (excludes `#focus`/priority/lifecycle tags). Reads project description from project files. |
| [SidebarView.ts](src/SidebarView.ts) | Custom `ItemView` with TODOs / Ideas tabs, tag cloud, immersive Focus Mode, summary stats. Snoozed items are an ordinary tag (no dedicated tab), excluded only from the Focus Mode queue. |
| [ContextMenuHandler.ts](src/ContextMenuHandler.ts) | Right-click menu on sidebar rows: priority, focus, snooze, move, copy, delete. |
| [SlashCommandSuggest.ts](src/SlashCommandSuggest.ts) | Editor suggester for `/` at column 0: `/todo`, `/todos`, `/idea`, `/ideas`, `/today`, `/tomorrow`, `/callout`. |
| [AtSuggest.ts](src/AtSuggest.ts) | Editor suggester for `@`: dates (`@today`, `@tomorrow`, `@yesterday`, `@<date>`) and team mentions (`@<handle>`). |
| [TeamManager.ts](src/TeamManager.ts) | Parses `team.md`, watches for changes, resolves handles, auto-adds unknown mentions. |
| [MoveTargetModal.ts](src/MoveTargetModal.ts) | File picker for moving a TODO/idea to a different note. |
| [TabLockManager.ts](src/TabLockManager.ts) | Adds lock buttons to tab headers. Locked tabs open links in new tabs instead of replacing content. |
| [HeaderSortExtension.ts](src/HeaderSortExtension.ts) | CodeMirror extension that sorts header TODO children by priority. |
| [HeaderChecklistExtension.ts](src/HeaderChecklistExtension.ts) | CodeMirror extension syncing markdown checkbox state with `#todo`/`#todone` tags. |
| [SlackConverter.ts](src/SlackConverter.ts) | Converts markdown → Slack mrkdwn for clipboard copy. |
| [NotionConverter.ts](src/NotionConverter.ts) | Converts Obsidian markdown → plain markdown for Notion paste. |
| [types.ts](src/types.ts) | `TodoItem`, `ProjectInfo`, `WarpedTodoSettings`, `DEFAULT_SETTINGS`. |
| [utils.ts](src/utils.ts) | Shared helpers: tag extraction, date formatting, priority math, checkbox parsing, `modifyExternalFileLine` (single-line writes outside the vault). |
| [ProjectScanner.ts](src/ProjectScanner.ts) | Recursively finds git repos under a base folder (directory-`.git` only, submodules skipped); reads branch/status/remote via `git` (`execFile`). |
| [StructuredFileParser.ts](src/StructuredFileParser.ts) | Parses `BUGS.md`/`TODO.md`/etc. into `ParsedProjectItem[]`. Filename-based default type, explicit-tag override, flat-list or header-report shape (`###`-presence decides), item `shape` for completion routing. |
| [ProjectSyncManager.ts](src/ProjectSyncManager.ts) | Keeps each repo-matched project note in sync: frontmatter merge (sync-owned keys + `cssclasses`), delimited-block rewrite (preserves non-owned tags across resync by fingerprint match), `fs.watch`, manual sync entry point. |
| [ProjectItemMutator.ts](src/ProjectItemMutator.ts) | Mutates a `ParsedProjectItem`'s source line directly (external file, not the vault) — completion (by item `shape`), priority, add/remove tag. Mirrors `TodoProcessor`'s vault-item methods. |
| [HeaderBlockMover.ts](src/HeaderBlockMover.ts) | Multi-line block-move for `headerNested` items: cuts a `###` block and reinserts it under the first matching `##` status section (creating one if none exists), gated on a clean `git status` for that file. |
| [ProjectsSidebarView.ts](src/ProjectsSidebarView.ts) | Second sidebar: project list + per-project detail view (auto-follows the active file), merged synced/hand-typed item list, context menu (no "move"). |

### Data flow

1. **Scan**: `TodoScanner` reads all markdown files, extracts lines tagged `#todo` / `#todone` / `#idea` / `#principle`, skipping code blocks and inline backticked tags.
2. **Cache**: Results land in `Map<filePath, TodoItem[]>`. File watchers re-scan affected files; `todos-updated` fires on any change.
3. **Render**: The sidebar listens for `todos-updated` and re-renders. Filters (active tag, assignee, focus) apply at render time.
4. **Mutate**: User actions (checkbox click, context menu, slash command) call `TodoProcessor` which writes back to source and (for completion) appends to the TODONE log.
5. **Refresh**: Mutations trigger file changes → scanner rescans → events fire → sidebar re-renders.

## Conventions

- **Tag system**: `#todo`/`#todone` for tasks, `#idea` for captured ideas, `#principle` for guiding principles. Lifecycle: `#focus` (top priority), `#p0`–`#p4` (priority tiers), `#future`/`#snooze`/`#snoozed` (snoozed). Project tags are anything else.
- **Code-block safety**: The scanner tracks triple-backtick state and checks for inline backticks so `#todo` examples in code blocks are excluded.
- **Event-driven UI**: Scanner extends `Events`. Sidebar listens; no polling.
- **Settings tab**: `WarpedTodoSettingTab` is defined inline in [main.ts](main.ts).
- **Tests**: Live in `src/__tests__/`, run via vitest.

See [plugin-conventions.md](plugin-conventions.md) for the full UI/code
conventions reference: sidebar patterns, CSS naming, branding, button
styles, settings tab structure, TypeScript conventions, and file layout.

## Release checklist

When making changes, keep these in sync:

1. **Version** in `manifest.json`, `package.json`, and `CHANGELOG.md` (top-of-file entry)
2. **Documentation**: update `README.md` if user-visible features, settings, or vocabulary changed; update this file if architecture shifted

## Working with Claude Code

- Use `AskUserQuestion` when clarifying requirements or approach
- Run `npm run build` before declaring done; the build runs the type checker
