# Architecture — notate-command

Quick-capture plugin that appends notes to daily or weekly log files under a configurable markdown header section.

## Data Flow

```
User types note in sidebar
        │
        ▼
  NoteAppender.append(text)
        │
        ├─ Resolve target log file (daily/weekly)
        │    ├─ Try Obsidian Daily Notes plugin config for folder + format
        │    └─ Fall back to plugin setting (custom folder path)
        │
        ├─ Create file if missing
        │
        ├─ Find or create header section (e.g. "## Misc. notes #nc")
        │
        ├─ Append "- {text}" as bullet under section
        │
        └─ Update persisted recent-notes list → emit "notes-updated"
                                                      │
                                                      ▼
                                              Sidebar re-renders
```

## Components

### main.ts — Plugin entry point

Responsibilities:
- Load/save settings (merge with defaults)
- Instantiate `NoteAppender` and `NoteHistory`
- Register sidebar view, commands, ribbon icon
- Wire `SidebarManager` from shared
- Settings tab (inline `PluginSettingTab`)

### src/NoteAppender.ts — Core write logic

Single responsibility: append a note string to the correct log file.

```ts
class NoteAppender {
  constructor(app: App, settings: NoteSettings, history: NoteHistory)

  async append(text: string): Promise<Result<NoteEntry, string>>
}
```

Steps:
1. Determine target file path via `LogFileResolver`
2. Read file content (or empty string if new file)
3. Find header section by matching `## {headerText}` line
4. If section missing, append header + note at end of file
5. If section found, insert bullet after last bullet in that section (before next heading or EOF)
6. Write file via `app.vault.modify()` or `app.vault.create()`
7. Add entry to `NoteHistory`, return the entry

### src/LogFileResolver.ts — File path resolution

Resolves the target log file path for today (or this week).

```ts
class LogFileResolver {
  constructor(app: App, settings: NoteSettings)

  resolve(): { folder: string, filename: string, path: string }
}
```

Strategy:
1. Read Obsidian's Daily Notes core plugin config (`this.app.internalPlugins`) for folder and date format
2. If unavailable or disabled, use `settings.logFolder` and a default format (`YYYY-MM-DD`)
3. For weekly mode, use `YYYY-[W]ww` format (ISO week)
4. Return full vault-relative path

### src/NoteHistory.ts — Recent notes persistence

Manages an ordered list of recent note entries, persisted in plugin `data.json`.

```ts
class NoteHistory extends Events {
  constructor(maxEntries: number)

  add(entry: NoteEntry): void        // prepend, trim to max, emit "notes-updated"
  getAll(): NoteEntry[]
  getGrouped(): Map<string, NoteEntry[]>  // grouped by file path
  load(data: NoteEntry[]): void      // restore from plugin data
  serialize(): NoteEntry[]           // for saving to plugin data
}
```

Extends Obsidian's `Events` so the sidebar can listen for `"notes-updated"`.

### src/NoteSidebarView.ts — Sidebar UI

Extends `ItemView`. Two zones:

1. **Input zone**: textarea + send button
2. **History zone**: recent notes grouped by log file, with navigation arrows

Listens to `NoteHistory` for `"notes-updated"` events to re-render.

### src/types.ts — Interfaces and defaults

```ts
interface NoteSettings {
  headerText: string        // default: "Misc. notes #nc"
  headerLevel: number       // default: 2 (##)
  recentNotesLimit: number  // default: 50
  logFolder: string         // fallback folder, default: ""
  logMode: "daily" | "weekly"  // default: "daily"
}

interface NoteEntry {
  text: string
  filePath: string
  timestamp: number   // epoch ms
}
```

## Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Log file resolution | Daily Notes config with custom fallback | Respects user's existing setup; works without Daily Notes plugin |
| Section insertion | Find-or-create header | Zero manual setup; notes always land somewhere |
| Note format | Bullet list items (`- text`) | Clean markdown, easy to scan, works with Obsidian's list features |
| History storage | Plugin `data.json` | Instant sidebar render on load; no vault scan needed |
| History updates | `Events` emitter | Matches space-command/link-command pattern; sidebar stays decoupled |
| Branding | N⌘ purple `#8b5cf6` | Distinct from existing blue/orange/green plugins |

## Shared Module Usage

| Import | Purpose |
|--------|---------|
| `SidebarManager` | Sidebar toggle, activate, refresh lifecycle |
| `createNoticeFactory` | Branded notices ("N⌘ Note added") |
| `Result` types | Error handling for append operations |

## File Structure

```
notate-command/
├── main.ts                 # Plugin entry, settings tab
├── manifest.json
├── package.json
├── styles.css
├── esbuild.config.mjs
├── tsconfig.json
└── src/
    ├── types.ts            # NoteSettings, NoteEntry, defaults
    ├── NoteAppender.ts     # Core append logic
    ├── LogFileResolver.ts  # Daily/weekly file path resolution
    ├── NoteHistory.ts      # Recent notes with persistence
    └── NoteSidebarView.ts  # Sidebar ItemView
```
