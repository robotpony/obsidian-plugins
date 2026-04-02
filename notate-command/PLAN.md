# Implementation Plan — notate-command

## Phase 1: Scaffold and core append

Set up the plugin skeleton and get a note appending to a file.

1. **Scaffold project files** — `manifest.json`, `package.json`, `tsconfig.json`, `esbuild.config.mjs` copied from an existing plugin and adapted. `npm install`.
2. **Define types** — `src/types.ts` with `NoteSettings`, `NoteEntry`, `DEFAULT_SETTINGS`.
3. **Build LogFileResolver** — Read Daily Notes config, fall back to settings folder. Support daily and weekly modes. Return vault-relative path.
4. **Build NoteAppender** — Accept text string, resolve file, find-or-create header section, append bullet. Use `app.vault.modify()` / `app.vault.create()`.
5. **Minimal main.ts** — Plugin loads settings, instantiates `NoteAppender`, registers a command that appends a hardcoded test note. Verify it writes to the correct file.

**Exit criteria**: Running the command appends a bullet to today's log file under the configured header.

## Phase 2: Sidebar UI

Build the sidebar with input and send.

1. **Build NoteSidebarView** — `ItemView` subclass with header (N⌘ logo, title, kebab menu), textarea, and send button.
2. **Wire SidebarManager** — Register view in `main.ts`, add toggle command and ribbon icon.
3. **Implement send** — Textarea submit on button click and Cmd+Enter. Call `NoteAppender.append()`, clear input, show notice via `createNoticeFactory`.
4. **Styles** — `styles.css` with purple branding, textarea styling, send button. Follow existing plugin CSS patterns.

**Exit criteria**: Sidebar opens, user types a note, sends it, and it appears in the log file. Notice confirms.

## Phase 3: History and navigation

Add the recent notes list with persistence.

1. **Build NoteHistory** — Extends `Events`. Stores entries, groups by file, serializes for `data.json`. Emits `"notes-updated"`.
2. **Persist history** — Save/load in `main.ts` via `loadData()`/`saveData()`. Restore on plugin load.
3. **Render history in sidebar** — Grouped list below textarea. Each row: filename, count, arrow button.
4. **File navigation** — Arrow click opens the log file in Obsidian and scrolls to the header section using `app.workspace.openLinkText()`.

**Exit criteria**: Recent notes appear in sidebar, persist across restarts, and clicking a row opens the file at the right section.

## Phase 4: Settings and polish

1. **Settings tab** — About section with N⌘ logo. Settings for header text, header level, log mode, log folder, recent notes limit.
2. **Settings refresh** — Changing settings triggers sidebar refresh via `SidebarManager`.
3. **Edge cases** — Empty textarea (disable send), very long notes, missing folder creation, file locked by another process.
4. **Quick-note command** — Modal-based input for adding a note without the sidebar open.

**Exit criteria**: All settings work, sidebar updates on settings change, edge cases handled.
