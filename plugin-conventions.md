# Plugin Conventions

Conventions and UI patterns used across all plugins in this repo. Reference this when building new plugins or extending existing ones.

## Branding

Each plugin has a unique logo badge: coloured background, white text, `border-radius: 4px`.

| Plugin | Logo text | Colour |
|--------|-----------|--------|
| space-command | `␣⌘` | `#689fd6` (blue) |
| hugo-command | `H⌘` | `#d97706` (orange) |
| link-command | `L⌘` | `#5da65d` (green) |
| notate-command | `N⌘` | `#8b5cf6` (purple) |

New plugins MUST pick a unique colour not already in use above.

Logo CSS:

```css
.{plugin-id}-logo {
  display: inline-block;
  color: white;
  background-color: {brand-colour};
  border-radius: 4px;
  padding: 3px 3px 2px;
  font-weight: 600;
  font-size: 0.9em;
  line-height: 1.2;
  vertical-align: middle;
}

.{plugin-id}-logo.clickable-logo {
  cursor: pointer;
  transition: opacity 0.2s, transform 0.1s;
}
.{plugin-id}-logo.clickable-logo:hover {
  opacity: 0.85;
  transform: scale(1.05);
}
```

Notices use the shared factory so the logo appears inline:

```ts
const showNotice = createNoticeFactory(LOGO_TEXT, "{plugin-id}-logo");
showNotice("Done.");
showNotice("Error message", 5000);
```

---

## Sidebar

### ItemView structure

```ts
export const VIEW_TYPE = "{plugin-id}-sidebar";

export class PluginSidebarView extends ItemView {
  constructor(leaf: WorkspaceLeaf, /* dependencies */) {
    super(leaf);
  }

  getViewType()    { return VIEW_TYPE; }
  getDisplayText() { return "Plugin Name"; }
  getIcon()        { return "lucide-icon-name"; }

  async onOpen() {
    // Register event listeners
    this.scanner.on("data-updated", () => this.render());
    // Initial load
    this.render();
  }

  async onClose() {
    // Unregister listeners, close any open dropdowns
    this.scanner.off("data-updated", ...);
    this.closeDropdown();
  }

  render() {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("{plugin-id}-sidebar");
    this.renderHeader(container);
    this.renderContent(container);
  }
}
```

`render()` always rebuilds the entire UI from scratch — no partial patching.

### Lifecycle via SidebarManager

```ts
// main.ts onload()
this.sidebarManager = new SidebarManager(this.app, VIEW_TYPE);
this.registerView(VIEW_TYPE, (leaf) => new PluginSidebarView(leaf, ...));

if (this.settings.showSidebarByDefault) {
  this.app.workspace.onLayoutReady(() => this.sidebarManager.activate());
}

this.addCommand({
  id: "toggle-sidebar",
  name: "Toggle Sidebar",
  hotkeys: [{ modifiers: ["Mod", "Shift"], key: "{letter}" }],
  callback: () => this.sidebarManager.toggle(),
});

// After settings change:
this.sidebarManager.refresh();  // calls render() on all open views
```

### DOM layout

```
.{plugin-id}-sidebar          flex column, height 100%, overflow hidden
  .{plugin-id}-header         flex row, space-between, background-secondary, flex-shrink 0
    .{plugin-id}-header-title   logo (clickable → about modal) + h4
    .{plugin-id}-button-group   icon buttons right-aligned
  .{plugin-id}-content        flex 1, overflow-y auto, padding 0 8px 0 4px
```

CSS:

```css
.{plugin-id}-sidebar {
  padding: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.{plugin-id}-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 4px;
  background-color: var(--background-secondary);
  flex-shrink: 0;
  z-index: 1;
}

.{plugin-id}-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0 8px 0 4px;
}

/* Custom scrollbar — same across all plugins */
.{plugin-id}-sidebar ::-webkit-scrollbar { width: 8px; }
.{plugin-id}-sidebar ::-webkit-scrollbar-thumb {
  background-color: color-mix(in srgb, var(--text-muted) 65%, transparent);
  border-radius: 4px;
}
```

### Header with kebab menu

