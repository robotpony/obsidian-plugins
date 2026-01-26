# ␣⌘ Space Command for Obsidian

Focus on the right next task. Simple TODOs and tags in your markdown, surfaced when you need them.

## Why Space Command?

Your notes are full of TODOs—action items from meetings, tasks buried in project docs, ideas scattered across daily logs. Space Command surfaces them without moving them.

**Principles:**

- **Markdown-native**: Just `#todo` tags. Works with grep, git, scripts.
- **In-context**: TODOs stay where you wrote them.
- **No lock-in**: Plain text. Stop using the plugin anytime.
- **One vault, one focus**: Your working list, not your life system.

## Quick Start

1. **Add a TODO**: Put `#todo` on any line:
    ```markdown
    - [ ] Review the API spec #todo
    ```

2. **See your TODOs**: Open the sidebar (`Cmd/Ctrl+Shift+T`) or embed a list:
   ````markdown
   ```focus-todos
   ```
   ````

3. **Complete it**: Click the checkbox. It becomes `#todone @YYYY-MM-DD`.

That's it. Everything else is optional.

## Organize with Tags

**Priority tags** control sort order:

| Tag | Purpose |
|-----|---------|
| `#focus` | The one thing to do next (highlighted) |
| `#p0` – `#p4` | Priority levels (0 = highest) |
| `#future` | Snoozed—hidden from active list |

**Project tags** group TODOs in the sidebar's Focus section. Any tag that isn't a priority or type tag becomes a project:

```markdown
- [ ] Write endpoint docs #todo #api #focus
- [ ] Update welcome email #todo #onboarding
```

Right-click any TODO for quick actions: Focus, Later, Snooze, Copy.

## LLM Tools (Define, Rewrite, Review)

Select any text, right-click, and choose from three LLM-powered tools:

| Command     | Purpose                                                    |
|-------------|------------------------------------------------------------|
| **Define**  | Get a contextual explanation of the selected text          |
| **Rewrite** | Improve clarity, accuracy, and brevity (with Apply button) |
| **Review**  | Get editorial suggestions for improvement                  |

- Requires [Ollama](https://ollama.ai) running locally (default: `http://localhost:11434`)
- Results appear in an inline tooltip near your selection
- Rewrite includes Copy and Apply buttons—Apply replaces your selection
- Customize prompts in Settings → LLM Settings

## Ideas Tab

Capture ideas separately from actionable TODOs. The sidebar has two tabs—TODOs and Ideas.

| Tag                              | Purpose                                   |
|----------------------------------|-------------------------------------------|
| `#idea` / `#ideas` / `#ideation` | Something to capture (not yet actionable) |
| `#principle`                     | A guiding principle (reference only)      |

Click an idea's checkbox to dismiss it. Right-click to promote it to a TODO.

## Embed and Filter

Embed TODO or idea lists anywhere:

````markdown
```focus-todos
path:projects/
tags:#urgent
limit:5
```
````

````markdown
```focus-ideas
tags:#ux
```
````

Filters: `path:` (folder), `tags:` (require tags), `limit:` (cap list), `todone:hide` (hide completed).

**Inline syntax** (Reading Mode only):

```markdown
{{focus-todos}}
{{focus-ideas}}
{{focus-ideas | tags:#project path:notes/}}
```

## Header TODOs

Add `#todo` to a heading—all list items below become children:

```markdown
## Sprint 12 #todo
- Fix auth bug
- Update docs
```

Completing the header completes all children.

## Automatic File Tags

TODOs in your projects folder without explicit project tags are grouped by filename:

```markdown
<!-- In projects/api-tasks.md -->
- [ ] Fix rate limiting #todo       → grouped under #api-tasks
- [ ] Add caching #todo #backend    → grouped under #backend (explicit wins)
```

Add an explicit project tag to override. Files outside the projects folder don't get inferred tags. Configure excluded folders (like `log`) in Settings.

## Installation

From the repo root, run `./install.sh` and follow the prompts to select vaults.

Or manually: copy `main.js`, `manifest.json`, and `styles.css` to `.obsidian/plugins/space-command/` in your vault, then enable in Settings.

## License

MIT
