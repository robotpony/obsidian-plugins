# Changelog

All notable changes to the Link Command plugin will be documented in this file.

## [0.4.22] - 2026-01-30

### Improved

- **Toggle button now appears on hover**: The ⌘ format toggle button is now hidden by default and only appears when hovering over the line containing a URL
  - Reduces visual clutter in the editor
  - Button smoothly fades in/out on hover
- **Auto-expand URLs to markdown links**: New URLs are now automatically converted to `[Title](url)` format
  - Fetches the page title and creates a proper markdown link
  - Works with pasted and typed URLs
  - 500ms debounce prevents rapid-fire conversions
  - New "Auto-expand URLs" setting to enable/disable (enabled by default)

### Settings

- **Auto-expand URLs**: Toggle automatic URL-to-link conversion (default: on)

## [0.4.21] - 2026-01-30

### Improved

- **Standardized kebab menu order**: Sidebar menu now follows consistent order across all Command plugins
  - Refresh appears first as the most common action
  - About and Settings always appear last
  - This plugin had no changes needed as it already followed the standard

## [0.4.20] - 2026-01-28

### Fixed

- **Styled logo in notices**: Notice popups now show the styled L⌘ logo badge instead of plain text

## [0.4.19] - 2026-01-28

### Fixed

- **Branded notices**: All status messages now show L⌘ logo prefix for consistency

## [0.4.18] - 2026-01-28

### Added

- **About modal**: Converted About from simple Notice toast to proper modal dialog
  - Shows version, blurb, cache statistics, and repository link
  - Matches style of Space Command and Hugo Command About modals
- **Made in 🇨🇦**: Added "Made in 🇨🇦" to the About popup

## [0.4.17] - 2026-01-27

### Improved

