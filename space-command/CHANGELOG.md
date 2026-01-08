# Changelog

All notable changes to the Weekly Log Helpers plugin will be documented in this file.

## [0.1.0] - 2026-01-07

### Added
- Initial release of Weekly Log Helpers plugin
- TODO/TODONE tracking across entire vault
- Interactive embed syntax: `{{focus-todos: file.md}}`
- Filter support: `path:`, `tags:`, `limit:`
- Sidebar view with Active TODOs and Recent TODONEs
- **Auto-refresh**: Sidebar automatically updates when TODOs change
  - Event-driven architecture with real-time updates
  - Manual refresh button (🔄) in sidebar header
  - Spinning animation during refresh
- **Line highlighting**: Click `→` to jump to source with visual highlight
  - Entire line is selected for 1.5 seconds
  - Easy to spot the TODO in the source file
  - Works from both sidebar and embeds
- **TODONE deduplication**: Excludes TODONE log file from Recent TODONEs
  - Prevents duplicates (same item appearing from source file and log file)
  - Configurable via `excludeTodoneFilesFromRecent` setting
  - Enabled by default for cleaner UI
- Keyboard shortcuts:
  - `Cmd/Ctrl+Shift+T` - Toggle sidebar
  - `Cmd/Ctrl+Shift+A` - Quick add TODO
- Settings panel for customization
- Smart filtering: automatically excludes TODOs in code blocks
  - Filters out triple backtick code blocks (```)
  - Filters out inline code (single backticks)
  - Prevents documentation examples from being tracked as actual TODOs

### Features
- Real-time file watching for instant updates
- Automatic TODONE logging with completion dates
- Click checkboxes to complete TODOs
- Jump to source file:line with → links
- Sort by date created
- Creates TODONE files and folders automatically

### Technical
- TypeScript implementation
- Built with esbuild
- Obsidian API integration
- Efficient caching for performance
- Event-driven architecture

### Documentation
- README.md - User guide
- INSTALL.md - Installation instructions
- PLAN.md - Implementation plan
- FILTERING.md - Code block filtering details
- AUTO_REFRESH.md - Auto-refresh feature documentation
- LINE_HIGHLIGHTING.md - Line highlighting feature documentation
- DEDUPLICATION.md - TODONE deduplication documentation
- QUICK_REFERENCE.md - Quick reference card
- TEST_EXAMPLES.md - Test cases
- IMPLEMENTATION_SUMMARY.md - Technical summary