```ts
private renderHeader(container: HTMLElement): void {
  const header = container.createEl("div", { cls: "{plugin-id}-header" });

  const titleEl = header.createEl("div", { cls: "{plugin-id}-header-title" });
  const logo = titleEl.createEl("span", {
    cls: "{plugin-id}-logo clickable-logo",
    text: LOGO_TEXT,
  });
  logo.addEventListener("click", () => new AboutModal(this.app).open());
  titleEl.createEl("h4", { text: "Plugin Name" });

  const btnGroup = header.createEl("div", { cls: "{plugin-id}-button-group" });

  const menuBtn = btnGroup.createEl("button", {
    cls: "clickable-icon {plugin-id}-menu-btn",
    attr: { "aria-label": "Menu" },
  });
  setIcon(menuBtn, "more-vertical");
  menuBtn.addEventListener("click", () => {
    const menu = new Menu();
    menu.addItem((item) => item.setTitle("Refresh").setIcon("refresh-cw").onClick(() => this.render()));
    menu.addSeparator();
    menu.addItem((item) => item.setTitle("About").setIcon("info").onClick(() => new AboutModal(this.app).open()));
    menu.showAtMouseEvent(event);
  });
}
```

---

## CSS Class Naming

All classes are prefixed `{plugin-id}-`. No global unprefixed styles.

```css
/* Structure */
.{plugin-id}-sidebar
.{plugin-id}-header
.{plugin-id}-header-title
.{plugin-id}-button-group
.{plugin-id}-content

/* List items */
.{plugin-id}-item
.{plugin-id}-item-title
.{plugin-id}-item-meta
.{plugin-id}-item-date

/* Buttons */
.{plugin-id}-menu-btn
.{plugin-id}-refresh-btn
.{plugin-id}-action-btn

/* States */
.{plugin-id}-empty
.{plugin-id}-loading

/* Modals */
.{plugin-id}-about-modal
.{plugin-id}-about-section
```

---

## Buttons

All icon buttons use this pattern — transparent background, opacity hover:

```css
.{plugin-id}-btn {
  padding: 4px;
  border: none !important;
  background: transparent !important;
  box-shadow: none !important;
  cursor: pointer;
  opacity: 0.6;
  border-radius: 4px;
  flex-shrink: 0;
  transition: opacity 0.2s, background-color 0.15s;
}

.{plugin-id}-btn:hover {
  opacity: 1;
  background-color: var(--background-modifier-hover) !important;
}

.{plugin-id}-btn.loading {
  opacity: 0.4;
  cursor: wait;
  animation: {plugin-id}-pulse 1.5s ease-in-out infinite;
}

.{plugin-id}-btn.rotating {
  animation: {plugin-id}-rotate 0.5s ease-in-out;
}

@keyframes {plugin-id}-pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.7; }
}

@keyframes {plugin-id}-rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
```

---

## List Items

```ts
const item = container.createEl("div", { cls: "{plugin-id}-item" });

// Optional status dot
const dot = item.createEl("div", { cls: "{plugin-id}-status-dot status-cached" });

const content = item.createEl("div", { cls: "{plugin-id}-item-content" });
const title = content.createEl("div", { cls: "{plugin-id}-item-title", text: item.title });
title.addEventListener("click", () => { /* navigate */ });

const meta = content.createEl("div", { cls: "{plugin-id}-item-meta" });
meta.createEl("span", { cls: "{plugin-id}-item-date", text: formatDate(item.date) });
```

Status dots:

```css
.{plugin-id}-status-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.status-cached  { background: var(--color-green); }
.status-pending { background: var(--background-modifier-border); }
.status-error   { background: var(--text-error); }
```

Empty state:

```ts
const empty = container.createEl("div", { cls: "{plugin-id}-empty" });
empty.createEl("p", { text: "No items." });
```

---

## Settings Tab

Inline `PluginSettingTab` in `main.ts`. Structure:

1. About section (logo + name + version + author link) — rendered first
2. `h3` headings for groups (Sidebar, Advanced, etc.)
3. `new Setting(containerEl)` per field

```ts
class PluginSettingTab extends PluginSettingTab {
  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Plugin Name" });

    this.renderAbout(containerEl);

    containerEl.createEl("h3", { text: "Sidebar" });
    new Setting(containerEl)
      .setName("Show sidebar by default")
      .setDesc("Open when Obsidian starts")
      .addToggle((t) => t
        .setValue(this.plugin.settings.showSidebarByDefault)
        .onChange(async (v) => {
          this.plugin.settings.showSidebarByDefault = v;
          await this.plugin.saveSettings();
        })
      );
  }

  private renderAbout(containerEl: HTMLElement): void {
    const section = containerEl.createEl("div", { cls: "{plugin-id}-about-section" });
    const header = section.createEl("div", { cls: "about-header" });
    header.createEl("span", { cls: "{plugin-id}-logo about-logo", text: LOGO_TEXT });
    header.createEl("span", { cls: "about-title", text: "Plugin Name" });
    section.createEl("p", { cls: "about-version", text: `Version ${this.plugin.manifest.version}` });
    const details = section.createEl("div", { cls: "about-details" });
    details.createEl("a", { text: "GitHub", href: "https://github.com/..." });
  }
}
```

