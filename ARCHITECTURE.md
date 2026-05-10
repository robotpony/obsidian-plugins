# Architecture: Claude Helpers

> These docs live at the mono-repo root because Claude Helpers spans all three plugins (warped-reference, warped-todo, warped-hugo). The implementation lives in `warped-reference/src/ClaudeHelpersManager.ts`.

Claude Helpers is a new component of `warped-reference`. It makes the Obsidian plugin a **Claude Code configuration manager**: the plugin writes skill and rule files into `~/.claude/` so those helpers are available in any Claude Code session the user opens in their terminal.

The plugin installs. Claude Code executes. No inter-process communication is needed.

---

## System overview

```
Obsidian plugin (warped-reference)
  ClaudeHelpersManager
    |
    |-- reads: vault settings (warped-todo, warped-hugo, warped-reference)
    |-- reads: bundled skill/rule defaults (embedded in plugin bundle)
    |-- reads: vault overrides at <vault>/.claude/skills/*.md
    |
    +--> writes: ~/.claude/skills/warped-*.md
    +--> writes: ~/.claude/rules/warped-obsidian.md
    +--> writes: ~/.claude/rules/warped-writing.md   (optional)
    +--> writes: ~/.claude/warped-manifest.json

User terminal (Claude Code)
  /warped-review   → Claude reads skill, runs review against vault file
  /warped-enhance  → Claude reads skill, enhances outline
  /warped-todo     → Claude reads skill, reviews TODOs
  /warped-write    → Claude reads skill, assists with writing
  /warped-pull     → Claude reads skill, calls MCP pull tool
```

Claude Code automatically picks up any `~/.claude/skills/` and `~/.claude/rules/` files. Installing the Obsidian plugin, enabling helpers, and clicking "Sync" is the entire setup step.

---

## Core decisions

### Plugin as installer, not executor

The plugin has no Claude API dependency and no runtime LLM calls. It writes static files. The user runs Claude Code in their normal terminal workflow; the skill files are already there.

This keeps the plugin simple, removes API key management, and means all LLM execution happens where the user already has context and audit.

### `~/.claude/` as target

Skills and rules written to `~/.claude/` are available globally, regardless of what directory the user runs Claude Code from. If the user prefers vault-local skills (active only when `cd`d into the vault), they can place overrides in `<vault>/.claude/skills/` instead — but the plugin installs globally for convenience.

### Vault override pattern

For each skill and rule file, the manager checks for a vault-local version first:

```
<vault>/.claude/skills/<name>.md   →   overrides bundled default
<vault>/.claude/rules/<name>.md    →   overrides bundled default
```

If a vault override exists, it is copied verbatim to `~/.claude/`. This lets users customise any skill without modifying the plugin bundle.

### Context file generated, not static

`~/.claude/rules/warped-obsidian.md` is not a bundled file. It is generated at sync time from the current plugin settings (vault path, content paths, TODO conventions, review criteria). This file gives every skill the vault-specific context it needs to be useful without requiring the user to pass arguments.

### Manifest for delta sync

`~/.claude/warped-manifest.json` records each installed file with its content hash and source (bundled or vault override). On subsequent syncs, unchanged files are skipped and the user sees a diff summary.

---

## Components

### `ClaudeHelpersManager` (`warped-reference/src/ClaudeHelpersManager.ts`)

Core orchestration class. Constructed with `app: App` and `settings: GCommandSettings`.

```typescript
class ClaudeHelpersManager {
  async sync(): Promise<SyncResult>       // main entry point
  async uninstall(): Promise<void>        // removes all warped-* files from ~/.claude

  private resolveSkill(name: string): string      // vault override > bundled default
  private resolveRule(name: string): string | null // null if rule not applicable
  private generateContext(): string               // warped-obsidian.md content
  private claudeDir(): string                     // os.homedir() + "/.claude"
  private readManifest(): HelpersManifest
  private writeManifest(m: HelpersManifest): void
}
```

`SyncResult`:
```typescript
interface SyncResult {
  written: string[];    // files that changed or were created
  skipped: string[];    // files unchanged (hash match)
  removed: string[];    // files in manifest that are now disabled
}
```

### `SkillResolver`

Stateless. Checks `<vault>/.claude/skills/<name>.md` on disk; falls back to the bundled string constant for that skill. Returns file content as a string.

### `ContextWriter`

Reads `app.vault.getRoot().path` (vault path), `settings.contentPaths`, and any warped-todo or warped-hugo settings accessible from plugin data. Produces the `warped-obsidian.md` body.

### Bundled skill files

Skill files are embedded in the plugin bundle as TypeScript string constants in `src/helpers/skills.ts`. Each constant is the complete markdown content of one skill file.

```typescript
export const SKILLS: Record<string, string> = {
  "warped-review": `---\ndescription: ...\n---\n...`,
  "warped-enhance": `...`,
  // ...
}

export const RULES: Record<string, string> = {
  "warped-writing": `...`,
}
```

---

## Installed file layout

