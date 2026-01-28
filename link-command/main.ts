import {
  App,
  Editor,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  WorkspaceLeaf,
} from "obsidian";
import {
  LinkCommandSettings,
  DEFAULT_SETTINGS,
  UrlMetadata,
  CacheData,
} from "./src/types";
import { UrlUnfurlService } from "./src/UrlUnfurlService";
import { LinkSidebarView, VIEW_TYPE_LINK_SIDEBAR } from "./src/LinkSidebarView";
import { createFormatToggleExtension, FormatToggleConfig } from "./src/UrlFormatToggle";

export default class LinkCommandPlugin extends Plugin {
  settings: LinkCommandSettings;
  unfurlService: UrlUnfurlService;
  private cacheData: CacheData | null = null;
  private sidebarView: LinkSidebarView | null = null;

  async onload() {
    await this.loadSettings();

    // Initialize unfurl service
    this.unfurlService = new UrlUnfurlService(
      this.settings,
      async (data) => {
        this.cacheData = data;
        await this.saveData({ settings: this.settings, cache: data });
      }
    );

    // Load cache from storage (always call loadCache to initialize)
    const savedData = await this.loadData();
    await this.unfurlService.loadCache(savedData?.cache || null);

    // Register sidebar view
    this.registerView(
      VIEW_TYPE_LINK_SIDEBAR,
      (leaf) => {
        this.sidebarView = new LinkSidebarView(
          leaf,
          this.unfurlService,
          this.settings,
          (url, lineNumber) => this.navigateToUrl(url, lineNumber),
          () => this.showAbout(),
          () => this.openSettings(),
          async () => {
            await this.unfurlService.clearCache();
            new Notice("Link history cleared");
          }
        );
        return this.sidebarView;
      }
    );

    // Add ribbon icon to toggle sidebar
    this.addRibbonIcon("link", "Link Command", () => {
      this.toggleSidebar();
    });

    // Show sidebar by default if configured
    if (this.settings.showSidebarByDefault) {
      this.app.workspace.onLayoutReady(() => {
        this.activateSidebar();
      });
    }

    // Register inline format toggle extension
    this.registerFormatToggleExtension();

    // Register commands
    this.addCommand({
      id: "toggle-link-format",
      name: "Toggle link format",
      editorCallback: async (editor) => {
        const url = this.detectUrlAtCursor(editor);
        if (url) {
          await this.cycleFormatAtCursor(editor, url);
        } else {
          new Notice("No URL found at cursor");
        }
      },
    });

    this.addCommand({
      id: "clear-link-cache",
      name: "Clear link cache",
      callback: async () => {
        await this.unfurlService.clearCache();
        new Notice("Link cache cleared");
        this.sidebarView?.render();
      },
    });

    this.addCommand({
      id: "toggle-link-sidebar",
      name: "Toggle link sidebar",
      callback: () => {
        this.toggleSidebar();
      },
    });

    // Add settings tab
    this.addSettingTab(new LinkCommandSettingTab(this.app, this));
  }

  onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_LINK_SIDEBAR);
  }

  /**
   * Activate the sidebar view
   */
  async activateSidebar(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_LINK_SIDEBAR);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }

    const rightLeaf = this.app.workspace.getRightLeaf(false);
    if (rightLeaf) {
      await rightLeaf.setViewState({
        type: VIEW_TYPE_LINK_SIDEBAR,
        active: true,
      });
    }
  }

  /**
   * Toggle the sidebar view
   */
  async toggleSidebar(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_LINK_SIDEBAR);
    if (existing.length > 0) {
      existing[0].detach();
    } else {
      await this.activateSidebar();
    }
  }

  /**
   * Navigate to a URL in the active file
   */
  private navigateToUrl(url: string, lineNumber: number): void {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) return;

    const leaf = this.app.workspace.getLeaf();
    leaf.openFile(activeFile).then(() => {
      const view = leaf.view;
      if (view && "editor" in view) {
        const editor = (view as any).editor;
        if (editor) {
          editor.setCursor({ line: lineNumber, ch: 0 });
          editor.scrollIntoView({ from: { line: lineNumber, ch: 0 }, to: { line: lineNumber, ch: 0 } }, true);
        }
      }
    });
  }

  /**
   * Show the About modal
   */
  private showAbout(): void {
    const stats = this.unfurlService.getCacheStats();
    new Notice(
      `L⌘ Link Command v${this.manifest.version}\n\n` +
      `Cached links: ${stats.persistentSize}\n` +
      `Memory cache: ${stats.memorySize}`,
      5000
    );
  }

  /**
   * Open plugin settings
   */
  private openSettings(): void {
    (this.app as any).setting.open();
    (this.app as any).setting.openTabById("link-command");
  }

  async loadSettings() {
    const data = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data?.settings);
  }

  async saveSettings() {
    await this.saveData({ settings: this.settings, cache: this.cacheData });
    this.unfurlService.updateSettings(this.settings);
    this.sidebarView?.updateSettings(this.settings);
  }

  /**
   * Format metadata title for display, including subreddit if configured
   */
  private formatLinkTitle(metadata: UrlMetadata, url: string): string {
    if (!metadata.title) return url;

    // For Reddit links, optionally include subreddit
    if (metadata.subreddit && this.settings.redditLinkFormat === 'title_subreddit') {
      return `${metadata.title} (${metadata.subreddit})`;
    }

    return metadata.title;
  }

  /**
   * Register the inline format toggle extension
   */
  private registerFormatToggleExtension(): void {
    const config: FormatToggleConfig = {
      enabled: this.settings.unfurlEnabled,
      unfurlService: this.unfurlService,
      getSourcePage: () => this.app.workspace.getActiveFile()?.path,
      onFormatChange: () => {
        this.sidebarView?.render();
      },
    };

    const extension = createFormatToggleExtension(config);
    this.registerEditorExtension(extension);
  }

  /**
   * Detect if cursor is on a URL and return it
   */
  private detectUrlAtCursor(editor: Editor): string | null {
    const cursor = editor.getCursor();
    const line = editor.getLine(cursor.line);

    // Look for URLs in the line
    const urlRegex = /https?:\/\/[^\s\]\)]+/g;
    let match;

    while ((match = urlRegex.exec(line)) !== null) {
      const start = match.index;
      const end = start + match[0].length;

      // Check if cursor is within or adjacent to this URL
      if (cursor.ch >= start && cursor.ch <= end) {
        return match[0];
      }
    }

    // Check if there's a selection that's a URL
    const selection = editor.getSelection();
    if (selection && this.unfurlService.isValidUrl(selection.trim())) {
      return selection.trim();
    }

    return null;
  }

  /**
   * Cycle through formats at cursor (URL -> Link -> Rich -> URL)
   */
  private async cycleFormatAtCursor(editor: Editor, url: string): Promise<void> {
    const cursor = editor.getCursor();
    const line = editor.getLine(cursor.line);
    const urlEscaped = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Detect current format
    const richPattern = new RegExp(`\\[[^\\]]*\\*\\*[^*]+\\*\\*[^\\]]*\\]\\(${urlEscaped}\\)`);
    const linkPattern = new RegExp(`\\[([^\\]]*)\\]\\(${urlEscaped}\\)`);

    const isRichLink = richPattern.test(line);
    const isMarkdownLink = linkPattern.test(line);

    const activeFile = this.app.workspace.getActiveFile();
    const result = await this.unfurlService.unfurl(url, false, activeFile?.path);

    let replacement: string;
    let from: { line: number; ch: number };
    let to: { line: number; ch: number };

    if (isRichLink) {
      // Rich -> URL: Extract URL and replace
      const match = linkPattern.exec(line);
      if (match) {
        from = { line: cursor.line, ch: match.index };
        to = { line: cursor.line, ch: match.index + match[0].length };
        replacement = url;
      } else {
        return;
      }
    } else if (isMarkdownLink) {
      // Link -> Rich: Add domain/subreddit in bold
      const match = linkPattern.exec(line);
      if (match) {
        from = { line: cursor.line, ch: match.index };
        to = { line: cursor.line, ch: match.index + match[0].length };

        const title = result.success && result.metadata?.title || url;
        let extra = "";

        if (result.success && result.metadata?.subreddit) {
          extra = result.metadata.subreddit;
        } else {
          try {
            extra = new URL(url).hostname.replace(/^www\./, "");
          } catch {
            // Skip
          }
        }

        replacement = extra ? `[${title} · **${extra}**](${url})` : `[${title}](${url})`;
      } else {
        return;
      }
    } else {
      // URL -> Link: Create basic markdown link
      const urlIndex = line.indexOf(url);
      if (urlIndex >= 0) {
        from = { line: cursor.line, ch: urlIndex };
        to = { line: cursor.line, ch: urlIndex + url.length };

        const title = result.success && result.metadata?.title
          ? this.formatLinkTitle(result.metadata, url)
          : url;

        replacement = `[${title}](${url})`;
      } else {
        return;
      }
    }

    editor.replaceRange(replacement, from, to);
    this.sidebarView?.render();
  }
}

/**
 * Settings tab
 */
class LinkCommandSettingTab extends PluginSettingTab {
  plugin: LinkCommandPlugin;

