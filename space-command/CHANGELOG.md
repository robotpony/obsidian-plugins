# Changelog

All notable changes to the ⌥⌘ Space Command plugin will be documented in this file.

## [0.3.1] - 2026-01-08

### Added
- **Priority-based sorting**: TODOs and Projects now sorted by priority
  - Order: #focus, #p0, #p1, #p2, no priority, #p3, #p4
  - Unprioritized TODOs placed between #p2 and #p3 (medium priority)
  - Projects sorted by highest priority of their TODOs, then by TODO count
- **#focus tag support**: Focus action now adds #focus tag in addition to setting #p0
  - #focus tag automatically excluded from Projects list
  - TODOs with #focus appear at the very top of the list
- **Configurable TODONEs limit**: Control number of recent TODONEs displayed in sidebar
  - Default: 5 recent TODONEs
  - New setting: "Recent TODONEs limit"
  - "View all in [filename]" link appears when limit reached
- **#future filtering**: Snoozed TODOs (#future) now hidden from Active TODOs list
  - Keeps Active TODOs list focused on current work
  - #future TODOs still counted but not displayed

### Improved
- Projects list now reflects priority of associated TODOs
- Sidebar UI is more focused with limited TODONEs display
- Priority system is more intuitive with visible #focus tag
- Better distinction between active work and snoozed tasks

### Technical
- Added `highestPriority` field to `ProjectInfo` interface
- Added `recentTodonesLimit` setting to plugin settings
- ProjectManager now tracks highest priority for each project
- New `getPriorityValue()` helper method for consistent priority sorting
- SidebarView filters #future before rendering Active TODOs

## [0.3.0] - 2026-01-08

### Added
- **Context menu for TODO items**: Right-click TODOs in sidebar for quick actions
  - **Focus** (⚡): Increase priority (set to #p0 or decrease priority number)
  - **Later** (🕐): Decrease priority (set to #p4 or increase priority number)
  - **Snooze** (🌙): Set to #future for deferred tasks
- **Priority tag system**: Configurable priority tags (#p0-#p4 by default)
  - #p0 = highest priority (Focus)
  - #p4 = lowest priority (Later)
  - #future = snoozed/deferred tasks
  - Priority tags excluded from Projects list automatically
- **Settings button in sidebar**: Quick access to plugin settings (⚙️ icon next to refresh)

### Fixed
- Priority tags (#p0-#p4, #future) no longer appear in Projects list
- Projects list now correctly excludes all priority-related tags

### Improved
- Smart priority actions are idempotent (safe to repeat)
- Context menu provides keyboard-free workflow for priority management
- Sidebar refreshes automatically after priority changes
- User feedback via Notice for all priority operations

### Technical
- New `ContextMenuHandler` class for managing context menus
- New `setPriorityTag()` method in TodoProcessor for priority manipulation
- ProjectManager now filters configurable priority tags + #future
- Settings UI for customizing priority tags (comma-separated list)
- Uses Obsidian's native Menu API for context menus

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
- **XSS security vulnerability**: Replaced `innerHTML` with safe DOM methods
  - Protects against potential XSS attacks in TODO text
  - Uses tokenizer and DOM manipulation instead of HTML injection

### Improved
- Plugin name consistency: All docs now use "⌥⌘ Space Command"
- Documentation reorganization: Internal docs moved to `docs/development/`
- Comprehensive README with table of contents and v0.2.1 features
- Installation paths corrected to `.obsidian/plugins/space-command/`

### Technical
- Updated inline syntax regex from `[^|}\s]*` to `[^|}]*` to allow spaces
- Added smart detection to distinguish file paths from filter keywords
- Implemented custom `renderInlineMarkdown()` with token parser
- Safe markdown rendering using `appendText()` and `createEl()` instead of `innerHTML`
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
- Initial release of Space Command plugin
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
