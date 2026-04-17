# Bruce's Obsidian plugins

## Installation

Run the installer from the repo root:

```bash
./install.sh           # Interactive mode
./install.sh -a        # Install all plugins (still prompts for vaults)
./install.sh -p        # Use previously selected vaults
./install.sh -a -p     # Quick reinstall: all plugins to cached vaults
./install.sh -d 8      # Deep search for nested vaults
./install.sh --help    # Show help
```

The installer will:
1. Discover plugins in the repo (directories with `manifest.json`)
2. Prompt you to select plugins (or use `-a` to select all)
3. Build selected plugins
4. Find Obsidian vaults
5. Prompt you to select vaults (or use `-p` for cached selection)
6. Copy plugin files (`main.js`, `manifest.json`, `styles.css`) to selected vaults

**Options:**
- `-a, --all` - Install all plugins (skip plugin prompt)
- `-p, --previous` - Use previously selected vaults (skip vault prompt)
- `-d, --depth N` - Override vault search depth (default: 3-5 depending on location)
- `-h, --help` - Show help

**Prompts:**
- `0` - Select all items
- `1 3` - Space-separated numbers for specific items

Vault selections are cached in `.install-vaults` for use with `--previous`.

Reload Obsidian after installing to activate changes.

## Plugins

### [Space Command](./space-command)

Focus on the right next task. Simple TODOs and tags in your markdown, surfaced when you need them.

Tag lines with `#todo` and view them in a sidebar or embedded lists. Completing a TODO converts it to `#todone @date`. Supports priority tags (`#focus`, `#p0`-`#p4`, `#future`), project grouping, and an Ideas tab for `#idea` and `#principle` tags.

### [Link Command](./link-command)

URL unfurling for Obsidian. Fetch link titles and descriptions, insert as markdown links or rich previews.

Paste a URL and use the "Toggle link format" command to cycle formats: plain URL → markdown link → rich link (with bold domain). Includes a sidebar for browsing page links and recent history, smart two-tier caching, and extensible provider architecture for site-specific handling.

### [Hugo Command](./hugo-command)

Manage and browse Hugo content from Obsidian. View posts, drafts, and filter by tags from a convenient sidebar.

Content is grouped by folder with subfolder "folder tags" for filtering. Edit your Hugo site configuration (hugo.toml) directly from the sidebar. Supports both TOML and YAML frontmatter formats.

LLM features (requires Ollama, OpenAI, Gemini, or Anthropic): **Content Review** evaluates posts against a checklist; **Outline Enhancement** adds questions and suggestions as inline comment bubbles.

### [g-command](./g-command)

Google Drive browser and sync for Obsidian. Pull Docs, Sheets, and files into your vault without leaving the app.

Browse your Drive in a sidebar, check files and folders to track, and press Sync to pull them in. Google Docs are converted to markdown, Sheets to CSV. Drive folder structure is mirrored under a configurable vault folder. Sync is one-way (Drive → vault) and skips unchanged files.