- **Distinct logo colour**: Changed logo badge from blue (#689fd6) to green (#5da65d)
  - Differentiates from Space Command (blue) and Hugo Command (orange)
  - All three plugins now have distinct, complementary colours

## [0.4.16] - 2026-01-27

### Improved

- **Reorganized settings sections**: Sidebar section now appears first for consistency
  - Sidebar section first (Show sidebar by default, Recent history limit)
  - Unfurling section (replaces "Site-Specific", includes Enable toggle, Timeout, Reddit format)
  - Cache section (unchanged)
  - Authenticated Domains section (unchanged)
  - Consistent with Space Command and Hugo Command settings layout

## [0.4.15] - 2026-01-27

### Improved

- **Settings page header**: Added about section with logo, plugin name, description, version, and author info
  - Consistent with Space Command and Hugo Command settings layout

## [0.4.14] - 2026-01-27

### Fixed

- **Sidebar scrollbar no longer overlaps content**: Added right padding to content area so scrollbar sits beside content, not over it
- **Scrollbar hugs right edge**: Scrollbar now positioned flush against the right edge of the sidebar

## [0.4.13] - 2026-01-27

### Fixed

- **Sidebar scrollbar positioning**: Vertical scrollbar now hugs the right edge (0-1px gap instead of 4-6px)
- **Horizontal scrollbar prevention**: Sidebar content no longer shows horizontal scrollbars when content overflows

## [0.4.12] - 2026-01-26

### Changed

- **Sidebar scrollbar**: Semi-transparent (65% opacity) scrollbar thumb with transparent track

## [0.4.11] - 2026-01-26

### Fixed

- **Sidebar layout padding**: Reduced header padding to 2px top/bottom, 4px left/right; scrollbar now flush with right edge

## [0.4.10] - 2026-01-26

### Fixed

- **Sidebar button styling**: Removed visible borders and backgrounds from close/menu/clear buttons; added subtle hover effect

## [0.4.9] - 2026-01-26

### Fixed

- **Sidebar header now stays pinned** while scrolling content below

## [0.4.8] - 2026-01-26

### Fixed

- **Removed duplicate hover effect** from external link icon in sidebar rows (row hover is sufficient)

## [0.4.7] - 2026-01-26

### Fixed

- **Clear button now on same line** as "Recent History" header (added flex layout to section header)
- **Page Links now open in browser** when clicked, consistent with history items

## [0.4.6] - 2026-01-26

### Added

- **External link buttons**: Arrow button on the right of all sidebar links to open URLs in browser
- **Clear history button**: Trash icon in the Recent History section header to clear the cache

### Changed

- **Removed link counts** from section headers (Page Links, Recent History)

### Fixed

- **Sidebar now updates immediately** when URLs are added or removed
  - Previously required switching files or manual refresh
  - Now listens to editor changes with 300ms debounce for responsive updates

## [0.4.5] - 2026-01-26

### Fixed

- **Trailing asterisks stripped from URLs**: URLs with trailing `**` (common in pasted Google search results) are now cleaned up correctly
  - Added `*` to the trailing punctuation cleanup pattern across all URL extraction points

## [0.4.4] - 2026-01-26

### Added

- **Google Search provider**: Google search URLs now display the search query as the title
  - `https://google.com/search?q=typescript+generics` → `[typescript generics · **Google**](url)`
  - Works with all Google TLDs (google.com, google.ca, google.co.uk, etc.)
  - No network request needed - extracts query directly from URL

## [0.4.3] - 2026-01-26

### Fixed

- **Recent History now loads correctly**: Fixed bug where the cache was never initialized on first run or when no cache data existed, causing "Recent History" to always show empty
  - Cache is now always initialized on plugin load, even when starting fresh

## [0.4.2] - 2026-01-26

### Added

- **Favicons in Page Links**: Links in the "Page Links" section now show favicons (when available from cache) instead of only status dots
  - Unfurled links show their favicon on the left
  - Non-unfurled links still show the grey status dot
  - Falls back to status dot if favicon fails to load

## [0.4.1] - 2026-01-26

### Changed

- **Sidebar styles**: Updated to match space-command and hugo-command sidebars
  - Consistent container padding (`padding: 10px`)
  - Header uses `margin-bottom` instead of border
  - Section headers match space-command's `todo-section-header` pattern
  - Logo styling aligned with other plugins
  - Count badges use pill style with `background-primary`
  - Item hover states use negative margin for edge-to-edge highlight

## [0.4.0] - 2026-01-26

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

## [0.3.1] - 2026-01-25

### Changed

- **Toggle icon**: Replaced state-specific icons with unified ⌘ (command) symbol
  - Same icon for all states (URL, Link, Card)
  - Consistent with Link Command branding

## [0.3.0] - 2026-01-25

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

## [0.2.5] - 2026-01-25

### Fixed

- **Recent History now updates correctly**: Sidebar refreshes after all unfurl operations
  - Added missing `render()` calls after auto-unfurl on paste
  - Added missing `render()` calls after "Insert link card" command
  - Added source page tracking to "Insert link card" command

## [0.2.4] - 2026-01-25

### Fixed

- **Reddit titles now work correctly**: Switched from HTML parsing to Reddit's JSON API
  - The Reddit SPA renders titles via JavaScript, which the HTML parser couldn't see
  - JSON API returns structured post data including title, subreddit, description, and images
  - Now correctly shows post titles like "Thank you Obsidian team (r/ObsidianMD)" instead of "Reddit - The heart of the internet"

## [0.2.3] - 2026-01-24

### Added

- **Reddit link format setting**: Configure how Reddit links are formatted when unfurling
  - "Title only": Uses just the post title
  - "Title + subreddit": Includes subreddit, e.g., `[Post Title (r/subreddit)](url)`
- New "Site-Specific" section in settings

### Fixed

- Auto-unfurl on paste now uses the formatted title (with subreddit if configured) instead of raw title

## [0.2.2] - 2026-01-24

### Added

- **Reddit provider**: Site-specific metadata provider for Reddit URLs
  - Extracts subreddit from URL path (e.g., `r/ObsidianMD`)
  - Parses post title separately from subreddit suffix
  - Shows subreddit as a separate line in sidebar items
- Extensible provider architecture in `src/providers/` for future site-specific handlers

### Changed

- `UrlMetadata` type now includes optional `subreddit` field for Reddit links

## [0.2.1] - 2026-01-24

### Added

- Sidebar header with `L⌘` logo and "Link Command" title
- Kebab menu (vertical dots) with Refresh, About, and Settings options
- Clickable logo opens About info
- Refresh button triggers sidebar re-render with rotation animation

### Changed

- Sidebar now matches the header style of other workflow-automation plugins

## [0.2.0] - 2026-01-24

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

## [0.1.0] - 2026-01-23

### Added

- Initial release
- URL unfurling via context menu, commands, and paste
- `link-card` code block processor for rich previews
- Two-tier caching (memory + persistent) with configurable TTL
- Provider architecture for extensible URL handling
- Auth domain detection to skip known authenticated services
- Settings for timeout, cache, default format, and auth domains
