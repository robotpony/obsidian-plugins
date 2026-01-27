# Changelog

All notable changes to the Hugo Command plugin will be documented in this file.

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
