# Changelog

All notable changes to the ␣⌘ Space Command plugin will be documented in this file.

## [0.9.18] - 2026-01-27

### Improved

- **Tab lock UX cleanup**: Cleaner visual state when tabs are locked
  - Locking a tab now hides the X (close button) and the lock button
  - Obsidian's native pushpin shows the locked state
  - Click the pushpin to unlock the tab
  - Reduces visual clutter (was showing both pushpin and lock icon over X)

### Technical

- Added `space-command-tab-locked` class to tab headers for CSS control
- New `addPinClickHandler()` method wires pushpin for unlocking
- CSS hides `.space-command-tab-lock-btn` and close button when locked

## [0.9.17] - 2026-01-27

### Added

- **Tab lock buttons**: Lock buttons on document tabs to prevent link clicks from replacing the view
  - Click the lock icon on any tab header to toggle pinned state
  - Locked (pinned) tabs force link clicks to open in new tabs
  - Uses Obsidian's native pinning API for reliable behaviour
  - Disabled by default—enable in Settings → "Show tab lock buttons"
  - Lock icon shows open padlock (unlocked) or closed padlock (locked)

### Technical

- New `TabLockManager` class for managing tab lock button injection
- New `showTabLockButton` setting (default: false)
- Uses MutationObserver to add buttons to new tabs dynamically
- Filters by `data-type="markdown"` to target only document tabs (not sidebar tabs)
- CSS: `.space-command-tab-lock-btn`, `.is-locked` states

## [0.9.16] - 2026-01-26

### Changed

- **Sidebar scrollbar**: Semi-transparent (65% opacity) scrollbar thumb with transparent track

## [0.9.15] - 2026-01-26

### Fixed

- **Sidebar layout padding**: Reduced header padding to 2px top/bottom, 4px left/right; scrollbar now flush with right edge

## [0.9.14] - 2026-01-26

### Fixed

- **Sidebar button styling**: Removed visible borders and backgrounds from close/menu buttons; added subtle hover effect

## [0.9.13] - 2026-01-26

### Fixed

- **Sidebar header now stays pinned** while scrolling content below

## [0.9.12] - 2026-01-25

### Fixed

- **#idea items appearing in TODO lists**: Items with `#idea`, `#ideas`, or `#ideation` tags now correctly appear only in Ideas tab/embeds, not in TODOs
  - Previously, items under a `#todos` header with `#idea` tag would appear in both TODO and Idea lists
  - Scanner now excludes `#idea` tagged items from todos cache
  - Added safety filters in SidebarView and EmbedRenderer to ensure clean separation

### Technical

- `TodoScanner.scanFile()` now checks for idea tags before adding items to todos list
- `SidebarView.renderActiveTodos()` filters out items with idea tags
- `EmbedRenderer.renderTodos()` and `refreshEmbed()` filter out idea-tagged items

## [0.9.11] - 2026-01-25

### Fixed

- **Project info popup not closing when opening other menus**: Opening a tag dropdown or other sidebar menu now properly closes any open project info popup, and vice versa

## [0.9.10] - 2026-01-25

### Fixed

- **Project info popup too narrow**: Increased popup width from 250-350px to 350-450px for better readability (approximately 12-15 words per line instead of 8). Uses inline styles to ensure CSS precedence.

## [0.9.9] - 2026-01-25

### Fixed

- **Embed missing children of header TODOs when filtering by tag**: Header TODOs now appear in embeds when their children match the tag filter, even if the header itself doesn't have that tag
  - Example: `## Ideas and TODOs #todos` with children tagged `#workflow-automation` now shows when embed filters by `tags:#workflow-automation`
  - Previously, the header was filtered out (it lacked the tag), so all its children were hidden too
  - Affects `{{focus-todos}}` inline embeds and `` ```focus-todos``` `` code blocks with tag filters

### Technical

- New `includeParentHeaders()` method in `EmbedRenderer.ts` adds parent headers when their children match filters
- Applied to `renderTodos()`, `render()`, and `refreshEmbed()` methods

## [0.9.8] - 2026-01-25

### Fixed

- **Embed missing items with plural tags**: TODOs using `#todos` (plural) now appear correctly in embed views
  - Previously, embeds checked `tags.includes("#todo")` which missed items tagged with `#todos`
  - Now uses `itemType` field set during scanning, which handles both singular and plural forms
  - Affects `{{focus-todos}}` inline embeds and `` ```focus-todos``` `` code blocks
  - Same fix applied to TODONE visibility filtering (`#todone`/`#todones`)

### Technical

- Replaced 5 `tags.includes("#todo")` / `tags.includes("#todone")` checks in `EmbedRenderer.ts` with `itemType === 'todo'` / `itemType === 'todone'`

## [0.9.7] - 2026-01-21

### Added

- **Version display**: Plugin version now shown in both About modal and Settings page
  - About modal shows version below the title
  - Settings page shows version in the about section
  - Version pulled from plugin manifest (always accurate)

## [0.9.6] - 2026-01-21

### Improved

- **Tag dropdown alphabetization**: Tags in the `#` dropdown menu are now sorted A→Z
- **Tag submenu ordering**: Clear tag → Filter by (alphabetical order)

## [0.9.5] - 2026-01-21

### Improved

- **Alphabetically sorted context menus**: All right-click menus now list items in A→Z order
  - Editor context menu: Copy as Slack → Define term... → Review... → Rewrite...
  - Sidebar hamburger menu: Embed Syntax → Refresh | About → Settings → Stats
  - Embed Syntax submenu: IDEA code block → IDEA inline → TODO code block → TODO inline
  - TODO context menu: Copy → Focus → Later → Snooze
  - Idea context menu: Add to TODOs → Copy → Focus