Requires [rclone](https://rclone.org/) for Drive access — run `g-command/setup.sh` to install and authenticate. Desktop only.

## Claude Code commands

Custom slash commands for writing, product management, and side projects. Organized into four namespaces plus a few standalone commands. All commands accept `$ARGUMENTS` for context.

### pdm: Product management

Commands for an Obsidian vault used as a PM work system: weekly logs, meeting notes, project briefs, task tracking. Most commands read from and write to the vault.

| Command | What it does |
|---------|-------------|
| `/pdm:new-week` | Monday ritual. Carries forward tasks, reviews the roadmap priorities doc, proposes next week's tasks, and creates the weekly log. |
| `/pdm:carry-forward` | Reads the current log and all linked docs, separates TODOs into done/rolling/dead, groups by workstream, and writes a carry-forward section. |
| `/pdm:review-week` | End-of-week review. Collects metrics and identifies priorities, gaps, stale items. Writes a summary alongside the weekly log. |
| `/pdm:standup-prep` | Generates a 3-8 bullet standup from the weekly log and recent ClickUp activity. |
| `/pdm:meeting-summary` | Summarizes a transcript or raw notes into a structured vault note with decisions, tasks, and topic index. |
| `/pdm:extract-tasks` | Pulls action items from any vault note, attributes owners, and offers to insert them into the weekly log. |
| `/pdm:plan-doc` | Creates a plan document and links it to the weekly log. |
| `/pdm:ooo-coverage` | Generates an OOO coverage doc from active projects and weekly logs. |
| `/pdm:priorities-sync` | Snapshots the current roadmap priorities from the Development Priorities doc. |
| `/pdm:roadmap-summary` | Summarizes roadmap sections by status and gaps. |
| `/pdm:release-notes` | Pulls completed tasks from ClickUp and formats them for the weekly log's release notes section. |
| `/pdm:clickup-report` | Ticket creation/completion stats from ClickUp for a date range. |
| `/pdm:notion-extract` | Extracts a Notion page section into a local markdown doc. |
| `/pdm:gdoc-clean` | Cleans up a pasted Google Doc (fixes structure and formatting artefacts). |
| `/pdm:claude-tip` | Generates a short Claude tip for the PDM team, suitable for a single Slack message. |

**Weekly workflow:** Monday: `/pdm:new-week`. During the week: `/pdm:meeting-summary` after calls, `/pdm:extract-tasks` for action items, `/pdm:standup-prep` before standups. Friday: `/pdm:review-week`.

### prd: Product requirements

Commands for writing, reviewing, and iterating on PRDs and design documents.

| Command | What it does |
|---------|-------------|
| `/prd-writer` | Full PRD authoring skill. Four mandatory phases (orient, research, scope, draft) with three optional extensions. |
| `/prd:requirements` | Distills requirements from source documents (teardowns, summaries, transcripts) into a phased PRD format. |
| `/prd:review` | Reviews a PRD for quality, coherence, and readiness. Accepts a Notion URL, vault file path, or pasted content. |
| `/prd:teardown` | Reviews numbered screenshots of a prototype and produces a structured teardown document. |
| `/prd:transcript-review` | Reviews a meeting transcript and produces a design/product review summary. |
| `/prd:session-retrospective` | Reviews the current conversation and produces a structured retrospective focused on tooling and process improvements. |

**Typical flow:** Start from notes: `/prd:requirements path/to/notes.md` then `/prd:review`. Start from scratch: `/prd-writer`. After a design review call: `/prd:transcript-review` then `/prd:requirements`.

### warped: Blog writing

Commands for drafting and publishing posts on warpedperspective.com. All follow the voice and style rules in `~/.claude/rules/blog-writing-rules.md`.

| Command | What it does |
|---------|-------------|
| `/warped:new-outline` | Asks clarifying questions about a post idea, then produces a structured outline with headline options and an opening hook. |
| `/warped:outline-draft` | Alias for `new-outline`. |
| `/warped:draft` | Writes a full first draft from an outline. Asks for missing personal anecdotes before writing. |
| `/warped:review-draft` | Deep review: quality score, style adherence checklist, spelling/grammar, suggestions. |
| `/warped:post-checklist` | Fast pre-publish checklist: structure, content, style, SEO basics. |
| `/warped:socialize-post` | Generates three platform-specific social blurbs (Mastodon, Bluesky, LinkedIn, Reddit). |

**Typical flow:** `/warped:new-outline` > iterate > `/warped:draft` > `/warped:review-draft` > revise > `/warped:post-checklist` > `/warped:socialize-post`

### mx: Software engineering

Lightweight development commands. Not domain-specific.

| Command | What it does |
|---------|-------------|
| `/mx:architect` | Analyze a problem, produce architecture artefacts. |
| `/mx:research` | Research components, tools, or approaches with structured evaluation. |
| `/mx:ideate` | Brainstorm and explore a problem space. |
| `/mx:feature` | Implement a feature, update version/changelog/readme. |
| `/mx:bug` | Reproduce, root cause, fix, and regression check. |
| `/mx:nit` | Minor quality improvements: naming, style, small refactors. |
| `/mx:cleanup` | Review and clean up code, docs, unused files. |
| `/mx:iterate` | Review user feedback and iterate on work in progress. |
| `/mx:finish` | Finalize: version bump, build, changelog, readme, commit message. |

### Standalone commands

| Command | What it does |
|---------|-------------|
| `/gdoc-pull` | Pulls a Google Doc into the vault. |

### Supporting rules files

These define quality standards that the commands reference:

- `~/.claude/rules/product-writing-rules.md` — PRD structure, formatting, anti-patterns. Used by prd: and pdm: commands.
- `~/.claude/rules/blog-writing-rules.md` — Voice, tone, style rules. Used by warped: commands.
- `~/.claude/rules/blog-writing-reference.md` — Themes, post types, and patterns reference.
