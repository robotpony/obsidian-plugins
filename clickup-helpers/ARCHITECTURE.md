# Architecture: ClickUp Helpers (Obsidian Plugin)

## Summary

A personal Obsidian plugin that connects to the ClickUp REST API to support three workflows: generating release notes drafts from a ClickUp list, producing ticket review digests, and creating ClickUp tasks via a `[[cu:...]]` wiki-link-style syntax.

---

## Use Cases

### 1. Release Notes Generator
Pull all tasks from a configured ClickUp list (filtered by status/column, e.g. "Release Notes"), including their descriptions, comments, and attachment metadata. Send to an LLM to draft structured release notes. Write the result as a new note in the vault.

### 2. Ticket Review Digest
Fetch tickets created or updated since the last review (tracked via a stored timestamp). Send to an LLM to group by theme and produce a summary digest. Write as a new note.

### 3. [[cu:text]] Task Creation
An editor extension watches for the `[[cu:Task Title]]` pattern. On completion (closing `]]`), it calls the ClickUp API to create a task, then replaces the trigger text with a Markdown link to the new task.

---

## Connection Approach

**Direct ClickUp REST API v2** using a personal API token stored in plugin settings.

Reasons:
- No redirect server required (OAuth2 unnecessary for a personal plugin)
- Matches existing patterns in `space-command` (API URL + key in settings, persisted via Obsidian's `loadData()`/`saveData()`)
- ClickUp's personal API token has full read/write access to all workspaces the user belongs to

The token is stored in `data.json` (Obsidian's plugin data file) alongside other settings. It is never exposed in the vault itself.

---

## LLM Integration

Uses the same configurable LLM approach as `space-command`: a URL + model field in settings, calling the `/api/generate` endpoint (Ollama-compatible) or optionally a Claude-compatible endpoint.

For release notes and digest features, the plugin constructs a structured prompt from fetched ClickUp data and sends it to the configured LLM. The user can configure the system prompt per feature in settings.

---

## Data Flow

```
ClickUp API v2
    ↓  (personal token, requestUrl)
ClickUpClient
    ├── getListTasks(listId, filters)
    ├── getTaskComments(taskId)
    ├── getTaskAttachments(taskId)
    └── createTask(listId, title)
         ↓
Feature Processors
    ├── ReleaseNotesProcessor  →  LLMClient  →  NoteWriter  →  new vault note
    ├── TicketReviewProcessor  →  LLMClient  →  NoteWriter  →  new vault note
    └── TaskLinkExtension (CodeMirror)  →  ClickUpClient.createTask  →  editor replace
```

---

## Component Map

```
src/
├── types.ts                  # Settings, API response shapes, task interfaces
├── ClickUpClient.ts          # ClickUp REST API wrapper (fetch via requestUrl)
├── LLMClient.ts              # LLM prompt builder + API caller (reuse pattern from space-command)
├── ReleaseNotesProcessor.ts  # Fetches tasks+comments+attachments, calls LLM, returns markdown
├── TicketReviewProcessor.ts  # Fetches recent tasks, calls LLM for thematic grouping
├── TaskLinkExtension.ts      # CodeMirror 6 ViewPlugin: detects [[cu:...]] on close bracket
├── NoteWriter.ts             # Creates/opens new vault notes with generated content
└── SettingsTab.ts            # Plugin settings UI (token, default list, LLM config, prompts)

main.ts                       # Plugin entry point: registers commands, extensions, settings
manifest.json
package.json
esbuild.config.mjs
tsconfig.json
styles.css
```

---

## Key Interfaces

```typescript
// Settings (persisted in data.json)
interface ClickUpSettings {
  apiToken: string;
  defaultWorkspaceId: string;
  defaultListId: string;            // for new tasks created via [[cu:...]]
  releaseNotesListId: string;       // source list for release notes
  releaseNotesStatusFilter: string; // e.g., "Release Notes"
  releaseNotesFolder: string;       // vault folder for output notes
  digestFolder: string;             // vault folder for review digests
  lastReviewTimestamp: number;      // unix ms; updated after each digest run
  llmEnabled: boolean;
  llmUrl: string;
  llmModel: string;
  releaseNotesPrompt: string;
  ticketReviewPrompt: string;
}

// ClickUp task (minimal subset we care about)
interface CUTask {
  id: string;
  name: string;
  description: string;
  status: { status: string };
  url: string;
  date_created: string;
  date_updated: string;
  assignees: { username: string }[];
  comments?: CUComment[];
  attachments?: CUAttachment[];
}
```

---

## ClickUp API Endpoints Used

| Purpose | Endpoint |
|---|---|
| Get tasks in a list | `GET /list/{list_id}/task` |
| Get task comments | `GET /task/{task_id}/comment` |
| Get task attachments | `GET /task/{task_id}/attachment` |
| Create a task | `POST /list/{list_id}/task` |
| Get lists in a space | `GET /space/{space_id}/list` |
| Get spaces in workspace | `GET /team/{team_id}/space` |
| Get workspaces | `GET /team` |

All requests use the header `Authorization: {api_token}` (no "Bearer" prefix — ClickUp v2 style).

---

## [[cu:text]] Editor Extension

The `TaskLinkExtension` is a CodeMirror 6 `ViewPlugin`. It:

1. Listens for `docChanged` transactions
2. Scans each change for the pattern `[[cu:` followed by `]]`
3. On match: extracts the task title, calls `ClickUpClient.createTask()` async
4. Replaces the `[[cu:Task Title]]` span with `[Task Title](https://app.clickup.com/t/{id})`

The replacement happens in a follow-up transaction dispatched after the API call resolves. A loading indicator (appended to the token) shows while the request is in flight.

**Pattern matching**: The extension only triggers on the closing `]]`. It checks the full document for an open `[[cu:` at a position before the cursor.

---

## Decisions & Trade-offs

| Decision | Choice | Rationale |
|---|---|---|
| Auth | Personal API token | No server needed; this is a single-user plugin |
| ClickUp API version | v2 | Stable, well-documented; v3 is in beta |
| LLM integration | Configurable URL/model (Ollama-compatible) | Matches existing `space-command` pattern; works offline |
| Task link syntax | `[[cu:Title]]` → Markdown link | Feels like wiki-links; replaces completely so vault links stay clean |
| Note output | New file per run | Non-destructive; easy to compare versions across releases |
| Attachment handling | Metadata only (title, URL) | Attachments may be images/files not embeddable in Obsidian |
| Comments | Included in LLM context | Critical for release notes accuracy; truncated if too long |

---

## Decisions

| Question | Decision |
|---|---|
| Settings list/workspace IDs | Hierarchy browser: settings UI fetches workspace → space → list and populates dropdowns |
| Release notes format | Changelog style: grouped sections (Features, Bug Fixes, Improvements) with version + date header |
| `[[cu:Title]]` failure handling | Show Obsidian Notice with error message; leave `[[cu:Title]]` text in document so user can retry |
| Digest scope | Single configured list; user picks the list in settings via the hierarchy browser |
| Vault folder structure | User-configurable `releaseNotesFolder` and `digestFolder` in settings |

## Settings Hierarchy Browser

The settings tab calls `/team` to get workspaces, then `/team/{id}/space` for spaces, then `/space/{id}/list` for lists. Each section renders a dropdown that populates the next level. Selected IDs are stored in settings. This replaces manual ID entry entirely.
