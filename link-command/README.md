# L⌘ Link Command

URL unfurling for Obsidian. Fetch link titles and descriptions, insert as markdown links or rich previews.

## Features

- **Inline Format Toggle**: Click the toggle button next to any URL to cycle formats
- **Three Formats**: Plain URL, Markdown Link, or Rich Link (with bold domain)
- **Sidebar View**: Browse page links and recent history
- **Smart Caching**: Two-tier cache (memory + persistent) for fast access
- **Provider Architecture**: Extensible system for site-specific handling (Reddit, Google Search)

## Quick Start

1. Paste a URL into your note
2. Click the toggle button (⌘) that appears next to it
3. Cycle through formats: URL → Link → Rich Link → URL

## Link Formats

| Format | Example |
|--------|---------|
| URL | `https://example.com/page` |
| Link | `[Page Title](https://example.com/page)` |
| Rich Link | `[Page Title · **example.com**](https://example.com/page)` |

For Reddit links, Rich Link uses the subreddit: `[Post Title · **r/subreddit**](url)`

## Sidebar

The sidebar shows two sections:

**Page Links** - All URLs in the active file
- Green dot = unfurled (cached)
- Grey dot = not yet unfurled
- Click to navigate to the line

**Recent History** - Recently unfurled URLs
- Shows title, URL, source pages, and time ago
- Click to open in browser

## Commands

| Command | Description |
|---------|-------------|
| Toggle link format | Cycle format at cursor (URL → Link → Rich → URL) |
| Clear link cache | Clear all cached metadata |
| Toggle link sidebar | Show/hide the sidebar |

## Settings

### Sidebar
- **Show sidebar by default**: Open sidebar on Obsidian startup
- **Recent history limit**: Number of items in Recent History section

### Unfurling
- **Enable inline format toggle**: Show toggle buttons next to URLs
- **Request timeout**: Timeout for fetching metadata (ms)
- **Reddit link format**: Title only or Title + subreddit

### Cache
- **Enable cache**: Cache metadata for faster access
- **Cache TTL**: How long to keep cached metadata (hours)

### Authenticated Domains
Domains that require login are skipped during unfurling. Add one domain per line.

## Installation

From the repo root, run `./install.sh` and follow the prompts to select vaults.

Or manually: copy `main.js`, `manifest.json`, and `styles.css` to `.obsidian/plugins/link-command/` in your vault, then enable in Settings.

## License

MIT
