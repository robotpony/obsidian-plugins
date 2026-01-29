import {
  App,
  Modal,
  Plugin,
  PluginSettingTab,
  Setting,
  WorkspaceLeaf,
  TFile,
  MarkdownView,
  Notice,
  editorViewField,
} from "obsidian";
import { HugoScanner } from "./src/HugoScanner";
import {
  HugoSidebarView,
  VIEW_TYPE_HUGO_SIDEBAR,
} from "./src/SidebarView";
import {
  HugoCommandSettings,
  DEFAULT_SETTINGS,
  DEFAULT_REVIEW_SETTINGS,
  DEFAULT_OUTLINE_SETTINGS,
  ReviewResult,
  StatusFilter,
} from "./src/types";
import { showNotice, LOGO_PREFIX } from "./src/utils";
import { SiteSettingsModal } from "./src/SiteSettingsModal";
import { ReviewCache } from "./src/ReviewCache";
import { ReviewLLMClient } from "./src/ReviewLLMClient";
import { OutlineLLMClient } from "./src/OutlineLLMClient";
import { commentBubblesPlugin } from "./src/CommentBubbles";

export default class HugoCommandPlugin extends Plugin {
  settings: HugoCommandSettings;
  scanner: HugoScanner;
  reviewCache: ReviewCache;
  reviewClient: ReviewLLMClient;
  outlineClient: OutlineLLMClient;
  private reviewCacheData: Record<string, ReviewResult> = {};
  private isEnhancingOutline: boolean = false;

