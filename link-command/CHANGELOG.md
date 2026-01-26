# Changelog

## 0.3.0

### Changed

- **Inline format toggle**: Replaced context menu and tooltip UI with always-visible toggle buttons next to URLs
  - Small icon appears after every URL in the editor
  - Click to cycle: URL → Markdown Link → Link Card → URL
  - Icon changes based on current format (unfilled link, filled link, card)
- **Compact link cards**: Link cards are now compact inline elements instead of large blocks
  - Displays: favicon + title + domain
  - No image or description (works better in lists and paragraphs)
  - Uses `inline-flex` layout for proper inline flow
- **Command renamed**: "Unfurl URL at cursor" → "Toggle link format"

### Removed

- Context menu "Unfurl link..." option (use inline toggle instead)
- Tooltip preview UI (replaced by inline toggle)
- "Insert link card" command (use toggle to cycle to card format)
- "Auto-unfurl on paste" setting (paste inserts plain URL, use toggle to convert)
- "Default format" setting (user explicitly chooses via toggle)

## 0.2.5

### Fixed

- **Recent History now updates correctly**: Sidebar refreshes after all unfurl operations
  - Added missing `render()` calls after auto-unfurl on paste
  - Added missing `render()` calls after "Insert link card" command
  - Added source page tracking to "Insert link card" command

## 0.2.4

### Fixed

- **Reddit titles now work correctly**: Switched from HTML parsing to Reddit's JSON API
  - The Reddit SPA renders titles via JavaScript, which the HTML parser couldn't see
  - JSON API returns structured post data including title, subreddit, description, and images
  - Now correctly shows post titles like "Thank you Obsidian team (r/ObsidianMD)" instead of "Reddit - The heart of the internet"

## 0.2.3

### Added

- **Reddit link format setting**: Configure how Reddit links are formatted when unfurling
  - "Title only": Uses just the post title
  - "Title + subreddit": Includes subreddit, e.g., `[Post Title (r/subreddit)](url)`
- New "Site-Specific" section in settings

### Fixed

- Auto-unfurl on paste now uses the formatted title (with subreddit if configured) instead of raw title

## 0.2.2

### Added

- **Reddit provider**: Site-specific metadata provider for Reddit URLs
  - Extracts subreddit from URL path (e.g., `r/ObsidianMD`)
  - Parses post title separately from subreddit suffix
  - Shows subreddit as a separate line in sidebar items
- Extensible provider architecture in `src/providers/` for future site-specific handlers

### Changed

- `UrlMetadata` type now includes optional `subreddit` field for Reddit links

## 0.2.1

### Added

- Sidebar header with `L⌘` logo and "Link Command" title
- Kebab menu (vertical dots) with Refresh, About, and Settings options
- Clickable logo opens About info
- Refresh button triggers sidebar re-render with rotation animation

### Changed

- Sidebar now matches the header style of other workflow-automation plugins

## 0.2.0

### Added

- **Sidebar view** with two sections:
  - **Page Links**: Shows all URLs found in the active file with unfurl status
  - **Recent History**: Shows recently unfurled URLs from cache, sorted by recency
- Source page tracking: Cache now records which pages each URL was unfurled from
- Sidebar context menus for unfurling, copying, and opening links
- New settings:
  - "Show sidebar by default" toggle
  - "Recent history limit" to control number of items shown
- New command: "Toggle link sidebar"
- Ribbon icon to toggle sidebar visibility

### Changed

- Cache now tracks source pages where URLs were unfurled
- Sidebar automatically updates when active file changes or links are unfurled

## 0.1.0

### Added

- Initial release
- URL unfurling via context menu, commands, and paste
- `link-card` code block processor for rich previews
- Two-tier caching (memory + persistent) with configurable TTL
- Provider architecture for extensible URL handling
- Auth domain detection to skip known authenticated services
- Settings for timeout, cache, default format, and auth domains