```
~/.claude/
  skills/
    warped-review.md      review post against configured criteria
    warped-enhance.md     enhance outline with inline questions/suggestions
    warped-write.md       rewrite, expand, or summarize selected text
    warped-todo.md        review and triage TODO items in vault
    warped-pull.md        pull a Drive doc into vault via MCP pull tool
  rules/
    warped-obsidian.md    auto-generated vault context (path, MCP, conventions)
    warped-writing.md     writing style guide (optional; from configured vault file)
  warped-manifest.json    tracks installed files: hash, source, version, timestamp
```

All installed files use the `warped-` prefix to namespace them and make uninstall safe (remove only `warped-*`).

---

## Skill file format

Skill files are standard Claude Code skill markdown with YAML frontmatter:

```markdown
---
description: Review a Hugo post against your configured content criteria
---

Review the file passed as an argument against the content criteria
defined in the warped-obsidian context.

Steps:
1. Read the vault context from warped-obsidian to find criteria path
2. Read the file (use the vault MCP server)
3. Evaluate each criterion: pass/fail with a brief note
4. Return a structured checklist

...
```

The `description` field is shown in the Claude Code skill picker. The body is the instruction Claude follows when the skill is invoked.

---

## Context file format (`warped-obsidian.md`)

Generated from plugin settings at sync time:

```markdown
---
name: warped-obsidian
description: Obsidian vault context for this workspace
type: reference
---

# Obsidian Vault Context

Vault path: /Users/bruce/notes
MCP server: vault (registered in Claude Code — use vault tools to read files)
Content paths: content/posts, content/notes

## Warped Todo conventions
- Tasks tagged with #todo in any markdown file
- Priority: #focus > #p0 > #p1 > #p2 > #p3 > #p4
- Completed: tag becomes #todone @YYYY-MM-DD, logged to TODONE.md
- Snoozed: #future or #snooze moves task to Snoozed tab
- Delegation: @handle assigns to a person; resolved from team.md

## Hugo content conventions
- Draft: draft: true in frontmatter
- Publish: draft: false or field absent
- Default status filter: Drafts

## Content review criteria
[included inline if contentCriteriaPath is configured and file exists]

## Writing style guide
[path only, not inlined: warped-writing.md contains the full guide]
```

---

## Data flow on sync

```
User: "Sync Claude Helpers" command in Obsidian
  |
  ClaudeHelpersManager.sync()
    |
    readManifest()                     # load ~/.claude/warped-manifest.json
    |
    for each skill in settings.installedSkills:
      resolveSkill(name)               # vault override > bundled
      hash = sha256(content)
      if manifest[name].hash === hash: skip  →  result.skipped.push(name)
      else:
        writeFile(~/.claude/skills/<name>.md, content)
        result.written.push(name)
    |
    generateContext()                  # assemble warped-obsidian.md
    writeFile(~/.claude/rules/warped-obsidian.md, context)
    |
    if styleGuidePath configured and file exists in vault:
      content = readVaultFile(styleGuidePath)
      writeFile(~/.claude/rules/warped-writing.md, content)
    |
    writeManifest(updatedManifest)
    |
    showNotice(`Synced ${written.length} files, ${skipped.length} unchanged`)
```

---

## Skill execution (user's terminal)

```
User in terminal: /warped-review posts/my-draft.md
  |
  Claude Code invokes the warped-review skill
    |
    Claude reads warped-obsidian.md (available as a rule — always in context)
    Claude reads criteria from vault via MCP: vault read <criteriaPath>
    Claude reads the target file via MCP: vault read <vaultPath>/posts/my-draft.md
    |
    Claude evaluates criteria, returns checklist in terminal
```

Vault file access uses the `vault` MCP server already registered by `warped-reference/setup.sh`. Skills that need vault reads work automatically for users who have completed the MCP setup.

---

## Dependencies

### Vault MCP server (warped-reference Phase 4)

Skills that read vault files depend on the `vault` MCP server defined in `warped-reference/ARCHITECTURE.md § Phase 4`. That server is the renamed and expanded `gdrive` MCP — it adds vault file listing, reading, content search, and the `pull` tool that `/warped-pull` calls.

Phases 1–3 of Claude Helpers can ship before warped-reference Phase 4. Skills are installed as files; they only break at invocation time if MCP is missing. The generated `warped-obsidian.md` context file includes MCP setup status and guidance so users see a clear message rather than an opaque error.

Skills that do NOT need MCP (e.g., `warped-write` operating on a file path passed as argument) work without it.

## Gaps with current warped-reference

| Gap | Status |
|-----|--------|
| `ClaudeHelpersManager` class | New — to be written |
| Bundled skill files | New — authored as string constants |
| Settings section in `GCommandSettings` | New fields: `helpers.*` |
| Settings tab UI (Claude Helpers section) | New section in `main.ts` |
| "Sync Claude Helpers" Obsidian command | New command registration |
| Vault MCP `pull` tool (used by `warped-pull` skill) | Requires warped-reference Phase 4 |
| Vault MCP vault file reads (used by most skills) | Requires warped-reference Phase 4 |
| Vault override path convention | New (no code needed; just documented) |

---

## Security

The manager writes only to `~/.claude/warped-*`. It reads vault files to resolve overrides and generate context. It does not write to the vault. Uninstall removes only `warped-*` files — user-created `~/.claude/` content is untouched.

Skill files are inert markdown until Claude Code reads them. They have no executable code and no network access.
