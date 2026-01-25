# Bruce's Obsidian plugins

## Installation

Run the installer from the repo root:

```bash
./install.sh
```

The installer will:
1. Discover plugins in the repo (directories with `manifest.json`)
2. Prompt you to select plugins (enter `0` for all, or specific numbers)
3. Build selected plugins
4. Find Obsidian vaults (searches `~/Documents`, `~/projects`, `~/writing`, `~/Desktop`, iCloud)
5. Prompt you to select vaults (enter `0` for all, or reuse previous selection)
6. Copy plugin files (`main.js`, `manifest.json`, `styles.css`) to selected vaults

**Quick options:**
- Enter `0` at any prompt to select all items
- Enter `all` to select all items
- Enter space-separated numbers to select specific items (e.g., `1 3`)
- Previous vault selections are cached in `.install-vaults` for quick reinstalls

Reload Obsidian after installing to activate changes.

## Plugins

### [Space Command](./space-command)

Focus on the right next task. Simple TODOs and tags in your markdown, surfaced when you need them.

Tag lines with `#todo` and view them in a sidebar or embedded lists. Completing a TODO converts it to `#todone @date`. Supports priority tags (`#focus`, `#p0`-`#p4`, `#future`), project grouping, and an Ideas tab for `#idea` and `#principle` tags.
