# Shared Utilities

Warped Command's own copy of a small set of shared Obsidian-plugin utilities, carried over from before this repo was flattened to a single plugin (see `package.json`'s description). No longer synced with any sibling plugin — this copy drifts independently.

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

The `package.json` here is vestigial (kept for the description field's history note above) — this is plain TypeScript source compiled as part of the main plugin build, not a separate installable package. `main.ts` and `utils.ts` import from it directly:

```ts
import { SidebarManager, createNoticeFactory } from "./shared";
```
