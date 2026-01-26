# H⌘ Hugo Command

An Obsidian plugin for managing and browsing your Hugo content. View posts, drafts, and filter by tags from a convenient sidebar.

## Features

- **Folder Organization**: Content grouped by top-level folder with collapsible sections
- **Folder Tags**: Subfolders become filterable "folder tags" separate from frontmatter tags
- **Content Sidebar**: Browse all your Hugo content sorted by date
- **Publish Status**: See at a glance which posts are drafts vs published
- **Tag Filtering**: Filter content by tags, categories, or folder paths
- **Quick Navigation**: Click any item to open it in the editor
- **Configurable Paths**: Scan multiple content folders

## Installation

1. Copy the `hugo-command` folder to your vault's `.obsidian/plugins/` directory
2. Enable the plugin in Obsidian's Community Plugins settings
3. Configure your content paths in the plugin settings

## Usage

### Sidebar

Open the Hugo sidebar using:

- Click the file icon in the ribbon
- Use the command palette: "Toggle Hugo Sidebar"
- Keyboard shortcut: `Cmd/Ctrl + Shift + H`

### Filtering

- **Status Filter**: Use the dropdown to show All, Published only, or Drafts only
- **Tag Filter**: Click `#tags` to filter by frontmatter tags
- **Folder Filter**: Click the folder icon to filter by folder path
- **Stats**: Click the ⓘ icon to see publish/draft counts
- Active filters display with "Filter:" prefix and × to clear

### Folder Organization

Posts are automatically grouped by their top-level folder (e.g., `posts/`, `notes/`). Click a folder header to collapse or expand it.

Subfolders are treated as "folder tags". For example, a file at `posts/tech/tutorials/my-article.md` will:

- Appear in the "posts" section
- Have folder tags: "tech", "tutorials"

### Sidebar Menu

Click the kebab menu (three dots) in the sidebar header for:

- **Refresh**: Rescan content files
- **About**: Plugin information
- **Settings**: Open plugin settings

### Settings

Configure the plugin in Settings > Hugo Command:

- **Content Paths**: Folders to scan for Hugo content (one per line, default: `content`). Use `.` to scan the entire vault.
- **Show Sidebar by Default**: Open sidebar when Obsidian starts
- **Show Drafts**: Include draft posts in the content list
- **Default Sort Order**: How to sort content (date or title)
- **Trash Folder**: Folder for trashed posts (default: `_trash`)

## Hugo Frontmatter

The plugin reads standard Hugo frontmatter fields:

```yaml
---
title: "My Post Title"
date: 2024-01-15
draft: true
tags: ["tag1", "tag2"]
categories: ["category1"]
description: "A short description"
---
```

- **draft: true** marks a post as unpublished
- **draft: false** or missing means published

## License

MIT