  constructor(app: App, plugin: LinkCommandPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Link Command Settings" });

    // About section
    const aboutSection = containerEl.createEl("div", { cls: "link-command-about-section" });
    const aboutHeader = aboutSection.createEl("div", { cls: "about-header" });
    aboutHeader.createEl("span", { cls: "link-command-logo about-logo", text: "L⌘" });
    aboutHeader.createEl("span", { cls: "about-title", text: "Link Command" });

    aboutSection.createEl("p", {
      cls: "about-blurb",
      text: "URL unfurling for Obsidian. Fetch link titles and descriptions, insert as markdown links or rich previews.",
    });

    aboutSection.createEl("p", { cls: "about-version", text: `Version ${this.plugin.manifest.version}` });

    const aboutDetails = aboutSection.createEl("div", { cls: "about-details" });
    aboutDetails.createEl("span", { text: "By Bruce Alderson" });
    aboutDetails.appendText(" · ");
    aboutDetails.createEl("a", {
      text: "GitHub",
      href: "https://github.com/robotpony/obsidian-plugins",
    });

    // Sidebar section (first)
    containerEl.createEl("h3", { text: "Sidebar" });

    new Setting(containerEl)
      .setName("Show sidebar by default")
      .setDesc("Open the link sidebar when Obsidian starts")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showSidebarByDefault)
          .onChange(async (value) => {
            this.plugin.settings.showSidebarByDefault = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Recent history limit")
      .setDesc("Number of items to show in the Recent History section")
      .addText((text) =>
        text
          .setPlaceholder("25")
          .setValue(String(this.plugin.settings.recentHistoryLimit))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num > 0 && num <= 100) {
              this.plugin.settings.recentHistoryLimit = num;
              await this.plugin.saveSettings();
            }
          })
      );

    // Unfurling section
    containerEl.createEl("h3", { text: "Unfurling" });

    new Setting(containerEl)
      .setName("Enable inline format toggle")
      .setDesc("Show toggle buttons next to URLs to cycle between formats (URL, Link, Rich Link)")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.unfurlEnabled)
          .onChange(async (value) => {
            this.plugin.settings.unfurlEnabled = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Request timeout")
      .setDesc("Timeout for fetching URL metadata (milliseconds)")
      .addText((text) =>
        text
          .setPlaceholder("10000")
          .setValue(String(this.plugin.settings.unfurlTimeout))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num > 0) {
              this.plugin.settings.unfurlTimeout = num;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("Reddit link format")
      .setDesc("How to format Reddit links when unfurling")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("title", "Title only")
          .addOption("title_subreddit", "Title + subreddit")
          .setValue(this.plugin.settings.redditLinkFormat)
          .onChange(async (value: "title" | "title_subreddit") => {
            this.plugin.settings.redditLinkFormat = value;
            await this.plugin.saveSettings();
          })
      );

    // Cache section
    containerEl.createEl("h3", { text: "Cache" });

    new Setting(containerEl)
      .setName("Enable cache")
      .setDesc("Cache fetched metadata for faster access and offline use")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.cacheEnabled)
          .onChange(async (value) => {
            this.plugin.settings.cacheEnabled = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Cache TTL")
      .setDesc("How long to keep cached metadata (hours)")
      .addText((text) =>
        text
          .setPlaceholder("168")
          .setValue(String(this.plugin.settings.cacheTTL))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num > 0) {
              this.plugin.settings.cacheTTL = num;
              await this.plugin.saveSettings();
            }
          })
      );

    const stats = this.plugin.unfurlService.getCacheStats();
    new Setting(containerEl)
      .setName("Cache statistics")
      .setDesc(`Memory: ${stats.memorySize} entries | Persistent: ${stats.persistentSize} entries`)
      .addButton((btn) =>
        btn
          .setButtonText("Clear cache")
          .onClick(async () => {
            await this.plugin.unfurlService.clearCache();
            new Notice("Link cache cleared");
            this.display(); // Refresh to update stats
          })
      );

    // Authenticated Domains section
    containerEl.createEl("h3", { text: "Authenticated Domains" });
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "Domains that require authentication are skipped during unfurling. One domain per line.",
    });

    new Setting(containerEl)
      .setName("Auth domains")
      .setDesc("Domains that require login (skipped during unfurling)")
      .addTextArea((text) =>
        text
          .setPlaceholder("slack.com\nnotion.so")
          .setValue(this.plugin.settings.authDomains.join("\n"))
          .onChange(async (value) => {
            this.plugin.settings.authDomains = value
              .split("\n")
              .map((d) => d.trim())
              .filter((d) => d.length > 0);
            await this.plugin.saveSettings();
          })
      );
  }
}
