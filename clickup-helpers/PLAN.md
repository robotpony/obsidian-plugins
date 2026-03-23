# Implementation Plan: ClickUp Helpers

## Overview

Four phases. Each phase produces working, testable code before the next begins. Phases 3 and 4 (release notes and digest) share enough infrastructure that phase 2 must be complete before either starts.

---

## Phase 1: Project Scaffolding

Goal: a compilable Obsidian plugin skeleton that loads without errors.

**Deliverables:**

- `manifest.json` — plugin ID, name, min Obsidian version
- `package.json` — dependencies: `obsidian`, `typescript`, `esbuild`, `@codemirror/view`, `@codemirror/state`
- `tsconfig.json` — strict mode, target ES2018, Obsidian-compatible module settings
- `esbuild.config.mjs` — bundles `main.ts` → `main.js`, externalizes `obsidian`
- `styles.css` — empty placeholder
- `src/types.ts` — `ClickUpSettings` interface and all ClickUp API response shapes (`CUTask`, `CUComment`, `CUAttachment`, `CUWorkspace`, `CUSpace`, `CUList`)
- `main.ts` — minimal `Plugin` subclass: `onload()`, `onunload()`, settings load/save, settings tab registration

**Done when:** `npm run build` succeeds and the plugin activates in Obsidian with no console errors.

---

## Phase 2: ClickUp Client + Settings Tab

Goal: settings UI works end-to-end; hierarchy browser resolves workspace → space → list.

**Deliverables:**

- `src/ClickUpClient.ts`
  - Constructor takes `apiToken: string`
  - `getWorkspaces()` → `CUWorkspace[]`
  - `getSpaces(workspaceId)` → `CUSpace[]`
  - `getLists(spaceId)` → `CUList[]`
  - `getListTasks(listId, filters?)` → `CUTask[]`
  - `getTaskComments(taskId)` → `CUComment[]`
  - `getTaskAttachments(taskId)` → `CUAttachment[]`
  - `createTask(listId, title)` → `{ id: string; url: string }`
  - All calls via Obsidian's `requestUrl()` (not `fetch`) to avoid CORS issues

- `src/SettingsTab.ts`
  - API token input (password field)
  - "Reload" button triggers workspace fetch; populates workspace dropdown
  - Workspace selection triggers space fetch; populates space dropdown
  - Space selection triggers list fetch; populates list dropdowns:
    - Default list (for `[[cu:...]]` task creation)
    - Release notes source list
    - Digest source list
  - Release notes folder and digest folder (text inputs)
  - LLM section: enabled toggle, URL, model, per-feature system prompt textareas
  - Settings persist immediately on change via `this.plugin.saveSettings()`

**Done when:** API token + hierarchy browser resolves correctly in settings; selected IDs persist across Obsidian restarts.

---

## Phase 3: Release Notes Generator

Goal: command fetches tasks from the configured list, calls LLM, writes a new vault note.

**Deliverables:**

- `src/LLMClient.ts`
  - Constructor takes `{ url, model }` from settings
  - `generate(systemPrompt: string, userContent: string)` → `string`
  - Calls the Ollama-compatible `/api/generate` endpoint
  - Streams or buffers response; returns full text

- `src/ReleaseNotesProcessor.ts`
  - `run(settings: ClickUpSettings)` → `string` (markdown)
  - Fetches all tasks from `releaseNotesListId` matching `releaseNotesStatusFilter`
  - For each task: fetches comments and attachment metadata
  - Builds a structured prompt: task list with descriptions, comments, attachment titles
  - Sends to `LLMClient.generate()` with the release notes system prompt
  - Returns LLM output

- `src/NoteWriter.ts`
  - `write(folder: string, filename: string, content: string)` → opens the new note
  - Creates folder if it doesn't exist
  - Uses `app.vault.create()` or `app.vault.modify()` if file exists

- `main.ts` addition: register command "Generate release notes"
  - Shows notice "Fetching tasks…"
  - Calls `ReleaseNotesProcessor.run()`
  - Calls `NoteWriter.write()` with timestamped filename
  - Shows notice "Release notes written to [path]"

**Release notes format:**

```
## v[version] — [date]

### Features
- ...

### Bug Fixes
- ...

### Improvements
- ...
```

The system prompt instructs the LLM to produce this exact structure. Version and date come from settings or are inferred from the current date.

**Done when:** command produces a correctly formatted note in the configured folder.

---

## Phase 4: Ticket Review Digest

Goal: command fetches recent tasks, summarizes them by theme, writes a digest note.

**Deliverables:**

- `src/TicketReviewProcessor.ts`
  - `run(settings: ClickUpSettings)` → `string` (markdown)
  - Fetches tasks from `digestListId` updated since `settings.lastReviewTimestamp`
  - Builds prompt with task names, statuses, assignees, and brief descriptions
  - Sends to `LLMClient.generate()` with the digest system prompt
  - After successful generation: updates `settings.lastReviewTimestamp` to `Date.now()`

- `main.ts` addition: register command "Generate ticket digest"
  - Shows notice with count of tickets found since last review
  - Calls `TicketReviewProcessor.run()`
  - Calls `NoteWriter.write()` with timestamped filename
  - Saves updated `lastReviewTimestamp` to settings

**Digest format:**

```
## Ticket Review — [date]
### Since: [last review date]

### [Theme]
- **[Task name]** (status) — brief summary

### [Theme]
...
```

**Done when:** digest command produces a grouped summary note; timestamp advances correctly after each run.

---

## Phase 5: `[[cu:Title]]` Editor Extension

Goal: typing `[[cu:Task Title]]` in any note creates a ClickUp task and replaces the text with a Markdown link.

**Deliverables:**

- `src/TaskLinkExtension.ts`
  - CodeMirror 6 `ViewPlugin`
  - Listens for `docChanged` transactions
  - On each change: scans for completed `[[cu:...]]` pattern (closing `]]` just inserted)
  - Extracts title, dispatches async task creation:
    1. Replace `[[cu:Title]]` with `[[cu:Title ⏳]]` immediately (loading indicator)
    2. Call `ClickUpClient.createTask(defaultListId, title)`
    3. On success: replace span with `[Title](https://app.clickup.com/t/{id})`
    4. On failure: replace span with original `[[cu:Title]]`, show Obsidian Notice with error

- `main.ts` addition: register the CodeMirror extension via `this.registerEditorExtension()`

**Pattern matching rules:**
- Only triggers on the exact closing `]]` character being inserted
- Requires `[[cu:` prefix before the cursor (scans backward from close)
- Does not trigger inside code blocks or front matter

**Done when:** typing `[[cu:My Task]]` in a note creates the task in ClickUp and the text becomes `[My Task](https://app.clickup.com/t/abc123)`.

---

## Dependency Graph

```
Phase 1 (scaffold)
    └── Phase 2 (ClickUpClient + settings)
            ├── Phase 3 (release notes)  ← needs LLMClient too
            ├── Phase 4 (digest)         ← needs LLMClient too
            └── Phase 5 (editor ext)     ← only needs ClickUpClient
```

Phases 3 and 4 can proceed in parallel once Phase 2 is complete. Phase 5 is independent of 3 and 4.

---

## Out of Scope

- OAuth2 / multi-user auth
- ClickUp webhooks (polling is sufficient for a personal plugin)
- Editing or deleting ClickUp tasks from Obsidian
- Syncing task status back to Obsidian
- ClickUp v3 API (use v2 until v3 is stable)
