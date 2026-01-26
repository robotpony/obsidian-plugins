# Changelog

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
