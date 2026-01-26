# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
npm install          # Install dependencies
npm run dev          # Watch mode (rebuilds on file changes)
npm run build        # Production build (runs tsc + esbuild)
```

The build output is `main.js` in the project root. For testing, copy `main.js`, `manifest.json`, and `styles.css` to `.obsidian/plugins/link-command/` in an Obsidian vault.

## Architecture Overview

This is **Link Command** (`link-command`), an Obsidian plugin for URL unfurling.

### Entry Point and Core Flow

[main.ts](main.ts) - Plugin entry point extending `Plugin`. Initializes all components and registers:
- Code block processor for `link-card` blocks
- Sidebar view for browsing page links and history
- Context menu handler for "Unfurl link..." action
- Paste event handler for auto-unfurling
- Commands: "Unfurl URL at cursor", "Insert link card", "Clear link cache", "Toggle link sidebar"

### Key Components (src/)

| Component | Purpose |
|-----------|---------|
| [types.ts](src/types.ts) | TypeScript interfaces: `UrlMetadata`, `UrlMetadataResult`, `UrlMetadataProvider`, `LinkCommandSettings` |
| [UrlMetadataProvider.ts](src/UrlMetadataProvider.ts) | Provider interface and implementations: `HtmlMetadataProvider` (Open Graph/Twitter Card parser), `AuthDomainProvider` (skips auth-required domains) |
| [UrlMetadataCache.ts](src/UrlMetadataCache.ts) | Two-tier cache: in-memory for session, persistent via plugin data for offline |
| [UrlUnfurlService.ts](src/UrlUnfurlService.ts) | Coordinates providers and cache, validates URLs, handles batch unfurling |
| [UrlUnfurlTooltip.ts](src/UrlUnfurlTooltip.ts) | Floating preview UI with loading/error states and action buttons |
| [LinkCardProcessor.ts](src/LinkCardProcessor.ts) | Processes `link-card` code blocks, renders as preview cards |
| [LinkSidebarView.ts](src/LinkSidebarView.ts) | Sidebar showing page links and recent history |

### Data Flow

1. **Trigger**: User right-clicks URL, pastes URL, or runs command
2. **Service**: `UrlUnfurlService` checks cache, then routes to provider
3. **Provider**: `HtmlMetadataProvider` fetches HTML via `requestUrl()`, parses Open Graph/meta tags
4. **Cache**: Successful results stored in memory + persistent cache
5. **UI**: Tooltip or code block renders metadata with action buttons

### Provider Architecture

Extensible provider system allows adding API-based providers for authenticated services:

```typescript
interface UrlMetadataProvider {
  name: string;
  priority: number;  // Lower runs first
  canHandle(url: string): boolean;
  fetch(url: string, timeout: number): Promise<UrlMetadataResult>;
}
```

Providers run in priority order. `AuthDomainProvider` (priority 1) fast-fails known auth domains. `HtmlMetadataProvider` (priority 100) is the catch-all.

To add a new provider (e.g., for Slack), create a file in `src/providers/` implementing the interface and register it in `UrlUnfurlService`.

## Key Patterns

- **Network requests**: Uses Obsidian's `requestUrl()` API (bypasses CORS)
- **HTML parsing**: Browser's `DOMParser` extracts Open Graph, Twitter Cards, and standard meta tags
- **Caching**: Two-tier (memory + persistent) with configurable TTL and source page tracking
- **Tooltip UI**: Follows space-command's `DefineTooltip` pattern for floating previews
- **Sidebar**: Follows space-command's `SidebarView` pattern with sections for page links and history

### Settings Tab

The `LinkCommandSettingTab` class is defined inline in [main.ts](main.ts).

## Code Block Syntax

```link-card
url: https://example.com
title: Optional title (will be fetched if omitted)
description: Optional description
image: Optional image URL
```

## Sidebar

The sidebar shows two sections:

1. **Page Links** - All URLs found in the active file
   - Green dot = unfurled (cached)
   - Grey dot = not yet unfurled
   - Click to navigate to the line in the file
   - Right-click for context menu (unfurl, copy, open)

2. **Recent History** - Recently unfurled URLs from cache
   - Shows title, URL, source pages, and time ago
   - Click to open URL in browser
   - Right-click for context menu

## Release Checklist

When making changes, keep these files in sync:

1. **Version numbers** - Update in:
   - `manifest.json`
   - `package.json`
   - `CHANGELOG.md`

2. **Documentation** - Update as features change