## [0.9.4] - 2026-01-21

### Added

- **Markdown rendering in LLM tooltips**: Define, Rewrite, and Review results now render as formatted markdown
  - Supports bold, italic, code, lists, and other markdown formatting
  - Term highlighting still works (uses Obsidian's highlight syntax internally)

### Improved

- **Tooltip header with command type**: Header now shows "␣⌘ Define", "␣⌘ Rewrite", or "␣⌘ Review"
  - Logo and command type on left, close button on right
  - Content starts below the header on its own line
  - Cleaner visual separation between header and content

### Technical

- `DefineTooltip` now requires `App` instance for markdown rendering
- New `CommandType` type for define/rewrite/review
- Uses Obsidian's `MarkdownRenderer.render()` for content display
- New `Component` lifecycle management for proper cleanup
- New CSS classes: `.define-tooltip-header`, `.define-tooltip-command-type`, `.define-tooltip-settings-link`

## [0.9.3] - 2026-01-21

### Improved

- **User-friendly LLM error messages**: Define, Rewrite, and Review commands now show helpful error messages
  - Displays: "Could not connect to {model-name}. Fix in Settings" with clickable link
  - Settings link opens the Space Command settings tab directly
  - Full error details logged to browser console for debugging

### Technical

- New `showError()` method in `DefineTooltip` for error display with Settings link
- New `getModel()` method in `LLMClient` for retrieving current model name
- New `openLLMSettings()` method in plugin for programmatic settings access
- Console logging includes operation type, model, URL, and error details

## [0.9.2] - 2026-01-21

### Fixed

- **Logo stretching in LLM tooltips**: The ␣⌘ logo no longer stretches to full container width
  - Changed from float to absolute positioning
  - Added left padding to tooltip for logo space

## [0.9.1] - 2026-01-21

### Fixed

- **LLM tooltips now scrollable**: Define, Rewrite, and Review tooltips now scroll when content exceeds viewport
  - Added `max-height: 60vh` to tooltip container
  - Content area uses flexbox with `overflow-y: auto`
  - Actions bar stays fixed at bottom while content scrolls

## [0.9.0] - 2026-01-21

### Added

- **Rewrite command**: Select text, right-click, choose "Rewrite..." to get an LLM-powered rewrite
  - Suggests changes for clarity, accuracy, and brevity
  - Shows result in tooltip with Copy and Apply buttons
  - Apply button replaces the selected text with the rewritten version
  - Customizable prompt in settings

- **Review command**: Select text, right-click, choose "Review..." for editorial feedback
  - Provides specific suggestions for improvement
  - Shows result in tooltip with Copy button
  - Customizable prompt in settings

### Improved

- **Define tooltip**: Now shows "Defining..." during loading (was generic "Loading...")
- **Settings organization**: LLM settings section renamed to "LLM Settings (Define, Rewrite, Review)"
- **Tooltip actions**: New actions bar with Copy/Apply buttons for rewrite results

### Technical

- Extended `LLMClient` with `rewrite()` and `review()` methods
- Extended `DefineTooltip` with optional `onApply` callback and actions bar
- New settings: `llmRewritePrompt`, `llmReviewPrompt`
- New CSS classes: `.define-tooltip-actions`, `.define-tooltip-btn`, `.define-tooltip-copy-btn`, `.define-tooltip-apply-btn`

## [0.8.6] - 2026-01-21

### Fixed

- **Sidebar not updating for external file changes**: TODOs and IDEAs now refresh when files are modified outside Obsidian
  - Added `metadataCache.on("changed")` listener to detect external file modifications
  - Fixes issue where editing files via another editor, git operations, or sync services wouldn't update the sidebar
  - Documents already updated (Obsidian reloads them), now the sidebar cache refreshes too

## [0.8.5] - 2026-01-21

### Fixed

- **Project info popup callouts**: Callouts in project files are now rendered with proper Obsidian styling (icons, colors) instead of appearing as plain text

## [0.8.4] - 2026-01-21

### Changed

- **Definition tooltip layout**: Logo now floats at top-left instead of top-right

## [0.8.3] - 2026-01-21

### Fixed

- **Definition tooltip positioning**: Tooltip now stays fully within the viewport, adjusting position and adding scroll if needed for long definitions
- **Definition tooltip layout**: Logo now floats at top-right with text flowing around it on the same line

## [0.8.2] - 2026-01-21

### Fixed

- **Definition prompt textarea size**: The prompt configuration field in settings is now full-width and 4 lines tall for easier editing

## [0.8.1] - 2026-01-21

### Improved

- **Define tooltip branding**: Space Command logo (␣⌘) now appears in the top-left of the definition tooltip
- **Term highlighting**: The selected term is highlighted with Obsidian's highlight color wherever it appears in the definition
- **Context menu text**: Changed from "Define" to "Define term..." for clarity

### Technical

- New `.define-tooltip-header` class for logo positioning
- New `.define-tooltip-highlight` class using `--text-highlight-bg` CSS variable
- `DefineTooltip.show()` now accepts a `term` parameter for highlighting

## [0.8.0] - 2026-01-21

### Added

- **Define context menu**: Select text, right-click, choose "Define" to get an LLM-powered definition
  - Sends selected text to a local LLM (Ollama by default) for contextual explanation
  - Definition appears in an inline tooltip near the selection
  - Loading spinner shows while waiting for response
  - Tooltip closes on click outside or Escape key
  - Handles viewport overflow (repositions if near screen edges)

### Settings

- **Enable Define feature**: Toggle the Define menu item on/off (default: on)
- **LLM URL**: Ollama server URL (default: `http://localhost:11434`)
- **LLM Model**: Model name to use (default: `llama3.2`)
- **Definition prompt**: Customizable prompt prepended to selected text
- **Timeout**: Maximum wait time for LLM response (default: 30 seconds)

### Technical

- New `LLMClient` class for Ollama API integration using Obsidian's `requestUrl`
- New `DefineTooltip` class for positioned tooltip display with CodeMirror coordinate lookup
- New CSS classes: `.define-tooltip`, `.define-tooltip-loading`, `.define-tooltip-spinner`, `.define-tooltip-close`

## [0.7.33] - 2026-01-21

### Fixed

- **Tag dropdown menu clipping in right sidebar**: The `#` tag menu now opens within the Obsidian view instead of being clipped off-screen
  - Detects sidebar position (left or right) and adjusts menu direction accordingly
  - Submenus also open in the correct direction based on sidebar position

## [0.7.32] - 2026-01-21

### Fixed

- **Tag dropdown position in TODO section**: The `#` tag menu now appears on the right side (before the → link), matching the DONE section layout
  - Previously rendered inline within the text span
  - Now rendered as a separate flex item on the row container

## [0.7.31] - 2026-01-21

### Fixed

- **Project info popup excludes embeds**: Description no longer includes code blocks or `{{...}}` inline embeds
  - Fenced code blocks (` ``` `) are skipped entirely
  - Lines containing only `{{...}}` are skipped
  - Inline `{{...}}` syntax within paragraphs is stripped

## [0.7.30] - 2026-01-21

### Added

- **Project info popup**: Click the `ⓘ` icon next to any project tag in the Focus section to see project details
  - Shows the first 1-2 paragraphs from the project file as a description
  - Lists any `#principle` tags found in the project file
  - Includes a link to open the project file in a new tab
  - Popup appears to the left of sidebar (when docked right) or right (when docked left)
  - Click outside to dismiss

### Technical

- New `getProjectFileInfo()` method in `ProjectManager` for reading project file content
- New `getProjectFilePath()` helper method in `ProjectManager`
- New `showProjectInfoPopup()` method in `SidebarView`
- Detects sidebar position via `this.leaf.getRoot()` comparison with `workspace.rightSplit`
- New CSS classes: `.project-info-icon`, `.project-info-popup`, `.project-info-title`, `.project-info-description`, `.project-info-principles`, `.project-info-principle-tag`, `.project-info-link`

## [0.7.29] - 2026-01-19

### Added

- **Exclude folders from projects setting**: New setting to exclude specific folders from inferred project tags
  - Default: `log` folder excluded
  - Prevents journal/log files from generating spurious project tags
  - Comma-separated list in Settings → Projects Settings → "Exclude folders from projects"

### Fixed

- **Invalid characters in inferred project tags**: `filenameToTag()` now sanitizes filenames properly
  - Removes commas, parentheses, and other invalid tag characters
  - Example: "Week of January 12th, 2026.md" → `#week-of-january-12th-2026` (was `#week-of-january-12th,-2026`)
  - Collapses multiple hyphens and trims leading/trailing hyphens

### Changed

- **Inferred project tags only apply to projects folder**: Files outside the configured projects folder no longer generate inferred project tags
  - TODOs without explicit tags in non-project files are simply untagged (not grouped under filename)
  - Explicit project tags (e.g., `#myproject`) still work anywhere in the vault

## [0.7.28] - 2026-01-19

### Improved

- **Sidebar date styling**: Completion dates on done items (DONE section) now display with muted-pill styling
  - Matches the visual style used for priority tags (`#focus`, `#p0`-`#p4`, `#future`)
  - Date is extracted from text and rendered as a separate styled element
  - Consistent with how dates are displayed in embed blocks

## [0.7.27] - 2026-01-19

### Added

- **Copy to clipboard**: Right-click any sidebar item (TODO, idea, or principle) and select "Copy" to copy the full line text to clipboard
  - Available on TODOs, ideas, and principles
  - Principles now have a context menu (previously had none)

## [0.7.26] - 2026-01-19

### Added

- **Vault Statistics**: New "Stats" option in the sidebar kebab menu (vertical dots)
  - Opens a modal showing summary statistics for your vault
  - **TODOs**: Active count, focused count, snoozed count, completed count
  - **Ideas**: Total count, focused count
  - **Principles**: Total count
  - Shows grand total of all tracked items

## [0.7.25] - 2026-01-19

### Fixed

- **Priority context menu on child TODOs**: Right-clicking a TODO item in a block-tagged list (list items under a header with `#todo`) no longer throws "no longer contains #todo tag" error
  - Child items inherit TODO status from parent header and don't need explicit `#todo` tag
  - Priority operations (set priority, add focus) now work correctly on these items

## [0.7.24] - 2026-01-19

### Added

- **Focus list context menu**: Right-click projects in the Focus section for batch operations
  - **Filter by**: Sets the sidebar tag filter to show only items with that project tag
  - **Focus/Unfocus**: Add or remove `#focus` from all TODOs with that project tag
  - **Later/Unlater**: Decrease or restore priority for all matching TODOs
  - **Snooze/Unsnooze**: Add or remove `#future` from all matching TODOs
  - Works in both sidebar and embedded `{{focus-list}}` blocks

### Technical

- New batch operation methods in `TodoProcessor`: `focusAllWithTag()`, `unfocusAllWithTag()`, `laterAllWithTag()`, `unlaterAllWithTag()`, `snoozeAllWithTag()`, `unsnoozeAllWithTag()`
- New `showProjectMenu()` method in `ContextMenuHandler`
- Silent versions of tag operations for batch use (no individual notices)

## [0.7.23] - 2026-01-19

### Fixed

- **Embed list alignment**: Removed extra left margin from task list items in embeds so all items align flush left with the embed container

## [0.7.22] - 2026-01-19

### Added

- **`#ideation` tag alias**: `#ideation` now works as an alias for `#idea` and `#ideas`
  - Appears in the Ideas tab alongside other ideas
  - Supports all idea operations: complete, convert to TODO, focus
  - Works with header ideas and children
  - Excluded from project tags in Focus section

## [0.7.21] - 2026-01-19

### Fixed

- **Inline code content preserved in sidebar**: Tags inside backticks (e.g., `` `#ideation` ``) are now displayed as plain text in the sidebar, rather than being stripped as tags. Tags are stripped before markdown processing to preserve code block content

## [0.7.20] - 2026-01-19

### Changed

- **Tag dropdown now has submenus**: Each tag in the `#` dropdown menu shows a submenu with:
  - **Filter by**: Filters the sidebar to show only items with that tag (previous behavior)
  - **Clear tag**: Removes the tag from that TODO/idea/principle item

## [0.7.19] - 2026-01-19

### Changed

- **DONE section no longer filtered**: The DONE section always shows recent completions regardless of active tag filter
  - Filter indicator button removed from DONE header
  - Completed items represent history and should always be visible

### Fixed

- **Tags in inline code excluded from sidebar**: Tags inside backticks (e.g., `` `#ideation` ``) are now correctly excluded from the sidebar tag dropdown
  - Inline code tags are for documentation purposes, not actual tags
  - Reverts unintended behavior from 0.7.17

## [0.7.18] - 2026-01-19

### Added

- **Filter indicator button in section headers**: When a tag filter is active, a clickable badge showing the filter (e.g., `#project ×`) appears after each section title
  - Click the badge to clear the filter instantly
  - Appears in sections: Focus, TODO, Principles, Ideas (not DONE)
  - Empty state messages now indicate the active filter (e.g., "No TODOs matching #project")

## [0.7.16] - 2026-01-19

### Fixed

- **Embed list children now flush with header**: Child items in embedded TODO/idea/principle lists are no longer indented—they align with the parent header

## [0.7.15] - 2026-01-19

### Added

- **Inline `{{focus-ideas}}` embed syntax**: Ideas can now be embedded inline (Reading Mode only)
  - Same filter support as code blocks: `{{focus-ideas | tags:#project path:notes/}}`

### Changed

- **Renamed "Copy embed syntax" menu to "Embed Syntax"**: Clearer menu title
- **Reorganized embed menu items**: Now shows all four embed options
  - TODO code block (`` ```focus-todos`` ``)
  - TODO inline (`{{focus-todos}}`)
  - IDEA code block (`` ```focus-ideas`` ``)
  - IDEA inline (`{{focus-ideas}}`)

## [0.7.14] - 2026-01-19

### Added

- **Automatic file-level project tags**: TODOs and ideas without explicit project tags now automatically inherit a project tag from their filename
  - Example: TODOs in `api-tasks.md` are grouped under `#api-tasks` in the Focus section
  - Filenames with spaces are converted to dashes (e.g., `My Project.md` → `#my-project`)
  - **Manual tags win**: If a TODO has an explicit project tag (e.g., `#backend`), the file-level tag is not applied
  - Works at display time (no file modifications)—existing markdown is unchanged

### Technical

- New `filenameToTag()` utility function in `utils.ts`
- New `inferredFileTag` field on `TodoItem` interface
- `TodoScanner.createTodoItem()` now populates `inferredFileTag` from filename
- `ProjectManager.getProjects()` uses `inferredFileTag` as fallback when no explicit project tags exist
- `FilterParser.applyFilters()` now uses `inferredFileTag` for tag filtering

## [0.7.13] - 2026-01-19

### Added

- **About section**: New About information accessible from multiple locations
  - Click the ␣⌘ logo in the sidebar header to open About modal
  - Menu item "About" added to sidebar hamburger menu
  - About section at top of Settings page with logo, blurb, author, and repo link
- **Clickable sidebar logo**: The ␣⌘ logo now has hover effects and opens About modal on click

### Technical

- New `AboutModal` class extending Obsidian's Modal
- New `showAboutModal()` method on plugin class
- SidebarView now accepts `onShowAbout` callback
- New CSS classes: `.clickable-logo`, `.space-command-about-modal`, `.space-command-about-section`

## [0.7.12] - 2026-01-19

### Added

- **`focus-ideas` code block support**: Embed ideas with filtering
  - Syntax: `` ```focus-ideas `` with optional `tags:`, `path:`, `limit:` filters
  - Supports header ideas with children (same as todos)
  - Auto-refreshes when ideas change
- **`focus-principles` code block support**: Embed principles with filtering
  - Same filter syntax as `focus-ideas`
  - Supports header principles with children

### Technical

- New `renderIdeas()` and `renderPrinciples()` public methods in `EmbedRenderer`
- New `processFocusIdeas()` and `processFocusPrinciples()` methods in `CodeBlockProcessor`
- Registered `focus-ideas` and `focus-principles` as markdown code block processors

## [0.7.11] - 2026-01-19

### Fixed

- **Plural tag completion bug**: Header TODOs using `#todos` (plural) now properly marked as complete
  - Previously, completing a header with `#todos` would add it to the TODONE file but not update the source file
  - Root cause: regex `/#todo\b/` didn't match `#todos` (the 's' prevented word boundary match)
  - Fix: `replaceTodoWithTodone()` now converts `#todos` → `#todones` and `#todo` → `#todone`
- **TODONE file re-inclusion bug**: Completed items in TODONE file no longer re-appear in sidebar
  - Previously, items with `#todos` tag would match as TODOs even after completion
  - Fix: `cleanupDuplicateTags()` now removes both `#todo` and `#todos` when `#todone`/`#todones` present
- **Reverse operation consistency**: `replaceTodoneWithTodo()` now handles plural forms
  - `#todones` → `#todos`, `#todone` → `#todo`

## [0.7.10] - 2026-01-19

### Fixed

- **Header TODO completion creates duplicate entries**: Completing a header TODO (e.g., `## Task #todo`) no longer creates malformed entries in the TODONE log
  - Previously, heading markers (`##`) were included when writing to the done file, creating entries like `- [x] ## Task #todone`
  - The scanner would then pick this up as a separate item, causing duplicates in the sidebar
  - Fix: Strip heading markers from header TODOs before appending to the TODONE file

## [0.7.9] - 2026-01-19

### Fixed

- **Sidebar activation error on startup**: Fixed `TypeError: Cannot read properties of null (reading 'children')` when "Show sidebar by default" is enabled
  - Root cause: `workspace.getRightLeaf()` called before Obsidian workspace layout was ready
  - Fix: Defer sidebar activation using `workspace.onLayoutReady()` callback

## [0.7.8] - 2026-01-19

### Fixed

- **Styled logo in notifications**: Notice popups now display the ␣⌘ logo with the blue badge background
  - Previously, notifications showed plain text without the styled logo appearance
  - Now uses the same `.space-command-logo` CSS styling as the sidebar header
  - Applies to all plugin notifications (completions, errors, copy confirmations, etc.)

### Technical

- New `showNotice()` helper function in `utils.ts` creates styled notices using `DocumentFragment`
- Replaced 19 `new Notice()` calls across `main.ts`, `SidebarView.ts`, and `TodoProcessor.ts`

## [0.7.7] - 2026-01-19

### Changed

- **Dynamic sidebar title**: Sidebar header now shows "␣⌘ TODOs" or "␣⌘ IDEAs" based on active tab
  - Previously always showed "␣⌘ Space Command"
  - Tab title in Obsidian also updates to match

### Fixed

- **Plural tags in Focus list**: `#todos`, `#todones`, `#ideas`, and `#principles` no longer appear as projects in the Focus section
  - These are type tags that should be excluded like their singular forms

## [0.7.6] - 2026-01-19

### Changed

- **Logo updated**: Changed logo from `⌥⌘` to `␣⌘` (space-command) across all UI and documentation

### Added

- **Plural tag variants**: `#todos`, `#ideas`, `#principles`, and `#todones` now work as synonyms for their singular forms
  - Useful for header-block lists where plural reads more naturally (e.g., `## Project #todos`)
  - Both forms are stripped from display in sidebar and embedded focus lists

## [0.7.5] - 2026-01-19

### Added

- **Implicit file tags for filtering**: TODOs in a file now implicitly match a tag derived from the filename
  - Example: TODOs in `workflow-automation.md` match the filter `tags:#workflow-automation`
  - Filenames with spaces are converted to dashes (e.g., `my project.md` → `#my-project`)
  - Only affects embed filtering; explicit tags in sidebar remain unchanged

### Changed

- **Tag dropdown trigger styled as tag**: The `#` trigger now uses Obsidian's native tag CSS variables for consistent appearance
- **Tag dropdown flows inline**: Tag dropdown trigger now appears inline after item text instead of floating right
- **Removed count badge from sidebar headers**: The child count chicklet (e.g., "16") no longer displays on header items

### Fixed

- **Header markdown in embeds**: Heading markers (`###`) now stripped from header TODO text in embedded lists

## [0.7.4] - 2026-01-18

### Added

- **Collapsed tags in sidebar**: Tags now collapse into a `#` indicator
  - Click `#` to open dropdown showing all tags on the item
  - Click a tag to filter the sidebar to items with that tag
  - "Clear filter" option at bottom (greyed out until filter is active)
  - Filter applies to TODOs, TODONEs, Ideas, and Principles
  - Dropdown closes on selection or click outside

### Technical

- New `renderTagDropdown()` method in SidebarView for tag dropdown UI
- Added `activeTagFilter` state to track current filter
- Filter logic added to `renderActiveTodos`, `renderRecentTodones`, `renderActiveIdeas`, `renderPrinciples`
- New CSS classes: `.tag-dropdown-trigger`, `.tag-dropdown-menu`, `.tag-dropdown-item`, `.tag-dropdown-separator`, `.tag-dropdown-clear`

## [0.7.3] - 2026-01-18

### Changed

- **Unified tag styling**: All plugin tags now render consistently at 9pt monospace with 0.85 opacity
  - Applies to tags in headings, list items, paragraphs, sidebar, and embeds
  - Covers all plugin tags: `#todo`, `#todone`, `#idea`, `#principle`, `#focus`, `#future`, `#p0`-`#p4`

### Fixed

- **Sidebar empty on startup**: Fixed race condition when Obsidian restores sidebar from previous session
  - Sidebar now triggers vault scan if opened before plugin initialization completes
  - Previously showed empty lists until manual refresh
- **Copy as Slack links**: Links no longer wrapped in angle brackets
  - `[text](url)` now copies as `text (url)` instead of `<url|text>`
  - Bare URLs remain as plain text (Slack auto-links them)

### Improved

- **Documentation**: Updated README with complete settings reference and commands
  - Added missing settings: Default projects folder, Focus list limit
  - Added descriptions to all settings
  - Documented `{{focus-list}}` embed syntax
  - Added Refresh TODOs command to commands table

### Technical

- **Reduced code duplication**: Extracted shared utilities from EmbedRenderer and SidebarView
  - `openFileAtLine()` - opens file and navigates to specific line
  - `highlightLine()` - temporarily highlights a line in editor
  - `renderTextWithTags()` - safely renders text with tag styling (XSS-safe)
  - Removed ~90 lines of duplicated code

## [0.7.2] - 2026-01-15

### Changed

- **Removed item counts from sidebar and embeds**: Section headers (Focus, TODO, Principles, Ideas) and project items no longer display counts

### Improved

- **Unified rendering for ideas and principles**: Ideas and principles now support the same header-with-children pattern as TODOs
  - Header ideas (`## My Idea #idea`) now display child items indented below
  - Header principles work the same way
  - All three types (todos, ideas, principles) share a single rendering method
- **Scanner support for idea/principle headers**: `TodoScanner` now tracks header context for `#idea` and `#principle` tags
  - List items below a header idea/principle are captured as children
  - Children filtered from top-level lists (rendered under their parent)

### Technical

- New `ItemRenderConfig` interface in `types.ts` for unified list item rendering
- Refactored `SidebarView.ts`: consolidated `renderTodoItem`, `renderIdeaItem`, `renderPrincipleItem` into single `renderListItem` method
- Added config constants (`todoConfig`, `ideaConfig`, `principleConfig`) for type-specific behavior
- `TodoScanner.scanFile()` now tracks `currentHeaderIdea` and `currentHeaderPrinciple` for parent-child relationships
- New CSS for idea/principle headers: `.idea-header`, `.idea-header-row`, `.idea-children`, `.principle-header`, `.principle-header-row`, `.principle-children`

## [0.7.1] - 2026-01-15

### Fixed

- **Sidebar empty on load**: Sidebar now populates correctly when Obsidian starts
  - Previously required manual refresh after reboot
  - Root cause: race condition between vault scan and sidebar activation
  - Fix: emit `todos-updated` event after full vault scan completes

- **Completing child TODOs from embeds**: Child items under header TODOs can now be completed from embeds
  - Previously threw error: "Line X no longer contains `#todo` tag"
  - Root cause: child items inherit TODO status from parent header (no explicit `#todo` tag)
  - Fix: detect child items via `parentLineNumber` and append `#todone @date` directly

- **Completed items not disappearing from embeds/sidebar**: Completed TODOs now immediately disappear from lists
  - Previously, completed items remained visible until manual refresh
  - Root cause: UI refreshed before scanner cache was updated (debounced file watcher)
  - Fix: `TodoProcessor` now triggers immediate file rescan after modifications

## [0.7.0] - 2026-01-12

### Added

- **Ideas Tab**: New sidebar tab for capturing ideas separate from actionable TODOs
  - Toggle between TODOs (checkmark icon) and Ideas (lightbulb icon) tabs
  - Sidebar header now shows "␣⌘ Space Command" with tab navigation
- **Idea tracking**: New `#idea` tag for capturing ideas
  - Ideas shown in Ideas tab with checkbox and link to source
  - Clicking checkbox dismisses the idea (removes `#idea` tag)
  - Right-click menu: "Add to TODOs" (converts `#idea` → `#todo`) and "Focus" toggle
- **Principles section**: New `#principle` tag for guiding principles
  - Displayed in italics at top of Ideas tab
  - Principles are reference items (no checkbox action)
- **Focus support for ideas**: `#focus` tag works on ideas for prioritization

### Technical

- Extended `TodoItem` interface with `itemType` discriminator field
- Added `ideasCache` and `principlesCache` to `TodoScanner`
- New `getIdeas()` and `getPrinciples()` methods in `TodoScanner`
- New `completeIdea()`, `convertIdeaToTodo()`, `addFocusToIdea()` methods in `TodoProcessor`
- New `showIdeaMenu()` method in `ContextMenuHandler`
- New `renderIdeasContent()`, `renderPrinciples()`, `renderActiveIdeas()`, `renderIdeaItem()` in `SidebarView`
- New utility functions: `removeIdeaTag()`, `replaceIdeaWithTodo()`
- New CSS: `.sidebar-tab-nav`, `.sidebar-tab-btn`, `.idea-*`, `.principle-*` classes

## [0.6.6] - 2026-01-12

### Fixed

- **Checkbox sync for child TODOs**: Native Obsidian checkbox clicks now sync with sidebar
  - Checking `- [x]` in a header TODO's child items now automatically adds `#todone @date`
  - Previously, checking items in the document didn't update the sidebar (only embeds/sidebar checkboxes worked)
  - Syncs on file scan, so changes appear immediately in sidebar

### Technical

- New `isCheckboxChecked()` helper in `utils.ts`
- New `syncCheckedCheckboxes()` method in `TodoScanner` adds `#todone @date` to checked items
- Scanner detects `- [x]` without `#todone` tag and queues for sync

## [0.6.5] - 2026-01-12

### Added

- **Branded logo styling**: New `␣⌘` logo element with styled appearance
  - Blue background (`#689fd6`), white text, rounded corners
  - Used in sidebar header
  - All Notice messages now prefixed with `␣⌘` for brand consistency

### Technical

- New `.space-command-logo` CSS class for logo styling
- Added `LOGO_PREFIX` constant in `utils.ts` for consistent Notice prefixes
- Updated 13 Notice messages across `main.ts`, `SidebarView.ts`, and `TodoProcessor.ts`

## [0.6.4] - 2026-01-12

### Security

- **Fixed XSS vulnerability**: Replaced unsafe `innerHTML` with safe DOM methods in sidebar tag rendering
  - `wrapTagsInSpans()` rewritten as `renderTextWithTags()` using `createEl()` and `appendText()`
  - Project item rendering now uses safe DOM methods

### Fixed

- **Line content validation**: TODO/TODONE modifications now verify line content before changes
  - Prevents modifying wrong lines if file was edited externally
  - Validates `#todo`/`#todone` tag presence before completion, revert, or priority changes
- **Memory leak prevention**: `CodeBlockProcessor` now reuses plugin's `EmbedRenderer` instance
  - Previously created new renderer for each code block, leaking event listeners

### Improved

- **Type safety**: Replaced `any` types with proper interfaces throughout codebase
  - `FilterParser.applyFilters()` uses `TodoItem[]`
  - `SidebarView` methods use `ProjectInfo` and `TFile`
  - `EmbedRenderer.openFileAtLine()` uses `TFile`
- **Debounced file scanning**: File change handlers now debounced to 100ms
  - Prevents rapid consecutive scans during fast edits
  - Uses Obsidian's built-in `debounce()` function
- **Proper imports**: Replaced `require("obsidian")` with standard imports
  - `Modal`, `MarkdownView`, `Notice` now imported at module level

### Technical

- Extracted `getPriorityValue()` to shared `utils.ts` (was duplicated in 3 files)
- Removed unused `hugo` dependency from package.json
- Build passes with no TypeScript errors

## [0.6.3] - 2026-01-12

### Added

- **Copy as Slack Markdown**: Convert and copy selected text to Slack's mrkdwn format
  - Hotkey: `Cmd/Ctrl + Shift + C`
  - Right-click context menu: "Copy as Slack" (appears when text is selected)
  - Converts `**bold**` → `*bold*`, `*italic*` → `_italic_`
  - Converts `# Heading` → `*Heading*` (bold line)
  - Converts `[text](url)` → `<url|text>` (Slack link format)
  - Handles lists, blockquotes, and code blocks

### Technical

- New `SlackConverter.ts` module wrapping `slackify-markdown` library
- Strips zero-width spaces (U+200B) that the library inserts around formatting markers
- Uses Obsidian's `editor-menu` event for context menu integration

## [0.6.2] - 2026-01-10

### Improved

- **Toggle-able context menu actions**: Right-click menu items now toggle on/off
  - Focus/Unfocus: Removes `#focus` if present, adds it otherwise
  - Later/Unlater: Removes `#p3`/`#p4` if present, lowers priority otherwise
  - Snooze/Unsnooze: Removes `#future` if present, adds it otherwise
- **Normalized tag sizes in headings**: Plugin tags (`#todo`, `#todone`, `#focus`, `#future`, `#p0-#p4`) now render at body text size in headings
  - Applies to both Live Preview (CodeMirror) and Reading Mode
  - Tags no longer scale up with heading size
- **Embed icons positioning**: Moved embed header icons up to avoid overlap with Obsidian's view-source button

### Fixed

- **#focus in code blocks**: `#focus` tags inside code blocks and inline code are now ignored
  - Consistent with existing `#todo`/`#todone` behavior

### Technical

- New `removeTag()` method in TodoProcessor
- Updated `isInInlineCode()` in TodoScanner to detect `#focus`
- CSS selectors for `.cm-header .cm-tag-*` and `.markdown-preview-view h1-h6 .tag[href="#*"]`

## [0.6.1] - 2026-01-10

### Improved

- **Header TODO layout**: Headers with children now display vertically instead of side-by-side
  - Header row shows: checkbox, title (without markdown), count badge, and link
  - Children render indented below the header for better readability
  - Markdown heading markers (`####`) stripped from display text

## [0.6.0] - 2026-01-10

### Added

- **Header TODOs with children**: Headers with `#todo` tag now treat all list items below as child TODOs
  - Example: `## Project X #todo` followed by `- Task 1`, `- Task 2` creates a parent-child hierarchy
  - Children displayed indented under their parent header in sidebar and embeds
  - Completing a header TODO automatically completes all its children
  - Children inherit TODO status from parent (no explicit `#todo` tag needed)
  - Hierarchy ends at next same-level or higher-level header
- **Focus tag highlighting**: Items with `#focus` tag now have accent-colored background in sidebar
  - Applies to both TODO items in the Active TODOs section
  - Also highlights projects in the Focus section that contain `#focus` items
  - Uses Obsidian's `--interactive-accent` color at 15% opacity
  - Hover state increases to 25% opacity
- **TODONE show/hide toggle**: New filter and UI button for controlling completed item visibility in embeds
  - New filter syntax: `todone:show` or `todone:hide`
  - Eye icon toggle button in embed header (next to refresh button)
  - Default: show (displays both TODOs and TODONEs)
  - Toggle state persists across auto-refreshes
  - Example: `` ```focus-todos\ntodone:hide\n``` `` hides completed items

### Improved

- Header TODOs display with bold text styling
- Child TODOs have subtle left border and indentation for visual hierarchy
- Embed rendering refactored to support parent-child relationships

### Technical

- Extended `TodoItem` interface with `isHeader`, `headerLevel`, `parentLineNumber`, `childLineNumbers` fields
- Extended `TodoFilters` interface with `todone` field
- Added `detectHeader()` and `isListItem()` methods to TodoScanner
- Added `completeChildrenLines()` method to TodoProcessor
- Added `todoneVisibility` Map to EmbedRenderer for toggle state
- Updated FilterParser to handle `todone:show|hide` syntax
- New CSS classes: `.todo-header`, `.todo-children`, `.todo-child`, `.todo-focus`, `.project-focus`, `.embed-toggle-todone-btn`

## [0.5.2] - 2026-01-10

### Added

- **`/todos` slash command**: Insert a TODO list with heading and blank item
  - Creates `## TODOs` heading with blank `- [ ] #todo ` item
  - Cursor positioned ready to type task description

### Improved

- **Muted DONE section**: DONE list now displays at 70% opacity
  - Increases to full opacity on hover
  - Visual hierarchy emphasizes active TODOs over completed items
- **Tag-style counts**: TODO and project counts now styled like tags
  - Removed parentheses around numbers (e.g., `5` instead of `(5)`)
  - Consistent pill styling with tags

## [0.5.1] - 2026-01-10

### Added

- **Un-complete TODONEs**: Click checked items in sidebar DONE section to revert
  - Converts `#todone @date` back to `#todo`
  - Unchecks `[x]` to `[ ]` if checkbox exists
  - TODONE log file preserved as history
- **Native checkbox support**: Clicking checkboxes in normal markdown lists now works
  - `- [ ] Task #todo` → click checkbox → converts to `#todone @date`
  - Works in Live Preview and Reading Mode
- **Embed auto-refresh**: Embedded TODO lists now update automatically
  - Subscribes to `todos-updated` events from scanner
  - New TODOs appear immediately without switching tabs
- **Embed refresh button**: Manual refresh icon in top-right of each embed
  - Click to force refresh if needed
  - Subtle 40% opacity, increases on hover

### Fixed

- **Embeds missing TODONEs**: Embedded lists now show both active TODOs and completed TODONEs
  - TODONEs appear at end of list with strikethrough styling
  - Filters apply to both TODOs and TODONEs
- **Duplicate TODOs from lines with both tags**: Lines containing both `#todo` and `#todone` now:
  - Treated as completed (`#todone` wins)
  - `#todo` tag automatically removed from the line
- **Muted tag visibility in sidebar**: Tags and dates now have visible background
  - Changed from `--background-secondary` to `--background-primary` in sidebar
  - Proper contrast against grey sidebar background
- **Muted element font size**: Reduced from 0.9em to 0.8em for better visual hierarchy
  - Applied to `.muted-pill`, `.tag`, `.todo-count`, `.project-count`

### Technical

- New `uncompleteTodo()` method in TodoProcessor
- New `replaceTodoneWithTodo()` and `markCheckboxIncomplete()` utils
- EmbedRenderer tracks active renders with `activeRenders` Map for cleanup
- Added `setupAutoRefresh()`, `setupFocusListAutoRefresh()`, `refreshEmbed()` methods
- DOM event listener in main.ts for native checkbox changes
- New `.embed-header` and `.embed-refresh-btn` CSS classes
- Scanner now detects and auto-cleans lines with both `#todo` and `#todone`

## [0.5.0] - 2026-01-10

### Added

- **Copy embed syntax button**: New copy button in sidebar header
  - Click to open menu with two options: inline or code block syntax
  - Copies embed syntax to clipboard with confirmation notice
- **Auto-sorting in embedded lists**: TODOs now sort by priority then project
  - Active TODOs sorted: #focus → #p0 → #p1 → #p2 → none → #p3 → #p4 → #future
  - Secondary sort by project tag alphabetically within each priority
  - Completed TODONEs always appear at the end
- **Right-click context menu in embedded lists**: Same menu as sidebar
  - Focus, Later, and Snooze actions available on embedded TODOs
  - Shared `ContextMenuHandler` for consistent behavior
- **Completion date display**: TODONEs show completion date with muted pill style
  - Parses @YYYY-MM-DD from completed items
  - Date displayed separately with themed background styling
- **Muted pill styling**: Unified visual style for metadata
  - Tags, counts, and dates use consistent pill appearance
  - 65% opacity with theme-aware background (`--background-secondary`)
  - Rounded corners for tag-like appearance
  - Applied to: priority tags, project tags, todo counts, completio1n dates

### Improved

- Embedded lists and sidebar now share consistent styling
- Priority tags (#focus, #p0-#p4, #future) get muted-pill style in embeds
- Regular project tags styled as tags without pill background

### Technical

- `EmbedRenderer` now accepts `priorityTags` parameter
- Added `sortTodos()`, `getPriorityValue()`, `getFirstProjectTag()` methods
- Added `extractCompletionDate()` for parsing completion dates
- Added `renderTextWithTags()` for inline tag styling with pill classes
- `CodeBlockProcessor` passes `priorityTags` to `EmbedRenderer`
- New `.muted-pill` CSS class for shared styling

## [0.4.0] - 2026-01-08

### Added
- **Slash commands**: Type `/` at start of line for quick insertions
  - `/todo` - Insert a new TODO item (`- [ ] #todo `)
  - `/today` - Insert today's date
  - `/tomorrow` - Insert tomorrow's date
  - `/callout` - Shows callout type sub-menu, inserts `> [!type]` block
  - Callout types: info, tip, note, warning, danger, bug, example, quote, abstract, success, question, failure
- **@date quick insert**: Type `@` anywhere for date suggestions
  - `@date` / `@d` - Today's date
  - `@today` / `@t` - Today's date
  - `@tomorrow` - Tomorrow's date
  - `@yesterday` - Yesterday's date
  - Uses configured date format (default: YYYY-MM-DD)

### Technical
- New `SlashCommandSuggest` class using Obsidian's `EditorSuggest` API
- New `DateSuggest` class for @-triggered date insertion
- Slash commands only trigger at column 0 to avoid conflict with Obsidian's built-in slash commands
- Callouts use native Obsidian callout syntax (`> [!type]`)

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
- Plugin name consistency: All docs now use "␣⌘ Space Command"
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
- README.md - User guide and feature documentation
- CHANGELOG.md - Version history
- CLAUDE.md - Development guidance for Claude Code
