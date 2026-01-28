# Link Command Plugin

## Summary

New Obsidian plugin for URL unfurling. Fetches metadata (title, description, image) from pasted or selected URLs. Users can insert rich link previews, auto-fill markdown link text, or extract metadata for citations.

## Approach

**Direct HTML parsing** using Obsidian's `requestUrl()` API (bypasses CORS) with a lightweight parser. No external dependencies or API services required for the base implementation.

**Extensible provider architecture** allows future API integrations (Slack, GitHub, etc.) as optional modules without changing core code.

## Components

| Component | Purpose |
|-----------|---------|
| `UrlMetadataProvider.ts` | Interface + base HTML provider; extensible for API providers |
| `UrlMetadataCache.ts` | In-memory + persistent cache with TTL |
| `UrlUnfurlService.ts` | Routes URLs to appropriate provider, manages cache |
| `UrlUnfurlTooltip.ts` | Floating preview UI with action buttons |
| `LinkCardProcessor.ts` | Renders `link-card` code blocks as rich previews |

## Provider Architecture

```typescript
interface UrlMetadataProvider {
  name: string;
  canHandle(url: string): boolean;  // Domain matching
  fetch(url: string): Promise<UrlMetadataResult>;
}
```

**Built-in providers:**
- `HtmlMetadataProvider` - Default, parses any URL via HTML scraping
- Future: `SlackProvider`, `GitHubProvider`, `NotionProvider` (API-based)

The service iterates providers in priority order. First provider that returns `canHandle(url) === true` handles the request. This allows API providers to claim their domains before the generic HTML provider tries (and fails) to scrape them.

## Trigger Mechanisms (All Configurable)

1. **Context menu**: Right-click URL → "Unfurl link..."
2. **Paste handler**: Auto-unfurl when URL pasted (optional, off by default)
3. **Command palette**: "Unfurl URL at cursor"

## Output Formats

1. **Markdown link**: `[Page Title](https://example.com)`
2. **Rich card**: Code block with image, title, description rendered as preview card

## Settings

```typescript
unfurlEnabled: boolean;        // Master toggle
unfurlOnPaste: boolean;        // Auto-unfurl on paste (default: false)
unfurlTimeout: number;         // Request timeout in ms (default: 10000)
unfurlCacheEnabled: boolean;   // Persistent cache (default: true)
unfurlCacheTTL: number;        // Cache expiry in hours (default: 168 = 7 days)
unfurlDefaultFormat: 'link' | 'card';  // Default insertion format
```

## Implementation Order

1. **Scaffold plugin**: manifest.json, package.json, esbuild config, basic main.ts
2. **Types**: `types.ts` with settings interface and metadata types
3. **Provider interface**: `UrlMetadataProvider.ts` with interface + `HtmlMetadataProvider`
4. **Cache**: `UrlMetadataCache.ts` with Map-based memory cache + plugin data persistence
5. **Service**: `UrlUnfurlService.ts` with provider routing and cache coordination
6. **UI**: `UrlUnfurlTooltip.ts` (can reference space-command's DefineTooltip for patterns)
7. **Integration**: Context menu, commands, settings tab in main.ts
8. **Rich cards**: `LinkCardProcessor.ts` code block processor
9. **Polish**: Styles, paste handler, cache management UI, known-auth-domain detection

Future API providers (Slack, GitHub, etc.) can be added as separate files in `providers/` without modifying core code.

## Plugin Structure

```
link-command/
├── main.ts                    # Plugin entry point
├── manifest.json              # Obsidian plugin manifest
├── package.json               # Dependencies and build scripts
├── styles.css                 # Tooltip and card styles
├── src/
│   ├── types.ts               # Interfaces and settings
│   ├── UrlMetadataProvider.ts # Interface + HtmlMetadataProvider
│   ├── UrlMetadataCache.ts    # In-memory + persistent cache
│   ├── UrlUnfurlService.ts    # Provider routing and cache coordination
│   ├── UrlUnfurlTooltip.ts    # Floating preview UI
│   ├── LinkCardProcessor.ts   # Code block renderer
│   └── providers/             # Future API providers (Slack, GitHub, etc.)
└── esbuild.config.mjs         # Build configuration
```

Follows the same structure as space-command and hugo-command for consistency.

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| Network timeout | Show "Could not reach {domain}" with retry button |
| 4xx/5xx errors | Show "Page not accessible" and insert plain URL |
| No metadata found | Show "No preview available" and insert plain URL |
| Invalid URL | Show "Invalid URL format" |
| Authenticated domain (no provider) | Show "Requires authentication" and insert plain URL |

## Verification

1. **Unit tests**: Test HTML parser with sample pages (Open Graph, Twitter Cards, minimal HTML)
2. **Manual testing**:
   - Right-click a URL in editor, select "Unfurl link...", verify tooltip shows
   - Insert as markdown link, verify title populated
   - Insert as card, verify code block renders as preview
   - Enable paste auto-unfurl, paste URL, verify auto-formatting
   - Toggle offline, verify cached URLs still work
   - Clear cache in settings, verify fresh fetches
