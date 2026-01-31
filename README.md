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

Paste a URL and click the inline toggle to cycle formats: plain URL → markdown link → rich link (with bold domain). Includes a sidebar for browsing page links and recent history, smart two-tier caching, and extensible provider architecture for site-specific handling.

### [Hugo Command](./hugo-command)

Manage and browse Hugo content from Obsidian. View posts, drafts, and filter by tags from a convenient sidebar.

Content is grouped by folder with subfolder "folder tags" for filtering. Edit your Hugo site configuration (hugo.toml) directly from the sidebar. Supports both TOML and YAML frontmatter formats.
