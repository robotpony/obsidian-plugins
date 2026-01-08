# Installation Instructions

## Quick Start

The plugin has been built and is ready to install into your Obsidian vault.

### Option 1: Install in Current Vault (Recommended)

1. Copy the plugin to your vault's plugins directory:

```bash
# Create the plugins directory if it doesn't exist
mkdir -p /Users/brucealderson/notes/.obsidian/plugins

# Copy the plugin
cp -r /Users/brucealderson/notes/_plugins/weekly-log-helpers /Users/brucealderson/notes/.obsidian/plugins/
```

2. Open Obsidian and go to **Settings** → **Community Plugins**
3. Make sure "Safe Mode" is OFF
4. Click "Reload plugins" or restart Obsidian
5. Enable "Weekly Log Helpers" in the plugin list

### Option 2: Symlink for Development

For easier development (changes will be picked up when you reload Obsidian):

```bash
# Create the plugins directory if it doesn't exist
mkdir -p /Users/brucealderson/notes/.obsidian/plugins

# Create a symlink
ln -s /Users/brucealderson/notes/_plugins/weekly-log-helpers /Users/brucealderson/notes/.obsidian/plugins/weekly-log-helpers
```

Then follow steps 2-5 from Option 1.

## Verify Installation

After enabling the plugin, you should see:
- A checkbox icon in the left ribbon
- "Weekly Log Helpers" in the right sidebar
- New commands available in the Command Palette (Cmd/Ctrl+P)

## Test the Plugin

1. Create a test note with:
```markdown
- [ ] Test TODO item #todo
```

2. Create another note with:
```markdown
{{focus-todos: todos/done.md}}
```

3. You should see the TODO appear in both the embed and the sidebar!

## Troubleshooting

If the plugin doesn't appear:
- Make sure `main.js`, `manifest.json`, and `styles.css` are in the plugin folder
- Check the console (Cmd/Ctrl+Shift+I) for error messages
- Try reloading Obsidian completely

## Development

To continue developing:

```bash
cd /Users/brucealderson/notes/_plugins/weekly-log-helpers
npm run dev  # Watch mode for development
```

Then reload Obsidian (Cmd/Ctrl+R) to see changes.
