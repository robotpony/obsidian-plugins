# Changelog

All notable changes to the Hugo Command plugin will be documented in this file.

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
