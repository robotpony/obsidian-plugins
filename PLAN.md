# Plan: Claude Helpers

Phased implementation plan for the Claude Helpers feature in `warped-reference`.

See ARCHITECTURE.md for component design and DESIGN.md for UI/UX details.

---

## Phase 1: Install infrastructure

**Goal:** "Sync Claude Helpers" command works. Skills and rules land in `~/.claude/`. Manifest tracks what was installed.

**Tasks:**

1. Add `helpers` settings block to `GCommandSettings`:
   ```typescript
   helpers: {
     enabled: boolean;
     installedSkills: string[];      // which skills are checked in UI
     contentCriteriaPath: string;    // vault path to criteria file
     styleGuidePath: string;         // vault path to style guide
     lastSync: string | null;        // ISO timestamp of last sync
   }
   ```

2. Create `src/ClaudeHelpersManager.ts`:
   - `sync()`: resolve skills → hash check → write changed files → write manifest → return `SyncResult`
   - `uninstall()`: remove all `warped-*` files from `~/.claude/`
   - `generateContext()`: assemble `warped-obsidian.md` from settings + installed plugins
   - `resolveSkill(name)`: check `<vault>/.claude/skills/<name>.md`, fall back to bundled
   - `resolveRule(name)`: check `<vault>/.claude/rules/<name>.md`, fall back to bundled

3. Create `src/helpers/skills.ts`: bundled skill string constants (stubs first — content in Phase 2).

4. Add "Claude Helpers" settings section to `main.ts`:
   - Skill checkboxes
   - Content criteria path input
   - Style guide path input
   - Sync button with last-synced time
   - Vault override note

5. Register "Sync Claude Helpers" command in `onload()`.

**Done when:** Sync button writes stub skill files to `~/.claude/skills/`, manifest is written, vault override resolution works.

---

## Phase 2: Core skills

**Goal:** Three working skills that Claude can invoke meaningfully in a session that has the vault MCP configured.

**Tasks:**

1. Author `warped-review.md`:
   - Reads `warped-obsidian.md` for criteria path
   - Reads criteria file via MCP
   - Reads target file via MCP
   - Returns pass/fail checklist

2. Author `warped-enhance.md`:
   - Reads `warped-obsidian.md` for style guide path
   - Reads target file and style guide via MCP
   - Returns document with inline HTML comment annotations
   - Asks before writing back

3. Author `warped-write.md`:
   - Accepts a writing instruction as argument
   - Reads target file or uses conversation context
   - Applies instruction (rewrite, expand, trim, tone shift)
   - Returns result; asks before writing back

4. Author `warped-obsidian.md` context template in `ContextWriter`:
   - Detects installed plugins (check for `data.json` in `.obsidian/plugins/`)
   - Includes warped-todo conventions if plugin is installed
   - Includes Hugo content conventions if warped-hugo is installed
   - Includes criteria path if configured

**Done when:** `/warped-review`, `/warped-enhance`, `/warped-write` are usable in a Claude Code session with vault MCP connected.

---

## Phase 3: Workflow skills

**Goal:** TODO management and Drive pull helpers that tie into the full warped ecosystem.

**Tasks:**

1. Author `warped-todo.md`:
   - Uses vault MCP `search` tool to find `#todo` occurrences
   - Groups by priority tier
   - Identifies stale or unprioritized items
   - Returns a triage report; asks before changing any files

2. Author `warped-pull.md`:
   - Wraps the MCP `pull` tool (planned in warped-reference Phase 4)
   - Handles the "multiple matches" disambiguation flow
   - Reports vault path + Drive source on success

3. Add optional `warped-writing.md` rule:
   - If `styleGuidePath` is configured and file exists: copy verbatim to `~/.claude/rules/warped-writing.md`
   - Skills reference it for style guidance without inlining the full guide

**Done when:** `/warped-todo` and `/warped-pull` work end-to-end. MCP `pull` tool (warped-reference Phase 4) must be complete for `/warped-pull` to function.

---

## Phase 4: Polish

**Goal:** The sync experience is informative and the UI shows override status.

**Tasks:**

1. Delta sync reporting:
   - Notice shows file-level diff: "Wrote: warped-review (updated), warped-obsidian (regenerated). Skipped: 4 unchanged."
   - Console log for debugging

2. Override status in settings UI:
   - Each skill checkbox shows "(custom)" if a vault override exists at `<vault>/.claude/skills/<name>.md`
   - Hovering "(custom)" shows the override file path

3. Skill version tracking:
   - Bundled skills carry a version string in frontmatter (`version: 1.2`)
   - Manifest stores the version of each installed skill
   - When plugin updates include new skill versions, the next sync flags "skill updated" in the notice

4. Uninstall UX:
   - "Remove Claude Helpers" button in settings (under a disclosure triangle to avoid accidents)
   - Confirms before removing; shows which files will be deleted

---

## Dependency on warped-reference Phase 4

`/warped-pull` requires the MCP `pull` tool described in `warped-reference/ARCHITECTURE.md § Phase 4`. That phase involves:
- Extracting the convert module to `src/convert/`
- Adding `vault-provider.ts` and `vault-discovery.ts` to the MCP server
- Implementing the `pull` tool in `src/gdrive/index.ts`

Phases 1–3 of Claude Helpers can ship before Phase 4 of warped-reference. The `warped-pull.md` skill stub can be installed and will gracefully report that the `pull` tool is not yet available if a user tries it early.

---

## What is explicitly out of scope

- **Obsidian plugin calling Claude API directly.** All LLM execution is in the user's Claude Code terminal.
- **Real-time sync.** Sync is user-triggered. No file watchers.
- **Skill authoring UI in Obsidian.** Users author vault override skills as plain markdown files.
- **Multi-vault skill isolation.** Skills are written to `~/.claude/` globally. Vault-specific overrides are a user responsibility.
- **Windows support.** `os.homedir()` works on Windows, but `~/.claude/` path conventions may differ. Deferred.