  async onload() {
    await this.loadSettings();

    // Initialize scanner
    this.scanner = new HugoScanner(this.app, this.settings.contentPaths);

    // Initialize review components
    this.reviewCache = new ReviewCache((data) => {
      this.reviewCacheData = data;
      this.saveData({ ...this.settings, _reviewCache: data });
    });
    // Load cached review data
    this.reviewCache.load(this.reviewCacheData);
    this.reviewClient = new ReviewLLMClient(this.settings.review);
    this.outlineClient = new OutlineLLMClient(this.settings.review, this.settings.outline);

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
          this.reviewCache,
          this.reviewClient,
          () => this.getStyleGuide(),
          () => this.showAboutModal(),
          () => this.openSettings(),
          () => this.showSiteSettings()
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

    // Register CodeMirror extension for comment bubbles (if outline enabled)
    if (this.settings.outline.enabled) {
      this.registerEditorExtension(commentBubblesPlugin);
    }

    // Add enhance outline command
    this.addCommand({
      id: "enhance-outline",
      name: "Enhance Outline with Suggestions",
      editorCallback: async (editor, view) => {
        if (!this.settings.outline.enabled) {
          new Notice("Outline enhancement is not enabled in settings");
          return;
        }
        await this.enhanceCurrentOutline();
      },
    });

    // Register file-menu item for sparkles button
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (!this.settings.outline.enabled) return;
        if (!(file instanceof TFile) || file.extension !== "md") return;

        menu.addItem((item) => {
          item
            .setTitle("Enhance outline")
            .setIcon("sparkles")
            .onClick(async () => {
              // Open the file first if not already open
              const leaf = this.app.workspace.getLeaf();
              await leaf.openFile(file);
              await this.enhanceCurrentOutline();
            });
        });
      })
    );

    // Add settings tab
    this.addSettingTab(new HugoCommandSettingTab(this.app, this));
  }

  /**
   * Enhance the current document outline using LLM
   */
  private async enhanceCurrentOutline(): Promise<void> {
    if (this.isEnhancingOutline) {
      return;
    }

    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice("No file is currently open");
      return;
    }

    if (activeFile.extension !== "md") {
      new Notice("Outline enhancement only works on markdown files");
      return;
    }

    this.isEnhancingOutline = true;
    new Notice("Enhancing outline...");

    try {
      const content = await this.app.vault.read(activeFile);
      const styleGuide = await this.getStyleGuide();
      const enhanced = await this.outlineClient.enhance(content, styleGuide);
      await this.app.vault.modify(activeFile, enhanced);
      new Notice("Outline enhanced with suggestions");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Enhancement failed";
      new Notice(`Error: ${msg}`);
      console.error("[Hugo Outline] Enhancement failed:", error);
    } finally {
      this.isEnhancingOutline = false;
    }
  }

  onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_HUGO_SIDEBAR);
  }

  async loadSettings() {
    const data = await this.loadData();
    // Separate review cache from settings
    const { _reviewCache, ...settingsData } = data || {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, settingsData);
    // Ensure review settings exist
    if (!this.settings.review) {
      this.settings.review = DEFAULT_REVIEW_SETTINGS;
    }
    // Ensure outline settings exist
    if (!this.settings.outline) {
      this.settings.outline = DEFAULT_OUTLINE_SETTINGS;
    }
    // Load review cache after reviewCache is initialized
    this.reviewCacheData = _reviewCache || {};
  }

  async saveSettings() {
    await this.saveData({ ...this.settings, _reviewCache: this.reviewCacheData });
    // Update scanner with new content paths
    this.scanner.setContentPaths(this.settings.contentPaths);
    // Update LLM clients with new settings
    this.reviewClient.updateSettings(this.settings.review);
    this.outlineClient.updateSettings(this.settings.review, this.settings.outline);
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

  openSettings() {
    (this.app as any).setting.open();
    (this.app as any).setting.openTabById("hugo-command");
  }

  showSiteSettings() {
    new SiteSettingsModal(this.app).open();
  }

  /**
   * Get the combined style guide content from file and inline settings.
   */
  async getStyleGuide(): Promise<string> {
    const parts: string[] = [];

    // Load from file if specified
    if (this.settings.review.styleGuideFile) {
      const file = this.app.vault.getAbstractFileByPath(this.settings.review.styleGuideFile);
      if (file instanceof TFile) {
        try {
          const content = await this.app.vault.read(file);
          parts.push(content);
        } catch (error) {
          console.error("[Hugo Review] Failed to read style guide file:", error);
        }
      }
    }

    // Add inline guidelines
    if (this.settings.review.styleGuideInline) {
      parts.push(this.settings.review.styleGuideInline);
    }

    return parts.join("\n\n");
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

    details.createEl("p", { text: "Made in 🇨🇦", cls: "about-made-in" });
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

    containerEl.createEl("h2", { text: "Hugo Command Settings" });

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

    // Sidebar section (first)
    containerEl.createEl("h3", { text: "Sidebar" });

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
      .setName("Default status filter")
      .setDesc("Which posts to show by default when opening the sidebar")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("all", "All")
          .addOption("published", "Published")
          .addOption("draft", "Drafts")
          .setValue(this.plugin.settings.defaultStatusFilter)
          .onChange(async (value) => {
            this.plugin.settings.defaultStatusFilter = value as StatusFilter;
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

    // Content section
    containerEl.createEl("h3", { text: "Content" });

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
      .setName("Trash folder")
      .setDesc("Folder for trashed posts (relative to vault root)")
      .addText((text) =>
        text
          .setPlaceholder("_trash")
          .setValue(this.plugin.settings.trashFolder)
          .onChange(async (value) => {
            this.plugin.settings.trashFolder = value.trim() || "_trash";
            await this.plugin.saveSettings();
          })
      );

    // Review section
    containerEl.createEl("h3", { text: "Content Review" });

    new Setting(containerEl)
      .setName("Enable content review")
      .setDesc("Use an LLM to review posts against a checklist of criteria")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.review.enabled)
          .onChange(async (value) => {
            this.plugin.settings.review.enabled = value;
            await this.plugin.saveSettings();
            this.display(); // Refresh to show/hide provider settings
          })
      );

    if (this.plugin.settings.review.enabled) {
      new Setting(containerEl)
        .setName("LLM provider")
        .setDesc("Which LLM service to use for reviews")
        .addDropdown((dropdown) =>
          dropdown
            .addOption("ollama", "Ollama (local)")
            .addOption("openai", "OpenAI")
            .addOption("gemini", "Google Gemini")
            .addOption("anthropic", "Anthropic Claude")
            .setValue(this.plugin.settings.review.provider)
            .onChange(async (value) => {
              this.plugin.settings.review.provider = value as any;
              await this.plugin.saveSettings();
              this.display(); // Refresh to show provider-specific settings
            })
        );

      // Provider-specific settings
      const provider = this.plugin.settings.review.provider;

      if (provider === "ollama") {
        new Setting(containerEl)
          .setName("Ollama endpoint")
          .setDesc("URL of your Ollama server")
          .addText((text) =>
            text
              .setPlaceholder("http://localhost:11434")
              .setValue(this.plugin.settings.review.ollamaEndpoint)
              .onChange(async (value) => {
                this.plugin.settings.review.ollamaEndpoint = value.trim() || "http://localhost:11434";
                await this.plugin.saveSettings();
              })
          );

        new Setting(containerEl)
          .setName("Ollama model")
          .setDesc("Model to use (e.g., llama3.2, mistral)")
          .addText((text) =>
            text
              .setPlaceholder("llama3.2")
              .setValue(this.plugin.settings.review.ollamaModel)
              .onChange(async (value) => {
                this.plugin.settings.review.ollamaModel = value.trim() || "llama3.2";
                await this.plugin.saveSettings();
              })
          );
      } else if (provider === "openai") {
        new Setting(containerEl)
          .setName("OpenAI API key")
          .setDesc("Your OpenAI API key")
          .addText((text) =>
            text
              .setPlaceholder("sk-...")
              .setValue(this.plugin.settings.review.openaiApiKey)
              .onChange(async (value) => {
                this.plugin.settings.review.openaiApiKey = value.trim();
                await this.plugin.saveSettings();
              })
          );

        new Setting(containerEl)
          .setName("OpenAI model")
          .setDesc("Model to use (e.g., gpt-4o-mini, gpt-4o)")
          .addText((text) =>
            text
              .setPlaceholder("gpt-4o-mini")
              .setValue(this.plugin.settings.review.openaiModel)
              .onChange(async (value) => {
                this.plugin.settings.review.openaiModel = value.trim() || "gpt-4o-mini";
                await this.plugin.saveSettings();
              })
          );
      } else if (provider === "gemini") {
        new Setting(containerEl)
          .setName("Gemini API key")
          .setDesc("Your Google AI Studio API key")
          .addText((text) =>
            text
              .setPlaceholder("AI...")
              .setValue(this.plugin.settings.review.geminiApiKey)
              .onChange(async (value) => {
                this.plugin.settings.review.geminiApiKey = value.trim();
                await this.plugin.saveSettings();
              })
          );

        new Setting(containerEl)
          .setName("Gemini model")
          .setDesc("Model to use (e.g., gemini-1.5-flash, gemini-1.5-pro)")
          .addText((text) =>
            text
              .setPlaceholder("gemini-1.5-flash")
              .setValue(this.plugin.settings.review.geminiModel)
              .onChange(async (value) => {
                this.plugin.settings.review.geminiModel = value.trim() || "gemini-1.5-flash";
                await this.plugin.saveSettings();
              })
          );
      } else if (provider === "anthropic") {
        new Setting(containerEl)
          .setName("Anthropic API key")
          .setDesc("Your Anthropic API key")
          .addText((text) =>
            text
              .setPlaceholder("sk-ant-...")
              .setValue(this.plugin.settings.review.anthropicApiKey)
              .onChange(async (value) => {
                this.plugin.settings.review.anthropicApiKey = value.trim();
                await this.plugin.saveSettings();
              })
          );

        new Setting(containerEl)
          .setName("Anthropic model")
          .setDesc("Model to use (e.g., claude-3-haiku-20240307)")
          .addText((text) =>
            text
              .setPlaceholder("claude-3-haiku-20240307")
              .setValue(this.plugin.settings.review.anthropicModel)
              .onChange(async (value) => {
                this.plugin.settings.review.anthropicModel = value.trim() || "claude-3-haiku-20240307";
                await this.plugin.saveSettings();
              })
          );
      }

      // Review criteria
      new Setting(containerEl)
        .setName("Review criteria")
        .setDesc("Checklist items to evaluate (one per line)")
        .addTextArea((text) =>
          text
            .setPlaceholder("Has a clear title\nIncludes an introduction\nHas a conclusion")
            .setValue(this.plugin.settings.review.criteria)
            .onChange(async (value) => {
              this.plugin.settings.review.criteria = value;
              await this.plugin.saveSettings();
            })
        );

      // Style guide
      new Setting(containerEl)
        .setName("Style guide file")
        .setDesc("Path to a markdown file containing style guidelines (optional)")
        .addText((text) =>
          text
            .setPlaceholder("Resources/Style Guide.md")
            .setValue(this.plugin.settings.review.styleGuideFile)
            .onChange(async (value) => {
              this.plugin.settings.review.styleGuideFile = value.trim();
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName("Inline style guidelines")
        .setDesc("Additional style guidelines (combined with file if both specified)")
        .addTextArea((text) =>
          text
            .setPlaceholder("Write in active voice. Keep paragraphs short.")
            .setValue(this.plugin.settings.review.styleGuideInline)
            .onChange(async (value) => {
              this.plugin.settings.review.styleGuideInline = value;
              await this.plugin.saveSettings();
            })
        );

      // Clear cache button
      new Setting(containerEl)
        .setName("Clear review cache")
        .setDesc("Remove all cached review results")
        .addButton((button) =>
          button
            .setButtonText("Clear Cache")
            .onClick(async () => {
              this.plugin.reviewCache.clearAll();
              showNotice("Review cache cleared");
            })
        );
    }

    // Outline Enhancement section
    containerEl.createEl("h3", { text: "Outline Enhancement" });

    new Setting(containerEl)
      .setName("Enable outline enhancement")
      .setDesc("Use an LLM to add questions and suggestions to document outlines (uses same LLM settings as Content Review)")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.outline.enabled)
          .onChange(async (value) => {
            this.plugin.settings.outline.enabled = value;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    if (this.plugin.settings.outline.enabled) {
      new Setting(containerEl)
        .setName("Enhancement prompt")
        .setDesc("Instructions for the LLM when enhancing outlines")
        .addTextArea((text) =>
          text
            .setPlaceholder("Analyze this outline and add questions...")
            .setValue(this.plugin.settings.outline.prompt)
            .onChange(async (value) => {
              this.plugin.settings.outline.prompt = value;
              await this.plugin.saveSettings();
            })
        );
    }
  }
}
