# Changelog

## 0.4.10

### Fixed

- **Sidebar button styling**: Removed visible borders and backgrounds from close/menu/clear buttons; added subtle hover effect

## 0.4.9

### Fixed

- **Sidebar header now stays pinned** while scrolling content below

## 0.4.8

### Fixed

- **Removed duplicate hover effect** from external link icon in sidebar rows (row hover is sufficient)

## 0.4.7

### Fixed

- **Clear button now on same line** as "Recent History" header (added flex layout to section header)
- **Page Links now open in browser** when clicked, consistent with history items

## 0.4.6

### Added

- **External link buttons**: Arrow button on the right of all sidebar links to open URLs in browser
- **Clear history button**: Trash icon in the Recent History section header to clear the cache

### Changed

- **Removed link counts** from section headers (Page Links, Recent History)

### Fixed

- **Sidebar now updates immediately** when URLs are added or removed
  - Previously required switching files or manual refresh
  - Now listens to editor changes with 300ms debounce for responsive updates

## 0.4.5

### Fixed

- **Trailing asterisks stripped from URLs**: URLs with trailing `**` (common in pasted Google search results) are now cleaned up correctly
  - Added `*` to the trailing punctuation cleanup pattern across all URL extraction points

## 0.4.4

### Added

- **Google Search provider**: Google search URLs now display the search query as the title
  - `https://google.com/search?q=typescript+generics` → `[typescript generics · **Google**](url)`
  - Works with all Google TLDs (google.com, google.ca, google.co.uk, etc.)
  - No network request needed - extracts query directly from URL

## 0.4.3

### Fixed

- **Recent History now loads correctly**: Fixed bug where the cache was never initialized on first run or when no cache data existed, causing "Recent History" to always show empty
  - Cache is now always initialized on plugin load, even when starting fresh

## 0.4.2

### Added

- **Favicons in Page Links**: Links in the "Page Links" section now show favicons (when available from cache) instead of only status dots
  - Unfurled links show their favicon on the left
  - Non-unfurled links still show the grey status dot
  - Falls back to status dot if favicon fails to load

## 0.4.1

### Changed

- **Sidebar styles**: Updated to match space-command and hugo-command sidebars
  - Consistent container padding (`padding: 10px`)
  - Header uses `margin-bottom` instead of border
  - Section headers match space-command's `todo-section-header` pattern
  - Logo styling aligned with other plugins
  - Count badges use pill style with `background-primary`
  - Item hover states use negative margin for edge-to-edge highlight

## 0.4.0

### Changed

- **Three inline formats**: Replaced URL/Link/Card with URL/Link/Rich Link
  - **URL**: Plain `https://example.com`
  - **Link**: `[Page Title](url)`
  - **Rich Link**: `[Page Title · **domain.com**](url)` (includes bold domain)
  - For Reddit: `[Post Title · **r/subreddit**](url)`
- All formats are now inline text (no code blocks)

### Removed

- **Link card format**: Removed `link-card` code block support entirely
  - Code blocks don't flow inline within lists/paragraphs
  - Deleted `LinkCardProcessor.ts`
  - Removed `.link-card-*` styles

## 0.3.1

### Changed

- **Toggle icon**: Replaced state-specific icons with unified ⌘ (command) symbol
  - Same icon for all states (URL, Link, Card)
  - Consistent with Link Command branding

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
