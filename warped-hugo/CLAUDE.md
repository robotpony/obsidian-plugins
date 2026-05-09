# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
npm install          # Install dependencies
npm run dev          # Watch mode (rebuilds on file changes)
npm run build        # Production build (runs tsc + esbuild)
```

The build output is `main.js` in the project root. For testing, copy `main.js`, `manifest.json`, and `styles.css` to `.obsidian/plugins/warped-hugo/` in an Obsidian vault.

## Architecture Overview

This is **Warped Hugo** (`warped-hugo`), an Obsidian plugin for managing Hugo static site content.

### Entry Point and Core Flow

[main.ts](main.ts) - Plugin entry point extending `Plugin`. Initializes all components and registers:
- Sidebar view for browsing Hugo content
- Commands: "Toggle Hugo Sidebar", "Refresh Hugo Content"

### Key Components (src/)

| Component | Purpose |
|-----------|---------|
| [types.ts](src/types.ts) | TypeScript interfaces: `HugoContentItem`, `HugoFrontmatter`, `HugoCommandSettings` |
| [HugoScanner.ts](src/HugoScanner.ts) | Scans vault for Hugo content, parses frontmatter (YAML/TOML), maintains content cache, watches file changes. Extends `Events` for reactive updates. |
| [SidebarView.ts](src/SidebarView.ts) | Custom sidebar showing content grouped by folder, with status/tag filtering, and sorting |
| [SiteSettingsModal.ts](src/SiteSettingsModal.ts) | Modal for editing Hugo site configuration (hugo.toml/config.toml) directly from Obsidian |
| [utils.ts](src/utils.ts) | Helper functions: frontmatter parsing, date normalization, folder path extraction, tag handling |

### Data Flow

1. **Scan**: `HugoScanner` reads markdown files in configured content paths, parses YAML/TOML frontmatter
2. **Cache**: Content items stored in `Map<filePath, HugoContentItem>`, emits `content-updated` event
3. **Display**: `SidebarView` groups content by top-level folder, applies filters (status, tags, folder tags)

### Folder Organization

Hugo content is organized hierarchically:
- **Top-level folder**: First path segment (e.g., `posts/` from `content/posts/tech/article.md`)
- **Folder tags**: Intermediate folders become filterable tags (e.g., `tech` from above path)
- Content grouped in sidebar by top-level folder with collapsible sections

## Key Patterns

- **Event-driven updates**: Scanner extends `Events`, sidebar listens for `content-updated`
- **Frontmatter parsing**: Handles both YAML (`---`) and TOML (`+++`) delimiters

### Settings Tab

The `HugoCommandSettingTab` class is defined inline in [main.ts](main.ts).

## Release Checklist

When making changes, keep these files in sync:

1. **Version numbers** - Update in all three files:
   - `manifest.json` - Obsidian reads this
   - `package.json` - npm/build tooling
   - `CHANGELOG.md` - Add new version section at top

2. **Documentation** - Update as features change:
   - `CHANGELOG.md` - Document all user-facing changes
   - `README.md` - Update if new features, settings, or syntax added
