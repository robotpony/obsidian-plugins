# H⌘ Hugo Command

An Obsidian plugin for managing and browsing your Hugo content. View posts, drafts, and filter by tags from a convenient sidebar.

## Features

- **Site Settings Editor**: Edit hugo.toml/config.toml directly from the sidebar
- **Folder Organization**: Content grouped by top-level folder
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

### Search and Filtering

**Search**: Type in the search field to filter by title and description. Active filters appear as chips inside the search field.

**Filters**:
- **Status Filter**: Use the dropdown to show All, Published only, or Drafts only
- **Tag Filter**: Click `#tags` to filter by frontmatter tags
- **Folder Filter**: Click the folder icon to filter by folder path
- **Stats**: Click the ⓘ icon to see publish/draft counts
- Active filters display with "Filter:" prefix and × to clear

### New Post

Click the + button in the sidebar header to create a new post:

1. Select a folder from the dropdown (shows your content folder hierarchy)
2. Enter a title in the prompt
3. A new file is created with Hugo frontmatter (title, date, draft: true, empty tags)

### Folder Organization

Posts are automatically grouped by their top-level folder (e.g., `posts/`, `notes/`). Click a folder header to collapse or expand it.

Subfolders are treated as "folder tags". For example, a file at `posts/tech/tutorials/my-article.md` will:

- Appear in the "posts" section
- Have folder tags: "tech", "tutorials"

### Sidebar Menu

Click the kebab menu (three dots) in the sidebar header for:

- **Site Settings**: Edit your Hugo site configuration (hugo.toml)
- **Refresh**: Rescan content files
- **About**: Plugin information
- **Settings**: Open plugin settings

### Site Settings

The Site Settings editor lets you modify your Hugo configuration file without leaving Obsidian:

- **Basic Settings**: Site title, base URL, language code
- **Author & Copyright**: Author name, copyright notice
- **Theme**: Hugo theme name
- **Site Parameters**: Any custom fields in your `[params]` section

Supports both TOML (hugo.toml, config.toml) and YAML (hugo.yaml, config.yaml) formats.

### Settings

Configure the plugin in Settings > Hugo Command:

- **Content Paths**: Folders to scan for Hugo content (one per line, default: `content`). Use `.` to scan the entire vault.
- **Show Sidebar by Default**: Open sidebar when Obsidian starts
- **Show Drafts**: Include draft posts in the content list
- **Default Sort Order**: How to sort content (date or title)
- **Trash Folder**: Folder for trashed posts (default: `_trash`)

## LLM Features

Hugo Command includes two LLM-powered features for improving your content. Both require an LLM provider configured in Settings.

### Content Review

Review posts against a configurable checklist. Click the (i) info button on any post, then "Review post".

- **Pass/fail status** for each criterion with explanatory notes
- **Results cached** per-file (re-run anytime to refresh)
- **Style guide support** via file path or inline text

### Outline Enhancement

Add questions and suggestions to document outlines. Right-click a file and choose "Enhance Outline with Suggestions", or use the sparkles button in the document header.

- **Inline HTML comments** inserted throughout the document
- **Comment bubbles** render comments as styled, clickable bubbles
  - Blue (?) for questions
  - Yellow (💡) for suggestions
  - Purple (✎) for style guide violations
- **Delete individual suggestions** via the (×) button on each bubble

### LLM Providers

Configure in Settings → Hugo Command → LLM Settings:

| Provider | Notes |
|----------|-------|
| **Ollama** (default) | Local models (llama3.2, mistral). Requires [Ollama](https://ollama.ai) running. |
| **OpenAI** | gpt-4o-mini, gpt-4o. Requires API key. |
| **Google Gemini** | gemini-1.5-flash, gemini-1.5-pro. Requires API key. |
| **Anthropic Claude** | claude-3-haiku, claude-3-sonnet. Requires API key. |

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
