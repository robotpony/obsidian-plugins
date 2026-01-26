# Changelog

All notable changes to the Hugo Command plugin will be documented in this file.

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
