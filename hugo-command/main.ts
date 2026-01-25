import {
  App,
  Modal,
  Plugin,
  PluginSettingTab,
  Setting,
  WorkspaceLeaf,
} from "obsidian";
import { HugoScanner } from "./src/HugoScanner";
import {
  HugoSidebarView,
  VIEW_TYPE_HUGO_SIDEBAR,
} from "./src/SidebarView";
import {
  HugoCommandSettings,
  DEFAULT_SETTINGS,
} from "./src/types";
import { showNotice, LOGO_PREFIX } from "./src/utils";

export default class HugoCommandPlugin extends Plugin {
  settings: HugoCommandSettings;
  scanner: HugoScanner;

  async onload() {
    await this.loadSettings();

    // Initialize scanner
    this.scanner = new HugoScanner(this.app, this.settings.contentPaths);

    // Scan vault on load
    await this.scanner.scanVault();

    // Watch for file changes
    this.scanner.watchFiles();

    // Register sidebar view
    this.registerView(
      VIEW_TYPE_HUGO_SIDEBAR,
      (leaf) =>
        new HugoSidebarView(
          leaf,
          this.scanner,
          this.settings,
          () => this.showAboutModal()
        )
    );

    // Show sidebar by default if setting is enabled
    if (this.settings.showSidebarByDefault) {
      this.app.workspace.onLayoutReady(() => {
        this.activateSidebar();
      });
    }

    // Commands
    this.addCommand({
      id: "toggle-hugo-sidebar",
      name: "Toggle Hugo Sidebar",
      callback: () => {
        this.toggleSidebar();
      },
      hotkeys: [
        {
          modifiers: ["Mod", "Shift"],
          key: "h",
        },
      ],
    });

    this.addCommand({
      id: "refresh-hugo-content",
      name: "Refresh Hugo Content",
      callback: async () => {
        await this.scanner.scanVault();
        this.refreshSidebar();
        showNotice("Content refreshed");
      },
    });

    // Add ribbon icon
    this.addRibbonIcon("file-text", "Toggle Hugo Sidebar", () => {
      this.toggleSidebar();
    });

    // Add settings tab
    this.addSettingTab(new HugoCommandSettingTab(this.app, this));
  }

  onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_HUGO_SIDEBAR);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    // Update scanner with new content paths
    this.scanner.setContentPaths(this.settings.contentPaths);
    // Rescan with new paths
    await this.scanner.scanVault();
    // Update sidebar views
    this.updateSidebarSettings();
  }

  async activateSidebar() {
    const { workspace } = this.app;

    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_HUGO_SIDEBAR);

    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        leaf = rightLeaf;
        await leaf.setViewState({
          type: VIEW_TYPE_HUGO_SIDEBAR,
          active: true,
        });
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  async toggleSidebar() {
    const { workspace } = this.app;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_HUGO_SIDEBAR);

    if (leaves.length > 0) {
      leaves.forEach((leaf) => leaf.detach());
    } else {
      await this.activateSidebar();
    }
  }

  refreshSidebar() {
    const { workspace } = this.app;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_HUGO_SIDEBAR);

    for (const leaf of leaves) {
      const view = leaf.view;
      if (view instanceof HugoSidebarView) {
        view.render();
      }
    }
  }

  updateSidebarSettings() {
    const { workspace } = this.app;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_HUGO_SIDEBAR);

    for (const leaf of leaves) {
      const view = leaf.view;
      if (view instanceof HugoSidebarView) {
        view.updateSettings(this.settings);
      }
    }
  }

  showAboutModal() {
    new AboutModal(this.app, this.manifest.version).open();
  }
}

// About modal for displaying plugin information
class AboutModal extends Modal {
  private version: string;

  constructor(app: App, version: string) {
    super(app);
    this.version = version;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("hugo-command-about-modal");

    // Logo and title
    const header = contentEl.createEl("div", { cls: "about-header" });
    header.createEl("span", { cls: "hugo-command-logo about-logo", text: LOGO_PREFIX });
    header.createEl("h2", { text: "Hugo Command" });

    // Version
    contentEl.createEl("p", { cls: "about-version", text: `Version ${this.version}` });

    // Blurb
    contentEl.createEl("p", {
      cls: "about-blurb",
      text: "Manage and browse your Hugo content. View posts, drafts, and filter by tags.",
    });

    // Details
    const details = contentEl.createEl("div", { cls: "about-details" });
    details.createEl("p", { text: "Author: Bruce Alderson" });

    const repoLink = details.createEl("p");
    repoLink.appendText("Repository: ");
    repoLink.createEl("a", {
      text: "github.com/robotpony/obsidian-plugins",
      href: "https://github.com/robotpony/obsidian-plugins",
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

class HugoCommandSettingTab extends PluginSettingTab {
  plugin: HugoCommandPlugin;

  constructor(app: App, plugin: HugoCommandPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: `${LOGO_PREFIX} Hugo Command Settings` });

    // About section
    const aboutSection = containerEl.createEl("div", { cls: "hugo-command-about-section" });
    const aboutHeader = aboutSection.createEl("div", { cls: "about-header" });
    aboutHeader.createEl("span", { cls: "hugo-command-logo about-logo", text: LOGO_PREFIX });
    aboutHeader.createEl("span", { cls: "about-title", text: "Hugo Command" });

    aboutSection.createEl("p", {
      cls: "about-blurb",
      text: "Manage and browse your Hugo content. View posts, drafts, and filter by tags.",
    });

    aboutSection.createEl("p", { cls: "about-version", text: `Version ${this.plugin.manifest.version}` });

    const aboutDetails = aboutSection.createEl("div", { cls: "about-details" });
    aboutDetails.createEl("span", { text: "By Bruce Alderson" });
    aboutDetails.appendText(" \u00b7 ");
    aboutDetails.createEl("a", {
      text: "GitHub",
      href: "https://github.com/robotpony/obsidian-plugins",
    });

    // Content paths
    new Setting(containerEl)
      .setName("Content paths")
      .setDesc("Folders to scan for Hugo content (one per line, e.g., content/posts)")
      .addTextArea((text) =>
        text
          .setPlaceholder("content\ncontent/posts")
          .setValue(this.plugin.settings.contentPaths.join("\n"))
          .onChange(async (value) => {
            this.plugin.settings.contentPaths = value
              .split("\n")
              .map((p) => p.trim())
              .filter((p) => p.length > 0);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Show sidebar by default")
      .setDesc("Show the Hugo sidebar when Obsidian starts")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showSidebarByDefault)
          .onChange(async (value) => {
            this.plugin.settings.showSidebarByDefault = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Show drafts")
      .setDesc("Include draft posts in the content list")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showDrafts)
          .onChange(async (value) => {
            this.plugin.settings.showDrafts = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Default sort order")
      .setDesc("How to sort content in the sidebar")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("date-desc", "Date (newest first)")
          .addOption("date-asc", "Date (oldest first)")
          .addOption("title", "Title (A-Z)")
          .setValue(this.plugin.settings.defaultSortOrder)
          .onChange(async (value) => {
            this.plugin.settings.defaultSortOrder = value as "date-desc" | "date-asc" | "title";
            await this.plugin.saveSettings();
          })
      );
  }
}
