# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Structure

This is a mono-repo containing three Obsidian plugins:

| Plugin | Description | Has CLAUDE.md |
|--------|-------------|---------------|
| [space-command/](space-command/) | TODO/TODONE tracking with sidebar, embeds, slash commands | Yes |
| [hugo-command/](hugo-command/) | Hugo content browser and management | Yes |
| [link-command/](link-command/) | URL unfurling with inline format toggle | Yes |

See plugin-specific CLAUDE.md files for detailed architecture.

## Build Commands

Each plugin uses the same npm scripts:

```bash
cd <plugin-dir>
npm install          # Install dependencies
npm run dev          # Watch mode (rebuilds on file changes)
npm run build        # Production build (runs tsc + esbuild)
```

## Installing Plugins

The root [install.sh](install.sh) script handles building and installing to Obsidian vaults:

```bash
./install.sh           # Interactive: pick plugins and vaults
./install.sh -a        # Install all plugins (still prompts for vaults)
./install.sh -p        # Use previously selected vaults
./install.sh -a -p     # Quick reinstall: all plugins to cached vaults
./install.sh -d 8      # Deep search for nested vaults
```

The installer:
1. Discovers plugins (directories with `manifest.json`)
2. Runs `npm install` and `npm run build` for selected plugins
3. Finds Obsidian vaults in `~/Documents`, `~/Desktop`, `~`, and iCloud
4. Copies `main.js`, `manifest.json`, `styles.css` to `.obsidian/plugins/<plugin-name>/`

Vault selections are cached in `.install-vaults` for reuse with `--previous`.

## Common Plugin Patterns

All plugins follow Obsidian's plugin architecture:

- **Entry point**: `main.ts` extends `Plugin`, implements `onload()`/`onunload()`
- **Settings**: Inline `PluginSettingTab` class in `main.ts`
- **Sidebar**: Custom `ItemView` subclass registered via `registerView()`
- **Build**: esbuild bundles to `main.js`, TypeScript checked via `tsc -noEmit`

### File Layout

```
<plugin>/
├── main.ts           # Plugin entry point
├── manifest.json     # Obsidian plugin manifest (id, version, name)
├── package.json      # npm dependencies and scripts
├── styles.css        # Plugin CSS
├── esbuild.config.mjs
├── tsconfig.json
└── src/              # TypeScript modules
    └── types.ts      # Shared interfaces
```

### Release Checklist

When releasing a plugin, update version in:
1. `manifest.json` (Obsidian reads this)
2. `package.json`
3. `CHANGELOG.md` (if present)
