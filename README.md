# Bruce's Obsidian plugins

## Installation

Run the installer from the repo root:

```bash
./install.sh           # Interactive mode
./install.sh -p        # Use previously selected vaults
./install.sh --help    # Show help
```

The installer will:
1. Discover plugins in the repo (directories with `manifest.json`)
2. Prompt you to select plugins (enter `0` for all, or specific numbers)
3. Build selected plugins
4. Find Obsidian vaults (searches `~/Documents`, `~/projects`, `~/writing`, `~/Desktop`, iCloud)
5. Prompt you to select vaults (enter `0` for all)
6. Copy plugin files (`main.js`, `manifest.json`, `styles.css`) to selected vaults

**Options:**
- `-p, --previous` - Skip vault prompt, use previously selected vaults
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
