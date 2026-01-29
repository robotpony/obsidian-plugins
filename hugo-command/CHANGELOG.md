# Changelog

All notable changes to the Hugo Command plugin will be documented in this file.

## [0.5.3] - 2026-01-28

### Improved

- **Post info dropdown redesign**: Title-first layout with date and folder as metadata
  - Post title displayed prominently at top
  - Date and folder shown as secondary metadata line below title
  - Review section now has proper padding for readability

## [0.5.2] - 2026-01-28

### Improved

- **Review loading indicator**: Centred with padding for better visual balance

## [0.5.1] - 2026-01-28

### Improved

- **Review UI polish**: Better language and visual feedback
  - Button text: "Review post" / "Review post again" (was "Run Review" / "Re-run Review")
  - Loading state: animated spinner with "Reading post..." text
  - Score display: shows "X/Y passed" with colour-coded background (green/yellow/red)
  - Wider dropdown: review panel now 280-320px wide for easier reading

## [0.5.0] - 2026-01-28

### Added

- **Content review checklist**: LLM-powered review of posts against configurable criteria
  - Accessible from the (i) info dropdown on each post
  - Shows pass/fail status for each criterion with explanatory notes
  - Results are cached per-file and can be re-run anytime
  - Supports multiple LLM providers:
    - **Ollama** (default) - local models like llama3.2, mistral
    - **OpenAI** - gpt-4o-mini, gpt-4o
    - **Google Gemini** - gemini-1.5-flash, gemini-1.5-pro
    - **Anthropic Claude** - claude-3-haiku, claude-3-sonnet
  - Configurable review criteria (one per line in settings)
  - Style guide support via file reference and/or inline text

## [0.4.15] - 2026-01-28

### Added

- **Made in 🇨🇦**: Added "Made in 🇨🇦" to the About popup

## [0.4.14] - 2026-01-27

### Improved

- **Sidebar header consistency**: Header layout now matches Space Command and Link Command
  - Uses `justify-content: space-between` layout instead of `gap: 8px`
  - Title uses h4 element wrapped with logo in a flex container
  - Buttons grouped in a button-group container
  - Shortened title from "Hugo Command" to "Hugo" for consistency

## [0.4.13] - 2026-01-27

### Improved

- **Reorganized settings sections**: Settings now organized into logical sections with h3 headers
  - Sidebar section first (Show sidebar by default, Status filter, Sort order, Show drafts)
  - Content section (Content paths, Trash folder)
  - Consistent with Space Command and Link Command settings layout

## [0.4.12] - 2026-01-27

### Improved

- **Consistent plugin naming**: Removed logo symbols from plugin name and sidebar tab title
  - Plugin name in Community plugins list: "Hugo Command" (was "H⌘ Hugo Command")
  - Sidebar tab title: "Hugo" (was "H⌘ Hugo")
  - Settings page title: "Hugo Command Settings" (was "H⌘ Hugo Command Settings")
  - Logo still appears in the styled about section header within settings

## [0.4.11] - 2026-01-27

### Fixed

- **Sidebar scrollbar no longer overlaps content**: Added right padding to content area so scrollbar sits beside content, not over it
- **Scrollbar hugs right edge**: Scrollbar now positioned flush against the right edge of the sidebar

## [0.4.10] - 2026-01-27

### Fixed

- **Sidebar scrollbar positioning**: Vertical scrollbar now hugs the right edge (0-1px gap instead of 4-6px)
- **Horizontal scrollbar prevention**: Sidebar content no longer shows horizontal scrollbars when content overflows

## [0.4.9] - 2026-01-26

### Changed

- **Sidebar scrollbar**: Semi-transparent (65% opacity) scrollbar thumb with transparent track

## [0.4.8] - 2026-01-26

### Fixed

- **Sidebar layout padding**: Reduced header padding to 2px top/bottom, 4px left/right; scrollbar now flush with right edge

## [0.4.7] - 2026-01-26

### Fixed

- **Sidebar button styling**: Removed visible borders and backgrounds from menu/new post buttons; added subtle hover effect

## [0.4.6] - 2026-01-26

### Fixed

- **Sidebar header now stays pinned** while scrolling content below

## [0.4.5] - 2026-01-25

### Fixed

- Post items now align flush with folder headers (removed legacy indentation from collapsible folders)

## [0.4.4] - 2026-01-25

### Fixed

- Folder filter chip in search bar now has readable contrast (muted background instead of green)

## [0.4.3] - 2026-01-25

### Added

- Config filename in Site Settings footer is now clickable - opens hugo.toml in editor for full access to all settings

## [0.4.2] - 2026-01-25

### Fixed

- New post button now creates files in the correct content folder (e.g., `content/posts/`) instead of vault root
- Folder dropdown shows content root name (e.g., "(content)") instead of generic "(root)"

## [0.4.1] - 2026-01-25

### Changed

- Site Settings modal layout: fixed header with scrollable content area
- Config file info moved to footer
- Modal widened to 700px for better readability
- Input fields widened to 280px
- Added Build Settings section: buildDrafts, buildFuture, buildExpired
- Added Features section: enableRobotsTXT, enableGitInfo, disableKinds
- Added Taxonomies section: category, tag
- Added Permalinks section: posts permalink pattern
- Added summaryLength and paginate to Basic Settings

