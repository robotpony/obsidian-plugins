# Changelog

All notable changes to the Weekly Log Helpers plugin will be documented in this file.

## [0.2.1] - 2026-01-08

### Fixed
- **Filter parsing bug**: Fixed regex to support flexible filter syntax
  - Now works: `{{focus-todos | tags:#urgent}}` (filters only with pipe)
  - Now works: `{{focus-todos: tags:#urgent}}` (filters only with colon)
  - Already worked: `{{focus-todos: done.md | tags:#urgent}}` (file + filters)
  - Supports both colon and pipe separators for maximum flexibility
- **Markdown rendering**: TODO text now renders inline markdown
  - **Bold**, *italic*, `code`, and [links](url) now display correctly
  - Strips block-level markers (list bullets, quotes)
  - No extra spacing or newlines (fixed in v0.2.1)
  - Custom inline renderer avoids block-level <p> tags

### Technical
- Updated inline syntax regex from `[^|}\s]*` to `[^|}]*` to allow spaces
- Added smart detection to distinguish file paths from filter keywords
- Implemented custom `renderInlineMarkdown()` method to avoid block elements
- Supports **bold**, *italic*, `code`, and [links](url) inline syntax

## [0.2.0] - 2026-01-08

### Added
- **Code block syntax support** for `focus-todos` and `focus-list`
  - Works in **both Reading Mode and Live Preview mode**
  - Use ````focus-todos```` for better editing experience
  - Supports multi-line filter syntax for improved readability
  - Example:
    ````markdown
    ```focus-todos
    todos/done.md
    path:projects/
    tags:#urgent
    limit:10
    ```
    ````
- **Comprehensive SYNTAX_GUIDE.md** documentation
  - Complete syntax reference for both inline and code block styles
  - Mode compatibility matrix
  - Migration guide from inline to code blocks
  - Examples and best practices

### Improved
- README.md now explains mode compatibility and both syntax options
- QUICK_REFERENCE.md includes code block examples and comparison table
- Better documentation of inline vs code block syntax differences

### Technical
- New CodeBlockProcessor class for handling code block syntax
- Public helper methods in EmbedRenderer for code reuse
- Both syntaxes share the same rendering engine for consistency

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
