# Shared Utilities

Shared utilities for the Obsidian plugins monorepo. These modules provide common patterns used across all three plugins.

## Modules

### Notice (`ui/Notice.ts`)

Styled notice display with plugin branding.

```ts
import { createNoticeFactory } from "../shared";

// Create a factory for your plugin
const showNotice = createNoticeFactory("␣⌘", "space-command-logo");

// Use it throughout your plugin
showNotice("Task completed");
showNotice("Error occurred", 5000); // with timeout
```

### SidebarManager (`plugin/SidebarManager.ts`)

Manages sidebar lifecycle: activate, toggle, and refresh.

```ts
import { SidebarManager } from "../shared";

// In your plugin class
private sidebarManager: SidebarManager;

async onload() {
  this.sidebarManager = new SidebarManager(this.app, VIEW_TYPE_SIDEBAR);

  // Auto-show on startup
  if (this.settings.showSidebarByDefault) {
    this.app.workspace.onLayoutReady(() => this.sidebarManager.activate());
  }

  // Command to toggle
  this.addCommand({
    id: "toggle-sidebar",
    name: "Toggle Sidebar",
    callback: () => this.sidebarManager.toggle(),
  });
}

// Refresh views after data changes
this.sidebarManager.refresh();

// Update settings on all views
this.sidebarManager.forEach<MySidebarView>((view) => {
  view.updateSettings(this.settings);
});
```

## Development

The shared module has its own `package.json` to provide TypeScript types for `obsidian`. When building a plugin, TypeScript resolves types from the shared module's `node_modules`.

```bash
cd shared
npm install  # Only needed once for type checking
```

Plugins import from the shared module using relative paths:

```ts
import { SidebarManager, createNoticeFactory } from "../shared";
```