## [0.4.0] - 2026-01-25

### Added

- **Site Settings editor**: Edit hugo.toml/config.toml from the sidebar menu
  - Displays Hugo Command logo and site title prominently
  - Edit basic settings: title, baseURL, languageCode
  - Edit author/copyright information
  - Edit theme setting
  - Edit custom [params] section fields
  - Supports both TOML and YAML config formats

## [0.3.2] - 2026-01-25

### Fixed

- Subfolder chips now show full path (e.g., "tutorials/advanced" instead of just "tutorials")

## [0.3.1] - 2026-01-25

### Changed

- Folder sections are no longer collapsible (always expanded)
- Subfolder name now displays as a chip next to the post title

## [0.3.0] - 2026-01-25

### Changed

- Default content path changed from "." (entire vault) to "content" (Hugo standard)

### Added

- Trash folder setting for future use (default: "_trash")

## [0.2.11] - 2026-01-25

### Fixed

- Empty folders now appear in folder dropdowns (new post, filter) immediately when created in Obsidian
- Folder create/delete/rename events now trigger UI updates

## [0.2.10] - 2026-01-25

### Fixed

- Clicking the (i) info button a second time now closes the dropdown (toggle behavior)

## [0.2.9] - 2026-01-25

### Changed

- Removed post counts from folder headers for cleaner sidebar display

## [0.2.8] - 2026-01-25

### Changed

- Post date moved from item row into info dropdown for cleaner list display
- Post info trigger changed from "#" to "(i)" icon since it now shows date, folders, and tags
- Info dropdown always visible (not just when post has tags)

## [0.2.7] - 2026-01-25

### Fixed

- New post folder dropdown now opens to the left to stay within Obsidian window bounds

## [0.2.6] - 2026-01-25

### Added

- **New Post command**: Click the + icon in the sidebar header to create a new post
- Folder selection dropdown with hierarchical display for new post location
- Title prompt modal with Enter key support
- New posts created with full Hugo frontmatter template (title, date, draft, tags, categories, description)
- Filename automatically generated from title (slugified)

## [0.2.5] - 2026-01-25

### Changed

- Folder filter dropdown now shows hierarchical folder structure with indentation
- Selecting a folder filters to that folder and all subfolders
- Folders display nested under their parent folders for better visualization

## [0.2.4] - 2026-01-25

### Added

- New "Default status filter" setting to choose initial filter (All, Published, or Drafts)

### Changed

- Default status filter is now "Drafts" instead of "All"

## [0.2.3] - 2026-01-25

### Added

- Search field in filter bar for filtering by title, tags, and description
- Active filters now display as chips inside the search field
- Clear all (×) button in search field clears filters and search text

### Changed

- Filter controls reordered: Folder → Tags → Status
- Unified button style for Folder and Tags filter dropdowns (consistent appearance)
- Filter buttons now show icon + label (e.g., folder icon with "Folder" text)

## [0.2.2] - 2026-01-25

### Changed

- Filter bar now has "Filter:" label at the start, before all filter controls
- Active filter chips no longer have redundant "Filter:" prefix (already shown at start)

## [0.2.1] - 2026-01-25

### Changed

- Active filters now display with "Filter:" prefix and clear (×) button
- Tag filter trigger changed from "#" to "#tags" for clarity
- Folder filter icon replaced with monochrome SVG folder outline
- Folder filter dropdown now includes all folders (top-level + subfolders)
- Post dates moved to rightmost position with new format (Jan-12-2025)
- Counts display replaced with info icon (ⓘ) popup showing stats

### Fixed

- Date format now uses month abbreviations (Jan, Feb, etc.) instead of numeric

## [0.2.0] - 2026-01-25

### Added

- **Folder Organization**: Posts are now grouped by top-level folder with collapsible sections
- **Folder Tags**: Subfolders are treated as a separate "folder tag" category for filtering
- **Folder Tag Filter**: New 📁 button in filter bar to filter by folder path
- Tag dropdown on items now shows both folder tags and frontmatter tags in separate sections

### Changed

- Content list now displays in collapsible folder groups instead of a flat list
- Folder groups can be expanded/collapsed by clicking the header

## [0.1.1] - 2026-01-25

### Fixed

- Content scanning now supports "." to scan entire vault
- Default content path changed from "content" to "." for broader compatibility
- Sidebar title corrected to "Hugo Command"
- Replaced refresh button with kebab menu (Refresh, About, Settings)

## [0.1.0] - 2026-01-25

### Added

- Initial release
- Sidebar view for browsing Hugo content
- Content scanning with frontmatter parsing
- Publish status display (draft/published badges)
- Tag and category filtering
- Status filtering (All/Published/Drafts)
- Configurable content paths (multiple folders)
- Settings page with content path configuration
- About modal with plugin information
- Keyboard shortcut for sidebar toggle (Cmd/Ctrl + Shift + H)
