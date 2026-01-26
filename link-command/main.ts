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
import { UrlUnfurlTooltip } from "./src/UrlUnfurlTooltip";
import { LinkCardProcessor } from "./src/LinkCardProcessor";
import { LinkSidebarView, VIEW_TYPE_LINK_SIDEBAR } from "./src/LinkSidebarView";

export default class LinkCommandPlugin extends Plugin {
  settings: LinkCommandSettings;
  unfurlService: UrlUnfurlService;
  tooltip: UrlUnfurlTooltip;
  linkCardProcessor: LinkCardProcessor;
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

    // Load cache from storage
    const savedData = await this.loadData();
    if (savedData?.cache) {
      await this.unfurlService.loadCache(savedData.cache);
    }

    // Initialize tooltip
    this.tooltip = new UrlUnfurlTooltip(this.app);

    // Initialize code block processor
    this.linkCardProcessor = new LinkCardProcessor(this.app, this.unfurlService);

    // Register link-card code block processor
    this.registerMarkdownCodeBlockProcessor("link-card", async (source, el, ctx) => {
      await this.linkCardProcessor.process(source, el, ctx);
    });

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
          () => this.openSettings()
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

    // Register context menu for URLs
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor) => {
        if (!this.settings.unfurlEnabled) return;

        const url = this.detectUrlAtCursor(editor);
        if (url) {
          menu.addItem((item) => {
            item
              .setTitle("Unfurl link...")
              .setIcon("link")
              .onClick(() => {
                this.unfurlUrl(editor, url);
              });
          });
        }
      })
    );

    // Register paste handler (if enabled)
    this.registerEvent(
      this.app.workspace.on("editor-paste", async (evt, editor) => {
        if (!this.settings.unfurlEnabled || !this.settings.unfurlOnPaste) return;

        const clipboardText = evt.clipboardData?.getData("text/plain")?.trim();
        if (clipboardText && this.unfurlService.isValidUrl(clipboardText)) {
          evt.preventDefault();
          await this.handlePasteUrl(editor, clipboardText);
        }
      })
    );

    // Register commands
    this.addCommand({
      id: "unfurl-url",
      name: "Unfurl URL at cursor",
      editorCallback: (editor) => {
        const url = this.detectUrlAtCursor(editor);
        if (url) {
          this.unfurlUrl(editor, url);
        } else {
          new Notice("No URL found at cursor");
        }
      },
    });

    this.addCommand({
      id: "insert-link-card",
      name: "Insert link card",
      editorCallback: async (editor) => {
        const url = this.detectUrlAtCursor(editor);
        if (url) {
          await this.insertLinkCard(editor, url);
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
    this.tooltip.close();
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
   * Unfurl URL and show tooltip
   */
  private async unfurlUrl(editor: Editor, url: string): Promise<void> {
    const actions = {
      onInsertLink: (metadata: UrlMetadata) => {
        this.insertMarkdownLink(editor, url, metadata);
      },
      onInsertCard: (metadata: UrlMetadata) => {
        this.insertCardBlock(editor, url, metadata);
      },
      onCopy: async (metadata: UrlMetadata) => {
        const text = `[${metadata.title || url}](${url})`;
        await navigator.clipboard.writeText(text);
        new Notice("Link copied to clipboard");
      },
      onRetry: () => {
        this.unfurlUrl(editor, url);
      },
    };

    // Show loading state
    this.tooltip.showLoading(editor, url, actions);

    // Fetch metadata (track source page)
    const activeFile = this.app.workspace.getActiveFile();
    const result = await this.unfurlService.unfurl(url, false, activeFile?.path);

    // Update tooltip with result
    this.tooltip.updateContent(result);

    // Refresh sidebar to show updated status
    this.sidebarView?.render();
  }

  /**
   * Handle paste of URL
   */
  private async handlePasteUrl(editor: Editor, url: string): Promise<void> {
    // First insert the URL so user sees something
    editor.replaceSelection(url);

    // Then try to unfurl and update (track source page)
    const activeFile = this.app.workspace.getActiveFile();
    const result = await this.unfurlService.unfurl(url, false, activeFile?.path);

    if (result.success && result.metadata?.title) {
      // Replace the plain URL with markdown link
      const cursor = editor.getCursor();
      const line = editor.getLine(cursor.line);
      const urlIndex = line.lastIndexOf(url);

      if (urlIndex >= 0) {
        const from = { line: cursor.line, ch: urlIndex };
        const to = { line: cursor.line, ch: urlIndex + url.length };
        const markdownLink = `[${result.metadata.title}](${url})`;
        editor.replaceRange(markdownLink, from, to);
      }
    }
  }

  /**
   * Insert markdown link at cursor
   */
  private insertMarkdownLink(editor: Editor, url: string, metadata: UrlMetadata): void {
    const title = metadata.title || url;
    const markdownLink = `[${title}](${url})`;

    // Try to replace the URL if it's selected or at cursor
    const selection = editor.getSelection();
    if (selection === url) {
      editor.replaceSelection(markdownLink);
    } else {
      // Check if URL is in the current line near cursor
      const cursor = editor.getCursor();
      const line = editor.getLine(cursor.line);
      const urlIndex = line.indexOf(url);

      if (urlIndex >= 0) {
        const from = { line: cursor.line, ch: urlIndex };
        const to = { line: cursor.line, ch: urlIndex + url.length };
        editor.replaceRange(markdownLink, from, to);
      } else {
        // Just insert at cursor
        editor.replaceSelection(markdownLink);
      }
    }
  }

  /**
   * Insert link card code block
   */
  private insertCardBlock(editor: Editor, url: string, metadata: UrlMetadata): void {
    const lines = ["```link-card", `url: ${url}`];

    if (metadata.title) {
      lines.push(`title: ${metadata.title}`);
    }
    if (metadata.description) {
      // Escape any newlines in description
      const desc = metadata.description.replace(/\n/g, " ").slice(0, 200);
      lines.push(`description: ${desc}`);
    }
    if (metadata.image) {
      lines.push(`image: ${metadata.image}`);
    }

    lines.push("```");

    const cardBlock = lines.join("\n");

    // Try to replace the URL if it's selected
    const selection = editor.getSelection();
    if (selection === url) {
      editor.replaceSelection(cardBlock);
    } else {
      // Check if URL is on current line
      const cursor = editor.getCursor();
      const line = editor.getLine(cursor.line);
      const urlIndex = line.indexOf(url);

      if (urlIndex >= 0 && line.trim() === url) {
        // URL is alone on the line, replace the whole line
        const from = { line: cursor.line, ch: 0 };
        const to = { line: cursor.line, ch: line.length };
        editor.replaceRange(cardBlock, from, to);
      } else {
        // Insert at cursor
        editor.replaceSelection(cardBlock);
      }
    }
  }

  /**
   * Insert link card for URL at cursor
   */
  private async insertLinkCard(editor: Editor, url: string): Promise<void> {
    const result = await this.unfurlService.unfurl(url);

    if (result.success && result.metadata) {
      this.insertCardBlock(editor, url, result.metadata);
    } else {
      // Insert basic card without metadata
      const basicCard = `\`\`\`link-card\nurl: ${url}\n\`\`\``;
      editor.replaceSelection(basicCard);
    }
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

    // Master toggle
    new Setting(containerEl)
      .setName("Enable URL unfurling")
      .setDesc("Show link previews via context menu and commands")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.unfurlEnabled)
          .onChange(async (value) => {
            this.plugin.settings.unfurlEnabled = value;
            await this.plugin.saveSettings();
          })
      );

    // Auto-unfurl on paste
    new Setting(containerEl)
      .setName("Auto-unfurl on paste")
      .setDesc("Automatically convert pasted URLs to titled links")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.unfurlOnPaste)
          .onChange(async (value) => {
            this.plugin.settings.unfurlOnPaste = value;
            await this.plugin.saveSettings();
          })
      );

    // Default format
    new Setting(containerEl)
      .setName("Default format")
      .setDesc("Default format when auto-unfurling pasted URLs")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("link", "Markdown link")
          .addOption("card", "Link card")
          .setValue(this.plugin.settings.defaultFormat)
          .onChange(async (value: "link" | "card") => {
            this.plugin.settings.defaultFormat = value;
            await this.plugin.saveSettings();
          })
      );

    // Timeout
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

    // Cache stats and clear button
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

    // Sidebar section
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

    // Auth domains section
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