---

## TypeScript Conventions

### types.ts

```ts
// Interfaces first
export interface Item { id: string; name: string; }
export interface PluginSettings { showSidebarByDefault: boolean; }

// Defaults after interfaces
export const DEFAULT_SETTINGS: PluginSettings = {
  showSidebarByDefault: true,
};
```

### Error handling

Use the shared `Result` type instead of throwing:

```ts
import { Result, ok, err, isOk } from "../shared";

async function load(): Promise<Result<Data, "not_found" | "parse_error">> {
  try {
    return ok(await fetch());
  } catch {
    return err("not_found", "File missing");
  }
}

const result = await load();
if (isOk(result)) { use(result.data); }
else { showNotice(result.errorMessage); }
```

### Event-driven services

Services that produce data extend `Events`:

```ts
import { Events } from "obsidian";

export class DataScanner extends Events {
  async scan(): Promise<void> {
    // load data
    this.trigger("data-updated");
  }
}

// In SidebarView.onOpen():
this.scanner.on("data-updated", () => this.render());
```

### Dropdowns (custom, not native `<select>`)

```ts
private openDropdown: HTMLElement | null = null;

private showDropdown(trigger: HTMLElement, items: { label: string; action: () => void }[]): void {
  this.closeDropdown();
  const dropdown = document.createElement("div");
  dropdown.addClass("{plugin-id}-dropdown");

  for (const { label, action } of items) {
    const item = dropdown.createEl("div", { cls: "{plugin-id}-dropdown-item", text: label });
    item.addEventListener("click", () => { action(); this.closeDropdown(); });
  }

  const rect = trigger.getBoundingClientRect();
  dropdown.style.cssText = `position:absolute;top:${rect.bottom + 4}px;left:${rect.left}px;`;
  document.body.appendChild(dropdown);
  this.openDropdown = dropdown;
}

private closeDropdown(): void {
  this.openDropdown?.remove();
  this.openDropdown = null;
}
```

Call `this.closeDropdown()` in `onClose()`.

---

## Shared Module

```ts
import { SidebarManager, createNoticeFactory, ok, err, isOk, LLMClient } from "../shared";
```

| Export | Purpose |
|--------|---------|
| `SidebarManager` | activate / toggle / refresh sidebar |
| `createNoticeFactory` | branded notices with plugin logo |
| `ok`, `err`, `isOk`, `isErr` | Result type helpers |
| `LLMClient` | Multi-provider LLM (Ollama, OpenAI, Gemini, Anthropic) |

---

## Commands

```ts
// Primary toggle — every plugin has this
this.addCommand({
  id: "toggle-sidebar",
  name: "Toggle Sidebar",
  hotkeys: [{ modifiers: ["Mod", "Shift"], key: "{letter}" }],
  callback: () => this.sidebarManager.toggle(),
});

// Ribbon icon (optional)
this.addRibbonIcon("{icon-name}", "Open Plugin Name", () => this.sidebarManager.toggle());
```

Existing hotkey letters: `Space` (space-command), `H` (hugo-command), `L` (link-command), `N` (notate-command).

---

## File Layout

```
{plugin-id}/
├── main.ts              # Plugin class + SettingTab (inline in same file)
├── manifest.json        # id, version, name, minAppVersion
├── package.json
├── tsconfig.json
├── esbuild.config.mjs
├── styles.css
├── CLAUDE.md            # Plugin-specific architecture notes
└── src/
    ├── types.ts         # Interfaces + DEFAULT_SETTINGS
    ├── SidebarView.ts   # ItemView subclass
    └── {Feature}.ts     # Feature modules
```

### manifest.json

```json
{
  "id": "plugin-id-kebab-case",
  "name": "Plugin Display Name",
  "version": "1.0.0",
  "minAppVersion": "0.15.0",
  "description": "One-line description.",
  "author": "Bruce Alderson",
  "authorUrl": "https://github.com/bruceal",
  "isDesktopOnly": false
}
```

### Release checklist

Update version in: `manifest.json`, `package.json`, `CHANGELOG.md`.
